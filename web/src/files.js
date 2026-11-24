// The file tree in the sidebar, quick open (F3 / Ctrl+P), search in files.
// The workspace is the main folder (builds and the terminal start there);
// more folders can sit beside it (File → Add folder), each with its own tree.

import { call } from './rpc.js';
import { h, clear, prompt, confirm, popupMenu, toast, dialog, pathText } from './ui.js';
import { sidebar, command, runCommand, tabs } from './layout.js';
import { openFile } from './editor.js';

let root = null;
let folders = [];
let treeEl = null;
let titleEl = null;
const expanded = new Set();
const collapsedRoots = new Set();

export function setRoot(dir) {
  root = dir;
  if (titleEl) { titleEl.textContent = pathText(dir); titleEl.title = dir; }
  indexCache = null;
  if (treeEl) renderTree();
}
export function setFolders(list) {
  folders = (list || []).filter((f) => f && f !== root);
  indexCache = null;
  if (treeEl) renderTree();
}
export function workspaceRoot() { return root; }
export function allRoots() { return [root, ...folders].filter(Boolean).filter((r, i, a) => a.indexOf(r) === i); }
const baseName = (p) => p.replace(/\/+$/, '').split('/').pop() || p;

async function renderTree() {
  const roots = allRoots();
  const out = h('div', {});
  if (roots.length <= 1) {
    if (root) out.append(await dirList(root));
  } else {
    for (const r of roots) {
      const open = !collapsedRoots.has(r);
      const head = h('div', { class: 'root-head' },
        h('button', { type: 'button', class: 'tree-row root-row', title: r, 'data-root': r },
          h('span', { class: 'twisty' }, open ? '[-]' : '[+]'), h('span', { class: 'name' }, baseName(r)), r === root ? h('span', { class: 'badge', title: 'The workspace: builds, the terminal and new files start here' }, 'workspace') : null),
        r === root ? null : h('span', { class: 'row-tools' },
          h('button', { type: 'button', title: 'Make this the workspace', onclick: () => makeWorkspace(r) }, '★'),
          h('button', { type: 'button', title: 'Remove from the sidebar (nothing is deleted)', onclick: () => removeFolder(r) }, '×')));
      head.firstChild.addEventListener('click', () => { if (open) collapsedRoots.add(r); else collapsedRoots.delete(r); renderTree(); });
      head.firstChild.addEventListener('contextmenu', (ev) => { ev.preventDefault(); fileMenu({ type: 'dir', path: r, name: baseName(r) }, ev.clientX, ev.clientY); });
      out.append(head);
      if (open) out.append(await dirList(r));
    }
  }
  clear(treeEl);
  treeEl.append(out);
}

async function saveFolders(next, nextRoot = root) {
  const c = await call('config.get');
  const saved = await call('config.save', { ...c, workspace: nextRoot, folders: next.filter((f) => f !== nextRoot) });
  root = saved.workspace;
  setFolders(saved.folders);
  window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
  return saved;
}
async function addFolder(dir) {
  const home = (await call('app.info')).home;
  const full = dir.replace(/^~(?=\/|$)/, home).replace(/\/+$/, '');
  const st = await call('files.stat', { file: full });
  if (!st.exists || st.type !== 'dir') { toast(`${dir} isn't a folder`, 'error'); return false; }
  if (allRoots().includes(full)) { toast(`${baseName(full)} is already in Files`); return true; }
  if (!root) await saveFolders(folders, full); else await saveFolders([...folders, full]);
  rememberFolder(full);
  sidebar.show('files');
  return true;
}
async function removeFolder(dir) { await saveFolders(folders.filter((f) => f !== dir)); }
async function makeWorkspace(dir) {
  await saveFolders([root, ...folders.filter((f) => f !== dir)], dir);
  if (titleEl) { titleEl.textContent = pathText(root); titleEl.title = root; }
  toast(`${baseName(dir)} is the workspace now: F9, the terminal and new files start there`, 'ok');
}
export async function rememberFolder(dir) {
  const list = await call('state.get', { key: 'recent.folders', fallback: [] });
  call('state.set', { key: 'recent.folders', value: [dir, ...list.filter((f) => f !== dir)].slice(0, 10) });
}
export { addFolder };

async function dirList(dir) {
  const ul = h('ul', { class: 'tree', role: 'group' });
  let entries;
  try { entries = await call('files.list', { dir }); }
  catch (err) { ul.append(h('li', { class: 'muted' }, ' ' + err.message)); return ul; }
  for (const e of entries) {
    const isDir = e.type === 'dir';
    const open = expanded.has(e.path);
    const row = h('button', { class: 'tree-row' + (isDir ? ' dir' : ''), type: 'button', 'data-path': e.path, title: e.path },
      h('span', { class: 'twisty' }, isDir ? (open ? '[-]' : '[+]') : ''), h('span', { class: 'name' }, isDir ? e.name + '/' : e.name));
    const li = h('li', { role: 'treeitem' }, row);
    row.addEventListener('click', async (ev) => {
      if (isDir) {
        if (expanded.has(e.path)) { expanded.delete(e.path); li.querySelector('ul')?.remove(); row.firstChild.textContent = '[+]'; }
        else { expanded.add(e.path); row.firstChild.textContent = '[-]'; li.append(await dirList(e.path)); }
      } else openFile(e.path, ev.shiftKey ? { side: 'right' } : {});
    });
    row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); fileMenu(e, ev.clientX, ev.clientY); });
    ul.append(li);
    if (isDir && open) li.append(await dirList(e.path));
  }
  return ul;
}

function fileMenu(e, x, y) {
  const dir = e.type === 'dir' ? e.path : e.path.slice(0, e.path.lastIndexOf('/'));
  popupMenu([
    e.type === 'file' ? { label: 'Open', run: () => openFile(e.path) } : null,
    e.type === 'file' ? { label: 'Open beside', run: () => openFile(e.path, { side: 'right' }) } : null,
    { label: 'New file here...', run: () => newFile(dir) },
    { label: 'New class / module here...', run: () => runCommand('file.newPair', dir) },
    { label: 'New folder here...', run: () => newFolder(dir) },
    { label: 'Rename...', run: () => renamePath(e.path) },
    { label: 'Open a terminal here', run: () => runCommand('term.new', dir) },
    { sep: true },
    { label: 'Move to trash', run: () => trashPath(e.path) },
  ].filter(Boolean), x, y);
}

async function newFile(dir) {
  const { newFileDialog } = await import('./newstuff.js');
  const p = await newFileDialog(dir || root);
  if (p) { await renderTree(); openFile(p); }
}
export { newFile, renderTree };
async function newFolder(dir) {
  const name = await prompt('New folder', `New folder in ${dir}`);
  if (!name) return;
  await call('files.create', { dir: `${dir}/${name}` });
  renderTree();
}
async function renamePath(p) {
  const name = await prompt('Rename', 'New name', p.split('/').pop());
  if (!name) return;
  const to = p.slice(0, p.lastIndexOf('/') + 1) + name;
  await call('files.rename', { from: p, to });
  const t = tabs.get('file:' + p);
  if (t) await tabs.close(t.id);
  renderTree();
}
async function trashPath(p) {
  if (!(await confirm('Move to trash', `Move ${p.split('/').pop()} to the trash? You can restore it from the trash in your file manager.`, 'Move to trash'))) return;
  await call('files.trash', { file: p });
  const t = tabs.get('file:' + p);
  if (t) await tabs.close(t.id, true);
  renderTree();
}

// ------------------------------------------------------------------ quick open
let indexCache = null;
function fuzzyScore(path, q) {
  // all query characters in order; reward matches in the file name and runs
  let score = 0, pi = 0, run = 0;
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const p = path.toLowerCase();
  for (const ch of q) {
    const i = p.indexOf(ch, pi);
    if (i < 0) return -1;
    run = i === pi ? run + 1 : 0;
    score += 1 + run * 2 + (i >= p.length - name.length ? 3 : 0);
    pi = i + 1;
  }
  return score - path.length * 0.01;
}

async function quickOpen() {
  if (!root) return toast('Open a folder first (File → Open folder)', 'error');
  if (!indexCache) {
    // every folder in Files; with more than one, names start with the folder's
    const roots = allRoots();
    const parts = await Promise.all(roots.map((r) => call('files.index', { root: r }).catch(() => ({ root: r, files: [] }))));
    const many = roots.length > 1;
    const files = [], full = new Map();
    for (const part of parts) for (const f of part.files) { const shown = many ? `${baseName(part.root)}/${f}` : f; files.push(shown); full.set(shown, `${part.root}/${f}`); }
    indexCache = { root, files, full };
  }
  const input = h('input', { class: 'field', type: 'text', placeholder: 'Type part of a file name', spellcheck: 'false', style: { width: '100%' } });
  const list = h('div', { class: 'list', style: { maxHeight: '50vh', overflow: 'auto', marginTop: '6px', minWidth: '60ch' } });
  let results = [], sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    results = (q ? indexCache.files.map((f) => [f, fuzzyScore(f, q)]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]) : indexCache.files).slice(0, 60);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    clear(list);
    results.forEach((f, i) => {
      const b = h('button', { class: 'list-row' + (i === sel ? ' sel' : ''), type: 'button' }, h('span', { class: 'grow' }, f));
      b.addEventListener('click', () => pick(i));
      list.append(b);
    });
  };
  let close;
  const pick = (i) => { const f = results[i]; if (f) { close(true); openFile(indexCache.full.get(f)); } };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); render(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  render();
  dialog({ title: `Open file (${indexCache.files.length} files)`, body: h('div', { class: 'no-enter' }, input, list), buttons: [], onOpen: (box, done) => { close = done; } });
}

// ------------------------------------------------------------------ search in files
async function searchInFiles() {
  if (!root) return;
  const roots = allRoots();
  const q = await prompt('Search in files', `Search ${roots.length > 1 ? `${roots.length} folders` : root} for`, '', { hint: 'Plain text, case-insensitive unless you type a capital letter' });
  if (!q) return;
  const hits = (await Promise.all(roots.map((r) => call('files.grep', { root: r, query: q }).catch(() => [])))).flat();
  const id = 'search:' + q;
  tabs.open({
    id, kind: 'search', title: `Search: ${q}`,
    render(el) {
      const page = h('div', { class: 'page' }, h('p', { class: 'muted' }, `${hits.length}${hits.length >= 400 ? '+' : ''} matches for "${q}" in ${roots.length > 1 ? roots.map(baseName).join(', ') : root}`));
      let lastFile = '';
      const rel = (f) => { const r = roots.find((x) => f.startsWith(x + '/')); return r ? (roots.length > 1 ? `${baseName(r)}/` : '') + f.slice(r.length + 1) : f; };
      for (const hit of hits) {
        if (hit.file !== lastFile) { page.append(h('div', { class: 'pane-title' }, rel(hit.file))); lastFile = hit.file; }
        const b = h('button', { class: 'list-row', type: 'button' }, h('span', { class: 'muted' }, String(hit.line).padStart(5)), h('span', { class: 'grow' }, hit.text));
        b.addEventListener('click', () => openFile(hit.file, { line: hit.line, col: hit.col }));
        page.append(b);
      }
      el.append(page);
    },
  });
}

export function initFiles() {
  sidebar.add({
    id: 'files', title: 'Files', short: 'Files', cmd: 'view.files',
    render(el) {
      titleEl = h('span', { class: 'path', title: root || '' }, root ? pathText(root) : '');
      el.append(
        h('div', { class: 'side-title' }, titleEl, h('span', { class: 'side-tools' },
          h('button', { type: 'button', title: 'New file (Ctrl+N)', onclick: () => newFile(root) }, '+'),
          h('button', { type: 'button', title: 'Add another folder beside the workspace', onclick: () => runCommand('file.addFolder') }, '+▢'),
          h('button', { type: 'button', title: 'Refresh', onclick: () => { indexCache = null; renderTree(); } }, '↻'))),
        treeEl = h('div', { role: 'tree' }));
      renderTree();
    },
  });
  command('file.quickOpen', 'Open file...', ['F3', 'Ctrl+P'], quickOpen);
  command('file.new', 'New file...', ['Ctrl+N'], () => newFile(root));
  command('file.search', 'Search in files...', ['Ctrl+Shift+F'], searchInFiles);
  command('file.openFolder', 'Open folder...', [], async () => {
    const dir = await prompt('Open folder', 'Folder to work in', root || '~/cpp-path', { hint: 'For example ~/cpp-path (your copy of the vault\'s _code folder)' });
    if (!dir) return;
    const st = await call('files.stat', { file: dir.replace(/^~(?=\/|$)/, (await call('app.info')).home) });
    if (!st.exists || st.type !== 'dir') return toast(`${dir} isn't a folder`, 'error');
    const full = dir.replace(/^~(?=\/|$)/, (await call('app.info')).home);
    const c = await call('config.get');
    c.workspace = full;
    const saved = await call('config.save', c);
    setRoot(full);
    setFolders(saved.folders);
    rememberFolder(full);
    window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
    sidebar.show('files');
  });
  command('file.addFolder', 'Add folder beside the workspace...', [], async (dir) => {
    if (typeof dir !== 'string') {
      dir = await prompt('Add a folder', 'Folder to show in Files, beside the workspace', '~/', { hint: 'Another project, a library you are reading, your C exercises... Quick open (F3) and search (Ctrl+Shift+F) cover every folder.' });
      if (!dir) return;
    }
    await addFolder(dir);
  });
  command('file.openRecentFolder', 'Open a recent folder...', [], async () => {
    const list = await call('state.get', { key: 'recent.folders', fallback: [] });
    if (!list.length) return toast('No recent folders yet');
    const { pickFromList } = await import('./newstuff.js');
    const dir = await pickFromList('Recent folders', list.map((f) => ({ label: pathText(f), value: f })));
    if (!dir) return;
    const c = await call('config.get');
    const saved = await call('config.save', { ...c, workspace: dir });
    setRoot(dir); setFolders(saved.folders); rememberFolder(dir);
    window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
    sidebar.show('files');
  });
}
