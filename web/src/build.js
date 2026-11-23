// Build output and the Problems list; building, running and debugging
// (CMake, or g++ for a lone file); clang-tidy and cppcheck; what the
// sanitizers report while a program runs; the C++ sandbox with its
// assembly view; and the DOS retro track.

import { call, on } from './rpc.js';
import { h, clear, prompt, toast, dialog, debounce, pathText } from './ui.js';
import { panel, tabs, command, runCommand, status, sidebar } from './layout.js';
import { activeEditor, openFile, goTo, setFileDiagnostics, createView, languageFor, registerSandboxView, markRuntime } from './editor.js';
import { setDiagnostics } from '@codemirror/lint';
import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect, EditorState } from '@codemirror/state';

let outEl, probEl;
let problems = [];
let sandboxFile = null;

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
  if (sandboxFile && p.file === sandboxFile) {
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
  if (sb && sb.view && sandboxFile) {
    const list = byFile.get(sandboxFile) || [];
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
  startRun(method === 'cmake.debug' ? 'Building for gdb' : 'Build and run');
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
  finishRun(r, method === 'cmake.debug' ? `gdb: ${r.target || ''}` : `Running ${r.target || ''}`.trim());
  if (r.ok) panel.show('terminal');
  return r;
}

async function run(args) {
  if (tabs.active()?.id === 'sandbox') return runSandbox();
  return withTarget('cmake.run', args ? { args } : {});
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
  if (!t) return toast('Open a C++ file first');
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

function openSandbox(snippetName) {
  const t = tabs.open({
    id: 'sandbox', kind: 'sandbox', title: 'C++ sandbox', session: { kind: 'sandbox' },
    render(el) {
      const sel = (opts, value, title) => h('select', { class: 'field', title }, opts.map((o) => h('option', { value: o, selected: o === value }, o)));
      const pick = h('select', { class: 'field', title: 'Load an example' },
        h('option', { value: '' }, 'Load an example...'), Object.keys(SNIPPETS).map((k) => h('option', { value: k }, k)));
      this.compiler = sel(['g++', 'clang++'], 'g++', 'Compiler');
      this.std = sel(['c++17', 'c++20', 'c++23'], 'c++20', 'C++ standard');
      this.opt = sel(['-O0', '-O1', '-O2', '-O3', '-Os'], '-O1', 'Optimisation for the assembly view');
      const runBtn = h('button', { class: 'btn primary', type: 'button', title: 'Compile with -fsanitize=address,undefined and run (Ctrl+F9)' }, 'Compile & run');
      const asmBtn = h('button', { class: 'btn', type: 'button', title: 'What the compiler made of it (Ctrl+Shift+A)', 'aria-pressed': 'false' }, 'Assembly');
      this.asmBtn = asmBtn;
      el.append(h('div', { class: 'toolbar' }, h('span', {}, 'scratch.cpp'), pick, this.compiler, this.std, runBtn, asmBtn, this.opt,
        h('span', { class: 'muted small grow flags', title: 'Compiled with these flags (Settings → Sandbox flags)' }, '-Wall -Wextra -g -fsanitize=address,undefined')));
      const host = h('div', { class: 'editor-host' });
      this.asmHost = h('div', { class: 'editor-host asm-host', hidden: true });
      this.asmLine = h('span', { class: 'asm-line' });
      this.asmInfo = h('div', { class: 'asm-info muted small' });
      this.asmFlags = h('span', {});
      this.asmInfo.append(this.asmFlags, ' · ', this.asmLine);
      this.asmPane = h('div', { class: 'asm-pane', hidden: true }, this.asmInfo, this.asmHost);
      el.append(h('div', { class: 'split' }, host, this.asmPane));
      this.lang = languageFor('scratch.cpp');
      Promise.all([call('state.get', { key: 'sandbox.source', fallback: SNIPPETS['Hello, C++'] }), call('state.get', { key: 'sandbox.opts', fallback: {} })]).then(([src, o]) => {
        if (o.compiler) this.compiler.value = o.compiler;
        if (o.std) this.std.value = o.std;
        if (o.opt) this.opt.value = o.opt;
        this.view = createView({
          parent: host, doc: snippetName ? SNIPPETS[snippetName] : src, file: 'scratch.cpp', lang: this.lang,
          onChange: (u) => { call('state.set', { key: 'sandbox.source', value: u.state.doc.toString() }); if (this.asmOn) this.refreshAsm(); },
          extra: [EditorView.lineWrapping, EditorView.updateListener.of((u) => { if (u.selectionSet && this.asmOn) this.hot(); })],
        });
        registerSandboxView(this.view);
        if (o.asm) this.toggleAsm(true);
      });
      const saveOpts = () => call('state.set', { key: 'sandbox.opts', value: { compiler: this.compiler.value, std: this.std.value, opt: this.opt.value, asm: !!this.asmOn } });
      for (const s of [this.compiler, this.std, this.opt]) s.addEventListener('change', () => { saveOpts(); if (this.asmOn) this.refreshAsm(true); });
      pick.addEventListener('change', () => {
        if (!pick.value || !this.view) return;
        this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: SNIPPETS[pick.value] } });
        pick.value = '';
        this.view.focus();
      });
      runBtn.addEventListener('click', () => runSandbox());
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
        const r = await call('sandbox.asm', { source: this.view.state.doc.toString(), compiler: this.compiler.value, std: this.std.value, opt: this.opt.value });
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
    },
    onShow() { if (this.view) { this.view.requestMeasure(); setTimeout(() => this.view.focus(), 0); } },
  });
  if (snippetName && t.view) t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: SNIPPETS[snippetName] } });
  return t;
}

async function runSandbox() {
  const t = tabs.get('sandbox');
  if (!t || !t.view) return;
  startRun('Sandbox');
  const r = await call('sandbox.run', { source: t.view.state.doc.toString(), compiler: t.compiler.value, std: t.std.value });
  sandboxFile = r.file;
  finishRun(r, 'Sandbox: compiled, running', 'Sandbox: compile failed');
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
  call('sandbox.dir').then((d) => { sandboxFile = d.dir + '/scratch.cpp'; }).catch(() => {});

  command('build.build', 'Build', ['F9'], () => build());
  command('build.configure', 'CMake: configure', ['Alt+F9'], () => configure(false));
  command('build.fresh', 'CMake: fresh configure (clears the cache)', [], () => configure(true));
  command('build.target', 'Build one target...', [], buildOne);
  command('build.run', 'Build and run', ['Ctrl+F9'], () => run());
  command('build.runArgs', 'Run with arguments...', [], runWithArgs);
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
  command('sandbox.open', 'C++ sandbox', ['F4'], (name) => openSandbox(typeof name === 'string' ? name : undefined));
  command('sandbox.asm', 'Sandbox: show the assembly', ['Ctrl+Shift+A'], () => {
    const t = tabs.get('sandbox') ? tabs.get('sandbox') : openSandbox();
    tabs.focus('sandbox');
    const go = () => (t.toggleAsm ? t.toggleAsm(!t.asmOn) : setTimeout(go, 50));
    go();
  });
}
export { SNIPPETS, openSandbox, startRun, finishRun };
