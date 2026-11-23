// Mail, the mutt way: an index of threads, j/k to move, Enter to read,
// r/g/L to reply, m to write, A to apply a patch with git am. Plain text
// only, bottom-posted, wrapped at 72: what mailing lists expect.

import { call, on } from './rpc.js';
import { h, clear, toast, prompt, dialog, relTime } from './ui.js';
import { tabs, command, status, runCommand } from './layout.js';
import { highlightToHtml } from './highlight.js';
import { workspaceRoot } from './files.js';

let folder = 'INBOX';
let msgs = [];
let rows = [];          // threaded order: [{m, depth, prefix}]
let sel = 0;
let ui = null;
let me = '';

const NEEDS_SETUP = 'Mail isn\'t set up yet.';

function norm(s) { return String(s || '').replace(/^((re|fwd?|aw):\s*)+/i, '').trim().toLowerCase(); }
function name(a) { return a && a[0] ? (a[0].name || a[0].address) : ''; }
function addrList(a) { return (a || []).map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(', '); }

// Threads from Message-ID / In-Reply-To / References, oldest thread first like
// mutt's default (newest at the bottom), with ├─> └─> tree arrows.
function thread(list) {
  const byId = new Map(list.map((m) => [m.messageId, m]));
  const kids = new Map();
  const roots = [];
  for (const m of list) {
    const parentId = m.inReplyTo && byId.has(m.inReplyTo) ? m.inReplyTo : [...m.references].reverse().find((r) => byId.has(r));
    if (parentId && parentId !== m.messageId) { if (!kids.has(parentId)) kids.set(parentId, []); kids.get(parentId).push(m); }
    else roots.push(m);
  }
  const latest = (m) => Math.max(+new Date(m.date), ...(kids.get(m.messageId) || []).map(latest));
  roots.sort((a, b) => latest(a) - latest(b));
  const out = [];
  const walk = (m, depth, prefix, last, rootSubject) => {
    out.push({ m, depth, rootSubject, prefix: depth ? prefix + (last ? '└─>' : '├─>') : '' });
    const ch = (kids.get(m.messageId) || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    ch.forEach((c, i) => walk(c, depth + 1, depth ? prefix + (last ? '   ' : '│  ') : '', i === ch.length - 1, rootSubject));
  };
  roots.forEach((r) => walk(r, 0, '', true, norm(r.subject)));
  return out;
}

async function load() {
  if (!ui) return;
  ui.index.textContent = 'Loading...';
  try {
    const st = await call('mail.status');
    if (!st.configured) return setup(NEEDS_SETUP);
    me = st.address;
    if (!st.hasPassword) return setup('Add your Gmail App Password to the keyring.');
    const r = await call('mail.list', { folder });
    msgs = r.messages;
    rows = thread(msgs);
    sel = Math.max(0, rows.length - 1);
    renderIndex();
    ui.bar.textContent = `${folder} · ${msgs.length} messages · ${msgs.filter((m) => !m.flags.includes('\\Seen')).length} new · ${me}`;
    updateBadge();
  } catch (err) {
    clear(ui.index);
    ui.index.append(h('p', { class: 'pad' }, `Couldn't load mail: ${err.message}`),
      h('p', { class: 'pad muted' }, 'Check the account in Settings. Gmail needs IMAP turned on and an App Password (note 0.4).'),
      h('div', { class: 'pad' }, h('button', { class: 'btn', type: 'button', onclick: () => runCommand('app.settings') }, 'Settings'), ' ',
        h('button', { class: 'btn', type: 'button', onclick: askPassword }, 'Set App Password...'), ' ',
        h('button', { class: 'btn', type: 'button', onclick: load }, 'Try again')));
  }
}

function setup(msg) {
  clear(ui.index);
  ui.index.append(h('div', { class: 'pad' },
    h('p', {}, msg),
    h('p', { class: 'muted' }, 'This uses the same account and keyring entry as the neomutt setup in note 0.4, so if neomutt works, this will too.'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => runCommand('app.settings') }, 'Open Settings'), ' ',
    h('button', { class: 'btn', type: 'button', onclick: askPassword }, 'Set App Password...')));
}

async function askPassword() {
  const input = h('input', { class: 'field', type: 'password', autocomplete: 'off', spellcheck: 'false' });
  const ok = await dialog({
    title: 'Gmail App Password',
    body: h('div', { class: 'form' }, h('label', { class: 'stack' }, 'App Password (16 letters; spaces are fine)', input),
      h('p', { class: 'muted small' }, 'Saved in your GNOME keyring with secret-tool, never in a file. Make one at myaccount.google.com → Security → App passwords.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }],
  });
  if (!ok || !input.value) return;
  try { await call('mail.setPassword', { password: input.value }); toast('Saved to the keyring', 'ok'); load(); }
  catch (err) { toast(err.message, 'error', 8000); }
}

function renderIndex() {
  clear(ui.index);
  if (!rows.length) { ui.index.append(h('p', { class: 'muted pad' }, 'No mail in this folder.')); return; }
  rows.forEach((r, i) => {
    const m = r.m;
    const flags = (m.flags.includes('\\Seen') ? ' ' : 'N') + (m.flags.includes('\\Answered') ? 'r' : m.flags.includes('\\Flagged') ? '!' : ' ');
    const patch = /^\[(?:[^\]]*PATCH[^\]]*)\]/i.test(m.subject);
    const b = h('div', { class: 'mail-row' + (i === sel ? ' sel' : '') + (m.flags.includes('\\Seen') ? '' : ' new') + (patch ? ' patch' : ''), role: 'option', 'aria-selected': i === sel ? 'true' : 'false' },
      h('span', { class: 'mr-n' }, String(i + 1).padStart(4)), h('span', { class: 'mr-f' }, flags),
      h('span', { class: 'mr-d' }, relTime(m.date).padEnd(7)),
      h('span', { class: 'mr-from' }, name(m.from).slice(0, 20).padEnd(20)),
      h('span', { class: 'mr-s' }, h('span', { class: 'tree' }, r.prefix), r.depth && norm(m.subject) === r.rootSubject ? '' : m.subject));
    b.addEventListener('click', () => { sel = i; renderSel(); });
    b.addEventListener('dblclick', () => openMsg());
    ui.index.append(b);
  });
  renderSel();
}
function renderSel() {
  [...ui.index.children].forEach((c, i) => { c.classList.toggle('sel', i === sel); c.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
  ui.index.children[sel]?.scrollIntoView({ block: 'nearest' });
}

function updateBadge() {
  const n = msgs.filter((m) => !m.flags.includes('\\Seen')).length;
  status.set('mail', n ? `Mail ${n}` : '', { order: 55, onclick: openMail, title: `${n} new in ${folder}` });
}

// ---- the pager: quotes and patches coloured, as text
function pager(text) {
  const pre = h('pre', { class: 'mail-body' });
  let inDiff = false;
  for (const line of text.split('\n')) {
    if (/^diff --git |^---$|^Index: /.test(line)) inDiff = true;
    if (inDiff) { pre.append(h('span', { class: 'ml', html: highlightToHtml(line, 'diff') || ' ' }), '\n'); continue; }
    const q = (line.match(/^(>\s?)+/) || [''])[0].replace(/\s/g, '').length;
    const sig = line === '-- ';
    pre.append(h('span', { class: q ? `ml q${Math.min(q, 4)}` : sig ? 'ml sig' : 'ml' }, line), '\n');
  }
  return pre;
}

let current = null;
async function openMsg(i = sel) {
  const r = rows[i];
  if (!r) return;
  let msg;
  try { msg = await call('mail.read', { folder, uid: r.m.uid }); }
  catch (err) { return toast(err.message, 'error'); }
  current = msg;
  if (!r.m.flags.includes('\\Seen')) { r.m.flags.push('\\Seen'); renderIndex(); updateBadge(); }
  clear(ui.reader);
  const hdr = h('div', { class: 'mail-headers' },
    h('div', {}, h('b', {}, 'From: '), addrList(msg.from)),
    h('div', {}, h('b', {}, 'To: '), addrList(msg.to)),
    msg.cc.length ? h('div', {}, h('b', {}, 'Cc: '), addrList(msg.cc)) : null,
    h('div', {}, h('b', {}, 'Date: '), msg.date ? new Date(msg.date).toString().replace(/ \(.*\)$/, '') : ''),
    h('div', {}, h('b', {}, 'Subject: '), msg.subject));
  const acts = h('div', { class: 'toolbar' },
    h('button', { class: 'btn', type: 'button', onclick: () => reply('author') }, 'r Reply'),
    h('button', { class: 'btn', type: 'button', onclick: () => reply('all') }, 'g Reply all'),
    msg.listId ? h('button', { class: 'btn', type: 'button', onclick: () => reply('list') }, 'L Reply to list') : null,
    msg.isPatch ? h('button', { class: 'btn primary', type: 'button', onclick: applyPatch }, 'A Apply with git am') : null,
    msg.attachments.length ? h('span', { class: 'muted' }, `${msg.attachments.length} attachment(s): ${msg.attachments.map((a) => a.filename).join(', ')}`) : null);
  ui.reader.append(acts, hdr, pager(msg.text));
  ui.root.classList.add('reading');
  ui.reader.scrollTop = 0;
  ui.reader.focus();
}
function closeMsg() { ui.root.classList.remove('reading'); current = null; ui.index.focus(); }

// ---- replies
function wrap72(text) {
  return text.split('\n').map((line) => {
    if (line.length <= 72 || /^>/.test(line)) return line;
    const out = []; let cur = '';
    for (const w of line.split(' ')) { if ((cur + ' ' + w).trim().length > 72 && cur) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) out.push(cur);
    return out.join('\n');
  }).join('\n');
}

function reply(kind) {
  const m = current;
  if (!m) return;
  const not = (a) => a.address && a.address.toLowerCase() !== me.toLowerCase();
  const from = (m.replyTo.length ? m.replyTo : m.from);
  let to = from, cc = [];
  if (kind === 'all') cc = [...m.to, ...m.cc].filter(not).filter((a) => !from.some((f) => f.address === a.address));
  if (kind === 'list') {
    const local = (m.listId.match(/<([^.>]+)/) || [])[1];
    const list = [...m.to, ...m.cc].find((a) => local && a.address.toLowerCase().startsWith(local.toLowerCase() + '@'));
    if (list) to = [list];
    else cc = [...m.to, ...m.cc].filter(not);
  }
  const when = m.date ? new Date(m.date).toUTCString().replace(' GMT', ' +0000') : '';
  const quoted = m.text.replace(/\n+$/, '').split('\n').map((l) => (l.startsWith('>') ? '>' + l : l ? '> ' + l : '>')).join('\n');
  compose({
    to: addrList(to), cc: addrList(cc),
    subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    text: `On ${when}, ${name(m.from)} wrote:\n${quoted}\n\n`,
    inReplyTo: m.messageId, references: [...m.references, m.messageId].filter(Boolean),
  });
}

function compose(init = {}) {
  const id = 'mail:compose:' + Date.now();
  const to = h('input', { class: 'field', type: 'text', value: init.to || '', 'aria-label': 'To' });
  const cc = h('input', { class: 'field', type: 'text', value: init.cc || '', 'aria-label': 'Cc' });
  const subject = h('input', { class: 'field', type: 'text', value: init.subject || '', 'aria-label': 'Subject' });
  const body = h('textarea', { class: 'field mono mail-compose', spellcheck: 'true', 'aria-label': 'Message' });
  body.value = init.text || '';
  const info = h('span', { class: 'muted small' });
  const check = () => {
    const long = body.value.split('\n').filter((l) => l.length > 72 && !l.startsWith('>')).length;
    info.textContent = long ? `${long} line(s) over 72 columns. Ctrl+Shift+Q rewraps them.` : 'Plain text. Reply below the quote and trim what you are not answering.';
    info.classList.toggle('warn', !!long);
  };
  body.addEventListener('input', () => { check(); tabs.setDirty(id, true); });
  body.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') { e.preventDefault(); body.value = wrap72(body.value); check(); } });
  check();
  const send = h('button', { class: 'btn primary', type: 'button' }, 'Send');
  const t = tabs.open({
    id, kind: 'compose', title: init.subject ? `✉ ${init.subject.slice(0, 24)}` : '✉ New message',
    render(el) {
      el.append(h('div', { class: 'page compose' },
        h('div', { class: 'form grid2' }, h('label', {}, 'To'), to, h('label', {}, 'Cc'), cc, h('label', {}, 'Subject'), subject),
        h('div', { class: 'compose-body' }, body),
        h('div', { class: 'toolbar' }, send, info)));
      setTimeout(() => { if (init.text) { body.focus(); body.selectionStart = body.selectionEnd = body.value.length; } else to.focus(); }, 0);
    },
    save: async () => true,
  });
  send.addEventListener('click', async () => {
    if (!to.value.trim()) return toast('Who is it to?', 'error');
    send.disabled = true;
    try {
      await call('mail.send', { to: to.value, cc: cc.value, subject: subject.value, text: body.value, inReplyTo: init.inReplyTo, references: init.references });
      toast('Sent', 'ok');
      tabs.setDirty(id, false);
      tabs.close(id);
    } catch (err) { toast(err.message, 'error', 8000); send.disabled = false; }
  });
  return t;
}

async function applyPatch() {
  if (!current) return;
  const git = await call('git.root', { cwd: workspaceRoot() || '~' }).catch(() => ({ root: null }));
  const repo = await prompt('Apply patch', 'Repository to apply it to (git am -3)', git.root || '', { hint: 'Make a branch for it first. If it doesn\'t apply, nothing is changed.' });
  if (!repo) return;
  try {
    const r = await call('mail.apply', { folder, uid: current.uid, repo });
    toast(r.output.split('\n').pop() || 'Applied', 'ok', 6000);
    runCommand('git.refresh');
  } catch (err) { toast(err.message, 'error', 10000); }
}

async function changeFolder() {
  let list;
  try { list = await call('mail.folders'); } catch (err) { return toast(err.message, 'error'); }
  const r = await dialog({
    title: 'Change folder (c)',
    body: h('div', { class: 'list' }, list.map((f) => h('button', { class: 'list-row', type: 'button', 'data-path': f.path }, f.path))),
    buttons: [], onOpen: (box, done) => box.querySelectorAll('.list-row').forEach((b) => b.addEventListener('click', () => done(b.dataset.path))),
  });
  if (r) { folder = r; load(); }
}

function onKey(e) {
  if (e.target.matches('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey) return;
  const reading = ui.root.classList.contains('reading');
  const k = e.key;
  const go = (d) => { sel = Math.max(0, Math.min(rows.length - 1, sel + d)); renderSel(); if (reading) openMsg(); };
  const map = {
    j: () => go(1), ArrowDown: () => !reading && go(1), k: () => go(-1), ArrowUp: () => !reading && go(-1),
    Enter: () => !reading && openMsg(), q: () => reading && closeMsg(), i: () => reading && closeMsg(), Escape: () => reading && closeMsg(),
    r: () => reading ? reply('author') : openMsg().then(() => reply('author')),
    g: () => reading ? reply('all') : openMsg().then(() => reply('all')),
    L: () => reading ? reply('list') : openMsg().then(() => reply('list')),
    m: () => compose(), A: () => reading && current && current.isPatch && applyPatch(),
    c: () => changeFolder(), $: () => load(),
    '*': () => { sel = rows.length - 1; renderSel(); }, Home: () => { sel = 0; renderSel(); }, End: () => { sel = rows.length - 1; renderSel(); },
    ' ': () => { if (reading) { const r = ui.reader; if (r.scrollTop + r.clientHeight >= r.scrollHeight - 4) go(1); else r.scrollBy(0, r.clientHeight - 40); } else openMsg(); },
  };
  if (map[k]) { e.preventDefault(); map[k](); }
}

function openMail() {
  tabs.open({
    id: 'mail', kind: 'mail', title: 'Mail', session: { kind: 'mail' },
    render(el) {
      ui = {
        index: h('div', { class: 'mail-index', role: 'listbox', tabindex: 0, 'aria-label': 'Messages' }),
        reader: h('div', { class: 'mail-reader', tabindex: 0 }),
        bar: h('div', { class: 'mail-bar' }),
        help: h('div', { class: 'mail-help' }, 'j/k move · Enter read · q back · r reply · g reply all · L list · m new · A git am · c folder · $ refresh'),
      };
      ui.root = h('div', { class: 'mail' }, ui.help, h('div', { class: 'mail-panes' }, ui.index, ui.reader), ui.bar);
      ui.root.addEventListener('keydown', onKey);
      el.append(ui.root);
      load();
    },
    onShow() { if (ui) (ui.root.classList.contains('reading') ? ui.reader : ui.index).focus(); },
  });
}

export function initMail() {
  on('mail.exists', (d) => { if (d.folder === folder && ui) load(); });
  command('mail.open', 'Mail', ['Ctrl+Shift+M'], openMail);
  command('mail.compose', 'New message', [], () => compose());
  command('mail.password', 'Set Gmail App Password...', [], askPassword);
  call('mail.status').then((s) => { if (s.configured && s.hasPassword) { me = s.address; } }).catch(() => {});
}
