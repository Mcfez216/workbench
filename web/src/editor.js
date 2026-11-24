// The code editor (CodeMirror 6): one tab per file, the vault's C++ style
// (4 spaces, a mark at column 100, like cpp-path.lua), standard / Vim /
// Emacs keys, clangd for completion, errors, hover, go-to-definition and
// formatting, and red marks for what a sanitizer caught when it ran.

import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine, highlightTrailingWhitespace, MatchDecorator, ViewPlugin, Decoration } from '@codemirror/view';
import { EditorState, Compartment, StateField, StateEffect, RangeSetBuilder, Prec } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, closeCompletion, snippetCompletion } from '@codemirror/autocomplete';
import { lintKeymap, lintGutter, setDiagnostics } from '@codemirror/lint';
import { indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, indentUnit, StreamLanguage } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { markdown } from '@codemirror/lang-markdown';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { python } from '@codemirror/legacy-modes/mode/python';
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp';
import { cmake } from '@codemirror/legacy-modes/mode/cmake';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { emacs, EmacsHandler } from '@replit/codemirror-emacs';
import { LSPClient, Workspace, LSPPlugin, serverCompletion, hoverTooltips, serverDiagnostics, signatureHelp,
  jumpToDefinition, findReferences, renameSymbol, formatDocument } from '@codemirror/lsp-client';
import { call, on } from './rpc.js';
import { h, toast, dialog, pathText } from './ui.js';
import { tabs, command, runCommand, status, setEditorKeymap } from './layout.js';
import { editorHighlight } from './highlight.js';
import { fileLanguage } from './lang.js';
import { bannedFunctions } from './banned.js';

let cfg = null;
export function setConfig(c) {
  const wrapWas = cfg && cfg.editor && cfg.editor.wrap;
  cfg = c;
  const wrap = !!(cfg.editor && cfg.editor.wrap);
  if (wrapWas !== undefined && wrap !== !!wrapWas) setWrap(wrap);
}

// ------------------------------------------------------------------ languages
export function languageFor(file) {
  const base = file.split('/').pop();
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  // a .h is C or C++ depending on the language you're working in
  const code = fileLanguage(file);
  if (code === 'cpp') return { name: 'C++', ext: cpp(), lsp: 'cpp', code: true, id: 'cpp' };
  if (code === 'c') return { name: 'C', ext: cpp(), lsp: 'c', code: true, id: 'c' };
  if (base === 'CMakeLists.txt' || ext === 'cmake') return { name: 'CMake', ext: StreamLanguage.define(cmake) };
  if (/^(GNU)?[Mm]akefile$/.test(base) || ext === 'mk') return { name: 'Makefile', ext: StreamLanguage.define(shell), tabs: true };
  if (['sh', 'bash', 'zsh'].includes(ext) || ['.bashrc', '.bash_profile', '.profile'].includes(base)) return { name: 'Shell', ext: StreamLanguage.define(shell) };
  if (['md', 'markdown'].includes(ext)) return { name: 'Markdown', ext: markdown() };
  if (['patch', 'diff', 'eml'].includes(ext)) return { name: 'Diff', ext: StreamLanguage.define(diff) };
  if (['ini', 'conf', 'config', 'cfg', 'toml'].includes(ext) || base === '.gitconfig') return { name: 'Config', ext: StreamLanguage.define(properties) };
  if (['yaml', 'yml'].includes(ext) || ['.clangd', '.clang-format', '.clang-tidy'].includes(base)) return { name: 'YAML', ext: StreamLanguage.define(yaml), indent: 2 };
  if (ext === 'lua') return { name: 'Lua', ext: StreamLanguage.define(lua), indent: 2 };
  if (ext === 'ps1' || ext === 'psm1') return { name: 'PowerShell', ext: StreamLanguage.define(powerShell) };
  if (ext === 'py') return { name: 'Python', ext: StreamLanguage.define(python) };
  if (ext === 'el' || ext === 'lisp') return { name: 'Lisp', ext: StreamLanguage.define(commonLisp), indent: 2 };
  if (ext === 'json') return { name: 'JSON', ext: [], indent: 2 };
  return { name: 'Text', ext: [] };
}

// The vault's style (cpp-path.lua): spaces not tabs, 4 wide, and a mark
// after column 100. Makefiles need real tabs.
const codeStyle = (lang) => [
  EditorState.tabSize.of(lang.tabs ? 8 : 4),
  indentUnit.of(lang.tabs ? '\t' : ' '.repeat(lang.indent || 4)),
  lang.code ? EditorView.editorAttributes.of({ class: 'cpp-ruler' }) : [],
  highlightTrailingWhitespace(),
  lang.code ? tabMarks : [],
];
// a tab in C++ source shows up, since the vault's style has none
const tabMatcher = new MatchDecorator({ regexp: /\t+/g, decoration: Decoration.mark({ class: 'cm-hardTab' }) });
const tabMarks = ViewPlugin.fromClass(class {
  constructor(view) { this.deco = tabMatcher.createDeco(view); }
  update(u) { this.deco = tabMatcher.updateDeco(u, this.deco); }
}, { decorations: (v) => v.deco });

// ------------------------------------------------------------------ snippets
// Built in, no plugins: type the word, pick it from the list, Tab moves
// between the fields. They sit alongside clangd's own completions.
const S = (label, detail, tpl) => snippetCompletion(tpl, { label, detail, type: 'keyword', boost: -1 });
const COMMON_SNIPPETS = [
  S('for', 'counted loop', 'for (${int} ${i} = 0; ${i} < ${n}; ++${i}) {\n\t${}\n}'),
  S('while', 'loop', 'while (${condition}) {\n\t${}\n}'),
  S('do', 'do ... while', 'do {\n\t${}\n} while (${condition});'),
  S('if', 'if', 'if (${condition}) {\n\t${}\n}'),
  S('ife', 'if ... else', 'if (${condition}) {\n\t${}\n} else {\n\t\n}'),
  S('switch', 'switch', 'switch (${value}) {\ncase ${0}:\n\t${}\n\tbreak;\ndefault:\n\tbreak;\n}'),
  S('struct', 'struct', 'struct ${Name} {\n\t${}\n};'),
  S('#inc', '#include <...>', '#include <${header}>'),
  S('#incl', '#include "..."', '#include "${header}"'),
];
const C_SNIPPETS = [
  ...COMMON_SNIPPETS,
  S('main', 'int main(void)', 'int main(void) {\n\t${}\n\treturn 0;\n}'),
  S('mainargs', 'int main(int argc, char *argv[])', 'int main(int argc, char *argv[]) {\n\t${}\n\treturn 0;\n}'),
  S('printf', 'printf("...\\n", ...)', 'printf("${%d}\\n", ${value});'),
  S('scanf', 'scanf with a check', 'if (scanf("${%d}", &${value}) != 1) {\n\t${}\n}'),
  S('malloc', 'malloc with a check', '${int} *${p} = malloc(${n} * sizeof *${p});\nif (${p} == NULL) {\n\t${}\n}'),
  S('typedef', 'typedef struct', 'typedef struct ${Name} {\n\t${}\n} ${Name};'),
  S('guard', 'include guard', '#ifndef ${NAME}_H\n#define ${NAME}_H\n\n${}\n\n#endif /* ${NAME}_H */'),
  S('fori', 'for over an array', 'for (size_t ${i} = 0; ${i} < sizeof ${arr} / sizeof ${arr}[0]; ++${i}) {\n\t${}\n}'),
];
const CPP_SNIPPETS = [
  ...COMMON_SNIPPETS,
  S('main', 'int main()', 'int main() {\n\t${}\n\treturn 0;\n}'),
  S('mainargs', 'int main(int argc, char* argv[])', 'int main(int argc, char* argv[]) {\n\t${}\n\treturn 0;\n}'),
  S('cout', 'std::cout << ... << \'\\n\'', "std::cout << ${value} << '\\n';"),
  S('cin', 'std::cin >> ...', 'std::cin >> ${value};'),
  S('forr', 'range-for', 'for (const auto& ${x} : ${container}) {\n\t${}\n}'),
  S('class', 'class', 'class ${Name} {\npublic:\n\t${Name}() = default;\n\t${}\nprivate:\n};'),
  S('ns', 'namespace', 'namespace ${name} {\n\n${}\n\n}  // namespace ${name}'),
  S('lambda', '[&](...) { ... }', '[${&}](${auto x}) { ${return x;} }'),
  S('uptr', 'std::make_unique', 'auto ${p} = std::make_unique<${T}>(${});'),
  S('vec', 'std::vector', 'std::vector<${int}> ${v}${};'),
  S('try', 'try ... catch', 'try {\n\t${}\n} catch (const std::exception& e) {\n\tstd::cerr << e.what() << \'\\n\';\n}'),
  S('ruleof5', 'rule of five', '${T}(const ${T}&) = default;\n${T}& operator=(const ${T}&) = default;\n${T}(${T}&&) noexcept = default;\n${T}& operator=(${T}&&) noexcept = default;\n~${T}() = default;'),
];
function snippetSource(list) {
  return (ctx) => {
    const word = ctx.matchBefore(/#?\w*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    // not inside a string or a comment
    const line = ctx.state.doc.lineAt(ctx.pos).text.slice(0, ctx.pos - ctx.state.doc.lineAt(ctx.pos).from);
    if (/\/\/|"[^"]*$/.test(line.replace(/"(?:[^"\\]|\\.)*"/g, ''))) return null;
    return { from: word.from, options: list, validFor: /^#?\w*$/ };
  };
}
function snippetsFor(lang) {
  if (!lang.code || (cfg && cfg.editor && cfg.editor.snippets === false)) return [];
  const src = snippetSource(lang.id === 'c' ? C_SNIPPETS : CPP_SNIPPETS);
  return EditorState.languageData.of(() => [{ autocomplete: src }]);
}

// ------------------------------------------------------------------ word wrap
const wrapCompartment = new Compartment();
function setWrap(on) {
  for (const t of tabs.list) if (t.view) t.view.dispatch({ effects: wrapCompartment.reconfigure(on ? EditorView.lineWrapping : []) });
}

// ------------------------------------------------------------------ runtime marks
// What AddressSanitizer or UBSan reported when the program ran: the line
// goes red and says what happened, Turbo C++ style. Cleared by the next
// build or by editing the line.
export const setRuntimeMarks = StateEffect.define();
class MarkWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM() { const s = document.createElement('div'); s.className = 'cm-runtimeMsg'; s.textContent = '▲ ' + this.text; return s; }
}
const runtimeField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setRuntimeMarks)) continue;
      const b = new RangeSetBuilder();
      const doc = tr.state.doc;
      const seen = new Set();
      for (const m of [...e.value].sort((x, y) => x.line - y.line)) {
        if (!m.line || m.line > doc.lines || seen.has(m.line)) continue;
        seen.add(m.line);
        const l = doc.line(m.line);
        b.add(l.from, l.from, Decoration.line({ class: 'cm-runtimeLine', attributes: { title: m.message } }));
        b.add(l.to, l.to, Decoration.widget({ widget: new MarkWidget(m.message), side: 1, block: true }));
      }
      deco = b.finish();
    }
    if (tr.docChanged && deco.size) {
      // editing a marked line clears its mark
      const touched = new Set();
      tr.changes.iterChangedRanges((fa, ta, fb, tb) => {
        for (let p = fb; p <= tb; ) { const l = tr.state.doc.lineAt(p); touched.add(l.number); p = l.to + 1; }
      });
      if (touched.size) deco = deco.update({ filter: (from) => !touched.has(tr.state.doc.lineAt(from).number) });
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
export function markRuntime(view, marks) { if (view) view.dispatch({ effects: setRuntimeMarks.of(marks) }); }

// ------------------------------------------------------------------ keymaps
const keymapCompartment = new Compartment();
const lspCompartment = new Compartment();
function baseKeys() {
  return keymap.of([
    ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...lintKeymap, indentWithTab,
    { key: 'F12', run: jumpToDefinition }, { key: 'Shift-F12', run: findReferences }, { key: 'Mod-Shift-r', run: renameSymbol },
    { key: 'Shift-Alt-f', run: formatDocument },
  ]);
}
// In Vim, Escape closes the completion list AND leaves insert mode, in one
// press, as it does in Neovim.
const vimEscape = Prec.highest(keymap.of([{
  key: 'Escape',
  run: (v) => {
    const open = closeCompletion(v);
    const cm = getCM(v);
    const st = cm && cm.state.vim;
    if (st && (st.insertMode || st.visualMode)) { Vim.handleKey(cm, '<Esc>', 'user'); return true; }
    return open;
  },
}]));
// The completion list's keys (arrows, Enter, Escape) come before the
// editor's own; autocompletion() is told not to add its copy, so Vim's
// Escape above can come first of all.
const completionKeys = Prec.highest(keymap.of(completionKeymap));
function keymapFor(kind) {
  if (kind === 'vim') return [vimEscape, completionKeys, vim(), baseKeys()];
  if (kind === 'emacs') return [completionKeys, emacs(), baseKeys()];
  return [completionKeys, baseKeys()];
}

// Emacs: the same keys as the vault's init.el
EmacsHandler.addCommands({
  cpwOther: () => runCommand('edit.otherFile'),
  cpwSave: () => runCommand('file.save'),
  cpwFindFile: () => runCommand('file.quickOpen'),
  cpwDef: (handler) => jumpToDefinition(handler.view),
  cpwRefs: (handler) => findReferences(handler.view),
  cpwMake: () => runCommand('build.build'),
  cpwRun: () => runCommand('build.run'),
  cpwTest: () => runCommand('test.all'),
});
EmacsHandler.bindKey('C-x C-s', 'cpwSave');
EmacsHandler.bindKey('C-x C-f', 'cpwFindFile');
EmacsHandler.bindKey('M-.', 'cpwDef');
EmacsHandler.bindKey('M-?', 'cpwRefs');
EmacsHandler.bindKey('C-c m', 'cpwMake');
EmacsHandler.bindKey('C-c c', 'cpwMake');
EmacsHandler.bindKey('C-c r', 'cpwRun');
EmacsHandler.bindKey('C-c t', 'cpwTest');
EmacsHandler.bindKey('C-c o', 'cpwOther');   // ff-find-other-file

// Vim: :w :q :wq, gd / gr, and the same commands and \c maps as the
// vault's cpp-path.lua (\cc configure, \cb build, \ct all tests, \cf the
// test under the cursor).
Vim.defineEx('write', 'w', () => runCommand('file.save'));
Vim.defineEx('quit', 'q', () => runCommand('file.close'));
Vim.defineEx('wq', 'wq', async () => { await runCommand('file.save'); runCommand('file.close'); });
Vim.defineEx('make', 'make', () => runCommand('build.build'));
Vim.defineEx('CMakeConfigure', 'CMakeC', () => runCommand('build.configure'));
Vim.defineEx('CMakeBuild', 'CMakeB', () => runCommand('build.build'));
Vim.defineEx('CTestAll', 'CTestA', () => runCommand('test.all'));
Vim.defineEx('CTestHere', 'CTestH', () => runCommand('test.here'));
Vim.defineEx('Format', 'Form', () => runCommand('edit.format'));
Vim.defineEx('Judge', 'Jud', () => runCommand('judge.open'));
Vim.defineEx('A', 'A', () => runCommand('edit.otherFile'));   // a.vim's :A, header <-> source
Vim.map('\\cc', ':CMakeConfigure<CR>', 'normal');
Vim.map('\\cb', ':CMakeBuild<CR>', 'normal');
Vim.map('\\ct', ':CTestAll<CR>', 'normal');
Vim.map('\\cf', ':CTestHere<CR>', 'normal');
Vim.defineAction('cpwDef', (cm) => jumpToDefinition(cm.cm6));
Vim.mapCommand('gd', 'action', 'cpwDef', {}, { context: 'normal' });
Vim.defineAction('cpwRefs', (cm) => findReferences(cm.cm6));
Vim.mapCommand('gr', 'action', 'cpwRefs', {}, { context: 'normal' });

// The Vim mode (NORMAL, INSERT, VISUAL) on the status line, for every view,
// including ones opened before Vim keys were switched on.
function watchVimMode(view) {
  try {
    const cm = getCM(view);
    if (cm && !cm.cpwWatched) {
      cm.cpwWatched = true;
      cm.on('vim-mode-change', (e) => showMode((e.mode + (e.subMode ? ' ' + e.subMode : '')).toUpperCase()));
    }
  } catch (e) { /* not in vim mode */ }
}

export function setKeymap(kind) {
  setEditorKeymap(kind);
  for (const t of tabs.list) if (t.view) { t.view.dispatch({ effects: keymapCompartment.reconfigure(keymapFor(kind)) }); watchVimMode(t.view); }
  if (sandboxView) { sandboxView.dispatch({ effects: keymapCompartment.reconfigure(keymapFor(kind)) }); watchVimMode(sandboxView); }
  showMode(kind === 'vim' ? 'NORMAL' : kind === 'emacs' ? 'EMACS' : '');
}
function showMode(text) { status.set('mode', text ? ` ${text} ` : '', { side: 'left', order: 1, cls: 'mode' }); }

// ------------------------------------------------------------------ clangd
// (Windows: C:/x/y.cpp is file:///C:/x/y.cpp, the drive kept as it is)
function fileUri(p) { return 'file://' + (/^[A-Za-z]:\//.test(p) ? '/' : '') + p.split('/').map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/'); }
function uriPath(u) { return decodeURIComponent(u.replace(/^file:\/\//, '')).replace(/^\/([A-Za-z]:\/)/, '$1'); }

class KPWorkspace extends Workspace {
  constructor(client) { super(client); this.files = []; this.versions = {}; }
  nextVersion(uri) { this.versions[uri] = (this.versions[uri] ?? -1) + 1; return this.versions[uri]; }
  syncFiles() {
    const out = [];
    for (const f of this.files) {
      const plugin = LSPPlugin.get(f.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        out.push({ changes, file: f, prevDoc: f.doc });
        f.doc = f.view.state.doc; f.version = this.nextVersion(f.uri);
        plugin.clear();
      }
    }
    return out;
  }
  openFile(uri, languageId, view) {
    if (this.getFile(uri)) return;
    const f = { uri, languageId, version: this.nextVersion(uri), doc: view.state.doc, view, getView() { return this.view; } };
    this.files.push(f);
    this.client.didOpen(f);
  }
  closeFile(uri) {
    const f = this.getFile(uri);
    if (f) { this.files = this.files.filter((x) => x !== f); this.client.didClose(uri); }
  }
  async displayFile(uri) {
    const t = await openFile(uriPath(uri));
    return t ? t.view : null;
  }
}

const clients = new Map();
const SESSION = Math.random().toString(36).slice(2) + Date.now().toString(36);   // this window load
let clangdMissing = false;      // said once; not tried again until the window reloads
function lspClient(root) {
  if (clients.has(root)) return clients.get(root);
  if (clangdMissing) return Promise.reject(new Error('clangd is not installed'));
  const p = (async () => {
    await call('lsp.start', { root, session: SESSION });
    const handlers = new Set();
    on('lsp.message', (d) => { if (d.root === root && d.session === SESSION) for (const fn of handlers) fn(d.message); });
    const transport = {
      send: (message) => { call('lsp.send', { root, session: SESSION, message }).catch(() => {}); },
      subscribe: (fn) => handlers.add(fn),
      unsubscribe: (fn) => handlers.delete(fn),
    };
    const client = new LSPClient({
      rootUri: fileUri(root), timeout: 15000,
      workspace: (c) => new KPWorkspace(c),
      extensions: [serverCompletion(), hoverTooltips(), serverDiagnostics(), signatureHelp()],
    });
    client.connect(transport);
    status.set('lsp', 'clangd', { title: `clangd running for ${root}`, order: 20 });
    return client;
  })();
  clients.set(root, p);
  p.catch((err) => {
    clients.delete(root);
    if (/not installed/.test(err.message)) { if (clangdMissing) return; clangdMissing = true; toast(err.message, 'info', 9000); }
    else toast(`clangd: ${err.message}`, 'error');
  });
  return p;
}
on('lsp.exit', (d) => {
  if (d.session !== SESSION) return;
  clients.delete(d.root);
  status.set('lsp', '');
  if (d.error && !/not installed/.test(d.error)) toast(d.error, 'error', 8000);   // "not installed" was already said
});

async function lspExtension(file, lang) {
  if (!lang.lsp || !cfg || !cfg.clangd.enabled) return [];
  try {
    const { root } = await call('lsp.root', { file });
    const client = await lspClient(root);
    return client.plugin(fileUri(file), lang.lsp);
  } catch (err) { return []; }
}

// ------------------------------------------------------------------ editor views
export function createView({ parent, doc, file, lang, onChange, extra = [] }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(editorHighlight), bracketMatching(),
        closeBrackets(), autocompletion({ activateOnTyping: true, defaultKeymap: false }), rectangularSelection(), crosshairCursor(), highlightActiveLine(),
        highlightSelectionMatches(), lintGutter(),
        keymapCompartment.of(keymapFor(cfg ? cfg.keymap : 'standard')),
        lang.ext, codeStyle(lang), runtimeField, snippetsFor(lang),
        lang.code && !(cfg && cfg.editor && cfg.editor.banned === false) ? bannedFunctions : [],
        wrapCompartment.of(cfg && cfg.editor && cfg.editor.wrap ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChange) onChange(u);
          if (u.selectionSet || u.docChanged) { cursorStatus(u.view); window.dispatchEvent(new CustomEvent('cpw-editor-update', { detail: { docChanged: u.docChanged } })); }
        }),
        ...extra,
      ],
    }),
  });
  watchVimMode(view);
  return view;
}

function cursorStatus(view) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const col = (() => {   // visual column, counting tabs as 8
    let c = 0;
    for (const ch of line.text.slice(0, pos - line.from)) c = ch === '\t' ? c + 8 - (c % 8) : c + 1;
    return c + 1;
  })();
  status.set('cursor', `${line.number}:${col}`, { order: 10, side: 'left' });
}

// ------------------------------------------------------------------ file tabs
export async function openFile(file, { line, col, preview, side } = {}) {
  const id = 'file:' + file;
  let t = tabs.get(id);
  if (!t) {
    let res;
    try { res = await call('files.read', { file }); }
    catch (err) { toast(err.message, 'error'); return null; }
    const lang = languageFor(file);
    const name = file.split('/').pop();
    t = tabs.open({
      side,
      id, kind: 'editor', title: name, tooltip: file, session: { kind: 'file', path: file },
      render(el) {
        el.append(h('div', { class: 'editor-bar' }, h('span', { class: 'path', title: file }, pathText(file)), h('span', {}, lang.name)));
        const host = h('div', { class: 'editor-host' });
        el.append(host);
        this.file = file; this.mtime = res.mtime; this.lang = lang;
        this.savedDoc = null;
        this.view = createView({
          parent: host, doc: res.text, file, lang,
          onChange: (u) => { tabs.setDirty(id, !u.state.doc.eq(this.savedDoc)); autosaveSoon(this); },
          extra: [lspCompartment.of([])],
        });
        this.savedDoc = this.view.state.doc;
        lspExtension(file, lang).then((ext) => { if (this.view && ext && (ext.length !== 0)) this.view.dispatch({ effects: lspCompartment.reconfigure(ext) }); });
      },
      onShow() { if (this.view) { this.view.requestMeasure(); setTimeout(() => this.view.focus(), 0); cursorStatus(this.view); } status.set('lang', this.lang ? this.lang.name : '', { order: 15, side: 'left' }); },
      onHide() { if (this.dirty && cfg && cfg.editor && cfg.editor.autosave) saveTab(this); },
      onClose() { clearTimeout(this.autosaveTimer); if (this.view) this.view.destroy(); },
      save() { return saveTab(this); },
    });
    rememberRecent(file);
  } else if (side && t.side !== side) tabs.move(id, side);
  else tabs.focus(id);
  if (line) goTo(t.view, line, col);
  return t;
}


// Autosave (Settings → Editor): a second and a half after you stop typing,
// and when you switch away from the tab.
function autosaveSoon(t) {
  if (!cfg || !cfg.editor || !cfg.editor.autosave) return;
  clearTimeout(t.autosaveTimer);
  t.autosaveTimer = setTimeout(() => { if (t.dirty && tabs.get(t.id)) saveTab(t); }, 1500);
}

// The last files you opened, newest first, for the start screen and File → Recent
export async function rememberRecent(file) {
  const list = await call('state.get', { key: 'recent.files', fallback: [] });
  const next = [file, ...list.filter((f) => f !== file)].slice(0, 15);
  call('state.set', { key: 'recent.files', value: next });
  window.dispatchEvent(new CustomEvent('cpw-recent'));
}

export function goTo(view, line, col = 1) {
  if (!view) return;
  const doc = view.state.doc;
  const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
  // col counts tabs as 8 columns (compiler style); turn it back into an offset
  let c = 0, off = 0;
  while (off < l.length && c < col - 1) { c = l.text[off] === '\t' ? c + 8 - (c % 8) : c + 1; off++; }
  view.dispatch({ selection: { anchor: l.from + off }, scrollIntoView: true, effects: EditorView.scrollIntoView(l.from + off, { y: 'center' }) });
  view.focus();
}

// One save at a time per file: F2 then F9 straight away would otherwise
// write twice, and the second write would think someone else changed it.
async function saveTab(t) {
  if (t.saving) {
    await t.saving.catch(() => {});
    if (t.view && t.savedDoc && t.view.state.doc.eq(t.savedDoc)) return true;
  }
  t.saving = writeTab(t);
  try { return await t.saving; } finally { t.saving = null; }
}

async function writeTab(t) {
  if (!t.view) return false;
  const text = t.view.state.doc.toString();
  try {
    const r = await call('files.write', { file: t.file, text, expectMtime: t.mtime });
    t.mtime = r.mtime; t.savedDoc = t.view.state.doc;
    tabs.setDirty(t.id, false);
    status.set('msg', `Saved ${t.title}`, { side: 'left', order: 90 });
    window.dispatchEvent(new CustomEvent('cpw-saved', { detail: { file: t.file } }));
    return true;
  } catch (err) {
    if (/changed on disk/.test(err.message)) {
      const r = await dialog({ title: 'File changed on disk', body: h('p', {}, `${t.title} was changed by another program since you opened it.`),
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Reload theirs', value: 'reload' }, { label: 'Overwrite with mine', value: 'mine', primary: true }] });
      if (r === 'mine') { t.mtime = 0; return writeTab(t); }
      if (r === 'reload') { await reloadTab(t); return true; }
      return false;
    }
    toast(err.message, 'error');
    return false;
  }
}

async function reloadTab(t) {
  const res = await call('files.read', { file: t.file });
  t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: res.text } });
  t.mtime = res.mtime; t.savedDoc = t.view.state.doc;
  tabs.setDirty(t.id, false);
}

// The active tab if it's a file (the sandbox has a view but no file)
export function activeEditor() {
  const t = tabs.active();
  return t && t.view && t.file ? t : null;
}
function activeView() { const t = tabs.active(); return t && t.view ? t.view : null; }

export function setFileDiagnostics(file, problems) {
  const t = tabs.get('file:' + file);
  if (!t || !t.view || (t.lang && t.lang.lsp && cfg && cfg.clangd.enabled)) return;  // clangd owns inline errors there
  const doc = t.view.state.doc;
  const diags = problems.filter((p) => p.file === file && p.line > 0).map((p) => {
    const l = doc.line(Math.min(p.line, doc.lines));
    return { from: l.from, to: l.to, severity: p.severity === 'info' ? 'info' : p.severity, message: p.message, source: p.source };
  });
  t.view.dispatch(setDiagnostics(t.view.state, diags));
}

// The Catch2 TEST_CASE the cursor is in (the nearest one above it), the
// way cpp-path.lua's :CTestHere finds it.
export function testCaseAt(view) {
  const doc = view.state.doc;
  for (let n = doc.lineAt(view.state.selection.main.head).number; n >= 1; n--) {
    const m = doc.line(n).text.match(/\b(TEST_CASE|SCENARIO)\s*\(\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return m[1] === 'SCENARIO' ? `Scenario: ${m[2]}` : m[2];
  }
  return null;
}

// The sandbox shares the keymap switcher
let sandboxView = null;
export function registerSandboxView(v) { sandboxView = v; }
export { keymapCompartment, keymapFor };

// ------------------------------------------------------------------ commands
export function initEditorCommands() {
  command('file.save', 'Save', ['F2', 'Ctrl+S'], async () => { const t = activeEditor(); if (t) await saveTab(t); });
  command('file.saveAll', 'Save all', ['Ctrl+Shift+S'], async () => { for (const t of tabs.list) if (t.view && t.dirty) await saveTab(t); });
  command('file.close', 'Close tab', ['Ctrl+W'], () => { const t = tabs.active(); if (t && t.closable) tabs.close(t.id); });
  command('edit.find', 'Find in file', ['Ctrl+F'], () => { const v = activeView(); if (v) openSearchPanel(v); });
  command('edit.gotoLine', 'Go to line', ['Ctrl+G'], () => { const v = activeView(); if (v) gotoLine(v); });
  command('edit.definition', 'Go to definition (clangd)', ['F12'], () => { const t = activeEditor(); if (t) jumpToDefinition(t.view); });
  command('edit.references', 'Find references (clangd)', ['Shift+F12'], () => { const t = activeEditor(); if (t) findReferences(t.view); });
  command('edit.rename', 'Rename symbol (clangd)', ['Ctrl+Shift+R'], () => { const t = activeEditor(); if (t) renameSymbol(t.view); });
  command('edit.format', 'Format file (clang-format)', ['Ctrl+Shift+O'], async () => {
    const t = activeEditor();
    if (!t) return;
    if (!t.lang.code) return toast('Formatting is for C and C++ files');
    // through clangd when it's running (it knows the project), else clang-format itself
    if (cfg.clangd.enabled && LSPPlugin.get(t.view) && formatDocument(t.view)) return;
    const before = t.view.state.doc.toString();
    const r = await call('format.file', { file: t.file, text: before });
    if (r.text === before) return toast('Already formatted', 'ok', 1500);
    if (t.view.state.doc.toString() !== before) return;     // you typed meanwhile
    t.view.dispatch({ changes: { from: 0, to: before.length, insert: r.text } });
    toast('Formatted with clang-format', 'ok', 1500);
  });
  command('edit.otherFile', 'Switch header / source', ['Alt+F12'], async () => {
    const t = activeEditor();
    if (!t) return toast('Open a source or header file first');
    const r = await call('files.counterpart', { file: t.file });
    if (!r.file) return toast(`No header or source file to match ${t.title}`);
    openFile(r.file);
  });
  command('edit.wrap', 'Word wrap on/off', ['Alt+Z'], async () => {
    const on = !(cfg.editor && cfg.editor.wrap);
    cfg = await call('config.save', { ...(await call('config.get')), editor: { ...cfg.editor, wrap: on } });
    window.dispatchEvent(new CustomEvent('cpw-config', { detail: cfg }));
    setWrap(on);
    toast(`Word wrap ${on ? 'on' : 'off'}`, 'ok', 1500);
  });
  command('edit.autosave', 'Autosave on/off', [], async () => {
    const on = !(cfg.editor && cfg.editor.autosave);
    cfg = await call('config.save', { ...(await call('config.get')), editor: { ...cfg.editor, autosave: on } });
    window.dispatchEvent(new CustomEvent('cpw-config', { detail: cfg }));
    toast(`Autosave ${on ? 'on: files save themselves a moment after you stop typing' : 'off'}`, 'ok');
  });
  window.addEventListener('beforeunload', (e) => { if (tabs.anyDirty()) { e.preventDefault(); e.returnValue = ''; } });
}
