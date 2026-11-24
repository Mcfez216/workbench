'use strict';
// IRC, for Libera.Chat's ##c++-basic and friends. Signs in to your NickServ
// account with SASL as it connects: a password kept in the GNOME keyring
// (never in a file), or a TLS client certificate (CertFP, SASL EXTERNAL).
// Keeps the connection while the window reloads.

const fs = require('fs');
const IRC = require('irc-framework');
const config = require('./config');
const secrets = require('./secrets');

// What went wrong with a connection, in words. Node tries each of a server's
// addresses (IPv6 and IPv4) and, when all fail, reports an AggregateError
// whose own message is empty: the reasons are in its .errors.
function describeError(err) {
  if (!err) return '';
  const one = (e) => [e.code, e.address && `${e.address}${e.port ? ':' + e.port : ''}`].filter(Boolean).join(' ') || e.message || String(e);
  if (Array.isArray(err.errors) && err.errors.length) {
    const reasons = err.errors.map(one).join('; ');
    const timedOut = err.errors.every((e) => e.code === 'ETIMEDOUT');
    return `couldn't reach the server (${reasons})${timedOut ? '. Every address timed out: is the network up, or is port 6697 blocked (some networks only allow web traffic)?' : ''}`;
  }
  return err.message || err.code || String(err);
}

let api;
let client = null;
let status = { state: 'disconnected', nick: '', server: '', error: '' };
const buffers = new Map();         // name (lowercase) -> {name, type, lines, users, topic}
const MAX_LINES = 2000;

function buf(name, type) {
  const key = name.toLowerCase();
  if (!buffers.has(key)) {
    buffers.set(key, { name, type, lines: [], users: [], topic: '' });
    api.broadcast('irc.buffers', listBuffers());
  }
  return buffers.get(key);
}
function listBuffers() {
  return [...buffers.values()].map((b) => ({ name: b.name, type: b.type, topic: b.topic, users: b.users.length }));
}
function add(name, type, line) {
  const b = buf(name, type);
  const l = { time: Date.now(), ...line };
  b.lines.push(l);
  if (b.lines.length > MAX_LINES) b.lines.splice(0, b.lines.length - MAX_LINES);
  api.broadcast('irc.line', { buffer: b.name, line: l });
}
function setStatus(patch) { status = { ...status, ...patch }; api.broadcast('irc.status', status); }
const SERVER = '(server)';
const KEYRING = 'cpp-path-workbench-irc';

function splitPem(pem) {
  const key = (pem.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/) || [])[0];
  const cert = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/) || [])[0];
  return key && cert ? { private_key: key, certificate: cert } : null;
}

function keyringUser(c) { return `${c.account || c.nick}@${c.host}`; }

async function connect() {
  if (client) disconnect();
  const c = config.get().irc;
  if (!c.nick) throw new Error('Set your IRC nick in Settings first');
  const opts = {
    host: c.host, port: Number(c.port), tls: !!c.tls, rejectUnauthorized: true,
    nick: c.nick, username: c.username || c.nick, gecos: c.realname || c.nick,
    auto_reconnect: true, auto_reconnect_max_retries: 10, version: 'C++ Path Workbench',
  };
  let how = '';
  if (c.login === 'sasl') {
    const password = await secrets.lookup(KEYRING, keyringUser(c));
    if (!password) throw new Error(`No IRC password in the keyring for ${keyringUser(c)}: Settings → IRC → Set IRC password`);
    opts.account = { account: c.account || c.nick, password };
    opts.sasl_disconnect_on_fail = false;
    how = ` as ${c.account || c.nick} (SASL)`;
  }
  if (c.login === 'certfp' || (c.login !== 'sasl' && c.certFile)) {
    if (!c.certFile) throw new Error('CertFP login needs your certificate file (Settings → IRC)');
    let pem;
    try { pem = fs.readFileSync(config.expand(c.certFile), 'utf8'); }
    catch (e) { throw new Error(`Can't read the certificate ${c.certFile}: ${e.code === 'EACCES' ? 'permission denied' : e.message}`); }
    const cc = splitPem(pem);
    if (!cc) throw new Error(`${c.certFile} needs both the certificate and the private key in it (cat cert.pem key.pem > nick.pem)`);
    opts.client_certificate = cc;
    if (c.login === 'certfp') { opts.sasl_mechanism = 'EXTERNAL'; how = ' with your client certificate (SASL EXTERNAL)'; }
    else how = ' with your client certificate';
  }
  client = new IRC.Client();
  setStatus({ state: 'connecting', server: `${c.host}:${c.port}`, nick: c.nick, error: '' });
  add(SERVER, 'server', { kind: 'info', text: `Connecting to ${c.host}:${c.port}${c.tls ? ' (TLS)' : ''}${how}...` });
  client.on('loggedin', (e) => add(SERVER, 'server', { kind: 'info', text: `Logged in to your account ${e.account}` }));
  client.on('sasl failed', (e) => add(SERVER, 'server', { kind: 'error', text: `SASL login failed (${e.reason}${e.message ? ': ' + e.message : ''}). Check the account name and password in Settings → IRC; you're still connected, unidentified.` }));

  client.on('registered', (e) => {
    setStatus({ state: 'connected', nick: e.nick });
    add(SERVER, 'server', { kind: 'info', text: `Connected as ${e.nick}` });
    for (const ch of c.channels || []) if (ch) client.join(ch);
  });
  client.on('message', (e) => {
    const isChannel = /^[#&]/.test(e.target);
    const isSelf = e.nick && client.user && e.nick.toLowerCase() === client.user.nick.toLowerCase();
    let name = isChannel ? e.target : (isSelf ? e.target : e.nick);
    let type = isChannel ? 'channel' : 'query';
    if (!e.nick || (e.type === 'notice' && !isChannel && (/\./.test(e.nick) || /^(NickServ|ChanServ|OperServ)$/i.test(e.nick)))) { name = SERVER; type = 'server'; }
    add(name, type, { kind: e.type === 'action' ? 'action' : e.type === 'notice' ? 'notice' : 'msg', nick: e.nick || e.hostname || '', text: e.message, self: isSelf });
  });
  client.on('join', (e) => {
    const b = buf(e.channel, 'channel');
    if (!b.users.includes(e.nick)) b.users.push(e.nick);
    add(e.channel, 'channel', { kind: 'join', nick: e.nick, text: `${e.nick} joined` });
  });
  client.on('part', (e) => {
    const b = buf(e.channel, 'channel');
    b.users = b.users.filter((u) => u !== e.nick);
    add(e.channel, 'channel', { kind: 'part', nick: e.nick, text: `${e.nick} left${e.message ? ` (${e.message})` : ''}` });
  });
  client.on('quit', (e) => {
    for (const b of buffers.values()) {
      if (b.users.includes(e.nick)) {
        b.users = b.users.filter((u) => u !== e.nick);
        add(b.name, b.type, { kind: 'part', nick: e.nick, text: `${e.nick} quit${e.message ? ` (${e.message})` : ''}` });
      }
    }
  });
  client.on('nick', (e) => {
    if (client.user && e.new_nick === client.user.nick) setStatus({ nick: e.new_nick });
    for (const b of buffers.values()) {
      const i = b.users.indexOf(e.nick);
      if (i >= 0) { b.users[i] = e.new_nick; add(b.name, b.type, { kind: 'info', text: `${e.nick} is now ${e.new_nick}` }); }
    }
  });
  client.on('userlist', (e) => {
    const b = buf(e.channel, 'channel');
    b.users = e.users.map((u) => u.nick).sort((a, z) => a.localeCompare(z));
    api.broadcast('irc.users', { buffer: b.name, users: b.users });
  });
  client.on('topic', (e) => {
    const b = buf(e.channel, 'channel');
    b.topic = e.topic || '';
    add(e.channel, 'channel', { kind: 'topic', text: `Topic: ${b.topic}` });
  });
  client.on('kick', (e) => add(e.channel, 'channel', { kind: 'part', text: `${e.kicked} was kicked by ${e.nick} (${e.message || ''})` }));
  client.on('motd', (e) => add(SERVER, 'server', { kind: 'info', text: e.motd || e.error || '' }));
  client.on('nick in use', (e) => add(SERVER, 'server', { kind: 'error', text: `Nick ${e.nick} is in use. Try /nick ${e.nick}_` }));
  client.on('irc error', (e) => add(SERVER, 'server', { kind: 'error', text: `${e.error}: ${e.reason || ''}` }));
  client.on('reconnecting', (e) => { setStatus({ state: 'reconnecting' }); add(SERVER, 'server', { kind: 'info', text: `Reconnecting (attempt ${e.attempt})...` }); });
  client.on('socket error', (err) => { setStatus({ error: describeError(err) }); add(SERVER, 'server', { kind: 'error', text: `Connection problem: ${describeError(err)}` }); });
  client.on('socket close', (err) => { if (status.state !== 'reconnecting') setStatus({ state: 'disconnected' }); if (err) add(SERVER, 'server', { kind: 'error', text: `Connection closed: ${describeError(err)}` }); });
  client.on('close', () => setStatus({ state: 'disconnected' }));
  client.connect(opts);
  return status;
}

function disconnect() {
  if (client) { try { client.quit('C++ Path Workbench'); } catch (e) { /* already gone */ } client.removeAllListeners(); client = null; }
  setStatus({ state: 'disconnected' });
  return status;
}

// Typing in a buffer: text is a message; /commands do what they do in WeeChat.
function send({ buffer, text }) {
  if (!client || status.state !== 'connected') throw new Error('Not connected to IRC');
  const target = buffer && buffer !== SERVER ? buffer : null;
  const self = { self: true, nick: client.user.nick };
  if (!text.startsWith('/') || text.startsWith('//')) {
    const msg = text.startsWith('//') ? text.slice(1) : text;
    if (!target) throw new Error('Pick a channel or person to talk to (or use /msg)');
    client.say(target, msg);
    add(target, buffers.get(target.toLowerCase()).type, { kind: 'msg', text: msg, ...self });
    return true;
  }
  const [cmd, ...rest] = text.slice(1).split(' ');
  const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'join': case 'j': client.join(rest[0], rest[1]); break;
    case 'part': case 'leave': client.part(rest[0] && /^[#&]/.test(rest[0]) ? rest[0] : target, /^[#&]/.test(rest[0] || '') ? rest.slice(1).join(' ') : arg); break;
    case 'msg': case 'query': {
      const [to, ...words] = rest;
      buf(to, /^[#&]/.test(to) ? 'channel' : 'query');
      if (words.length) { client.say(to, words.join(' ')); add(to, /^[#&]/.test(to) ? 'channel' : 'query', { kind: 'msg', text: words.join(' '), ...self }); }
      break;
    }
    case 'me': client.action(target, arg); add(target, buffers.get(target.toLowerCase()).type, { kind: 'action', text: arg, ...self }); break;
    case 'notice': client.notice(rest[0], rest.slice(1).join(' ')); break;
    case 'nick': client.changeNick(rest[0]); break;
    case 'topic': if (arg) client.setTopic(target, arg); else client.raw('TOPIC', target); break;
    case 'whois': client.whois(rest[0], (w) => add(SERVER, 'server', { kind: 'info', text: `${w.nick}: ${w.user || ''}@${w.host || ''} ${w.real_name || ''} ${w.account ? '(account ' + w.account + ')' : ''}` })); break;
    case 'ns': case 'nickserv': client.say('NickServ', arg); add(SERVER, 'server', { kind: 'msg', text: `-> NickServ: ${arg}`, ...self }); break;
    case 'cs': case 'chanserv': client.say('ChanServ', arg); break;
    case 'raw': case 'quote': client.raw(arg); break;
    case 'quit': disconnect(); break;
    case 'close': buffers.delete((target || '').toLowerCase()); api.broadcast('irc.buffers', listBuffers()); break;
    default: throw new Error(`Unknown command /${cmd}. Try /join /part /msg /me /nick /topic /whois /ns /raw /quit`);
  }
  return true;
}

function state() {
  return {
    status,
    buffers: [...buffers.values()].map((b) => ({ ...b, lines: b.lines.slice(-500) })),
  };
}

function init(a) {
  api = a;
  buf(SERVER, 'server');
  a.register('irc.connect', connect);
  a.register('irc.setPassword', async ({ password }) => {
    const c = config.get().irc;
    if (!c.nick && !c.account) throw new Error('Set your nick (or account) first');
    if (!password) throw new Error('Type the password');
    await secrets.store(KEYRING, keyringUser(c), password, `IRC ${keyringUser(c)} (C++ Path Workbench)`);
    return { user: keyringUser(c) };
  });
  a.register('irc.hasPassword', async () => ({ user: keyringUser(config.get().irc), stored: !!(await secrets.lookup(KEYRING, keyringUser(config.get().irc))) }));
  a.register('irc.disconnect', disconnect);
  a.register('irc.send', send);
  a.register('irc.state', state);
  a.onExit.push(disconnect);
  setTimeout(() => { if (config.get().irc.autoConnect && config.get().irc.nick) connect().catch((e) => add(SERVER, 'server', { kind: 'error', text: e.message })); }, 500);
}

module.exports = { init, splitPem, describeError };
