'use strict';
// Mail, the NeoMutt way: plain text, threads, reply-all, patches you can
// apply with git am. IMAP for reading (imapflow), SMTP for sending
// (nodemailer). The password comes from the GNOME keyring.

const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const config = require('./config');
const secrets = require('./secrets');
const gitmod = require('./git');

let api;
let imap = null;
let imapReady = null;
let testOverrides = null;        // the test suite points this at local servers

function account() {
  const m = { ...config.get().mail, ...(testOverrides || {}) };
  if (!m.address) throw new Error('Set your email address in Settings first');
  return m;
}

async function password(m) {
  if (m.password) return m.password;                  // tests only
  const p = await secrets.lookup(m.keyringService || 'neomutt', m.address);
  if (!p) {
    const e = new Error(`No password in the keyring for ${m.address}. Enter your Gmail App Password in Settings → Mail.`);
    e.code = 'NO_PASSWORD';
    throw e;
  }
  return p;
}

async function connection() {
  if (imap && imap.usable) return imap;
  if (imapReady) return imapReady;
  imapReady = (async () => {
    const m = account();
    const c = new ImapFlow({
      host: m.imapHost, port: Number(m.imapPort), secure: m.imapSecure !== false,
      auth: { user: m.address, pass: await password(m) },
      logger: false, tls: m.tls || undefined,
    });
    c.on('error', () => { /* reconnect on next use */ });
    c.on('close', () => { if (imap === c) imap = null; });
    c.on('exists', (e) => api.broadcast('mail.exists', { folder: e.path, count: e.count }));
    await c.connect();
    imap = c;
    return c;
  })();
  try { return await imapReady; } finally { imapReady = null; }
}

async function status() {
  const m = { ...config.get().mail, ...(testOverrides || {}) };
  if (!m.address) return { configured: false, hasPassword: false };
  const has = !!(m.password || (await secrets.lookup(m.keyringService || 'neomutt', m.address)));
  return { configured: true, hasPassword: has, address: m.address, connected: !!(imap && imap.usable) };
}

async function setPassword({ password: pw }) {
  const m = account();
  // Gmail shows App Passwords in groups of four: the spaces are not part of it.
  const clean = String(pw).replace(/\s+/g, '');
  await secrets.store(m.keyringService || 'neomutt', m.address, clean, `neomutt gmail (${m.address})`);
  if (imap) { try { await imap.logout(); } catch (e) { /* fine */ } imap = null; }
  return true;
}

async function folders() {
  const c = await connection();
  const list = await c.list();
  return list.map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse || '', flags: [...(f.flags || [])], delimiter: f.delimiter }))
    .filter((f) => !f.flags.includes('\\Noselect'));
}

function addr(list) { return (list || []).map((a) => ({ name: a.name || '', address: a.address || '' })); }

async function list({ folder = 'INBOX', limit }) {
  const c = await connection();
  const n = limit || account().fetchCount || 200;
  const lock = await c.getMailboxLock(folder);
  try {
    const exists = c.mailbox.exists;
    if (!exists) return { folder, messages: [] };
    const from = Math.max(1, exists - n + 1);
    const out = [];
    for await (const msg of c.fetch(`${from}:*`, { uid: true, flags: true, envelope: true, internalDate: true, size: true, headers: ['references', 'list-id'] })) {
      const hdr = msg.headers ? msg.headers.toString('utf8') : '';
      const refs = ((hdr.match(/^references:\s*([\s\S]*?)(?=^\S|\Z)/im) || [])[1] || '').match(/<[^>]+>/g) || [];
      const listId = ((hdr.match(/^list-id:\s*(.*)$/im) || [])[1] || '').trim();
      const e = msg.envelope || {};
      out.push({
        uid: msg.uid, flags: [...(msg.flags || [])], size: msg.size,
        date: (e.date || msg.internalDate || new Date()).toISOString(),
        subject: e.subject || '(no subject)', from: addr(e.from), to: addr(e.to), cc: addr(e.cc),
        messageId: e.messageId || '', inReplyTo: e.inReplyTo || '', references: refs, listId,
      });
    }
    return { folder, messages: out };
  } finally { lock.release(); }
}

async function source({ folder = 'INBOX', uid }) {
  const c = await connection();
  const lock = await c.getMailboxLock(folder);
  try {
    const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg) throw new Error('That message is gone');
    return msg.source.toString('utf8');
  } finally { lock.release(); }
}

async function read({ folder = 'INBOX', uid }) {
  const raw = await source({ folder, uid });
  const p = await simpleParser(raw);
  let text = p.text;
  if (!text && p.html) text = p.html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try {
    const c = await connection();
    const lock = await c.getMailboxLock(folder);
    try { await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } finally { lock.release(); }
  } catch (e) { /* read-only folder: fine */ }
  const h = (k) => p.headers.get(k);
  const refs = h('references');
  return {
    uid, folder,
    subject: p.subject || '', date: p.date ? p.date.toISOString() : '',
    from: p.from ? p.from.value : [], to: p.to ? [].concat(p.to).flatMap((x) => x.value) : [], cc: p.cc ? [].concat(p.cc).flatMap((x) => x.value) : [],
    replyTo: p.replyTo ? p.replyTo.value : [],
    messageId: p.messageId || '', inReplyTo: p.inReplyTo || '',
    references: Array.isArray(refs) ? refs : refs ? String(refs).split(/\s+/) : [],
    // straight from the header: mailparser reshapes List-Id into an object
    listId: ((raw.split(/\r?\n\r?\n/)[0].match(/^list-id:[ \t]*(.*(?:\r?\n[ \t].*)*)/im) || [])[1] || '').replace(/\s+/g, ' ').trim(),
    text: text || '', isPatch: /^diff --git /m.test(text || '') || /^---\s*\n.*\|\s+\d+/m.test(text || ''),
    attachments: (p.attachments || []).map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
  };
}

async function send({ to, cc, subject, text, inReplyTo, references }) {
  const m = account();
  const transport = nodemailer.createTransport({
    host: m.smtpHost, port: Number(m.smtpPort), secure: m.smtpSecure !== undefined ? m.smtpSecure : Number(m.smtpPort) === 465,
    auth: { user: m.address, pass: await password(m) }, tls: m.tls || undefined,
  });
  const from = m.name ? { name: m.name, address: m.address } : m.address;
  const info = await transport.sendMail({
    from, to, cc: cc || undefined, subject, text,
    inReplyTo: inReplyTo || undefined, references: references && references.length ? references : undefined,
    headers: { 'User-Agent': 'C++ Path Workbench' },
    // Plain text exactly as written: no HTML part, no format=flowed rewrapping.
  });
  transport.close();
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

async function apply({ folder, uid, repo }) {
  const raw = await source({ folder, uid });
  return gitmod.am({ cwd: repo, mbox: raw });
}

async function disconnect() { if (imap) { try { await imap.logout(); } catch (e) { /* gone */ } imap = null; } return true; }

function init(a) {
  api = a;
  a.register('mail.status', status);
  a.register('mail.setPassword', setPassword);
  a.register('mail.folders', folders);
  a.register('mail.list', list);
  a.register('mail.read', read);
  a.register('mail.source', source);
  a.register('mail.send', send);
  a.register('mail.apply', apply);
  a.register('mail.disconnect', disconnect);
  a.onExit.push(() => { if (imap) imap.close(); });
}

module.exports = { init, _setTestOverrides: (o) => { testOverrides = o; imap = null; } };
