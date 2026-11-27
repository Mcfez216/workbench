// Compiler explorer, side by side: the sandbox's code compiled two ways
// (gcc against clang, -O0 against -O2...), with how many instructions each
// function became. Watch a loop vanish at -O2, or see two compilers pick
// different instructions for the same line. Sandbox → Compare.

import { call } from './rpc.js';
import { h, clear, toast } from './ui.js';
import { tabs, command } from './layout.js';

const COMPILERS = { c: ['gcc', 'clang'], cpp: ['g++', 'clang++'] };
const OPTS = ['-O0', '-O1', '-O2', '-O3', '-Os'];

// instructions per function, from the filtered listing
function perFunction(lines) {
  const out = new Map();
  let fn = null;
  for (const l of lines) {
    const t = l.text.trim();
    if (l.label || /^[^\s.][^:]*:\s*$/.test(l.text)) { if (!/^\.L/.test(t)) { fn = t.replace(/:$/, ''); if (!out.has(fn)) out.set(fn, 0); } continue; }
    if (fn && t && !t.startsWith('.') && !t.startsWith(';')) out.set(fn, out.get(fn) + 1);
  }
  return out;
}

function sel(options, value, title) {
  const s = h('select', { class: 'field small', title });
  for (const o of options) s.append(h('option', { value: o, selected: o === value }, o));
  return s;
}

export async function openCompare() {
  const sb = tabs.get('sandbox');
  if (!sb || !sb.view) return toast('Open the sandbox (F4) and write some code first', 'error');
  const lang = sb.langId;
  if (lang === 'rust') return toast('Compare is for C and C++ (Rust: switch the optimisation level in the sandbox\'s Assembly view)', 'info', 7000);
  const t = tabs.open({
    id: 'asm-compare', kind: 'asm-compare', title: 'Compare: assembly',
    render(el) {
      this.page = h('div', { class: 'asmcmp' });
      el.append(this.page);
    },
  });
  t.lang = lang;
  t.source = sb.view.state.doc.toString();
  const ccs = COMPILERS[lang];
  t.sides = t.sides && t.sides[0].cc && ccs.includes(t.sides[0].cc) ? t.sides : [{ cc: ccs[0], opt: '-O0' }, { cc: ccs[0], opt: '-O2' }];
  draw(t);
  return t;
}

async function draw(t) {
  const page = t.page;
  clear(page);
  const sb = tabs.get('sandbox');
  const head = h('div', { class: 'asmcmp-head' },
    h('strong', {}, 'The sandbox\'s code, compiled two ways'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { if (sb && sb.view) t.source = sb.view.state.doc.toString(); draw(t); } }, 'Take the sandbox\'s code again'),
    h('span', { class: 'muted small' }, 'Try: -O0 against -O2 (a loop folds into its answer), or gcc against clang at -O2.'));
  page.append(head);
  const grid = h('div', { class: 'asmcmp-grid' });
  page.append(grid);
  const summary = h('div', { class: 'asmcmp-summary' });
  page.append(summary);
  const results = await Promise.all(t.sides.map((side) => call('sandbox.asm', { source: t.source, compiler: side.cc, std: t.lang === 'c' ? 'c17' : 'c++20', opt: side.opt, lang: t.lang }).catch((e) => ({ ok: false, problems: [{ severity: 'error', message: e.message }] }))));
  t.sides.forEach((side, i) => {
    const r = results[i];
    const cc = sel(COMPILERS[t.lang], side.cc, 'Compiler');
    const opt = sel(OPTS, side.opt, 'Optimisation');
    cc.addEventListener('change', () => { side.cc = cc.value; draw(t); });
    opt.addEventListener('change', () => { side.opt = opt.value; draw(t); });
    const lines = r.ok ? r.lines : [];
    const count = lines.filter((l) => !l.label && l.text.trim() && !l.text.trim().startsWith('.')).length;
    const pre = h('pre', { class: 'asmcmp-code' }, r.ok ? lines.map((l) => l.text).join('\n') : `; doesn't compile\n${(r.problems || []).filter((p) => p.severity === 'error').map((p) => `; ${p.line ? `line ${p.line}: ` : ''}${p.message}`).join('\n')}`);
    grid.append(h('div', { class: 'asmcmp-side' }, h('div', { class: 'asmcmp-tools' }, cc, opt, h('span', { class: 'muted small' }, r.ok ? `${count} instructions` : 'compile errors')), pre));
  });
  // per function: where the two differ most
  if (results.every((r) => r.ok)) {
    const [a, b] = results.map((r) => perFunction(r.lines));
    const names = [...new Set([...a.keys(), ...b.keys()])];
    const rows = names.map((n) => [n, a.get(n), b.get(n)]).sort((x, y) => Math.abs((y[1] || 0) - (y[2] || 0)) - Math.abs((x[1] || 0) - (x[2] || 0)));
    const label = (s) => `${s.cc} ${s.opt}`;
    summary.append(h('table', { class: 'asmcmp-table' },
      h('tr', {}, h('th', {}, 'Function'), h('th', {}, label(t.sides[0])), h('th', {}, label(t.sides[1]))),
      rows.slice(0, 20).map(([n, x, y]) => h('tr', {}, h('td', {}, n), h('td', {}, x == null ? 'gone (inlined or removed)' : String(x)), h('td', {}, y == null ? 'gone (inlined or removed)' : String(y))))));
  }
}

export function initAsmCompare() {
  command('sandbox.compare', 'Sandbox: compare the assembly two ways (compilers, -O levels)', [], openCompare);
}
