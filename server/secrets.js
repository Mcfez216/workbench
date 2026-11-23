'use strict';
// Passwords live in the GNOME keyring via secret-tool (Ubuntu: libsecret-tools,
// Fedora: libsecret), never in a file. The mail password is looked up with the
// same attributes the vault's neomuttrc uses (service neomutt user <address>),
// so a password you already stored for NeoMutt works here as it is.
//
// "Not stored yet" and "no keyring is running" are different problems (the
// second is the usual one in WSL), so they get different messages.

const { execFile, spawn } = require('child_process');
const distro = require('./distro');

function missing() { return new Error(`secret-tool is missing: ${distro.installHint('secret-tool')}`); }

function keyringTrouble(stderr) {
  const said = String(stderr).trim().split('\n')[0].replace(/^secret-tool:\s*/, '');
  if (distro.WSL) {
    return new Error(`No keyring is answering in WSL (secret-tool: ${said}). Install one: ${distro.installLine(['gnome-keyring', 'libsecret-tools', 'dbus-x11'])} `
      + '(scripts/setup-ubuntu.sh does this), then run "wsl --shutdown" in PowerShell, open Ubuntu again and retry. '
      + 'The first time, a window should ask you to choose a password for the new keyring.');
  }
  return new Error(`No keyring is answering (secret-tool: ${said}). Passwords need GNOME Keyring (or another Secret Service) running in your desktop session.`);
}

// Resolves to the password, or null if none is stored; rejects if the keyring
// itself can't be reached.
function lookup(service, user) {
  return new Promise((resolve, reject) => {
    execFile('secret-tool', ['lookup', 'service', service, 'user', user], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return reject(missing());
      if (err) return stderr && stderr.trim() ? reject(keyringTrouble(stderr)) : resolve(null);
      resolve(stdout.replace(/\n$/, '') || null);
    });
  });
}

function store(service, user, secret, label) {
  return new Promise((resolve, reject) => {
    const p = spawn('secret-tool', ['store', `--label=${label}`, 'service', service, 'user', user]);
    let err = '';
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', (e) => reject(e.code === 'ENOENT' ? missing() : e));
    p.on('close', (code) => (code === 0 ? resolve(true) : reject(err.trim() ? keyringTrouble(err) : new Error('secret-tool store failed'))));
    p.stdin.on('error', () => {});
    p.stdin.end(secret);
  });
}

module.exports = { lookup, store };
