'use strict';
// "Build a real thing" (track-data.js): a project folder per track and
// language in ~/mhde-builds/<track>-<lang>, built the way a real project is
// (CMakeLists.txt or Cargo.toml, so F9, Ctrl+F9 and the debugger work on
// it too), and checked a milestone at a time by running the program the way
// a person would. When it's done, "Install it" builds it optimised and puts
// it on your PATH: a tool of your own.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const platform = require('./platform');
const { same } = require('./cp');
const DATA = require('./track-data');

let api;
const byId = new Map(DATA.map((t) => [t.id, t]));
const LANGS = ['c', 'cpp', 'rust'];
const EXT = { c: 'c', cpp: 'cpp', rust: 'rs' };

// ------------------------------------------------------------------ progress
function progressFile() { return config.dataPath('tracks', 'progress.json'); }
function loadProgress() { try { return JSON.parse(fs.readFileSync(progressFile(), 'utf8')); } catch (e) { return {}; } }
function saveProgress(p) { fs.mkdirSync(path.dirname(progressFile()), { recursive: true }); fs.writeFileSync(progressFile(), JSON.stringify(p, null, 2)); }
const keyOf = (id, lang) => `${id}-${lang}`;

// ------------------------------------------------------------------ the project
function buildsDir() { return config.expand(config.get().buildsDir || '~/mhde-builds'); }
function dirOf(id, lang) { return path.join(buildsDir(), keyOf(id, lang)); }
function mainOf(id, lang) { return path.join(dirOf(id, lang), 'src', `main.${EXT[lang]}`); }
function trackFile(id, name) { return path.join(__dirname, 'tracks', id, name); }
function solutionText(id, lang) { try { return fs.readFileSync(trackFile(id, `solution.${EXT[lang]}`), 'utf8'); } catch (e) { return null; } }

function starter(t, lang) {
  const first = t.milestones[0];
  const head = `${t.title}\n\nMilestone 1: ${first.title}. The steps are in Learn → Build a real thing;\nF7 checks the milestone you're on.`;
  if (lang === 'c') return `/* ${head.replace(/\*\//g, '* /')} */\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main(int argc, char **argv)\n{\n    (void)argc;\n    (void)argv;\n    /* your code */\n    return 0;\n}\n`;
  if (lang === 'cpp') return `// ${head.split('\n').join('\n// ')}\n#include <iostream>\n#include <string>\n#include <vector>\n\nint main(int argc, char** argv)\n{\n    std::vector<std::string> args(argv + 1, argv + argc);\n    // your code\n    return 0;\n}\n`;
  return `// ${head.split('\n').join('\n// ')}\n\nfn main() {\n    let args: Vec<String> = std::env::args().skip(1).collect();\n    // your code\n    let _ = args;\n}\n`;
}
function projectFiles(t, lang) {
  const files = {};
  files[path.join('src', `main.${EXT[lang]}`)] = starter(t, lang);
  if (lang === 'rust') {
    files['Cargo.toml'] = `[package]\nname = "${t.name}"\nversion = "0.1.0"\nedition = "${config.get().build.rustEdition || '2024'}"\n\n[dependencies]\n`;
    files['.gitignore'] = 'target/\n';
  } else {
    const std = lang === 'c' ? (config.get().build.cStd || 'c17').replace(/^c/, '') : (config.get().build.std || 'c++20').replace(/^c\+\+/, '');
    files['CMakeLists.txt'] = `cmake_minimum_required(VERSION 3.20)\nproject(${t.name} ${lang === 'c' ? 'C' : 'CXX'})\n\nset(CMAKE_${lang === 'c' ? 'C' : 'CXX'}_STANDARD ${std.replace('2x', '23').replace('2c', '26')})\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\nif(NOT CMAKE_BUILD_TYPE)\n    set(CMAKE_BUILD_TYPE Debug)\nendif()\n\nfile(GLOB SOURCES CONFIGURE_DEPENDS src/*.${EXT[lang]})\nadd_executable(${t.name} \${SOURCES})\ntarget_compile_options(${t.name} PRIVATE -Wall -Wextra)\n`;
    files['.gitignore'] = 'build/\n.mhde/\n';
  }
  files['README.md'] = `# ${t.title}\n\n${t.blurb}\n\n## Milestones\n\n${t.milestones.map((m, i) => `${i + 1}. ${m.title}`).join('\n')}\n\nIn MHDE: Learn → Build a real thing → ${t.name}. F7 checks the milestone you're on.\n`;
  return files;
}

function list() {
  const p = loadProgress();
  return DATA.map((t) => ({
    id: t.id, name: t.name, title: t.title, blurb: t.blurb, skills: t.skills, milestones: t.milestones.length,
    langs: Object.fromEntries(LANGS.map((l) => [l, { reached: (p[keyOf(t.id, l)] || {}).reached || 0, started: fs.existsSync(dirOf(t.id, l)), installed: (p[keyOf(t.id, l)] || {}).installed || null }])),
  }));
}

function get({ id, lang }) {
  const t = byId.get(id);
  if (!t) throw new Error(`No track ${id}`);
  const p = loadProgress()[keyOf(id, lang)] || {};
  return {
    id, lang, name: t.name, title: t.title, blurb: t.blurb, skills: t.skills,
    dir: dirOf(id, lang), main: mainOf(id, lang), started: fs.existsSync(dirOf(id, lang)), reached: p.reached || 0, installed: p.installed || null,
    milestones: t.milestones.map((m) => ({
      title: m.title, brief: m.brief,
      hints: [...((m.hints || {})[lang] || []), ...((m.hints || {}).all || [])],
      tests: m.tests.map((x) => ({ name: x.name, commands: x.run.map((r) => command(t.name, r)) })),
    })),
    hasSolution: !!solutionText(id, lang),
  };
}

// Start (or reopen) a project: files that are already there are never replaced
function open({ id, lang }) {
  const t = byId.get(id);
  if (!t || !LANGS.includes(lang)) throw new Error('Pick a track and a language');
  const dir = dirOf(id, lang);
  for (const [rel, text] of Object.entries(projectFiles(t, lang))) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return { dir, main: mainOf(id, lang) };
}

// ------------------------------------------------------------------ building
function run(cmd, args, { cwd, input, env, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    let out = Buffer.alloc(0), err = Buffer.alloc(0), killed = false, child;
    try { child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) } }); }
    catch (e) { resolve({ code: 127, out: '', err: e.message }); return; }
    const cap = (a, b) => (a.length < 8 * 1024 * 1024 ? Buffer.concat([a, b]) : a);
    child.stdout.on('data', (b) => { out = cap(out, b); });
    child.stderr.on('data', (b) => { err = cap(err, b); });
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, out: '', err: e.message }); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code: killed ? 'timeout' : code === null ? signal : code, out: out.toString('utf8'), err: err.toString('utf8') }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

const SAN = () => platform.sanitizerFlags(['-g', '-O0', '-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer'], { cc: config.get().build.compiler });
async function build({ id, lang, release = false, dir, quiet = false }) {
  const t = byId.get(id);
  dir = dir || dirOf(id, lang);
  const b = require('./build');
  if (lang === 'rust') {
    const r = await b.execStream({ cmd: 'cargo', args: ['build', ...(release ? ['--release'] : []), '--color=never'], cwd: dir, title: `${t.name}: cargo build${release ? ' --release' : ''}`, source: 'cargo', quiet });
    return { ...r, output: undefined, exe: platform.exe(path.join(dir, 'target', release ? 'release' : 'debug', t.name)) };
  }
  const cfg = config.get().build;
  const cc = lang === 'c' ? (cfg.cCompiler || 'gcc') : (cfg.compiler || 'g++');
  const std = lang === 'c' ? (cfg.cStd || 'c17') : (cfg.std || 'c++20');
  const srcDir = path.join(dir, 'src');
  const sources = fs.readdirSync(srcDir).filter((n) => n.endsWith(`.${EXT[lang]}`)).map((n) => path.join(srcDir, n));
  if (!sources.length) throw new Error(`No .${EXT[lang]} files in ${srcDir}`);
  fs.mkdirSync(path.join(dir, '.mhde'), { recursive: true });
  const exe = platform.exe(path.join(dir, '.mhde', release ? `${t.name}-release` : t.name));
  const flags = [`-std=${std}`, '-Wall', '-Wextra', ...(release ? ['-O2'] : SAN())];
  let m = null;
  if (lang === 'cpp') m = await require('./modules').prepareAny({ cc, std, flags, file: sources[0] }).catch(() => null);
  const args = m ? [`-std=${m.std}`, ...flags.slice(1), ...m.args, '-o', exe, ...sources, ...m.inputs] : [...flags, '-o', exe, ...sources, ...(lang === 'c' ? ['-lm'] : [])];
  const r = await b.execStream({ cmd: m ? m.cc : cc, args, cwd: dir, title: `${t.name}: ${path.basename(cc)} ${release ? '-O2' : '(sanitizers on)'}`, quiet });
  return { ...r, output: undefined, exe };
}

// ------------------------------------------------------------------ checking
const quote = (a) => (a === '' ? "''" : /^[\w./=:-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
function command(name, r) {
  const shown = (r.stdin || '').length > 60 ? `${JSON.stringify(r.stdin.slice(0, 60))}…` : JSON.stringify(r.stdin || '');
  return `${name} ${(r.args || []).map(quote).join(' ')}`.trim() + (r.stdin != null && r.stdin !== '' ? `   (typed: ${shown})` : '');
}
const RUN_ENV = { ASAN_OPTIONS: 'detect_leaks=1:abort_on_error=0', UBSAN_OPTIONS: 'print_stacktrace=1:halt_on_error=1', RUST_BACKTRACE: '0' };
const firstLine = (s) => String(s || '').trim().split('\n').find((l) => /ERROR: AddressSanitizer|runtime error|panicked at|LeakSanitizer/.test(l)) || '';

// Run one test (a fresh folder, its files, its commands in order). Returns
// a list of what went wrong, empty if it passed.
async function runTest(exe, t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhde-track-'));
  const fails = [];
  try {
    for (const [f, text] of Object.entries(t.files || {})) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
    for (const r of t.run) {
      const got = await run(exe, r.args || [], { cwd: dir, input: r.stdin, env: { ...RUN_ENV, ...platform.runEnv(SAN()) }, timeoutMs: 10000 });
      const cmd = command(name, r);
      const want = r.code == null ? 0 : r.code;
      const crash = firstLine(got.err);
      if (got.code === 'timeout') { fails.push({ cmd, what: 'it didn\'t finish in 10 seconds (waiting for input? an endless loop?)' }); break; }
      if (crash) { fails.push({ cmd, what: `it crashed: ${crash.trim()}`, stderr: got.err.slice(0, 3000) }); break; }
      if (r.out != null && !same(got.out, r.out)) fails.push({ cmd, what: 'it printed something else', got: got.out.slice(0, 2000), want: r.out });
      if (r.outHas != null && !got.out.includes(r.outHas)) fails.push({ cmd, what: `it should print ${JSON.stringify(r.outHas)}`, got: got.out.slice(0, 2000) });
      if (got.code !== want) fails.push({ cmd, what: `it exited with code ${got.code}, expected ${want}`, stderr: got.err.slice(0, 1000) });
      if (r.err && !got.err.trim()) fails.push({ cmd, what: 'it should print an error message on standard error' });
      if (r.errHas && !got.err.includes(r.errHas)) fails.push({ cmd, what: `standard error should say ${JSON.stringify(r.errHas)}`, got: got.err.slice(0, 1000) || '(nothing)' });
      if (fails.length) break;
    }
    if (!fails.length) {
      for (const [f, want] of Object.entries(t.after || {})) {
        const p = path.join(dir, f);
        if (want === null) { if (fs.existsSync(p)) fails.push({ cmd: '(afterwards)', what: `${f} shouldn't be there` }); continue; }
        const got = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
        if (got === null) fails.push({ cmd: '(afterwards)', what: `${f} should be there` });
        else if (got !== want) fails.push({ cmd: '(afterwards)', what: `${f} holds something else`, got: got.slice(0, 2000), want });
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return fails;
}

async function check({ id, lang, milestone, exe: given }) {
  const t = byId.get(id);
  if (!t) throw new Error(`No track ${id}`);
  const p = loadProgress();
  const k = keyOf(id, lang);
  const at = milestone == null ? Math.min((p[k] || {}).reached || 0, t.milestones.length - 1) : +milestone;
  const m = t.milestones[at];
  let exe = given;
  let problems = [];
  if (!exe) {
    const b = await build({ id, lang });
    problems = b.problems;
    if (b.code !== 0) return { compiled: false, milestone: at, problems, results: [] };
    exe = b.exe;
  }
  const results = [];
  for (const test of m.tests) results.push({ name: test.name, fails: await runTest(exe, test, t.name) });
  const passed = results.every((r) => !r.fails.length);
  if (passed && !given) {
    const cur = p[k] || {};
    cur.reached = Math.max(cur.reached || 0, at + 1);
    cur.updated = Date.now();
    p[k] = cur;
    saveProgress(p);
  }
  return { compiled: true, milestone: at, passed, problems, results, finished: passed && at === t.milestones.length - 1 };
}

// ------------------------------------------------------------------ install
function binDir() {
  if (platform.WIN) return path.join(platform.toolsDir(), 'mybin');
  return path.join(os.homedir(), '.local', 'bin');
}
async function install({ id, lang }) {
  const t = byId.get(id);
  const b = await build({ id, lang, release: true });
  if (b.code !== 0) return { ok: false, problems: b.problems };
  const dest = path.join(binDir(), platform.exe(t.name));
  fs.mkdirSync(binDir(), { recursive: true });
  fs.copyFileSync(b.exe, dest);
  if (!platform.WIN) fs.chmodSync(dest, 0o755);
  const p = loadProgress();
  p[keyOf(id, lang)] = { ...(p[keyOf(id, lang)] || {}), installed: dest };
  saveProgress(p);
  const onPath = (process.env.PATH || process.env.Path || '').split(platform.WIN ? ';' : ':').some((d) => path.resolve(d) === path.resolve(binDir()));
  return { ok: true, path: dest, dir: binDir(), onPath, name: t.name };
}

function solution({ id, lang }) {
  const text = solutionText(id, lang);
  if (!text) throw new Error('No solution for this one');
  return { text, name: `solution.${EXT[lang]}` };
}

function init(a) {
  api = a;
  a.register('tracks.list', list);
  a.register('tracks.get', get);
  a.register('tracks.open', open);
  a.register('tracks.check', check);
  a.register('tracks.install', install);
  a.register('tracks.solution', solution);
}

module.exports = { init, list, get, open, check, build, runTest, DATA, solutionText, dirOf };
