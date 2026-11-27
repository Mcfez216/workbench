'use strict';
// The visual debugger: breakpoints in the margin, step over / into / out,
// the variables of the function you're in, the call stack, and watches.
// For C, C++ and Rust, through gdb's machine interface (rust-gdb for Rust,
// so a Vec or a String shows its contents; egdb on OpenBSD; w64devkit's gdb
// on Windows).
//
// The program's own input and output go to a terminal tab of their own, so
// std::cin and scanf work while you debug: gdb is told to use that
// terminal (-inferior-tty-set). On Windows the program gets its own console
// window instead (gdb's new-console).
//
// A crash stops in the debugger instead of ending the program: a segfault
// stops on the line that did it; AddressSanitizer is told to abort, so its
// report stops there too; a Rust panic stops at rust_panic, and the window
// shows your line, not the runtime's. Stepping doesn't wander into the
// standard library.

const fs = require('fs');
const os = require('os');
const { Gdb } = require('./mi');
const platform = require('./platform');

let api;
let s = null;                       // the session (one at a time)
const bps = new Map();              // file -> [line, ...]: the window's breakpoints
let watches = [];                   // expressions to show at every stop

const mi = (x) => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const short = (v, n = 400) => { const t = v == null ? '' : String(v); return t.length > n ? `${t.slice(0, n)}…` : t; };
const norm = (f) => String(f || '').replace(/\\/g, '/');

// Is a frame in someone else's code (the standard library, the Rust runtime)?
function libraryFrame(f) {
  const p = norm(f.fullname || f.file || '');
  if (!p) return true;
  if (/^\/usr\/(include|lib|share)\/|\/rustc\/|\/lib\/rustlib\/|\/include\/c\+\+\/|libstdc\+\+|\/libcxx\/|\/mingw\/include\//.test(p)) return true;
  return !fs.existsSync(f.fullname || f.file);
}

// What gdb shouldn't step into, so Step into (F11) stays in your code
function skips(lang) {
  if (lang === 'rust') return ['skip -rfu ^core::', 'skip -rfu ^alloc::', 'skip -rfu ^std::', 'skip -rfu ^<'];
  return ['skip -gfi /usr/include/*', 'skip -gfi /usr/include/*/*', 'skip -gfi /usr/include/*/*/*', 'skip -gfi /usr/include/c++/*/*', 'skip -gfi /usr/include/c++/*/bits/*', 'skip -rfu ^std::'];
}

// A terminal tab whose tty the program uses for stdin and stdout
function ttyTerminal(title) {
  if (platform.WIN) return Promise.resolve(null);
  const pty = require('./pty');
  return new Promise((resolve) => {
    let buf = '', done = false, t = null;
    const finish = (tty) => { if (!done) { done = true; resolve(t ? { id: t.id, tty } : null); } };
    t = pty.open({ cwd: os.homedir(), title, argv: ['/bin/sh', '-c', 'printf "MHDE_TTY=%s\\n" "$(tty)"; printf "(The program you are debugging reads and writes here.)\\n"; exec sleep 2147483647'] },
      { onData: (d) => { buf += d; const m = /MHDE_TTY=(\/dev\/[^\s]+)/.exec(buf); if (m) finish(m[1]); } });
    setTimeout(() => finish(null), 4000);
  });
}

function signalWords(name, meaning) {
  if (name === 'SIGSEGV') return 'The program crashed: a segmentation fault. It used memory it doesn\'t own (a NULL, freed or wild pointer). The highlighted line did it.';
  if (name === 'SIGABRT') return 'The program stopped itself (abort). If AddressSanitizer or UBSan found a bug, its report is in the program\'s terminal; the call stack shows where.';
  if (name === 'SIGFPE') return 'The program crashed: an arithmetic error, usually dividing by zero.';
  if (name === 'SIGILL') return 'The program stopped on an illegal instruction: on OpenBSD and Windows, that\'s how UBSan reports undefined behaviour.';
  if (name === 'SIGINT' || name === 'SIGTRAP' || name === '0') return 'Paused.';
  return `The program got ${name} (${meaning || 'a signal'}).`;
}

async function insertBreakpoints(file) {
  if (!s) return;
  const old = s.numbers.filter((b) => b.file === file);
  if (old.length) await s.g.cmd(`-break-delete ${old.map((b) => b.number).join(' ')}`).catch(() => {});
  s.numbers = s.numbers.filter((b) => b.file !== file);
  for (const line of bps.get(file) || []) {
    try {
      const r = await s.g.cmd(`-break-insert -f ${mi(`${norm(file)}:${line}`)}`);
      s.numbers.push({ number: r.bkpt && r.bkpt.number, file, line, actual: r.bkpt && +r.bkpt.line });
    } catch (e) { /* a line with no code: gdb says so; it just isn't set */ }
  }
}

async function frames() {
  const r = await s.g.cmd('-stack-list-frames 0 40').catch(() => ({ stack: [] }));
  return (r.stack || []).map((f) => ({ level: +f.level, func: f.func || '??', file: f.fullname || f.file || '', short: f.file || '', line: +f.line || 0, library: libraryFrame(f) }));
}

async function variables() {
  const [typed, full] = await Promise.all([
    s.g.cmd('-stack-list-variables --simple-values').catch(() => ({ variables: [] })),
    s.g.cmd('-stack-list-variables --all-values').catch(() => ({ variables: [] })),
  ]);
  const types = new Map((typed.variables || []).map((v) => [v.name, v.type]));
  // the compiler's own helpers (__for_range, __for_begin...) aren't yours
  return (full.variables || []).filter((v) => !/^__/.test(v.name)).map((v) => ({ name: v.name, type: types.get(v.name) || '', value: short(v.value), arg: v.arg === '1' }));
}

async function evalAll() {
  const out = [];
  for (const expr of watches) {
    try { const r = await s.g.cmd(`-data-evaluate-expression ${mi(expr)}`); out.push({ expr, value: short(r.value) }); }
    catch (e) { out.push({ expr, error: e.message.replace(/^No symbol "(.*)" in current context\.$/, '$1 isn\'t defined here') }); }
  }
  return out;
}

// Everything the window shows when the program is paused
async function report(reason, extra = {}) {
  const fs_ = await frames();
  const panic = fs_.some((f) => /rust_panic|rust_begin_unwind|panic_fmt/.test(f.func));
  let level = s.level;
  if (level == null) {
    level = 0;
    if (fs_[0] && fs_[0].library) { const mine = fs_.find((f) => !f.library); if (mine) level = mine.level; }
  }
  if (level) await s.g.cmd(`-stack-select-frame ${level}`).catch(() => {});
  const at = fs_.find((f) => f.level === level) || fs_[0] || {};
  const vars = await variables();
  const watched = await evalAll();
  s.paused = { reason: panic ? 'The program panicked. The highlighted line is where; the panic message is in the program\'s terminal.' : reason, file: at.file, line: at.line, func: at.func, frames: fs_, level, locals: vars, watches: watched, ...extra };
  api.broadcast('dbg.paused', s.paused);
}

async function onStopped(d) {
  if (!s) return;
  const why = d.reason || '';
  if (/^exited/.test(why)) {
    const code = why === 'exited-normally' ? 0 : why === 'exited' ? parseInt(d['exit-code'] || '0', 8) : null;
    const msg = why === 'exited-signalled' ? `The program was killed by ${d['signal-name']}.` : `The program finished (exit code ${code}).`;
    return end(msg, code);
  }
  // Step into over a line whose only calls are library code (skipped)
  // stops on the same line again: step once more, so F11 moves on
  const at = d.frame || {};
  if (s.stepFrom && /end-stepping-range|function-finished/.test(why) && at.line === s.stepFrom.line && at.func === s.stepFrom.func && s.stepFrom.tries < 3) {
    s.stepFrom.tries++;
    s.g.cmd('-exec-step').catch(() => {});
    return;
  }
  s.stepFrom = null;
  s.running = false;
  s.level = null;
  // let breakpoints changed while it ran take effect
  for (const f of s.pending) await insertBreakpoints(f);
  s.pending.clear();
  let reason = 'Paused.';
  if (why === 'breakpoint-hit') reason = 'Stopped at a breakpoint.';
  else if (why === 'end-stepping-range') reason = 'Stepped.';
  else if (why === 'function-finished') reason = d['return-value'] != null ? `Returned from the function. It gave back ${short(d['return-value'], 120)}.` : 'Returned from the function.';
  else if (why === 'location-reached') reason = 'Reached the line.';
  else if (why === 'signal-received') reason = signalWords(d['signal-name'], d['signal-meaning']);
  if (s.first && why === 'breakpoint-hit' && d.disp === 'del') reason = 'Paused at the start. Click left of a line number to add a breakpoint, then Continue (F5).';
  s.first = false;
  await report(reason, { crashed: why === 'signal-received' && !/SIGINT|SIGTRAP/.test(d['signal-name'] || '') });
}

let lastTerm = null;                 // the last program terminal: closed when the next session starts
async function start({ file, line, root, target, args = '', breakpoints }) {
  await stop({ quiet: true });
  if (lastTerm) { try { require('./pty').close({ id: lastTerm }); } catch (e) { /* gone */ } lastTerm = null; }
  if (breakpoints) for (const [f, lines] of Object.entries(breakpoints)) bps.set(f, lines);
  const r = await require('./cmake').debug({ file, line, root, target, args, prepare: true });
  if (!r.ok) return r;
  const term = await ttyTerminal(`program: ${r.target}`);
  if (term) lastTerm = term.id;
  const env = { ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=1', UBSAN_OPTIONS: 'print_stacktrace=1', RUST_BACKTRACE: '0' };
  const me = { numbers: [], pending: new Set(), running: false, first: true, level: null, term, lang: r.lang, target: r.target };
  s = me;
  me.g = new Gdb(null, r.cwd, {
    gdb: r.gdb, env,
    onRecord: (kind, body) => {
      if (s !== me) return;
      if (kind === 'stopped') onStopped(body).catch((e) => api.broadcast('dbg.error', { message: e.message }));
      else if (kind === 'running') { me.running = true; api.broadcast('dbg.running', {}); }
    },
    onStream: (text) => { if (s === me && text.trim()) api.broadcast('dbg.console', { text }); },
    onTarget: (text) => { if (s === me) api.broadcast('dbg.output', { text }); },
    onExit: () => { if (s === me) end('The debugger stopped.'); },
  });
  try {
    const g = me.g;
    await g.cmd('-gdb-set pagination off');
    await g.cmd('-gdb-set confirm off');
    await g.cmd('-gdb-set print elements 64');
    await g.cmd('-gdb-set print repeats 10');
    await g.cmd(`-file-exec-and-symbols ${mi(norm(r.exe))}`);
    if (args) await g.cmd(`-exec-arguments ${args}`);
    if (term && term.tty) await g.cmd(`-inferior-tty-set ${term.tty}`);
    if (platform.WIN) await g.cmd('-gdb-set new-console on').catch(() => {});
    for (const k of skips(r.lang)) await g.cmd(`-interpreter-exec console ${mi(k)}`).catch(() => {});
    for (const f of bps.keys()) await insertBreakpoints(f);
    // every Rust panic goes through panic_fmt (rust_panic's name moves between versions)
    if (r.lang === 'rust') for (const f of ['core::panicking::panic_fmt', 'rust_panic']) await g.cmd(`-break-insert -f ${mi(f)}`).catch(() => {});
    // no breakpoints you set: stop at the start of main
    if (!me.numbers.length) await g.cmd(`-break-insert -t ${r.mainBreak}`);
    api.broadcast('dbg.started', { target: r.target, terminal: term ? term.id : null, lang: r.lang });
    await g.cmd('-exec-run');
  } catch (e) {
    await end(`The debugger couldn't start: ${e.message}`);
    return { ok: false, code: 1, problems: [], error: e.message };
  }
  return { ok: true, target: r.target, terminal: term ? term.id : null, code: 0, problems: r.problems || [] };
}

async function end(message, code = null) {
  const me = s;
  if (!me) return;
  s = null;
  try { me.g.kill(); } catch (e) { /* gone */ }
  api.broadcast('dbg.ended', { message, code, terminal: me.term ? me.term.id : null });
}

async function stop({ quiet } = {}) {
  if (!s) return { ok: true };
  await end(quiet ? '' : 'Stopped.');
  return { ok: true };
}

function needPaused() {
  if (!s) throw new Error('Not debugging: press Debug (Ctrl+Shift+D) first');
  if (s.running) throw new Error('The program is running: Pause first');
}

async function resume({ how = 'continue' }) {
  needPaused();
  const cmd = { continue: '-exec-continue', next: '-exec-next', step: '-exec-step', finish: '-exec-finish' }[how];
  if (!cmd) throw new Error(`Unknown step ${how}`);
  // stepping from a library frame you were looking at: step from your own
  if (s.level) await s.g.cmd(`-stack-select-frame ${s.level}`).catch(() => {});
  s.stepFrom = how === 'step' && s.paused && !s.level ? { line: String(s.paused.line), func: s.paused.func, tries: 0 } : null;
  try { await s.g.cmd(cmd); } catch (e) {
    if (/outermost frame/.test(e.message)) throw new Error('This is main: there\'s nothing to return to. Use Continue or Step over.');
    throw e;
  }
  return { ok: true };
}

async function runTo({ file, line }) {
  needPaused();
  await s.g.cmd(`-break-insert -t ${mi(`${norm(file)}:${line}`)}`);
  await s.g.cmd('-exec-continue');
  return { ok: true };
}

async function pause() {
  if (!s || !s.running) return { ok: false };
  await s.g.cmd('-exec-interrupt').catch(() => {});
  return { ok: true };
}

async function setBreakpoints({ file, lines }) {
  const list = [...new Set((lines || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
  if (list.length) bps.set(file, list); else bps.delete(file);
  if (s) { if (s.running) s.pending.add(file); else await insertBreakpoints(file); }
  return { ok: true, file, lines: list, actual: s ? s.numbers.filter((b) => b.file === file).map((b) => b.actual || b.line) : list };
}

async function selectFrame({ level }) {
  needPaused();
  s.level = +level;
  await report(s.paused ? s.paused.reason : 'Paused.', { crashed: s.paused && s.paused.crashed });
  return { ok: true };
}

async function setWatches({ list }) {
  watches = (list || []).map(String).filter((x) => x.trim()).slice(0, 30);
  if (s && !s.running && s.paused) { s.paused.watches = await evalAll(); api.broadcast('dbg.paused', s.paused); }
  return { ok: true, watches };
}

async function evaluate({ expr }) {
  needPaused();
  try { const r = await s.g.cmd(`-data-evaluate-expression ${mi(expr)}`); return { value: short(r.value, 2000) }; }
  catch (e) { return { error: e.message }; }
}

function state() {
  return { active: !!s, running: !!(s && s.running), paused: s && !s.running ? s.paused || null : null, breakpoints: Object.fromEntries(bps), watches, terminal: s && s.term ? s.term.id : null };
}

function init(a) {
  api = a;
  a.register('dbg.start', start);
  a.register('dbg.stop', stop);
  a.register('dbg.resume', resume);
  a.register('dbg.runTo', runTo);
  a.register('dbg.pause', pause);
  a.register('dbg.setBreakpoints', setBreakpoints);
  a.register('dbg.selectFrame', selectFrame);
  a.register('dbg.setWatches', setWatches);
  a.register('dbg.evaluate', evaluate);
  a.register('dbg.state', state);
  a.onExit.push(() => { if (s) try { s.g.kill(); } catch (e) { /* gone */ } });
}

module.exports = { init, libraryFrame };
