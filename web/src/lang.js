// C or C++: the language you're working in right now. It decides what new
// files, new projects, the sandbox and the judge start as, which standard
// and compiler a lone file uses, whether a .h header is C or C++, and what
// the toolbar and status line say. Files you open keep their own language
// (a .c file is always C); this is the default for everything else.

const listeners = new Set();
let current = 'cpp';
let build = { compiler: 'g++', std: 'c++20', cCompiler: 'gcc', cStd: 'c17' };

export const LANGS = {
  c: { id: 'c', label: 'C', ext: 'c', header: 'h', compilers: ['gcc', 'clang'], stds: [['c89', 'C89'], ['c99', 'C99'], ['c11', 'C11'], ['c17', 'C17'], ['c2x', 'C23']] },
  cpp: { id: 'cpp', label: 'C++', ext: 'cpp', header: 'hpp', compilers: ['g++', 'clang++'], stds: [['c++17', 'C++17'], ['c++20', 'C++20'], ['c++23', 'C++23']] },
};

export function language() { return current; }
export function langInfo(id = current) { return LANGS[id] || LANGS.cpp; }
export function otherLanguage() { return current === 'c' ? 'cpp' : 'c'; }

// "C17 · gcc" / "C++20 · g++": what a lone file of this language builds with
export function toolchainLabel(id = current) {
  const l = langInfo(id);
  const std = id === 'c' ? build.cStd : build.std;
  const cc = id === 'c' ? build.cCompiler : build.compiler;
  const nice = (l.stds.find(([v]) => v === std) || [std, std])[1];
  return `${nice} · ${cc}`;
}

// From the settings file (the window starts, or Settings were saved)
export function setLanguageConfig(cfg) {
  build = { ...build, ...(cfg.build || {}) };
  setLanguage(cfg.language === 'c' ? 'c' : 'cpp', { quiet: true });
}

export function setLanguage(id, { quiet = false } = {}) {
  const next = id === 'c' ? 'c' : 'cpp';
  const changed = next !== current;
  current = next;
  document.documentElement.dataset.lang = current;
  for (const fn of listeners) { try { fn(current, { changed, quiet }); } catch (e) { console.error(e); } }
}

export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// A file's own language: .c is C, .cpp/.hpp/... are C++, a .h follows the
// current language (it could be either).
export function fileLanguage(file) {
  const ext = (file.split('/').pop().split('.').pop() || '').toLowerCase();
  if (ext === 'c') return 'c';
  if (ext === 'h') return current;
  if (['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ipp', 'tpp', 'inl', 'c++'].includes(ext)) return 'cpp';
  return null;
}
