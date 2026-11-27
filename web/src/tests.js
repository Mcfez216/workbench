// Tests: everything in the sidebar that tells you whether your code works.
//   Projects  P01-P05: open your stub, test it (how many test cases pass
//             yet), read the note, peek at the solution when stuck.
//   CTest     the vault's suite (library + solutions, 60 tests): run all
//             (F7), run one, click a name to jump to its TEST_CASE.
//   Programs  the examples and the rest: run or debug any of them.

import { call, on } from './rpc.js';
import { h, clear, toast, confirm, debounce, pathText } from './ui.js';
import { sidebar, tabs, command, runCommand, panel, status } from './layout.js';
import { activeEditor, openFile, goTo, testCaseAt, rustTestAt } from './editor.js';
import { startRun, finishRun, runTarget } from './build.js';
import { openGuide, guideNotes } from './guides.js';

let el = null;
let root = null;
let tests = [];                  // from ctest --show-only
let results = new Map();         // test name -> {status, seconds}
let projects = [];
let projResults = {};            // id -> {passed, failed, total, at, built}
let programs = [];
let configured = false;
let busy = false;
let vaultNotes = [];             // project notes' names, if the Guides sidebar hasn't loaded them

async function currentRoot() {
  const t = activeEditor();
  const ws = (await import('./files.js')).workspaceRoot();
  for (const start of [t && t.file, ws]) {
    if (!start) continue;
    const r = await call('cmake.root', start === ws ? { dir: start } : { file: start });
    if (r.root) return r;
  }
  return { root: null };
}

export async function refreshTests() {
  const r = await currentRoot();
  root = r.root;
  configured = !!r.configured;
  if (root && configured) {
    const [tl, pl, tg] = await Promise.all([
      call('ctest.list', { root }).catch(() => ({ tests: [] })),
      call('projects.list', { root }).catch(() => ({ projects: [] })),
      call('cmake.targets', { root }).catch(() => ({ targets: [] })),
    ]);
    tests = tl.tests || [];
    projects = pl.projects || [];
    programs = (tg.targets || []).filter((t) => t.type === 'executable' && !['stub', 'solution', 'tests'].includes(t.kind));
    projResults = await call('state.get', { key: `projects.results:${root}`, fallback: {} });
    if (projects.length && !guideNotes().length && !vaultNotes.length) vaultNotes = await call('guides.list').then((r) => r.notes, () => []);
  } else { tests = []; projects = []; programs = []; }
  render();
}
const refreshSoon = debounce(() => { if (el && !busy) refreshTests(); }, 400);

function icon(st) { return st === 'passed' ? '✓' : st === 'failed' ? '✗' : st === 'running' ? '…' : st === 'notrun' ? '?' : '·'; }

function render() {
  if (!el) return;
  clear(el);
  const head = h('div', { class: 'side-title' }, h('span', {}, 'Tests'), h('span', { class: 'side-tools' },
    h('button', { type: 'button', title: 'Run all tests (F7)', onclick: () => runCommand('test.all') }, '▶'),
    h('button', { type: 'button', title: 'Refresh', onclick: () => refreshTests() }, '↻')));
  el.append(head);
  if (!root) {
    el.append(h('div', { class: 'pad' },
      h('p', { class: 'muted' }, 'No CMake project here yet. Open a file inside your copy of the vault\'s code (for example ~/cpp-path), or copy it out first.'),
      h('button', { class: 'btn', type: 'button', onclick: () => runCommand('vault.copyCode') }, 'Copy the vault\'s code to my workspace...')));
    return;
  }
  el.append(h('div', { class: 'pad muted small', title: root }, pathText(root)));
  if (!configured) {
    el.append(h('div', { class: 'pad' }, h('p', { class: 'muted' }, 'Not configured yet. Configure once (it fetches Catch2, the test framework), then build.'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { await runCommand('build.configure'); refreshTests(); } }, 'Configure (Alt+F9)')));
    return;
  }

  // ---- projects
  if (projects.length) {
    el.append(h('div', { class: 'tree-group' }, 'Projects (your stubs)'));
    const notes = guideNotes().length ? guideNotes() : vaultNotes;
    for (const p of projects) {
      const res = projResults[p.id];
      const badge = res ? (res.built === false ? 'build ✗' : res.summary ? `${res.summary.passed}/${res.summary.total}` : '?') : '';
      const done = res && res.summary && res.summary.failed === 0 && res.summary.total > 0;
      const note = notes.find((n) => n.name.toUpperCase().startsWith(p.label.split(' ')[0].toUpperCase() + ' '));
      const row = h('div', { class: 'test-proj' + (done ? ' done' : '') },
        h('button', { type: 'button', class: 'tree-row grow', title: `Open ${p.stubFiles.map((f) => f.split('/').pop()).join(', ')}`, onclick: () => p.stubFiles.forEach((f, i) => openFile(f).then((t) => { if (i === 0 && t) tabs.focus(t.id); })) },
          h('span', { class: 'name' }, note ? note.name : p.label)),
        h('span', { class: 'test-badge' + (done ? ' ok' : res && res.summary ? ' part' : '') , title: res && res.summary ? `${res.summary.passed} of ${res.summary.total} test cases pass` : 'Not tested yet' }, badge),
        h('span', { class: 'row-tools' },
          h('button', { type: 'button', title: 'Build the stub and run its tests', onclick: () => testProject(p) }, '▶'),
          note ? h('button', { type: 'button', title: 'Read the project note', onclick: () => openGuide(note.name) }, '?') : null,
          p.solutionFiles && p.solutionFiles.length ? h('button', { type: 'button', title: 'Peek at the reference solution', onclick: () => peek(p) }, '☼') : null));
      el.append(row);
    }
  }

  // ---- ctest
  const passed = tests.filter((t) => results.get(t.name)?.status === 'passed').length;
  const failed = tests.filter((t) => results.get(t.name)?.status === 'failed').length;
  el.append(h('div', { class: 'tree-group' }, `CTest: ${tests.length} test${tests.length === 1 ? '' : 's'}${passed + failed ? ` · ${passed} ✓ · ${failed} ✗` : ''}`));
  if (!tests.length) el.append(h('p', { class: 'pad muted small' }, 'No tests listed. Build first (F9): Catch2 lists its tests after the build.'));
  if (tests.some((t) => t.notBuilt)) el.append(h('p', { class: 'pad muted small' }, 'Some test programs aren\'t built yet: F9.'));
  const groups = new Map();
  for (const t of tests) groups.set(t.target || 'other', (groups.get(t.target || 'other') || []).concat(t));
  for (const [target, list] of groups) {
    const ok = list.filter((t) => results.get(t.name)?.status === 'passed').length;
    const bad = list.filter((t) => results.get(t.name)?.status === 'failed').length;
    const body = h('div', { class: 'test-list' });
    const det = h('details', { class: 'test-group', open: bad > 0 || groups.size === 1 },
      h('summary', {}, h('span', { class: bad ? 'sev-error' : ok === list.length ? 'sev-ok' : '' }, `${target} `), h('span', { class: 'muted small' }, `${list.length}${ok + bad ? ` · ${ok}✓ ${bad ? bad + '✗' : ''}` : ''}`)), body);
    for (const t of list) {
      const r = results.get(t.name);
      const st = r ? r.status : '';
      body.append(h('div', { class: 'test-row st-' + (st || 'none') },
        h('span', { class: 'test-icon', 'aria-label': st || 'not run' }, icon(st)),
        h('button', { type: 'button', class: 'tree-row grow', title: `${t.name}${r ? ` (${r.detail}, ${r.seconds}s)` : ''}\nClick: go to the TEST_CASE`, onclick: () => locate(t) }, h('span', { class: 'name' }, t.name)),
        h('span', { class: 'row-tools' }, h('button', { type: 'button', title: 'Run just this test', onclick: () => runSome([t.index], t.name) }, '▶'))));
    }
    el.append(det);
  }

  // ---- programs
  if (programs.length) {
    el.append(h('div', { class: 'tree-group' }, 'Programs'));
    for (const t of programs) {
      el.append(h('div', { class: 'test-row' },
        h('button', { type: 'button', class: 'tree-row grow', title: `${t.dirRel}: ${t.sources.map((s) => s.split('/').pop()).join(', ')}`, onclick: () => t.sources[0] && openFile(t.sources[0]) }, h('span', { class: 'name' }, t.name)),
        h('span', { class: 'row-tools' },
          h('button', { type: 'button', title: 'Build and run', onclick: () => runTarget(t.name, root) }, '▶'),
          h('button', { type: 'button', title: 'Debug in gdb (stops at main)', onclick: () => runTarget(t.name, root, true) }, 'gdb'))));
    }
  }
}

async function locate(t) {
  const loc = await call('ctest.locate', { root, name: t.name, target: t.target });
  if (!loc) return toast(`Couldn't find TEST_CASE("${t.name}")`);
  const tab = await openFile(loc.file);
  if (tab) goTo(tab.view, loc.line, 1);
}

async function peek(p) {
  if (!(await confirm('Peek at the solution?', `Try the hints in the note first: working it out is the point. Open ${p.solutionFiles.map((f) => f.split('/').pop()).join(', ')} from solutions/ anyway?`, 'Show me', 'Keep trying'))) return;
  for (const f of p.solutionFiles) await openFile(f);
}

async function testProject(p, testName) {
  if (tabs.list.some((t) => t.dirty && t.file)) await runCommand('file.saveAll');
  startRun(`${p.label}: building the stub`);
  busy = true;
  let r;
  try { r = await call('projects.run', { root, id: p.id, testName }); } finally { busy = false; }
  const s = r.summary;
  finishRun({ ...r, code: r.built === false ? r.code : 0 }, s ? `${p.label}: ${s.passed}/${s.total} test cases pass` : `${p.label}: ran`, `${p.label}: the stub doesn't build`);
  if (r.built && r.problems.length) panel.show('problems');
  if (!testName) {
    projResults[p.id] = { built: r.built !== false, summary: s, at: Date.now() };
    await call('state.set', { key: `projects.results:${root}`, value: projResults });
    if (s && s.failed === 0 && s.total) toast(`${p.label}: every test passes. Tick it off in the ${p.kind === 'cargo' ? 'Rust' : 'CPP'} Done Log!`, 'ok', 8000);
  }
  render();
  return r;
}

async function runSome(indexes, label) {
  if (tabs.list.some((t) => t.dirty && t.file)) await runCommand('file.saveAll');
  for (const t of tests) if (!indexes || indexes.includes(t.index)) results.set(t.name, { status: 'running' });
  render();
  startRun(label ? `Test: ${label}` : 'Running all tests');
  busy = true;
  let r;
  try { r = await call('ctest.run', { root, indexes }); } finally { busy = false; }
  for (const t of tests) if ((!indexes || indexes.includes(t.index)) && results.get(t.name)?.status === 'running') results.delete(t.name);
  const sum = r.summary;
  finishRun(r, sum ? `${sum.percent}% tests passed (${sum.total - sum.failed}/${sum.total})` : 'Tests done', sum ? `${sum.failed} of ${sum.total} tests failed` : 'Tests failed');
  await refreshTests();
  return r;
}

async function runAll() {
  sidebar.show('tests');
  const r = await currentRoot();
  if (!r.root) return toast('Open a file in a CMake project first', 'error');
  if (r.root !== root || !tests.length) await refreshTests();
  return runSome(null);
}

async function runHere() {
  const t = activeEditor();
  if (!t) return toast('Open a test file and put the cursor in a TEST_CASE');
  const rust = /\.rs$/i.test(t.file || '');
  const name = rust ? rustTestAt(t.view) : testCaseAt(t.view);
  if (!name) return toast(rust ? 'No #[test] function above the cursor' : 'No TEST_CASE above the cursor');
  await refreshTests();
  // a project's own tests run against your stub, not the solution
  const p = projects.find((x) => (x.tests || []).includes(t.file) || (x.stubFiles || []).includes(t.file));
  if (p) return testProject(p, name);
  const named = (x) => x.name === name || (rust && x.name.endsWith(`::${name}`));
  let test = tests.find(named);
  if (!test || test.notBuilt) {
    if (tabs.list.some((x) => x.dirty && x.file)) await runCommand('file.saveAll');
    startRun('Building');
    const b = await call('build.build', { file: t.file });
    if (!finishRun(b)) return;
    await refreshTests();
    test = tests.find(named);
  }
  if (!test && rust) return toast(`"${name}" isn't in this project's tests (cargo test lists them after a build)`, 'error', 7000);
  if (!test) return toast(`"${name}" isn't a ctest test (is the file's target registered with catch_discover_tests?)`, 'error', 7000);
  return runSome([test.index], name);
}

export function initTests() {
  sidebar.add({
    id: 'tests', title: 'Tests, projects and programs', short: 'Tests',
    render(e) { el = e; el.classList.add('tests-view'); refreshTests(); },
    onShow() { refreshTests(); },
  });
  on('ctest.result', (d) => {
    if (d.root !== root) return;
    results.set(d.name, { status: d.status, detail: d.detail, seconds: d.seconds });
    const row = el && [...el.querySelectorAll('.test-row .name')].find((n) => n.textContent === d.name);
    if (row) {
      const r = row.closest('.test-row');
      r.className = 'test-row st-' + d.status;
      r.querySelector('.test-icon').textContent = icon(d.status);
    }
    status.set('build', `Testing: ${[...results.values()].filter((x) => x.status === 'passed').length} passed, ${[...results.values()].filter((x) => x.status === 'failed').length} failed`, { order: 30 });
  });
  on('cmake.changed', (d) => { if (!busy && (!root || d.root === root)) refreshSoon(); });
  // F7 in an exercise checks the exercise; anywhere else, ctest
  command('test.all', 'Run all tests (ctest), or check the exercise', ['F7'], async () => {
    const { currentExercise, checkExercise } = await import('./exercises.js');
    const id = currentExercise();
    return id ? checkExercise(id) : runAll();
  });
  command('test.here', 'Run the test under the cursor', ['Shift+F7'], runHere);
  command('test.show', 'Tests, projects and programs', [], () => sidebar.show('tests'));
  command('test.project', 'Test a project stub...', [], async () => {
    await refreshTests();
    if (!projects.length) return toast('No projects found. Configure and build first.', 'error');
    sidebar.show('tests');
    const t = activeEditor();
    const p = (t && projects.find((x) => (x.tests || []).concat(x.stubFiles || []).includes(t.file))) || null;
    if (p) testProject(p); else toast('Click ▶ next to the project in the Tests sidebar');
  });
}
