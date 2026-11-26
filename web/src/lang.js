// C, C++ or Rust: the language you're working in right now. It decides what
// new files, new projects, the sandbox and the judge start as, which
// standard (or Rust edition) and compiler a lone file uses, whether a .h
// header is C or C++, and what the toolbar and status line say. Files you
// open keep their own language (a .c file is always C, a .rs file always
// Rust); this is the default for everything else.

const listeners = new Set();
let current = 'cpp';
let build = { compiler: 'g++', std: 'c++20', cCompiler: 'gcc', cStd: 'c17', rustEdition: '2024' };

export const ORDER = ['c', 'cpp', 'rust'];
export const LANGS = {
  c: { id: 'c', label: 'C', ext: 'c', header: 'h', compilers: ['gcc', 'clang'], stds: [['c89', 'C89'], ['c99', 'C99'], ['c11', 'C11'], ['c17', 'C17'], ['c2x', 'C23']] },
  cpp: { id: 'cpp', label: 'C++', ext: 'cpp', header: 'hpp', compilers: ['g++', 'clang++'], stds: [['c++17', 'C++17'], ['c++20', 'C++20'], ['c++23', 'C++23']] },
  // Rust: one compiler; the "standard" is the edition
  rust: { id: 'rust', label: 'Rust', ext: 'rs', header: null, compilers: ['rustc'], stds: [['2021', 'Edition 2021'], ['2024', 'Edition 2024']] },
};
const valid = (id) => (ORDER.includes(id) ? id : 'cpp');

export function language() { return current; }
export function langInfo(id = current) { return LANGS[id] || LANGS.cpp; }
// The next one along (the toolbar switch and Ctrl+Shift+J go round C, C++, Rust)
export function otherLanguage() { return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]; }
export function isC(id = current) { return id === 'c' || id === 'cpp'; }

// The settings keys for a language's compiler and standard
export function buildKeys(id = current) {
  if (id === 'c') return { compiler: 'cCompiler', std: 'cStd' };
  if (id === 'rust') return { compiler: null, std: 'rustEdition' };
  return { compiler: 'compiler', std: 'std' };
}
export function defaultStd(id = current) { return id === 'c' ? 'c17' : id === 'rust' ? '2024' : 'c++20'; }

// "C17 · gcc" / "C++20 · g++" / "Edition 2024 · rustc": what a lone file of this language builds with
export function toolchainLabel(id = current) {
  const l = langInfo(id);
  const k = buildKeys(id);
  const std = build[k.std] || defaultStd(id);
  const cc = k.compiler ? build[k.compiler] : 'rustc';
  const nice = (l.stds.find(([v]) => v === String(std)) || [std, std])[1];
  return `${nice} · ${cc}`;
}

// From the settings file (the window starts, or Settings were saved)
export function setLanguageConfig(cfg) {
  build = { ...build, ...(cfg.build || {}) };
  setLanguage(valid(cfg.language), { quiet: true });
}

export function setLanguage(id, { quiet = false } = {}) {
  const next = valid(id);
  const changed = next !== current;
  current = next;
  document.documentElement.dataset.lang = current;
  for (const fn of listeners) { try { fn(current, { changed, quiet }); } catch (e) { console.error(e); } }
}

export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// A file's own language: .c is C, .cpp/.hpp/... are C++, .rs is Rust, a .h
// follows the current language (C or C++: it could be either).
export function fileLanguage(file) {
  const ext = (file.split('/').pop().split('.').pop() || '').toLowerCase();
  if (ext === 'c') return 'c';
  if (ext === 'rs') return 'rust';
  if (ext === 'h') return current === 'c' ? 'c' : 'cpp';
  if (['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ipp', 'tpp', 'inl', 'c++'].includes(ext)) return 'cpp';
  return null;
}
