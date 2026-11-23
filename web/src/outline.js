// Outline: what's in the file you're editing (functions, structs, classes,
// enums, namespaces, typedefs, macros), from the editor's own parse of it,
// so it works for C and C++ with or without clangd. Click to jump there;
// the entry the cursor is in is highlighted.

import { syntaxTree } from '@codemirror/language';
import { h, clear, debounce } from './ui.js';
import { sidebar, tabs, command } from './layout.js';
import { goTo } from './editor.js';

let el = null, listEl = null, filterEl = null;
let items = [];
let shownFor = null;

const KIND = {
  FunctionDefinition: ['ƒ', 'function'], StructSpecifier: ['S', 'struct'], ClassSpecifier: ['C', 'class'], UnionSpecifier: ['U', 'union'],
  EnumSpecifier: ['E', 'enum'], NamespaceDefinition: ['N', 'namespace'], TypeDefinition: ['T', 'typedef'], PreprocDirective: ['#', 'macro'],
};

function text(state, node) { return node ? state.sliceDoc(node.from, node.to) : ''; }
function child(node, ...names) { for (let c = node.firstChild; c; c = c.nextSibling) if (names.includes(c.name)) return c; return null; }

// The name of a function from its declarator: foo, Shape::area, ~Shape, operator==
function functionName(state, def) {
  const d = findDeclarator(def);
  if (!d) return null;
  const id = child(d, 'Identifier', 'FieldIdentifier', 'ScopedIdentifier', 'DestructorName', 'OperatorName', 'ScopedFieldIdentifier');
  const params = child(d, 'ParameterList');
  const name = id ? text(state, id) : text(state, d).split('(')[0];
  const sig = params ? text(state, params).replace(/\s+/g, ' ') : '';
  return { name, detail: sig.length > 40 ? sig.slice(0, 39) + '…)' : sig };
}
// int *make(void): the function declarator sits inside a pointer / reference declarator
function findDeclarator(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'FunctionDeclarator') return c;
    if (/Declarator$/.test(c.name)) { const r = findDeclarator(c); if (r) return r; }
  }
  return null;
}

function collect(state) {
  const out = [];
  const tree = syntaxTree(state);
  const depthOf = (node) => { let d = 0; for (let p = node.parent; p; p = p.parent) if (['NamespaceDefinition', 'ClassSpecifier', 'StructSpecifier'].includes(p.name)) d++; return d; };
  tree.iterate({
    enter(n) {
      const k = KIND[n.name];
      if (!k) return;
      const node = n.node;
      let name = null, detail = '';
      if (n.name === 'FunctionDefinition') {
        const f = functionName(state, node);
        if (!f) return;
        ({ name, detail } = f);
      } else if (n.name === 'PreprocDirective') {
        const t = text(state, node);
        const m = t.match(/^#\s*define\s+([A-Za-z_]\w*)(\([^)]*\))?/);
        if (!m) return false;
        name = m[1]; detail = m[2] || '';
      } else if (n.name === 'TypeDefinition') {
        const ids = [];
        for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === 'TypeIdentifier') ids.push(text(state, c));
        name = ids.pop();
        if (!name) return;
      } else if (n.name === 'NamespaceDefinition') {
        name = text(state, child(node, 'Identifier', 'NamespaceIdentifier')) || '(anonymous)';
      } else {
        // a struct / class / enum with a body; `struct P p;` is just a use
        if (!child(node, 'FieldDeclarationList', 'EnumeratorList')) return;
        name = text(state, child(node, 'TypeIdentifier', 'ScopedTypeIdentifier')) || '(anonymous)';
        if (node.parent && node.parent.name === 'TypeDefinition') return;   // listed as the typedef
      }
      out.push({ kind: k[1], icon: k[0], name, detail, from: n.from, to: n.to, line: state.doc.lineAt(n.from).number, depth: depthOf(node) });
      if (n.name === 'FunctionDefinition' || n.name === 'PreprocDirective') return false;   // nothing to list inside
    },
  });
  return out;
}

function activeFileTab() { const t = tabs.active(); return t && t.view && t.lang && t.lang.code ? t : null; }

function render() {
  if (!listEl) return;
  clear(listEl);
  const t = activeFileTab();
  if (!t) { listEl.append(h('p', { class: 'muted pad' }, 'Open a C or C++ file to see what\'s in it.')); return; }
  const f = filterEl.value.trim().toLowerCase();
  const shown = items.filter((it) => !f || it.name.toLowerCase().includes(f) || it.kind.startsWith(f));
  if (!shown.length) { listEl.append(h('p', { class: 'muted pad' }, items.length ? 'Nothing matches.' : 'No functions or types in this file yet.')); return; }
  const pos = t.view.state.selection.main.head;
  let here = -1;
  shown.forEach((it, i) => { if (it.from <= pos && pos <= it.to) here = i; });
  shown.forEach((it, i) => {
    const b = h('button', { type: 'button', class: 'tree-row outline-row' + (i === here ? ' sel' : ''), title: `${it.kind} ${it.name}${it.detail} · line ${it.line}`, style: { paddingLeft: `${1 + it.depth * 2}ch` } },
      h('span', { class: `ol-icon ol-${it.kind}`, 'aria-hidden': 'true' }, it.icon), h('span', { class: 'name' }, it.name), h('span', { class: 'ol-detail' }, it.detail), h('span', { class: 'ol-line' }, String(it.line)));
    b.addEventListener('click', () => goTo(t.view, it.line, 1));
    listEl.append(b);
  });
}

const refresh = debounce(() => {
  const t = activeFileTab();
  items = t ? collect(t.view.state) : [];
  shownFor = t ? t.id : null;
  render();
}, 250);

export function initOutline() {
  sidebar.add({
    id: 'outline', title: 'Outline (this file)', short: 'Outline', cmd: 'view.outline',
    render(e) {
      el = e;
      filterEl = h('input', { class: 'field', type: 'search', placeholder: 'Filter: name, or function / struct / macro', 'aria-label': 'Filter the outline' });
      filterEl.addEventListener('input', render);
      el.append(h('div', { class: 'side-title' }, h('span', {}, 'Outline')), h('div', { class: 'pad' }, filterEl), listEl = h('div', { class: 'outline' }));
      refresh();
    },
    onShow() { refresh(); },
  });
  // follow the editor: another tab, an edit, the cursor moving
  const prev = tabs.onChange;
  tabs.onChange = (t) => { if (prev) prev(t); if (el && sidebar.current === 'outline') refresh(); };
  window.addEventListener('cpw-editor-update', (e) => {
    if (!el || sidebar.current !== 'outline') return;
    if (e.detail.docChanged || shownFor !== (tabs.active() || {}).id) refresh(); else render();
  });
  command('view.outline', 'Outline of this file', ['Ctrl+Shift+B'], () => sidebar.show('outline'));
}
