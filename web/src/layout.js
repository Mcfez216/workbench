// The window: menu bar, toolbar, sidebar, centre tabs, bottom panel, status
// line and the function-key bar, plus the command registry every menu, key,
// toolbar button and the command palette use.

import { h, clear, popupMenu, closeMenu, dialog } from './ui.js';
import { call } from './rpc.js';

// ------------------------------------------------------------------ commands
export const commands = new Map();
export function command(id, title, keys, run, opts = {}) {
  commands.set(id, { id, title, keys: [].concat(keys || []), run, ...opts });
}
export function runCommand(id, ...args) {
  const c = commands.get(id);
  if (!c) return console.warn('no command', id);
  return Promise.resolve(c.run(...args)).catch((err) => import('./ui.js').then(({ toast }) => toast(err.message, 'error', 6000)));
}

function keyName(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return '';
  parts.push(k === '`' || k === '~' ? '`' : k);
  return parts.join('+');
}

// Which keys reach the app while you're typing in an editor using Emacs or
// Vim keys, or in a terminal: only F-keys and Ctrl+Shift combinations.
// Everything else (C-n, C-x C-s, M-x, :w, Ctrl+C...) belongs to them.
let editorKeymap = 'standard';
export function setEditorKeymap(k) { editorKeymap = k; }
function ownedByFocus(e, name) {
  const t = e.target;
  const inTerm = t.closest && t.closest('.xterm');
  const inEditor = t.closest && t.closest('.cm-editor');
  const greedy = inTerm || (inEditor && editorKeymap !== 'standard');
  if (!greedy) return false;
  if (/^(Ctrl\+)?(Alt\+)?(Shift\+)?F\d+$/.test(name)) return false;
  if (name.startsWith('Ctrl+Shift+')) return false;
  return true;
}

function onKeyDown(e) {
  if (document.querySelector('.veil')) return;               // a dialog is open
  const name = keyName(e);
  if (!name) return;
  // keys that take over only in a mode (the debugger's F5, F10, F11 while
  // you're debugging) come before the menu and the usual F-keys
  for (const c of commands.values()) {
    if (c.priority && c.keys.includes(name) && c.when && c.when()) {
      e.preventDefault(); e.stopPropagation();
      runCommand(c.id);
      return;
    }
  }
  if (name === 'F10' || (name.startsWith('Alt+') && name.length === 5 && !ownedByFocus(e, name))) {
    const letter = name === 'F10' ? null : name.slice(4);
    if (menubar.openByKey(letter)) { e.preventDefault(); e.stopPropagation(); return; }
  }
  if (ownedByFocus(e, name)) return;
  for (const c of commands.values()) {
    if (c.keys.includes(name) && (!c.when || c.when())) {
      e.preventDefault(); e.stopPropagation();
      runCommand(c.id);
      return;
    }
  }
}

// ------------------------------------------------------------------ menu bar
export const menubar = {
  el: null, menus: [],
  build(menus) {
    this.menus = menus;
    clear(this.el);
    menus.forEach((m, i) => {
      const hot = m.label.indexOf(m.hot);
      const label = hot >= 0 ? [m.label.slice(0, hot), h('span', { class: 'hot' }, m.hot), m.label.slice(hot + 1)] : m.label;
      const b = h('button', { class: 'menubar-item', type: 'button', 'data-i': i }, label);
      b.addEventListener('click', () => this.open(i));
      b.addEventListener('mouseenter', () => { if (document.querySelector('.menu-pop.from-bar')) this.open(i); });
      this.el.append(b);
    });
  },
  openByKey(letter) {
    if (letter === null) { this.open(0); return true; }
    const i = this.menus.findIndex((m) => m.hot && m.hot.toUpperCase() === letter);
    if (i < 0) return false;
    this.open(i);
    return true;
  },
  open(i) {
    const m = this.menus[i];
    const btn = this.el.children[i];
    [...this.el.children].forEach((c) => c.classList.toggle('open', c === btn));
    const items = m.items.map((it) => {
      if (it.sep) return { sep: true };
      if (it.submenu) return { label: it.label + ' ▸', run: () => setTimeout(() => popupMenu(it.submenu.map(subItem), btn.getBoundingClientRect().left + 40, btn.getBoundingClientRect().bottom + 20), 0) };
      return subItem(it);
    });
    const r = btn.getBoundingClientRect();
    const pop = popupMenu(items, r.left, r.bottom);
    pop.classList.add('from-bar');
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        document.removeEventListener('keydown', onKey, true);
        this.open((i + (e.key === 'ArrowRight' ? 1 : this.menus.length - 1)) % this.menus.length);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const obs = new MutationObserver(() => {
      if (!pop.isConnected) { obs.disconnect(); document.removeEventListener('keydown', onKey, true); btn.classList.remove('open'); }
    });
    obs.observe(document.body, { childList: true });
  },
};
function subItem(it) {
  if (it.sep) return { sep: true };
  const c = commands.get(it.cmd);
  if (!c) return { label: it.label || it.cmd, disabled: true };
  return { label: it.label || c.title, keys: c.keys[0] || '', run: () => runCommand(c.id, ...(it.args || [])), disabled: c.when && !c.when() };
}

// ------------------------------------------------------------------ toolbar
// One row of the things you do all the time, with their keys in the
// tooltips. Items: { cmd, label, args, title } | { sep: true } |
// { el: () => Element } for something custom (the C / C++ switch) |
// { menu: [...items], label } for a drop-down.
export const toolbar = {
  el: null, items: [],
  build(items) {
    this.items = items;
    clear(this.el);
    for (const it of items) {
      if (it.sep) { this.el.append(h('span', { class: 'tb-sep', 'aria-hidden': 'true' })); continue; }
      if (it.spring) { this.el.append(h('span', { class: 'tb-spring' })); continue; }
      if (it.el) { this.el.append(it.el()); continue; }
      const c = it.cmd ? commands.get(it.cmd) : null;
      const keys = c && c.keys[0] ? ` (${c.keys[0]})` : '';
      const b = h('button', { type: 'button', class: 'tb-btn' + (it.primary ? ' primary' : ''), title: (it.title || (c && c.title) || it.label) + keys, 'data-cmd': it.cmd || undefined },
        it.icon ? h('span', { class: 'tb-icon', 'aria-hidden': 'true' }, it.icon) : null, h('span', { class: 'tb-label' }, it.label + (it.menu ? ' ▾' : '')));
      if (it.menu) {
        b.addEventListener('click', () => {
          const r = b.getBoundingClientRect();
          popupMenu(it.menu.map(subItem), r.left, r.bottom);
        });
      } else b.addEventListener('click', () => runCommand(it.cmd, ...(it.args || [])));
      this.el.append(b);
    }
  },
  toggle(on) {
    const hide = on === undefined ? !document.documentElement.classList.contains('no-toolbar') : !on;
    document.documentElement.classList.toggle('no-toolbar', hide);
    call('state.set', { key: 'ui.toolbar', value: !hide });
    window.dispatchEvent(new Event('resize'));
  },
};

// ------------------------------------------------------------------ sidebar
export const sidebar = {
  el: null, head: null, body: null, views: new Map(), current: null,
  add(view) { this.views.set(view.id, { ...view, el: null }); },
  // Re-draw a view that's already been shown (its data changed)
  refresh(id) { const v = this.views.get(id); if (v && v.el) { clear(v.el); v.render(v.el); if (!v.el.hidden && v.onShow) v.onShow(); } },
  show(id) {
    const v = this.views.get(id);
    if (!v) return;
    document.documentElement.classList.remove('no-sidebar');
    if (!v.el) { v.el = h('div', { class: 'side-view' }); v.render(v.el); this.body.append(v.el); }
    for (const o of this.views.values()) if (o.el) o.el.hidden = o !== v;
    this.current = id;
    for (const b of this.head.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === id);
    if (v.onShow) v.onShow();
    call('state.set', { key: 'ui.sidebar', value: id });
  },
  toggle() { document.documentElement.classList.toggle('no-sidebar'); },
  buildHead() {
    clear(this.head);
    for (const v of this.views.values()) {
      const c = v.cmd ? commands.get(v.cmd) : null;
      const b = h('button', { type: 'button', 'data-id': v.id, title: v.title + (c && c.keys[0] ? ` (${c.keys[0]})` : '') }, v.short || v.title);
      b.addEventListener('click', () => this.show(v.id));
      this.head.append(b);
    }
  },
};

// ------------------------------------------------------------------ centre tabs
// One tab strip, two sides. A tab lives on the left or the right; each side
// shows its own active tab, so a file can sit beside a guide. The right side
// exists only while it has a tab in it.
export const tabs = {
  bar: null, body: null, panes: null, list: [], activeId: null, activeBy: { left: null, right: null }, onChange: null,
  open(spec) {
    let t = this.list.find((x) => x.id === spec.id);
    if (!t) {
      const side = spec.side === 'right' ? 'right' : 'left';
      t = { closable: true, dirty: false, ...spec, side, el: h('div', { class: 'tab-page', 'data-kind': spec.kind }) };
      t.btn = h('div', { class: 'tab', role: 'tab', title: spec.tooltip || spec.title });
      t.label = h('span', { class: 'tab-label' }, spec.title);
      t.btn.append(t.label);
      if (t.closable) {
        const x = h('button', { class: 'tab-close', type: 'button', title: 'Close', 'aria-label': `Close ${spec.title}` }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); this.close(t.id); });
        t.btn.append(x);
      }
      t.btn.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); this.close(t.id); } });
      t.btn.addEventListener('click', () => this.focus(t.id));
      t.btn.addEventListener('dblclick', () => this.move(t.id));
      t.btn.classList.toggle('right', side === 'right');
      this.list.push(t);
      this.bar.append(t.btn);
      this.pane(side).append(t.el);
      this.syncSplit();
      if (t.render) t.render(t.el, t);
      this.saveSession();
    } else if (spec.side && spec.side !== t.side) this.move(t.id, spec.side);
    this.focus(t.id);
    return t;
  },
  pane(side) { return side === 'right' ? this.panes.right : this.panes.left; },
  get(id) { return this.list.find((t) => t.id === id); },
  active() { return this.get(this.activeId); },
  isSplit() { return this.list.some((t) => t.side === 'right'); },
  syncSplit() {
    const split = this.isSplit();
    this.body.classList.toggle('split', split);
    this.panes.right.hidden = !split; this.panes.div.hidden = !split;
    window.dispatchEvent(new Event('resize'));
  },
  focus(id) {
    const t = this.get(id);
    if (!t) return;
    const prev = this.get(this.activeBy[t.side]);
    if (prev && prev !== t && prev.onHide) prev.onHide();
    this.activeId = id;
    this.activeBy[t.side] = id;
    for (const o of this.list) {
      const shown = this.activeBy[o.side] === o.id;
      o.el.classList.toggle('active', shown);
      o.btn.classList.toggle('active', shown);
      o.btn.classList.toggle('focused', o === t);
      o.btn.setAttribute('aria-selected', shown ? 'true' : 'false');
    }
    this.panes.left.classList.toggle('focused', t.side === 'left');
    this.panes.right.classList.toggle('focused', t.side === 'right');
    t.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (t.onShow) t.onShow();
    if (this.onChange) this.onChange(t);
  },
  // Put a tab on the other side (or a named one) and keep both sides filled.
  move(id, side) {
    const t = this.get(id);
    if (!t) return;
    const to = side || (t.side === 'left' ? 'right' : 'left');
    if (to === t.side) return;
    const from = t.side;
    if (t.onHide && this.activeBy[from] === id) t.onHide();
    t.side = to;
    t.btn.classList.toggle('right', to === 'right');
    this.pane(to).append(t.el);
    if (this.activeBy[from] === id) this.activeBy[from] = (this.list.filter((o) => o.side === from && o !== t).pop() || {}).id || null;
    this.syncSplit();
    const keep = this.get(this.activeBy[from]);
    if (keep) { keep.el.classList.add('active'); keep.btn.classList.add('active'); }
    this.focus(id);
    this.saveSession();
  },
  // Which side is the focused tab on, and is there anything on the other?
  other() { const t = this.active(); return t ? (t.side === 'left' ? 'right' : 'left') : 'right'; },
  focusSide(side) {
    const id = this.activeBy[side] || (this.list.filter((o) => o.side === side).pop() || {}).id;
    if (id) this.focus(id);
  },
  unsplit() {
    for (const t of this.list.filter((o) => o.side === 'right')) {
      t.side = 'left'; t.btn.classList.remove('right'); this.panes.left.append(t.el);
    }
    this.activeBy.right = null;
    this.syncSplit();
    const a = this.active();
    if (a) this.focus(a.id);
    this.saveSession();
  },
  async close(id, force = false) {
    const t = this.get(id);
    if (!t) return true;
    if (t.dirty && !force) {
      const r = await dialog({
        title: 'Unsaved changes', body: h('p', {}, `${t.title} has changes you haven't saved.`),
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: "Don't save", value: 'discard' }, { label: 'Save', value: 'save', primary: true }],
      });
      if (r === 'cancel' || r === null) return false;
      if (r === 'save' && t.save && !(await t.save())) return false;
    }
    if (t.onClose) t.onClose();
    const i = this.list.indexOf(t);
    this.list.splice(i, 1);
    t.btn.remove(); t.el.remove();
    const wasShown = this.activeBy[t.side] === id;
    if (wasShown) {
      const mates = this.list.filter((o) => o.side === t.side);
      const after = mates.find((o) => this.list.indexOf(o) >= i);
      this.activeBy[t.side] = (after || mates[mates.length - 1] || {}).id || null;
    }
    this.syncSplit();
    if (this.activeId === id) {
      this.activeId = null;
      const next = this.get(this.activeBy[t.side]) || this.get(this.activeBy.left) || this.list[this.list.length - 1];
      if (next) this.focus(next.id); else if (this.onChange) this.onChange(null);
    } else if (wasShown) {
      const keep = this.get(this.activeBy[t.side]);
      if (keep) { keep.el.classList.add('active'); keep.btn.classList.add('active'); if (keep.onShow) keep.onShow(); }
    }
    this.saveSession();
    return true;
  },
  setTitle(id, title) { const t = this.get(id); if (t) { t.title = title; t.label.textContent = (t.dirty ? '● ' : '') + title; } },
  setDirty(id, dirty) { const t = this.get(id); if (t && t.dirty !== dirty) { t.dirty = dirty; t.label.textContent = (dirty ? '● ' : '') + t.title; } },
  saveSession() {
    const open = this.list.filter((t) => t.session).map((t) => ({ ...t.session, id: t.id, side: t.side }));
    call('state.set', { key: 'session.tabs', value: open });
  },
  anyDirty() { return this.list.some((t) => t.dirty); },
};

// ------------------------------------------------------------------ bottom panel
export const panel = {
  el: null, bar: null, body: null, views: new Map(), current: null,
  add(view) {
    const btn = h('button', { type: 'button', class: 'ptab', 'data-id': view.id }, view.title);
    btn.addEventListener('click', () => this.show(view.id));
    this.bar.insertBefore(btn, this.bar.querySelector('.ptab-spacer'));
    this.views.set(view.id, { ...view, btn, el: null });
  },
  show(id, focus = false) {
    const v = this.views.get(id);
    if (!v) return;
    document.documentElement.classList.remove('no-panel');
    if (!v.el) { v.el = h('div', { class: 'panel-view' }); this.body.append(v.el); v.render(v.el); }
    for (const o of this.views.values()) { if (o.el) o.el.hidden = o !== v; o.btn.classList.toggle('active', o === v); }
    this.current = id;
    if (v.onShow) v.onShow(focus);
    call('state.set', { key: 'ui.panel', value: id });
  },
  isOpen() { return !document.documentElement.classList.contains('no-panel'); },
  hide() { document.documentElement.classList.add('no-panel'); },
  toggle(id) {
    if (this.isOpen() && (!id || this.current === id)) this.hide(); else this.show(id || this.current || [...this.views.keys()][0], true);
  },
  setBadge(id, text) { const v = this.views.get(id); if (v) v.btn.textContent = v.title + (text ? ` (${text})` : ''); },
};

// ------------------------------------------------------------------ status line
export const status = {
  el: null, items: new Map(),
  set(key, text, { title, onclick, order = 50, side = 'right', cls } = {}) {
    let it = this.items.get(key);
    if (!it) {
      it = h(onclick ? 'button' : 'span', { class: 'st-item', type: onclick ? 'button' : undefined });
      it.dataset.order = order;
      it.dataset.key = key;
      if (onclick) it.addEventListener('click', onclick);
      this.items.set(key, it);
      const zone = this.el.querySelector(side === 'left' ? '.st-left' : '.st-right');
      const after = [...zone.children].find((c) => +c.dataset.order > order);
      zone.insertBefore(it, after || null);
    }
    it.textContent = text;
    it.hidden = !text;
    if (title) it.title = title;
    it.className = 'st-item' + (cls ? ' ' + cls : '');
  },
};

// ------------------------------------------------------------------ build it
// The empty desk: what you see with no tabs open (the start screen draws itself into it)
export const desk = { el: null };

export function buildShell(root, fkeys) {
  const menubarEl = h('nav', { class: 'menubar', 'aria-label': 'Menu' });
  const toolbarEl = h('div', { class: 'toolbar-main', role: 'toolbar', 'aria-label': 'Toolbar' });
  const sideHead = h('div', { class: 'side-head', role: 'tablist' });
  const sideBody = h('div', { class: 'side-body' });
  const sideEl = h('aside', { class: 'sidebar frame' }, sideHead, sideBody);
  const tabBar = h('div', { class: 'tabbar', role: 'tablist' });
  const paneL = h('div', { class: 'pane left focused' });
  const paneR = h('div', { class: 'pane right', hidden: true });
  const paneDiv = h('div', { class: 'resizer v split-div', title: 'Drag to resize the two sides', hidden: true });
  const tabBody = h('div', { class: 'tabbody' }, paneL, paneDiv, paneR);
  const empty = h('div', { class: 'desk-empty' }, h('div', { class: 'desk-hint' },
    h('p', {}, 'Nothing open.'), h('p', {}, 'F3 open a file · F1 guides · F4 sandbox · Ctrl+Shift+P commands')));
  const center = h('section', { class: 'center' }, tabBar, h('div', { class: 'tabbody-wrap' }, empty, tabBody));
  const panelBar = h('div', { class: 'panelbar' }, h('span', { class: 'ptab-spacer' }),
    h('button', { class: 'ptab-close', type: 'button', title: 'Hide panel (Ctrl+J)', onclick: () => panel.hide() }, '×'));
  const panelBody = h('div', { class: 'panelbody' });
  const panelEl = h('section', { class: 'panel frame' }, panelBar, panelBody);
  const sideResizer = h('div', { class: 'resizer v', title: 'Drag to resize' });
  const panelResizer = h('div', { class: 'resizer h', title: 'Drag to resize' });
  const statusEl = h('footer', { class: 'statusline' }, h('div', { class: 'st-left' }), h('div', { class: 'st-right' }));
  const fkeyEl = h('div', { class: 'fkeys' }, fkeys.map(([n, label, cmd]) => {
    const b = h('button', { type: 'button', class: 'fkey', title: commands.get(cmd)?.title || label }, h('span', { class: 'fk-n' }, n), h('span', { class: 'fk-l' }, label));
    b.addEventListener('click', () => (cmd === 'menu' ? menubar.open(0) : runCommand(cmd)));
    return b;
  }));
  const main = h('div', { class: 'main' }, sideEl, sideResizer, h('div', { class: 'work' }, center, panelResizer, panelEl));
  root.append(menubarEl, toolbarEl, main, statusEl, fkeyEl);

  menubar.el = menubarEl;
  toolbar.el = toolbarEl;
  desk.el = empty;
  sidebar.el = sideEl; sidebar.head = sideHead; sidebar.body = sideBody;
  tabs.bar = tabBar; tabs.body = tabBody; tabs.panes = { left: paneL, right: paneR, div: paneDiv };
  // clicking inside a side makes it the focused one
  for (const side of ['left', 'right']) tabs.panes[side].addEventListener('mousedown', () => { const id = tabs.activeBy[side]; if (id && tabs.activeId !== id) tabs.focus(id); }, true);
  drag(paneDiv, (dx, start) => {
    const total = tabBody.getBoundingClientRect().width;
    const w = Math.max(160, Math.min(start + dx, total - 160));
    document.documentElement.style.setProperty('--split-w', w + 'px'); return w;
  }, () => paneL.getBoundingClientRect().width, 'ui.splitWidth', 'x');
  panel.el = panelEl; panel.bar = panelBar; panel.body = panelBody;
  status.el = statusEl;

  const setEmpty = () => { empty.hidden = tabs.list.length > 0; };
  const prevChange = () => {};
  tabs.onChange = (t) => { setEmpty(); prevChange(t); };
  setEmpty();

  drag(sideResizer, (dx, start) => { const w = Math.max(160, Math.min(start + dx, innerWidth * 0.6)); document.documentElement.style.setProperty('--side-w', w + 'px'); return w; },
    () => sideEl.getBoundingClientRect().width, 'ui.sideWidth', 'x');
  drag(panelResizer, (dy, start) => { const hgt = Math.max(80, Math.min(start - dy, innerHeight * 0.8)); document.documentElement.style.setProperty('--panel-h', hgt + 'px'); return hgt; },
    () => panelEl.getBoundingClientRect().height, 'ui.panelHeight', 'y');

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu-pop, .menubar')) closeMenu(); });
}

function drag(handle, apply, getStart, key, axis) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const start = getStart();
    const origin = axis === 'x' ? e.clientX : e.clientY;
    let last = start;
    document.documentElement.classList.add('dragging');
    const move = (ev) => { last = apply((axis === 'x' ? ev.clientX : ev.clientY) - origin, start); };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.documentElement.classList.remove('dragging');
      window.dispatchEvent(new Event('resize'));
      call('state.set', { key, value: last });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
