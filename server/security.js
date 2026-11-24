'use strict';
// The security side: what protections a program was built with (and the
// same program built three ways, to compare), fuzzing with libFuzzer, a look
// inside a binary (sections, symbols, strings, disassembly), man pages, and
// clang-tidy's secure-coding (CERT) checks. Everything runs locally on your
// own programs.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');
const { execStream, runProgram, which, hint, toolchain } = require('./build');

let api;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', ...(opts.env || {}) }, cwd: opts.cwd, timeout: opts.timeout || 30000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code === 'ENOENT' ? 127 : err.code || 1) : 0, out: stdout || '', err: stderr || (err && err.code === 'ENOENT' ? `${cmd}: not installed (${hint(cmd)})` : '') });
    });
  });
}
function isElf(file) {
  try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('latin1') === '\x7fELF'; } catch (e) { return false; }
}

// ------------------------------------------------------------------ checksec
// Each protection: is it on, what it stops, and the flag that turns it on.
const PROTECTIONS = {
  pie: { name: 'PIE (position independent)', what: 'The program loads at a random address each run (ASLR), so an attacker can\'t know where its code is.', how: '-fPIE -pie (most distributions do this by default)' },
  nx: { name: 'NX (non-executable stack)', what: 'Data on the stack can\'t be run as code, so injected bytes in a buffer won\'t execute.', how: '-Wl,-z,noexecstack (the default; -z execstack turns it off)' },
  canary: { name: 'Stack canary', what: 'A secret value next to the return address; a stack overflow changes it and the program stops before returning.', how: '-fstack-protector-strong' },
  relro: { name: 'RELRO', what: 'Makes the tables of library function addresses (the GOT) read-only after start-up, so they can\'t be overwritten to hijack calls. "Full" does it for all of them.', how: '-Wl,-z,relro,-z,now (full)' },
  fortify: { name: 'FORTIFY_SOURCE', what: 'memcpy, strcpy, sprintf... get checked versions that stop a copy too big for a buffer the compiler can see the size of.', how: '-D_FORTIFY_SOURCE=3 with optimisation (-O1 or more)' },
  sanitizers: { name: 'Sanitizers', what: 'AddressSanitizer / UBSan built in: for finding bugs while you develop, not for shipping (they make a program bigger and slower).', how: '-fsanitize=address,undefined (Debug builds)' },
  symbols: { name: 'Debug symbols / not stripped', what: 'Names and line numbers are in the binary: great for gdb, and for anyone reverse-engineering it.', how: '-g adds them; strip removes them' },
};

async function checksec({ exe }) {
  const f = config.expand(exe);
  if (!fs.existsSync(f)) throw new Error(`${path.basename(f)} isn't built yet`);
  if (!isElf(f)) throw new Error(`${path.basename(f)} isn't a Linux program (ELF)`);
  const [h, l, d, s] = await Promise.all([run('readelf', ['-W', '-h', f]), run('readelf', ['-W', '-l', f]), run('readelf', ['-W', '-d', f]), run('readelf', ['-W', '-s', f])]);
  if (h.code === 127) throw new Error(h.err);
  const type = (h.out.match(/Type:\s+(\w+)/) || [])[1] || '?';
  const stack = (l.out.match(/GNU_STACK\s+(?:\S+\s+){5}(\S+)/) || [])[1] || '';
  const relro = /GNU_RELRO/.test(l.out);
  const now = /\(FLAGS\).*BIND_NOW|\(FLAGS_1\).*NOW/.test(d.out) || /\(BIND_NOW\)/.test(d.out);
  const pieFlag = /\(FLAGS_1\).*PIE/.test(d.out);
  const sym = s.out;
  const chk = [...new Set((sym.match(/__\w+_chk\b/g) || []))];
  const out = {
    pie: { on: type === 'DYN' && (pieFlag || /INTERP/.test(l.out)), state: type === 'DYN' ? 'on' : 'off' },
    nx: { on: !/E/.test(stack), state: /E/.test(stack) ? 'off (stack is executable)' : 'on' },
    canary: { on: /__stack_chk_fail/.test(sym), state: /__stack_chk_fail/.test(sym) ? 'on' : 'off' },
    relro: { on: relro && now, state: relro ? (now ? 'full' : 'partial') : 'off' },
    fortify: { on: chk.length > 0, state: chk.length ? `on (${chk.slice(0, 4).join(', ')}${chk.length > 4 ? '...' : ''})` : 'off (or nothing to check)' },
    sanitizers: { on: /__asan_init|__ubsan_handle/.test(sym), state: /__asan_init/.test(sym) ? 'ASan' + (/__ubsan_handle/.test(sym) ? ' + UBSan' : '') : /__ubsan_handle/.test(sym) ? 'UBSan' : 'none' },
    symbols: { on: /\.debug_info|\.symtab/.test(await run('readelf', ['-W', '-S', f]).then((r) => r.out)), state: '' },
  };
  out.symbols.state = out.symbols.on ? 'present' : 'stripped';
  return { exe: f, type, items: Object.entries(out).map(([id, v]) => ({ id, ...PROTECTIONS[id], ...v })) };
}

// The same source three ways: what each flag changes
const VARIANTS = [
  { id: 'off', label: 'Everything off', flags: ['-O0', '-fno-stack-protector', '-no-pie', '-fno-pie', '-U_FORTIFY_SOURCE', '-D_FORTIFY_SOURCE=0', '-z', 'execstack', '-Wl,-z,norelro'] },
  { id: 'default', label: 'Your compiler\'s defaults', flags: ['-O2'] },
  { id: 'hardened', label: 'Hardened', flags: ['-O2', '-U_FORTIFY_SOURCE', '-D_FORTIFY_SOURCE=3', '-fstack-protector-strong', '-fstack-clash-protection', '-fcf-protection', '-fPIE', '-pie', '-Wl,-z,relro,-z,now', '-Wl,-z,noexecstack'] },
];
async function compare({ source, lang = 'c' }) {
  const tc = toolchain(lang === 'c' ? 'c' : 'cpp');
  const dir = path.join(path.dirname(config.dataPath('hardening', 'x')));
  const src = path.join(dir, lang === 'c' ? 'prog.c' : 'prog.cpp');
  fs.writeFileSync(src, source);
  const out = [];
  for (const v of VARIANTS) {
    const exe = path.join(dir, `prog-${v.id}`);
    try { fs.rmSync(exe); } catch (e) { /* first time */ }
    const r = await execStream({ cmd: tc.cc, args: [`-std=${tc.std}`, ...v.flags, '-o', exe, src], cwd: dir, quiet: true, title: `hardening: ${v.label}` });
    if (r.code !== 0) { out.push({ ...v, ok: false, error: r.output.slice(0, 1500) }); continue; }
    const size = fs.statSync(exe).size;
    out.push({ ...v, ok: true, exe, size, checks: (await checksec({ exe })).items });
  }
  return { compiler: tc.cc, variants: out };
}

// ------------------------------------------------------------------ fuzzing
// A fuzz target is a function libFuzzer calls with generated inputs:
//   int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
// It's built with clang, ASan and UBSan, together with the other source
// files next to it (any that don't have their own main).
const FUZZ_FN = /\bLLVMFuzzerTestOneInput\s*\(/;
async function fuzz({ file, source, lang, seconds = 30 }) {
  let dir, target, others = [];
  if (source !== undefined) {
    dir = path.dirname(config.dataPath('sandbox', 'x'));
    target = path.join(dir, lang === 'cpp' ? 'fuzz.cpp' : 'fuzz.c');
    fs.writeFileSync(target, source);
  } else {
    target = config.expand(file);
    dir = path.dirname(target);
    const text = fs.readFileSync(target, 'utf8');
    if (!FUZZ_FN.test(text)) throw new Error(`${path.basename(target)} has no LLVMFuzzerTestOneInput: Security → New fuzz target makes one`);
    const ext = /\.c$/.test(target) ? /\.c$/ : /\.(cpp|cc|cxx)$/;
    others = fs.readdirSync(dir).filter((n) => ext.test(n) && path.join(dir, n) !== target).map((n) => path.join(dir, n))
      .filter((f) => { const t = fs.readFileSync(f, 'utf8'); return !/\bint\s+main\s*\(/.test(t) && !FUZZ_FN.test(t); });
  }
  const isC = /\.c$/.test(target);
  const cc = isC ? 'clang' : 'clang++';
  if (!which(cc)) throw new Error(`Fuzzing needs clang (${hint('clang')})`);
  const name = path.basename(target).replace(/\.\w+$/, '');
  const work = path.join(dir, '.fuzz');
  const crashes = path.join(work, `crashes-${name}`);
  const corpus = path.join(work, `corpus-${name}`);
  fs.mkdirSync(crashes, { recursive: true });
  fs.mkdirSync(corpus, { recursive: true });
  const exe = path.join(work, name);
  require('./platform').sanitizerFlags(['-fsanitize=fuzzer']);   // says why there's no fuzzing on OpenBSD
  const b = await execStream({ cmd: cc, args: [isC ? `-std=${toolchain('c').std}` : `-std=${toolchain('cpp').std}`, '-g', '-O1', '-fsanitize=fuzzer,address,undefined', '-fno-sanitize-recover=all', '-I', dir, '-o', exe, target, ...others], cwd: dir, title: `fuzz: build ${path.basename(target)}` });
  if (b.code !== 0) {
    if (/libclang_rt\.(fuzzer|asan)/.test(b.output)) throw new Error(`clang's fuzzing library is missing: ${require('./distro').installHint('libclang-rt')}`);
    return { ok: false, ...b, output: undefined };
  }
  const secs = Math.max(5, Math.min(600, +seconds || 30));
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const term = runProgram({ cwd: dir, title: `fuzz: ${name}`, command: `${q(exe)} -max_total_time=${secs} -use_value_profile=1 -print_final_stats=1 -artifact_prefix=${q(crashes + '/')} ${q(corpus)}; echo; echo "Crashing inputs are kept in ${crashes.replace(/"/g, '')}. Run one again: ${exe.replace(/"/g, '')} <file>"` });
  return { ok: true, ...b, output: undefined, terminal: term, exe, crashes, corpus, target, seconds: secs };
}

// What a fuzzer found: the inputs, as hex and text
function crashes({ file, source, lang }) {
  const dir = source !== undefined ? path.dirname(config.dataPath('sandbox', 'x')) : path.dirname(config.expand(file));
  const name = source !== undefined ? 'fuzz' : path.basename(file).replace(/\.\w+$/, '');
  const d = path.join(dir, '.fuzz', `crashes-${name}`);
  let names = [];
  try { names = fs.readdirSync(d); } catch (e) { return { dir: d, crashes: [] }; }
  return {
    dir: d,
    exe: path.join(dir, '.fuzz', name),
    crashes: names.map((n) => {
      const f = path.join(d, n);
      const buf = fs.readFileSync(f).subarray(0, 256);
      const hex = [];
      for (let i = 0; i < buf.length; i += 16) {
        const row = buf.subarray(i, i + 16);
        hex.push(`${i.toString(16).padStart(4, '0')}  ${[...row].map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(47)}  ${[...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
      }
      return { file: f, name: n, size: fs.statSync(f).size, kind: n.split('-')[0], hex: hex.join('\n'), mtime: fs.statSync(f).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime),
  };
}

// A fuzz target to start from, for a function you name
function fuzzTemplate({ file, func, signature = '' }) {
  const f = config.expand(file);
  const dir = path.dirname(f);
  const isC = /\.(c|h)$/.test(f);
  const fn = String(func || '').replace(/[^\w:]/g, '');
  if (!fn) throw new Error('Put the cursor in the function to fuzz first');
  const params = (signature.match(/\((.*)\)/) || [])[1] || '';
  const header = fs.existsSync(f.replace(/\.(c|cpp|cc)$/, '.h')) ? path.basename(f.replace(/\.(c|cpp|cc)$/, '.h')) : fs.existsSync(f.replace(/\.(c|cpp|cc)$/, '.hpp')) ? path.basename(f.replace(/\.(c|cpp|cc)$/, '.hpp')) : null;
  let call;
  if (/(const\s+)?(char|uint8_t|unsigned char)\s*\*\s*\w*\s*,\s*size_t/.test(params)) call = `${fn}((const void *)data, size);`.replace('(const void *)data', /char/.test(params) ? '(const char *)data' : 'data');
  else if (/^\s*(const\s+)?char\s*\*\s*\w*\s*$/.test(params)) call = `/* the function wants a C string: make one that ends in '\\0' */\n    char *s = malloc(size + 1);\n    if (!s) return 0;\n    memcpy(s, data, size);\n    s[size] = '\\0';\n    ${fn}(s);\n    free(s);`;
  else call = `/* TODO: turn data/size into arguments for ${fn}(${params}) and call it */\n    (void)data; (void)size;`;
  const ext = isC ? 'c' : 'cpp';
  const out = path.join(dir, `fuzz_${fn.replace(/::/g, '_')}.${ext}`);
  if (fs.existsSync(out)) return { file: out, existed: true };
  const text = `/* A fuzz target for ${fn}: libFuzzer calls this function over and over with
 * generated inputs, keeping the ones that reach new code, until a sanitizer
 * catches a crash. Security -> Fuzz this file (it builds with clang). */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
${header ? `#include "${header}"\n` : `\n/* the function under test (or #include its header) */\n${signature ? signature.replace(/\s*\{?\s*$/, '') + ';' : `/* declare ${fn} here */`}\n`}
${isC ? '' : 'extern "C" '}int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    ${call}
    return 0;   /* always 0: a crash is how a bug is reported */
}
`;
  fs.writeFileSync(out, text);
  return { file: out, existed: false };
}

// ------------------------------------------------------------------ inside a binary
async function inspect({ exe, what = 'overview', symbol }) {
  const f = config.expand(exe);
  if (!fs.existsSync(f)) throw new Error(`${path.basename(f)} isn't there (build it first)`);
  if (!isElf(f)) throw new Error(`${path.basename(f)} isn't a Linux program (ELF)`);
  if (what === 'overview') {
    const h = await run('readelf', ['-W', '-h', f]);
    const pick = (k) => ((h.out.match(new RegExp(`${k}:\\s+(.*)`)) || [])[1] || '').trim();
    const libs = ((await run('readelf', ['-W', '-d', f])).out.match(/Shared library: \[([^\]]+)\]/g) || []).map((x) => x.slice(16, -1));
    return { exe: f, size: fs.statSync(f).size, class: pick('Class'), machine: pick('Machine'), type: pick('Type'), entry: pick('Entry point address'), libs, checksec: (await checksec({ exe: f })).items };
  }
  if (what === 'sections') {
    const r = await run('readelf', ['-W', '-S', f]);
    const rows = [];
    for (const l of r.out.split('\n')) {
      const m = l.match(/^\s*\[\s*\d+\]\s+(\S+)\s+(\S+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+\S+\s+([A-Z]*)/);
      if (m && m[1] !== 'NULL') rows.push({ name: m[1], type: m[2], addr: m[3], size: parseInt(m[5], 16), flags: m[6] });
    }
    return { rows };
  }
  if (what === 'symbols') {
    const r = await run('nm', ['-n', '--defined-only', f]);
    const raw = [];
    for (const l of r.out.split('\n')) { const m = l.match(/^([0-9a-f]+)\s+([A-Za-z])\s+(.+)$/); if (m) raw.push({ addr: m[1], type: m[2], name: m[3] }); }
    const dem = await new Promise((resolve) => {
      const p = require('child_process').spawn('c++filt');
      let o = '';
      p.stdout.on('data', (b) => { o += b; });
      p.on('error', () => resolve(raw.map((x) => x.name)));
      p.on('close', () => resolve(o.split('\n')));
      p.stdin.end(raw.map((x) => x.name).join('\n'));
    });
    const KIND = { T: 'code', t: 'code', D: 'data', d: 'data', B: 'zeroed data', b: 'zeroed data', R: 'read-only data', r: 'read-only data', W: 'code (weak)', V: 'data (weak)' };
    return { rows: raw.map((x, i) => ({ ...x, pretty: dem[i] || x.name, kind: KIND[x.type] || x.type })).filter((x) => KIND[x.type] && !/^(_init|_fini|_start|__libc|_IO_|__TMC|__dso|__bss|__data|_edata|_end|__GNU|_DYNAMIC|_GLOBAL)/.test(x.name)) };
  }
  if (what === 'strings') {
    const r = await run('strings', ['-a', '-n', '5', '-t', 'x', f]);
    return { rows: r.out.split('\n').filter(Boolean).slice(0, 3000).map((l) => { const m = l.match(/^\s*([0-9a-f]+)\s(.*)$/); return m ? { offset: m[1], text: m[2] } : { offset: '', text: l }; }) };
  }
  if (what === 'disasm') {
    const args = ['-d', '-M', 'intel', '-C', '--no-show-raw-insn', '-w'];
    if (symbol) args.push(`--disassemble=${symbol}`);
    const r = await run('objdump', [...args, f], { timeout: 60000 });
    const text = r.out.split('\n').filter((l) => !/^(\S+:\s+file format|Disassembly of section)/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { text: text.slice(0, 400000) || r.err || `No code for ${symbol}`, symbol: symbol || null };
  }
  throw new Error(`Unknown view ${what}`);
}

// Programs worth looking at, near a file: built single files, the CMake
// project's programs, the sandbox's, the exercises' puzzles
async function binaries({ file }) {
  const out = [];
  const add = (p, label) => { if (p && fs.existsSync(p) && isElf(p) && !out.some((x) => x.path === p)) out.push({ path: p, label: label || path.basename(p) }); };
  if (file) {
    const f = config.expand(file);
    add(f.replace(/\.[^./]+$/, ''), `${path.basename(f).replace(/\.[^./]+$/, '')} (this file, built on its own)`);
    try { for (const n of fs.readdirSync(path.dirname(f))) { const p = path.join(path.dirname(f), n); try { if (fs.statSync(p).isFile() && fs.statSync(p).mode & 0o111) add(p); } catch (e) { /* gone */ } } } catch (e) { /* no dir */ }
    const cmake = require('./cmake');
    const root = cmake.cmakeRoot(f);
    if (root) { const m = cmake.readModel(root); if (m) for (const t of m.targets) if (t.type === 'executable') add(t.artifact, `${t.name} (CMake)`); }
  }
  const sb = path.dirname(config.dataPath('sandbox', 'x'));
  add(path.join(sb, 'scratch'), 'scratch (the sandbox)');
  for (const v of VARIANTS) add(path.join(path.dirname(config.dataPath('hardening', 'x')), `prog-${v.id}`), `hardening: ${v.label}`);
  return { binaries: out };
}

// ------------------------------------------------------------------ man pages, CERT checks
async function man({ page }) {
  const args = String(page || '').trim().split(/\s+/).filter((a) => /^[\w.+:-]+$/.test(a)).slice(0, 2);
  if (!args.length) throw new Error('Which page?');
  const r = await run('man', args, { env: { MANWIDTH: '88', MANPAGER: 'cat', PAGER: 'cat', MAN_KEEP_FORMATTING: '' } });
  if (r.code === 127) throw new Error(r.err);
  if (/has been minimized/.test(r.out)) throw new Error('This system\'s manual pages were removed to save space (a minimal Ubuntu). sudo unminimize puts them back; or install manpages-dev for the C library pages.');
  if (!r.out.trim()) throw new Error(`No manual page for ${args.join(' ')}${/man-db|minimized/.test(r.err) ? ' (this system\'s man pages were removed: sudo unminimize, or install manpages-dev)' : ''}`);
  // man's bold/underline is backspace overstrike: plain text
  return { page: args.join(' '), text: r.out.replace(/.\x08/g, '') };
}

const CERT = 'cert-*,clang-analyzer-security.*,bugprone-*,-bugprone-easily-swappable-parameters,clang-analyzer-unix.*,clang-analyzer-core.*';
function cert({ file }) { return require('./build').tidy({ file, checks: CERT }); }

function init(a) {
  api = a;
  a.register('security.checksec', checksec);
  a.register('security.compare', compare);
  a.register('security.fuzz', fuzz);
  a.register('security.crashes', crashes);
  a.register('security.fuzzTemplate', fuzzTemplate);
  a.register('security.inspect', inspect);
  a.register('security.binaries', binaries);
  a.register('security.cert', cert);
  a.register('man.page', man);
}

module.exports = { init, checksec, isElf };
