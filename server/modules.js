'use strict';
// import std; (C++23) for lone files, the sandbox and the judge.
//
// `import std;` doesn't read a header: it needs the standard library built
// into a "module" first, and compilers don't do that step for you yet
// (without it, clang says "module 'std' not found"). So here it's done once
// per compiler and set of flags, and kept in the app's data folder:
//
//   clang++ with libc++   std.cppm -> std.pcm (+ std.o); then
//                         -fmodule-file=std=std.pcm ... std.o
//                         (llvm-mingw on Windows ships std.cppm; on Ubuntu
//                         it's in libc++-18-dev)
//   g++ 15 or newer       bits/std.cc -> gcm.cache/std.gcm (+ std.o), found
//                         through a module mapper file
//
// Stroustrup's Programming: Principles and Practice (3rd edition) starts
// with import std; and its PPP_support.h uses it too, so a header that says
// it counts as well.

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const platform = require('./platform');

const IMPORT = /^\s*(?:export\s+)?import\s+(std(?:\.compat)?)\s*;/m;
const STD_RANK = { 'c++17': 17, 'c++20': 20, 'c++23': 23, 'c++2c': 26, 'c++26': 26 };

// Which std modules a file needs: its own import lines, and those of the
// headers it includes with "quotes" (a few levels, next to the file)
function stdImports(file, seen = new Set(), depth = 0) {
  const out = new Set();
  if (depth > 4 || seen.has(file)) return out;
  seen.add(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return out; }
  // comments out of the way, so a commented-out import doesn't count
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const m of code.matchAll(new RegExp(IMPORT.source, 'gm'))) out.add(m[1]);
  for (const m of code.matchAll(/^\s*#\s*include\s*"([^"]+)"/gm)) {
    for (const x of stdImports(path.join(path.dirname(file), m[1]), seen, depth + 1)) out.add(x);
  }
  return out;
}
const usesStdModule = (file) => stdImports(file).size > 0;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => resolve({ code: err ? (err.code === 'ENOENT' ? 127 : err.code || 1) : 0, out: String(stdout), err: String(stderr) }));
  });
}
const isClang = (cc) => /clang/.test(path.basename(cc));

// libc++'s module sources: from libc++.modules.json, which clang can find
async function libcxxModules(cc) {
  const r = await run(cc, ['-stdlib=libc++', '-print-file-name=libc++.modules.json']);
  let json = r.out.trim();
  const tried = [json];
  if (!json || !path.isAbsolute(json) || !fs.existsSync(json)) {
    // llvm-mingw keeps it in <target>/lib, next to its own bin
    const exe = platform.which(cc);
    const root = exe ? path.dirname(path.dirname(fs.realpathSync(exe))) : null;
    const guess = root ? [path.join(root, 'x86_64-w64-mingw32', 'lib', 'libc++.modules.json'), path.join(root, 'lib', 'libc++.modules.json')] : [];
    tried.push(...guess);
    json = guess.find((g) => fs.existsSync(g));
  }
  if (!json) return { error: 'missing', tried };
  const m = JSON.parse(fs.readFileSync(json, 'utf8'));
  const base = path.dirname(json);
  const mods = {};
  for (const x of m.modules || []) {
    mods[x['logical-name']] = {
      source: path.resolve(base, x['source-path']),
      includes: ((x['local-arguments'] || {})['system-include-directories'] || []).map((d) => path.resolve(base, d)),
    };
  }
  return { mods };
}

// The flags that must match between the module and the program (language,
// sanitizers, debug info...), without warnings, output or input files
function moduleFlags(flags) {
  return flags.filter((f) => !/^-W|^-o$|^-pedantic/.test(f));
}

const pending = new Map();   // one build of each module at a time
function cacheDir(cc, ccVersion, flags) {
  const key = crypto.createHash('sha256').update(JSON.stringify([platform.which(cc) || cc, ccVersion, flags])).digest('hex').slice(0, 16);
  return config.dataPath('std-module', key);
}

// What to add to a compile for import std;, building the module first if it
// isn't cached yet. Returns { cc, std, args (before the source file),
// inputs (after it), note }. Throws with a plain-words reason if this
// compiler can't do it.
async function prepare({ cc, std, flags, file, log }) {
  const want = stdImports(file);
  if (!want.size) return null;
  const rank = STD_RANK[std] || 0;
  const useStd = rank >= 23 ? std : 'c++23';
  const note = rank >= 23 ? '' : `import std; needs C++23: built with -std=c++23 (Settings → C++ standard sets the default)`;
  const mf = [`-std=${useStd}`, ...moduleFlags(flags)];
  const ver = (await run(cc, ['--version'])).out.split('\n')[0];
  if (!ver) throw new Error(`${cc} isn't installed`);

  if (isClang(cc)) {
    const lib = await libcxxModules(cc);
    if (lib.error || !lib.mods.std) {
      throw new Error(`import std; needs libc++'s module files, and ${cc} can't find them. `
        + (platform.WIN ? 'Run "Install on Windows (no WSL).cmd" again (llvm-mingw has them).' : `On Ubuntu: ${require('./distro').installLine(['libc++-18-dev', 'libc++abi-18-dev'])}`));
    }
    const all = [...mf, '-stdlib=libc++'];
    const dir = cacheDir(cc, ver, all);
    const pcm = (n) => path.join(dir, `${n}.pcm`), obj = (n) => path.join(dir, `${n}.o`);
    const order = want.has('std.compat') ? ['std', 'std.compat'] : ['std'];
    for (const name of order) {
      if (fs.existsSync(obj(name))) continue;
      const key = obj(name);
      if (!pending.has(key)) {
        pending.set(key, (async () => {
          fs.mkdirSync(dir, { recursive: true });
          const m = lib.mods[name];
          if (!m) throw new Error(`libc++ has no ${name} module here`);
          if (log) log(`building the ${name} module once (it's kept for next time): ${m.source}\n`);
          const deps = name === 'std.compat' ? [`-fmodule-file=std=${pcm('std')}`] : [];
          const inc = m.includes.flatMap((d) => ['-isystem', d]);
          let r = await run(cc, [...all, ...inc, ...deps, '-w', '-Wno-reserved-module-identifier', '--precompile', '-o', `${pcm(name)}.tmp`, m.source], { cwd: dir });
          if (r.code !== 0) throw new Error(`Building the ${name} module failed:\n${r.err.slice(0, 1500)}`);
          fs.renameSync(`${pcm(name)}.tmp`, pcm(name));
          r = await run(cc, [...all, ...deps, '-w', '-Wno-unused-command-line-argument', '-c', pcm(name), '-o', `${obj(name)}.tmp`], { cwd: dir });
          if (r.code !== 0) throw new Error(`Building the ${name} module failed:\n${r.err.slice(0, 1500)}`);
          fs.renameSync(`${obj(name)}.tmp`, obj(name));
        })().finally(() => pending.delete(key)));
      }
      await pending.get(key);
    }
    return {
      cc, std: useStd, note,
      args: ['-stdlib=libc++', ...order.map((n) => `-fmodule-file=${n}=${pcm(n)}`)],
      inputs: order.map(obj),
    };
  }

  // g++: 15 or newer has bits/std.cc
  const major = +((await run(cc, ['-dumpversion'])).out.trim().split('.')[0]) || 0;
  if (major < 15) {
    throw new Error(`import std; needs g++ 15 or newer, and this is g++ ${major}. Choose clang++ in Settings → C++ compiler (with libc++), or use #include <iostream> and friends instead.`);
  }
  const all = [...mf, '-fmodules'];
  const dir = cacheDir(cc, ver, all);
  const mapper = path.join(dir, 'modules.map');
  const objs = [];
  for (const name of want.has('std.compat') ? ['std', 'std.compat'] : ['std']) {
    const o = path.join(dir, `${name}.o`);
    objs.push(o);
    if (fs.existsSync(o)) continue;
    if (!pending.has(o)) {
      pending.set(o, (async () => {
        fs.mkdirSync(dir, { recursive: true });
        if (log) log(`building the ${name} module once (it's kept for next time)\n`);
        const src = name === 'std' ? 'bits/std.cc' : 'bits/std.compat.cc';
        const r = await run(cc, [...all, '-w', '-fsearch-include-path', '-c', src, '-o', o], { cwd: dir });
        if (r.code !== 0) throw new Error(`Building the ${name} module failed:\n${r.err.slice(0, 1500)}`);
      })().finally(() => pending.delete(o)));
    }
    await pending.get(o);
  }
  fs.writeFileSync(mapper, ['std', 'std.compat'].map((n) => `${n} ${path.join(dir, 'gcm.cache', `${n}.gcm`)}`).join('\n') + '\n');
  return { cc, std: useStd, note, args: ['-fmodules', `-fmodule-mapper=${mapper}`], inputs: objs };
}

// The same, but when this compiler can't (g++ before 15, say), try the
// other one before giving up: clang++ with libc++ usually can.
async function prepareAny({ cc, std, flags, file, cCompiler }) {
  if (!usesStdModule(file)) return null;
  try { return await prepare({ cc, std, flags, file }); } catch (first) {
    const other = isClang(cc) ? null : platform.which('clang++') ? 'clang++' : null;
    if (!other) throw first;
    try {
      const m = await prepare({ cc: other, std, flags, file });
      m.note = [`${cc} can't do import std;, so ${other} built this file`, m.note].filter(Boolean).join('. ');
      return m;
    } catch (second) { throw first; }
  }
}

module.exports = { prepare, prepareAny, stdImports, usesStdModule };
