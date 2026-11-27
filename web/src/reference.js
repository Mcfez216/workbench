// The reference: the C library and C++ standard library essentials, built
// in (no browser, no rabbit hole), each with its pitfall and a security
// note. The full manual page opens in a tab too; cppreference is one click
// further for everything else.

import { call } from './rpc.js';
import { h, clear, toast } from './ui.js';
import { tabs, command } from './layout.js';
import { activeEditor } from './editor.js';
import { REF } from './refdata.js';
import { language } from './lang.js';

const entries = REF.map(([name, lang, header, sig, what, pitfall, security]) => ({ name, lang, header, sig, what, pitfall, security }));
const LABEL = { c: 'C', cpp: 'C++', rust: 'Rust' };
// prefer: the language to look in first (a Rust file looks up Rust's Vec, not C++'s vector)
export function lookup(word, prefer) {
  const w = String(word || '').trim().replace(/^std::/, '').replace(/!$/, '').toLowerCase();
  if (!w) return null;
  const hits = entries.filter((e) => { const n = e.name.toLowerCase().replace(/!$/, ''); return n === w || n === `std::${w}` || n === `&${w}` || n.split('::').pop() === w && e.lang === 'rust'; });
  return hits.find((e) => e.lang === prefer) || hits[0] || null;
}
function docsLink(e) {
  if (e.lang === 'rust') return h('a', { class: 'btn', href: `https://doc.rust-lang.org/std/?search=${encodeURIComponent(e.name.replace(/[!&?]/g, '').split('::').pop())}`, target: '_blank', rel: 'noopener' }, 'Rust docs ↗');
  return h('a', { class: 'btn', href: `https://en.cppreference.com/mwiki/index.php?search=${encodeURIComponent(e.name)}`, target: '_blank', rel: 'noopener' }, 'cppreference ↗');
}
function where(e) {
  if (/^\(/.test(e.header)) return e.header;
  return e.lang === 'rust' ? `use ${e.header};` : `#include <${e.header}>`;
}

function wordAtCursor() {
  const t = activeEditor();
  if (!t) return '';
  const st = t.view.state, sel = st.selection.main;
  if (!sel.empty) return st.sliceDoc(sel.from, sel.to);
  const line = st.doc.lineAt(sel.head), col = sel.head - line.from;
  const re = /[A-Za-z_][\w:]*/g;
  let m;
  while ((m = re.exec(line.text))) if (m.index <= col && col <= m.index + m[0].length) return m[0];
  return '';
}

function openReference(word) {
  const prefer = (activeEditor() && /\.rs$/i.test(activeEditor().file || '')) ? 'rust' : language();
  const t = tabs.open({
    id: 'reference', kind: 'reference', title: 'Reference', session: { kind: 'page:help.reference' },
    render(el) {
      this.search = h('input', { class: 'field', type: 'search', placeholder: 'printf, malloc, vector, unique_ptr, Vec, Option...', 'aria-label': 'Look up' });
      this.filter = 'all';
      this.list = h('div', { class: 'ref-list' });
      this.detail = h('div', { class: 'ref-detail page' });
      const tabsRow = h('div', { class: 'choices', role: 'group' }, [['all', 'All'], ['c', 'C'], ['cpp', 'C++'], ['rust', 'Rust']].map(([v, label]) => {
        const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(v === 'all') }, label);
        b.addEventListener('click', () => { this.filter = v; tabsRow.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); this.draw(); });
        return b;
      }));
      el.append(h('div', { class: 'toolbar' }, this.search, tabsRow, h('span', { class: 'grow' }), h('span', { class: 'muted small' }, 'Ctrl+Shift+H looks up the word under the cursor')),
        h('div', { class: 'ref-body' }, this.list, this.detail));
      this.draw = () => {
        const q = this.search.value.trim().toLowerCase().replace(/^std::/, '');
        clear(this.list);
        const shown = entries.filter((e) => (this.filter === 'all' || e.lang === this.filter) && (!q || e.name.toLowerCase().includes(q) || e.what.toLowerCase().includes(q)));
        for (const e of shown) {
          const b = h('button', { type: 'button', class: 'list-row' + (this.sel === e ? ' sel' : '') }, h('span', { class: 'grow' }, e.name), h('span', { class: 'muted' }, LABEL[e.lang]));
          b.addEventListener('click', () => this.show(e));
          this.list.append(b);
        }
        if (!shown.length) this.list.append(h('p', { class: 'muted pad' }, 'Not in the built-in list.'), h('div', { class: 'pad' }, this.moreButtons(q)));
      };
      this.moreButtons = (q) => h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => manPage(q.replace(/^std::/, '')) }, `man ${q || '...'}`),
        h('a', { class: 'btn small', href: `https://en.cppreference.com/mwiki/index.php?search=${encodeURIComponent(q)}`, target: '_blank', rel: 'noopener' }, 'cppreference ↗'));
      this.show = (e) => {
        this.sel = e;
        clear(this.detail);
        this.detail.append(h('div', { class: 'md' },
          h('h1', {}, e.name), h('p', { class: 'muted' }, `${LABEL[e.lang]} · ${where(e)}`),
          h('pre', { class: 'ref-sig' }, e.sig),
          h('p', {}, e.what),
          e.pitfall ? h('div', { class: 'callout' }, h('div', { class: 'callout-title' }, 'Watch out'), h('div', { class: 'callout-body' }, e.pitfall)) : null,
          e.security ? h('div', { class: 'callout', 'data-callout': 'warning' }, h('div', { class: 'callout-title' }, 'Security'), h('div', { class: 'callout-body' }, e.security)) : null,
          h('div', { class: 'row' },
            e.lang === 'c' && /^[a-z_]+$/.test(e.name) ? h('button', { class: 'btn', type: 'button', onclick: () => manPage(`3 ${e.name}`) }, `man 3 ${e.name}`) : null,
            docsLink(e))));
        this.draw();
      };
      this.search.addEventListener('input', () => { this.draw(); const hit = lookup(this.search.value, prefer); if (hit) this.show(hit); });
      this.draw();
    },
  });
  if (word !== undefined) {
    t.search.value = word;
    t.draw();
    const hit = lookup(word, prefer);
    if (hit) t.show(hit);
    else { clear(t.detail); t.detail.append(h('p', {}, `"${word}" isn't in the built-in reference.`), t.moreButtons(word)); }
  }
  setTimeout(() => t.search.focus(), 0);
  return t;
}

// A manual page, inside the app
export async function manPage(page) {
  let r;
  try { r = await call('man.page', { page }); }
  catch (err) { return toast(err.message, 'error', 8000); }
  tabs.open({ id: 'man:' + r.page, kind: 'man', title: `man ${r.page}`, render(el) { el.append(h('pre', { class: 'page man-page' }, r.text)); } });
}

export function initReference() {
  command('help.reference', 'Reference (C, C++ and Rust)', [], () => openReference());
  // Ctrl+Shift+H: the word under the cursor, here first
  command('help.cppref', 'Look it up', ['Ctrl+Shift+H'], () => openReference(wordAtCursor() || ''));
  command('help.man', 'man page...', [], async () => {
    const { prompt } = await import('./ui.js');
    const page = await prompt('man page', 'Which page?', language() === 'c' ? '3 printf' : 'gdb', { hint: 'For example: 3 printf · 3 malloc · gdb · gcc · valgrind. Opens in a tab.' });
    if (page) manPage(page);
  });
}
