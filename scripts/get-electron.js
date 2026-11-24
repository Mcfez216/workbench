'use strict';
// npm install's last step: download Electron's program (what draws the app's
// window). Electron 44 otherwise fetches it the first time the app starts,
// which from a Start menu shortcut looks like nothing happening, and leaves
// setup-ubuntu.sh's sandbox step without a program to point at.
// ELECTRON_SKIP_BINARY_DOWNLOAD=1 skips it (as it used to skip Electron's own).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) process.exit(0);
// No Electron for OpenBSD or FreeBSD: there the window is a Chromium app
// window (scripts/app-window.js), so there's nothing to download.
if (!['linux', 'darwin', 'win32'].includes(process.platform)) {
  console.log(`No Electron for ${process.platform}: npm start opens the app in a Chromium window instead.`);
  process.exit(0);
}
const dir = path.join(__dirname, '..', 'node_modules', 'electron');
const install = path.join(dir, 'install.js');
if (!fs.existsSync(install)) process.exit(0);          // electron not installed (npm install --omit=dev)
console.log('Getting Electron, the app\'s window (about 100 MB the first time)...');
const r = spawnSync(process.execPath, [install], { stdio: 'inherit', cwd: dir });
if (r.status !== 0) {
  console.error('\nElectron did not download. Check the internet connection (and proxy), then run: npm install');
  process.exit(1);
}
