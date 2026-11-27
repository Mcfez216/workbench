'use strict';
// The backend: a small HTTP + WebSocket server bound to 127.0.0.1 only.
//
// It can run a shell, so it must never be reachable by a web page you happen
// to open in a browser. Three locks:
//   1. a random 256-bit token, handed to the app window once in the URL, then
//      kept in an HttpOnly, SameSite=Strict cookie;
//   2. every request and the WebSocket upgrade must carry that cookie;
//   3. the WebSocket Origin must be this server's own origin.
//
// Messages on the socket:
//   client -> server  {id, m: "module.method", p: {...}}
//   server -> client  {id, r: result} | {id, e: "error message"}
//   server -> client  {ev: "module.event", d: {...}}   (pushed to every window)

// Windows: the portable toolchain first on PATH, before anything looks for a compiler
const platform = require('./platform');
platform.setupPath();
// ...and the certificates Windows trusts, for the app's own connections (mail,
// IRC) behind a proxy that inspects HTTPS. No launcher script to set
// NODE_EXTRA_CA_CERTS: work laptops often block those.
if (platform.WIN) {
  try {
    const tls = require('tls');
    if (tls.getCACertificates && tls.setDefaultCACertificates) {
      tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
    }
  } catch (e) { /* the bundled ones, then */ }
}

const http = require('http');
const net = require('net');
// Node tries a server's IPv6 and IPv4 addresses in turn, by default giving
// each only 250 ms. In WSL (and on slow or busy networks) every attempt can
// time out and IRC / mail fail with a bare "AggregateError". 2.5 s each.
if (net.setDefaultAutoSelectFamilyAttemptTimeout) net.setDefaultAutoSelectFamilyAttemptTimeout(2500);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const config = require('./config');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.map': 'application/json',
};

const handlers = new Map();
const sockets = new Set();
// Browser-window mode (OpenBSD, scripts/app-window.js): the backend stops
// once its window has been closed for a while. Long enough to ride out a
// reload; CPW_EXIT_WHEN_CLOSED=seconds.
let idleTimer = null, everConnected = false;
const IDLE_MS = Math.max(2, Number(process.env.CPW_EXIT_WHEN_CLOSED) || 20) * 1000;

function register(name, fn) { handlers.set(name, fn); }
// Windows: paths reach the window as C:/Users/... (see platform.slashes);
// terminal output is passed through untouched
const toWindow = platform.WIN ? (ev, d) => (ev === 'pty.data' ? d : platform.slashes(d)) : (ev, d) => d;
function broadcast(ev, d) {
  const msg = JSON.stringify({ ev, d: toWindow(ev, d) });
  for (const ws of sockets) if (ws.readyState === 1) ws.send(msg);
}

const api = { register, broadcast, config, onExit: [] };

function loadModules() {
  for (const m of ['files', 'pty', 'build', 'cmake', 'cp', 'git', 'guides', 'irc', 'mail', 'lsp', 'state', 'project', 'exercises', 'security', 'memviz', 'rust', 'debugger', 'tracks', 'libraries', 'coverage', 'make']) {
    require('./' + m).init(api);
  }
  // Music on Windows (WSL): YouTube Music in its own Microsoft Edge app window
  // (no tabs, no address bar), playing through Windows' own audio
  register('music.windows', async ({ url }) => {
    const distro = require('./distro');
    if (!distro.WSL) throw new Error('Only under WSL');
    const u = String(url || 'https://music.youtube.com/');
    if (!/^https:\/\/(music|www)\.youtube\.com\/[\w\-./?=%#]*$/.test(u)) throw new Error('Not a YouTube Music address');
    const { spawn } = require('child_process');
    // cmd.exe from a Windows folder (a Linux one makes it complain about UNC paths)
    const child = spawn('cmd.exe', ['/c', 'start', '""', 'msedge', `--app=${u}`], { cwd: '/mnt/c', detached: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.on('error', (e) => reject(new Error(`Couldn't start Edge from WSL: ${e.message}`))); child.on('spawn', resolve); });
    child.unref();
    return true;
  });
  register('config.get', async () => config.get());
  register('config.save', async (p) => config.save(p));
  // "Get new course notes": notes added to the bundled vaults since you got
  // them; nothing you have is replaced. A course vault you don't have yet is
  // added to Guides.
  register('vaults.updateCourse', async () => {
    const got = config.installBundledVaults();
    const c = config.get();
    const missing = got.filter((g) => !c.vaults.some((v) => v.name === g.name));
    if (missing.length) config.save({ ...c, vaults: [...c.vaults, ...missing.map((g) => ({ path: g.path, name: g.name }))] });
    return got;
  });
  register('app.info', async () => ({
    version: require('../package.json').version, home: config.HOME,
    configFile: config.CONFIG_FILE, dataDir: config.DATA_DIR, platform: process.platform,
    distro: require('./distro').info(), appParent: config.APP_PARENT,
  }));
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  config.load();
  if (!handlers.size) loadModules();
  const token = crypto.randomBytes(32).toString('hex');
  let origin = '';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, origin);
    const cookies = parseCookies(req.headers.cookie);

    // First visit from the app window: trade the URL token for a cookie.
    // The page comes back straight away with the cookie (no redirect: some
    // security software on Windows cuts off a redirected local page), and
    // the page then takes the token out of its address.
    let setCookie = false;
    if (url.searchParams.has('t')) {
      if (!safeEqual(url.searchParams.get('t'), token)) { res.writeHead(403); return res.end('Forbidden'); }
      setCookie = true;
    } else if (!safeEqual(cookies.cpw, token)) { res.writeHead(403); return res.end('Forbidden'); }

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(WEB_ROOT, rel));
    if (!file.startsWith(WEB_ROOT + path.sep)) { res.writeHead(404); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const headers = {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      if (setCookie) headers['Set-Cookie'] = `cpw=${token}; HttpOnly; SameSite=Strict; Path=/`;
      if (file.endsWith('.html')) {
        headers['Content-Security-Policy'] = [
          "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:", "font-src 'self' data:", `connect-src 'self' ${origin.replace('http', 'ws')}`,
          "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
        ].join('; ');
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const cookies = parseCookies(req.headers.cookie);
    if (!safeEqual(cookies.cpw, token) || req.headers.origin !== origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      everConnected = true;
      clearTimeout(idleTimer);
      ws.on('close', () => { sockets.delete(ws); if (!sockets.size && api.onLastClose) idleTimer = setTimeout(api.onLastClose, IDLE_MS); });
      ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        const fn = handlers.get(msg.m);
        if (!fn) return ws.send(JSON.stringify({ id: msg.id, e: `Unknown method ${msg.m}` }));
        try {
          const r = await fn(msg.p || {});
          ws.send(JSON.stringify({ id: msg.id, r: r === undefined ? null : toWindow(msg.m, r) }));
        } catch (err) {
          ws.send(JSON.stringify({ id: msg.id, e: err && err.message ? err.message : String(err) }));
        }
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      origin = `http://${host}:${p}`;
      resolve({
        port: p, token, origin, url: `${origin}/?t=${token}`,
        close: () => new Promise((r) => { for (const ws of sockets) ws.terminate(); wss.close(); server.close(r); }),
      });
    });
  });
}

module.exports = { startServer, register, broadcast };

// `npm run web`: no Electron, open the printed URL in a browser instead.
if (require.main === module) {
  const portArg = process.argv.indexOf('--port');
  startServer({ port: portArg > 0 ? Number(process.argv[portArg + 1]) : 0 }).then((s) => {
    console.log(`MHDE (browser mode)\nOpen: ${s.url}`);
    if (process.env.CPW_URL_FILE) fs.writeFileSync(process.env.CPW_URL_FILE, s.url);
  });
  const stop = () => { for (const fn of (api.onExit || [])) try { fn(); } catch (e) {} process.exit(0); };
  if (process.env.CPW_EXIT_WHEN_CLOSED) {
    api.onLastClose = () => { console.log('The window was closed: stopping.'); stop(); };
    // and if no window ever turns up (the browser didn't start), don't linger
    setTimeout(() => { if (!everConnected) { console.log('No window connected in 2 minutes: stopping.'); stop(); } }, 120000).unref();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports.api = api;
