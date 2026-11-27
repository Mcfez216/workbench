'use strict';
// Terminals. Each one is a program on a pseudo-terminal. Terminals outlive
// the window: reload the UI and they're still there, with their recent
// output replayed.
//
// Two ways to get a pseudo-terminal:
//   helper    pty_helper.py (Linux, OpenBSD): needs nothing compiled
//   node-pty  @lydell/node-pty, prebuilt (Windows' ConPTY; also works on
//             Linux, where CPW_PTY=node-pty picks it, for the tests)
// On Windows without node-pty, a plain pipe: programs run and read your
// typing, but there's no line editing and full-screen programs won't draw.

const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const os = require('os');
const { expand } = require('./config');
const platform = require('./platform');

const HELPER = path.join(__dirname, 'pty_helper.py');
const REPLAY_LIMIT = 256 * 1024;
const sessions = new Map();
let nextId = 1;
let api;

function frame(kind, payload) {
  const head = Buffer.alloc(5);
  head.write(kind, 0, 'latin1');
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

let nodePty;
function loadNodePty() {
  if (nodePty !== undefined) return nodePty;
  try { nodePty = require('@lydell/node-pty'); } catch (e) { nodePty = null; }
  return nodePty;
}
function backend() {
  const want = process.env.CPW_PTY;
  if (want === 'helper' || want === 'pipe') return want;
  if ((want === 'node-pty' || platform.WIN) && loadNodePty()) return 'node-pty';
  return platform.WIN ? 'pipe' : 'helper';
}

// Each kind of terminal, behind the same small interface:
// write(text), resize(rows, cols), hangUp(), kill(); onData(fn), onExit(fn)
function startHelper(dir, program, env) {
  const proc = spawn('python3', [HELPER, dir, ...program], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const dec = new StringDecoder('utf8');
  proc.stdin.on('error', () => { /* program already gone */ });
  return {
    write: (data) => proc.stdin.write(frame('D', Buffer.from(data, 'utf8'))),
    resize: (rows, cols) => {
      const b = Buffer.alloc(4);
      b.writeUInt16BE(rows, 0); b.writeUInt16BE(cols, 2);
      proc.stdin.write(frame('R', b));
    },
    // closing stdin tells the helper to hang up on everything in the terminal
    hangUp: () => proc.stdin.end(),
    kill: (sig = 'SIGKILL') => proc.kill(sig),
    onData: (fn) => { proc.stdout.on('data', (b) => fn(dec.write(b))); proc.stderr.on('data', (b) => fn(b.toString('utf8'))); },
    onExit: (fn) => {
      proc.on('error', (err) => { fn(null, `\r\n[could not start the terminal: ${err.message}. Is python3 installed?]\r\n`); });
      proc.on('close', (code) => fn(code, dec.end()));
    },
  };
}
function startNodePty(dir, program, env, rows, cols) {
  const p = loadNodePty().spawn(program[0], program.slice(1), { name: 'xterm-256color', cwd: dir, env, rows, cols, useConpty: true });
  let done = false;
  return {
    write: (data) => p.write(data),
    resize: (r, c) => { try { p.resize(c, r); } catch (e) { /* exited */ } },
    hangUp: () => { try { p.kill(platform.WIN ? undefined : 'SIGHUP'); } catch (e) { /* gone */ } },
    kill: () => { try { p.kill(platform.WIN ? undefined : 'SIGKILL'); } catch (e) { /* gone */ } },
    onData: (fn) => p.onData(fn),
    onExit: (fn) => p.onExit(({ exitCode }) => { if (!done) { done = true; fn(exitCode, ''); } }),
  };
}
function startPipe(dir, program, env) {
  const proc = spawn(program[0], program.slice(1), { cwd: dir, env: { ...env, TERM: 'dumb' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const dec = new StringDecoder('utf8'), dec2 = new StringDecoder('utf8');
  proc.stdin.on('error', () => {});
  let echo = null;
  return {
    // no terminal to echo your typing or turn Enter into a new line: do both here
    write: (data) => { const t = data.replace(/\r/g, '\n'); if (echo) echo(t.replace(/\n/g, '\r\n')); proc.stdin.write(t); },
    resize: () => {},
    hangUp: () => proc.stdin.end(),
    kill: () => proc.kill(),
    onData: (fn) => { echo = fn; proc.stdout.on('data', (b) => fn(dec.write(b).replace(/\r?\n/g, '\r\n'))); proc.stderr.on('data', (b) => fn(dec2.write(b).replace(/\r?\n/g, '\r\n'))); },
    onExit: (fn) => {
      proc.on('error', (err) => fn(null, `\r\n[could not start ${program[0]}: ${err.message}]\r\n`));
      proc.on('close', (code) => fn(code, ''));
    },
  };
}

// hooks (from other backend modules only, never from the window): onData
// sees the output, onExit the exit code. Build uses them to spot sanitizer
// reports in a program you ran.
function open({ cwd, title, argv, rows = 24, cols = 80, env: extraEnv }, hooks) {
  const id = String(nextId++);
  const dir = expand(cwd) || os.homedir();
  const program = argv && argv.length ? argv : platform.terminalShell();
  const env = { ...process.env, ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  const kind = backend();
  const clamp = (n) => Math.max(1, Math.min(n | 0, 1000));
  let t;
  try {
    t = kind === 'node-pty' ? startNodePty(dir, program, env, clamp(rows), clamp(cols)) : kind === 'pipe' ? startPipe(dir, program, env) : startHelper(dir, program, env);
  } catch (err) {
    // node-pty throws at once if the program isn't there
    t = startPipe(dir, [process.execPath, '-e', `console.error(${JSON.stringify(`could not start ${program[0]}: ${err.message}`)}); process.exit(127)`], env);
  }
  const s = { id, title: title || path.basename(program[0]).replace(/\.exe$/i, ''), cwd: dir, t, kind, buf: '', alive: true, code: null, started: Date.now() };
  const push = (text) => {
    if (!text) return;
    s.buf = (s.buf + text).slice(-REPLAY_LIMIT);
    api.broadcast('pty.data', { id, data: text });
    if (hooks && hooks.onData) try { hooks.onData(text); } catch (e) { /* a hook never breaks the terminal */ }
  };
  t.onData(push);
  t.onExit((code, last) => {
    push(last);
    if (!s.alive) return;
    s.alive = false; s.code = code;
    api.broadcast('pty.exit', { id, code });
    if (hooks && hooks.onExit) try { hooks.onExit(code); } catch (e) { /* ignore */ }
    // You typed exit (or pressed Enter after a program ran): the tab goes,
    // like any terminal. One that died at once stays, so you can read why.
    if (Date.now() - s.started > 2000 && sessions.get(id) === s) {
      sessions.delete(id);
      api.broadcast('pty.closed', { id });
    }
  });
  sessions.set(id, s);
  if (kind === 'helper') resize({ id, rows, cols });
  api.broadcast('pty.opened', { id, title: s.title, cwd: dir });
  return { id, title: s.title, cwd: dir };
}

function write({ id, data }) {
  const s = sessions.get(String(id));
  if (!s || !s.alive) return false;
  s.t.write(data);
  return true;
}

function resize({ id, rows, cols }) {
  const s = sessions.get(String(id));
  if (!s || !s.alive) return false;
  s.t.resize(Math.max(1, Math.min(rows | 0, 1000)), Math.max(1, Math.min(cols | 0, 1000)));
  return true;
}

function close({ id }) {
  const s = sessions.get(String(id));
  if (!s) return false;
  // Hang up on everything in the terminal; the kill is in case it can't
  if (s.alive) { s.t.hangUp(); setTimeout(() => s.alive && s.t.kill(), 5000); }
  sessions.delete(String(id));
  api.broadcast('pty.closed', { id: String(id) });
  return true;
}

function list() {
  return [...sessions.values()].map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, alive: s.alive, code: s.code, replay: s.buf }));
}

function killAll() { for (const s of sessions.values()) if (s.alive) s.t.kill('SIGHUP'); }

function init(a) {
  api = a;
  a.register('pty.open', (p) => open(p));
  a.register('pty.write', write);
  a.register('pty.resize', resize);
  a.register('pty.close', close);
  a.register('pty.list', list);
  a.onExit.push(killAll);
}

module.exports = { init, open, write, close, backend };
