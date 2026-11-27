// The memory view: step through a program and see its memory as boxes and
// arrows. Each function call is a box on the stack (newest on top) with its
// variables; memory from malloc / new sits on the heap; every pointer is an
// arrow to what it points at. ← and → (or the slider) move through the run,
// backwards too. What changed since the step before is highlighted.

import { call } from './rpc.js';
import { h, clear, toast } from './ui.js';
import { tabs, command } from './layout.js';
import { activeEditor } from './editor.js';
import { language } from './lang.js';
import { EditorView, Decoration } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { editorHighlight } from './highlight.js';

const setLine = StateEffect.define();
const lineField = StateField.define({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) if (e.is(setLine)) d = e.value ? Decoration.set([Decoration.line({ class: 'cm-vizLine' }).range(tr.state.doc.line(e.value).from)]) : Decoration.none;
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function short(v) {
  const s = String(v === null || v === undefined ? '?' : v);
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

async function open(source, lang, title) {
  const t = tabs.open({
    id: 'memviz', kind: 'memviz', title: 'Memory view',
    render(el) {
      this.runBtn = h('button', { class: 'btn primary', type: 'button', title: 'Compile (-O0 -g) and record every line under gdb' }, 'Run it');
      this.prev = h('button', { class: 'btn', type: 'button', title: 'Step back (←)' }, '◄');
      this.next = h('button', { class: 'btn', type: 'button', title: 'Step forward (→)' }, '►');
      this.slider = h('input', { type: 'range', min: '0', max: '0', value: '0', class: 'viz-slider', 'aria-label': 'Step' });
      this.count = h('span', { class: 'muted' });
      this.inputBox = h('textarea', { class: 'field mono', rows: 2, placeholder: 'Input for the program (what you would type), if it reads any', spellcheck: 'false' });
      this.status = h('div', { class: 'viz-status muted small' });
      this.codeHost = h('div', { class: 'viz-code' });
      this.stack = h('div', { class: 'viz-stack' });
      this.heap = h('div', { class: 'viz-heap' });
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'viz-arrows');
      this.mem = h('div', { class: 'viz-mem' }, h('div', { class: 'viz-col' }, h('div', { class: 'viz-col-title' }, 'Stack (function calls)'), this.stack), h('div', { class: 'viz-col' }, h('div', { class: 'viz-col-title' }, 'Heap (malloc / new)'), this.heap), this.svg);
      this.out = h('pre', { class: 'viz-out output' });
      el.append(h('div', { class: 'toolbar' }, this.runBtn, this.prev, this.slider, this.next, this.count, h('span', { class: 'grow' }), h('span', { class: 'muted small' }, '← → step · Home / End')),
        h('div', { class: 'viz-body' }, h('div', { class: 'viz-left' }, this.codeHost, h('div', { class: 'viz-io' }, h('div', { class: 'muted small' }, 'Input'), this.inputBox, h('div', { class: 'muted small' }, 'Output'), this.out)),
          h('div', { class: 'viz-right' }, this.status, this.mem)));
      this.view = new EditorView({ parent: this.codeHost, state: EditorState.create({ doc: '', extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), cpp(), syntaxHighlighting(editorHighlight), lineField, EditorView.lineWrapping] }) });
      this.go = (i) => { if (!this.steps || !this.steps.length) return; this.i = Math.max(0, Math.min(i, this.steps.length - 1)); show(this); };
      this.prev.addEventListener('click', () => this.go(this.i - 1));
      this.next.addEventListener('click', () => this.go(this.i + 1));
      this.slider.addEventListener('input', () => this.go(+this.slider.value));
      this.runBtn.addEventListener('click', () => record(this));
      el.tabIndex = -1;
      el.addEventListener('keydown', (e) => {
        if (e.target.closest('textarea, input')) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.i - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.i + 1); }
        else if (e.key === 'Home') { e.preventDefault(); this.go(0); }
        else if (e.key === 'End') { e.preventDefault(); this.go(this.steps.length - 1); }
      });
      this.ro = new ResizeObserver(() => arrows(this));
      this.ro.observe(this.mem);
    },
    onClose() { if (this.ro) this.ro.disconnect(); },
  });
  t.source = source; t.lang = lang;
  t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: source } });
  t.status.textContent = `${title}: press Run it.`;
  record(t);
  return t;
}

async function record(t) {
  t.runBtn.disabled = true;
  t.status.textContent = 'Running it under gdb, one line at a time...';
  clear(t.stack); clear(t.heap); clear(t.svg);
  let r;
  try { r = await call('memviz.trace', { source: t.source, lang: t.lang, input: t.inputBox.value }); }
  catch (err) { t.status.textContent = err.message; t.runBtn.disabled = false; return; }
  t.runBtn.disabled = false;
  if (!r.compiled) {
    t.status.textContent = 'It doesn\'t compile yet: see Problems.';
    const { finishRun } = await import('./build.js');
    finishRun({ code: 1, problems: r.problems }, '', 'Memory view: compile errors');
    return;
  }
  t.steps = r.steps; t.end = r.end;
  t.slider.max = String(Math.max(0, r.steps.length - 1));
  if (!r.steps.length) { t.status.textContent = `Nothing to show (${r.end}).`; return; }
  t.go(0);
  t.el.focus();
}

function show(t) {
  const s = t.steps[t.i];
  const prev = t.steps[t.i - 1];
  t.slider.value = String(t.i);
  t.count.textContent = `step ${t.i + 1} of ${t.steps.length}`;
  if (s.line) t.view.dispatch({ effects: [setLine.of(s.line), EditorView.scrollIntoView(t.view.state.doc.line(s.line).from, { y: 'center' })] });
  t.status.textContent = s.note ? s.note : t.i === t.steps.length - 1 ? `Last step: the program ${t.end}.` : `About to run line ${s.line}.`;
  t.out.textContent = s.stdout || '';
  clear(t.stack);
  const before = new Map();
  if (prev) for (const f of prev.frames) for (const v of f.vars) before.set(`${f.func}:${f.level}:${v.name}`, v.value);
  for (const f of s.frames) {
    const box = h('div', { class: 'viz-frame' + (f === s.frames[0] ? ' top' : '') }, h('div', { class: 'viz-frame-title' }, `${f.func}()`, h('span', { class: 'muted' }, ` line ${f.line}`)));
    if (!f.vars.length) box.append(h('div', { class: 'muted small viz-empty' }, 'no variables'));
    for (const v of f.vars) {
      const key = `${f.func}:${f.level}:${v.name}`;
      const changed = prev && before.has(key) && before.get(key) !== v.value;
      const isPtr = v.ptr !== undefined && v.ptr !== null;
      const row = h('div', { class: 'viz-var' + (changed ? ' changed' : ''), 'data-var': `${f.level}:${v.name}`, title: `${v.type} ${v.name} at ${v.addr || '?'} (${v.size} bytes)` },
        h('span', { class: 'viz-name' }, v.name), h('span', { class: 'viz-type muted' }, v.type),
        isPtr ? h('span', { class: 'viz-val ptr' }, v.isNull ? '⊘ NULL' : h('span', { class: 'viz-dot', 'data-from': `${f.level}:${v.name}`, 'data-to': v.target ? (v.target.kind === 'var' ? `var:${v.target.level}:${v.target.name}` : `heap:${v.target.addr}`) : '' }, '●'), v.isNull ? null : h('span', { class: 'muted small' }, ` ${v.target && v.target.kind === 'var' && v.target.offset ? `${v.target.name} + ${v.target.offset} bytes` : ''}`))
          : h('span', { class: 'viz-val' }, short(v.value)),
        h('span', { class: 'viz-addr muted' }, v.addr ? v.addr.replace(/^0x7ff[0-9a-f]+?([0-9a-f]{4})$/, '…$1') : ''));
      box.append(row);
    }
    t.stack.append(box);
  }
  clear(t.heap);
  if (!s.heap.length) t.heap.append(h('div', { class: 'muted small viz-empty' }, 'nothing allocated (that a pointer points at)'));
  for (const b of s.heap) t.heap.append(h('div', { class: 'viz-block', 'data-heap': b.addr, title: `${b.type} at ${b.addr}` }, h('div', { class: 'viz-frame-title' }, b.type || 'memory', h('span', { class: 'muted' }, ` ${b.addr}`)), h('div', { class: 'viz-val' }, short(b.value))));
  requestAnimationFrame(() => arrows(t));
}

// arrows from each pointer's dot to what it points at
function arrows(t) {
  const svg = t.svg;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const base = t.mem.getBoundingClientRect();
  svg.setAttribute('width', t.mem.scrollWidth); svg.setAttribute('height', t.mem.scrollHeight);
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = '<marker id="viz-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"></path></marker>';
  svg.append(defs);
  for (const dot of t.mem.querySelectorAll('.viz-dot')) {
    const to = dot.dataset.to;
    if (!to) continue;
    const target = to.startsWith('var:') ? t.mem.querySelector(`[data-var="${CSS.escape(to.slice(4))}"]`) : t.mem.querySelector(`[data-heap="${CSS.escape(to.slice(5))}"]`);
    if (!target) continue;
    const a = dot.getBoundingClientRect(), b = target.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - base.left + t.mem.scrollLeft, y1 = a.top + a.height / 2 - base.top + t.mem.scrollTop;
    const toHeap = to.startsWith('heap:');
    const x2 = (toHeap ? b.left : b.right) - base.left + t.mem.scrollLeft + (toHeap ? -2 : 2), y2 = b.top + b.height / 2 - base.top + t.mem.scrollTop;
    const bend = toHeap ? Math.max(40, (x2 - x1) / 2) : Math.max(40, Math.abs(y2 - y1) / 3 + 30);
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', toHeap ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + bend},${y1} ${x2 + bend},${y2} ${x2},${y2}`);
    p.setAttribute('class', 'viz-arrow');
    p.setAttribute('marker-end', 'url(#viz-head)');
    svg.append(p);
  }
}

// What to show: the file you're in if it's a program, else the sandbox
async function openFor(file) {
  if (typeof file === 'string') {
    const r = await call('files.read', { file });
    const src = /\bmain\s*\(/.test(r.text) ? r.text : null;
    if (!src) return toast('The memory view runs a whole program: this file has no main(). Try the sandbox (F4), or an exercise\'s test.', 'info', 7000);
    return open(src, /\.c$/.test(file) ? 'c' : 'cpp', file.split('/').pop());
  }
  const t = tabs.active();
  if (t && t.id === 'sandbox' && t.view && t.langId === 'rust') return toast('The memory view is for C and C++. In Rust, the borrow checker does this job while compiling: the vault\'s ownership notes draw the same boxes and arrows.', 'info', 9000);
  if (t && t.id === 'sandbox' && t.view) return open(t.view.state.doc.toString(), t.langId, `the ${t.langId === 'c' ? 'C' : 'C++'} sandbox`);
  const e = activeEditor();
  if (e && /\.(c|cpp|cc|cxx)$/.test(e.file) && /\bmain\s*\(/.test(e.view.state.doc.toString())) return open(e.view.state.doc.toString(), /\.c$/.test(e.file) ? 'c' : 'cpp', e.title);
  const sb = tabs.get('sandbox');
  if (sb && sb.view && sb.langId !== 'rust') return open(sb.view.state.doc.toString(), sb.langId, 'the sandbox');
  const src = language() === 'c'
    ? '#include <stdio.h>\n#include <stdlib.h>\n\nstatic void bump(int *x) {\n    *x += 1;\n}\n\nint main(void) {\n    int a[3] = {1, 2, 3};\n    int *p = &a[1];\n    int *h = malloc(sizeof *h);\n    *h = 42;\n    bump(p);\n    printf("%d %d\\n", a[1], *h);\n    free(h);\n    return 0;\n}\n'
    : '#include <iostream>\n#include <memory>\n#include <vector>\n\nint main() {\n    std::vector<int> v{1, 2};\n    v.push_back(3);\n    auto p = std::make_unique<int>(7);\n    int* raw = p.get();\n    std::cout << *raw << \'\\n\';\n    return 0;\n}\n';
  return open(src, language(), 'an example');
}

export function initMemviz() {
  command('memviz.open', 'Visualise memory (step through a program)', [], () => openFor());
  command('memviz.file', 'Visualise memory for a file', [], (f) => openFor(f), { needsArgs: true });
}
