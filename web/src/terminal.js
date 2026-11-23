// Terminals in the bottom panel (xterm.js). The shells run in the backend,
// so they survive reloading the window.

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { call, on } from './rpc.js';
import { h, clear, popupMenu, prompt } from './ui.js';
import { panel, command } from './layout.js';
import { terminalTheme, theme, onThemeChange } from './themes.js';
import { workspaceRoot } from './files.js';

const terms = new Map();     // id -> {term, fit, el, tab, label, title, alive}
let tabsEl, hostEl, emptyEl, activeId = null;
let opening = false;         // newTerminal() is starting one: don't start another on first show

function make(id, title, replay = '') {
  const el = h('div', { class: 'xterm-wrap' });
  hostEl.append(el);
  const term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font'),
    fontSize: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size'), 10) || 16,
    lineHeight: 1, theme: terminalTheme(), cursorStyle: theme().cursorStyle, cursorBlink: true,
    scrollback: 5000, allowProposedApi: false, convertEol: false, customGlyphs: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  if (replay) term.write(replay);
  term.onData((data) => call('pty.write', { id, data }));
  term.onResize(({ rows, cols }) => call('pty.resize', { id, rows, cols }));
  const label = h('button', { type: 'button', class: 'term-label', title: `${title} (right-click for more)` }, title);
  const x = h('button', { type: 'button', class: 'term-x', title: 'Close this terminal (Ctrl+Shift+W)', 'aria-label': `Close ${title}` }, '×');
  const tab = h('div', { class: 'term-tab' }, label, x);
  label.addEventListener('click', () => activate(id));
  x.addEventListener('click', (e) => { e.stopPropagation(); closeTerm(id); });
  tab.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTerm(id); } });
  tab.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(id, e.clientX, e.clientY); });
  tabsEl.insertBefore(tab, tabsEl.querySelector('.term-new'));
  terms.set(id, { term, fit, el, tab, label, title, alive: true });
  activate(id);
  showEmpty();
  return terms.get(id);
}

function setLabel(t) { t.label.textContent = t.alive ? t.title : `${t.title} (ended)`; }
function showEmpty() { if (emptyEl) emptyEl.hidden = terms.size > 0; }

function tabMenu(id, x, y) {
  const t = terms.get(id);
  if (!t) return;
  const ended = [...terms.entries()].filter(([, o]) => !o.alive).map(([k]) => k);
  popupMenu([
    { label: 'Close', keys: 'Ctrl+Shift+W', run: () => closeTerm(id) },
    { label: 'Close the others', run: () => { for (const k of [...terms.keys()]) if (k !== id) closeTerm(k); } },
    { label: `Close ended terminals (${ended.length})`, disabled: !ended.length, run: () => ended.forEach(closeTerm) },
    { sep: true },
    { label: 'Rename...', run: async () => { const n = await prompt('Rename terminal', 'Name', t.title); if (n) { t.title = n; setLabel(t); } } },
    { label: 'Clear', run: () => t.term.clear() },
    { label: 'New terminal', keys: 'Ctrl+Shift+T', run: () => newTerminal() },
  ], x, y);
}

function activate(id) {
  activeId = id;
  for (const [tid, t] of terms) {
    t.el.hidden = tid !== id;
    t.tab.classList.toggle('active', tid === id);
  }
  const t = terms.get(id);
  if (t) requestAnimationFrame(() => { try { t.fit.fit(); } catch (e) { /* hidden */ } t.term.focus(); });
}

async function closeTerm(id) {
  if (!terms.has(id)) return;
  removeTerm(id);                       // gone from the window now, whatever the backend says
  await call('pty.close', { id }).catch(() => {});
}

function removeTerm(id) {
  const t = terms.get(id);
  if (!t) return;
  t.term.dispose(); t.el.remove(); t.tab.remove(); terms.delete(id);
  if (activeId === id) { const next = [...terms.keys()].pop(); if (next) activate(next); else activeId = null; }
  showEmpty();
}

export async function newTerminal(cwd, argv, title) {
  opening = true;
  try {
    if (!panel.isOpen() || panel.current !== 'terminal') panel.show('terminal');
    const r = await call('pty.open', { cwd: cwd || workspaceRoot() || '~', argv, title });
    if (!terms.has(r.id)) make(r.id, r.title);
    activate(r.id);
    return r;
  } finally { opening = false; }
}

// Commands go to a shell: not into a program you ran (Ctrl+F9), gdb or a
// man page. The active terminal if it's a shell, else the newest shell,
// else a new one.
const NOT_A_SHELL = /^(run|gdb|sandbox)[: ]|^man /;
export function pasteToTerminal(text) {
  const shellTerm = ([id, t]) => t.alive && !NOT_A_SHELL.test(t.title);
  let entry = terms.has(activeId) && shellTerm([activeId, terms.get(activeId)]) ? [activeId, terms.get(activeId)] : [...terms.entries()].filter(shellTerm).pop();
  if (!entry) return newTerminal().then(() => setTimeout(() => pasteToTerminal(text), 400));
  const [id, t] = entry;
  panel.show('terminal');
  if (id !== activeId) activate(id);
  t.term.paste(text);   // bracketed paste: bash waits for you to press Enter
  t.term.focus();
}

export function initTerminal() {
  panel.add({
    id: 'terminal', title: 'Terminal',
    render(el) {
      tabsEl = h('div', { class: 'term-tabs', role: 'tablist' },
        h('button', { type: 'button', class: 'term-new', title: 'New terminal (Ctrl+Shift+T)', onclick: () => newTerminal() }, '+'));
      emptyEl = h('div', { class: 'term-empty muted' }, 'No terminals open. Click + or press Ctrl+Shift+T for a new one.');
      hostEl = h('div', { class: 'term-host' }, emptyEl);
      el.append(tabsEl, hostEl);
      call('pty.list').then((list) => {
        for (const s of list) {
          if (terms.has(s.id)) continue;
          const t = make(s.id, s.title, s.replay);
          if (!s.alive) { t.alive = false; setLabel(t); }
        }
        if (!list.length && !opening && !terms.size) newTerminal();
        showEmpty();
      });
      new ResizeObserver(() => { const t = terms.get(activeId); if (t && !t.el.hidden) { try { t.fit.fit(); } catch (e) { /* not laid out */ } } }).observe(hostEl);
    },
    onShow(focus) { const t = terms.get(activeId); if (t) requestAnimationFrame(() => { try { t.fit.fit(); } catch (e) {} if (focus) t.term.focus(); }); },
  });
  on('pty.opened', (d) => { if (hostEl && !terms.has(d.id)) make(d.id, d.title); });
  on('pty.data', (d) => { const t = terms.get(d.id); if (t) t.term.write(d.data); });
  on('pty.exit', (d) => { const t = terms.get(d.id); if (t) { t.alive = false; setLabel(t); } });
  on('pty.closed', (d) => removeTerm(d.id));
  onThemeChange(() => {
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font');
    const size = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size'), 10) || 16;
    for (const t of terms.values()) {
      t.term.options.theme = terminalTheme();
      t.term.options.fontFamily = font;
      t.term.options.fontSize = size;
      t.term.options.cursorStyle = theme().cursorStyle;
      try { t.fit.fit(); } catch (e) { /* hidden */ }
    }
  });
  command('term.toggle', 'Terminal', ['F5', 'Ctrl+`'], () => panel.toggle('terminal'));
  command('term.new', 'New terminal', ['Ctrl+Shift+T'], (cwd) => newTerminal(typeof cwd === 'string' ? cwd : undefined));
  command('term.close', 'Close terminal', ['Ctrl+Shift+W'], () => activeId && closeTerm(activeId));
}
