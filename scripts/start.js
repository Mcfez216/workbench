'use strict';
// npm start: the app in its own window. Electron where Electron runs (Linux,
// WSL, macOS, Windows); elsewhere (OpenBSD, FreeBSD) a Chromium app window,
// scripts/app-window.js. CPW_APP_WINDOW=1 picks the second anywhere.
const { spawn } = require('child_process');
const path = require('path');

const ELECTRON_OK = ['linux', 'darwin', 'win32'].includes(process.platform);
if (!ELECTRON_OK || process.env.CPW_APP_WINDOW) {
  require('./app-window.js');
} else {
  // the same as `electron .` (Electron's own launcher, which also fetches
  // its program if it's missing)
  const cli = require.resolve('electron/cli.js');
  const child = spawn(process.execPath, [cli, path.join(__dirname, '..'), ...process.argv.slice(2)], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => process.exit(code === null ? (signal === 'SIGINT' ? 130 : 1) : code));
}
