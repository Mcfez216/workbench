// The progress map: every topic, how far you are in it, and what you did
// on each of the last four weeks. No streaks, nothing to lose: a day off
// is just a day off.

import { call } from './rpc.js';
import { h } from './ui.js';
import { tabs, command, runCommand } from './layout.js';

async function openProgress() {
  tabs.open({
    id: 'progress', kind: 'progress', title: 'Progress', session: { kind: 'page:learn.progress' },
    render(el) { this.page = h('div', { class: 'page progress' }); el.append(this.page); fill(this.page); },
    onShow() { if (this.page) fill(this.page); },
  });
}

async function fill(page) {
  const s = await call('progress.summary');
  page.replaceChildren();
  page.append(h('h1', {}, 'Progress'),
    h('p', {}, `${s.totals.done} exercise${s.totals.done === 1 ? '' : 's'} done, ${s.totals.started} under way, out of ${s.totals.all}.`),
    h('p', { class: 'muted small' }, 'Filled: done. Half: started. Empty: not yet. Click one to open it; they don\'t have to go in order.'));
  const tracks = [...new Set(s.topics.map((t) => t.track))];
  for (const tr of tracks) {
    page.append(h('h2', {}, tr));
    const grid = h('div', { class: 'topic-grid' });
    for (const t of s.topics.filter((x) => x.track === tr)) {
      grid.append(h('div', { class: 'topic' + (t.done === t.exercises.length ? ' all' : '') },
        h('div', { class: 'topic-name' }, t.topic),
        h('div', { class: 'topic-ex' }, t.exercises.map((e) => h('button', { type: 'button', class: 'pip ' + (e.done ? 'done' : e.step > 0 ? 'half' : 'none'), title: `${e.title}: ${e.done ? 'done' : `step ${Math.min(e.step + 1, e.steps)} of ${e.steps}`}`, onclick: () => runCommand('exercise.open', e.id) }, e.title)))));
    }
    page.append(grid);
  }
  // the last 28 days, oldest first
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ key, d, v: s.days[key] || { steps: 0, checks: 0, minutes: 0 } });
  }
  const max = Math.max(1, ...days.map((x) => x.v.steps || 0));
  const total = Object.values(s.days).reduce((a, v) => ({ steps: a.steps + (v.steps || 0), minutes: a.minutes + (v.minutes || 0) }), { steps: 0, minutes: 0 });
  page.append(h('h2', {}, 'The last four weeks'),
    h('div', { class: 'day-bars', role: 'img', 'aria-label': 'Steps finished each day' }, days.map((x) => h('div', { class: 'day', title: `${x.d.toDateString()}: ${x.v.steps || 0} step${x.v.steps === 1 ? '' : 's'}, ${x.v.checks || 0} check${x.v.checks === 1 ? '' : 's'}${x.v.minutes ? `, ${x.v.minutes} min focused` : ''}` },
      h('div', { class: 'day-bar', style: { height: `${Math.round(((x.v.steps || 0) / max) * 100)}%` } }), h('div', { class: 'day-label' }, x.d.getDate() === 1 || x === days[0] || x === days[days.length - 1] ? `${x.d.getDate()}/${x.d.getMonth() + 1}` : '')))),
    h('p', { class: 'muted' }, `Altogether: ${total.steps} step${total.steps === 1 ? '' : 's'} finished${total.minutes ? `, ${total.minutes} minutes in focus mode` : ''}.`));
}

export function initProgress() {
  command('learn.progress', 'Progress map', [], openProgress);
}
