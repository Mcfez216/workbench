// Guides: your CPP-Path vault inside the app. A sidebar of notes by phase,
// each note in its own tab, search, and buttons on code blocks that copy,
// paste into the terminal, or open the program in the C++ sandbox.

import { call } from './rpc.js';
import { h, clear, toast, debounce } from './ui.js';
import { sidebar, tabs, command, runCommand } from './layout.js';
import { renderMarkdown, slug } from './markdown.js';
import { openFile } from './editor.js';
import { pasteToTerminal } from './terminal.js';

let notes = [];
let listEl = null;
let vaultRoot = '';

export async function loadNotes() {
  try {
    const r = await call('guides.list');
    notes = r.notes; vaultRoot = r.root;
  } catch (err) { notes = []; if (listEl) { clear(listEl); listEl.append(h('p', { class: 'muted pad' }, err.message), h('button', { class: 'btn', type: 'button', onclick: () => runCommand('app.settings') }, 'Open Settings')); } return; }
  renderList('');
}
export function guideNotes() { return notes; }

function renderList(filter) {
  if (!listEl) return;
  clear(listEl);
  const f = filter.toLowerCase();
  let lastFolder = null;
  const ul = h('ul', { class: 'tree' });
  for (const n of notes) {
    if (f && !n.name.toLowerCase().includes(f)) continue;
    if (n.folder !== lastFolder) {
      ul.append(h('li', { class: 'tree-group' }, n.folder || 'Vault'));
      lastFolder = n.folder;
    }
    const b = h('button', { class: 'tree-row', type: 'button', title: n.name }, h('span', { class: 'name' }, n.name));
    b.addEventListener('click', (e) => openGuide(n.name, undefined, e.shiftKey || e.ctrlKey ? { side: 'right' } : {}));
    b.title = n.name + '  (Shift+click: open beside)';
    ul.append(h('li', {}, b));
  }
  listEl.append(ul);
}

export async function openGuide(name, heading, opts = {}) {
  const id = 'guide:' + name.toLowerCase();
  let t = tabs.get(id);
  if (!t) {
    let note;
    try { note = await call('guides.read', { name }); }
    catch (err) { toast(err.message, 'error'); return null; }
    t = tabs.open({
      side: opts.side,
      id, kind: 'guide', title: note.name, tooltip: note.path, session: { kind: 'guide', name: note.name },
      render(el) { this.note = note; this.page = h('article', { class: 'page md', tabindex: '0' }); el.append(this.page); fill(this); },
      // focus the page so PageUp/PageDown/Space/arrows scroll it without a wheel
      onShow() { if (this.stale) { this.stale = false; reload(this); } setTimeout(() => { if (this.page && !document.querySelector('.veil') && tabs.activeId === this.id) this.page.focus({ preventScroll: true }); }, 0); },
    });
  } else if (opts.side && t.side !== opts.side) tabs.move(id, opts.side);
  else tabs.focus(id);
  if (heading) {
    const target = t.page.querySelector('#' + CSS.escape(slug(heading)));
    if (target) target.scrollIntoView({ block: 'start' });
  }
  return t;
}

async function reload(t) {
  try { t.note = await call('guides.read', { file: t.note.path }); fill(t); } catch (e) { /* deleted */ }
}

function fill(t) {
  const top = t.page.parentElement ? t.page.parentElement.scrollTop : 0;
  const { html, blocks } = renderMarkdown(t.note.text);
  t.blocks = blocks;
  t.page.innerHTML = html;
  const tools = h('div', { class: 'page-tools' },
    h('button', { class: 'btn', type: 'button', title: 'Edit this note as text', onclick: () => openFile(t.note.path) }, 'Edit note'),
    h('button', { class: 'btn', type: 'button', title: 'Reload from disk', onclick: () => reload(t) }, 'Reload'));
  t.page.prepend(tools);
  if (t.page.parentElement) t.page.parentElement.scrollTop = top;
  t.page.onclick = (e) => onPageClick(t, e);
}

async function onPageClick(t, e) {
  const a = e.target.closest('a, button');
  if (!a) return;
  if (a.classList.contains('wikilink')) {
    e.preventDefault();
    if (!a.dataset.note) { const target = t.page.querySelector('#' + CSS.escape(slug(a.dataset.heading))); if (target) target.scrollIntoView(); return; }
    openGuide(a.dataset.note, a.dataset.heading);
  } else if (a.classList.contains('codelink')) {
    e.preventDefault();
    const r = await call('guides.codePath', { rel: a.dataset.code });
    if (!r.path) return toast(`Not found. Looked in:\n${r.tried.join('\n')}`, 'error', 6000);
    const st = await call('files.stat', { file: r.path });
    if (st.type === 'dir') { const { setRoot } = await import('./files.js'); setRoot(r.path); sidebar.show('files'); toast(`Showing ${r.path}`); }
    else openFile(r.path);
  } else if (a.dataset.act) {
    const b = t.blocks[+a.dataset.i];
    if (!b) return;
    if (a.dataset.act === 'copy') {
      try { await navigator.clipboard.writeText(b.code); toast('Copied', 'ok', 1500); }
      catch (err) { toast("Couldn't copy: " + err.message, 'error'); }
    } else if (a.dataset.act === 'paste') {
      // Comments and "$ " prompts are for reading; only the commands go in.
      // The notes say _code/ (the folder inside the vault); your copy of it
      // is the workspace (~/cpp-path), so that's where the commands go.
      const { workspaceRoot } = await import('./files.js');
      const { tildify } = await import('./ui.js');
      const ws = tildify(workspaceRoot() || '');
      let cmds = b.code.split('\n').map((l) => l.replace(/^\$ /, '')).join('\n').replace(/\n+$/, '');
      if (ws && ws !== '~') cmds = cmds.replace(/(^|[\s"'=(])_code(?=\/|\s|$|["')])/gm, `$1${ws}`);
      pasteToTerminal(cmds);
    } else if (a.dataset.act === 'sandbox') {
      const sb = await runCommand('sandbox.open');
      const st = tabs.get('sandbox');
      const put = () => { if (st && st.view) { st.view.dispatch({ changes: { from: 0, to: st.view.state.doc.length, insert: b.code } }); toast('In the C++ sandbox. Ctrl+F9 to run it.', 'ok'); } else setTimeout(put, 100); };
      put();
    }
  } else if (a.classList.contains('external')) {
    // Electron opens these in your browser; in a browser tab, a new tab
  }
}

// ------------------------------------------------------------------ search
async function searchGuides(q) {
  if (!q) return;
  const hits = await call('guides.search', { query: q });
  tabs.open({
    id: 'gsearch:' + q, kind: 'search', title: `Guides: ${q}`,
    render(el) {
      const page = h('div', { class: 'page' }, h('p', { class: 'muted' }, `${hits.length}${hits.length >= 200 ? '+' : ''} lines mention "${q}"`));
      let last = '';
      for (const hit of hits) {
        if (hit.name !== last) { page.append(h('div', { class: 'pane-title' }, hit.name)); last = hit.name; }
        const b = h('button', { class: 'list-row', type: 'button' }, h('span', { class: 'muted' }, String(hit.line).padStart(4)), h('span', { class: 'grow' }, hit.text));
        b.addEventListener('click', async () => {
          const t = await openGuide(hit.name);
          if (!t) return;
          // scroll to the first element containing the text
          const want = hit.text.replace(/[*`_#>|-]/g, '').trim().slice(0, 40).toLowerCase();
          const el2 = [...t.page.querySelectorAll('p, li, td, h1, h2, h3, h4, pre, summary')].find((x) => x.textContent.toLowerCase().includes(want));
          if (el2) { el2.closest('details')?.setAttribute('open', ''); el2.scrollIntoView({ block: 'center' }); el2.classList.add('flash'); setTimeout(() => el2.classList.remove('flash'), 1500); }
        });
        page.append(b);
      }
      el.append(page);
    },
  });
}

export function initGuides() {
  sidebar.add({
    id: 'guides', title: 'Guides (your vault)', short: 'Guides',
    render(el) {
      const filter = h('input', { class: 'field', type: 'search', placeholder: 'Filter notes', 'aria-label': 'Filter notes' });
      filter.addEventListener('input', () => renderList(filter.value));
      filter.addEventListener('keydown', (e) => { if (e.key === 'Enter' && filter.value.trim()) searchGuides(filter.value.trim()); });
      el.append(
        h('div', { class: 'side-title' }, h('span', {}, 'Guides'), h('span', { class: 'side-tools' },
          h('button', { type: 'button', title: 'Search inside every note (Enter in the filter box)', onclick: () => filter.value.trim() && searchGuides(filter.value.trim()) }, 'Find'),
          h('button', { type: 'button', title: 'Reload the vault', onclick: () => loadNotes() }, '↻'))),
        h('div', { class: 'pad' }, filter),
        listEl = h('div', {}));
      loadNotes();
    },
  });
  // A note you edit in the app refreshes its guide tab
  window.addEventListener('cpw-saved', (e) => {
    for (const t of tabs.list) if (t.kind === 'guide' && t.note && t.note.path === e.detail.file) t.stale = true;
  });
  command('guides.show', 'Guides', ['F1'], () => { sidebar.show('guides'); });
  command('guides.open', 'Open guide...', [], (name) => openGuide(name));
  command('guides.beside', 'Open guide beside the editor...', [], async (name) => {
    if (!name) { sidebar.show('guides'); return; }
    return openGuide(name, undefined, { side: tabs.other() });
  });
  command('guides.search', 'Search the guides...', [], async () => {
    const { prompt } = await import('./ui.js');
    const q = await prompt('Search the guides', 'Text to find in your notes');
    if (q) searchGuides(q);
  });
}
