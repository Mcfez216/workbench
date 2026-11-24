'use strict';
// Which Linux this is: Fedora or Ubuntu (or Debian and friends), and
// whether it's running inside WSL on Windows. Used for the "how to install
// it" hints, opening links in the Windows browser, and finding a vault that
// lives on the Windows side (C:\Users\you\Documents\...).

const fs = require('fs');
const os = require('os');
const path = require('path');

function readOsRelease(file = '/etc/os-release') {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=("?)(.*)\2$/);
      if (m) out[m[1]] = m[3];
    }
  } catch (e) { /* not Linux, or a very odd one */ }
  return out;
}

function familyOf(rel) {
  const ids = `${rel.ID || ''} ${rel.ID_LIKE || ''}`.toLowerCase();
  if (/\b(debian|ubuntu)\b/.test(ids)) return 'debian';
  if (/\b(fedora|rhel|centos)\b/.test(ids)) return 'fedora';
  return 'other';
}

function detectWsl() {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try { return /microsoft/i.test(fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8')); } catch (e) { return false; }
}

const REL = readOsRelease(process.env.WORKBENCH_OS_RELEASE || '/etc/os-release');
const FAMILY = process.env.WORKBENCH_DISTRO || familyOf(REL);
const WSL = process.env.WORKBENCH_WSL ? process.env.WORKBENCH_WSL === '1' : detectWsl();

// The package that provides each tool, per family
const PKG = {
  'g++': { fedora: 'gcc-c++', debian: 'g++' },
  gcc: { fedora: 'gcc', debian: 'gcc' },
  make: { fedora: 'make', debian: 'make' },
  'clang++': { fedora: 'clang', debian: 'clang' },
  cmake: { fedora: 'cmake', debian: 'cmake' },
  ctest: { fedora: 'cmake', debian: 'cmake' },
  ninja: { fedora: 'ninja-build', debian: 'ninja-build' },
  gdb: { fedora: 'gdb', debian: 'gdb' },
  clangd: { fedora: 'clang-tools-extra', debian: 'clangd' },
  'clang-tidy': { fedora: 'clang-tools-extra', debian: 'clang-tidy' },
  'clang-format': { fedora: 'clang-tools-extra', debian: 'clang-format' },
  cppcheck: { fedora: 'cppcheck', debian: 'cppcheck' },
  valgrind: { fedora: 'valgrind', debian: 'valgrind' },
  git: { fedora: 'git', debian: 'git' },
  rg: { fedora: 'ripgrep', debian: 'ripgrep' },
  'c++filt': { fedora: 'binutils', debian: 'binutils' },
  'secret-tool': { fedora: 'libsecret', debian: 'libsecret-tools' },
  gio: { fedora: 'glib2', debian: 'libglib2.0-bin' },
  man: { fedora: 'man-db man-pages', debian: 'man-db manpages-dev' },
  python3: { fedora: 'python3', debian: 'python3' },
  'dosbox-x': { fedora: 'dosbox-x', debian: 'dosbox-x' },
  wslview: { fedora: 'wslu', debian: 'wslu' },
  'libclang-rt': { fedora: 'compiler-rt', debian: 'libclang-rt-dev' },
};

function pkgFor(tool) {
  const p = PKG[tool];
  if (!p) return tool;
  return p[FAMILY] || p.debian;
}

function installLine(pkgs) {
  const list = [...new Set(pkgs.flatMap((p) => p.split(' ')))].join(' ');
  if (FAMILY === 'debian') return `sudo apt install ${list}`;
  if (FAMILY === 'fedora') return `sudo dnf install ${list}`;
  return `install ${list} with your package manager`;
}

// "sudo apt install clangd", for an error message
function installHint(tool) {
  if (tool === 'dosbox-x' && FAMILY === 'fedora') return 'sudo dnf copr enable rob72/DOSBox-X && sudo dnf install dosbox-x';
  return installLine([pkgFor(tool)]);
}

// Windows user folders, seen from WSL (/mnt/c/Users/<you>)
const NOT_PEOPLE = new Set(['public', 'default', 'default user', 'all users', 'defaultuser0', 'wdagutilityaccount', 'desktop.ini']);
function windowsHomes(usersDir = process.env.WORKBENCH_WIN_USERS || '/mnt/c/Users') {
  if (!WSL && !process.env.WORKBENCH_WIN_USERS) return [];
  try {
    return fs.readdirSync(usersDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !NOT_PEOPLE.has(e.name.toLowerCase()))
      .map((e) => path.join(usersDir, e.name));
  } catch (e) { return []; }
}

// Where to look for an Obsidian vault: your Linux home, and under WSL your
// Windows Documents, OneDrive and Desktop too. [folder, how deep]
function vaultSearchRoots(home = os.homedir()) {
  const roots = [[home, 3], ...['Documents', 'Obsidian', 'Notes', 'vault', 'CPP'].map((d) => [path.join(home, d), 4])];
  for (const w of windowsHomes()) {
    roots.push([path.join(w, 'Documents'), 4], [path.join(w, 'Desktop'), 3], [path.join(w, 'Obsidian'), 4]);
    try {
      for (const n of fs.readdirSync(w)) if (/^OneDrive/i.test(n)) roots.push([path.join(w, n, 'Documents'), 4], [path.join(w, n), 3]);
    } catch (e) { /* not readable */ }
    roots.push([w, 2]);
  }
  return roots;
}

const SKIP = new Set(['node_modules', '.git', '.cache', '.local', '.npm', 'build', 'snap', '.var', '.config',
  'appdata', 'application data', 'local settings', 'program files', 'program files (x86)', 'windows', '$recycle.bin',
  'anaconda3', 'miniconda3', '.conda', 'go', '.cargo', '.rustup', '.vscode-server']);

// The first folder holding `marker` (e.g. "CPP Start Here.md"), or null.
// Bounded: it looks at a few thousand folders at most, once, on first run.
function findFolderWith(marker, { home = os.homedir(), accept = () => true } = {}) {
  const seen = new Map();                   // dir -> how deep we've looked below it
  let budget = 4000;
  const walk = (dir, depth) => {
    if (budget-- <= 0 || (seen.get(dir) ?? -1) >= depth) return null;
    seen.set(dir, depth);
    if (fs.existsSync(path.join(dir, marker)) && accept(dir)) return dir;
    if (depth <= 0) return null;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name.toLowerCase())) continue;
      const hit = walk(path.join(dir, e.name), depth - 1);
      if (hit) return hit;
    }
    return null;
  };
  for (const [dir, depth] of vaultSearchRoots(home)) {
    const hit = walk(dir, depth);
    if (hit) return hit;
  }
  return null;
}

function info() {
  return { family: FAMILY, wsl: WSL, name: REL.PRETTY_NAME || REL.NAME || os.type(), id: REL.ID || '', version: REL.VERSION_ID || '' };
}

module.exports = { FAMILY, WSL, info, pkgFor, installLine, installHint, windowsHomes, vaultSearchRoots, findFolderWith, familyOf, readOsRelease };
