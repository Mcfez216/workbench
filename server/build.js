'use strict';
// Compiling, running and checking C++ outside CMake: the stream every tool's
// output goes through (into the Build panel and the Problems list), a single
// file with g++, running a program in a terminal while watching for
// sanitizer reports, the C++ sandbox and its assembly view, clang-tidy,
// cppcheck, and the DOS retro track (Open Watcom + DOSBox-X).
// CMake and CTest are in cmake.js.

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const pty = require('./pty');
const { OutputParser } = require('./parse');

let api;
const runs = new Map();
let nextRun = 1;

// ------------------------------------------------------------------ running tools
function execStream({ cmd, args, cwd, title, env, source, input, quiet, onLine, timeoutMs }) {
  const runId = String(nextRun++);
  const parser = new OutputParser(cwd, { source });
  let partial = '';
  let output = '';
  const child = spawn(cmd, args, { cwd, env: { ...process.env, LC_ALL: 'C', ...env } });
  runs.set(runId, child);
  if (!quiet) api.broadcast('build.start', { runId, title, command: [cmd, ...args].join(' '), cwd });
  const onText = (text) => {
    if (!quiet) api.broadcast('build.output', { runId, text });
    if (output.length < 4 * 1024 * 1024) output += text;
    const lines = (partial + text).split('\n');
    partial = lines.pop();
    for (const line of lines) { parser.line(line); if (onLine) onLine(line); }
  };
  child.stdout.on('data', (b) => onText(b.toString('utf8')));
  child.stderr.on('data', (b) => onText(b.toString('utf8')));
  if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  child.stdin.on('error', () => {});
  let timer = null;
  if (timeoutMs) {
    timer = setTimeout(() => { onText(`\n[stopped after ${Math.round(timeoutMs / 1000)} s: an endless loop?]\n`); child.kill('SIGKILL'); }, timeoutMs);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (partial) { parser.line(partial); if (onLine) onLine(partial); }
      runs.delete(runId);
      const result = { runId, code, problems: parser.problems, title };
      if (!quiet) api.broadcast('build.done', result);
      resolve({ ...result, output });
    };
    child.on('error', (err) => { onText(`\n${cmd}: ${err.code === 'ENOENT' ? `not installed (${hint(cmd)})` : err.message}\n`); finish(127); });
    child.on('close', (code, signal) => finish(code === null ? 128 + (os.constants.signals[signal] || 0) : code));
  });
}

// "not installed (sudo apt install clang-tidy)": the line for this system
function hint(cmd) {
  const tool = path.basename(cmd);
  if (tool === 'owcc') return 'bash scripts/install-open-watcom.sh, note 0.4';
  return require('./distro').installHint(tool);
}

function cancel({ runId }) {
  const c = runs.get(String(runId));
  if (c) c.kill('SIGTERM');
  return !!c;
}

function which(cmd, extraDirs = []) {
  const dirs = [...extraDirs, ...(process.env.PATH || '').split(':')];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); if (fs.statSync(p).isFile()) return p; } catch (e) { /* next */ }
  }
  return null;
}

// ------------------------------------------------------------------ running programs
// A program runs in its own terminal tab, so it can read your typing
// (std::cin!). Its output is watched: an AddressSanitizer or UBSan report
// becomes a problem pointing at the line in your code.
function runProgram({ cwd, command, title, env }) {
  const shell = process.env.SHELL || '/bin/bash';
  const script = `${command}\nstatus=$?\nprintf '\\n\\033[7m[exited with status %s - press Enter to close]\\033[0m' "$status"\nread -r _`;
  return pty.open({ cwd, title: title || `run: ${command}`, argv: [shell, '-c', script], env }, sanitizerWatch(cwd, title || command));
}

function sanitizerWatch(cwd, title) {
  const parser = new OutputParser(cwd);
  let partial = '';
  let reported = 0;
  const flush = () => {
    if (parser.problems.length > reported) {
      if (process.env.CPW_DEBUG) console.error(`[runtime] ${title}: ${parser.problems.length} (was ${reported}) at ${new Date().toISOString()}`);
      reported = parser.problems.length;
      api.broadcast('build.runtime', { title, problems: parser.problems });
    }
  };
  return {
    onData(text) {
      const lines = (partial + text).split(/\r?\n/);
      partial = lines.pop();
      for (const l of lines) parser.line(l);
      if (/ABORTING|runtime error|SUMMARY: /.test(text)) flush();
    },
    onExit() { if (partial) parser.line(partial); flush(); },
  };
}

// ------------------------------------------------------------------ one file, no CMake
const CXX_EXT = /\.(cpp|cc|cxx|c\+\+|C)$/;
function outputFor(file) { return file.replace(/\.[^./]+$/, ''); }

async function buildSingle({ file }) {
  const cfg = config.get();
  if (!file || !(CXX_EXT.test(file) || file.endsWith('.c'))) throw new Error('This file is not in a CMake project, and it is not a .cpp file to compile on its own');
  const isC = file.endsWith('.c');
  const out = outputFor(file);
  const compiler = isC ? 'gcc' : (cfg.build.compiler || 'g++');
  const args = [isC ? '-std=c17' : `-std=${cfg.build.std || 'c++20'}`, ...cfg.build.sandboxFlags, '-o', out, file];
  const r = await execStream({ cmd: compiler, args, cwd: path.dirname(file), title: `${compiler} ${path.basename(file)}` });
  return { kind: 'single', output: out, ...r };
}

// ------------------------------------------------------------------ the sandbox
const COMPILERS = new Set(['g++', 'clang++']);
const STDS = new Set(['c++17', 'c++20', 'c++23']);
const OPTS = new Set(['-O0', '-O1', '-O2', '-O3', '-Os']);
function sandboxDir() { return path.dirname(config.dataPath('sandbox', 'x')); }
function pick(set, v, fallback) { return set.has(v) ? v : fallback; }

async function sandboxRun({ source, compiler, std }) {
  const cfg = config.get();
  const dir = sandboxDir();
  const file = path.join(dir, 'scratch.cpp');
  fs.writeFileSync(file, source);
  const cxx = pick(COMPILERS, compiler, cfg.build.compiler || 'g++');
  const s = pick(STDS, std, cfg.build.std || 'c++20');
  const out = path.join(dir, 'scratch');
  const res = await execStream({ cmd: cxx, args: [`-std=${s}`, ...cfg.build.sandboxFlags, '-o', out, file], cwd: dir, title: `sandbox: ${cxx} -std=${s}` });
  if (res.code !== 0) return { ok: false, ...res, file, output: undefined };
  const term = runProgram({ cwd: dir, command: './scratch', title: 'sandbox: scratch' });
  return { ok: true, ...res, file, output: undefined, terminal: term };
}

// What the compiler made of it: the assembly, Compiler Explorer style.
// Directives, debug sections and unused labels are dropped, names are
// demangled, and each instruction remembers which source line it came from
// (from the .loc directives -g leaves behind).
async function sandboxAsm({ source, compiler, std, opt }) {
  const cfg = config.get();
  const dir = sandboxDir();
  const file = path.join(dir, 'scratch-asm.cpp');
  fs.writeFileSync(file, source);
  const cxx = pick(COMPILERS, compiler, cfg.build.compiler || 'g++');
  const s = pick(STDS, std, cfg.build.std || 'c++20');
  const o = pick(OPTS, opt, '-O1');
  const r = await execStream({ cmd: cxx, args: [`-std=${s}`, o, '-g', '-S', '-masm=intel', '-fno-asynchronous-unwind-tables', '-fno-dwarf2-cfi-asm', '-o', '-', file],
    cwd: dir, title: `asm: ${cxx} ${o}`, quiet: true });
  if (r.code !== 0) return { ok: false, problems: r.problems, text: r.output, lines: [] };
  let asm = r.output;
  try { asm = execFileSync('c++filt', [], { input: asm, maxBuffer: 64 * 1024 * 1024 }).toString(); } catch (e) { /* mangled names, then */ }
  return { ok: true, problems: r.problems, lines: filterAsm(asm, 'scratch-asm.cpp'), flags: `${cxx} -std=${s} ${o} -masm=intel` };
}

function filterAsm(text, mainName) {
  const raw = text.split('\n');
  const mainFiles = new Set();
  for (const l of raw) {
    const m = l.match(/^\s*\.file\s+(\d+)\s+"([^"]*)"(?:\s+"([^"]*)")?/);
    if (m && path.basename(m[3] || m[2]) === mainName) mainFiles.add(m[1]);
  }
  // Only code and data sections are worth reading; debug info, unwind
  // tables and notes are skipped (and so are the labels only they use).
  const keep = raw.map(() => false);
  let on = true;
  raw.forEach((l, i) => {
    const sec = l.match(/^\s*\.(section|text|data|bss)\b\s*([^,\s]*)/);
    if (sec) { on = sec[1] !== 'section' || /^\.(text|rodata|data|bss)/.test(sec[2]); return; }
    if (/^\s*\.(pushsection|popsection|previous)\b/.test(l)) return;
    keep[i] = on;
  });
  const used = new Set();
  raw.forEach((l, i) => {
    if (!keep[i] || /^\S.*:\s*$/.test(l)) return;
    if (/^\s*\./.test(l) && !/^\s*\.(string|ascii|long|quad|word|byte|zero|value)\b/.test(l)) return;
    for (const m of l.matchAll(/\.L\w+/g)) used.add(m[0]);
  });
  const out = [];
  let src = 0;
  raw.forEach((l, i) => {
    const loc = l.match(/^\s*\.loc\s+(\d+)\s+(\d+)/);
    if (loc) { src = mainFiles.has(loc[1]) ? +loc[2] : 0; return; }
    if (!keep[i] || /^\s*#/.test(l) || !l.trim()) return;
    const label = l.match(/^([^\s#].*):\s*$/);
    if (label) {
      if (label[1].startsWith('.L') && !used.has(label[1])) return;
      out.push({ text: label[1] + ':', src: 0, label: true });
      return;
    }
    if (/^\s*\.(string|ascii)\b/.test(l)) { out.push({ text: '        ' + l.trim().replace(/\t/g, ' '), src: 0 }); return; }
    if (/^\s*\./.test(l)) return;
    out.push({ text: '        ' + l.trim().replace(/\s+#.*$/, '').replace(/\t/g, ' '), src });
  });
  return out;
}

// ------------------------------------------------------------------ static analysis
const TIDY_CHECKS = '-*,clang-analyzer-*,bugprone-*,-bugprone-easily-swappable-parameters,performance-*,modernize-use-nullptr,modernize-use-override,modernize-loop-convert,cppcoreguidelines-pro-type-member-init,readability-container-size-empty';

function findUp(start, name, stop) {
  for (let d = start; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, name))) return path.join(d, name);
    if (d === stop || path.dirname(d) === d) return null;
  }
}

async function tidy({ file }) {
  const cfg = config.get();
  const cmake = require('./cmake');
  const root = cmake.cmakeRoot(file);
  const db = root ? path.join(cmake.buildDir(root), 'compile_commands.json') : null;
  let inDb = false;
  if (db && fs.existsSync(db)) { try { inDb = fs.readFileSync(db, 'utf8').includes(JSON.stringify(file).slice(1, -1)); } catch (e) { /* no */ } }
  const ownConfig = findUp(path.dirname(file), '.clang-tidy', root || config.HOME);
  const checks = cfg.tidy.checks || (ownConfig ? '' : TIDY_CHECKS);
  const args = ['--quiet', ...(checks ? [`--checks=${checks}`] : []), ...(inDb ? ['-p', path.dirname(db), file] : [file, '--', `-std=${cfg.build.std || 'c++20'}`])];
  const r = await execStream({ cmd: 'clang-tidy', args, cwd: root || path.dirname(file), title: `clang-tidy ${path.basename(file)}`, source: 'clang-tidy' });
  // clang-tidy also reports the compiler's own errors; and exits 1 only for those
  return { ...r, output: undefined, clean: !r.problems.some((p) => p.file === file) };
}

async function cppcheck({ file }) {
  const cfg = config.get();
  const std = (cfg.build.std || 'c++20').replace('c++23', 'c++20');   // cppcheck knows up to c++20 for sure
  const args = ['--enable=warning,style,performance,portability', `--std=${std}`, '--inline-suppr', '--quiet',
    '--template={file}:{line}:{column}: {severity}: {message} [{id}]', file];
  const r = await execStream({ cmd: 'cppcheck', args, cwd: path.dirname(file), title: `cppcheck ${path.basename(file)}`, source: 'cppcheck' });
  return { ...r, output: undefined, clean: !r.problems.length };
}

// ------------------------------------------------------------------ DOS retro track
function watcomDirs() {
  const dirs = [];
  if (process.env.WATCOM) dirs.push(process.env.WATCOM);
  dirs.push(path.join(config.HOME, 'opt', 'open-watcom-2'), '/opt/watcom', path.join(config.HOME, 'watcom'));
  return dirs;
}
function dosTools() {
  let watcom = null, owcc = which('owcc');
  if (owcc) watcom = process.env.WATCOM || path.dirname(path.dirname(owcc));
  else {
    for (const d of watcomDirs()) {
      const p = path.join(d, 'binl64', 'owcc');
      if (fs.existsSync(p)) { owcc = p; watcom = d; break; }
    }
  }
  return { owcc, watcom, dosbox: which('dosbox-x') };
}

async function dosBuild({ file }) {
  const t = dosTools();
  if (!t.owcc) throw new Error('Open Watcom is not installed. Note 0.4: bash scripts/install-open-watcom.sh');
  const exe = outputFor(file) + '.exe';
  const env = { WATCOM: t.watcom, INCLUDE: path.join(t.watcom, 'h'), PATH: `${path.join(t.watcom, 'binl64')}:${process.env.PATH}` };
  const r = await execStream({ cmd: t.owcc, args: ['-bt=dos', '-o', path.basename(exe), path.basename(file)], cwd: path.dirname(file), env, title: `owcc -bt=dos ${path.basename(file)}` });
  const base = path.basename(exe, '.exe');
  return { ...r, output: undefined, exe, warning: base.length > 8 ? `DOS file names are 8.3: ${path.basename(exe)} will show up as something like ${base.slice(0, 6).toUpperCase()}~1.EXE` : '' };
}

function dosRun({ exe }) {
  const t = dosTools();
  if (!t.dosbox) throw new Error(`DOSBox-X is not installed (note 0.4): ${require('./distro').installHint('dosbox-x')}`);
  if (!fs.existsSync(exe)) throw new Error(`${path.basename(exe)} isn't built yet`);
  // its own window; it outlives this app if you like
  const child = spawn(t.dosbox, [path.basename(exe)], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return true;
}

// ------------------------------------------------------------------ what's installed
function tools() {
  const names = ['g++', 'clang++', 'cmake', 'ctest', 'ninja', 'gdb', 'clangd', 'clang-tidy', 'clang-format', 'cppcheck', 'valgrind', 'git', 'rg'];
  const out = {};
  for (const n of names) out[n] = !!which(n);
  out['secret-tool'] = !!which('secret-tool');
  const dos = dosTools();
  out.owcc = !!dos.owcc; out['dosbox-x'] = !!dos.dosbox;
  return out;
}

function init(a) {
  api = a;
  a.register('build.cancel', cancel);
  a.register('build.single', buildSingle);
  a.register('build.runProgram', (p) => runProgram(p));
  a.register('build.tools', tools);
  // what to install a list of tools with, on this system
  a.register('build.installLine', ({ tools: list }) => {
    const d = require('./distro');
    return { line: d.installLine((list || []).map(d.pkgFor)), packages: Object.fromEntries((list || []).map((t) => [t, d.pkgFor(t)])) };
  });
  a.register('sandbox.run', sandboxRun);
  a.register('sandbox.asm', sandboxAsm);
  a.register('sandbox.dir', () => ({ dir: sandboxDir() }));
  a.register('analyze.tidy', tidy);
  a.register('analyze.cppcheck', cppcheck);
  a.register('dos.status', () => { const t = dosTools(); return { owcc: t.owcc, watcom: t.watcom, dosbox: t.dosbox }; });
  a.register('dos.build', dosBuild);
  a.register('dos.run', dosRun);
}

module.exports = { init, execStream, runProgram, buildSingle, filterAsm, which, hint, CXX_EXT };
