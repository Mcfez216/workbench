// The command palette (Ctrl+Shift+P, or F10 then type): every command the
// menus and keys know, found by typing part of its name. Each row shows the
// menu it lives in and its key, so the palette also teaches the shortcuts.

import { h, clear, dialog } from './ui.js';
import { commands, runCommand, command, menubar } from './layout.js';

// Commands that only make sense with an argument come in through the menus
// (Theme ▸ Turbo C++ is theme.set('turbo')); everything else is listed bare.
function entries() {
  const out = [];
  const seen = new Set();
  const walk = (items, trail) => {
    for (const it of items || []) {
      if (it.sep) continue;
      if (it.submenu) { walk(it.submenu, [...trail, it.label]); continue; }
      const c = commands.get(it.cmd);
      if (!c) continue;
      const key = it.cmd + JSON.stringify(it.args || []);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: it.label || c.title, where: trail.join(' › '), keys: c.keys[0] || '', run: () => runCommand(c.id, ...(it.args || [])), enabled: !c.when || c.when() });
    }
  };
  for (const m of menubar.menus) walk(m.items, [m.label]);
  for (const c of commands.values()) {
    if (seen.has(c.id + '[]') || c.needsArgs) continue;
    seen.add(c.id + '[]');
    out.push({ title: c.title, where: '', keys: c.keys[0] || '', run: () => runCommand(c.id), enabled: !c.when || c.when() });
  }
  return out.filter((e) => e.enabled);
}

// Every word you type has to appear; earlier, whole-word and title matches win
function score(e, words) {
  const title = e.title.toLowerCase(), all = `${title} ${e.where.toLowerCase()} ${e.keys.toLowerCase()}`;
  let s = 0;
  for (const w of words) {
    const i = all.indexOf(w);
    if (i < 0) return -1;
    s += (title.includes(w) ? 10 : 2) + (title.startsWith(w) ? 6 : 0) + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title) ? 4 : 0) - i * 0.01;
  }
  return s;
}

let recent = [];
export function openPalette(initial = '') {
  const all = entries();
  const input = h('input', { class: 'field', type: 'text', placeholder: 'Type a command: build, run, theme, vault, C...', spellcheck: 'false', value: initial, 'aria-label': 'Command' });
  const list = h('div', { class: 'palette-list', role: 'listbox' });
  let shown = [], sel = 0, close;
  const render = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      const top = recent.map((t) => all.find((e) => e.title === t)).filter(Boolean);
      shown = [...top, ...all.filter((e) => !top.includes(e)).sort((a, b) => a.title.localeCompare(b.title))];
    } else {
      shown = all.map((e) => [e, score(e, words)]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    }
    shown = shown.slice(0, 80);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    clear(list);
    if (!shown.length) list.append(h('div', { class: 'muted pad' }, 'No command matches.'));
    shown.forEach((e, i) => {
      const row = h('button', { type: 'button', class: 'palette-row' + (i === sel ? ' sel' : ''), role: 'option', 'aria-selected': String(i === sel) },
        h('span', { class: 'pr-title' }, e.title),
        h('span', { class: 'pr-where' }, e.where),
        e.keys ? h('span', { class: 'kbd' }, e.keys) : null);
      row.addEventListener('click', () => pick(i));
      row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
      list.append(row);
    });
  };
  const mark = () => [...list.children].forEach((r, i) => { r.classList.toggle('sel', i === sel); r.setAttribute('aria-selected', String(i === sel)); });
  const pick = (i) => {
    const e = shown[i];
    if (!e) return;
    recent = [e.title, ...recent.filter((t) => t !== e.title)].slice(0, 6);
    close(true);
    setTimeout(e.run, 0);
  };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); mark(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'PageDown') { e.preventDefault(); sel = Math.min(sel + 10, shown.length - 1); mark(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'PageUp') { e.preventDefault(); sel = Math.max(sel - 10, 0); mark(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  render();
  return dialog({ title: 'Commands', width: 'min(90vw, 76ch)', body: h('div', { class: 'no-enter palette' }, input, list), buttons: [], onOpen: (box, done) => { close = done; } });
}

export function initPalette() {
  command('app.palette', 'Command palette...', ['Ctrl+Shift+P'], () => openPalette());
}
