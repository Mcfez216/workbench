// "Predict the output": read a short program, write what you think it
// prints, then it's compiled and run for real. Wrong guesses are the
// interesting ones: each comes with why. Unseen and missed drills come
// first; your score is kept (Learn → Predict the output).

import { call } from './rpc.js';
import { h, clear } from './ui.js';
import { tabs, command } from './layout.js';
import { highlightToHtml } from './highlight.js';
import { language } from './lang.js';

let drills = [];
let progress = {};   // id -> { right, tries, at }

async function load() {
  if (!drills.length) drills = await call('drills.list');
  progress = await call('state.get', { key: 'drills.progress', fallback: {} }) || {};
}
const save = () => call('state.set', { key: 'drills.progress', value: progress });

// unseen first, then the ones you got wrong, then the rest (oldest first)
function nextDrill(filter, after) {
  const pool = drills.filter((d) => filter === 'all' || d.lang === filter);
  const rank = (d) => { const p = progress[d.id]; return !p ? 0 : !p.right ? 1 : 2; };
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b) || ((progress[a.id] || {}).at || 0) - ((progress[b.id] || {}).at || 0));
  return sorted.find((d) => d.id !== after) || sorted[0];
}

function openDrills() {
  const t = tabs.open({
    id: 'drills', kind: 'drills', title: 'Predict the output', session: { kind: 'page:learn.drills' },
    async render(el) {
      await load();
      this.filter = ['c', 'cpp'].includes(language()) ? language() : 'all';
      this.page = h('div', { class: 'page drills' });
      el.append(this.page);
      this.cur = nextDrill(this.filter);
      draw(this);
    },
  });
  return t;
}

function score() {
  const seen = Object.values(progress);
  return { tried: seen.length, right: seen.filter((p) => p.right).length };
}

function draw(t, result) {
  const d = t.cur;
  const page = t.page;
  clear(page);
  const s = score();
  const filters = h('div', { class: 'choices', role: 'group', 'aria-label': 'Which' }, [['all', 'Both'], ['c', 'C'], ['cpp', 'C++']].map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(t.filter === v) }, label);
    b.addEventListener('click', () => { t.filter = v; t.cur = nextDrill(v); draw(t); });
    return b;
  }));
  page.append(h('div', { class: 'drills-head' }, h('h1', {}, 'Predict the output'), filters,
    h('span', { class: 'muted small' }, s.tried ? `${s.right} of ${s.tried} right so far · ${drills.length} in all` : `${drills.length} short programs. Read one, write what it prints, then see.`)));
  if (!d) return;
  const pre = h('pre', { class: 'cmp-code drill-code' });
  pre.innerHTML = highlightToHtml(d.code, d.lang);
  page.append(h('div', { class: 'drill' },
    h('div', { class: 'code-tools' }, h('span', { class: 'code-lang' }, `${d.lang === 'c' ? 'C' : 'C++'} · ${d.topic}`),
      h('button', { type: 'button', onclick: async () => { const { sandboxWith } = await import('./build.js'); sandboxWith(d.code, d.lang); } }, 'Open in the sandbox')), pre));
  const guess = h('textarea', { class: 'field drill-guess', rows: 2, placeholder: 'What does it print? (exactly; spaces at the ends of lines don\'t matter)', spellcheck: 'false' });
  if (result) guess.value = result.guess;
  const check = h('button', { class: 'btn primary', type: 'button' }, 'Run it and see');
  const next = h('button', { class: 'btn', type: 'button', onclick: () => { t.cur = nextDrill(t.filter, d.id); draw(t); } }, result ? 'Next one' : 'Skip');
  check.addEventListener('click', async () => {
    check.disabled = true;
    check.textContent = 'Compiling and running…';
    const r = await call('drills.run', { id: d.id, guess: guess.value });
    const p = progress[d.id] || { tries: 0 };
    progress[d.id] = { right: !!r.right, tries: p.tries + 1, at: Date.now() };
    save();
    draw(t, { ...r, guess: guess.value });
  });
  page.append(h('div', { class: 'drill-answer' }, guess, h('div', { class: 'row' }, result ? null : check, next)));
  if (result) {
    const ok = result.right;
    page.append(h('div', { class: 'ex-result' + (ok ? ' ok' : '') },
      h('div', { class: 'ex-result-head' }, ok ? '✓ Right' : result.ok ? '✗ Not quite' : 'It didn\'t compile here'),
      h('div', { class: 'tr-cols' },
        h('div', {}, h('div', { class: 'muted small' }, 'You said'), h('pre', {}, result.guess || '(nothing)')),
        h('div', {}, h('div', { class: 'muted small' }, 'It printed'), h('pre', {}, result.output || '(nothing)'))),
      h('p', {}, result.explain)));
  }
  setTimeout(() => guess.focus(), 0);
}

export function initDrills() {
  command('learn.drills', 'Predict the output (C and C++ drills)', [], openDrills);
}
