'use strict';
// Passwords live in the GNOME keyring via secret-tool (Ubuntu: libsecret-tools,
// Fedora: libsecret), never in a file. The mail password is looked up with the
// same attributes the vault's neomuttrc uses (service neomutt user <address>),
// so a password you already stored for NeoMutt works here as it is.
//
// "Not stored yet" and "no keyring is running" are different problems (the
// second is the usual one in WSL), so they get different messages.

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const distro = require('./distro');
const platform = require('./platform');

// ------------------------------------------------------------------ Windows
// No keyring service there: each password is encrypted with DPAPI, which
// only your Windows account can decrypt (PowerShell's SecureString), and
// kept in the app's data folder. The password goes in and out on stdin and
// stdout, never on a command line.
function dpapiFile(service, user) {
  const name = crypto.createHash('sha256').update(`${service}\0${user}`).digest('hex').slice(0, 32);
  return require('./config').dataPath('secrets', `${name}.dpapi`);
}
function powershell(script, file, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, CPW_SECRET_FILE: file }, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`Windows couldn't ${input === undefined ? 'read' : 'store'} the password: ${err.trim().split('\n')[0] || `exit ${code}`}`))));
    p.stdin.on('error', () => {});
    p.stdin.end(input === undefined ? '' : input);
  });
}
const PS_STORE = '$s = [Console]::In.ReadToEnd(); '
  + '$e = ConvertFrom-SecureString (ConvertTo-SecureString $s -AsPlainText -Force); '
  + '[IO.File]::WriteAllText($env:CPW_SECRET_FILE, $e)';
const PS_LOOKUP = '$e = [IO.File]::ReadAllText($env:CPW_SECRET_FILE).Trim(); '
  + '$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $e)); '
  + 'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }';
async function lookupWindows(service, user) {
  const f = dpapiFile(service, user);
  if (!fs.existsSync(f)) return null;
  return (await powershell(PS_LOOKUP, f)) || null;
}
async function storeWindows(service, user, secret) {
  const f = dpapiFile(service, user);
  await powershell(PS_STORE, f, secret);
  return true;
}

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
  if (platform.WIN) return lookupWindows(service, user);
  return new Promise((resolve, reject) => {
    execFile('secret-tool', ['lookup', 'service', service, 'user', user], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return reject(missing());
      if (err) return stderr && stderr.trim() ? reject(keyringTrouble(stderr)) : resolve(null);
      resolve(stdout.replace(/\n$/, '') || null);
    });
  });
}

function store(service, user, secret, label) {
  if (platform.WIN) return storeWindows(service, user, secret);
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

module.exports = { lookup, store, dpapiFile, PS_STORE, PS_LOOKUP };
