// Build output and the Problems list; building, running and debugging
// (CMake, or g++ for a lone file); clang-tidy and cppcheck; what the
// sanitizers report while a program runs; the C++ sandbox with its
// assembly view; and the DOS retro track.

import { call, on } from './rpc.js';
import { h, clear, prompt, toast, dialog, debounce, pathText, choices } from './ui.js';
import { panel, tabs, command, runCommand, status, sidebar } from './layout.js';
import { activeEditor, openFile, goTo, setFileDiagnostics, createView, languageFor, registerSandboxView, markRuntime } from './editor.js';
import { language, otherLanguage, langInfo, onLanguageChange } from './lang.js';
import { setDiagnostics } from '@codemirror/lint';
import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect, EditorState } from '@codemirror/state';

let outEl, probEl;
let problems = [];
const sandboxFiles = new Set();   // scratch.cpp and scratch.c, wherever the backend keeps them

function lineClass(line) {
  if (/\berror\b|undefined reference|FAILED|ERROR: \w+Sanitizer|runtime error|\*\*\*Failed/.test(line)) return 'o-err';
  if (/\bwarning\b|CMake Warning/.test(line)) return 'o-warn';
  if (/\bPassed\b|100% tests passed|All tests passed/.test(line)) return 'o-ok';
  return null;
}
function appendOutput(text) {
  if (!outEl) return;
  const atEnd = outEl.scrollTop + outEl.clientHeight >= outEl.scrollHeight - 4;
  for (const line of text.split(/(?<=\n)/)) {
    const cls = lineClass(line);
    outEl.append(cls ? h('span', { class: cls }, line) : document.createTextNode(line));
  }
  if (atEnd) outEl.scrollTop = outEl.scrollHeight;
}

// ------------------------------------------------------------------ problems
const SEV = { error: 'error  ', warning: 'warning', info: 'note   ' };
function renderProblems() {
  if (!probEl) return;
  clear(probEl);
  if (!problems.length) probEl.append(h('li', { class: 'muted', style: { padding: '0 1ch' } }, 'No problems.'));
  problems.forEach((p, i) => {
    const notes = p.notes || [];
    const b = h('button', { type: 'button', title: [p.message, ...notes.map((n) => `  ${n.message}`)].join('\n') },
      h('span', { class: 'sev-' + p.severity }, p.runtime ? 'runtime' : SEV[p.severity] || p.severity),
      h('span', { class: 'loc' }, p.file ? `${p.file.split('/').pop()}:${p.line}${p.col > 1 ? ':' + p.col : ''}` : p.source),
      h('span', { class: 'grow' }, p.message));
    b.addEventListener('click', () => jump(i));
    const li = h('li', {}, b);
    if (notes.length) {
      const sub = h('ul', { class: 'problem-notes', hidden: true }, notes.map((n) => {
        const nb = h('button', { type: 'button' }, h('span', { class: 'sev-info' }, 'note   '),
          h('span', { class: 'loc' }, n.file ? `${n.file.split('/').pop()}:${n.line}` : ''), h('span', { class: 'grow' }, n.message));
        nb.addEventListener('click', async () => { if (!n.file) return; const t = await openFile(n.file); if (t) goTo(t.view, n.line, n.col); });
        return h('li', {}, nb);
      }));
      const more = h('button', { type: 'button', class: 'notes-toggle', title: 'The compiler\'s notes on this one' }, `▸ ${notes.length} note${notes.length > 1 ? 's' : ''}`);
      more.addEventListener('click', () => { sub.hidden = !sub.hidden; more.textContent = `${sub.hidden ? '▸' : '▾'} ${notes.length} note${notes.length > 1 ? 's' : ''}`; });
      b.append(more);
      li.append(sub);
    }
    probEl.append(li);
  });
  const errs = problems.filter((p) => p.severity === 'error').length;
  const warns = problems.filter((p) => p.severity === 'warning').length;
  panel.setBadge('problems', errs + warns ? `${errs}E ${warns}W` : '');
}

let cursor = -1;
async function jump(i) {
  const p = problems[i];
  if (!p || !p.file) return;
  cursor = i;
  if (sandboxFiles.has(p.file)) {
    const t = await runCommand('sandbox.open');
    const sb = tabs.get('sandbox');
    if (sb && sb.view) goTo(sb.view, p.line, p.col);
    return;
  }
  const t = await openFile(p.file);
  if (t) goTo(t.view, p.line, p.col);
}
function nextProblem(dir) {
  const all = problems;
  if (!all.some((p) => p.file && p.severity !== 'info')) return toast('No problems to go to');
  let i = cursor;
  for (let n = 0; n < all.length; n++) {
    i = (i + dir + all.length) % all.length;
    if (all[i].file && all[i].severity !== 'info') return jump(i);
  }
}

function showMarks() {
  const byFile = new Map();
  for (const p of problems) if (p.file) byFile.set(p.file, (byFile.get(p.file) || []).concat(p));
  for (const t of tabs.list) {
    if (!t.file || !t.view) continue;
    const list = byFile.get(t.file) || [];
    setFileDiagnostics(t.file, list.filter((p) => !p.runtime));
    markRuntime(t.view, list.filter((p) => p.runtime).map((p) => ({ line: p.line, message: p.message })));
  }
  const sb = tabs.get('sandbox');
  if (sb && sb.view && sb.langId) {
    const list = [...sandboxFiles].filter((f) => f.endsWith(`.${langInfo(sb.langId).ext}`)).flatMap((f) => byFile.get(f) || []);
    markRuntime(sb.view, list.filter((p) => p.runtime).map((p) => ({ line: p.line, message: p.message })));
  }
}

function startRun(title) {
  if (outEl) clear(outEl);
  problems = [];
  renderProblems();
  showMarks();
  panel.show('build');
  status.set('build', `${title}...`, { order: 30 });
}
function finishRun(r, okText, failText) {
  problems = r.problems || [];
  renderProblems();
  const errs = problems.filter((p) => p.severity === 'error').length;
  const warns = problems.filter((p) => p.severity === 'warning').length;
  const ok = r.code === 0;
  status.set('build', ok ? `${okText || 'Build OK'}${warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}`
    : `${failText || 'Build failed'}${errs ? `: ${errs} error${errs === 1 ? '' : 's'}` : ''}`,
  { order: 30, cls: ok ? 'good' : 'bad', onclick: () => panel.show(problems.length ? 'problems' : 'build') });
  if (!ok && problems.length) panel.show('problems');
  showMarks();
  return ok;
}

// A program that's running reported a sanitizer error: add it, mark the line
on('build.runtime', (d) => {
  const fresh = d.problems.filter((p) => !problems.some((q) => q.runtime && q.file === p.file && q.line === p.line && q.message === p.message));
  if (!fresh.length) return;
  problems = problems.concat(fresh);
  renderProblems();
  showMarks();
  status.set('build', `${fresh[0].message.split(' (')[0]} at ${fresh[0].file.split('/').pop()}:${fresh[0].line}`, { order: 30, cls: 'bad', onclick: () => panel.show('problems') });
  toast(`${fresh[0].message} → ${fresh[0].file.split('/').pop()}:${fresh[0].line} (Problems)`, 'error', 7000);
});

// ------------------------------------------------------------------ building
async function saveAll() { if (tabs.list.some((t) => t.dirty && t.file)) await runCommand('file.saveAll'); }
async function context() {
  const t = activeEditor();
  if (t) return { file: t.file, view: t.view };
  return { dir: (await import('./files.js')).workspaceRoot() };
}

async function build(target) {
  const ctx = await context();
  await saveAll();
  startRun(target ? `Building ${target}` : 'Building');
  const r = await call('build.build', { file: ctx.file, dir: ctx.dir, target });
  const ok = finishRun(r, r.kind === 'configure' ? 'Configured' : 'Build OK', r.kind === 'configure' ? 'CMake configure failed' : 'Build failed');
  return { ok: ok && r.kind !== 'configure', r };
}

async function configure(fresh = false) {
  const ctx = await context();
  startRun(fresh ? 'CMake fresh configure' : 'CMake configure');
  const r = await call('cmake.configure', { file: ctx.file || ctx.dir, fresh });
  finishRun(r, 'Configured', 'CMake configure failed');
}

// Which program to run when the file isn't part of one (a library source,
// a header): pick it once, remembered per project.
async function pickTarget(choices, title = 'Which program?') {
  if (!choices || !choices.length) { toast('No programs in this project yet. Build it first (F9)', 'error'); return null; }
  const groups = { program: 'Programs', example: 'Examples', stub: 'Project stubs (your work)', solution: 'Project solutions', tests: 'Test programs', cp: 'Competitive programming' };
  return dialog({
    title, width: '40em', buttons: [{ label: 'Cancel', value: null }],
    body: h('div', { class: 'pick-list' }, Object.entries(groups).map(([k, label]) => {
      const list = choices.filter((c) => c.kind === k);
      return list.length ? [h('div', { class: 'pane-title' }, label), list.map((c) => h('button', { type: 'button', class: 'list-row pick', 'data-name': c.name }, h('span', { class: 'grow' }, c.name), h('span', { class: 'muted' }, c.dirRel)))] : null;
    })),
    onOpen(box, done) {
      box.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => done(b.dataset.name)));
      const first = box.querySelector('.pick'); if (first) first.focus();
    },
  });
}

async function withTarget(method, extra = {}) {
  const ctx = await context();
  await saveAll();
  const remembered = async (root) => (root ? call('state.get', { key: `run.target:${root}` }) : null);
  startRun(method === 'cmake.debug' ? 'Building for gdb' : extra.tool === 'valgrind' ? 'Building for Valgrind' : 'Build and run');
  let r = await call(method, { file: ctx.file, ...extra });
  if (r.needTarget) {
    let name = await remembered(r.root);
    if (!name || !r.choices.some((c) => c.name === name)) {
      name = await pickTarget(r.choices, `Which program does ${ctx.file ? ctx.file.split('/').pop() : 'this'} belong to?`);
      if (!name) { status.set('build', ''); return null; }
      await call('state.set', { key: `run.target:${r.root}`, value: name });
    }
    r = await call(method, { file: ctx.file, target: name, ...extra });
  }
  finishRun(r, method === 'cmake.debug' ? `gdb: ${r.target || ''}` : `${extra.tool === 'valgrind' ? 'Valgrind' : 'Running'} ${r.target || ''}`.trim());
  if (r.ok) panel.show('terminal');
  return r;
}

async function run(args) {
  if (tabs.active()?.id === 'sandbox') return runSandbox();
  return withTarget('cmake.run', args ? { args } : {});
}
async function valgrind() {
  if (tabs.active()?.id === 'sandbox') return runSandbox('valgrind');
  try { return await withTarget('cmake.run', { tool: 'valgrind' }); }
  catch (err) { status.set('build', ''); toast(err.message, 'error', 9000); return null; }
}
async function runWithArgs() {
  const t = activeEditor();
  const key = `run.args:${t ? t.file : 'workspace'}`;
  const prev = await call('state.get', { key, fallback: '' });
  const args = await prompt('Run with arguments', 'Arguments (and redirections like < input.txt)', prev, { hint: 'Remembered for this file. Runs from the project folder.' });
  if (args === null) return;
  await call('state.set', { key, value: args });
  return withTarget('cmake.run', { args });
}
async function debug() {
  const t = activeEditor();
  const line = t ? t.view.state.doc.lineAt(t.view.state.selection.main.head).number : undefined;
  const r = await withTarget('cmake.debug', { line });
  if (r && r.ok) toast(`gdb stops at ${r.breakpoint.split('/').pop()}. n next · s step in · p x print · bt where · c continue · q quit`, 'ok', 9000);
}
async function buildOne() {
  const ctx = await context();
  const r = await call('cmake.targets', { file: ctx.file || ctx.dir });
  if (!r.root) return toast('Not in a CMake project', 'error');
  const all = r.targets.map((t) => ({ name: t.name, kind: t.type === 'library' ? 'program' : t.kind, dirRel: t.dirRel }));
  const name = await pickTarget(all, 'Build which target?');
  if (name) build(name);
}

// ------------------------------------------------------------------ static analysis
async function analyze(kind) {
  const t = activeEditor();
  if (!t) return toast('Open a C or C++ file first');
  if (t.dirty) await runCommand('file.save');
  const label = kind === 'tidy' ? 'clang-tidy' : 'cppcheck';
  startRun(label);
  const r = await call(kind === 'tidy' ? 'analyze.tidy' : 'analyze.cppcheck', { file: t.file });
  finishRun({ ...r, code: r.problems.some((p) => p.severity === 'error') ? 1 : 0 }, r.clean ? `${label}: clean` : `${label}: ${r.problems.length} finding${r.problems.length === 1 ? '' : 's'}`, `${label}`);
  if (r.problems.length) panel.show('problems');
  else toast(`${label}: nothing to report`, 'ok');
}

// ------------------------------------------------------------------ DOS
async function dosBuild(andRun) {
  const t = activeEditor();
  if (!t || !/\.(cpp|c)$/.test(t.file)) return toast('Open the DOS program (dos/hello.cpp) first');
  if (t.dirty) await runCommand('file.save');
  startRun('owcc (DOS)');
  let r;
  try { r = await call('dos.build', { file: t.file }); }
  catch (err) { status.set('build', ''); return toast(err.message, 'error', 9000); }
  const ok = finishRun(r, `Built ${r.exe.split('/').pop()}`, 'owcc failed');
  if (r.warning) toast(r.warning, 'info', 8000);
  if (ok && andRun) call('dos.run', { exe: r.exe }).then(() => toast('DOSBox-X is opening in its own window'), (e) => toast(e.message, 'error', 9000));
}

// ------------------------------------------------------------------ the sandbox
const SNIPPETS = {
  'Hello, C++': '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name = "Josh";\n    std::cout << "Hello, " << name << "!\\n";\n    return 0;\n}\n',
  'References vs pointers (note 1.02)': '#include <iostream>\n\nvoid bumpRef(int& x) { ++x; }      // can\'t be null, can\'t be reseated\nvoid bumpPtr(int* x) { if (x) ++*x; } // can be null: check it\n\nint main() {\n    int n = 41;\n    bumpRef(n);\n    bumpPtr(&n);\n    bumpPtr(nullptr);\n    std::cout << "n = " << n << \'\\n\';\n    return 0;\n}\n',
  'RAII: a scope timer (note 1.05)': '#include <chrono>\n#include <iostream>\n#include <string>\n\nclass ScopeTimer {\npublic:\n    explicit ScopeTimer(std::string label) : label_(std::move(label)), start_(std::chrono::steady_clock::now()) {}\n    ~ScopeTimer() {   // runs however the scope ends: return, exception, end of block\n        auto us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - start_);\n        std::cout << label_ << ": " << us.count() << " us\\n";\n    }\nprivate:\n    std::string label_;\n    std::chrono::steady_clock::time_point start_;\n};\n\nint main() {\n    ScopeTimer t("whole program");\n    long sum = 0;\n    for (int i = 0; i < 1000000; ++i) sum += i;\n    std::cout << "sum " << sum << \'\\n\';\n    return 0;\n}\n',
  'Move semantics: who owns the buffer (note 2.03)': '#include <iostream>\n#include <string>\n#include <utility>\n#include <vector>\n\nint main() {\n    std::vector<std::string> a{"one", "two", "three"};\n    std::vector<std::string> b = std::move(a);   // steals a\'s buffer, no copies\n    std::cout << "a has " << a.size() << ", b has " << b.size() << \'\\n\';\n    return 0;\n}\n',
  'Smart pointers (note 2.04)': '#include <iostream>\n#include <memory>\n\nstruct Ship {\n    explicit Ship(const char* n) : name(n) { std::cout << name << " launched\\n"; }\n    ~Ship() { std::cout << name << " docked\\n"; }\n    const char* name;\n};\n\nint main() {\n    auto solo = std::make_unique<Ship>("Falcon");      // one owner\n    auto fleet = std::make_shared<Ship>("Home One");   // shared owners\n    auto copy = fleet;\n    std::cout << "owners of Home One: " << fleet.use_count() << \'\\n\';\n    return 0;   // both dock here, in reverse order: no delete anywhere\n}\n',
  'STL: sort, find_if, a lambda (note 3.03)': '#include <algorithm>\n#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{5, 1, 8, 3, 9, 2};\n    std::sort(v.begin(), v.end());\n    auto it = std::find_if(v.begin(), v.end(), [](int x) { return x > 5; });\n    if (it != v.end()) std::cout << "first > 5: " << *it << \'\\n\';\n    for (int x : v) std::cout << x << \' \';\n    std::cout << \'\\n\';\n    return 0;\n}\n',
  'Break it: use after free (ASan)': '#include <iostream>\n\nint main() {\n    int* p = new int(42);\n    delete p;\n    std::cout << *p << \'\\n\';   // the memory is gone\n    return 0;\n}\n',
  'Break it: dangling reference into a vector (ASan)': '#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{1, 2, 3};\n    int& first = v[0];\n    v.push_back(4);             // may move the whole buffer...\n    std::cout << first << \'\\n\';   // ...leaving `first` pointing at the old one\n    return 0;\n}\n',
  'Break it: one past the end (ASan)': '#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v(4);\n    for (std::size_t i = 0; i <= v.size(); ++i)   // <= : one too many\n        v[i] = static_cast<int>(i);\n    std::cout << v[0] << \'\\n\';\n    return 0;\n}\n',
  'Break it: no virtual destructor (ASan)': '#include <iostream>\n#include <memory>\n#include <string>\n\nstruct Shape {\n    ~Shape() {}   // not virtual: deleting a Circle through a Shape* is undefined\n};\nstruct Circle : Shape {\n    std::string name = "a circle with a long enough name to need the heap";\n};\n\nint main() {\n    Shape* s = new Circle;\n    delete s;     // only ~Shape runs; the Circle part leaks or worse\n    std::cout << "done\\n";\n    return 0;\n}\n',
  'Break it: signed overflow (UBSan)': '#include <climits>\n#include <iostream>\n\nint main() {\n    int big = INT_MAX;\n    big += 1;     // undefined: int doesn\'t wrap\n    std::cout << big << \'\\n\';\n    return 0;\n}\n',
  'Break it: a leak (LeakSanitizer)': '#include <iostream>\n\nint main() {\n    int* data = new int[100];\n    data[0] = 1;\n    std::cout << data[0] << \'\\n\';\n    return 0;     // no delete[]: reported when the program ends\n}\n',
};

// C, the same way: the basics, then the classic ways to shoot your own foot.
// Valgrind ("Valgrind" button) catches the uninitialised read ASan can't.
const SNIPPETS_C = {
  'Hello, C': '#include <stdio.h>\n\nint main(void) {\n    const char *name = "Josh";\n    printf("Hello, %s!\\n", name);\n    return 0;\n}\n',
  'Pointers and arrays': '#include <stdio.h>\n\nstatic void bump(int *x) { if (x) ++*x; }   /* a pointer can be NULL: check it */\n\nint main(void) {\n    int a[] = {10, 20, 30};\n    size_t n = sizeof a / sizeof a[0];   /* only works on a real array, not a pointer */\n    int *p = a;                           /* the array decays to a pointer to a[0] */\n    bump(&a[1]);\n    for (size_t i = 0; i < n; ++i) printf("a[%zu] = %d, *(p + %zu) = %d\\n", i, a[i], i, *(p + i));\n    return 0;\n}\n',
  'Structs and malloc': '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\ntypedef struct {\n    char name[32];\n    int score;\n} Player;\n\nint main(void) {\n    size_t n = 3;\n    Player *team = malloc(n * sizeof *team);   /* sizeof *team: right even if the type changes */\n    if (team == NULL) return 1;\n    for (size_t i = 0; i < n; ++i) {\n        snprintf(team[i].name, sizeof team[i].name, "player-%zu", i + 1);\n        team[i].score = (int)(i * 10);\n    }\n    for (size_t i = 0; i < n; ++i) printf("%-10s %3d\\n", team[i].name, team[i].score);\n    free(team);   /* every malloc gets exactly one free */\n    return 0;\n}\n',
  'Strings, safely': '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    char buf[16];\n    const char *src = "a string longer than the buffer";\n    /* snprintf never writes past the end and always terminates */\n    int needed = snprintf(buf, sizeof buf, "%s", src);\n    printf("kept \\"%s\\" (%zu chars), needed %d\\n", buf, strlen(buf), needed);\n    return 0;\n}\n',
  'qsort and function pointers': '#include <stdio.h>\n#include <stdlib.h>\n\nstatic int ascending(const void *a, const void *b) {\n    int x = *(const int *)a, y = *(const int *)b;\n    return (x > y) - (x < y);   /* not x - y: that can overflow */\n}\n\nint main(void) {\n    int v[] = {5, 1, 8, 3, 9, 2};\n    size_t n = sizeof v / sizeof v[0];\n    qsort(v, n, sizeof v[0], ascending);\n    for (size_t i = 0; i < n; ++i) printf("%d ", v[i]);\n    putchar(\'\\n\');\n    return 0;\n}\n',
  'Reading input with scanf': '#include <stdio.h>\n\nint main(void) {\n    int n;\n    long sum = 0;\n    printf("How many numbers? ");\n    if (scanf("%d", &n) != 1 || n < 0) { fprintf(stderr, "not a count\\n"); return 1; }\n    for (int i = 0; i < n; ++i) {\n        int x;\n        if (scanf("%d", &x) != 1) { fprintf(stderr, "number %d is missing\\n", i + 1); return 1; }\n        sum += x;\n    }\n    printf("sum = %ld\\n", sum);\n    return 0;\n}\n',
  'Break it: use after free (ASan)': '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int *p = malloc(sizeof *p);\n    if (p == NULL) return 1;\n    *p = 42;\n    free(p);\n    printf("%d\\n", *p);   /* the memory is gone */\n    return 0;\n}\n',
  'Break it: stack buffer overflow (ASan)': '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    char name[8];\n    strcpy(name, "far too long for eight bytes");   /* no bounds check */\n    printf("%s\\n", name);\n    return 0;\n}\n',
  'Break it: one past the end of malloc (ASan)': '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int n = 4;\n    int *a = malloc(n * sizeof *a);\n    if (a == NULL) return 1;\n    for (int i = 0; i <= n; ++i)   /* <= : one too many */\n        a[i] = i;\n    printf("%d\\n", a[0]);\n    free(a);\n    return 0;\n}\n',
  'Break it: double free (ASan)': '#include <stdlib.h>\n\nint main(void) {\n    char *s = malloc(16);\n    free(s);\n    free(s);   /* set pointers to NULL after free to make this harmless */\n    return 0;\n}\n',
  'Break it: pointer to a dead local (ASan)': '#include <stdio.h>\n\nstatic int *make(void) {\n    int local = 7;\n    return &local;   /* local dies when make() returns */\n}\n\nint main(void) {\n    int *p = make();\n    printf("%d\\n", *p);\n    return 0;\n}\n',
  'Break it: signed overflow (UBSan)': '#include <limits.h>\n#include <stdio.h>\n\nint main(void) {\n    int big = INT_MAX;\n    big += 1;   /* undefined: int doesn\'t wrap */\n    printf("%d\\n", big);\n    return 0;\n}\n',
  'Break it: uninitialised read (Valgrind)': '#include <stdio.h>\n#include <stdlib.h>\n\n/* ASan can\'t see this one: run it with the Valgrind button. */\nint main(void) {\n    int *a = malloc(4 * sizeof *a);\n    if (a == NULL) return 1;\n    a[0] = 1;   /* a[1] is never set */\n    if (a[1] > 0) printf("positive\\n"); else printf("not positive\\n");\n    free(a);\n    return 0;\n}\n',
  'Break it: a leak (LeakSanitizer)': '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int *data = malloc(100 * sizeof *data);\n    if (data == NULL) return 1;\n    data[0] = 1;\n    printf("%d\\n", data[0]);\n    return 0;   /* no free: reported when the program ends */\n}\n',
};
const snippetsFor = (lang) => (lang === 'c' ? SNIPPETS_C : SNIPPETS);
const HELLO = { c: 'Hello, C', cpp: 'Hello, C++' };
const sourceKey = (lang) => (lang === 'c' ? 'sandbox.source.c' : 'sandbox.source');

// asm lines that came from the cursor's source line light up
const setAsmHot = StateEffect.define();
const asmHot = StateField.define({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) if (e.is(setAsmHot)) {
      const ranges = e.value.map((n) => Decoration.line({ class: 'cm-asmHot' }).range(tr.state.doc.line(n).from));
      d = Decoration.set(ranges, true);
    }
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// The sandbox follows the app's C / C++ switch: each language keeps its own
// scratch file, examples, compiler and standard.
function openSandbox(snippetName) {
  // an example from the other language switches the language first
  if (snippetName && !snippetsFor(language())[snippetName] && snippetsFor(otherLanguage())[snippetName]) runCommand('lang.set', otherLanguage());
  const t = tabs.open({
    id: 'sandbox', kind: 'sandbox', title: `${langInfo().label} sandbox`, session: { kind: 'sandbox' },
    render(el) {
      const sel = (opts, value, title) => h('select', { class: 'field', title }, opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
      this.pick = h('select', { class: 'field', title: 'Load an example' });
      this.compiler = h('select', { class: 'field', title: 'Compiler' });
      this.std = h('select', { class: 'field', title: 'Language standard' });
      this.opt = sel(['-O0', '-O1', '-O2', '-O3', '-Os'].map((o) => [o, o]), '-O1', 'Optimisation for the assembly view');
      const runBtn = h('button', { class: 'btn primary', type: 'button', title: 'Compile with the sanitizers on and run (Ctrl+F9)' }, 'Compile & run');
      const vgBtn = h('button', { class: 'btn', type: 'button', title: 'Compile without the sanitizers and run under Valgrind: leaks, uninitialised reads, bad frees' }, 'Valgrind');
      const asmBtn = h('button', { class: 'btn', type: 'button', title: 'What the compiler made of it (Ctrl+Shift+A)', 'aria-pressed': 'false' }, 'Assembly');
      this.asmBtn = asmBtn;
      this.fileLabel = h('span', { class: 'sb-file' });
      this.langSwitch = langSwitch();
      el.append(h('div', { class: 'toolbar' }, this.fileLabel, this.langSwitch, this.pick, this.compiler, this.std, runBtn, vgBtn, asmBtn, this.opt,
        h('span', { class: 'muted small grow flags', title: 'Compiled with these flags (Settings → Sandbox flags)' }, '-Wall -Wextra -g -fsanitize=address,undefined')));
      this.host = h('div', { class: 'editor-host' });
      this.asmHost = h('div', { class: 'editor-host asm-host', hidden: true });
      this.asmLine = h('span', { class: 'asm-line' });
      this.asmInfo = h('div', { class: 'asm-info muted small' });
      this.asmFlags = h('span', {});
      this.asmInfo.append(this.asmFlags, ' · ', this.asmLine);
      this.asmPane = h('div', { class: 'asm-pane', hidden: true }, this.asmInfo, this.asmHost);
      el.append(h('div', { class: 'split' }, this.host, this.asmPane));

      const saveOpts = () => call('state.set', { key: 'sandbox.opts', value: { ...this.opts, asm: !!this.asmOn } });
      // (re)build the editor for a language: its own source, examples, compilers
      this.useLang = async (lang, snippet) => {
        if (this.view && this.langId) await call('state.set', { key: sourceKey(this.langId), value: this.view.state.doc.toString() });
        this.langId = lang;
        const info = langInfo(lang);
        const snips = snippetsFor(lang);
        tabs.setTitle('sandbox', `${info.label} sandbox`);
        this.fileLabel.textContent = `scratch.${info.ext}`;
        clear(this.pick).append(h('option', { value: '' }, 'Load an example...'), ...Object.keys(snips).map((k) => h('option', { value: k }, k)));
        const ck = lang === 'c' ? 'cCompiler' : 'compiler', sk = lang === 'c' ? 'cStd' : 'std';
        clear(this.compiler).append(...info.compilers.map((c) => h('option', { value: c, selected: c === this.opts[ck] }, c)));
        clear(this.std).append(...info.stds.map(([v, label]) => h('option', { value: v, selected: v === this.opts[sk] }, label)));
        if (!info.compilers.includes(this.compiler.value)) this.compiler.value = info.compilers[0];
        if (!info.stds.some(([v]) => v === this.std.value)) this.std.value = lang === 'c' ? 'c17' : 'c++20';
        this.lang = languageFor(`scratch.${info.ext}`);
        const src = snippet ? snips[snippet] : await call('state.get', { key: sourceKey(lang), fallback: snips[HELLO[lang]] });
        if (this.view) { this.view.destroy(); this.view = null; }
        this.view = createView({
          parent: this.host, doc: src, file: `scratch.${info.ext}`, lang: this.lang,
          onChange: (u) => { call('state.set', { key: sourceKey(this.langId), value: u.state.doc.toString() }); if (this.asmOn) this.refreshAsm(); },
          extra: [EditorView.lineWrapping, EditorView.updateListener.of((u) => { if (u.selectionSet && this.asmOn) this.hot(); })],
        });
        registerSandboxView(this.view);
        if (snippet) call('state.set', { key: sourceKey(lang), value: src });
        if (this.asmOn) this.refreshAsm(true);
        if (tabs.activeId === 'sandbox') setTimeout(() => this.view && this.view.focus(), 0);
      };
      this.compiler.addEventListener('change', () => { this.opts[this.langId === 'c' ? 'cCompiler' : 'compiler'] = this.compiler.value; saveOpts(); if (this.asmOn) this.refreshAsm(true); });
      this.std.addEventListener('change', () => { this.opts[this.langId === 'c' ? 'cStd' : 'std'] = this.std.value; saveOpts(); if (this.asmOn) this.refreshAsm(true); });
      this.opt.addEventListener('change', () => { this.opts.opt = this.opt.value; saveOpts(); if (this.asmOn) this.refreshAsm(true); });
      this.pick.addEventListener('change', () => {
        if (!this.pick.value || !this.view) return;
        this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: snippetsFor(this.langId)[this.pick.value] } });
        this.pick.value = '';
        this.view.focus();
      });
      runBtn.addEventListener('click', () => runSandbox());
      vgBtn.addEventListener('click', () => runSandbox('valgrind'));
      asmBtn.addEventListener('click', () => { this.toggleAsm(!this.asmOn); saveOpts(); });
      this.toggleAsm = (onOff) => {
        this.asmOn = onOff;
        this.asmPane.hidden = !onOff;
        this.asmHost.hidden = !onOff;
        asmBtn.setAttribute('aria-pressed', String(onOff));
        if (onOff) this.refreshAsm(true);
        if (this.view) this.view.requestMeasure();
      };
      const doAsm = async () => {
        if (!this.view) return;
        const r = await call('sandbox.asm', { source: this.view.state.doc.toString(), compiler: this.compiler.value, std: this.std.value, opt: this.opt.value, lang: this.langId });
        this.asmLines = r.lines || [];
        const text = r.ok ? this.asmLines.map((l) => l.text).join('\n') : `; doesn't compile yet\n${(r.problems || []).filter((p) => p.severity === 'error').map((p) => `; line ${p.line}: ${p.message}`).join('\n')}`;
        this.asmFlags.textContent = r.ok ? `${r.flags} · ${this.asmLines.filter((l) => !l.label).length} instructions; the ones from your cursor's line light up` : 'compile errors';
        if (!this.asmView) {
          this.asmView = new EditorView({ parent: this.asmHost, state: EditorState.create({ doc: text, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), asmHot, EditorView.lineWrapping] }) });
        } else this.asmView.dispatch({ changes: { from: 0, to: this.asmView.state.doc.length, insert: text } });
        this.hot();
      };
      const later = debounce(doAsm, 700);
      this.refreshAsm = (now) => (now ? doAsm() : later());
      this.hot = () => {
        if (!this.asmView || !this.view || !this.asmLines) return;
        const line = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
        const hits = [];
        this.asmLines.forEach((l, i) => { if (l.src === line && i < this.asmView.state.doc.lines) hits.push(i + 1); });
        this.asmView.dispatch({ effects: setAsmHot.of(hits) });
        if (hits.length) this.asmView.dispatch({ effects: EditorView.scrollIntoView(this.asmView.state.doc.line(hits[0]).from, { y: 'center' }) });
        this.asmLine.textContent = hits.length ? `line ${line}: ${hits.length} instruction${hits.length > 1 ? 's' : ''}` : `line ${line}: no instructions of its own (inlined into others, or optimised away)`;
      };
      this.unlisten = onLanguageChange((l) => { if (l !== this.langId) this.useLang(l); });
      this.ready = call('state.get', { key: 'sandbox.opts', fallback: {} }).then(async (o) => {
        this.opts = { compiler: 'g++', std: 'c++20', cCompiler: 'gcc', cStd: 'c17', opt: '-O1', ...o };
        this.opt.value = this.opts.opt;
        await this.useLang(language(), snippetName);
        if (o.asm) this.toggleAsm(true);
      });
    },
    onShow() { if (this.view) { this.view.requestMeasure(); setTimeout(() => this.view.focus(), 0); } },
    onClose() { if (this.unlisten) this.unlisten(); if (this.view && this.langId) call('state.set', { key: sourceKey(this.langId), value: this.view.state.doc.toString() }); },
  });
  if (snippetName && t.view && t.ready) t.ready.then(() => { const s = snippetsFor(t.langId)[snippetName]; if (s) t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: s } }); });
  return t;
}

// Put some code in the sandbox (Try in sandbox, in a guide)
export async function sandboxWith(code, lang) {
  if (lang && lang !== language()) await runCommand('lang.set', lang);
  const t = openSandbox();
  await t.ready;
  if (t.langId !== language()) await t.useLang(language());
  t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: code } });
  return t;
}

// The same C / C++ switch the main toolbar has
function langSwitch() {
  const box = choices([['c', 'C'], ['cpp', 'C++']], language(), { label: 'Language' });
  box.classList.add('lang-switch');
  box.addEventListener('change', () => runCommand('lang.set', box.value));
  const off = onLanguageChange((l) => { if (!box.isConnected) return off(); box.set(l); });
  return box;
}
export { langSwitch };

async function runSandbox(tool) {
  const t = tabs.get('sandbox');
  if (!t || !t.view) return;
  startRun(tool === 'valgrind' ? 'Sandbox under Valgrind' : 'Sandbox');
  let r;
  try { r = await call('sandbox.run', { source: t.view.state.doc.toString(), compiler: t.compiler.value, std: t.std.value, lang: t.langId, tool }); }
  catch (err) { status.set('build', ''); return toast(err.message, 'error', 8000); }
  sandboxFiles.add(r.file);
  finishRun(r, tool === 'valgrind' ? 'Sandbox: running under Valgrind' : 'Sandbox: compiled, running', 'Sandbox: compile failed');
  const doc = t.view.state.doc;
  const diags = (r.problems || []).filter((p) => p.line > 0 && p.file === r.file).map((p) => {
    const l = doc.line(Math.min(p.line, doc.lines));
    return { from: l.from, to: l.to, severity: p.severity === 'info' ? 'info' : p.severity, message: p.message };
  });
  t.view.dispatch(setDiagnostics(t.view.state, diags));
  markRuntime(t.view, []);
  if (r.ok) panel.show('terminal');
}

// The Tests sidebar's run / debug buttons
export async function runTarget(target, root, dbg = false) {
  await saveAll();
  startRun(dbg ? `Building ${target} for gdb` : `Building ${target}`);
  const r = await call(dbg ? 'cmake.debug' : 'cmake.run', { root, target });
  finishRun(r, dbg ? `gdb: ${target}` : `Running ${target}`);
  if (r.ok) panel.show('terminal');
  return r;
}

export function initBuild() {
  panel.add({
    id: 'build', title: 'Build',
    render(el) { outEl = h('pre', { class: 'output', 'aria-live': 'polite' }); el.append(outEl); },
  });
  panel.add({
    id: 'problems', title: 'Problems',
    render(el) { probEl = h('ul', { class: 'problems' }); el.append(probEl); renderProblems(); },
  });
  on('build.start', (d) => appendOutput(`$ ${d.command}\n`));
  on('build.output', (d) => appendOutput(d.text));
  on('build.done', (d) => appendOutput(`\n[exit ${d.code}]\n`));
  call('sandbox.dir').then((d) => { sandboxFiles.add(d.files.cpp); sandboxFiles.add(d.files.c); }).catch(() => {});

  command('build.build', 'Build', ['F9'], () => build());
  command('build.configure', 'CMake: configure', ['Alt+F9'], () => configure(false));
  command('build.fresh', 'CMake: fresh configure (clears the cache)', [], () => configure(true));
  command('build.target', 'Build one target...', [], buildOne);
  command('build.run', 'Build and run', ['Ctrl+F9'], () => run());
  command('build.runArgs', 'Run with arguments...', [], runWithArgs);
  command('build.valgrind', 'Run under Valgrind (memcheck)', [], valgrind);
  command('build.pickTarget', 'Change which program runs...', [], async () => {
    const ctx = await context();
    const r = await call('cmake.targets', { file: ctx.file || ctx.dir });
    if (!r.root) return toast('Not in a CMake project', 'error');
    const name = await pickTarget(r.targets.filter((x) => x.type === 'executable'), 'Run which program from now on (for files that aren\'t in one)?');
    if (name) { await call('state.set', { key: `run.target:${r.root}`, value: name }); toast(`Ctrl+F9 runs ${name} for files that aren't part of a program`, 'ok'); }
  });
  command('build.debug', 'Debug with gdb (stops at this line)', ['Ctrl+Shift+D'], debug);
  command('build.nextProblem', 'Next problem', ['Alt+F8'], () => nextProblem(1));
  command('build.prevProblem', 'Previous problem', ['Alt+F7'], () => nextProblem(-1));
  command('build.showProblems', 'Problems', [], () => panel.show('problems'));
  command('analyze.tidy', 'clang-tidy this file', ['Ctrl+Shift+K'], () => analyze('tidy'));
  command('analyze.cppcheck', 'cppcheck this file', ['Ctrl+Shift+U'], () => analyze('cppcheck'));
  command('dos.build', 'DOS: compile with Open Watcom', [], () => dosBuild(false));
  command('dos.run', 'DOS: compile and run in DOSBox-X', [], () => dosBuild(true));
  command('sandbox.open', 'Sandbox (C or C++)', ['F4'], (name) => openSandbox(typeof name === 'string' ? name : undefined));
  command('sandbox.valgrind', 'Sandbox: run under Valgrind', [], () => { if (!tabs.get('sandbox')) openSandbox(); tabs.focus('sandbox'); return tabs.get('sandbox').ready.then(() => runSandbox('valgrind')); });
  command('sandbox.asm', 'Sandbox: show the assembly', ['Ctrl+Shift+A'], () => {
    const t = tabs.get('sandbox') ? tabs.get('sandbox') : openSandbox();
    tabs.focus('sandbox');
    const go = () => (t.toggleAsm ? t.toggleAsm(!t.asmOn) : setTimeout(go, 50));
    go();
  });
}
export { SNIPPETS, SNIPPETS_C, openSandbox, startRun, finishRun };
