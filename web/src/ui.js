// Small DOM toolkit: element builder, dialog boxes, menus, toasts.
// Electron doesn't allow alert()/prompt(), and they'd look wrong anyway, so
// every question the app asks is one of these in-page dialog boxes.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let HOME = '';
export function setHome(h) { HOME = h || ''; }
export function tildify(p) { return HOME && p && (p === HOME || p.startsWith(HOME + '/')) ? '~' + p.slice(HOME.length) : p; }
// For .path elements (cut from the left with direction: rtl): the marks keep
// the slashes where they belong.
export function pathText(p) { return '\u200E' + tildify(p) + '\u200E'; }

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A dialog box: title in the top border, content, buttons. Resolves with the
// value of the button pressed (Escape = null).
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width, onOpen }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const btns = buttons.map((b) => h('button', { class: 'dlg-btn' + (b.primary ? ' primary' : ''), type: 'button', 'data-value': String(b.value) }, b.label));
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: width ? { width } : undefined },
      h('div', { class: 'dialog-title' }, title),
      h('div', { class: 'dialog-body' }, body),
      buttons.length ? h('div', { class: 'dialog-buttons' }, btns) : null);
    const veil = h('div', { class: 'veil' }, box);
    const done = (v) => {
      veil.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    btns.forEach((b, i) => b.addEventListener('click', () => done(buttons[i].value)));
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !e.target.closest('.no-enter')) {
        const primary = buttons.findIndex((b) => b.primary);
        if (primary >= 0 && e.target.tagName !== 'BUTTON') { e.preventDefault(); done(buttons[primary].value); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.append(veil);
    const first = box.querySelector('input, textarea, select') || btns.find((b) => b.classList.contains('primary')) || btns[0];
    if (first) setTimeout(() => first.focus(), 0);
    if (onOpen) onOpen(box, done);
  });
}

export async function confirm(title, message, okLabel = 'OK', cancelLabel = 'Cancel') {
  return !!(await dialog({ title, body: h('p', {}, message), buttons: [{ label: cancelLabel, value: false }, { label: okLabel, value: true, primary: true }] }));
}

export async function prompt(title, label, value = '', { placeholder = '', hint = '' } = {}) {
  const input = h('input', { type: 'text', class: 'field', value, placeholder, spellcheck: 'false' });
  const r = await dialog({
    title, width: '34em',
    body: h('label', { class: 'stack' }, h('span', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null),
    buttons: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }],
  });
  return r ? input.value : null;
}

export function message(title, text) {
  return dialog({ title, body: h('pre', { class: 'dialog-pre' }, text) });
}

// Quiet mode (Settings → Comfort, and during focus): messages wait in the
// inbox (the ✉ on the status line) instead of popping up. Errors still show.
let toastBox = null;
let quietReasons = new Set();
const inbox = [];
const inboxWatchers = new Set();
export function setQuiet(reason, on) { if (on) quietReasons.add(reason); else quietReasons.delete(reason); for (const fn of inboxWatchers) fn(inbox); }
export function isQuiet() { return quietReasons.size > 0; }
export function inboxMessages() { return inbox; }
export function clearInbox() { inbox.length = 0; for (const fn of inboxWatchers) fn(inbox); }
export function onInbox(fn) { inboxWatchers.add(fn); return () => inboxWatchers.delete(fn); }
export function toast(text, kind = 'info', ms = 3500) {
  if (quietReasons.size && kind !== 'error') {
    inbox.unshift({ text: String(text), kind, at: Date.now() });
    inbox.length = Math.min(inbox.length, 50);
    for (const fn of inboxWatchers) fn(inbox);
    return;
  }
  if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: `toast ${kind}` }, text);
  toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}

// Context menu / dropdown: [{label, keys, run, disabled, sep}]
let openMenu = null;
export function popupMenu(items, x, y) {
  closeMenu();
  const list = h('div', { class: 'menu-pop', role: 'menu' });
  const entries = [];
  for (const it of items) {
    if (it.sep) { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    const b = h('button', { class: 'menu-item', role: 'menuitem', type: 'button', disabled: it.disabled },
      h('span', { class: 'mi-label' }, it.label), h('span', { class: 'mi-keys' }, it.keys || ''));
    b.addEventListener('click', () => { closeMenu(); it.run && it.run(); });
    list.append(b);
    entries.push(b);
  }
  document.body.append(list);
  const r = list.getBoundingClientRect();
  list.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
  list.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
  const onKey = (e) => {
    const i = entries.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); entries[(i + 1) % entries.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); entries[(i - 1 + entries.length) % entries.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  };
  const onDown = (e) => { if (!list.contains(e.target)) closeMenu(); };
  document.addEventListener('keydown', onKey, true);
  // Listen for clicks outside from the next tick (not the click that opened
  // it), unless the menu is already gone by then: a listener added after
  // closing would outlive the menu and shut every later one on mousedown.
  let closed = false;
  setTimeout(() => { if (!closed) document.addEventListener('mousedown', onDown, true); }, 0);
  openMenu = { list, cleanup() { closed = true; document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); } };
  const firstEnabled = entries.find((e) => !e.disabled);
  if (firstEnabled) firstEnabled.focus();
  return list;
}
export function closeMenu() {
  if (openMenu) { openMenu.cleanup(); openMenu.list.remove(); openMenu = null; }
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function relTime(iso) {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
}

// A row of buttons, one pressed: [[value, label], ...]. el.value is the
// choice; it fires "change" when you pick another.
export function choices(options, value, { label } = {}) {
  const box = h('div', { class: 'choices', role: 'group', 'aria-label': label || undefined });
  box.value = value;
  for (const [v, text, title] of options) {
    const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(v === value), 'data-value': String(v), title: title || undefined }, text);
    b.addEventListener('click', () => { box.set(v); box.dispatchEvent(new Event('change')); });
    box.append(b);
  }
  box.set = (v) => { box.value = v; box.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === String(v)))); };
  return box;
}
