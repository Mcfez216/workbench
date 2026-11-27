'use strict';
// Code coverage: which lines actually ran. Two ways in:
//
//   a lone file    built with --coverage into its own folder, run once (with
//                  the input you give it), then gcov counts each line
//   a CMake project  a separate build (build-coverage/, so your normal build
//                  is untouched) with --coverage, then ctest runs the tests,
//                  then gcov: what your tests reach, and what they don't
//
// gcc's gcov reads gcc's data; clang's goes through `llvm-cov gcov`. Both
// print the same text format: "  count:  line:source", with ##### for a
// line that never ran and - for lines that aren't code.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const platform = require('./platform');

let api;

function b() { return require('./build'); }
const isClang = (cc) => /clang/.test(path.basename(cc));
function gcovTool(cc) {
  if (isClang(cc)) {
    if (platform.which('llvm-cov')) return { cmd: 'llvm-cov', pre: ['gcov'] };
    throw new Error('Coverage with clang needs llvm-cov (it comes with LLVM): install it, or choose gcc in Settings');
  }
  if (platform.which('gcov')) return { cmd: 'gcov', pre: [] };
  throw new Error('gcov isn\'t installed (it comes with gcc)');
}

// "  count:  line:text" blocks, one per source file. Counts for the same
// file from several objects (a header) are added up.
function parseGcov(text, into = new Map()) {
  let file = null, lines = null;
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\s*([^:]+):\s*(\d+):(.*)$/);
    if (!m) continue;
    const count = m[1].trim(), n = +m[2];
    if (n === 0) {
      const src = m[3].match(/^Source:(.*)$/);
      if (src) {
        file = path.resolve(src[1].trim());
        lines = into.get(file) || new Map();
        into.set(file, lines);
      }
      continue;
    }
    if (!lines || count === '-') continue;
    const hits = /^[#=]+$/.test(count) ? 0 : parseInt(count.replace(/\*$/, ''), 10) || 0;
    lines.set(n, (lines.get(n) || 0) + hits);
  }
  return into;
}

function summary(map, keep) {
  const files = [];
  for (const [file, lines] of map) {
    if (!keep(file)) continue;
    const total = lines.size;
    const covered = [...lines.values()].filter((x) => x > 0).length;
    files.push({ file, total, covered, percent: total ? Math.round((100 * covered) / total) : 100, lines: Object.fromEntries(lines) });
  }
  files.sort((a, b2) => a.percent - b2.percent || a.file.localeCompare(b2.file));
  const total = files.reduce((s, f) => s + f.total, 0), covered = files.reduce((s, f) => s + f.covered, 0);
  return { files, total, covered, percent: total ? Math.round((100 * covered) / total) : 0 };
}

async function gcovAll(dir, tool, cwdFor) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '_deps') walk(p); } else if (e.name.endsWith('.gcda')) found.push(p);
    }
  };
  walk(dir);
  const map = new Map();
  for (const g of found) {
    const r = await b().execStream({ cmd: tool.cmd, args: [...tool.pre, '-t', path.basename(g)], cwd: cwdFor ? cwdFor(g) : path.dirname(g), title: `gcov ${path.basename(g)}`, quiet: true });
    parseGcov(r.output || '', map);
  }
  return map;
}

// ------------------------------------------------------------------ a lone file
async function forFile({ file, input = '', args = '' }) {
  if (!file || !/\.(c|cc|cpp|cxx)$/i.test(file)) throw new Error('Coverage works on a .c or .cpp file, or a CMake project');
  const tc = b().toolchain(/\.c$/i.test(file) ? 'c' : 'cpp');
  const tool = gcovTool(tc.cc);
  const work = config.dataPath('coverage', crypto.createHash('sha1').update(file).digest('hex').slice(0, 12));
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const exe = path.join(work, platform.exe('prog'));
  const src = path.resolve(file);
  const c = await b().execStream({ cmd: tc.cc, args: [`-std=${tc.std}`, '-O0', '-g', '--coverage', '-o', exe, src, ...(tc.lang === 'c' ? ['-lm'] : [])], cwd: work, title: `coverage: ${tc.cc} --coverage ${path.basename(file)}` });
  if (c.code !== 0) return { ok: false, code: c.code, problems: c.problems };
  const run = await b().execStream({ cmd: exe, args: String(args).split(/\s+/).filter(Boolean), cwd: path.dirname(file), input, title: `coverage: running ${path.basename(file)}`, timeoutMs: 20000 });
  const map = await gcovAll(work, tool);
  const s = summary(map, (f) => f === src);
  const result = { ok: true, kind: 'file', exitCode: run.code, problems: run.problems, ...s };
  api.broadcast('coverage.result', result);
  return result;
}

// ------------------------------------------------------------------ a CMake project: what the tests reach
async function forProject({ root }) {
  const cfg = config.get().build;
  const cc = cfg.compiler || 'g++';
  const tool = gcovTool(cc);
  const dir = path.join(root, 'build-coverage');
  const flags = '--coverage -O0 -g';
  const conf = await b().execStream({ cmd: 'cmake', args: ['-S', root, '-B', dir, '-DCMAKE_BUILD_TYPE=Debug', `-DCMAKE_C_FLAGS=${flags}`, `-DCMAKE_CXX_FLAGS=${flags}`, '-DCMAKE_EXE_LINKER_FLAGS=--coverage', '-DCMAKE_SHARED_LINKER_FLAGS=--coverage', ...(platform.which('ninja') ? ['-G', 'Ninja'] : [])], cwd: root, title: 'coverage: configure build-coverage/' });
  if (conf.code !== 0) return { ok: false, code: conf.code, problems: conf.problems };
  const bld = await b().execStream({ cmd: 'cmake', args: ['--build', dir], cwd: root, title: 'coverage: build' });
  if (bld.code !== 0) return { ok: false, code: bld.code, problems: bld.problems };
  // the counts from the last run start again
  const clean = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) clean(p); else if (e.name.endsWith('.gcda')) fs.rmSync(p); } };
  clean(dir);
  const t = await b().execStream({ cmd: 'ctest', args: ['--test-dir', dir, '--output-on-failure'], cwd: root, title: 'coverage: ctest', source: 'test' });
  const map = await gcovAll(dir, tool);
  const inside = (f) => f.startsWith(root + path.sep) && !f.startsWith(dir + path.sep) && !/[\\/](build[^\\/]*|_deps)[\\/]/.test(path.relative(root, f));
  const s = summary(map, inside);
  const result = { ok: true, kind: 'project', root, testsFailed: t.code !== 0, problems: t.problems, ...s };
  api.broadcast('coverage.result', result);
  return result;
}

async function run({ file, root, input, args }) {
  const cm = root || (file ? require('./cmake').cmakeRoot(file) : null);
  if (cm) return forProject({ root: cm });
  return forFile({ file, input, args });
}

function init(a) {
  api = a;
  a.register('coverage.run', run);
}

module.exports = { init, parseGcov, summary, forFile, forProject };
