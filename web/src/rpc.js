// The window's line to the backend: one WebSocket, reconnecting on its own.

let ws = null;
let nextId = 1;
let backoff = 250;
const pending = new Map();
const listeners = new Map();
const queue = [];

function emit(ev, d) {
  for (const fn of listeners.get(ev) || []) {
    try { fn(d); } catch (err) { console.error(`listener for ${ev}`, err); }
  }
}

export function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    backoff = 250;
    while (queue.length) ws.send(queue.shift());
    emit('rpc.open', {});
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.e !== undefined) p.reject(new Error(m.e)); else p.resolve(m.r);
    } else if (m.ev) emit(m.ev, m.d);
  };
  ws.onclose = () => {
    for (const p of pending.values()) p.reject(new Error('Lost the connection to the backend; reconnecting'));
    pending.clear();
    emit('rpc.closed', {});
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 5000);
  };
}

export function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const msg = JSON.stringify({ id, m: method, p: params });
    if (ws && ws.readyState === 1) ws.send(msg); else queue.push(msg);
  });
}

export function on(ev, fn) {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(fn);
  return () => listeners.get(ev).delete(fn);
}
