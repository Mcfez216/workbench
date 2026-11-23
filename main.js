'use strict';
// The desktop app: starts the backend inside Electron's main process and
// opens the window on it. `npm start`.
//
// Security, in short: the window only ever shows the app's own pages; any
// other link opens in your normal browser. The page has no Node access
// (contextIsolation + sandbox). YouTube Music runs in a separate <webview>
// with its own cookie jar (persist:music), no preload, no Node, and it may
// only show YouTube / Google sign-in pages.

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
const path = require('path');
const { startServer, api } = require('./server/index');

const MUSIC_PAGES = /^https:\/\/(music\.youtube\.com|www\.youtube\.com|m\.youtube\.com|consent\.youtube\.com|accounts\.google\.com|accounts\.youtube\.com|(www\.)?google\.[a-z.]+)(\/|$)/;

let win = null;
let srv = null;

const distro = require('./server/distro');

// In WSL, links open in your Windows browser (wslview, from the wslu
// package); elsewhere in your desktop's default browser.
function openOutside(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (distro.WSL) {
    const child = require('child_process').spawn('wslview', [url], { stdio: 'ignore', detached: true });
    child.on('error', () => shell.openExternal(url));
    child.unref();
    return;
  }
  shell.openExternal(url);
}

// WSLg's GPU path doesn't suit every graphics driver (a blank or black
// window); software drawing is plenty for an editor. WORKBENCH_GPU=1 turns
// the GPU back on.
if (distro.WSL && process.env.WORKBENCH_GPU !== '1') app.disableHardwareAcceleration();

// Scrolling under WSLg: the animated "smooth" scroll asks for a new frame
// every few milliseconds, and each frame crosses WSLg's remote-desktop link,
// so wheel scrolling stutters or seems stuck. Jump straight to the new
// position instead, and draw through X11 (XWayland), which WSLg presents far
// more smoothly than native Wayland. WORKBENCH_SMOOTH=1 and
// WORKBENCH_OZONE=wayland|auto bring the defaults back.
if (distro.WSL) {
  if (process.env.WORKBENCH_SMOOTH !== '1') app.commandLine.appendSwitch('disable-smooth-scrolling');
  const ozone = process.env.WORKBENCH_OZONE || 'x11';
  if (ozone !== 'auto') app.commandLine.appendSwitch('ozone-platform', ozone);
}

async function createWindow() {
  srv = srv || await startServer({ port: 0 });
  const { origin } = srv;

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const fromApp = (details.requestingUrl || '').startsWith(origin + '/');
    cb(fromApp && ['clipboard-sanitized-write', 'clipboard-read', 'fullscreen'].includes(permission));
  });
  session.fromPartition('persist:music').setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'fullscreen'));

  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 500,
    backgroundColor: '#0000AA', title: 'C++ Path Workbench', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin + '/')) { e.preventDefault(); openOutside(url); }
  });
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    if (params.partition !== 'persist:music' || !MUSIC_PAGES.test(params.src)) e.preventDefault();
  });

  // The page asks before closing with unsaved files (beforeunload); Electron
  // needs the question asked here.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Keep editing', 'Quit without saving'], defaultId: 0, cancelId: 0,
      message: 'Some files have unsaved changes.', detail: 'Quit anyway and lose them?',
    });
    if (choice === 1) e.preventDefault();
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  win.on('closed', () => { win = null; });
  await win.loadURL(srv.url);
}

// The music view: links that leave YouTube go to your browser.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  contents.on('will-navigate', (e, url) => { if (!MUSIC_PAGES.test(url)) { e.preventDefault(); openOutside(url); } });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  Menu.setApplicationMenu(null);           // the app draws its own menu bar; F10 and Alt+letter reach it
  app.whenReady().then(createWindow).catch((err) => {
    dialog.showErrorBox('C++ Path Workbench could not start', String(err && err.stack || err));
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    for (const fn of api.onExit) { try { fn(); } catch (e) { /* closing anyway */ } }
    if (srv) srv.close();
  });
}
