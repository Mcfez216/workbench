'use strict';
// Makefile projects: many C projects (and most course work) use plain make,
// not CMake. When a file's folder (or one above it) has a Makefile and
// there's no CMakeLists.txt, F9 runs make, Ctrl+F9 runs the program it
// made, the debugger debugs it, and F7 runs `make test` (or `make check`)
// if the Makefile has one.
//
// Which program? make doesn't say, so: the programs in the project folder,
// bin/ and build/ (executable files, newest first); with more than one, the
// window asks once and remembers. GNU make syntax is the norm: on OpenBSD,
// gmake is used when it's installed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const platform = require('./platform');

const NAMES = ['GNUmakefile', 'makefile', 'Makefile'];
let api = null;
function init(a) { api = a; }

function makefileIn(dir) { return NAMES.map((n) => path.join(dir, n)).find((f) => fs.existsSync(f)) || null; }

// The nearest folder with a Makefile, from a file or folder upwards (not past your home)
function makeRoot(start) {
  if (!start) return null;
  let d;
  try { d = fs.statSync(start).isDirectory() ? start : path.dirname(start); } catch (e) { d = path.dirname(start); }
  const stop = os.homedir();
  for (let cur = path.resolve(d); ; cur = path.dirname(cur)) {
    if (makefileIn(cur)) return cur;
    if (cur === stop || path.dirname(cur) === cur) return null;
  }
}

function makeCmd() {
  if (platform.BSD && platform.which('gmake')) return 'gmake';
  if (platform.which('make')) return 'make';
  if (platform.WIN && platform.which('mingw32-make')) return 'mingw32-make';
  throw new Error(`make isn't installed (${require('./distro').installHint('make')})`);
}

// The named targets a Makefile has (not pattern rules, not variables)
function targets(root) {
  const f = makefileIn(root);
  if (!f) return [];
  const out = [];
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/^([A-Za-z0-9_][A-Za-z0-9_.\/-]*)\s*:(?!=)/gm)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
const testTarget = (root) => targets(root).find((t) => t === 'test' || t === 'check') || null;

// Executable files the build left: the project folder, bin/, build/
function programs(root) {
  const found = [];
  for (const sub of ['', 'bin', 'build', 'out']) {
    const d = path.join(root, sub);
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const p = path.join(d, e.name);
      if (platform.WIN ? !/\.exe$/i.test(e.name) : /\.(sh|py|pl|o|a|so|d)$/.test(e.name)) continue;
      try {
        const st = fs.statSync(p);
        if (!platform.WIN && !(st.mode & 0o111)) continue;
        const head = Buffer.alloc(4);
        const fd = fs.openSync(p, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
        const binary = head[0] === 0x7f && head.toString('latin1', 1, 4) === 'ELF' || head.toString('latin1', 0, 2) === 'MZ' || head.readUInt32BE(0) === 0xcffaedfe;
        if (binary) found.push({ name: path.relative(root, p), path: p, mtime: st.mtimeMs });
      } catch (e2) { /* unreadable: not ours */ }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

function b() { return require('./build'); }

async function build({ root, target }) {
  const cmd = makeCmd();
  const jobs = String(config.get().build.jobs || 4);
  const r = await b().execStream({ cmd, args: ['-j', jobs, ...(target ? [target] : [])], cwd: root, title: `${cmd}${target ? ' ' + target : ''}` });
  return { kind: 'make', root, target: target || null, ...r, output: undefined };
}

// The program to run or debug: the one you picked, the only one, or a question
async function pick({ root, target }) {
  const b0 = await build({ root });
  if (b0.code !== 0) return { failed: { ok: false, ...b0 } };
  const progs = programs(root);
  if (target) { const p = progs.find((x) => x.name === target); if (p) return { program: p, build: b0 }; }
  if (progs.length === 1) return { program: progs[0], build: b0 };
  if (!progs.length) return { failed: { ok: false, code: 1, problems: [{ file: makefileIn(root), line: 1, col: 1, severity: 'error', message: 'make finished, but there\'s no program in the project folder, bin/ or build/ to run', source: 'make' }] } };
  return { needTarget: true, root, choices: progs.map((x) => ({ name: x.name, kind: 'program', dirRel: path.dirname(x.name) })) };
}

async function run({ root, target, args = '' }) {
  const p = await pick({ root, target });
  if (p.failed) return p.failed;
  if (p.needTarget) return { ok: false, ...p };
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const term = b().runProgram({ cwd: root, command: `${q(p.program.path)} ${args}`.trim(), title: `run: ${p.program.name}`, flags: ['-fsanitize=address'] });
  return { ok: true, ...p.build, target: p.program.name, terminal: term };
}

async function debugPrepare({ root, target, file }) {
  const p = await pick({ root, target });
  if (p.failed) return p.failed;
  if (p.needTarget) return { ok: false, ...p };
  return { ok: true, ...p.build, exe: p.program.path, cwd: root, gdb: platform.gdb(), mainBreak: 'main', target: p.program.name, lang: /\.c$/i.test(file || '') ? 'c' : 'cpp' };
}

// F7: make test (or make check), shown in the Tests sidebar as one test
function testList({ root }) {
  const t = testTarget(root);
  return { root, configured: true, kind: 'make', tests: t ? [{ index: 1, name: `make ${t}`, target: null, notBuilt: false }] : [] };
}
async function testRun({ root }) {
  const t = testTarget(root);
  if (!t) throw new Error('This Makefile has no test (or check) target: add one, and F7 runs it');
  if (api) api.broadcast('ctest.start', { root, indexes: null });
  const r = await build({ root, target: t });
  const res = { index: 1, name: `make ${t}`, status: r.code === 0 ? 'passed' : 'failed', detail: r.code === 0 ? 'passed' : `exit ${r.code}`, seconds: 0 };
  if (api) { api.broadcast('ctest.result', { root, ...res }); api.broadcast('ctest.done', { root, ok: r.code === 0, summary: { percent: r.code === 0 ? 100 : 0, failed: r.code === 0 ? 0 : 1, total: 1 } }); }
  return { ok: r.code === 0, root, ...r, results: [res], summary: { percent: r.code === 0 ? 100 : 0, failed: r.code === 0 ? 0 : 1, total: 1 } };
}

module.exports = { init, makeRoot, makefileIn, targets, testTarget, programs, build, run, debugPrepare, testList, testRun };
