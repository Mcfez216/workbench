// The start screen: what you see when nothing is open (and Help → Start
// screen as a tab). The language, the ways to begin, the files and folders
// you had open last, and your vaults.

import { call } from './rpc.js';
import { h, clear, pathText } from './ui.js';
import { desk, tabs, command, runCommand, commands } from './layout.js';
import { openFile } from './editor.js';
import { langSwitch } from './build.js';
import { language, langInfo, toolchainLabel, onLanguageChange } from './lang.js';
import { whereWasI, whereBox } from './comfort.js';

const ACTIONS = [
  ['project.new', 'New project', 'A CMake project in C or C++, or a Cargo project in Rust, with tests if you like'],
  ['file.new', 'New file', 'A program, a source file, a header or a class'],
  ['file.quickOpen', 'Open a file', 'From the folders in Files'],
  ['file.openFolder', 'Open a folder', 'Make it the workspace'],
  ['learn.show', 'Exercises', 'Small steps with tests: C, C++, the security lab, capture the flag'],
  ['sandbox.open', 'Sandbox', 'Try something out: one scratch file, sanitizers on'],
  ['focus.toggle', 'Focus', 'One task, a timer, nothing else on screen'],
  ['guides.show', 'Guides', 'Your vaults of notes'],
  ['app.palette', 'All commands', 'Everything the menus have, by name'],
];

async function renderStart(el) {
  const [files, folders, vaults, where] = await Promise.all([
    call('state.get', { key: 'recent.files', fallback: [] }),
    call('state.get', { key: 'recent.folders', fallback: [] }),
    call('guides.list').then((r) => r.vaults || [], () => []),
    whereWasI(),
  ]);
  const l = language();
  const keyOf = (id) => (commands.get(id) && commands.get(id).keys[0]) || '';
  const action = ([id, label, hint]) => h('button', { type: 'button', class: 'start-action', onclick: () => runCommand(id) },
    h('span', { class: 'sa-label' }, label), keyOf(id) ? h('span', { class: 'kbd' }, keyOf(id)) : null, h('span', { class: 'sa-hint' }, hint));
  const recentFile = (f) => h('button', { type: 'button', class: 'list-row', title: f, onclick: () => openFile(f) },
    h('span', {}, f.split('/').pop()), h('span', { class: 'muted grow path' }, pathText(f.replace(/\/[^/]+$/, ''))));
  const recentFolder = (d) => h('button', { type: 'button', class: 'list-row', title: d, onclick: () => runCommand('file.addFolder', d) },
    h('span', {}, d.split('/').pop() || d), h('span', { class: 'muted grow path' }, pathText(d)));
  const box = h('div', { class: 'start' },
    h('div', { class: 'start-head' },
      h('h1', {}, 'MHDE: C, C++ and Rust'),
      h('div', { class: 'start-lang' }, h('span', { class: 'muted' }, 'Working in'), langSwitch(), h('span', { class: 'muted' }, toolchainLabel(l)), h('span', { class: 'kbd' }, 'Ctrl+Shift+J'))),
    (where.file || where.ex || where.next) ? h('section', { class: 'start-col start-where' }, h('h2', {}, 'Where you were'), whereBox(where)) : null,
    h('div', { class: 'start-cols' },
      h('section', { class: 'start-col' }, h('h2', {}, 'Start'), ACTIONS.map(action)),
      h('section', { class: 'start-col' },
        h('h2', {}, 'Recent files'),
        files.length ? files.slice(0, 8).map(recentFile) : h('p', { class: 'muted' }, 'Files you open show up here.'),
        h('h2', {}, 'Recent folders'),
        folders.length ? folders.slice(0, 5).map(recentFolder) : h('p', { class: 'muted' }, 'Folders you open show up here.')),
      h('section', { class: 'start-col' },
        h('h2', {}, 'Your vaults'),
        vaults.length ? vaults.map((v) => h('button', { type: 'button', class: 'list-row', title: v.path, onclick: () => (v.start ? runCommand('guides.open', v.start, v.path) : runCommand('guides.show')) },
          h('span', {}, v.name), h('span', { class: 'muted grow' }, v.error ? v.error : `${v.count} notes${v.start ? ` · ${v.start}` : ''}`)))
          : h('p', { class: 'muted' }, 'No vaults yet: add a folder of notes.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => runCommand('vault.add') }, '+ Add a vault'),
        h('h2', {}, 'Learn the app'),
        h('button', { type: 'button', class: 'list-row', onclick: () => runCommand('help.welcome') }, h('span', {}, 'Start here: the tour, step by step')),
        h('button', { type: 'button', class: 'list-row', onclick: () => runCommand('help.keys') }, h('span', {}, 'Every key'), h('span', { class: 'kbd' }, keyOf('help.keys'))),
        h('p', { class: 'muted small' }, `New files, projects, the sandbox and the judge start in ${langInfo(l).label}. A .c file is always C, a .cpp file always C++, and a .rs file always Rust. A .h header follows the switch.`))));
  clear(el).append(box);
}

let pending = false;
function refreshDesk() {
  if (!desk.el || pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    if (!desk.el.hidden) renderStart(desk.el);
    const t = tabs.get('start');
    if (t && t.page) renderStart(t.page);
  }, 50);
}

export function initStart() {
  refreshDesk();
  window.addEventListener('cpw-recent', refreshDesk);
  window.addEventListener('cpw-config', refreshDesk);
  onLanguageChange(refreshDesk);
  const prev = tabs.onChange;
  tabs.onChange = (t) => { if (prev) prev(t); if (!t) refreshDesk(); };
  command('help.start', 'Start screen', [], () => tabs.open({
    id: 'start', kind: 'start', title: 'Start', session: { kind: 'start' },
    render(el) { this.page = h('div', { class: 'page' }); el.append(this.page); renderStart(this.page); },
    onShow() { if (this.page) renderStart(this.page); },
  }));
}
