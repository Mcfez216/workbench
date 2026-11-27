// "Build a real thing": the track page. A real program, a milestone at a
// time, in C, C++ or Rust. Your project opens on the left (a real
// CMakeLists.txt or Cargo.toml: F9, Ctrl+F9 and the debugger work on it),
// the milestones on the right. F7 runs the milestone's tests: your program,
// run the way a person would, with what it printed against what it should.
// When every milestone passes, "Install it" puts it on your PATH.

import { call } from './rpc.js';
import { h, clear, toast, confirm } from './ui.js';
import { tabs, command, runCommand } from './layout.js';
import { openFile, activeEditor } from './editor.js';
import { renderMarkdown, renderInline } from './markdown.js';
import { explain, explanationBox } from './explain.js';
import { startRun, finishRun } from './build.js';
import { language } from './lang.js';

const LANG_NAME = { c: 'C', cpp: 'C++', rust: 'Rust' };
let list = [];

export async function refreshTracks() { list = await call('tracks.list').catch(() => []); return list; }

// The rows for the Learn sidebar
export function trackRows() {
  const box = h('div', {});
  box.append(h('div', { class: 'tree-group' }, 'Build a real thing'));
  if (!list.length) refreshTracks().then(() => box.replaceWith(trackRows()));
  for (const t of list) {
    const done = Object.entries(t.langs).filter(([, s]) => s.reached >= t.milestones).map(([l]) => LANG_NAME[l]);
    const going = Object.entries(t.langs).filter(([, s]) => s.started && s.reached < t.milestones).map(([l, s]) => `${LANG_NAME[l]} ${s.reached}/${t.milestones}`);
    const meta = done.length ? `✓ ${done.join(', ')}` : going.length ? going.join(' · ') : `${t.milestones} steps`;
    const b = h('button', { type: 'button', class: 'tree-row ex-row' + (done.length ? ' done' : ''), title: t.blurb },
      h('span', { class: 'ex-status', 'aria-hidden': 'true' }, done.length ? '✓' : going.length ? '◐' : '○'),
      h('span', { class: 'name' }, t.name), h('span', { class: 'ex-meta' }, meta));
    b.addEventListener('click', () => openTrack(t.id));
    box.append(b);
  }
  return box;
}

// Is a track in front: its page, or a file in one of its projects?
export function currentTrack() {
  const t = tabs.active();
  if (t && t.kind === 'track' && t.data) return { id: t.trackId, lang: t.lang };
  const e = activeEditor();
  if (e && e.file) {
    const m = e.file.match(/[\\/]mhde-builds[\\/]([a-z]+)-(c|cpp|rust)[\\/]/);
    if (m && list.some((x) => x.id === m[1])) return { id: m[1], lang: m[2] };
  }
  return null;
}

function md(text) { const d = h('div', { class: 'md' }); d.innerHTML = renderMarkdown(text || '').html; return d; }

export async function openTrack(id, lang) {
  if (!list.length) await refreshTracks();
  const saved = await call('state.get', { key: `track.lang:${id}`, fallback: null });
  const pick = lang || saved || (['c', 'cpp', 'rust'].includes(language()) ? language() : 'cpp');
  const tid = 'track:' + id;
  let t = tabs.get(tid);
  if (!t) {
    t = tabs.open({
      id: tid, kind: 'track', title: id, side: 'right', session: { kind: 'track', track: id },
      render(el) { this.trackId = id; this.page = h('div', { class: 'page exercise track' }); el.append(this.page); this.hints = {}; },
    });
  } else tabs.focus(tid);
  await load(t, pick);
  return t;
}

async function load(t, lang) {
  t.lang = lang;
  call('state.set', { key: `track.lang:${t.trackId}`, value: lang });
  t.data = await call('tracks.get', { id: t.trackId, lang });
  t.result = null;
  draw(t);
}

async function start(t) {
  const o = await call('tracks.open', { id: t.trackId, lang: t.lang });
  const ft = await openFile(o.main, { side: 'left' });
  if (ft && ft.side === 'right') tabs.move(ft.id, 'left');
  t.data = await call('tracks.get', { id: t.trackId, lang: t.lang });
  draw(t);
  refreshTracks();
}

export async function checkTrack(cur) {
  const t = tabs.get('track:' + cur.id) || await openTrack(cur.id, cur.lang);
  if (t.lang !== cur.lang) await load(t, cur.lang);
  if (!t.data.started) return toast('Start the project first: the button on the track page', 'error');
  if (tabs.list.some((x) => x.dirty && x.file)) await runCommand('file.saveAll');
  startRun(`${t.data.name}: building and testing milestone ${Math.min(t.data.reached + 1, t.data.milestones.length)}`);
  let r;
  try { r = await call('tracks.check', { id: t.trackId, lang: t.lang }); } catch (e) { finishRun({ code: 1, problems: [] }, '', e.message); throw e; }
  if (!r.compiled) finishRun({ code: 1, problems: r.problems }, '', `${t.data.name}: it doesn't compile yet`);
  else finishRun({ code: 0, problems: r.problems }, r.passed ? `${t.data.name}: milestone ${r.milestone + 1} passes` : `${t.data.name}: ${r.results.filter((x) => !x.fails.length).length}/${r.results.length} tests pass`);
  t.result = r;
  t.data = await call('tracks.get', { id: t.trackId, lang: t.lang });
  draw(t);
  refreshTracks().then(() => window.dispatchEvent(new CustomEvent('cpw-tracks-changed')));
  if (r.passed) toast(r.finished ? `${t.data.name} is finished! "Install it" puts it on your PATH.` : `Milestone ${r.milestone + 1} passes. On to the next!`, 'ok', 7000);
  return r;
}

async function install(t) {
  startRun(`${t.data.name}: an optimised build`);
  const r = await call('tracks.install', { id: t.trackId, lang: t.lang });
  finishRun({ code: r.ok ? 0 : 1, problems: r.problems || [] }, r.ok ? `Installed ${r.name}` : '', 'The optimised build failed');
  if (!r.ok) return;
  t.installed = r;
  t.data = await call('tracks.get', { id: t.trackId, lang: t.lang });
  draw(t);
}

async function peek(t) {
  if (!(await confirm('Peek at a finished version?', 'Working it out yourself is the point, and the hints come one at a time. Open a finished version anyway? It opens as its own file; yours isn\'t touched.', 'Show me', 'Keep trying'))) return;
  const s = await call('tracks.solution', { id: t.trackId, lang: t.lang });
  const tab = tabs.open({ id: `track-solution:${t.trackId}:${t.lang}`, kind: 'doc', title: `${t.data.name}: ${s.name}`, side: 'left',
    render(el) { el.append(h('pre', { class: 'output solution-view' }, s.text)); } });
  tabs.focus(tab.id);
}

function resultBox(r) {
  const box = h('div', { class: 'ex-result' + (r.passed ? ' ok' : '') });
  if (!r.compiled) {
    box.append(h('div', { class: 'ex-result-head' }, 'It doesn\'t compile yet'));
    for (const p of (r.problems || []).filter((x) => x.severity === 'error').slice(0, 5)) {
      box.append(h('div', { class: 'ex-fail' }, h('code', {}, `${p.file ? p.file.split('/').pop() + ':' + p.line : ''} ${p.message}`)), explanationBox(explain(p.message), { compact: true }));
    }
    return box;
  }
  const ok = r.results.filter((x) => !x.fails.length).length;
  box.append(h('div', { class: 'ex-result-head' }, r.passed ? `Milestone ${r.milestone + 1}: every test passes` : `Milestone ${r.milestone + 1}: ${ok} of ${r.results.length} tests pass`));
  for (const x of r.results) {
    const item = h('div', { class: 'tr-test' + (x.fails.length ? ' bad' : '') }, h('span', { class: 'ex-mark' }, x.fails.length ? '✗' : '✓'), ' ', x.name);
    box.append(item);
    for (const f of x.fails) {
      const d = h('div', { class: 'tr-fail' }, h('div', {}, h('code', {}, `$ ${f.cmd}`)), h('div', {}, f.what));
      if (f.got != null) d.append(h('div', { class: 'tr-cols' }, h('div', {}, h('div', { class: 'muted small' }, 'Got'), h('pre', {}, f.got || '(nothing)')),
        f.want != null ? h('div', {}, h('div', { class: 'muted small' }, 'Expected'), h('pre', {}, f.want || '(nothing)')) : null));
      if (f.stderr) d.append(h('details', {}, h('summary', { class: 'small' }, 'What it printed on standard error'), h('pre', {}, f.stderr)));
      const rule = explain(f.what + ' ' + (f.stderr || ''));
      if (rule && /crash|Sanitizer|overflow|free|leak|runtime|SEGV|panicked/i.test(f.what + (f.stderr || ''))) d.append(explanationBox(rule, { compact: true }));
      box.append(d);
    }
  }
  return box;
}

function draw(t) {
  const d = t.data;
  const page = t.page;
  const top = page.scrollTop;
  clear(page);
  const choice = h('div', { class: 'lang-switch track-lang', role: 'group', 'aria-label': 'Language' },
    ['c', 'cpp', 'rust'].map((l) => h('button', { type: 'button', class: 'choice', 'aria-pressed': l === t.lang ? 'true' : 'false', title: `Build it in ${LANG_NAME[l]}`, onclick: () => load(t, l) }, LANG_NAME[l])));
  page.append(h('div', { class: 'ex-head' },
    h('div', { class: 'ex-tags' }, h('span', { class: 'tag' }, 'Build a real thing'), ...d.skills.map((s) => h('span', { class: 'tag' }, s))),
    h('h1', {}, d.title), md(d.blurb), choice));
  if (!d.started) {
    page.append(h('div', { class: 'ex-step current' },
      h('p', {}, `A ${LANG_NAME[t.lang]} project in ${d.dir}: ${t.lang === 'rust' ? 'Cargo.toml and src/main.rs' : `CMakeLists.txt and src/main.${t.lang === 'c' ? 'c' : 'cpp'}`}. Nothing you already have is replaced.`),
      h('button', { class: 'btn primary', type: 'button', onclick: () => start(t) }, `Start in ${LANG_NAME[t.lang]}`)));
    page.scrollTop = top;
    return;
  }
  const cur = Math.min(d.reached, d.milestones.length);
  page.append(h('p', { class: 'muted small' }, cur >= d.milestones.length ? 'Every milestone passes.' : `Milestone ${cur + 1} of ${d.milestones.length}. F7 runs its tests. The program is \`${d.name}\`: try it in the terminal too.`,
    ' ', h('button', { type: 'button', class: 'link small', onclick: () => openFile(d.main, { side: 'left' }) }, 'Open my code')));
  const ol = h('ol', { class: 'ex-steps' });
  d.milestones.forEach((m, i) => {
    const state = i < cur ? 'done' : i === cur ? 'current' : 'locked';
    const li = h('li', { class: `ex-step ${state}` });
    const head = h('div', { class: 'ex-step-head' }, h('span', { class: 'ex-mark', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'current' ? '►' : '·'), h('span', {}, `${i + 1}. ${m.title}`),
      state === 'locked' ? h('span', { class: 'muted small' }, ' (opens when the one before passes)') : null);
    li.append(head);
    if (state !== 'locked') {
      const body = h('div', { class: 'ex-step-body' }, md(m.brief));
      const tests = h('details', { class: 'tr-tests' }, h('summary', { class: 'small' }, `The tests (${m.tests.length})`),
        h('ul', {}, m.tests.map((x) => h('li', {}, x.name, h('ul', {}, x.commands.map((c) => h('li', {}, h('code', {}, c))))))));
      body.append(tests);
      if (state === 'current') {
        const shown = t.hints[i] || 0;
        const hints = h('ol', { class: 'ex-hints' }, m.hints.slice(0, shown).map((x) => { const e = h('li', {}); e.innerHTML = renderInline(x); return e; }));
        body.append(hints, h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => checkTrack({ id: t.trackId, lang: t.lang }) }, 'Check it (F7)'),
          shown < m.hints.length ? h('button', { class: 'btn', type: 'button', onclick: () => { t.hints[i] = shown + 1; draw(t); } }, shown ? 'Another hint' : 'A hint') : null));
      } else if (i !== cur - 1) body.hidden = true;
      head.addEventListener('click', () => { if (state === 'done') body.hidden = !body.hidden; });
      li.append(body);
    }
    ol.append(li);
  });
  page.append(ol);
  if (t.result) page.append(resultBox(t.result));
  if (cur >= d.milestones.length) {
    const fin = h('div', { class: 'ex-finished' }, h('p', {}, `${d.name} is finished, in ${LANG_NAME[t.lang]}. Build it optimised and put it on your PATH, so you can run \`${d.name}\` in any terminal:`),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => install(t) }, d.installed ? 'Install it again' : 'Install it'),
        h('button', { class: 'btn', type: 'button', onclick: () => load(t, t.lang === 'c' ? 'cpp' : t.lang === 'cpp' ? 'rust' : 'c') }, `Now build it in ${LANG_NAME[t.lang === 'c' ? 'cpp' : t.lang === 'cpp' ? 'rust' : 'c']}`)));
    if (t.installed || d.installed) {
      const r = t.installed || { path: d.installed, onPath: true };
      fin.append(h('p', { class: 'small' }, `Installed: ${r.path}. `, r.onPath === false ? `That folder (${r.dir}) isn't on your PATH yet: add it, or run it by its full path.` : `Open a new terminal and type ${d.name}.`));
    }
    page.append(fin);
  }
  page.append(h('div', { class: 'ex-footer row' }, d.hasSolution ? h('button', { class: 'btn small', type: 'button', onclick: () => peek(t) }, '☼ Peek at a finished version') : null,
    h('span', { class: 'muted small' }, `Your project: ${d.dir}`)));
  page.scrollTop = top;
}

export function initTracks() {
  refreshTracks();
  command('tracks.show', 'Build a real thing (programs in milestones)', [], async () => { await runCommand('learn.show'); });
}
