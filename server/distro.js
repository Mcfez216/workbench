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
  if (require('./platform').OPENBSD) return 'openbsd';
  if (require('./platform').WIN) return 'windows';
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
// OpenBSD: clang is the system compiler (cc, c++, clang, clang++), and
// packaged GNU tools get an e in front: egdb, egcc, eg++.
const OPENBSD_PKG = {
  'g++': 'g++', gcc: 'gcc', make: null, 'clang++': null, clang: null, cmake: 'cmake', ctest: 'cmake', ninja: 'ninja',
  gdb: 'gdb', egdb: 'gdb', clangd: 'clang-tools-extra', 'clang-tidy': 'clang-tools-extra', 'clang-format': 'clang-tools-extra',
  cppcheck: 'cppcheck', valgrind: 'valgrind', git: 'git', rg: 'ripgrep', 'c++filt': 'binutils', 'secret-tool': 'libsecret',
  gio: 'glib2', man: null, python3: 'python%3', 'dosbox-x': 'dosbox', wslview: null, 'libclang-rt': null, node: 'node', chrome: 'chromium',
};

function pkgFor(tool) {
  if (FAMILY === 'openbsd') return tool in OPENBSD_PKG ? OPENBSD_PKG[tool] : tool;
  const p = PKG[tool];
  if (!p) return tool;
  return p[FAMILY] || p.debian;
}

function installLine(pkgs) {
  const list = [...new Set(pkgs.filter(Boolean).flatMap((p) => p.split(' ')))].join(' ');
  if (FAMILY === 'openbsd') return `doas pkg_add ${list}`;
  if (FAMILY === 'debian') return `sudo apt install ${list}`;
  if (FAMILY === 'fedora') return `sudo dnf install ${list}`;
  return `install ${list} with your package manager`;
}

// "sudo apt install clangd", for an error message
// Rust comes from rustup everywhere (Ubuntu's own rustc is too old for the
// 2024 edition); its extra tools are rustup components
const RUST_TOOLS = { rustc: null, cargo: null, 'rust-gdb': null, 'rust-analyzer': 'rust-analyzer', 'clippy-driver': 'clippy', rustfmt: 'rustfmt' };
const OPENBSD_RUST = { rustc: 'rust', cargo: 'rust', 'rust-gdb': 'rust', 'rust-analyzer': 'rust-analyzer', 'clippy-driver': 'rust-clippy', rustfmt: 'rust-rustfmt' };
function rustHint(tool) {
  if (FAMILY === 'openbsd') return `doas pkg_add ${OPENBSD_RUST[tool]}`;
  if (FAMILY === 'windows') return 'run "Install on Windows (no WSL).cmd" again: it installs Rust with rustup';
  const comp = RUST_TOOLS[tool];
  if (comp && require('./platform').onPath('rustup')) return `rustup component add ${comp}`;
  return 'install Rust with rustup: bash scripts/setup-ubuntu.sh --with-rust (or see rustup.rs)';
}

function installHint(tool) {
  if (tool in RUST_TOOLS) return rustHint(tool);
  if (FAMILY === 'windows') {
    if (tool === 'valgrind') return 'Valgrind doesn\'t exist for Windows: the sanitizers find the same bugs (or use the WSL version)';
    if (['dosbox-x', 'owcc', 'wslview', 'secret-tool', 'gio', 'man'].includes(tool)) return 'not part of the Windows version';
    return 'run "Install on Windows (no WSL).cmd" again: it sets up the toolchain in %LOCALAPPDATA%\\CppPathWorkbenchNative\\tools';
  }
  if (FAMILY === 'openbsd') {
    if (tool === 'g++' || tool === 'gcc') return 'OpenBSD\'s compiler is clang: choose clang++ / clang in Settings → Build (or doas pkg_add g++, which installs as eg++)';
    if (tool === 'gdb' || tool === 'egdb') return 'doas pkg_add gdb (it installs as egdb, which the app uses)';
    if (tool === 'libclang-rt') return 'OpenBSD has no libFuzzer: fuzz on Linux or WSL';
    if (tool === 'wslview') return 'not needed on OpenBSD';
    if (!pkgFor(tool)) return 'part of OpenBSD itself';
  }
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
  return { family: FAMILY, wsl: WSL, name: REL.PRETTY_NAME || REL.NAME || `${os.type()} ${os.release()}`, id: REL.ID || os.type().toLowerCase(), version: REL.VERSION_ID || os.release() };
}

module.exports = { FAMILY, WSL, info, pkgFor, installLine, installHint, windowsHomes, vaultSearchRoots, findFolderWith, familyOf, readOsRelease };
