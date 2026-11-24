// Guides: your notes vaults inside the app, several at once (the CPP-Path
// vault, a C one, your own). A sidebar section per vault with its notes by
// folder, each note in its own tab, search across them, and buttons on code
// blocks that copy, paste into the terminal, or open the program in the C
// or C++ sandbox.

import { call } from './rpc.js';
import { h, clear, toast, debounce, dialog } from './ui.js';
import { sidebar, tabs, command, runCommand } from './layout.js';
import { renderMarkdown, slug } from './markdown.js';
import { openFile } from './editor.js';
import { pasteToTerminal } from './terminal.js';

let notes = [];
let vaults = [];                 // [{ path, name, count, error, start }] from the backend
let listEl = null;
let filterEl = null;
let vaultRoot = '';
const collapsed = new Set();     // vault paths folded away in the sidebar

export async function loadNotes() {
  try {
    const r = await call('guides.list');
    notes = r.notes; vaults = r.vaults || []; vaultRoot = r.root;
    const saved = await call('state.get', { key: 'guides.collapsed', fallback: [] });
    collapsed.clear(); saved.forEach((v) => collapsed.add(v));
  } catch (err) {
    notes = []; vaults = [];
    if (listEl) {
      clear(listEl);
      listEl.append(h('div', { class: 'pad' }, h('p', { class: 'muted' }, err.message),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => runCommand('vault.add') }, 'Add a vault...'),
          h('button', { class: 'btn', type: 'button', onclick: () => runCommand('app.settings') }, 'Settings'))));
    }
    return;
  }
  renderList(filterEl ? filterEl.value : '');
}
export function guideNotes() { return notes; }
export function guideVaults() { return vaults; }

function renderList(filter) {
  if (!listEl) return;
  clear(listEl);
  const f = filter.toLowerCase();
  const many = vaults.length > 1;
  for (const v of vaults) {
    const mine = notes.filter((n) => n.vault === v.path && (!f || n.name.toLowerCase().includes(f)));
    const open = f ? true : !collapsed.has(v.path);
    const head = h('div', { class: 'vault-head' },
      h('button', { type: 'button', class: 'tree-row vault-row', title: `${v.path}${v.error ? `\n${v.error}` : ''}`, 'aria-expanded': String(open) },
        h('span', { class: 'twisty' }, open ? '[-]' : '[+]'), h('span', { class: 'name' }, v.name), h('span', { class: 'vault-count' }, v.error ? '!' : f ? `${mine.length}/${v.count}` : String(v.count))),
      h('span', { class: 'row-tools' },
        v.start ? h('button', { type: 'button', title: `Open ${v.start}`, onclick: () => openGuide(v.start, undefined, { vault: v.path }) }, '⌂') : null,
        h('button', { type: 'button', title: 'Search this vault', onclick: async () => { const { prompt } = await import('./ui.js'); const q = await prompt(`Search ${v.name}`, 'Text to find in its notes'); if (q) searchGuides(q, v.path); } }, '?'),
        h('button', { type: 'button', title: 'Remove this vault from the app (the notes stay where they are)', onclick: () => removeVault(v.path) }, '×')));
    head.firstChild.addEventListener('click', () => {
      if (collapsed.has(v.path)) collapsed.delete(v.path); else collapsed.add(v.path);
      call('state.set', { key: 'guides.collapsed', value: [...collapsed] });
      renderList(filterEl ? filterEl.value : '');
    });
    if (many || v.error) listEl.append(head);
    if (v.error) { listEl.append(h('p', { class: 'muted pad small' }, v.error)); continue; }
    if (!open && many) continue;
    let lastFolder = null;
    const ul = h('ul', { class: 'tree' + (many ? ' in-vault' : '') });
    for (const n of mine) {
      if (n.folder !== lastFolder) {
        ul.append(h('li', { class: 'tree-group' }, n.folder || (many ? 'Top' : v.name)));
        lastFolder = n.folder;
      }
      const b = h('button', { class: 'tree-row', type: 'button', title: n.name + '  (Shift+click: open beside)' }, h('span', { class: 'name' }, n.name));
      b.addEventListener('click', (e) => openGuide(n.name, undefined, { vault: n.vault, ...(e.shiftKey || e.ctrlKey ? { side: 'right' } : {}) }));
      ul.append(h('li', {}, b));
    }
    if (!mine.length && f) ul.append(h('li', { class: 'muted pad small' }, 'No note names match; Enter searches inside them.'));
    listEl.append(ul);
  }
  listEl.append(h('div', { class: 'pad' }, h('button', { class: 'btn small', type: 'button', title: 'Show another folder of notes here, beside these', onclick: () => runCommand('vault.add') }, '+ Add a vault')));
}

// ------------------------------------------------------------------ vaults in Settings
const expandHome = async (p) => p.replace(/^~(?=\/|$)/, (await call('app.info')).home).replace(/\/+$/, '');
export async function addVault(dir, name) {
  const full = await expandHome(dir.trim());
  const st = await call('files.stat', { file: full });
  if (!st.exists || st.type !== 'dir') { toast(`${dir} isn't a folder`, 'error'); return false; }
  const c = await call('config.get');
  const list = c.vaults || [];
  for (const v of list) if ((await expandHome(v.path)) === full) { toast(`${v.name} is already in Guides`); return true; }
  const saved = await call('config.save', { ...c, vaults: [...list, { path: dir.trim(), name: (name || '').trim() || undefined }] });
  window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
  collapsed.delete(full);
  await loadNotes();
  sidebar.show('guides');
  toast(`Added ${saved.vaults[saved.vaults.length - 1].name} to Guides`, 'ok');
  return true;
}
export async function removeVault(full) {
  const c = await call('config.get');
  const keep = [];
  let gone = null;
  for (const v of c.vaults || []) { if ((await expandHome(v.path)) === full) gone = v; else keep.push(v); }
  if (!gone) return;
  const { confirm } = await import('./ui.js');
  if (!(await confirm('Remove vault', `Stop showing ${gone.name} in Guides? Nothing is deleted: its notes stay in ${gone.path}, and you can add it back any time.`, 'Remove'))) return;
  const saved = await call('config.save', { ...c, vaults: keep });
  window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
  for (const t of [...tabs.list]) if (t.kind === 'guide' && t.note && t.note.vault === full) tabs.close(t.id);
  loadNotes();
}

// A note by name. opts.vault says which vault to look in first (a link
// inside a note looks in that note's own vault); without it, any vault.
export async function openGuide(name, heading, opts = {}) {
  const want = name.toLowerCase().replace(/\.md$/, '');
  let t = tabs.list.find((x) => x.kind === 'guide' && x.note && x.note.name.toLowerCase() === want && (!opts.vault || x.note.vault === opts.vault));
  let note = null, id = null;
  if (!t) {
    try { note = await call('guides.read', { name, vault: opts.vault }); }
    catch (err) { toast(err.message, 'error'); return null; }
    id = 'guide:' + note.vault + ':' + note.name.toLowerCase();
    t = tabs.get(id);
  }
  if (!t) {
    t = tabs.open({
      side: opts.side,
      id, kind: 'guide', title: note.name, tooltip: `${note.vaultName}: ${note.path}`, session: { kind: 'guide', name: note.name, vault: note.vault },
      render(el) { this.note = note; this.page = h('article', { class: 'page md', tabindex: '0' }); el.append(this.page); fill(this); },
      // focus the page so PageUp/PageDown/Space/arrows scroll it without a wheel
      onShow() { if (this.stale) { this.stale = false; reload(this); } setTimeout(() => { if (this.page && !document.querySelector('.veil') && tabs.activeId === this.id) this.page.focus({ preventScroll: true }); }, 0); },
    });
  } else if (opts.side && t.side !== opts.side) tabs.move(t.id, opts.side);
  else tabs.focus(t.id);
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
    openGuide(a.dataset.note, a.dataset.heading, { vault: t.note.vault });
  } else if (a.classList.contains('codelink')) {
    e.preventDefault();
    const r = await call('guides.codePath', { rel: a.dataset.code, vault: t.note.vault });
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
      // a ```c block goes to the C sandbox, ```cpp to the C++ one; unlabelled ones guess from the includes
      const lang = b.lang === 'c' || (!b.lang && /#include\s*<(stdio|stdlib|string)\.h>/.test(b.code) && !/\bstd::/.test(b.code)) ? 'c' : 'cpp';
      const { sandboxWith } = await import('./build.js');
      await sandboxWith(b.code, lang);
      toast(`In the ${lang === 'c' ? 'C' : 'C++'} sandbox. Ctrl+F9 to run it.`, 'ok');
    }
  } else if (a.classList.contains('external')) {
    // Electron opens these in your browser; in a browser tab, a new tab
  }
}

// ------------------------------------------------------------------ search
async function searchGuides(q, vault) {
  if (!q) return;
  const hits = await call('guides.search', { query: q, vault });
  const where = vault ? (vaults.find((v) => v.path === vault) || {}).name : null;
  tabs.open({
    id: 'gsearch:' + (vault || '') + q, kind: 'search', title: `Guides: ${q}`,
    render(el) {
      const page = h('div', { class: 'page' }, h('p', { class: 'muted' }, `${hits.length}${hits.length >= 200 ? '+' : ''} lines mention "${q}"${where ? ` in ${where}` : vaults.length > 1 ? ` in ${vaults.length} vaults` : ''}`));
      let last = '';
      const many = !vault && vaults.length > 1;
      for (const hit of hits) {
        if (hit.vault + hit.name !== last) { page.append(h('div', { class: 'pane-title' }, many ? `${hit.vaultName} › ${hit.name}` : hit.name)); last = hit.vault + hit.name; }
        const b = h('button', { class: 'list-row', type: 'button' }, h('span', { class: 'muted' }, String(hit.line).padStart(4)), h('span', { class: 'grow' }, hit.text));
        b.addEventListener('click', async () => {
          const t = await openGuide(hit.name, undefined, { vault: hit.vault });
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
    id: 'guides', title: 'Guides (your vaults)', short: 'Guides', cmd: 'guides.show',
    render(el) {
      const filter = filterEl = h('input', { class: 'field', type: 'search', placeholder: 'Filter notes (Enter: search inside)', 'aria-label': 'Filter notes' });
      filter.addEventListener('input', () => renderList(filter.value));
      filter.addEventListener('keydown', (e) => { if (e.key === 'Enter' && filter.value.trim()) searchGuides(filter.value.trim()); });
      el.append(
        h('div', { class: 'side-title' }, h('span', {}, 'Guides'), h('span', { class: 'side-tools' },
          h('button', { type: 'button', title: 'Search inside every note (Enter in the filter box)', onclick: () => filter.value.trim() && searchGuides(filter.value.trim()) }, 'Find'),
          h('button', { type: 'button', title: 'Add a vault: another folder of notes', onclick: () => runCommand('vault.add') }, '+'),
          h('button', { type: 'button', title: 'Reload the vaults', onclick: () => loadNotes() }, '↻'))),
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
  command('guides.open', 'Open guide...', [], (name, vault) => openGuide(name, undefined, vault ? { vault } : {}), { needsArgs: true });
  command('vault.add', 'Add a vault...', [], async (dir) => {
    if (typeof dir === 'string') return addVault(dir);
    const path = h('input', { class: 'field', type: 'text', placeholder: '~/Obsidian/C-Path', spellcheck: 'false' });
    const name = h('input', { class: 'field', type: 'text', placeholder: 'the folder name', spellcheck: 'false' });
    const ok = await dialog({ title: 'Add a vault', width: '44em',
      body: h('div', { class: 'form dialog-form' },
        h('label', {}, 'Folder'), path, h('label', {}, 'Name'), name,
        h('div', { class: 'full hint small muted' }, 'Any folder of Markdown notes: an Obsidian vault (or one folder inside one), a C course, your own notes. Each vault gets its own section in Guides; its notes, links, flashcards and _code/ paths work the same as the CPP-Path vault\'s.')),
      buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, primary: true }] });
    if (ok && path.value.trim()) return addVault(path.value, name.value);
  });
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
