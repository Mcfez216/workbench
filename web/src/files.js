// The file tree in the sidebar, quick open (F3 / Ctrl+P), search in files.

import { call } from './rpc.js';
import { h, clear, prompt, confirm, popupMenu, toast, dialog, pathText } from './ui.js';
import { sidebar, command, runCommand, tabs } from './layout.js';
import { openFile } from './editor.js';

let root = null;
let treeEl = null;
let titleEl = null;
const expanded = new Set();

export function setRoot(dir) {
  root = dir;
  if (titleEl) { titleEl.textContent = pathText(dir); titleEl.title = dir; }
  indexCache = null;
  if (treeEl) renderTree();
}
export function workspaceRoot() { return root; }

async function renderTree() {
  clear(treeEl);
  if (!root) return;
  treeEl.append(await dirList(root));
}

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
    { label: 'New folder here...', run: () => newFolder(dir) },
    { label: 'Rename...', run: () => renamePath(e.path) },
    { label: 'Open a terminal here', run: () => runCommand('term.new', dir) },
    { sep: true },
    { label: 'Move to trash', run: () => trashPath(e.path) },
  ].filter(Boolean), x, y);
}

async function newFile(dir) {
  const name = await prompt('New file', `New file in ${dir}`, '', { placeholder: 'hello.cpp' });
  if (!name) return;
  const p = name.startsWith('/') ? name : `${dir}/${name}`;
  await call('files.create', { file: p });
  await renderTree();
  openFile(p);
}
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
  if (!indexCache) indexCache = await call('files.index', { root });
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
  const pick = (i) => { const f = results[i]; if (f) { close(true); openFile(`${indexCache.root}/${f}`); } };
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
  const q = await prompt('Search in files', `Search ${root} for`, '', { hint: 'Plain text, case-insensitive unless you type a capital letter' });
  if (!q) return;
  const hits = await call('files.grep', { root, query: q });
  const id = 'search:' + q;
  tabs.open({
    id, kind: 'search', title: `Search: ${q}`,
    render(el) {
      const page = h('div', { class: 'page' }, h('p', { class: 'muted' }, `${hits.length}${hits.length >= 400 ? '+' : ''} matches for "${q}" in ${root}`));
      let lastFile = '';
      for (const hit of hits) {
        if (hit.file !== lastFile) { page.append(h('div', { class: 'pane-title' }, hit.file.replace(root + '/', ''))); lastFile = hit.file; }
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
    id: 'files', title: 'Files', short: 'Files',
    render(el) {
      titleEl = h('span', { class: 'path', title: root || '' }, root ? pathText(root) : '');
      el.append(
        h('div', { class: 'side-title' }, titleEl, h('span', { class: 'side-tools' },
          h('button', { type: 'button', title: 'New file', onclick: () => newFile(root) }, '+'),
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
    await call('config.save', c);
    setRoot(full);
    sidebar.show('files');
  });
}
