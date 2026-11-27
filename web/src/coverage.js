// Coverage (server/coverage.js): which lines ran. In a CMake project, what
// your tests reach (a separate build-coverage/ folder); for a lone file,
// one run of the program. The Coverage panel lists the files, least covered
// first; the editor marks each line (green: ran, with how often; red: never).

import { call, on } from './rpc.js';
import { h, toast, clear, prompt, pathText } from './ui.js';
import { tabs, panel, command, status } from './layout.js';
import { activeEditor, openFile } from './editor.js';
import { showCoverage } from './covdeco.js';
import { startRun, finishRun } from './build.js';

let last = null;
let el = null;

function apply() {
  const byFile = new Map((last ? last.files : []).map((f) => [f.file, f.lines]));
  for (const t of tabs.list) if (t.view && t.file && /\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(t.file)) showCoverage(t.view, byFile.get(t.file) || null);
}

function render() {
  if (!el) return;
  clear(el);
  if (!last) {
    el.append(h('p', { class: 'pad muted' }, 'Coverage shows which lines of your code ran. In a CMake project it runs your tests (F7\'s tests) in a separate build-coverage/ folder: the red lines are what no test reaches. For a single file, it runs the program once. Build → Coverage, or the button:'),
      h('div', { class: 'pad' }, h('button', { class: 'btn', type: 'button', onclick: () => runCoverage() }, 'Run with coverage')));
    return;
  }
  const head = h('div', { class: 'cov-head' },
    h('span', { class: 'cov-total' }, `${last.percent}% of lines ran`), h('span', { class: 'muted small' }, ` (${last.covered} of ${last.total}${last.kind === 'project' ? ', running the tests' : ', one run of the program'})`),
    last.testsFailed ? h('span', { class: 'sev-error small' }, '  Some tests failed: see Problems.') : null,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn small', type: 'button', onclick: () => runCoverage() }, 'Run again'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { last = null; apply(); render(); status.set('coverage', ''); } }, 'Clear'));
  el.append(head);
  const list = h('div', { class: 'cov-list' });
  for (const f of last.files) {
    list.append(h('button', { type: 'button', class: 'list-row cov-row', title: f.file, onclick: () => openFile(f.file).then(apply) },
      h('span', { class: 'cov-bar' }, h('span', { class: 'cov-fill', style: `width:${f.percent}%` })),
      h('span', { class: 'cov-pct' }, `${f.percent}%`), h('span', {}, f.file.split('/').pop()), h('span', { class: 'muted small grow path' }, pathText(f.file.replace(/\/[^/]+$/, ''))),
      h('span', { class: 'muted small' }, `${f.total - f.covered} line${f.total - f.covered === 1 ? '' : 's'} never ran`)));
  }
  if (!last.files.length) list.append(h('p', { class: 'pad muted' }, 'No lines of your own code were measured.'));
  el.append(list);
}

export async function runCoverage() {
  const t = activeEditor();
  if (!t || !/\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(t.file || '')) return toast('Open a .c or .cpp file (in a CMake project, coverage runs its tests)', 'error', 6000);
  if (tabs.list.some((x) => x.dirty && x.file)) { const { runCommand } = await import('./layout.js'); await runCommand('file.saveAll'); }
  const root = await call('cmake.root', { file: t.file });
  let input = '';
  if (!root.root || root.kind === 'cargo') {
    const key = `coverage.input:${t.file}`;
    const prev = await call('state.get', { key, fallback: '' });
    const got = await prompt('Coverage: one run of the program', 'What it reads on standard input (leave empty if nothing)', prev, { hint: 'Remembered for this file. Run it again with different input to reach other lines.' });
    if (got === null) return;
    input = got.replace(/\\n/g, '\n');
    if (input && !input.endsWith('\n')) input += '\n';
    await call('state.set', { key, value: got });
  }
  startRun(root.root ? 'Coverage: building build-coverage/ and running the tests' : 'Coverage: building and running');
  let r;
  try { r = await call('coverage.run', { file: t.file, input }); } catch (e) { finishRun({ code: 1, problems: [] }, '', e.message); return toast(e.message, 'error', 8000); }
  if (!r.ok) return finishRun(r, '', 'Coverage: it doesn\'t build');
  finishRun({ code: 0, problems: r.problems || [] }, `Coverage: ${r.percent}% of lines ran`);
  last = r;
  apply();
  render();
  panel.show('coverage');
  status.set('coverage', `Coverage ${r.percent}%`, { order: 25, side: 'left', title: 'Lines that ran. Click for the Coverage panel.', onclick: () => panel.show('coverage') });
}

export function initCoverage() {
  panel.add({ id: 'coverage', title: 'Coverage', render(e) { el = h('div', { class: 'coverage' }); e.append(el); render(); } });
  window.addEventListener('cpw-editor-opened', () => setTimeout(apply, 0));
  on('coverage.result', () => {});
  command('coverage.run', 'Coverage: which lines ran (tests in a CMake project, one run for a file)', [], runCoverage);
  command('coverage.clear', 'Coverage: clear the marks', [], () => { last = null; apply(); render(); status.set('coverage', ''); });
}
