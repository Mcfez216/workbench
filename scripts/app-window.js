'use strict';
// The app in its own window without Electron, for systems Electron doesn't
// support (OpenBSD, FreeBSD). The backend runs here; Chromium opens the page
// in "app" mode: a plain window with no tabs, no address bar and no
// bookmarks, with its own profile, so it's a separate program in your
// window list rather than one more browser tab. Without Chromium, Firefox
// opens it in a window of its own (that one has its address bar).
//
//   node scripts/app-window.js            start (npm start does this on OpenBSD)
//   node scripts/app-window.js --check    say which browser it would use, and stop
//
// CPW_BROWSER=/path/to/browser picks one; CPW_BROWSER_FLAGS adds options. The backend stops by itself about
// 20 seconds after the window closes. Starting it again while it's running
// opens another window on the same backend.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const STATE = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'cpp-path-workbench');
const RUNNING = path.join(STATE, 'window-backend.json');
const CHECK = process.argv.includes('--check');

function onPath(cmd) {
  if (cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null;
  for (const d of (process.env.PATH || '').split(':').concat(['/usr/local/bin', '/usr/bin'])) {
    if (!d) continue;
    const p = path.join(d, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* next */ }
  }
  return null;
}

// OpenBSD's Chromium package installs as "chrome". Chromium there is
// unveil(2)ed to a few folders, ~/.config/chromium among them, so the app's
// profile goes inside that one.
const CHROMIUMS = ['chrome', 'chromium', 'chromium-browser', 'ungoogled-chromium', 'iridium', 'google-chrome', 'brave-browser'];
const FIREFOXES = ['firefox', 'firefox-esr', 'librewolf'];
function pickBrowser() {
  const want = process.env.CPW_BROWSER;
  if (want) {
    const p = onPath(want);
    if (!p) return { error: `CPW_BROWSER is ${want}, which isn't there` };
    return { path: p, kind: /fox|wolf/i.test(path.basename(p)) ? 'firefox' : 'chromium' };
  }
  for (const c of CHROMIUMS) { const p = onPath(c); if (p) return { path: p, kind: 'chromium' }; }
  for (const c of FIREFOXES) { const p = onPath(c); if (p) return { path: p, kind: 'firefox' }; }
  return { error: 'No Chromium or Firefox found' };
}
function profileDir() {
  const chromiumHome = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'chromium');
  return process.platform === 'openbsd' ? path.join(chromiumHome, 'cpp-path-workbench') : path.join(STATE, 'window-profile');
}
function browserArgs(b, url) {
  const extra = (process.env.CPW_BROWSER_FLAGS || '').split(/\s+/).filter(Boolean);
  if (b.kind === 'firefox') return [...extra, '--new-window', url];
  return [...extra, `--app=${url}`, `--user-data-dir=${profileDir()}`, '--class=cpp-path-workbench', '--no-first-run',
    '--no-default-browser-check', '--disable-features=Translate', '--window-size=1440,900'];
}

function installHint() {
  if (process.platform === 'openbsd') return 'doas pkg_add chromium';
  if (process.platform === 'freebsd') return 'doas pkg install chromium   (or sudo)';
  return 'install Chromium (or Firefox) with your package manager';
}

// A backend that's already running (a second start opens another window on it)
function alive(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
async function runningBackend() {
  try {
    const r = JSON.parse(fs.readFileSync(RUNNING, 'utf8'));
    process.kill(r.pid, 0);
    if (await alive(r.url)) return r;
  } catch (e) { /* none */ }
  return null;
}

async function startBackend() {
  fs.mkdirSync(STATE, { recursive: true });
  const urlFile = path.join(STATE, `url-${process.pid}`);
  fs.rmSync(urlFile, { force: true });
  const log = fs.openSync(path.join(STATE, 'window.log'), 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--web'], {
    cwd: ROOT, detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, CPW_URL_FILE: urlFile, CPW_EXIT_WHEN_CLOSED: process.env.CPW_EXIT_WHEN_CLOSED || '20' },
  });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  for (let i = 0; i < 150 && !exited && !(fs.existsSync(urlFile) && fs.statSync(urlFile).size); i++) await new Promise((r) => setTimeout(r, 100));
  if (!fs.existsSync(urlFile)) throw new Error(`The backend didn't start (exit ${exited}). See ${path.join(STATE, 'window.log')}`);
  const url = fs.readFileSync(urlFile, 'utf8').trim();
  fs.rmSync(urlFile, { force: true });
  fs.writeFileSync(RUNNING, JSON.stringify({ pid: child.pid, url }));
  child.unref();
  return { pid: child.pid, url };
}

async function main() {
  const b = pickBrowser();
  if (CHECK) {
    console.log(b.error ? `no window: ${b.error} (${installHint()})` : `${b.kind}: ${b.path}`);
    if (!b.error) console.log(`${path.basename(b.path)} ${browserArgs(b, 'URL').join(' ')}`);
    process.exit(b.error ? 1 : 0);
  }
  const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-web.js')], { cwd: ROOT, stdio: 'ignore' });
  if (build.status !== 0) console.error('Rebuilding the page failed; using the last build.');
  const backend = (await runningBackend()) || (await startBackend());
  if (b.error) {
    console.log(`${b.error}: ${installHint()}\nMeanwhile, open this in any browser:\n  ${backend.url}`);
    return;
  }
  if (b.kind === 'chromium') fs.mkdirSync(profileDir(), { recursive: true });
  const win = spawn(b.path, browserArgs(b, backend.url), { stdio: 'ignore' });
  win.on('error', (e) => console.error(`${b.path}: ${e.message}\nOpen this in a browser instead:\n  ${backend.url}`));
  console.log(`C++ Path Workbench: a ${b.kind === 'chromium' ? 'Chromium app' : 'Firefox'} window (${b.path}).`);
  win.on('exit', () => process.exit(0));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
