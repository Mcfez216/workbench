// Add a library (server/libraries.js): crates for Rust, CMake-downloaded
// libraries for C and C++. Build → Add a library..., or the palette.

import { call } from './rpc.js';
import { h, toast, dialog } from './ui.js';
import { command, panel } from './layout.js';
import { activeEditor } from './editor.js';
import { language, fileLanguage } from './lang.js';
import { highlightToHtml } from './highlight.js';
import { startRun, finishRun } from './build.js';

async function where() {
  const t = activeEditor();
  const file = t && t.file;
  const r = await call('cmake.root', file ? { file } : { dir: (await call('config.get')).workspace });
  const lang = (file && fileLanguage(file)) || language();
  return { root: r.root, cargo: r.kind === 'cargo', lang };
}

function exampleBox(code, lang) {
  const pre = h('pre', { class: 'cmp-code' });
  pre.innerHTML = highlightToHtml(code, lang);
  return h('div', { class: 'cmp-side' }, h('div', { class: 'code-tools' }, h('span', { class: 'code-lang' }, 'Example'),
    h('button', { type: 'button', onclick: () => { navigator.clipboard.writeText(code).then(() => toast('Copied', 'ok', 1500), () => {}); } }, 'Copy')), pre);
}

async function addCrate(root, crate) {
  startRun(`cargo add ${crate.add}`);
  const r = await call('libs.addCrate', { root, add: crate.add });
  finishRun({ code: r.code, problems: r.problems || [] }, `Added ${crate.name}: the next build downloads it`, `cargo add ${crate.name} didn't work: see the Build panel`);
  if (!r.ok) panel.show('build');
}

async function rustDialog(root) {
  const { crates } = await call('libs.list', { lang: 'rust' });
  const listEl = h('div', { class: 'pick-list lib-list' });
  const search = h('input', { class: 'field', type: 'search', placeholder: 'Search crates.io: json, http, random, sqlite...', spellcheck: 'false' });
  let done;
  const show = (items, note) => {
    listEl.replaceChildren(...(note ? [h('p', { class: 'muted small' }, note)] : []), ...items.map((c) => h('button', { type: 'button', class: 'list-row pick lib-row', onclick: () => done(c) },
      h('span', { class: 'lib-name' }, c.name, c.version ? h('span', { class: 'muted' }, ` ${c.version}`) : null), h('span', { class: 'muted small lib-about' }, c.about || ''))));
  };
  show(crates, 'The ones everybody uses. Search for anything else.');
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (!q) return show(crates, 'The ones everybody uses. Search for anything else.');
    timer = setTimeout(async () => {
      listEl.replaceChildren(h('p', { class: 'muted small' }, 'Searching crates.io…'));
      try { const r = await call('libs.searchCrates', { q }); show(r.crates, r.crates.length ? '' : 'Nothing found.'); }
      catch (e) { listEl.replaceChildren(h('p', { class: 'muted small' }, e.message)); }
    }, 400);
  });
  const picked = await dialog({
    title: 'Add a crate', width: '56em', buttons: [{ label: 'Cancel', value: null }],
    body: h('div', {}, h('p', { class: 'small' }, `Into ${root.split('/').pop()}'s Cargo.toml, with cargo add. The next build downloads it.`), search, listEl),
    onOpen(box, close) { done = close; setTimeout(() => search.focus(), 0); },
  });
  if (picked) await addCrate(root, picked);
}

async function cmakeDialog(root, lang) {
  const { recipes } = await call('libs.list', { lang });
  let done;
  const picked = await dialog({
    title: `Add a library (${lang === 'c' ? 'C' : 'C++'})`, width: '56em', buttons: [{ label: 'Cancel', value: null }],
    body: h('div', {}, h('p', { class: 'small' }, `Into ${root.split('/').pop()}'s CMakeLists.txt: a pinned version CMake downloads and builds itself on the next build (that needs the internet once). No package manager to install.`),
      h('div', { class: 'pick-list lib-list' }, recipes.map((r) => h('button', { type: 'button', class: 'list-row pick lib-row', onclick: () => done(r) },
        h('span', { class: 'lib-name' }, r.name, h('span', { class: 'muted' }, ` ${r.version}`)), h('span', { class: 'muted small lib-about' }, r.about))))),
    onOpen(box, close) { done = close; },
  });
  if (!picked) return;
  let r = await call('libs.addCmake', { root, id: picked.id });
  if (r.needTarget) {
    const { pickFromList } = await import('./newstuff.js');
    const target = await pickFromList(`Which program uses ${picked.name}?`, r.choices.map((c) => ({ label: c, value: c })));
    if (!target) return;
    r = await call('libs.addCmake', { root, id: picked.id, target });
  }
  if (r.already) toast(`${picked.name} is already in CMakeLists.txt`, 'info', 5000);
  await dialog({
    title: r.already ? `${picked.name} is already there` : `Added ${picked.name}`, width: '60em', buttons: [{ label: 'Open CMakeLists.txt', value: 'open' }, { label: 'OK', value: null, primary: true }],
    body: h('div', {}, h('p', {}, r.already ? 'It was added before.' : `At the end of CMakeLists.txt, linked to ${r.target}. F9 downloads and builds it the first time (Alt+F9 if CMake needs to configure again).`),
      picked.needs ? h('p', { class: 'small' }, picked.needs) : null, h('p', { class: 'small' }, 'To try it:'), exampleBox(picked.example, lang)),
  }).then(async (v) => { if (v === 'open') { const { openFile } = await import('./editor.js'); openFile(r.file); } });
}

export async function addLibrary() {
  const w = await where();
  if (!w.root) return toast('Open a file in a CMake or Cargo project first (File → New project makes one)', 'error', 7000);
  if (w.cargo) return rustDialog(w.root);
  return cmakeDialog(w.root, w.lang === 'c' ? 'c' : 'cpp');
}

export function initLibraries() {
  command('project.addLibrary', 'Add a library to this project...', [], addLibrary);
}
