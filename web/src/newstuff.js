// Starting things: a new file (a program with main, a plain source file, a
// header, a class or a C module), a new CMake project in C or C++, and the
// small list picker the recent-files menus use.

import { call } from './rpc.js';
import { h, dialog, toast, choices, pathText, clear } from './ui.js';
import { command, runCommand, sidebar } from './layout.js';
import { openFile } from './editor.js';
import { language, langInfo } from './lang.js';

const home = async () => (await call('app.info')).home;
const untilde = async (p) => p.replace(/^~(?=\/|$)/, await home());

// ------------------------------------------------------------------ new file
// Resolves with the path of the file made (or the source of a pair), or null.
export async function newFileDialog(dir, preset = {}) {
  const { workspaceRoot } = await import('./files.js');
  const start = dir || workspaceRoot() || '~';
  const lang = choices([['c', 'C'], ['cpp', 'C++']], preset.lang || language(), { label: 'Language' });
  const kinds = () => [
    ['main', 'Program', 'A source file with main(): something you can run straight away (Ctrl+F9)'],
    ['source', 'Source file', 'An empty .c / .cpp file'],
    ['header', 'Header', lang.value === 'c' ? 'A .h file with an include guard' : 'A .hpp file with #pragma once'],
    ['pair', lang.value === 'c' ? 'Module (.h + .c)' : 'Class (.hpp + .cpp)', lang.value === 'c' ? 'An opaque struct with create/destroy functions, header and source' : 'A class, its header and its source'],
  ];
  let kind = choices(kinds(), preset.kind || 'main', { label: 'What kind' });
  const kindHost = h('div', {}, kind);
  const name = h('input', { class: 'field', type: 'text', placeholder: 'hello', spellcheck: 'false' });
  const folder = h('input', { class: 'field', type: 'text', value: pathText(start).replace(/‎/g, ''), spellcheck: 'false' });
  const preview = h('div', { class: 'hint small muted' });
  const fileName = () => {
    const n = name.value.trim();
    const l = langInfo(lang.value);
    if (!n) return '';
    if (kind.value === 'pair') return `${n}.${l.header} + ${n}.${l.ext}`;
    if (/\.[A-Za-z+]+$/.test(n)) return n;                 // you typed the extension
    return `${n}.${kind.value === 'header' ? l.header : l.ext}`;
  };
  const update = () => { preview.textContent = fileName() ? `Creates ${folder.value.replace(/\/+$/, '')}/${fileName()}` : 'Type a name; the extension is added for you.'; };
  const rebuildKinds = () => { const v = kind.value; const k = choices(kinds(), v, { label: 'What kind' }); k.addEventListener('change', update); kindHost.replaceChildren(k); kind = k; update(); };
  lang.addEventListener('change', rebuildKinds);
  kind.addEventListener('change', update);
  name.addEventListener('input', update);
  folder.addEventListener('input', update);
  update();
  const ok = await dialog({
    title: 'New file', width: '46em',
    body: h('div', { class: 'form dialog-form' },
      h('label', {}, 'Language'), lang,
      h('label', {}, 'What'), kindHost,
      h('label', { for: 'nf-name' }, 'Name'), Object.assign(name, { id: 'nf-name' }),
      h('label', { for: 'nf-dir' }, 'In folder'), Object.assign(folder, { id: 'nf-dir' }),
      h('div', { class: 'full' }, preview)),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }],
  });
  if (!ok || !name.value.trim()) return null;
  const d = (await untilde(folder.value.trim() || start)).replace(/\/+$/, '');
  try {
    if (kind.value === 'pair') {
      const r = await call('project.newPair', { dir: d, name: name.value.trim(), lang: lang.value });
      await openFile(r.files[0]);
      return r.files[1];
    }
    const r = await call('project.newFile', { file: `${d}/${fileName()}`, kind: kind.value, lang: lang.value });
    return r.file;
  } catch (err) { toast(err.message, 'error'); return null; }
}

// ------------------------------------------------------------------ new project
async function newProject() {
  const { workspaceRoot } = await import('./files.js');
  const ws = workspaceRoot();
  const parentGuess = ws ? ws.replace(/\/[^/]+\/?$/, '') || ws : '~';
  const lang = choices([['c', 'C (C17)'], ['cpp', 'C++ (C++20)']], language(), { label: 'Language' });
  const kind = choices([
    ['console', 'Program', 'One executable: src/main'],
    ['library', 'Library + tests', 'A library in src/ and include/, a program that uses it, and tests CTest runs (F7)'],
  ], 'console', { label: 'Kind' });
  const name = h('input', { class: 'field', type: 'text', placeholder: 'my_project', spellcheck: 'false', id: 'np-name' });
  const where = h('input', { class: 'field', type: 'text', value: pathText(parentGuess).replace(/‎/g, ''), spellcheck: 'false', id: 'np-dir' });
  const git = h('input', { type: 'checkbox', checked: true, id: 'np-git' });
  const open = choices([['add', 'Beside the workspace'], ['replace', 'As the workspace']], 'add', { label: 'Open it' });
  const preview = h('div', { class: 'hint small muted' });
  const update = () => {
    const n = name.value.trim().replace(/[^A-Za-z0-9_]+/g, '_') || '<name>';
    const ext = lang.value === 'c' ? 'c' : 'cpp';
    preview.textContent = `${where.value.replace(/\/+$/, '')}/${n}/: CMakeLists.txt, src/main.${ext}${kind.value === 'library' ? `, src/${n}.${ext}, include/${n}.${lang.value === 'c' ? 'h' : 'hpp'}, tests/test_${n}.${ext}` : ''}, .clang-format, .gitignore, README.md. Debug builds have AddressSanitizer and UBSan on.`;
  };
  for (const el of [lang, kind]) el.addEventListener('change', update);
  for (const el of [name, where]) el.addEventListener('input', update);
  update();
  const ok = await dialog({
    title: 'New project', width: '52em',
    body: h('div', { class: 'form dialog-form' },
      h('label', {}, 'Language'), lang,
      h('label', {}, 'Kind'), kind,
      h('label', { for: 'np-name' }, 'Name'), name,
      h('label', { for: 'np-dir' }, 'Create it in'), where,
      h('label', { for: 'np-git' }, 'git'), h('label', { class: 'check' }, git, ' start a git repository'),
      h('label', {}, 'Open it'), open,
      h('div', { class: 'full' }, preview)),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Create project', value: true, primary: true }],
  });
  if (!ok || !name.value.trim()) return;
  let r;
  try { r = await call('project.create', { dir: await untilde(where.value.trim()), name: name.value.trim(), lang: lang.value, kind: kind.value, git: git.checked }); }
  catch (err) { return toast(err.message, 'error', 8000); }
  const files = await import('./files.js');
  if (open.value === 'replace' || !files.workspaceRoot()) {
    const c = await call('config.get');
    const saved = await call('config.save', { ...c, workspace: r.root });
    files.setRoot(r.root); files.setFolders(saved.folders); files.rememberFolder(r.root);
    window.dispatchEvent(new CustomEvent('cpw-config', { detail: saved }));
  } else await files.addFolder(r.root);
  sidebar.show('files');
  await openFile(r.main);
  toast(`Made ${r.root.split('/').pop()}${r.git ? ' (a git repository)' : ''}. Alt+F9 configures, F9 builds, Ctrl+F9 runs${kind.value === 'library' ? ', F7 tests' : ''}.`, 'ok', 9000);
}

// ------------------------------------------------------------------ pick from a list
export function pickFromList(title, items, { empty = 'Nothing here yet.' } = {}) {
  return dialog({
    title, width: '50em', buttons: [{ label: 'Cancel', value: null }],
    body: h('div', { class: 'pick-list' }, items.length ? items.map((it) => h('button', { type: 'button', class: 'list-row pick', 'data-i': '' }, h('span', { class: 'grow' }, it.label), it.hint ? h('span', { class: 'muted' }, it.hint) : null)) : h('p', { class: 'muted' }, empty)),
    onOpen(box, done) {
      box.querySelectorAll('.pick').forEach((b, i) => b.addEventListener('click', () => done(items[i].value)));
      const first = box.querySelector('.pick'); if (first) first.focus();
    },
  });
}

export function initNewStuff() {
  command('project.new', 'New project...', [], newProject);
  command('file.newPair', 'New class / module...', [], async (dir) => {
    const p = await newFileDialog(typeof dir === 'string' ? dir : undefined, { kind: 'pair' });
    if (p) { openFile(p); (await import('./files.js')).renderTree(); }
  });
  command('file.newHeader', 'New header...', [], async () => {
    const p = await newFileDialog(undefined, { kind: 'header' });
    if (p) { openFile(p); (await import('./files.js')).renderTree(); }
  });
  command('file.recent', 'Open a recent file...', [], async () => {
    const list = await call('state.get', { key: 'recent.files', fallback: [] });
    const f = await pickFromList('Recent files', list.map((p) => ({ label: p.split('/').pop(), hint: pathText(p.replace(/\/[^/]+$/, '')), value: p })), { empty: 'Files you open show up here.' });
    if (f) openFile(f);
  });
}
export { newProject };
