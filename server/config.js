'use strict';
// Settings and per-user data. Settings live in ~/.config/cpp-path-workbench/
// config.json (XDG_CONFIG_HOME respected); data such as sandbox files, judge
// builds and revision progress in ~/.local/share/cpp-path-workbench/.
// Passwords are never stored here: mail and IRC use the GNOME keyring (secrets.js).

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'cpp-path-workbench');
const DATA_DIR = path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share'), 'cpp-path-workbench');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const APP_PARENT = path.resolve(__dirname, '..', '..');     // the folder this app was unzipped into

function firstExisting(paths) {
  for (const p of paths) {
    try { if (fs.statSync(p).isDirectory()) return p; } catch (e) { /* not there */ }
  }
  return null;
}

const START_NOTE = 'CPP Start Here.md';

// The vault: the folder with "CPP Start Here.md" in it, wherever it is under
// your home folder (or, in WSL, your Windows Documents / OneDrive / Desktop).
// A bounded search, run once until it's in the config.
function findVault() {
  return require('./distro').findFolderWith(START_NOTE);
}

function defaults() {
  // ~/cpp-path as the vault says, or next to this app (~/CPP/cpp-path if the app is in ~/CPP)
  const workspace = firstExisting([path.join(HOME, 'cpp-path'), path.join(APP_PARENT, 'cpp-path'), path.join(HOME, 'src')]) || HOME;
  return {
    theme: 'blue',
    keymap: 'vim',               // vim | standard | emacs (the vault's editor is Neovim, note 0.3)
    fontSize: 16,
    workspace,                   // where you copied the vault's _code (note: CPP Start Here)
    vault: null,                 // the CPP-Path folder; found on first start if left empty
    build: {
      buildType: 'Debug',        // Debug has ASan + UBSan on (the vault's CMakeLists.txt)
      jobs: Math.max(1, os.cpus().length),
      compiler: 'g++',           // for single files, the sandbox and the judge: g++ or clang++
      std: 'c++20',
      sandboxFlags: ['-Wall', '-Wextra', '-Wpedantic', '-g', '-O0', '-fsanitize=address,undefined', '-fno-omit-frame-pointer'],
    },
    judge: { timeLimitMs: 2000, flags: ['-O2', '-Wall'] },
    tidy: { checks: '' },        // empty: your .clang-tidy file, or clang-tidy's defaults
    clangd: { enabled: true, command: 'clangd', args: ['--background-index', '--clang-tidy', '--header-insertion=never', '--completion-style=detailed', '--function-arg-placeholders=false'] },
    irc: {
      host: 'irc.libera.chat', port: 6697, tls: true,
      nick: '', username: '', realname: '',
      login: 'none',             // none | sasl (account + password in the keyring) | certfp (SASL EXTERNAL)
      account: '',
      certFile: '',
      channels: ['#c++-basic'],
      autoConnect: false,
    },
    mail: {
      name: '', address: '',
      imapHost: 'imap.gmail.com', imapPort: 993,
      smtpHost: 'smtp.gmail.com', smtpPort: 465,
      keyringService: 'neomutt',  // shared with NeoMutt (and the Kernel Path Workbench) if you use them
      folders: ['INBOX'],
      fetchCount: 200,
    },
    music: { url: 'https://music.youtube.com/' },
  };
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

let current = null;

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* first run */ }
  current = merge(defaults(), saved);
  if (!current.vault) current.vault = findVault();
  return current;
}

function get() { return current || load(); }

function save(next) {
  current = merge(defaults(), next);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
  return current;
}

function dataPath(...parts) {
  const p = path.join(DATA_DIR, ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

function expand(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return p;
}

module.exports = { load, get, save, dataPath, expand, APP_PARENT, findVault, HOME, CONFIG_FILE, DATA_DIR };
