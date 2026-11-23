// IRC (WeeChat-style): buffers down the left, the chat, nicks on the right.
// The connection lives in the backend, so it stays up while you work.

import { call, on } from './rpc.js';
import { h, clear, toast } from './ui.js';
import { tabs, command, status } from './layout.js';
import { theme } from './themes.js';

let state = { status: { state: 'disconnected' }, buffers: [] };
const bufs = new Map();      // lower name -> {name, type, lines, users, topic, unread, mention}
let current = '(server)';
let ui = null;
const history = [];
let histPos = -1;

function key(n) { return (n || '').toLowerCase(); }
function nickColour(nick) {
  let x = 0;
  for (const ch of nick || '') x = (x * 33 + ch.charCodeAt(0)) >>> 0;
  return `var(--nick-${x % 8})`;
}
function time(t) { const d = new Date(t); return d.toTimeString().slice(0, 5); }
function myNick() { return state.status.nick || ''; }

function lineEl(l) {
  const mention = !l.self && myNick() && l.kind === 'msg' && new RegExp(`\\b${myNick().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(l.text);
  const who = l.kind === 'msg' ? h('span', { class: 'nick', style: { color: l.self ? 'var(--accent)' : nickColour(l.nick) } }, `<${l.nick}>`)
    : l.kind === 'action' ? h('span', { class: 'nick', style: { color: nickColour(l.nick) } }, `* ${l.nick}`)
    : l.kind === 'notice' ? h('span', { class: 'nick' }, `-${l.nick}-`)
    : h('span', { class: 'nick sys' }, l.kind === 'join' ? '-->' : l.kind === 'part' ? '<--' : l.kind === 'error' ? '!!!' : '--');
  const text = h('span', { class: 'text' });
  // links clickable; everything else plain text
  for (const part of String(l.text).split(/(https?:\/\/[^\s<>"]+)/)) {
    if (/^https?:\/\//.test(part)) text.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part));
    else text.append(part);
  }
  return h('div', { class: `irc-line k-${l.kind}${mention ? ' mention' : ''}` }, h('span', { class: 'ts' }, time(l.time)), who, text);
}

function renderBuffers() {
  if (!ui) return;
  clear(ui.bufs);
  const list = [...bufs.values()].sort((a, b) => (a.type === 'server' ? -1 : b.type === 'server' ? 1 : a.name.localeCompare(b.name)));
  for (const b of list) {
    const btn = h('button', { type: 'button', class: 'irc-buf' + (key(b.name) === key(current) ? ' active' : '') + (b.mention ? ' mention' : b.unread ? ' unread' : '') },
      b.type === 'server' ? 'server' : b.name, b.unread ? h('span', { class: 'count' }, ` ${b.unread}`) : null);
    btn.addEventListener('click', () => select(b.name));
    ui.bufs.append(btn);
  }
}

function renderUsers() {
  if (!ui) return;
  const b = bufs.get(key(current));
  clear(ui.users);
  if (!b || b.type !== 'channel') { ui.users.hidden = true; return; }
  ui.users.hidden = false;
  ui.users.append(h('div', { class: 'muted small' }, `${b.users.length} nicks`));
  for (const u of b.users) {
    const n = h('button', { type: 'button', class: 'irc-user', style: { color: nickColour(u) }, title: `Talk to ${u} privately` }, u);
    n.addEventListener('click', () => { call('irc.send', { buffer: current, text: `/query ${u}` }).then(() => select(u)).catch((e) => toast(e.message, 'error')); });
    ui.users.append(n);
  }
}

function select(name) {
  current = name;
  const b = bufs.get(key(name));
  if (b) { b.unread = 0; b.mention = false; }
  if (!ui) return;
  clear(ui.lines);
  if (b) for (const l of b.lines) ui.lines.append(lineEl(l));
  ui.lines.scrollTop = ui.lines.scrollHeight;
  ui.topic.textContent = b && b.topic ? b.topic : b && b.type === 'server' ? statusText() : name;
  renderBuffers(); renderUsers(); updateBadge();
  ui.input.focus();
}

function statusText() {
  const s = state.status;
  return s.state === 'connected' ? `Connected to ${s.server} as ${s.nick}` : s.state === 'connecting' ? `Connecting to ${s.server}...` : s.state === 'reconnecting' ? 'Reconnecting...' : 'Not connected';
}

function updateBadge() {
  let unread = 0, mention = false;
  for (const b of bufs.values()) { unread += b.unread || 0; mention = mention || b.mention; }
  const s = state.status.state;
  status.set('irc', s === 'disconnected' ? '' : `IRC${mention ? ' @' : unread ? ` ${unread}` : ''}`, { order: 60, cls: mention ? 'bad' : '', title: statusText(), onclick: openIrc });
  const t = tabs.get('irc');
  if (t) tabs.setTitle('irc', `IRC${mention ? ' (@)' : unread ? ` (${unread})` : ''}`);
}

function setConnButton() {
  if (!ui) return;
  const s = state.status.state;
  ui.conn.textContent = s === 'disconnected' ? 'Connect' : 'Disconnect';
  ui.stat.textContent = statusText();
}

async function send() {
  const text = ui.input.value;
  if (!text.trim()) return;
  history.unshift(text); histPos = -1;
  ui.input.value = '';
  try {
    await call('irc.send', { buffer: current, text });
    const m = text.match(/^\/(?:join|j|query|msg)\s+(\S+)/i);
    if (m) setTimeout(() => select(m[1]), 300);
    if (/^\/close\b/i.test(text)) { bufs.delete(key(current)); select('(server)'); }
  } catch (err) { toast(err.message, 'error'); ui.input.value = text; }
}

function complete() {
  const v = ui.input.value, pos = ui.input.selectionStart;
  const before = v.slice(0, pos);
  const m = before.match(/(\S+)$/);
  if (!m) return;
  const b = bufs.get(key(current));
  const cands = (b ? b.users : []).filter((u) => u.toLowerCase().startsWith(m[1].toLowerCase()));
  if (!cands.length) return;
  const nick = cands[0] + (before.length === m[1].length ? ': ' : ' ');
  ui.input.value = before.slice(0, -m[1].length) + nick + v.slice(pos);
  ui.input.selectionStart = ui.input.selectionEnd = before.length - m[1].length + nick.length;
}

function openIrc() {
  tabs.open({
    id: 'irc', kind: 'irc', title: 'IRC', session: { kind: 'irc' },
    render(el) {
      ui = {
        bufs: h('nav', { class: 'irc-bufs', 'aria-label': 'Buffers' }),
        topic: h('div', { class: 'irc-topic' }),
        lines: h('div', { class: 'irc-lines', role: 'log', 'aria-live': 'polite' }),
        users: h('div', { class: 'irc-users', 'aria-label': 'Nicks' }),
        input: h('input', { class: 'field irc-input', type: 'text', spellcheck: 'true', placeholder: 'Message, or /join #channel  /msg nick text  /me  /nick  /whois  /ns identify', 'aria-label': 'Message' }),
        conn: h('button', { class: 'btn', type: 'button' }),
        stat: h('span', { class: 'muted' }),
      };
      ui.conn.addEventListener('click', async () => {
        try {
          if (state.status.state === 'disconnected') await call('irc.connect');
          else await call('irc.disconnect');
        } catch (err) { toast(err.message, 'error', 8000); }
      });
      ui.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
        else if (e.key === 'Tab') { e.preventDefault(); complete(); }
        else if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); histPos = Math.min(histPos + 1, history.length - 1); ui.input.value = history[histPos]; }
        else if (e.key === 'ArrowDown') { e.preventDefault(); histPos = Math.max(histPos - 1, -1); ui.input.value = histPos < 0 ? '' : history[histPos]; }
        else if (e.altKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); const list = [...ui.bufs.children]; list[+e.key - 1]?.click(); }
      });
      el.append(h('div', { class: 'irc' },
        h('div', { class: 'toolbar' }, ui.conn, ui.stat, h('span', { class: 'grow' }), h('span', { class: 'muted small' }, 'Alt+1..9 switch buffer · Tab completes nicks')),
        h('div', { class: 'irc-main' }, ui.bufs, h('div', { class: 'irc-centre' }, ui.topic, ui.lines, ui.input), ui.users)));
      setConnButton();
      select(current);
    },
    onShow() { if (ui) { select(current); } },
  });
}

export async function initIrc() {
  on('irc.status', (s) => { state.status = s; setConnButton(); updateBadge(); if (ui && key(current) === '(server)') ui.topic.textContent = statusText(); });
  on('irc.buffers', (list) => {
    for (const b of list) if (!bufs.has(key(b.name))) bufs.set(key(b.name), { name: b.name, type: b.type, lines: [], users: [], topic: b.topic, unread: 0 });
    for (const k of [...bufs.keys()]) if (!list.some((b) => key(b.name) === k)) bufs.delete(k);
    renderBuffers();
  });
  on('irc.users', (d) => { const b = bufs.get(key(d.buffer)); if (b) { b.users = d.users; if (key(d.buffer) === key(current)) renderUsers(); } });
  on('irc.line', ({ buffer, line }) => {
    let b = bufs.get(key(buffer));
    if (!b) { b = { name: buffer, type: buffer === '(server)' ? 'server' : /^[#&]/.test(buffer) ? 'channel' : 'query', lines: [], users: [], topic: '', unread: 0 }; bufs.set(key(buffer), b); renderBuffers(); }
    b.lines.push(line);
    if (b.lines.length > 2000) b.lines.shift();
    if (line.kind === 'topic') b.topic = line.text.replace(/^Topic: /, '');
    const visible = ui && tabs.active()?.id === 'irc' && key(buffer) === key(current);
    if (visible) {
      const atEnd = ui.lines.scrollTop + ui.lines.clientHeight >= ui.lines.scrollHeight - 30;
      ui.lines.append(lineEl(line));
      if (atEnd) ui.lines.scrollTop = ui.lines.scrollHeight;
    } else if (['msg', 'action', 'notice'].includes(line.kind) && !line.self) {
      b.unread = (b.unread || 0) + 1;
      if (b.type === 'query' || (myNick() && line.text.toLowerCase().includes(myNick().toLowerCase()))) b.mention = true;
      renderBuffers(); updateBadge();
    }
  });
  try {
    state = await call('irc.state');
    for (const b of state.buffers) bufs.set(key(b.name), { ...b, unread: 0 });
    updateBadge();
  } catch (e) { /* no backend yet */ }
  command('irc.open', 'IRC', ['Ctrl+Shift+L'], openIrc);
  command('irc.connect', 'Connect to IRC', [], () => call('irc.connect').catch((e) => toast(e.message, 'error', 8000)));
}
