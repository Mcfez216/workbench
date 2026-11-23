// The four looks. Each is a complete colour set: the window, the C editor's
// syntax, git diffs, the terminal's 16 colours, mail, IRC and the guides all
// read these variables, so switching theme switches everything at once.

const VGA = {
  black: '#000000', blue: '#0000AA', green: '#00AA00', cyan: '#00AAAA', red: '#AA0000', magenta: '#AA00AA',
  brown: '#AA5500', grey: '#AAAAAA', dgrey: '#555555', bblue: '#5555FF', bgreen: '#55FF55', bcyan: '#55FFFF',
  bred: '#FF5555', bmagenta: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF',
};
const CGA_ANSI = [VGA.black, VGA.red, VGA.green, VGA.brown, VGA.blue, VGA.magenta, VGA.cyan, VGA.grey,
  VGA.dgrey, VGA.bred, VGA.bgreen, VGA.yellow, VGA.bblue, VGA.bmagenta, VGA.bcyan, VGA.white];
const VGA_FONT = '"Kernel Path VGA", "DejaVu Sans Mono", monospace';
const V = VGA;

export const THEMES = {
  blue: {
    label: 'Blue installer', font: VGA_FONT, retro: true, frame: 'double',
    vars: {
      bg: V.blue, fg: V.white, muted: V.grey, accent: V.yellow, link: V.bcyan, error: V.bred, warn: V.yellow, ok: V.bgreen, info: V.bcyan,
      'desk': V.blue,
      'menu-bg': V.grey, 'menu-fg': V.black, 'menu-hot': V.red, 'menu-sel-bg': V.blue, 'menu-sel-fg': V.white, 'menu-disabled': V.dgrey,
      'panel-bg': V.blue, 'panel-fg': V.white, 'panel-title': V.yellow, 'panel-border': V.bcyan,
      'side-bg': V.grey, 'side-fg': V.black, 'side-sel-bg': V.blue, 'side-sel-fg': V.white, 'side-hover-bg': V.cyan, 'side-dir': V.blue, 'side-head': V.blue, 'side-border': V.white,
      'tab-bg': V.blue, 'tab-fg': V.grey, 'tab-active-bg': V.grey, 'tab-active-fg': V.black, 'tab-border': V.bcyan,
      'editor-bg': V.blue, 'editor-fg': V.white, 'gutter-bg': V.blue, 'gutter-fg': V.cyan, 'gutter-active': V.yellow,
      cursor: V.yellow, selection: V.dgrey, 'active-line': '#000080', ruler: V.bblue, 'ws-bad': V.red, 'match-bg': V.brown, 'bracket-bg': V.cyan,
      'syn-keyword': V.yellow, 'syn-type': V.bgreen, 'syn-string': V.bcyan, 'syn-number': V.bmagenta, 'syn-comment': V.grey,
      'syn-preproc': V.bmagenta, 'syn-function': V.white, 'syn-variable': V.white, 'syn-operator': V.white, 'syn-punct': V.grey,
      'syn-constant': V.bmagenta, 'syn-heading': V.yellow, 'syn-link': V.bcyan,
      'diff-add-fg': V.bgreen, 'diff-add-bg': 'transparent', 'diff-del-fg': V.bred, 'diff-del-bg': 'transparent',
      'diff-hunk-fg': V.black, 'diff-hunk-bg': V.grey, 'diff-meta': V.yellow, 'diff-ctx': V.grey,
      'status-bg': V.grey, 'status-fg': V.black, 'mode-bg': V.blue, 'mode-fg': V.white,
      'fkey-num-bg': V.black, 'fkey-num-fg': V.white, 'fkey-label-bg': V.grey, 'fkey-label-fg': V.black,
      'dialog-bg': V.grey, 'dialog-fg': V.black, 'dialog-title': V.blue, 'bevel-light': V.white, 'bevel-dark': V.black, shadow: V.black,
      'button-bg': V.grey, 'button-fg': V.black, 'button-focus-bg': V.blue, 'button-focus-fg': V.white,
      'input-bg': V.blue, 'input-fg': V.white, 'input-border': V.black,
      'term-bg': V.black, 'term-fg': V.grey,
      'quote-1': V.bcyan, 'quote-2': V.bgreen, 'quote-3': V.yellow,
      'callout-bg': V.grey, 'callout-fg': V.black, 'callout-title': V.blue,
      'callout-sw-bg': V.cyan, 'callout-sw-fg': V.black, 'callout-sw-title': V.blue,
      'callout-warn-bg': V.red, 'callout-warn-fg': V.white, 'callout-warn-title': V.yellow,
      'code-bg': V.black, 'code-fg': V.grey, 'inline-code': V.bcyan,
      radius: '0px', 'frame-width': '3px', 'scroll-thumb': V.grey, 'scroll-track': V.blue,
    },
    nicks: [V.bcyan, V.bgreen, V.yellow, V.bmagenta, V.bred, V.white, V.cyan, V.grey],
    ansi: CGA_ANSI, cursorStyle: 'underline',
  },

  turbo: {
    label: 'Turbo C++', font: VGA_FONT, retro: true, frame: 'double',
    vars: {
      bg: V.blue, fg: V.yellow, muted: V.grey, accent: V.white, link: V.bcyan, error: V.bred, warn: V.yellow, ok: V.bgreen, info: V.bcyan,
      desk: V.grey,
      'menu-bg': V.grey, 'menu-fg': V.black, 'menu-hot': V.red, 'menu-sel-bg': V.green, 'menu-sel-fg': V.black, 'menu-disabled': V.dgrey,
      'panel-bg': V.blue, 'panel-fg': V.yellow, 'panel-title': V.white, 'panel-border': V.white,
      'side-bg': V.cyan, 'side-fg': V.black, 'side-sel-bg': V.blue, 'side-sel-fg': V.yellow, 'side-hover-bg': V.bcyan, 'side-dir': V.white, 'side-head': V.white, 'side-border': V.white,
      'tab-bg': V.grey, 'tab-fg': V.black, 'tab-active-bg': V.blue, 'tab-active-fg': V.white, 'tab-border': V.white,
      'editor-bg': V.blue, 'editor-fg': V.yellow, 'gutter-bg': V.blue, 'gutter-fg': V.grey, 'gutter-active': V.white,
      cursor: V.yellow, selection: V.black, 'active-line': V.blue, ruler: V.cyan, 'ws-bad': V.red, 'match-bg': V.brown, 'bracket-bg': V.cyan,
      'syn-keyword': V.white, 'syn-type': V.white, 'syn-string': V.bcyan, 'syn-number': V.bcyan, 'syn-comment': V.grey,
      'syn-preproc': V.bgreen, 'syn-function': V.yellow, 'syn-variable': V.yellow, 'syn-operator': V.yellow, 'syn-punct': V.yellow,
      'syn-constant': V.bcyan, 'syn-heading': V.white, 'syn-link': V.bcyan,
      'diff-add-fg': V.bgreen, 'diff-add-bg': 'transparent', 'diff-del-fg': V.bred, 'diff-del-bg': 'transparent',
      'diff-hunk-fg': V.black, 'diff-hunk-bg': V.cyan, 'diff-meta': V.white, 'diff-ctx': V.grey,
      'status-bg': V.grey, 'status-fg': V.black, 'mode-bg': V.green, 'mode-fg': V.black,
      'fkey-num-bg': V.grey, 'fkey-num-fg': V.red, 'fkey-label-bg': V.grey, 'fkey-label-fg': V.black,
      'dialog-bg': V.grey, 'dialog-fg': V.black, 'dialog-title': V.white, 'bevel-light': V.white, 'bevel-dark': V.black, shadow: V.black,
      'button-bg': V.green, 'button-fg': V.black, 'button-focus-bg': V.green, 'button-focus-fg': V.white,
      'input-bg': V.blue, 'input-fg': V.white, 'input-border': V.blue,
      'term-bg': V.black, 'term-fg': V.grey,
      'quote-1': V.bcyan, 'quote-2': V.bgreen, 'quote-3': V.white,
      'callout-bg': V.grey, 'callout-fg': V.black, 'callout-title': V.blue,
      'callout-sw-bg': V.cyan, 'callout-sw-fg': V.black, 'callout-sw-title': V.blue,
      'callout-warn-bg': V.red, 'callout-warn-fg': V.white, 'callout-warn-title': V.yellow,
      'code-bg': V.black, 'code-fg': V.grey, 'inline-code': V.bcyan,
      radius: '0px', 'frame-width': '3px', 'scroll-thumb': V.cyan, 'scroll-track': V.blue,
    },
    nicks: [V.bcyan, V.bgreen, V.white, V.bmagenta, V.bred, V.yellow, V.cyan, V.grey],
    ansi: CGA_ANSI, cursorStyle: 'underline',
  },

  norton: {
    label: 'Norton Commander', font: VGA_FONT, retro: true, frame: 'double',
    vars: {
      bg: V.blue, fg: V.bcyan, muted: V.cyan, accent: V.yellow, link: V.white, error: V.bred, warn: V.yellow, ok: V.bgreen, info: V.white,
      desk: V.black,
      'menu-bg': V.cyan, 'menu-fg': V.black, 'menu-hot': V.yellow, 'menu-sel-bg': V.black, 'menu-sel-fg': V.white, 'menu-disabled': V.dgrey,
      'panel-bg': V.blue, 'panel-fg': V.bcyan, 'panel-title': V.yellow, 'panel-border': V.bcyan,
      'side-bg': V.blue, 'side-fg': V.bcyan, 'side-sel-bg': V.cyan, 'side-sel-fg': V.black, 'side-hover-bg': '#000080', 'side-dir': V.white, 'side-head': V.yellow, 'side-border': V.bcyan,
      'tab-bg': V.blue, 'tab-fg': V.cyan, 'tab-active-bg': V.cyan, 'tab-active-fg': V.black, 'tab-border': V.bcyan,
      'editor-bg': V.blue, 'editor-fg': V.bcyan, 'gutter-bg': V.blue, 'gutter-fg': V.cyan, 'gutter-active': V.yellow,
      cursor: V.white, selection: V.black, 'active-line': '#000080', ruler: V.cyan, 'ws-bad': V.red, 'match-bg': V.brown, 'bracket-bg': V.cyan,
      'syn-keyword': V.white, 'syn-type': V.yellow, 'syn-string': V.bgreen, 'syn-number': V.bmagenta, 'syn-comment': V.cyan,
      'syn-preproc': V.bmagenta, 'syn-function': V.white, 'syn-variable': V.bcyan, 'syn-operator': V.white, 'syn-punct': V.bcyan,
      'syn-constant': V.bmagenta, 'syn-heading': V.yellow, 'syn-link': V.white,
      'diff-add-fg': V.bgreen, 'diff-add-bg': 'transparent', 'diff-del-fg': V.bred, 'diff-del-bg': 'transparent',
      'diff-hunk-fg': V.black, 'diff-hunk-bg': V.cyan, 'diff-meta': V.yellow, 'diff-ctx': V.bcyan,
      'status-bg': V.cyan, 'status-fg': V.black, 'mode-bg': V.black, 'mode-fg': V.white,
      'fkey-num-bg': V.black, 'fkey-num-fg': V.white, 'fkey-label-bg': V.cyan, 'fkey-label-fg': V.black,
      'dialog-bg': V.grey, 'dialog-fg': V.black, 'dialog-title': V.black, 'bevel-light': V.white, 'bevel-dark': V.black, shadow: V.black,
      'button-bg': V.grey, 'button-fg': V.black, 'button-focus-bg': V.cyan, 'button-focus-fg': V.black,
      'input-bg': V.cyan, 'input-fg': V.black, 'input-border': V.cyan,
      'term-bg': V.black, 'term-fg': V.grey,
      'quote-1': V.white, 'quote-2': V.bgreen, 'quote-3': V.yellow,
      'callout-bg': V.grey, 'callout-fg': V.black, 'callout-title': V.blue,
      'callout-sw-bg': V.cyan, 'callout-sw-fg': V.black, 'callout-sw-title': V.blue,
      'callout-warn-bg': V.red, 'callout-warn-fg': V.white, 'callout-warn-title': V.yellow,
      'code-bg': V.black, 'code-fg': V.grey, 'inline-code': V.white,
      radius: '0px', 'frame-width': '3px', 'scroll-thumb': V.cyan, 'scroll-track': V.blue,
    },
    nicks: [V.white, V.bgreen, V.yellow, V.bmagenta, V.bred, V.bcyan, V.grey, V.bblue],
    ansi: CGA_ANSI, cursorStyle: 'underline',
  },

  modern: {
    label: 'Modern (Vim-style)', font: '"JetBrains Mono", "Fira Code", "Source Code Pro", "Adwaita Mono", "DejaVu Sans Mono", monospace', retro: false, frame: 'solid',
    vars: {
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
      'dialog-bg': '#1f2335', 'dialog-fg': '#c0caf5', 'dialog-title': '#7aa2f7', 'bevel-light': '#3b4261', 'bevel-dark': '#3b4261', shadow: 'rgba(0,0,0,0.5)',
      'button-bg': '#292e42', 'button-fg': '#c0caf5', 'button-focus-bg': '#7aa2f7', 'button-focus-fg': '#16161e',
      'input-bg': '#16161e', 'input-fg': '#c0caf5', 'input-border': '#3b4261',
      'term-bg': '#16161e', 'term-fg': '#c0caf5',
      'quote-1': '#7dcfff', 'quote-2': '#9ece6a', 'quote-3': '#e0af68',
      'callout-bg': '#1f2335', 'callout-fg': '#c0caf5', 'callout-title': '#7aa2f7',
      'callout-sw-bg': '#16302f', 'callout-sw-fg': '#c0caf5', 'callout-sw-title': '#73daca',
      'callout-warn-bg': '#3b2028', 'callout-warn-fg': '#c0caf5', 'callout-warn-title': '#f7768e',
      'code-bg': '#16161e', 'code-fg': '#a9b1d6', 'inline-code': '#7dcfff',
      radius: '6px', 'frame-width': '1px', 'scroll-thumb': '#3b4261', 'scroll-track': '#16161e',
    },
    nicks: ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff', '#ff9e64', '#73daca'],
    ansi: ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
    cursorStyle: 'block',
  },
};

let current = 'blue';
const watchers = new Set();

export function applyTheme(name, fontSize = 16) {
  const t = THEMES[name] || THEMES.blue;
  current = THEMES[name] ? name : 'blue';
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(`--${k}`, v);
  t.nicks.forEach((c, i) => root.style.setProperty(`--nick-${i}`, c));
  root.style.setProperty('--font', t.font);
  // Pixel fonts are only sharp at whole multiples of 16px.
  const size = t.retro ? (fontSize >= 24 ? 32 : 16) : fontSize;
  root.style.setProperty('--font-size', `${size}px`);
  root.dataset.theme = current;
  root.dataset.retro = t.retro ? 'yes' : 'no';
  root.style.colorScheme = 'dark';
  for (const fn of watchers) fn(current, t);
}

export function themeName() { return current; }
export function theme() { return THEMES[current]; }
export function onThemeChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }

// What xterm.js needs: concrete colours, not CSS variables.
export function terminalTheme() {
  const t = THEMES[current];
  const a = t.ansi;
  return {
    background: t.vars['term-bg'], foreground: t.vars['term-fg'], cursor: t.vars['term-fg'], cursorAccent: t.vars['term-bg'],
    selectionBackground: t.retro ? V.grey : '#283457', selectionForeground: t.retro ? V.black : undefined,
    black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
    brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15],
  };
}
