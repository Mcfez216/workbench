'use strict';
// CMake and CTest, the way the vault uses them: the build directory is
// build/ next to the top CMakeLists.txt (the same one Neovim's :CMakeBuild
// and the notes' `cmake -S . -B build` use), Debug by default, so the
// sanitizers are on.
//
// What's in the project comes from CMake's own File API (a query file in
// build/.cmake/api/v1/query asks CMake to write a description of every
// target when it configures), so nothing here guesses at CMakeLists.txt.

const fs = require('fs');
const path = require('path');
const config = require('./config');
const pty = require('./pty');
const { execStream, runProgram, buildSingle, debugSingle, valgrindSingle, which, hint, SOURCE_EXT } = require('./build');
const { catchSummary, ctestLine } = require('./parse');

let api;

// ------------------------------------------------------------------ where things are
// The project root is the top of the chain of folders that each have a
// CMakeLists.txt. A file inside a build tree (a fetched dependency, say)
// belongs to the project that build tree is for.
function cmakeRoot(start) {
  if (!start) return null;
  let d = start;
  try { if (!fs.statSync(d).isDirectory()) d = path.dirname(d); } catch (e) { d = path.dirname(d); }
  let found = null;
  for (let cur = d; ; cur = path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'CMakeCache.txt'))) {
      const home = cacheValue(cur, 'CMAKE_HOME_DIRECTORY');
      if (home && fs.existsSync(path.join(home, 'CMakeLists.txt'))) return home;
    }
    if (fs.existsSync(path.join(cur, 'CMakeLists.txt'))) found = cur;
    else if (found) return found;
    if (path.dirname(cur) === cur) return found;
  }
}
function buildDir(root) { return path.join(root, 'build'); }

function cacheValue(build, key) {
  try {
    const m = fs.readFileSync(path.join(build, 'CMakeCache.txt'), 'utf8').match(new RegExp(`^${key}:[A-Z]+=(.*)$`, 'm'));
    return m ? m[1] : null;
  } catch (e) { return null; }
}
function isConfigured(root) { return fs.existsSync(path.join(buildDir(root), 'CMakeCache.txt')); }

function ensureQuery(build) {
  const q = path.join(build, '.cmake', 'api', 'v1', 'query');
  fs.mkdirSync(q, { recursive: true });
  const f = path.join(q, 'codemodel-v2');
  if (!fs.existsSync(f)) fs.writeFileSync(f, '');
}

// ------------------------------------------------------------------ configure
async function configure({ root, fresh = false }) {
  if (!root) throw new Error('No CMakeLists.txt here');
  const cfg = config.get();
  const build = buildDir(root);
  ensureQuery(build);
  const args = ['-S', root, '-B', build, `-DCMAKE_BUILD_TYPE=${cfg.build.buildType || 'Debug'}`, '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', ...(fresh ? ['--fresh'] : [])];
  const r = await execStream({ cmd: 'cmake', args, cwd: root, title: fresh ? 'CMake: fresh configure' : 'CMake: configure', source: 'cmake' });
  model.delete(root);
  if (r.code === 0) api.broadcast('cmake.changed', { root });
  return { kind: 'configure', root, ...r, output: undefined };
}

// Configure first if it never was, or if the build type in Settings
// changed since (Debug has the sanitizers; Release doesn't).
async function ensureConfigured(root) {
  const want = config.get().build.buildType || 'Debug';
  if (!isConfigured(root) || cacheValue(buildDir(root), 'CMAKE_BUILD_TYPE') !== want || !replyIndex(root)) {
    const r = await configure({ root });
    if (r.code !== 0) return r;
  }
  return null;
}

// ------------------------------------------------------------------ the File API reply
const model = new Map();     // root -> {index, targets}
function replyIndex(root) {
  const dir = path.join(buildDir(root), '.cmake', 'api', 'v1', 'reply');
  try {
    const f = fs.readdirSync(dir).filter((n) => /^index-.*\.json$/.test(n)).sort().pop();
    return f ? path.join(dir, f) : null;
  } catch (e) { return null; }
}

function classify(t) {
  if (t.type !== 'executable') return 'library';
  if (/_stub_tests$/.test(t.name)) return 'stub';
  if (/_solution_tests$/.test(t.name)) return 'solution';
  if (/_tests?$/.test(t.name) || /(^|\/)tests?$/.test(t.dirRel)) return 'tests';
  if (/(^|\/)examples?$/.test(t.dirRel)) return 'example';
  if (/(^|\/)cp$/.test(t.dirRel)) return 'cp';
  return 'program';
}

function readModel(root) {
  const idx = replyIndex(root);
  if (!idx) return null;
  const stamp = fs.statSync(idx).mtimeMs + idx;
  const cached = model.get(root);
  if (cached && cached.stamp === stamp) return cached;
  const dir = path.dirname(idx);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const index = read(path.basename(idx));
  const cm = (index.objects || []).find((o) => o.kind === 'codemodel');
  if (!cm) return null;
  const code = read(cm.jsonFile);
  const src = code.paths.source, bld = code.paths.build;
  const conf = code.configurations[0] || { targets: [] };
  const targets = [];
  for (const ref of conf.targets) {
    let t;
    try { t = read(ref.jsonFile); } catch (e) { continue; }
    if (!['EXECUTABLE', 'STATIC_LIBRARY', 'SHARED_LIBRARY'].includes(t.type)) continue;
    const tdir = path.resolve(src, t.paths.source);
    if (tdir === bld || tdir.startsWith(bld + path.sep)) continue;           // fetched dependencies (Catch2)
    const sources = (t.sources || []).filter((s) => !s.isGenerated).map((s) => path.resolve(src, s.path));
    const artifact = t.artifacts && t.artifacts[0] ? path.resolve(bld, t.artifacts[0].path) : null;
    const entry = { name: t.name, type: t.type === 'EXECUTABLE' ? 'executable' : 'library', dir: tdir, dirRel: path.relative(src, tdir), sources, artifact };
    entry.kind = classify(entry);
    targets.push(entry);
  }
  targets.sort((a, b) => a.dirRel.localeCompare(b.dirRel) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const m = { stamp, root, build: bld, targets };
  model.set(root, m);
  return m;
}

async function targets({ root, file }) {
  root = root || cmakeRoot(file);
  if (!root) return { root: null, configured: false, targets: [] };
  if (!isConfigured(root)) return { root, configured: false, targets: [] };
  if (!replyIndex(root)) { const r = await configure({ root }); if (r.code !== 0) return { root, configured: false, targets: [], error: 'CMake configure failed' }; }
  const m = readModel(root);
  return { root, configured: true, build: buildDir(root), buildType: cacheValue(buildDir(root), 'CMAKE_BUILD_TYPE'), targets: m ? m.targets : [] };
}

// The program a file belongs to: a target that compiles it, or one that
// compiles something in the same folder (a header-only project). The
// target living closest to the file wins, so a project's shared test file
// picks the stub you're working on, not the solution.
function targetFor(m, file) {
  const exes = m.targets.filter((t) => t.type === 'executable');
  let c = exes.filter((t) => t.sources.includes(file));
  if (!c.length) c = exes.filter((t) => t.sources.some((s) => path.dirname(s) === path.dirname(file)));
  if (!c.length) return null;
  const score = (t) => (file.startsWith(t.dir + path.sep) ? t.dir.length : 0);
  return c.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

// ------------------------------------------------------------------ build
// F9: CMake when the file (or the workspace) is in a CMake project,
// otherwise the one file with g++.
async function build({ file, dir, target, root }) {
  root = root || cmakeRoot(file || dir);
  if (!root) return buildSingle({ file });
  const pre = await ensureConfigured(root);
  if (pre) return pre;
  const cfg = config.get();
  const args = ['--build', buildDir(root), '-j', String(cfg.build.jobs || 4), ...(target ? ['--target', target] : [])];
  const r = await execStream({ cmd: 'cmake', args, cwd: buildDir(root), title: target ? `build ${target}` : 'build all' });
  if (r.code === 0) api.broadcast('cmake.changed', { root });
  return { kind: 'cmake', root, target: target || null, ...r, output: undefined };
}

function q(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

async function resolveTarget({ file, root, target }) {
  root = root || cmakeRoot(file);
  if (!root) return { root: null };
  const pre = await ensureConfigured(root);
  if (pre) return { root, failed: pre };
  const m = readModel(root);
  const exes = m ? m.targets.filter((t) => t.type === 'executable') : [];
  const t = target ? exes.find((x) => x.name === target) : (file ? targetFor(m, file) : null);
  return { root, target: t || null, choices: exes.map((x) => ({ name: x.name, kind: x.kind, dirRel: x.dirRel })) };
}

// Ctrl+F9: build the program this file is part of, then run it in a
// terminal (it can read std::cin there) from the project folder.
async function run({ file, root, target, args = '', tool }) {
  const rt = await resolveTarget({ file, root, target });
  if (!rt.root) {
    if (!file || !SOURCE_EXT.test(file)) throw new Error('Open a .c or .cpp file (or a file in a CMake project) first');
    if (tool === 'valgrind') return valgrindSingle({ file, args });
    const r = await buildSingle({ file });
    if (r.code !== 0) return { ok: false, ...r, output: undefined };
    const term = runProgram({ cwd: path.dirname(file), command: `./${q(path.basename(r.exe))} ${args}`.trim(), title: `run: ${path.basename(r.exe)}` });
    return { ok: true, ...r, terminal: term, target: path.basename(r.exe) };
  }
  if (rt.failed) return { ok: false, ...rt.failed };
  if (!rt.target) return { ok: false, needTarget: true, root: rt.root, choices: rt.choices };
  if (tool === 'valgrind') {
    if (!which('valgrind')) throw new Error(`Valgrind is not installed (${hint('valgrind')})`);
    if (/-fsanitize/.test(cacheValue(buildDir(rt.root), 'CMAKE_CXX_FLAGS') || '') || (config.get().build.buildType || 'Debug') === 'Debug') {
      throw new Error('Valgrind and AddressSanitizer can\'t share a program, and Debug builds have ASan on. Use Settings → CMake build type: RelWithDebInfo for Valgrind, or run a single file / the sandbox under Valgrind.');
    }
  }
  const r = await build({ root: rt.root, target: rt.target.name });
  if (r.code !== 0) return { ok: false, ...r };
  const vg = tool === 'valgrind' ? 'valgrind --leak-check=full --track-origins=yes --error-exitcode=99 ' : '';
  const term = runProgram({ cwd: rt.root, command: `${vg}${q(rt.target.artifact)} ${args}`.trim(), title: `${vg ? 'valgrind' : 'run'}: ${rt.target.name}` });
  return { ok: true, ...r, target: rt.target.name, terminal: term };
}

// gdb on the program, stopped at the line you're on (or at main).
// LeakSanitizer can't work under a debugger, so it's turned off there
// (note 4.03: the ASan-under-gdb conflict); ASan itself stays on.
async function debug({ file, line, root, target, args = '' }) {
  const rt = await resolveTarget({ file, root, target });
  if (!rt.root) {
    if (file && SOURCE_EXT.test(file)) return debugSingle({ file, line, args });
    throw new Error('Open a .c or .cpp file, or a file in a CMake project, to debug');
  }
  if (rt.failed) return { ok: false, ...rt.failed };
  if (!rt.target) return { ok: false, needTarget: true, root: rt.root, choices: rt.choices };
  const r = await build({ root: rt.root, target: rt.target.name });
  if (r.code !== 0) return { ok: false, ...r };
  const stop = file && line && /\.(cpp|cc|cxx|c|hpp|hh|h|ipp)$/.test(file) ? `break ${file}:${line}` : 'break main';
  const argv = ['gdb', '-q', '-ex', 'set pagination off', '-ex', stop, '-ex', 'run', '--args', rt.target.artifact, ...String(args).split(/\s+/).filter(Boolean)];
  const term = pty.open({ cwd: rt.root, title: `gdb: ${rt.target.name}`, argv, env: { ASAN_OPTIONS: 'detect_leaks=0' } });
  return { ok: true, ...r, target: rt.target.name, terminal: term, breakpoint: stop.slice(6) };
}

// ------------------------------------------------------------------ CTest
async function ctestList({ root, file }) {
  root = root || cmakeRoot(file);
  if (!root || !isConfigured(root)) return { root, tests: [], configured: false };
  const r = await execStream({ cmd: 'ctest', args: ['--test-dir', buildDir(root), '--show-only=json-v1'], cwd: root, title: 'ctest list', quiet: true });
  let info;
  try { info = JSON.parse(r.output.slice(r.output.indexOf('{'))); } catch (e) { return { root, tests: [], configured: true, error: r.output.trim().slice(0, 400) }; }
  const m = readModel(root);
  const byArtifact = new Map((m ? m.targets : []).filter((t) => t.artifact).map((t) => [t.artifact, t.name]));
  const tests = (info.tests || []).map((t, i) => {
    const exe = t.command && t.command[0] ? path.resolve(buildDir(root), t.command[0]) : null;
    // no command: CMake couldn't find the test's program, because it isn't built
    return { index: i + 1, name: t.name, target: (exe && byArtifact.get(exe)) || null, notBuilt: /_NOT_BUILT$/.test(t.name) || !exe || !fs.existsSync(exe) };
  });
  return { root, configured: true, tests };
}

// Runs every test, or the ones picked by number (index in ctestList),
// telling the window about each result as it lands.
async function ctestRun({ root, file, indexes, buildFirst = true }) {
  root = root || cmakeRoot(file);
  if (!root) throw new Error('No CMake project here');
  if (buildFirst) {
    const b = await build({ root });
    if (b.code !== 0) return { ok: false, ...b, results: [] };
  }
  const cfg = config.get();
  const results = [];
  const args = ['--test-dir', buildDir(root), '--output-on-failure', '--timeout', '60', '-j', String(cfg.build.jobs || 4)];
  if (indexes && indexes.length) args.push('-I', `0,0,0,${indexes.map(Number).join(',')}`);
  api.broadcast('ctest.start', { root, indexes: indexes || null });
  const r = await execStream({
    cmd: 'ctest', args, cwd: buildDir(root), title: indexes && indexes.length === 1 ? 'ctest: one test' : 'ctest',
    onLine: (line) => { const res = ctestLine(line); if (res) { results.push(res); api.broadcast('ctest.result', { root, ...res }); } },
  });
  const summary = (r.output.match(/(\d+)% tests passed, (\d+) tests? failed out of (\d+)/) || []);
  const out = { ok: r.code === 0, root, ...r, output: undefined, results,
    summary: summary.length ? { percent: +summary[1], failed: +summary[2], total: +summary[3] } : null };
  api.broadcast('ctest.done', { root, ok: out.ok, summary: out.summary, count: results.length });
  return out;
}

// The TEST_CASE (or SECTION-less SCENARIO) a test came from
async function ctestLocate({ root, name, target }) {
  const m = readModel(root);
  if (!m) return null;
  const want = name.replace(/^Scenario: /, '');
  const lit = JSON.stringify(want);
  const ts = m.targets.filter((t) => !target || t.name === target);
  for (const t of ts) {
    for (const s of t.sources) {
      let text;
      try { text = fs.readFileSync(s, 'utf8'); } catch (e) { continue; }
      const i = text.indexOf(lit);
      if (i >= 0) return { file: s, line: text.slice(0, i).split('\n').length };
    }
  }
  return null;
}

// ------------------------------------------------------------------ projects (P01..P05)
// Each project is a stub you finish (its tests fail until you do, which is
// why they aren't in ctest) and a reference solution built against the
// same tests.
function projectsFrom(m) {
  const byId = new Map();
  for (const t of m.targets) {
    const mm = t.name.match(/^(.*)_(stub|solution)_tests$/);
    if (!mm) continue;
    const p = byId.get(mm[1]) || { id: mm[1], label: mm[1].replace(/^p(\d+)_/, (x, n) => `P${n} `).replace(/_/g, ' ') };
    p[mm[2]] = t.name;
    const isTest = (s) => /(^|\/)test_[^/]*$/.test(s) || /Test\.cpp$/.test(s);
    let files = t.sources.filter((s) => !isTest(s) && file2dir(s).startsWith(t.dir));
    if (!files.length) {
      const d = path.dirname(t.sources[0] || '');
      try { files = fs.readdirSync(d).filter((n) => /\.(hpp|h|hh)$/.test(n)).map((n) => path.join(d, n)); } catch (e) { files = []; }
      if (mm[2] === 'solution') files = files.map((f) => f.replace(`${path.sep}projects${path.sep}`, `${path.sep}solutions${path.sep}`)).filter((f) => fs.existsSync(f));
    }
    p[`${mm[2]}Files`] = files;
    if (mm[2] === 'stub') { p.tests = t.sources.filter(isTest); p.artifact = t.artifact; }
    byId.set(mm[1], p);
  }
  return [...byId.values()].filter((p) => p.stub).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
function file2dir(f) { return path.dirname(f); }

async function projectsList({ root, file }) {
  const t = await targets({ root, file });
  if (!t.configured) return { root: t.root, configured: false, projects: [] };
  return { root: t.root, configured: true, projects: projectsFrom(readModel(t.root)) };
}

// Build a project's stub and run its tests: how far along you are.
function catchSpec(name) { return name.replace(/[\\,[\]*]/g, (c) => '\\' + c); }

async function projectRun({ root, id, testName }) {
  const m = readModel(root) || (await targets({ root }), readModel(root));
  const p = m && projectsFrom(m).find((x) => x.id === id);
  if (!p) throw new Error(`No project ${id}`);
  const b = await build({ root, target: p.stub });
  if (b.code !== 0) return { ok: false, built: false, ...b };
  const r = await execStream({ cmd: p.artifact, args: testName ? [catchSpec(testName)] : [], cwd: root, title: testName ? `${p.label}: "${testName}"` : `${p.label}: tests`, source: 'test', timeoutMs: 30000 });
  const summary = catchSummary(r.output);
  const result = { ok: r.code === 0, built: true, id, code: r.code, problems: r.problems, summary, testName: testName || null, at: Date.now() };
  if (!testName) api.broadcast('projects.result', result);
  return result;
}

function init(a) {
  api = a;
  a.register('cmake.root', ({ file, dir }) => {
    const root = cmakeRoot(file || dir);
    return { root, build: root ? buildDir(root) : null, configured: root ? isConfigured(root) : false };
  });
  a.register('cmake.configure', ({ root, file, fresh }) => configure({ root: root || cmakeRoot(file), fresh }));
  a.register('cmake.targets', targets);
  a.register('cmake.build', build);
  a.register('cmake.run', run);
  a.register('cmake.debug', debug);
  a.register('ctest.list', ctestList);
  a.register('ctest.run', ctestRun);
  a.register('ctest.locate', ctestLocate);
  a.register('projects.list', projectsList);
  a.register('projects.run', projectRun);
  // F9 from anywhere
  a.register('build.build', build);
}

module.exports = { init, cmakeRoot, buildDir, readModel, targetFor, filterProjects: projectsFrom };
