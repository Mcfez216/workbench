'use strict';
// Rust: a lone .rs file (rustc), or a Cargo project (the nearest folder
// with a Cargo.toml). The same keys as C and C++ do the same things:
//
//   F9        build            rustc file.rs / cargo build
//   Ctrl+F9   build and run    in a terminal, so the program can read input
//   F7        tests            cargo test (or rustc --test for a lone file)
//   Ctrl+Shift+D  debug        rust-gdb (gdb with Rust's pretty printers)
//   Ctrl+Shift+K  analyse      clippy (cargo clippy / clippy-driver)
//   Ctrl+Shift+O  format       rustfmt
//
// A debug build is Rust's own checking mode: integer overflow and every
// array index are checked, and a mistake stops the program with a "panic"
// that names the line. The Problems list picks those up like a sanitizer
// report (see parse.js).

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const platform = require('./platform');
const pty = require('./pty');

let api;
const RS = /\.rs$/i;
const EDITIONS = ['2018', '2021', '2024'];
const OPTS = { '-O0': '0', '-O1': '1', '-O2': '2', '-O3': '3', '-Os': 's' };

// rustup puts everything in ~/.cargo/bin, which a desktop launcher's PATH
// usually lacks: add it, once
function setupPath() {
  const dirs = [process.env.CARGO_HOME && path.join(process.env.CARGO_HOME, 'bin'), path.join(os.homedir(), '.cargo', 'bin'),
    platform.WIN ? path.join(platform.toolsDir(), 'cargo', 'bin') : null].filter(Boolean);
  const sep = platform.WIN ? ';' : ':';
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const now = (process.env[key] || '').split(sep);
  const add = dirs.filter((d) => fs.existsSync(d) && !now.includes(d));
  if (add.length) process.env[key] = [...add, ...now].join(sep);
}

function b() { return require('./build'); }
function edition() { const e = String(config.get().build.rustEdition || '2024'); return EDITIONS.includes(e) ? e : '2024'; }
function hint(tool) { return require('./distro').installHint(tool); }
function need(tool) {
  if (!platform.which(tool)) throw new Error(`${tool} isn't installed (${hint(tool)})`);
}
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// ------------------------------------------------------------------ where am I
// The Cargo project a file (or folder) belongs to: the nearest Cargo.toml
// above it. A workspace's member wins over the workspace itself.
function cargoRoot(fileOrDir) {
  if (!fileOrDir) return null;
  let d;
  try { d = fs.statSync(fileOrDir).isDirectory() ? fileOrDir : path.dirname(fileOrDir); } catch (e) { d = path.dirname(fileOrDir); }
  const stop = path.parse(d).root;
  for (let cur = path.resolve(d); ; cur = path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'Cargo.toml'))) return cur;
    if (cur === stop || cur === os.homedir()) return null;
  }
}
// Is this a Rust thing at all? { kind: 'cargo', root } | { kind: 'file', file } | null
function context({ file, dir } = {}) {
  const root = cargoRoot(file || dir);
  if (root && (!file || RS.test(file) || /Cargo\.toml$/.test(file))) return { kind: 'cargo', root };
  if (file && RS.test(file)) return { kind: 'file', file };
  return null;
}

// ------------------------------------------------------------------ one file
function singleArgs(file, { release = false, test = false, out } = {}) {
  const exe = out || platform.exe(file.replace(/\.rs$/i, '') + (test ? '-tests' : '') + (release ? '-release' : ''));
  const args = ['--edition', edition(), '--color=never', '-g', ...(release ? ['-O'] : []), ...(test ? ['--test'] : []), '-o', exe, file];
  return { exe, args };
}
async function buildFile({ file, release, test }) {
  need('rustc');
  const { exe, args } = singleArgs(file, { release, test });
  const r = await b().execStream({ cmd: 'rustc', args, cwd: path.dirname(file), title: `rustc ${path.basename(file)}`, source: 'rustc' });
  return { ...r, kind: 'single', lang: 'rust', exe, output: undefined };
}

// ------------------------------------------------------------------ Cargo
function cargo(root, args, extra = {}) {
  need('cargo');
  return b().execStream({ cmd: 'cargo', args: [...args, '--color=never'], cwd: root, title: `cargo ${args.join(' ')}`, source: 'cargo', ...extra });
}
// The binaries a project makes, from cargo metadata (cached until Cargo.toml changes)
const metaCache = new Map();
function metadata(root) {
  const toml = path.join(root, 'Cargo.toml');
  let st;
  try { st = fs.statSync(toml).mtimeMs; } catch (e) { return null; }
  const hit = metaCache.get(root);
  if (hit && hit.st === st) return Promise.resolve(hit.data);
  return new Promise((resolve) => {
    execFile('cargo', ['metadata', '--no-deps', '--format-version', '1', '--offline'], { cwd: root, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      try {
        const m = JSON.parse(out);
        const data = { targetDir: m.target_directory, packages: m.packages.map((p) => ({ name: p.name, dir: path.dirname(p.manifest_path),
          bins: p.targets.filter((t) => t.kind.includes('bin')).map((t) => ({ name: t.name, src: t.src_path })),
          lib: p.targets.some((t) => t.kind.includes('lib')) })) };
        metaCache.set(root, { st, data });
        resolve(data);
      } catch (e) { resolve(null); }
    });
  });
}
// The binary to run for a file: the one built from it, else the package's only one
async function binFor(root, file) {
  const m = await metadata(root);
  if (!m) return { choices: [] };
  const all = m.packages.flatMap((p) => p.bins.map((x) => ({ ...x, pkg: p.name, dir: p.dir })));
  let hit = file ? all.find((x) => path.resolve(x.src) === path.resolve(file)) : null;
  if (!hit) {
    const mine = file ? all.filter((x) => path.resolve(file).startsWith(x.dir + path.sep)) : all;
    if (mine.length === 1) hit = mine[0];
    else if (!file && all.length === 1) hit = all[0];
  }
  return { bin: hit || null, targetDir: m.targetDir, choices: all.map((x) => ({ name: x.name, kind: 'program', dirRel: path.relative(root, x.dir) || '.' })) };
}

// ------------------------------------------------------------------ the keys
async function build({ file, dir, target, release }) {
  const ctx = context({ file, dir });
  if (!ctx) throw new Error('Not a Rust file or Cargo project');
  if (ctx.kind === 'file') return buildFile({ file, release });
  const r = await cargo(ctx.root, ['build', ...(release ? ['--release'] : []), ...(target ? ['--bin', target] : [])]);
  if (r.code === 0) api.broadcast('cmake.changed', { root: ctx.root });
  return { kind: 'cargo', root: ctx.root, target: target || null, ...r, output: undefined };
}

async function run({ file, dir, target, args = '', release }) {
  const ctx = context({ file, dir });
  if (!ctx) throw new Error('Not a Rust file or Cargo project');
  if (ctx.kind === 'file') {
    const r = await buildFile({ file, release });
    if (r.code !== 0) return { ok: false, ...r };
    const term = b().runProgram({ cwd: path.dirname(file), command: `./${q(path.basename(r.exe))} ${args}`.trim(), title: `run: ${path.basename(file)}`, env: { RUST_BACKTRACE: '0' } });
    return { ok: true, ...r, terminal: term, target: path.basename(file, '.rs') };
  }
  const pick = await binFor(ctx.root, file);
  const name = target || (pick.bin && pick.bin.name);
  if (!name) {
    if (!pick.choices.length) return { ok: false, root: ctx.root, code: 1, problems: [], message: 'This Cargo project has no program to run (it\'s a library: F7 runs its tests)' };
    return { ok: false, needTarget: true, root: ctx.root, choices: pick.choices };
  }
  const r = await cargo(ctx.root, ['build', ...(release ? ['--release'] : []), '--bin', name]);
  if (r.code !== 0) return { ok: false, root: ctx.root, ...r, output: undefined };
  const exe = platform.exe(path.join(pick.targetDir, release ? 'release' : 'debug', name));
  const term = b().runProgram({ cwd: ctx.root, command: `${q(exe)} ${args}`.trim(), title: `run: ${name}`, env: { RUST_BACKTRACE: '0' } });
  return { ok: true, root: ctx.root, ...r, output: undefined, target: name, terminal: term };
}

// rust-gdb: gdb with Rust's pretty printers, stopped at your line (or main)
async function debug({ file, line, target, args = '', prepare = false }) {
  const ctx = context({ file });
  if (!ctx) throw new Error('Not a Rust file or Cargo project');
  let exe, cwd, name;
  if (ctx.kind === 'file') {
    const r = await buildFile({ file });
    if (r.code !== 0) return { ok: false, ...r };
    exe = r.exe; cwd = path.dirname(file); name = path.basename(file, '.rs');
  } else {
    const pick = await binFor(ctx.root, file);
    name = target || (pick.bin && pick.bin.name);
    if (!name) return pick.choices.length ? { ok: false, needTarget: true, root: ctx.root, choices: pick.choices } : { ok: false, code: 1, problems: [] };
    const r = await cargo(ctx.root, ['build', '--bin', name]);
    if (r.code !== 0) return { ok: false, root: ctx.root, ...r, output: undefined };
    exe = platform.exe(path.join(pick.targetDir, 'debug', name)); cwd = ctx.root;
  }
  const gdb = platform.which('rust-gdb') ? 'rust-gdb' : platform.gdb();
  if (prepare) return { ok: true, exe, cwd, gdb, mainBreak: `${name.replace(/-/g, '_')}::main`, target: name, lang: 'rust', code: 0, problems: [] };
  // a Rust program's own main is <crate>::main; "break main" would stop in the runtime first
  const stop = file && line && RS.test(file) ? `break ${path.basename(file)}:${line}` : `break ${name.replace(/-/g, '_')}::main`;
  const argv = [gdb, '-q', '-ex', 'set pagination off', '-ex', stop, '-ex', 'run', '--args', exe, ...String(args).split(/\s+/).filter(Boolean)];
  const term = pty.open({ cwd, title: `rust-gdb: ${name}`, argv });
  return { ok: true, target: name, terminal: term, breakpoint: stop.slice(6), code: 0, problems: [] };
}

// ------------------------------------------------------------------ tests
// libtest's lines:   test tests::adds_two ... ok
//                    test tests::slow ... ignored
const TEST_LINE = /^test (\S+) \.\.\. (ok|FAILED|ignored)/;
async function testList({ root }) {
  const r = await cargo(root, ['test', '--no-run', '--quiet'], { quiet: true });
  if (r.code !== 0) return { root, configured: true, tests: [], problems: r.problems, error: 'It doesn\'t build yet: F9 shows why' };
  const l = await cargo(root, ['test', '--quiet', '--', '--list', '--format', 'terse'], { quiet: true });
  const names = [...new Set(l.output.split('\n').map((x) => x.match(/^(\S+): test$/)).filter(Boolean).map((m) => m[1]))];
  return { root, configured: true, tests: names.map((name, i) => ({ index: i + 1, name, target: null, notBuilt: false })), kind: 'cargo' };
}
async function testRun({ root, indexes }) {
  let filter = [];
  if (indexes && indexes.length) {
    const all = (await testList({ root })).tests;
    const want = all.filter((t) => indexes.map(Number).includes(t.index));
    if (want.length === 1) filter = [want[0].name, '--', '--exact'];
    else filter = ['--', ...want.map((t) => t.name), '--exact'];
  }
  const list = (await testList({ root })).tests;
  const indexOf = new Map(list.map((t) => [t.name, t.index]));
  const results = [];
  api.broadcast('ctest.start', { root, indexes: indexes || null });
  const started = Date.now();
  const r = await cargo(root, ['test', ...filter], {
    title: 'cargo test',
    onLine: (line) => {
      const m = line.match(TEST_LINE);
      if (!m) return;
      const res = { index: indexOf.get(m[1]) || results.length + 1, name: m[1], status: m[2] === 'ok' ? 'passed' : m[2] === 'ignored' ? 'notrun' : 'failed', detail: m[2], seconds: (Date.now() - started) / 1000 };
      results.push(res);
      api.broadcast('ctest.result', { root, ...res });
    },
  });
  const failed = results.filter((x) => x.status === 'failed').length;
  const summary = results.length ? { percent: Math.round(100 * (results.length - failed) / results.length), failed, total: results.length } : null;
  api.broadcast('ctest.done', { root, ok: r.code === 0, summary, count: results.length });
  return { ok: r.code === 0, root, ...r, output: undefined, results, summary };
}
// A test's function: "tests::adds_two" is fn adds_two in some .rs under the project
async function testLocate({ root, name }) {
  const fn = name.split('::').pop();
  const re = new RegExp(`^\\s*(?:pub\\s+)?(?:async\\s+)?fn\\s+${fn.replace(/[^\w]/g, '')}\\s*\\(`, 'm');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'target' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (RS.test(e.name)) files.push(p);
    }
  };
  try { walk(root); } catch (e) { return null; }
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(re);
    if (m) return { file: f, line: text.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0) };
  }
  return null;
}

// ------------------------------------------------------------------ projects (R01..R05)
// The Rust-Path vault's _code is a Cargo workspace: projects/<id> is yours
// (todo!() where the work goes, so its tests fail until you write it) and
// solutions/<id> is the finished one, run against the same tests. Plain
// `cargo test` runs the solutions only (default-members), like ctest runs the
// C++ ones; ▶ in the Tests sidebar runs yours.
const PROJECT_DIR = /^r\d+_[a-z0-9_]+$/;
function projectsHome(root) {
  if (!root) return null;
  let cur = path.resolve(root);
  for (let i = 0; i < 4; i++) {
    const toml = path.join(cur, 'Cargo.toml');
    if (fs.existsSync(path.join(cur, 'projects')) && fs.existsSync(toml) && /^\s*\[workspace\]/m.test(fs.readFileSync(toml, 'utf8'))) return cur;
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}
const rsIn = (d) => { try { return fs.readdirSync(d).filter((n) => RS.test(n)).sort((a, b) => (a === 'lib.rs' ? -1 : b === 'lib.rs' ? 1 : a.localeCompare(b))).map((n) => path.join(d, n)); } catch (e) { return []; } };
function projectsList({ root }) {
  const home = projectsHome(root);
  if (!home) return { root, configured: true, projects: [] };
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(home, 'projects'), { withFileTypes: true }).filter((e) => e.isDirectory() && PROJECT_DIR.test(e.name) && fs.existsSync(path.join(home, 'projects', e.name, 'Cargo.toml'))).map((e) => e.name); } catch (e) { /* none */ }
  const projects = dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((id) => {
    const mine = path.join(home, 'projects', id);
    return {
      id, kind: 'cargo', home,
      label: id.replace(/^r(\d+)_/, (x, n) => `R${n} `).replace(/_/g, ' '),
      stub: id,
      stubFiles: rsIn(path.join(mine, 'src')),
      tests: rsIn(path.join(mine, 'tests')),
      solutionFiles: rsIn(path.join(home, 'solutions', id, 'src')),
    };
  });
  return { root, home, configured: true, projects };
}
// libtest's summary lines, added up over every test program
function libtestSummary(output) {
  let passed = 0, failed = 0, seen = false;
  for (const m of String(output || '').matchAll(/^test result: \w+\. (\d+) passed; (\d+) failed/gm)) { passed += +m[1]; failed += +m[2]; seen = true; }
  return seen ? { passed, failed, total: passed + failed } : null;
}
async function projectRun({ root, id, testName }) {
  const home = projectsHome(root);
  const p = home && projectsList({ root: home }).projects.find((x) => x.id === id);
  if (!p) throw new Error(`No project ${id}`);
  const args = ['test', '-p', id, ...(testName ? ['--', testName, '--exact'] : [])];
  const r = await cargo(home, args, { title: testName ? `${p.label}: ${testName}` : `${p.label}: tests`, source: 'cargo', timeoutMs: 120000 });
  const summary = libtestSummary(r.output);
  // no summary at all and a non-zero exit: it didn't compile
  if (!summary && r.code !== 0) return { ok: false, built: false, id, code: r.code, problems: r.problems, summary: null };
  const result = { ok: r.code === 0, built: true, id, code: r.code, problems: r.problems, summary, testName: testName || null, at: Date.now() };
  if (!testName) api.broadcast('projects.result', result);
  return result;
}

// ------------------------------------------------------------------ clippy, rustfmt, explain
async function clippy({ file }) {
  const ctx = context({ file });
  if (!ctx) throw new Error('Not a Rust file or Cargo project');
  if (ctx.kind === 'cargo') {
    const r = await cargo(ctx.root, ['clippy', '--all-targets'], { title: 'clippy' });
    return { ...r, source: 'clippy', output: undefined };
  }
  need('clippy-driver');
  const out = path.join(os.tmpdir(), `mhde-clippy-${process.pid}`);
  const r = await b().execStream({ cmd: 'clippy-driver', args: ['--edition', edition(), '--color=never', '--emit=metadata', '-o', out, file], cwd: path.dirname(file), title: `clippy ${path.basename(file)}`, source: 'clippy' });
  fs.rm(out, { force: true }, () => {});
  return { ...r, source: 'clippy', output: undefined };
}

function format({ text }) {
  return new Promise((resolve, reject) => {
    const child = spawn('rustfmt', ['--edition', edition(), '--emit', 'stdout', '--quiet'], {});
    let out = '', err = '';
    child.stdout.on('data', (x) => { out += x; });
    child.stderr.on('data', (x) => { err += x; });
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `rustfmt isn't installed (${hint('rustfmt')})` : e.message)));
    child.on('close', (code) => (code === 0 ? resolve({ text: out }) : reject(new Error(err.trim().split('\n').slice(0, 6).join('\n') || `rustfmt exited with ${code}`))));
    child.stdin.end(text);
  });
}

// rustc's own long explanation of an error code (E0382...), as Markdown
function explain({ code }) {
  if (!/^E\d{4}$/.test(String(code))) return Promise.reject(new Error('Not a Rust error code'));
  return new Promise((resolve, reject) => {
    execFile('rustc', ['--explain', code], { maxBuffer: 1024 * 1024 }, (err, out) => {
      if (err) return reject(new Error(err.code === 'ENOENT' ? `rustc isn't installed (${hint('rustc')})` : `rustc doesn't know ${code}`));
      resolve({ code, text: out });
    });
  });
}

// ------------------------------------------------------------------ sandbox
function sandboxFile() { return path.join(b().sandboxDir(), 'scratch.rs'); }
async function sandboxRun({ source, std, tool }) {
  need('rustc');
  if (tool === 'valgrind') throw new Error('Valgrind is for C and C++. Rust checks memory while it compiles, and a debug build checks every index and overflow while it runs.');
  const file = sandboxFile();
  fs.writeFileSync(file, source);
  const ed = EDITIONS.includes(String(std)) ? String(std) : edition();
  const exe = path.join(path.dirname(file), platform.exe('scratch-rs'));
  const res = await b().execStream({ cmd: 'rustc', args: ['--edition', ed, '--color=never', '-g', '-o', exe, file], cwd: path.dirname(file), title: `sandbox: rustc --edition ${ed}`, source: 'rustc' });
  if (res.code !== 0) return { ok: false, ...res, file, lang: 'rust', output: undefined };
  const term = b().runProgram({ cwd: path.dirname(file), command: `./${path.basename(exe)}`, title: 'sandbox: scratch.rs', env: { RUST_BACKTRACE: '0' } });
  return { ok: true, ...res, file, lang: 'rust', output: undefined, terminal: term };
}
// The assembly, like the C++ sandbox's: Intel syntax, names demangled
async function sandboxAsm({ source, std, opt }) {
  need('rustc');
  const dir = b().sandboxDir();
  const file = path.join(dir, 'scratch-asm.rs');
  fs.writeFileSync(file, source);
  const ed = EDITIONS.includes(String(std)) ? String(std) : edition();
  const level = OPTS[opt] || '1';
  const out = path.join(dir, 'scratch-asm.s');
  const r = await b().execStream({ cmd: 'rustc', args: ['--edition', ed, '--color=never', '--crate-type', 'bin', '-C', `opt-level=${level}`, '-g', '-C', 'llvm-args=-x86-asm-syntax=intel', '--emit', `asm=${out}`, file],
    cwd: dir, title: `asm: rustc -C opt-level=${level}`, quiet: true });
  if (r.code !== 0) return { ok: false, problems: r.problems, text: r.output, lines: [] };
  let asm = fs.readFileSync(out, 'utf8');
  try { asm = require('child_process').execFileSync('c++filt', [], { input: asm, maxBuffer: 64 * 1024 * 1024 }).toString(); } catch (e) { /* mangled, then */ }
  asm = asm.replace(/::h[0-9a-f]{16}\b/g, '').replace(/\[[0-9a-f]{8,16}\]/g, '');
  // only your own functions: not the runtime's start-up code around main
  const lines = [];
  let mine = false;
  for (const l of b().filterAsm(asm, path.basename(file))) {
    if (l.label && !l.text.startsWith('.L')) {
      mine = /^scratch_asm::/.test(l.text) || /^<scratch_asm::/.test(l.text);
      if (mine) lines.push({ ...l, text: l.text.replace(/scratch_asm::/g, '') });
      continue;
    }
    if (mine) lines.push(l);
  }
  return { ok: true, problems: r.problems, lines, flags: `rustc --edition ${ed} -C opt-level=${level}` };
}

// ------------------------------------------------------------------ what's installed
function tools() {
  const out = {};
  for (const n of ['rustc', 'cargo', 'rust-analyzer', 'clippy-driver', 'rustfmt', 'rust-gdb']) out[n] = !!platform.which(n);
  return out;
}

function init(a) {
  api = a;
  setupPath();
  a.register('rust.context', ({ file, dir }) => context({ file, dir }));
  a.register('rust.explain', explain);
  a.register('rust.tools', tools);
  a.register('rust.testList', testList);
}

module.exports = { init, projectsList, projectRun, projectsHome, libtestSummary, context, cargoRoot, build, run, debug, testList, testRun, testLocate, clippy, format, explain, sandboxRun, sandboxAsm, sandboxFile, tools, RS, EDITIONS, metadata };
