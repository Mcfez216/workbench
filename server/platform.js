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
// WORKBENCH_PLATFORM=openbsd pretends, for the tests.

const fs = require('fs');
const path = require('path');

const NAME = process.env.WORKBENCH_PLATFORM || process.platform;
const OPENBSD = NAME === 'openbsd';
const BSD = /bsd$/.test(NAME);

function onPath(cmd) {
  for (const d of (process.env.PATH || '').split(':')) {
    if (!d) continue;
    try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch (e) { /* next */ }
  }
  return false;
}

// gdb, or the packaged one on OpenBSD (egdb)
function gdb() {
  if (onPath('gdb')) return 'gdb';
  if (onPath('egdb')) return 'egdb';
  return 'gdb';
}

// A shell to run commands in: yours, else bash where there is one, else sh
function shell() {
  if (process.env.SHELL) return process.env.SHELL;
  return fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
}

// The default compilers for a new config
function defaultCompilers() {
  return BSD ? { compiler: 'clang++', cCompiler: 'clang' } : { compiler: 'g++', cCompiler: 'gcc' };
}

// Sanitizer flags this system can use. On Linux they pass through. On
// OpenBSD: address/leak/memory/thread are dropped, undefined becomes trap
// mode, and fuzzer is refused (no libFuzzer).
const NO_RUNTIME = new Set(['address', 'leak', 'memory', 'thread', 'kernel-address', 'hwaddress']);
function sanitizerFlags(flags, { platform = NAME } = {}) {
  if (platform !== 'openbsd') return flags;
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
    if (kinds.includes('fuzzer')) throw new Error('libFuzzer isn\'t available on OpenBSD: fuzz on Linux (or WSL), or try AFL++ from packages (afl++)');
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
  return {};
}

// The same as a shell prefix, for commands typed into a terminal
function runPrefix(flags = []) {
  const env = runEnv(flags);
  return Object.entries(env).map(([k, v]) => `${k}=${v} `).join('');
}

module.exports = { NAME, OPENBSD, BSD, gdb, shell, defaultCompilers, sanitizerFlags, runEnv, runPrefix, onPath };
