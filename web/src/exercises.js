// Exercises: small, one step at a time. The Learn sidebar lists them by
// track (C basics, C++ basics, the security lab, capture the flag) with how
// far you are; an exercise opens your file on the left and its steps on the
// right. Only the step you're on is open; F7 checks your code; a passed step
// opens the next. Hints come one at a time, the solution only if you ask.

import { call, on } from './rpc.js';
import { h, clear, toast, confirm, dialog } from './ui.js';
import { sidebar, tabs, command, runCommand, panel } from './layout.js';
import { openFile, activeEditor } from './editor.js';
import { renderMarkdown, renderInline } from './markdown.js';
import { explain, explanationBox, remember } from './explain.js';
import { startRun, finishRun } from './build.js';
import { trackRows } from './tracks.js';

let listEl = null;
let items = [];

const STATUS = (it) => (it.done ? '✓' : it.step > 0 || it.attempts > 0 ? '◐' : '○');

// The exercise of the day: a small box at the top of Learn and on the start screen
export async function todayBox() {
  let d;
  try { d = await call('exercises.today'); } catch (e) { return null; }
  return h('div', { class: 'today-box' + (d.done ? ' done' : '') },
    h('div', { class: 'today-title' }, d.done ? '✓ Today\'s exercise: done' : 'Today\'s exercise'),
    h('button', { type: 'button', class: 'link today-name', onclick: () => openToday() }, d.title),
    h('div', { class: 'muted small' }, d.done ? 'That\'s today\'s practice. Anything more is a bonus.' : d.reason));
}
export async function openToday() {
  const d = await call('exercises.today');
  const it = (items.length ? items : await refreshExercises()).find((x) => x.id === d.id);
  // doing a finished one again: start from the starter (the old file is kept as a .bak)
  if (d.redo && it && it.done) {
    if (!(await confirm('Do it again from memory?', `"${d.title}" starts again from the beginning. Your finished file is kept next to it as a backup.`, 'Start again', 'Not now'))) return;
    await call('exercises.reset', { id: d.id });
  }
  return openExercise(d.id);
}

export async function refreshExercises() {
  items = await call('exercises.list');
  render();
  return items;
}
export function exerciseForFile(file) {
  if (!file) return null;
  return items.find((it) => file.startsWith(it.dir + '/')) || null;
}
export function currentExercise() {
  const t = tabs.active();
  if (t && t.kind === 'exercise') return t.exId;
  const e = activeEditor();
  const it = e && exerciseForFile(e.file);
  if (it) return it.id;
  // the file on the other side of the split
  const other = tabs.get(tabs.activeBy.left) || tabs.get(tabs.activeBy.right);
  return other && other.kind === 'exercise' ? other.exId : null;
}

function render() {
  if (!listEl) return;
  clear(listEl);
  const tracks = [...new Set(items.map((i) => i.track))];
  const done = items.filter((i) => i.done).length;
  const slot = h('div', {});
  listEl.append(slot);
  todayBox().then((b) => { if (b) slot.replaceWith(b); });
  listEl.append(h('p', { class: 'pad muted small' }, `${done} of ${items.length} done. Pick any; they don't have to go in order.`));
  for (const tr of tracks) {
    listEl.append(h('div', { class: 'tree-group' }, tr));
    for (const it of items.filter((i) => i.track === tr)) {
      const b = h('button', { type: 'button', class: 'tree-row ex-row' + (it.done ? ' done' : ''), title: `${it.title}: ${it.done ? 'done' : `step ${Math.min(it.step + 1, it.steps)} of ${it.steps}`}` },
        h('span', { class: 'ex-status', 'aria-hidden': 'true' }, STATUS(it)), h('span', { class: 'name' }, it.title),
        h('span', { class: 'ex-meta' }, it.kind === 'ctf' ? 'CTF' : ({ c: 'C', cpp: 'C++', rust: 'Rust' }[it.lang] || 'C++')));
      b.addEventListener('click', () => openExercise(it.id));
      listEl.append(b);
    }
  }
  // programs you build a milestone at a time (tracks.js)
  listEl.append(trackRows());
}

// ------------------------------------------------------------------ the exercise tab
export async function openExercise(id) {
  const o = await call('exercises.open', { id });
  const ex = o.exercise;
  call('state.set', { key: 'where.exercise', value: { id, title: ex.title, at: Date.now() } });
  // your file on the left, the steps beside it
  if (o.file) {
    const ft = await openFile(o.file, { side: 'left' });
    if (ft && ft.side === 'right') tabs.move(ft.id, 'left');
  }
  const tid = 'exercise:' + id;
  let t = tabs.get(tid);
  if (!t) {
    t = tabs.open({
      id: tid, kind: 'exercise', title: ex.title, side: o.file ? 'right' : undefined, session: { kind: 'exercise', ex: id },
      render(el) {
        this.exId = id;
        this.page = h('div', { class: 'page exercise' });
        el.append(this.page);
        this.data = o;
        this.hintsShown = {};
        draw(this);
      },
      onShow() { if (this.stale) { this.stale = false; reloadTab(this); } },
    });
  } else {
    t.data = o;
    draw(t);
    tabs.focus(tid);
  }
  if (o.file) { const ft = tabs.get('file:' + o.file); if (ft) tabs.focus(ft.id); }
  return t;
}

async function reloadTab(t) {
  t.data = await call('exercises.open', { id: t.exId });
  draw(t);
}

function md(text) { const d = h('div', { class: 'md' }); d.innerHTML = renderMarkdown(text || '').html; return d; }

function draw(t, result) {
  const { exercise: ex, progress: pr, dir, binary } = t.data;
  const page = t.page;
  const top = page.scrollTop;
  clear(page);
  const cur = pr.done ? ex.steps.length : pr.step;
  page.append(h('div', { class: 'ex-head' },
    h('div', { class: 'ex-tags' }, h('span', { class: 'tag' }, ex.track), h('span', { class: 'tag' }, ex.topic), h('span', { class: 'tag' }, ex.kind === 'ctf' ? 'Capture the flag' : ({ c: 'C', cpp: 'C++', rust: 'Rust' }[ex.lang] || 'C++'))),
    h('h1', {}, ex.title), md(ex.intro),
    h('p', { class: 'muted small' }, pr.done ? 'Done. Everything below stays open to look back at.' : `Step ${cur + 1} of ${ex.steps.length}.${ex.kind === 'ctf' ? '' : ' F7 checks your code (or the button). Your file: ' + ex.file}`)));
  const list = h('ol', { class: 'ex-steps' });
  ex.steps.forEach((s, i) => {
    const state = i < cur ? 'done' : i === cur ? 'current' : 'locked';
    const li = h('li', { class: `ex-step ${state}` });
    li.append(h('div', { class: 'ex-step-head' }, h('span', { class: 'ex-mark', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'current' ? '►' : '·'), h('span', {}, `Step ${i + 1}: ${s.title}`),
      state === 'locked' ? h('span', { class: 'muted small' }, ' (opens when the step before passes)') : null));
    if (state !== 'locked') {
      const body = h('div', { class: 'ex-step-body' }, md(s.brief));
      if (state === 'done' && s.type === 'reflect' && pr.reflections && pr.reflections[i]) body.append(h('div', { class: 'ex-reflection' }, h('div', { class: 'muted small' }, 'You wrote:'), h('p', {}, pr.reflections[i])));
      if (state === 'current') body.append(currentStepTools(t, s, i, binary, dir));
      if (state === 'done' && i !== cur - 1) body.hidden = true;
      li.append(body);
      li.querySelector('.ex-step-head').addEventListener('click', () => { if (state === 'done') body.hidden = !body.hidden; });
    }
    list.append(li);
  });
  page.append(list);
  if (result) page.append(resultBox(result, ex));
  if (pr.done) page.append(h('div', { class: 'ex-finished' }, h('p', {}, `Finished: ${ex.title}.`), h('div', { class: 'row' },
    h('button', { class: 'btn primary', type: 'button', onclick: () => nextExercise(ex.id) }, 'Next exercise'),
    h('button', { class: 'btn', type: 'button', onclick: () => runCommand('learn.progress') }, 'Progress map'))));
  page.append(h('div', { class: 'ex-footer row' },
    ex.kind !== 'ctf' ? h('button', { class: 'btn small', type: 'button', onclick: () => showSolution(t) }, 'Show the solution...') : null,
    ex.kind !== 'ctf' ? h('button', { class: 'btn small', type: 'button', onclick: () => resetExercise(t) }, 'Start over...') : null,
    h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('term.new', dir) }, 'Terminal here'),
    ex.kind === 'program' ? h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('memviz.file', t.data.file) }, 'Memory view') : null));
  page.scrollTop = top;
}

function currentStepTools(t, s, i, binary, dir) {
  const box = h('div', { class: 'ex-tools' });
  const hints = s.hints || [];
  const shown = t.hintsShown[i] || 0;
  const hintList = h('ol', { class: 'ex-hints' }, hints.slice(0, shown).map((x) => { const li = h('li', {}); li.innerHTML = renderInline(x); return li; }));
  if (s.type === 'reflect') {
    const ta = h('textarea', { class: 'field', rows: 5, placeholder: 'In your own words. Nobody marks this: writing it down is how it sticks.', spellcheck: 'true' });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Save my answer');
    save.addEventListener('click', async () => {
      try {
        const r = await call('exercises.reflect', { id: t.exId, step: i, text: ta.value });
        t.data.progress = r.progress;
        draw(t);
        dialog({ title: 'One way to put it', width: '46em', body: h('div', {}, md(r.answer), h('p', { class: 'muted small' }, 'Yours doesn\'t have to match: if it covers the same idea, you\'ve got it.')) });
        refreshExercises();
      } catch (err) { toast(err.message, 'error'); }
    });
    box.append(ta, h('div', { class: 'row' }, save));
    return box;
  }
  if (s.type === 'flag') {
    const input = h('input', { class: 'field', type: 'text', placeholder: 'FLAG{...}', spellcheck: 'false', 'aria-label': 'Flag' });
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Submit');
    const submit = async () => {
      const r = await call('exercises.flag', { id: t.exId, flag: input.value });
      if (r.ok) { t.data.progress = r.progress; draw(t); toast('That\'s the flag.', 'ok'); refreshExercises(); } else toast('Not that one. The program prints the flag when you get in.', 'info', 5000);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    box.append(h('div', { class: 'row' }, input, go),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => runCommand('term.new', dir) }, 'Open a terminal there'),
        h('button', { class: 'btn', type: 'button', onclick: () => runCommand('security.inspect', binary) }, 'Inspect the binary'),
        t.data.exercise.showSource ? h('button', { class: 'btn', type: 'button', onclick: () => openFile(`${dir}/${t.data.exercise.file}.c`) }, 'Read the source') : null));
  } else {
    const check = h('button', { class: 'btn primary', type: 'button', title: 'Compile with your code and run the tests for the steps you\'ve reached (F7)' }, 'Check my code (F7)');
    check.addEventListener('click', () => checkExercise(t.exId));
    box.append(h('div', { class: 'row' }, check));
  }
  if (hints.length) {
    const more = h('button', { class: 'btn small', type: 'button', hidden: shown >= hints.length }, shown ? `Another hint (${shown + 1} of ${hints.length})` : `A hint (1 of ${hints.length})`);
    more.addEventListener('click', () => { t.hintsShown[i] = shown + 1; draw(t); });
    box.append(hintList, more);
  }
  return box;
}

function resultBox(r, ex) {
  const box = h('div', { class: 'ex-result' + (r.allPassed ? ' ok' : '') });
  if (!r.compiled) {
    box.append(h('div', { class: 'ex-result-title' }, 'It doesn\'t compile yet'));
    const errs = (r.problems || []).filter((p) => p.severity === 'error');
    for (const p of errs.slice(0, 3)) {
      box.append(h('div', { class: 'ex-fail' }, h('code', {}, `${p.file ? p.file.split('/').pop() + ':' + p.line : ''} ${p.message}`)), explanationBox(explain(p.message), { compact: true }));
    }
    if (!errs.length) box.append(h('p', {}, 'See the Build panel for what the compiler said.'));
    return box;
  }
  if (r.advanced) box.append(h('div', { class: 'ex-result-title' }, r.progress.done ? `All ${ex.steps.length} steps pass.` : `Step ${r.progress.step} passes. Step ${r.progress.step + 1} is open.`));
  for (const s of r.results) {
    const title = ex.steps[s.step] ? ex.steps[s.step].title : '';
    if (s.passed) { box.append(h('div', { class: 'ex-pass' }, `✓ Step ${s.step + 1}: ${title}`)); continue; }
    box.append(h('div', { class: 'ex-fail-head' }, `✗ Step ${s.step + 1}: ${title}`));
    for (const f of s.fails.slice(0, 6)) {
      box.append(h('div', { class: 'ex-fail' }, h('code', {}, f.check), f.detail ? h('span', {}, `: ${f.detail}`) : null));
      const rule = explain(f.detail) || explain(f.check);
      if (rule && /crash|Sanitizer|overflow|free|leak|runtime|SEGV|endless/i.test(f.check + f.detail)) box.append(explanationBox(rule, { compact: true }));
    }
  }
  const rt = (r.problems || []).filter((p) => p.runtime);
  if (rt.length) box.append(h('p', { class: 'muted small' }, `Problems has the line${rt.length > 1 ? 's' : ''} it happened on (the red line in your file).`));
  return box;
}

export async function checkExercise(id) {
  const t = tabs.get('exercise:' + id);
  // save your file first
  for (const x of tabs.list) if (x.file && x.dirty && exerciseForFile(x.file)?.id === id) await x.save();
  startRun('Checking the exercise');
  let r;
  try { r = await call('exercises.check', { id }); }
  catch (err) { finishRun({ code: 1, problems: [] }, '', 'Check failed'); return toast(err.message, 'error', 8000); }
  if (r.reflect) { toast('This step is a question: answer it on the right.', 'info'); return; }
  r.allPassed = r.compiled && r.results.length && r.results.every((x) => x.passed);
  finishRun({ code: r.allPassed ? 0 : 1, problems: r.problems }, r.advanced ? 'Step passed' : 'All checks pass', r.compiled ? 'Not yet: see the exercise' : 'Doesn\'t compile yet');
  if (!r.compiled || r.problems.some((p) => p.runtime)) panel.show('problems'); else if (r.allPassed) panel.hide();
  for (const s of r.results) for (const f of s.fails) { const rule = explain(f.detail); if (rule) remember(rule, f.detail); }
  if (t) {
    t.data.progress = r.progress;
    draw(t, r);
    tabs.focus(t.id);
    const res = t.page.querySelector('.ex-result');
    if (res) res.scrollIntoView({ block: 'nearest' });
  }
  refreshExercises();
  call('state.set', { key: 'where.exercise', value: { id, title: (items.find((x) => x.id === id) || {}).title, step: r.progress.step, at: Date.now() } });
  return r;
}

async function showSolution(t) {
  const ok = await dialog({ title: 'The solution', width: '40em', body: h('div', {}, h('p', {}, 'Looking is allowed. It sticks better if you try once more first, or take the next hint.'), h('p', { class: 'muted small' }, 'It opens in a separate tab; your file stays as it is.')),
    buttons: [{ label: 'Not yet', value: false }, { label: 'Show me', value: true, primary: true }] });
  if (!ok) return;
  const r = await call('exercises.solution', { id: t.exId, step: t.data.progress.step });
  tabs.open({ id: 'solution:' + t.exId, kind: 'solution', title: `Solution: ${t.data.exercise.title}`, side: 'right',
    render(el) { const pre = h('pre', { class: 'page solution mono' }, r.text); el.append(pre); } });
}

async function resetExercise(t) {
  if (!(await confirm('Start over', `Put ${t.data.exercise.file} back to how it started, and your progress on this exercise back to step 1? Your current file is kept as a .bak next to it.`, 'Start over'))) return;
  const r = await call('exercises.reset', { id: t.exId });
  const ft = tabs.get('file:' + t.data.file);
  if (ft) await tabs.close(ft.id, true);
  await openExercise(t.exId);
  if (r.backup) toast(`Your old version: ${r.backup.split('/').pop()}`, 'ok');
}

async function nextExercise(id) {
  const i = items.findIndex((x) => x.id === id);
  const next = items.slice(i + 1).find((x) => !x.done) || items.find((x) => !x.done);
  if (next) openExercise(next.id); else toast('That was the last one. Every exercise is done.', 'ok');
}

export function initExercises() {
  sidebar.add({
    id: 'learn', title: 'Learn: exercises', short: 'Learn', cmd: 'learn.show',
    render(el) {
      el.append(h('div', { class: 'side-title' }, h('span', {}, 'Exercises'), h('span', { class: 'side-tools' },
        h('button', { type: 'button', title: 'Progress map', onclick: () => runCommand('learn.progress') }, '▦'),
        h('button', { type: 'button', title: 'Refresh', onclick: () => refreshExercises() }, '↻'))),
      listEl = h('div', { class: 'ex-list' }));
      refreshExercises();
    },
  });
  on('exercises.changed', () => { if (listEl) refreshExercises(); });
  window.addEventListener('cpw-tracks-changed', () => { if (listEl) render(); });
  call('exercises.list').then((l) => { items = l; }).catch(() => {});
  command('learn.show', 'Exercises', [], () => sidebar.show('learn'));
  command('learn.today', 'Today\'s exercise', [], () => openToday());
  command('exercise.open', 'Open an exercise', [], (id) => openExercise(id), { needsArgs: true });
  command('exercise.check', 'Check my exercise', [], () => { const id = currentExercise(); return id ? checkExercise(id) : toast('Open an exercise first (Learn)'); });
  command('exercise.next', 'Next exercise', [], () => { const id = currentExercise(); return nextExercise(id); });
}
