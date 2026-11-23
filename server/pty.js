'use strict';
// Terminals. Each one is a program on a pseudo-terminal, run through
// pty_helper.py. Terminals outlive the window: reload the UI and they're
// still there, with their recent output replayed.

const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const os = require('os');
const { expand } = require('./config');

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

// hooks (from other backend modules only, never from the window): onData
// sees the output, onExit the exit code. Build uses them to spot sanitizer
// reports in a program you ran.
function open({ cwd, title, argv, rows = 24, cols = 80, env: extraEnv }, hooks) {
  const id = String(nextId++);
  const shell = process.env.SHELL || '/bin/bash';
  const dir = expand(cwd) || os.homedir();
  const program = argv && argv.length ? argv : [shell, '-l'];
  const env = { ...process.env, ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn('python3', [HELPER, dir, ...program], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { id, title: title || path.basename(program[0]), cwd: dir, proc, buf: '', alive: true, code: null, started: Date.now() };
  const dec = new StringDecoder('utf8');
  const push = (text) => {
    if (!text) return;
    s.buf = (s.buf + text).slice(-REPLAY_LIMIT);
    api.broadcast('pty.data', { id, data: text });
    if (hooks && hooks.onData) try { hooks.onData(text); } catch (e) { /* a hook never breaks the terminal */ }
  };
  proc.stdout.on('data', (b) => push(dec.write(b)));
  proc.stderr.on('data', (b) => push(b.toString('utf8')));
  proc.on('error', (err) => push(`\r\n[could not start the terminal: ${err.message}. Is python3 installed?]\r\n`));
  proc.on('close', (code) => {
    push(dec.end());
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
  proc.stdin.on('error', () => { /* program already gone */ });
  sessions.set(id, s);
  resize({ id, rows, cols });
  api.broadcast('pty.opened', { id, title: s.title, cwd: dir });
  return { id, title: s.title, cwd: dir };
}

function write({ id, data }) {
  const s = sessions.get(String(id));
  if (!s || !s.alive) return false;
  s.proc.stdin.write(frame('D', Buffer.from(data, 'utf8')));
  return true;
}

function resize({ id, rows, cols }) {
  const s = sessions.get(String(id));
  if (!s || !s.alive) return false;
  const b = Buffer.alloc(4);
  b.writeUInt16BE(Math.max(1, Math.min(rows | 0, 1000)), 0);
  b.writeUInt16BE(Math.max(1, Math.min(cols | 0, 1000)), 2);
  s.proc.stdin.write(frame('R', b));
  return true;
}

function close({ id }) {
  const s = sessions.get(String(id));
  if (!s) return false;
  // Closing stdin tells the helper to hang up on everything in the terminal
  // (SIGHUP, then SIGKILL after 2 s); the last line is in case it can't.
  if (s.alive) { s.proc.stdin.end(); setTimeout(() => s.alive && s.proc.kill('SIGKILL'), 5000); }
  sessions.delete(String(id));
  api.broadcast('pty.closed', { id: String(id) });
  return true;
}

function list() {
  return [...sessions.values()].map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, alive: s.alive, code: s.code, replay: s.buf }));
}

function killAll() { for (const s of sessions.values()) if (s.alive) s.proc.kill('SIGHUP'); }

function init(a) {
  api = a;
  a.register('pty.open', (p) => open(p));
  a.register('pty.write', write);
  a.register('pty.resize', resize);
  a.register('pty.close', close);
  a.register('pty.list', list);
  a.onExit.push(killAll);
}

module.exports = { init, open, write };
