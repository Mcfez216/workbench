// The looks. Each is a complete colour set: the window, the editor's
// syntax, git diffs, the terminal's 16 colours, mail, IRC and the guides all
// read these variables, so switching theme switches everything at once.
//
// The retro looks (Blue installer, Turbo C++, Norton Commander, Amber CRT)
// are built from a 16-colour palette. Two palettes:
//   soft  (default) the same hues, toned down for a modern LCD: no pure
//         #0000AA blue or #FFFF55 yellow at full brightness, off-white text,
//         lighter drop shadows. Still unmistakably DOS.
//   vga   the real CGA/VGA values, for the full 1991 experience.
// The retro looks can also use a smooth modern font instead of the VGA
// pixel font (which is only sharp at 16px or 32px).

const VGA = {
  black: '#000000', navy: '#000080', blue: '#0000AA', green: '#00AA00', cyan: '#00AAAA', red: '#AA0000', magenta: '#AA00AA',
  brown: '#AA5500', grey: '#AAAAAA', dgrey: '#555555', bblue: '#5555FF', bgreen: '#55FF55', bcyan: '#55FFFF',
  bred: '#FF5555', bmagenta: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF',
  shadow: '#000000', shadowOff: '16px',
};
// Same roles, LCD-friendly: every colour keeps its hue, saturation and
// brightness come down, and the contrast between text and background stays
// well above WCAG AA without the glare.
const SOFT = {
  black: '#0c0f1a', navy: '#19234b', blue: '#1f2c5a', green: '#3f8a60', cyan: '#3b8790', red: '#a94a4a', magenta: '#8d5794',
  brown: '#9a6f3c', grey: '#b3b8c4', dgrey: '#565e74', bblue: '#8098e8', bgreen: '#95d4a6', bcyan: '#93d3db',
  bred: '#ef8d8d', bmagenta: '#d9a2df', yellow: '#ecd085', white: '#e3e6ee',
  shadow: 'rgba(3, 5, 14, 0.55)', shadowOff: '8px',
};
export const PALETTES = { soft: 'Soft (easy on an LCD)', vga: 'Authentic VGA' };

const ansiOf = (P) => [P.black, P.red, P.green, P.brown, P.blue, P.magenta, P.cyan, P.grey,
  P.dgrey, P.bred, P.bgreen, P.yellow, P.bblue, P.bmagenta, P.bcyan, P.white];
const VGA_FONT = '"Kernel Path VGA", "DejaVu Sans Mono", monospace';
const MODERN_FONT = '"JetBrains Mono", "Fira Code", "Source Code Pro", "Cascadia Mono", "Adwaita Mono", "DejaVu Sans Mono", monospace';

// The parts every retro look shares
const common = (P) => ({
  'diff-add-bg': 'transparent', 'diff-del-bg': 'transparent', 'diff-add-fg': P.bgreen, 'diff-del-fg': P.bred,
  'term-bg': P.black, 'term-fg': P.grey, shadow: P.shadow, 'shadow-off': P.shadowOff,
  'callout-bg': P.grey, 'callout-fg': P.black, 'callout-title': P.blue,
  'callout-sw-bg': P.cyan, 'callout-sw-fg': P.black, 'callout-sw-title': P.navy,
  'callout-warn-bg': P.red, 'callout-warn-fg': P.white, 'callout-warn-title': P.yellow,
  'code-bg': P.black, 'code-fg': P.grey, 'bevel-light': P.white, 'bevel-dark': P.black,
  radius: '0px', 'frame-width': '3px', 'ws-bad': P.red, 'match-bg': P.brown, 'bracket-bg': P.cyan,
  'syn-heading': P.yellow, 'syn-link': P.bcyan, 'menu-disabled': P.dgrey,
});

const RETRO = {
  blue: {
    label: 'Blue installer',
    vars: (P) => ({
      ...common(P),
      bg: P.blue, fg: P.white, muted: P.grey, accent: P.yellow, link: P.bcyan, error: P.bred, warn: P.yellow, ok: P.bgreen, info: P.bcyan,
      desk: P.blue,
      'menu-bg': P.grey, 'menu-fg': P.black, 'menu-hot': P.red, 'menu-sel-bg': P.blue, 'menu-sel-fg': P.white,
      'panel-bg': P.blue, 'panel-fg': P.white, 'panel-title': P.yellow, 'panel-border': P.bcyan,
      'side-bg': P.grey, 'side-fg': P.black, 'side-sel-bg': P.blue, 'side-sel-fg': P.white, 'side-hover-bg': P.cyan, 'side-dir': P.blue, 'side-head': P.blue, 'side-border': P.white,
      'tab-bg': P.blue, 'tab-fg': P.grey, 'tab-active-bg': P.grey, 'tab-active-fg': P.black, 'tab-border': P.bcyan,
      'editor-bg': P.blue, 'editor-fg': P.white, 'gutter-bg': P.blue, 'gutter-fg': P.cyan, 'gutter-active': P.yellow,
      cursor: P.yellow, selection: P.dgrey, 'active-line': P.navy, ruler: P.bblue,
      'syn-keyword': P.yellow, 'syn-type': P.bgreen, 'syn-string': P.bcyan, 'syn-number': P.bmagenta, 'syn-comment': P.grey,
      'syn-preproc': P.bmagenta, 'syn-function': P.white, 'syn-variable': P.white, 'syn-operator': P.white, 'syn-punct': P.grey,
      'syn-constant': P.bmagenta,
      'diff-hunk-fg': P.black, 'diff-hunk-bg': P.grey, 'diff-meta': P.yellow, 'diff-ctx': P.grey,
      'status-bg': P.grey, 'status-fg': P.black, 'mode-bg': P.blue, 'mode-fg': P.white,
      'fkey-num-bg': P.black, 'fkey-num-fg': P.white, 'fkey-label-bg': P.grey, 'fkey-label-fg': P.black,
      'dialog-bg': P.grey, 'dialog-fg': P.black, 'dialog-title': P.blue,
      'button-bg': P.grey, 'button-fg': P.black, 'button-focus-bg': P.blue, 'button-focus-fg': P.white,
      'input-bg': P.blue, 'input-fg': P.white, 'input-border': P.black,
      'quote-1': P.bcyan, 'quote-2': P.bgreen, 'quote-3': P.yellow, 'inline-code': P.bcyan,
      'scroll-thumb': P.grey, 'scroll-track': P.blue,
    }),
    nicks: (P) => [P.bcyan, P.bgreen, P.yellow, P.bmagenta, P.bred, P.white, P.cyan, P.grey],
  },

  turbo: {
    label: 'Turbo C++',
    vars: (P) => ({
      ...common(P),
      bg: P.blue, fg: P.yellow, muted: P.grey, accent: P.white, link: P.bcyan, error: P.bred, warn: P.yellow, ok: P.bgreen, info: P.bcyan,
      desk: P.grey,
      'menu-bg': P.grey, 'menu-fg': P.black, 'menu-hot': P.red, 'menu-sel-bg': P.green, 'menu-sel-fg': P.black,
      'panel-bg': P.blue, 'panel-fg': P.yellow, 'panel-title': P.white, 'panel-border': P.white,
      'side-bg': P.cyan, 'side-fg': P.black, 'side-sel-bg': P.blue, 'side-sel-fg': P.yellow, 'side-hover-bg': P.bcyan, 'side-dir': P.white, 'side-head': P.white, 'side-border': P.white,
      'tab-bg': P.grey, 'tab-fg': P.black, 'tab-active-bg': P.blue, 'tab-active-fg': P.white, 'tab-border': P.white,
      'editor-bg': P.blue, 'editor-fg': P.yellow, 'gutter-bg': P.blue, 'gutter-fg': P.grey, 'gutter-active': P.white,
      cursor: P.yellow, selection: P.black, 'active-line': P.navy, ruler: P.cyan,
      'syn-keyword': P.white, 'syn-type': P.white, 'syn-string': P.bcyan, 'syn-number': P.bcyan, 'syn-comment': P.grey,
      'syn-preproc': P.bgreen, 'syn-function': P.yellow, 'syn-variable': P.yellow, 'syn-operator': P.yellow, 'syn-punct': P.yellow,
      'syn-constant': P.bcyan, 'syn-heading': P.white,
      'diff-hunk-fg': P.black, 'diff-hunk-bg': P.cyan, 'diff-meta': P.white, 'diff-ctx': P.grey,
      'status-bg': P.grey, 'status-fg': P.black, 'mode-bg': P.green, 'mode-fg': P.black,
      'fkey-num-bg': P.grey, 'fkey-num-fg': P.red, 'fkey-label-bg': P.grey, 'fkey-label-fg': P.black,
      'dialog-bg': P.grey, 'dialog-fg': P.black, 'dialog-title': P.navy,
      'button-bg': P.green, 'button-fg': P.black, 'button-focus-bg': P.green, 'button-focus-fg': P.white,
      'input-bg': P.blue, 'input-fg': P.white, 'input-border': P.blue,
      'quote-1': P.bcyan, 'quote-2': P.bgreen, 'quote-3': P.white, 'inline-code': P.bcyan,
      'scroll-thumb': P.cyan, 'scroll-track': P.blue,
    }),
    nicks: (P) => [P.bcyan, P.bgreen, P.white, P.bmagenta, P.bred, P.yellow, P.cyan, P.grey],
  },

  norton: {
    label: 'Norton Commander',
    vars: (P) => ({
      ...common(P),
      bg: P.blue, fg: P.bcyan, muted: P.cyan, accent: P.yellow, link: P.white, error: P.bred, warn: P.yellow, ok: P.bgreen, info: P.white,
      desk: P.black,
      'menu-bg': P.cyan, 'menu-fg': P.black, 'menu-hot': P.yellow, 'menu-sel-bg': P.black, 'menu-sel-fg': P.white,
      'panel-bg': P.blue, 'panel-fg': P.bcyan, 'panel-title': P.yellow, 'panel-border': P.bcyan,
      'side-bg': P.blue, 'side-fg': P.bcyan, 'side-sel-bg': P.cyan, 'side-sel-fg': P.black, 'side-hover-bg': P.navy, 'side-dir': P.white, 'side-head': P.yellow, 'side-border': P.bcyan,
      'tab-bg': P.blue, 'tab-fg': P.cyan, 'tab-active-bg': P.cyan, 'tab-active-fg': P.black, 'tab-border': P.bcyan,
      'editor-bg': P.blue, 'editor-fg': P.bcyan, 'gutter-bg': P.blue, 'gutter-fg': P.cyan, 'gutter-active': P.yellow,
      cursor: P.white, selection: P.black, 'active-line': P.navy, ruler: P.cyan,
      'syn-keyword': P.white, 'syn-type': P.yellow, 'syn-string': P.bgreen, 'syn-number': P.bmagenta, 'syn-comment': P.cyan,
      'syn-preproc': P.bmagenta, 'syn-function': P.white, 'syn-variable': P.bcyan, 'syn-operator': P.white, 'syn-punct': P.bcyan,
      'syn-constant': P.bmagenta, 'syn-link': P.white,
      'diff-hunk-fg': P.black, 'diff-hunk-bg': P.cyan, 'diff-meta': P.yellow, 'diff-ctx': P.bcyan,
      'status-bg': P.cyan, 'status-fg': P.black, 'mode-bg': P.black, 'mode-fg': P.white,
      'fkey-num-bg': P.black, 'fkey-num-fg': P.white, 'fkey-label-bg': P.cyan, 'fkey-label-fg': P.black,
      'dialog-bg': P.grey, 'dialog-fg': P.black, 'dialog-title': P.black,
      'button-bg': P.grey, 'button-fg': P.black, 'button-focus-bg': P.cyan, 'button-focus-fg': P.black,
      'input-bg': P.cyan, 'input-fg': P.black, 'input-border': P.cyan,
      'quote-1': P.white, 'quote-2': P.bgreen, 'quote-3': P.yellow, 'inline-code': P.white,
      'scroll-thumb': P.cyan, 'scroll-track': P.blue,
    }),
    nicks: (P) => [P.white, P.bgreen, P.yellow, P.bmagenta, P.bred, P.bcyan, P.grey, P.bblue],
  },
};

// A monochrome amber monitor, like a Hercules card on a phosphor screen.
// Dark and low-glare by nature, so it has one palette.
const AMBER = {
  bg: '#15100a', hi: '#f2b65a', fg: '#e0a54c', mid: '#b98536', lo: '#7a5826', dim: '#3a2a14', line: '#21180d', deep: '#0e0a05',
};
function amberVars() {
  const A = AMBER;
  return {
    bg: A.bg, fg: A.fg, muted: A.lo, accent: A.hi, link: A.hi, error: '#ff7b5c', warn: '#f5cf6b', ok: '#c9d36a', info: A.hi,
    desk: A.deep,
    'menu-bg': A.mid, 'menu-fg': A.deep, 'menu-hot': '#5a1d00', 'menu-sel-bg': A.deep, 'menu-sel-fg': A.hi, 'menu-disabled': A.dim,
    'panel-bg': A.bg, 'panel-fg': A.fg, 'panel-title': A.hi, 'panel-border': A.lo,
    'side-bg': A.deep, 'side-fg': A.fg, 'side-sel-bg': A.mid, 'side-sel-fg': A.deep, 'side-hover-bg': A.line, 'side-dir': A.hi, 'side-head': A.hi, 'side-border': A.lo,
    'tab-bg': A.deep, 'tab-fg': A.lo, 'tab-active-bg': A.mid, 'tab-active-fg': A.deep, 'tab-border': A.lo,
    'editor-bg': A.bg, 'editor-fg': A.fg, 'gutter-bg': A.bg, 'gutter-fg': A.dim, 'gutter-active': A.mid,
    cursor: A.hi, selection: A.dim, 'active-line': A.line, ruler: A.dim, 'ws-bad': '#5a2412', 'match-bg': '#4a3414', 'bracket-bg': A.dim,
    'syn-keyword': A.hi, 'syn-type': A.hi, 'syn-string': A.mid, 'syn-number': A.hi, 'syn-comment': A.lo,
    'syn-preproc': A.mid, 'syn-function': A.fg, 'syn-variable': A.fg, 'syn-operator': A.fg, 'syn-punct': A.mid,
    'syn-constant': A.hi, 'syn-heading': A.hi, 'syn-link': A.hi,
    'diff-add-fg': A.hi, 'diff-add-bg': '#231a0b', 'diff-del-fg': '#ff7b5c', 'diff-del-bg': '#2a120a',
    'diff-hunk-fg': A.deep, 'diff-hunk-bg': A.mid, 'diff-meta': A.hi, 'diff-ctx': A.mid,
    'status-bg': A.mid, 'status-fg': A.deep, 'mode-bg': A.deep, 'mode-fg': A.hi,
    'fkey-num-bg': A.deep, 'fkey-num-fg': A.hi, 'fkey-label-bg': A.mid, 'fkey-label-fg': A.deep,
    'dialog-bg': '#20180c', 'dialog-fg': A.fg, 'dialog-title': A.hi, 'bevel-light': A.mid, 'bevel-dark': A.deep, shadow: 'rgba(0,0,0,0.6)', 'shadow-off': '8px',
    'button-bg': A.dim, 'button-fg': A.hi, 'button-focus-bg': A.mid, 'button-focus-fg': A.deep,
    'input-bg': A.deep, 'input-fg': A.hi, 'input-border': A.lo,
    'term-bg': A.deep, 'term-fg': A.fg,
    'quote-1': A.hi, 'quote-2': A.mid, 'quote-3': A.lo,
    'callout-bg': '#20180c', 'callout-fg': A.fg, 'callout-title': A.hi,
    'callout-sw-bg': '#1b1a0c', 'callout-sw-fg': A.fg, 'callout-sw-title': '#c9d36a',
    'callout-warn-bg': '#2a120a', 'callout-warn-fg': A.fg, 'callout-warn-title': '#ff7b5c',
    'code-bg': A.deep, 'code-fg': A.fg, 'inline-code': A.hi,
    radius: '0px', 'frame-width': '3px', 'scroll-thumb': A.lo, 'scroll-track': A.deep,
  };
}

const MODERN = {
  bg: '#16161e', fg: '#c0caf5', muted: '#565f89', accent: '#7aa2f7', link: '#7dcfff', error: '#f7768e', warn: '#e0af68', ok: '#9ece6a', info: '#7dcfff',
  desk: '#16161e',
  'menu-bg': '#16161e', 'menu-fg': '#a9b1d6', 'menu-hot': '#7aa2f7', 'menu-sel-bg': '#283457', 'menu-sel-fg': '#c0caf5', 'menu-disabled': '#3b4261',
  'panel-bg': '#1a1b26', 'panel-fg': '#c0caf5', 'panel-title': '#7aa2f7', 'panel-border': '#292e42',
  'side-bg': '#16161e', 'side-fg': '#a9b1d6', 'side-sel-bg': '#283457', 'side-sel-fg': '#c0caf5', 'side-hover-bg': '#1f2335', 'side-dir': '#7aa2f7', 'side-head': '#565f89', 'side-border': '#292e42',
  'tab-bg': '#16161e', 'tab-fg': '#565f89', 'tab-active-bg': '#1a1b26', 'tab-active-fg': '#c0caf5', 'tab-border': '#7aa2f7',
  'editor-bg': '#1a1b26', 'editor-fg': '#c0caf5', 'gutter-bg': '#1a1b26', 'gutter-fg': '#3b4261', 'gutter-active': '#737aa2',
  cursor: '#c0caf5', selection: '#283457', 'active-line': '#1e2030', ruler: '#292e42', 'ws-bad': '#5c2a35', 'match-bg': '#3d59a1', 'bracket-bg': '#3b4261',
  'syn-keyword': '#bb9af7', 'syn-type': '#2ac3de', 'syn-string': '#9ece6a', 'syn-number': '#ff9e64', 'syn-comment': '#565f89',
  'syn-preproc': '#7dcfff', 'syn-function': '#7aa2f7', 'syn-variable': '#c0caf5', 'syn-operator': '#89ddff', 'syn-punct': '#a9b1d6',
  'syn-constant': '#ff9e64', 'syn-heading': '#7aa2f7', 'syn-link': '#7dcfff',
  'diff-add-fg': '#9ece6a', 'diff-add-bg': '#20303b', 'diff-del-fg': '#f7768e', 'diff-del-bg': '#37222c',
  'diff-hunk-fg': '#7aa2f7', 'diff-hunk-bg': '#1f2335', 'diff-meta': '#e0af68', 'diff-ctx': '#a9b1d6',
  'status-bg': '#16161e', 'status-fg': '#a9b1d6', 'mode-bg': '#7aa2f7', 'mode-fg': '#16161e',
  'fkey-num-bg': '#16161e', 'fkey-num-fg': '#565f89', 'fkey-label-bg': '#16161e', 'fkey-label-fg': '#a9b1d6',
  'dialog-bg': '#1f2335', 'dialog-fg': '#c0caf5', 'dialog-title': '#7aa2f7', 'bevel-light': '#3b4261', 'bevel-dark': '#3b4261', shadow: 'rgba(0,0,0,0.5)', 'shadow-off': '0px',
  'button-bg': '#292e42', 'button-fg': '#c0caf5', 'button-focus-bg': '#7aa2f7', 'button-focus-fg': '#16161e',
  'input-bg': '#16161e', 'input-fg': '#c0caf5', 'input-border': '#3b4261',
  'term-bg': '#16161e', 'term-fg': '#c0caf5',
  'quote-1': '#7dcfff', 'quote-2': '#9ece6a', 'quote-3': '#e0af68',
  'callout-bg': '#1f2335', 'callout-fg': '#c0caf5', 'callout-title': '#7aa2f7',
  'callout-sw-bg': '#16302f', 'callout-sw-fg': '#c0caf5', 'callout-sw-title': '#73daca',
  'callout-warn-bg': '#3b2028', 'callout-warn-fg': '#c0caf5', 'callout-warn-title': '#f7768e',
  'code-bg': '#16161e', 'code-fg': '#a9b1d6', 'inline-code': '#7dcfff',
  radius: '6px', 'frame-width': '1px', 'scroll-thumb': '#3b4261', 'scroll-track': '#16161e',
};

// The theme list everyone else reads. Retro entries are filled in for the
// palette in use by applyTheme(); the label and flags never change.
export const THEMES = {
  blue: { label: 'Blue installer', retro: true, frame: 'double', cursorStyle: 'underline' },
  turbo: { label: 'Turbo C++', retro: true, frame: 'double', cursorStyle: 'underline' },
  norton: { label: 'Norton Commander', retro: true, frame: 'double', cursorStyle: 'underline' },
  amber: { label: 'Amber CRT', retro: true, frame: 'double', cursorStyle: 'underline', fixedPalette: true },
  modern: { label: 'Modern (Vim-style)', retro: false, frame: 'solid', cursorStyle: 'block' },
};

function resolve(name, palette) {
  const t = THEMES[name];
  const P = palette === 'vga' ? VGA : SOFT;
  if (name === 'modern') {
    return { ...t, vars: MODERN, nicks: ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff', '#ff9e64', '#73daca'],
      ansi: ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
      selection: { bg: '#283457' } };
  }
  if (name === 'amber') {
    const A = AMBER;
    return { ...t, vars: amberVars(), nicks: [A.hi, A.fg, A.mid, '#f5cf6b', '#ff7b5c', '#c9d36a', A.lo, '#d8b27a'],
      ansi: [A.deep, '#d9603f', '#a9b250', A.mid, A.lo, '#c2794a', '#c9a35a', A.fg, A.dim, '#ff7b5c', '#c9d36a', '#f5cf6b', A.mid, '#e09366', A.hi, '#f7d9a0'],
      selection: { bg: A.mid, fg: A.deep } };
  }
  return { ...t, vars: RETRO[name].vars(P), nicks: RETRO[name].nicks(P), ansi: ansiOf(P), selection: { bg: P.grey, fg: P.black } };
}

let current = 'blue';
let look = { palette: 'soft', retroFont: 'vga' };
let resolved = resolve('blue', 'soft');
const watchers = new Set();

// look: { palette: 'soft' | 'vga', retroFont: 'vga' | 'modern' }
export function applyTheme(name, fontSize = 16, lookOpts) {
  if (lookOpts) look = { ...look, ...lookOpts };
  current = THEMES[name] ? name : 'blue';
  const t = resolved = resolve(current, look.palette);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(`--${k}`, v);
  t.nicks.forEach((c, i) => root.style.setProperty(`--nick-${i}`, c));
  const pixel = t.retro && look.retroFont !== 'modern';
  root.style.setProperty('--font', pixel ? VGA_FONT : MODERN_FONT);
  // Pixel fonts are only sharp at whole multiples of 16px.
  const size = pixel ? (fontSize >= 24 ? 32 : 16) : fontSize;
  root.style.setProperty('--font-size', `${size}px`);
  root.dataset.theme = current;
  root.dataset.retro = t.retro ? 'yes' : 'no';
  root.dataset.pixel = pixel ? 'yes' : 'no';
  root.dataset.palette = t.retro && !t.fixedPalette ? look.palette : 'own';
  root.style.colorScheme = 'dark';
  for (const fn of watchers) fn(current, t);
}

export function themeName() { return current; }
export function theme() { return resolved; }
export function lookOptions() { return { ...look }; }
// Does this theme + font combination use the pixel font (fixed sizes)?
export function usesPixelFont(name = current, retroFont = look.retroFont) { return !!(THEMES[name] && THEMES[name].retro && retroFont !== 'modern'); }
export function onThemeChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }

// What xterm.js needs: concrete colours, not CSS variables.
export function terminalTheme() {
  const t = resolved;
  const a = t.ansi;
  return {
    background: t.vars['term-bg'], foreground: t.vars['term-fg'], cursor: t.vars['term-fg'], cursorAccent: t.vars['term-bg'],
    selectionBackground: t.selection.bg, selectionForeground: t.selection.fg,
    black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
    brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15],
  };
}
