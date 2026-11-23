'use strict';
// clangd, the same language server note 0.3 sets up in Neovim. One clangd
// per project root; its JSON-RPC messages are passed to the editor unchanged.
// In a CMake project the root is the top CMakeLists.txt folder: clangd finds
// build/compile_commands.json from there by itself.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let api;
const servers = new Map();   // root -> {proc, buf, session}

// A project root is the nearest folder with a compile database or flags file,
// else the git root, else the file's own folder.
function rootFor(file) {
  const cm = require('./cmake').cmakeRoot(file);
  if (cm) return cm;
  let d = path.dirname(file);
  const marks = ['compile_commands.json', 'compile_flags.txt', '.clangd'];
  for (let cur = d; ; cur = path.dirname(cur)) {
    if (marks.some((m) => fs.existsSync(path.join(cur, m)))) return cur;
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    if (path.dirname(cur) === cur) return d;
  }
}

// Each window load is a session with its own clangd conversation (clangd
// can only be initialized once). A new session for the same root (you
// reloaded the window) replaces the old one.
function start({ root, session = '' }) {
  const old = servers.get(root);
  if (old && old.session === session) return { root, running: true };
  if (old) { servers.delete(root); old.proc.kill(); }
  const c = config.get().clangd;
  if (!c.enabled) throw new Error('clangd is turned off in Settings');
  const proc = spawn(c.command || 'clangd', c.args || [], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { proc, buf: Buffer.alloc(0), session };
  servers.set(root, s);
  // Answer once clangd has really started (or couldn't): a window that
  // thinks it's talking to a clangd that isn't installed waits on it forever.
  const started = new Promise((resolve, reject) => {
    proc.once('spawn', () => resolve({ root, running: true }));
    proc.once('error', (err) => reject(new Error(err.code === 'ENOENT' ? `clangd is not installed (${require('./distro').installHint('clangd')}); completion and errors-as-you-type are off` : err.message)));
  });
  proc.stdout.on('data', (chunk) => {
    s.buf = Buffer.concat([s.buf, chunk]);
    for (;;) {
      const sep = s.buf.indexOf('\r\n\r\n');
      if (sep < 0) break;
      const m = s.buf.slice(0, sep).toString('ascii').match(/Content-Length:\s*(\d+)/i);
      if (!m) { s.buf = s.buf.slice(sep + 4); continue; }
      const len = +m[1];
      if (s.buf.length < sep + 4 + len) break;
      const body = s.buf.slice(sep + 4, sep + 4 + len).toString('utf8');
      s.buf = s.buf.slice(sep + 4 + len);
      api.broadcast('lsp.message', { root, session, message: body });
    }
  });
  proc.stderr.on('data', () => { /* clangd logs a lot; ignore */ });
  const gone = () => { if (servers.get(root) === s) servers.delete(root); };
  proc.on('error', (err) => {
    gone();
    api.broadcast('lsp.exit', { root, session, error: err.code === 'ENOENT' ? `clangd is not installed (${require('./distro').installHint('clangd')})` : err.message });
  });
  proc.on('close', (code) => { gone(); api.broadcast('lsp.exit', { root, session, code }); });
  return started;
}

function send({ root, session = '', message }) {
  const s = servers.get(root);
  if (!s || s.session !== session) return false;
  const body = Buffer.from(message, 'utf8');
  s.proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  s.proc.stdin.write(body);
  return true;
}

function stop({ root }) {
  const s = servers.get(root);
  if (s) { s.proc.kill(); servers.delete(root); }
  return true;
}

function init(a) {
  api = a;
  a.register('lsp.root', ({ file }) => ({ root: rootFor(file) }));
  a.register('lsp.start', start);
  a.register('lsp.send', send);
  a.register('lsp.stop', stop);
  a.onExit.push(() => { for (const s of servers.values()) s.proc.kill(); });
}

module.exports = { init, rootFor };
