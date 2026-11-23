'use strict';
// Test helper: start the backend and talk to it the way the window does.
const http = require('http');
const WebSocket = require('ws');
const { startServer } = require('../server/index');

async function connect() {
  const srv = await startServer({ port: 0 });
  const cookie = await new Promise((resolve, reject) => {
    http.get(srv.url, (res) => { res.resume(); resolve((res.headers['set-cookie'] || [''])[0].split(';')[0]); }).on('error', reject);
  });
  const ws = new WebSocket(srv.origin.replace('http', 'ws') + '/ws', { headers: { Cookie: cookie, Origin: srv.origin } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.e ? p.reject(new Error(m.e)) : p.resolve(m.r); }
    else if (m.ev) for (const l of listeners) l(m.ev, m.d);
  });
  const call = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, m: method, p: params })); });
  const waitFor = (ev, pred = () => true, ms = 10000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${ev}`)), ms);
    const l = (e, d) => { if (e === ev && pred(d)) { clearTimeout(t); listeners.splice(listeners.indexOf(l), 1); resolve(d); } };
    listeners.push(l);
  });
  const on = (fn) => listeners.push(fn);
  return { srv, cookie, ws, call, waitFor, on, close: async () => { ws.close(); await srv.close(); } };
}
module.exports = { connect };
