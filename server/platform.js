'use strict';
// The differences between Linux and OpenBSD, in one place.
//
// OpenBSD's compiler is clang (cc / c++); gcc is a package that installs as
// egcc. gdb comes from packages as egdb. clang on OpenBSD has no
// AddressSanitizer runtime, so a "sanitizers on" build there uses UBSan in
// trap mode (no runtime needed: undefined behaviour stops the program with
// SIGILL) and OpenBSD's own hardened malloc does the heap checking
// (MALLOC_OPTIONS=S: guard pages, junk-filled and delayed frees, canaries),
// which catches double frees, many use-after-frees and heap overflows.
//
// Windows without WSL (windows/Install-Native.ps1): the toolchain is a set
// of portable folders in %LOCALAPPDATA%\CppPathWorkbenchNative\tools: llvm-mingw
// (clang with AddressSanitizer and UBSan, lldb), w64devkit (gcc, gdb, make,
// and busybox's sh and Unix commands, so the vault's shell lines work),
// CMake, Ninja, MinGit and Node.js. Programs are .exe; PATH uses ; and
// PATHEXT. No LeakSanitizer and no Valgrind there.
//
// WORKBENCH_PLATFORM=openbsd (or win32) pretends, for the tests.

const fs = require('fs');
const path = require('path');

const NAME = process.env.WORKBENCH_PLATFORM || process.platform;
const OPENBSD = NAME === 'openbsd';
const BSD = /bsd$/.test(NAME);
const WIN = NAME === 'win32';

// Where a program is: PATH split with ; on Windows, and there "clang"
// finds clang.exe (PATHEXT). Extra folders are looked in first.
function which(cmd, extraDirs = [], { platform = NAME, env = process.env } = {}) {
  const win = platform === 'win32';
  const dirs = [...extraDirs, ...(env.PATH || env.Path || '').split(win ? ';' : ':')];
  const exts = win && !/\.[a-z0-9]+$/i.test(cmd) ? ['', ...(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).flatMap((e) => [e, e.toLowerCase()])] : [''];
  for (const d of dirs) {
    if (!d) continue;
    for (const e of exts) {
      const p = path.join(d, cmd + e);
      try {
        if (!win) fs.accessSync(p, fs.constants.X_OK);
        if (fs.statSync(p).isFile()) return p;
      } catch (err) { /* next */ }
    }
  }
  return null;
}
const onPath = (cmd) => !!which(cmd);

// A program's file name: name.exe on Windows
function exe(p, { platform = NAME } = {}) { return platform === 'win32' && !/\.exe$/i.test(p) ? p + '.exe' : p; }

// The portable toolchain's folders, in the order they go on PATH (the ones
// that exist). llvm-mingw first, so clang's own tools win; its
// x86_64-w64-mingw32\bin has the AddressSanitizer DLL programs load.
function toolsDir(env = process.env) {
  return env.CPW_TOOLS || path.join(env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'CppPathWorkbenchNative', 'tools');
}
function toolDirs(env = process.env) {
  const t = toolsDir(env);
  return ['llvm-mingw\\bin', 'llvm-mingw\\x86_64-w64-mingw32\\bin', 'w64devkit\\bin', 'cmake\\bin', 'ninja', 'mingit\\cmd', 'mingit\\usr\\bin', 'node']
    .map((d) => path.join(t, ...d.split('\\')));
}
// Called once at start-up on Windows: the toolchain goes first on PATH
function setupPath(env = process.env) {
  if (!WIN) return [];
  const have = toolDirs(env).filter((d) => fs.existsSync(d));
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const now = (env[key] || '').split(';');
  env[key] = [...have.filter((d) => !now.includes(d)), ...now].filter(Boolean).join(';');
  return have;
}

// gdb, or the packaged one on OpenBSD (egdb)
function gdb() {
  if (onPath('gdb')) return 'gdb';
  if (onPath('egdb')) return 'egdb';
  return 'gdb';
}

// A shell to run commands in: yours, else bash where there is one, else sh.
// On Windows, w64devkit's sh (busybox): the vault's shell lines and the
// app's own little scripts work there as they do on Linux.
function shell() {
  if (WIN) return which('sh') || process.env.COMSPEC || 'cmd.exe';
  if (process.env.SHELL) return process.env.SHELL;
  return fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
}
// What a new terminal runs
function terminalShell() {
  if (WIN) { const sh = which('sh'); return sh ? [sh, '-l'] : ['powershell.exe', '-NoLogo']; }
  return [shell(), '-l'];
}

// The default compilers for a new config
function defaultCompilers() {
  return BSD || WIN ? { compiler: 'clang++', cCompiler: 'clang' } : { compiler: 'g++', cCompiler: 'gcc' };
}

// Sanitizer flags this system can use. On Linux they pass through. On
// OpenBSD: address/leak/memory/thread are dropped, undefined becomes trap
// mode, and fuzzer is refused (no libFuzzer).
const NO_RUNTIME = new Set(['address', 'leak', 'memory', 'thread', 'kernel-address', 'hwaddress']);
// cc: the compiler they're for. On Windows clang has AddressSanitizer and
// UBSan but not LeakSanitizer; gcc there has no sanitizer runtimes at all,
// so it gets UBSan's trap mode, like OpenBSD.
function sanitizerFlags(flags, { platform = NAME, cc = '' } = {}) {
  if (platform === 'win32' && !/^(g\+\+|gcc|c\+\+|cc)(\.exe)?$/i.test(path.basename(cc || 'clang'))) {
    return flags.map((f) => (/^-fsanitize=/.test(f) ? '-fsanitize=' + f.slice(11).split(',').filter((k) => k !== 'leak').join(',') : f)).filter((f) => f !== '-fsanitize=');
  }
  if (platform !== 'openbsd' && platform !== 'win32') return flags;
  const out = [];
  let ub = false;
  for (const f of flags) {
    const m = f.match(/^-fsanitize=(.*)$/);
    if (!m) {
      if (/^-fsanitize-recover|^-fno-sanitize-recover/.test(f)) continue;   // meaningless in trap mode
      out.push(f);
      continue;
    }
    const kinds = m[1].split(',').filter((k) => !NO_RUNTIME.has(k));
    if (kinds.includes('fuzzer')) throw new Error(platform === 'win32' ? 'Fuzzing needs clang (the default compiler on Windows): choose clang in Settings → Build' : 'libFuzzer isn\'t available on OpenBSD: fuzz on Linux (or WSL), or try AFL++ from packages (afl++)');
    if (kinds.includes('undefined')) ub = true;
    const rest = kinds.filter((k) => k !== 'undefined');
    if (rest.length) out.push(`-fsanitize=${rest.join(',')}`);
  }
  if (ub) out.push('-fsanitize=undefined', '-fsanitize-trap=undefined');
  return out;
}
const wantsSanitizers = (flags) => flags.some((f) => /^-fsanitize=/.test(f));

// Extra environment for running a program built by the app: on OpenBSD, a
// program built with "sanitizers on" gets the strict malloc instead of ASan.
function runEnv(flags = [], { platform = NAME } = {}) {
  if (platform === 'openbsd' && wantsSanitizers(flags)) return { MALLOC_OPTIONS: 'S' };
  // Windows' AddressSanitizer has no leak checker: asking for one is an error
  if (platform === 'win32' && flags.some((f) => /^-fsanitize=.*address/.test(f))) return { ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=0' };
  return {};
}

// The same as a shell prefix, for commands typed into a terminal
function runPrefix(flags = []) {
  const env = runEnv(flags);
  return Object.entries(env).map(([k, v]) => `${k}=${v} `).join('');
}

// Windows paths as the window sees them: C:/Users/you/..., forward slashes
// (Windows takes those too), so the window's code that splits on / works.
// Only whole strings that are an absolute Windows path on one line change;
// file contents, messages and terminal output are left alone.
const WINPATH = /^[A-Za-z]:[\\/][^\n\r]*$/;
function slashes(v, depth = 0) {
  if (typeof v === 'string') return WINPATH.test(v) ? v.replace(/\\/g, '/') : v;
  if (!v || typeof v !== 'object' || depth > 12 || Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return v.map((x) => slashes(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = slashes(x, depth + 1);
  return out;
}

module.exports = { NAME, OPENBSD, BSD, WIN, gdb, shell, terminalShell, defaultCompilers, sanitizerFlags, runEnv, runPrefix, onPath, which, exe, toolsDir, toolDirs, setupPath, slashes };
