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
    look: { palette: 'soft', retroFont: 'vga' },   // soft | vga colours; vga | modern font in the retro themes
    language: 'cpp',             // cpp | c: what new files, the sandbox and the judge start as
    keymap: 'vim',               // vim | standard | emacs (the vault's editor is Neovim, note 0.3)
    fontSize: 16,
    workspace,                   // where you copied the vault's _code (note: CPP Start Here)
    folders: [],                 // more folders shown in Files next to the workspace
    vault: null,                 // old single-vault setting; kept in step with vaults[0]
    vaults: [],                  // [{ path, name }]: every notes vault shown in Guides
    editor: { autosave: false, wrap: false, snippets: true, banned: true },   // banned: underline gets, strcpy... in C and C++
    exercisesDir: '~/workbench-exercises',
    // comfort: calmer for ADHD / autistic brains (and everyone else)
    comfort: {
      reduceMotion: false,     // no blinking cursors, animations or smooth scrolling
      quiet: false,            // messages wait in the inbox instead of popping up (errors still show)
      readingFont: 'mono',     // mono | readable (Atkinson Hyperlegible, Lexend, OpenDyslexic... if installed)
      spacing: 'normal',       // normal | relaxed (more space between lines and letters in guides and pages)
      breakReminder: 0,        // minutes of work before a gentle "take a break?" (0: never)
      whereOnStart: true,      // "Where was I?" when you come back after a while
    },
    focus: { minutes: 25, breakMinutes: 5 },
    build: {
      buildType: 'Debug',        // Debug has ASan + UBSan on (the vault's CMakeLists.txt)
      jobs: Math.max(1, os.cpus().length),
      compiler: 'g++',           // for single files, the sandbox and the judge: g++ or clang++
      std: 'c++20',
      cCompiler: 'gcc',          // the same for C: gcc or clang
      cStd: 'c17',
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
  current = normalize(merge(defaults(), saved));
  if (!current.vaults.length) {
    const found = findVault();
    if (found) current.vaults = [{ path: found, name: vaultName(found) }];
  }
  current.vault = current.vaults[0] ? current.vaults[0].path : null;
  return current;
}

function vaultName(p) { return path.basename(String(p).replace(/\/+$/, '')) || p; }

// Settings files from before several vaults: "vault" becomes the first of
// "vaults". Entries are cleaned up (no blanks, no duplicates, always named).
function normalize(c) {
  let list = Array.isArray(c.vaults) ? c.vaults : [];
  list = list.map((v) => (typeof v === 'string' ? { path: v } : v)).filter((v) => v && v.path && String(v.path).trim());
  if (!list.length && c.vault) list = [{ path: c.vault }];
  const seen = new Set();
  c.vaults = [];
  for (const v of list) {
    const key = path.normalize(expand(String(v.path).trim())).replace(/(.)\/+$/, '$1');
    if (seen.has(key)) continue;
    seen.add(key);
    c.vaults.push({ path: String(v.path).trim(), name: (v.name && String(v.name).trim()) || vaultName(v.path) });
  }
  c.vault = c.vaults[0] ? c.vaults[0].path : null;
  c.folders = (Array.isArray(c.folders) ? c.folders : []).map(String).map((f) => f.trim()).filter(Boolean);
  if (!['c', 'cpp'].includes(c.language)) c.language = 'cpp';
  return c;
}

function get() { return current || load(); }

function save(next) {
  // "vaults" is the real list; the old "vault" only counts when it's missing
  if (next && Array.isArray(next.vaults)) next = { ...next, vault: next.vaults[0] ? (next.vaults[0].path || next.vaults[0]) : null };
  current = normalize(merge(defaults(), next));
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
