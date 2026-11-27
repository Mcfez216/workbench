// The visual debugger, in the window: the Debug panel (buttons, variables,
// the call stack, watches, breakpoints), the keys while debugging, and the
// editor following the line the program is paused on.
//
//   Ctrl+Shift+D   start (builds first); with no breakpoints it pauses at main
//   F5             continue to the next breakpoint
//   F10            step over (run this line, stop at the next)
//   F11            step into (go into the function this line calls)
//   Shift+F11      step out (finish this function, stop where it was called)
//   Ctrl+F10       run to the cursor's line
//   Shift+F5       stop
//   Ctrl+F8        add or remove a breakpoint on this line (or click the margin)
//
// While debugging, F5, F10 and F11 belong to the debugger; when it stops,
// they're the terminal, the menu and nothing again.

import { call, on } from './rpc.js';
import { h, toast, clear } from './ui.js';
import { tabs, panel, command, runCommand, status } from './layout.js';
import { activeEditor, openFile } from './editor.js';
import { setBreakpointLines, setExecLine, toggleBreakpoint } from './bpgutter.js';

const bps = new Map();              // file -> [lines]
let watches = [];
let session = null;                 // { running, paused, target }
let prevValues = new Map();         // name -> value at the last stop, to show what changed
let el = null;
let busy = false;

const active = () => !!session;
const paused = () => !!(session && !session.running && session.paused);
const base = (f) => String(f || '').split('/').pop();

// ------------------------------------------------------------------ breakpoints
function saveBps() { call('state.set', { key: 'debug.breakpoints', value: Object.fromEntries(bps) }); }
function onEditorBreakpoints(file, lines) {
  if (lines.length) bps.set(file, lines); else bps.delete(file);
  saveBps();
  call('dbg.setBreakpoints', { file, lines }).catch(() => {});
  render();
}
function viewsFor(file) { return tabs.list.filter((t) => t.file === file && t.view).map((t) => t.view); }
function clearExec() { for (const t of tabs.list) if (t.view && t.file) setExecLine(t.view, null); }

// ------------------------------------------------------------------ actions
async function start() {
  const t = activeEditor();
  if (!t) return toast('Open the .c, .cpp or .rs file you want to debug', 'error');
  if (busy) return;
  busy = true;
  try {
    const { debugWithTarget } = await import('./build.js');
    const line = t.view.state.doc.lineAt(t.view.state.selection.main.head).number;
    const r = await debugWithTarget({ line, breakpoints: Object.fromEntries(bps) });
    if (r && r.ok) { panel.show('debug'); render(); }
  } finally { busy = false; }
}
async function step(how) {
  if (!paused()) return;
  try { await call('dbg.resume', { how }); } catch (e) { toast(e.message, 'error', 6000); }
}
async function runToCursor() {
  const t = activeEditor();
  if (!t || !paused()) return;
  const line = t.view.state.doc.lineAt(t.view.state.selection.main.head).number;
  try { await call('dbg.runTo', { file: t.file, line }); } catch (e) { toast(e.message, 'error', 6000); }
}
async function addWatch(expr) {
  expr = String(expr || '').trim();
  if (!expr || watches.includes(expr)) return;
  watches = [...watches, expr];
  call('state.set', { key: 'debug.watches', value: watches });
  await call('dbg.setWatches', { list: watches });
  render();
}
async function removeWatch(expr) {
  watches = watches.filter((w) => w !== expr);
  call('state.set', { key: 'debug.watches', value: watches });
  await call('dbg.setWatches', { list: watches });
  render();
}

// ------------------------------------------------------------------ the panel
function btn(label, title, fn, enabled = true) {
  return h('button', { type: 'button', class: 'btn small dbg-btn', title, disabled: !enabled, onclick: fn }, label);
}
function render() {
  if (!el) return;
  clear(el);
  const p = session && session.paused;
  const can = paused();
  const bar = h('div', { class: 'dbg-bar' },
    session ? btn('▶ Continue', 'Run to the next breakpoint (F5)', () => step('continue'), can) : btn('▶ Start debugging', 'Build and start (Ctrl+Shift+D)', start),
    btn('⤼ Step over', 'Run this line and stop at the next one (F10)', () => step('next'), can),
    btn('↓ Step into', 'Go into the function this line calls (F11)', () => step('step'), can),
    btn('↑ Step out', 'Finish this function and stop where it was called (Shift+F11)', () => step('finish'), can),
    btn('⇥ To cursor', 'Run to the line the cursor is on (Ctrl+F10)', runToCursor, can),
    btn('⏸ Pause', 'Pause the running program', () => call('dbg.pause'), !!(session && session.running)),
    btn('■ Stop', 'Stop debugging (Shift+F5)', () => call('dbg.stop'), !!session),
    h('span', { class: 'dbg-state' + (p && p.crashed ? ' sev-error' : '') },
      !session ? 'Not debugging. Click in the margin left of a line number to add a breakpoint, then Start.'
        : session.running ? 'Running… (if it waits for input, type in the program\'s terminal)'
          : p ? `${p.reason} ${p.func ? `In ${p.func}` : ''}${p.line ? `, line ${p.line}` : ''}` : 'Starting…'));
  el.append(bar);

  const grid = h('div', { class: 'dbg-grid' });
  // variables
  const vars = h('div', { class: 'dbg-col' }, h('div', { class: 'dbg-title' }, 'Variables', h('span', { class: 'muted small' }, ' (yellow: changed since the last stop)')));
  if (p && p.locals && p.locals.length) {
    const table = h('table', { class: 'dbg-vars' });
    for (const v of p.locals) {
      const changed = prevValues.has(v.name) && prevValues.get(v.name) !== v.value;
      table.append(h('tr', { class: changed ? 'changed' : '' },
        h('td', { class: 'dbg-name', title: v.type }, v.name, v.arg ? h('span', { class: 'muted small' }, ' (parameter)') : null),
        h('td', { class: 'dbg-value', title: `${v.type}\n${v.value}` }, v.value),
        h('td', { class: 'dbg-type muted small' }, v.type),
        h('td', {}, h('button', { type: 'button', class: 'link small', title: 'Watch it', onclick: () => addWatch(v.name) }, '+'))));
    }
    vars.append(table);
  } else vars.append(h('p', { class: 'muted small pad' }, p ? 'No variables here.' : 'The variables of the function you\'re paused in show here.'));
  // call stack
  const stack = h('div', { class: 'dbg-col' }, h('div', { class: 'dbg-title' }, 'Call stack', h('span', { class: 'muted small' }, ' (newest first; click one to look there)')));
  if (p && p.frames) {
    const ul = h('ul', { class: 'dbg-stack' });
    for (const f of p.frames) {
      ul.append(h('li', { class: (f.level === p.level ? 'sel ' : '') + (f.library ? 'lib' : '') },
        h('button', { type: 'button', class: 'tree-row', title: f.file, onclick: async () => {
          if (!f.library && f.file) openFile(f.file, { line: f.line });
          await call('dbg.selectFrame', { level: f.level }).catch((e) => toast(e.message, 'error'));
        } }, h('span', { class: 'name' }, f.func), ' ', h('span', { class: 'muted small' }, f.library ? '(library)' : `${base(f.file)}:${f.line}`))));
    }
    stack.append(ul);
  } else stack.append(h('p', { class: 'muted small pad' }, 'Which function called which, to get here.'));
  // watches and breakpoints
  const side = h('div', { class: 'dbg-col' });
  const input = h('input', { class: 'field', type: 'text', placeholder: 'Watch an expression: total * 2, v.size(), *p…', spellcheck: 'false' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addWatch(input.value); input.value = ''; } });
  side.append(h('div', { class: 'dbg-title' }, 'Watch'), input);
  const wl = h('ul', { class: 'dbg-watches' });
  for (const w of watches) {
    const got = p && p.watches ? p.watches.find((x) => x.expr === w) : null;
    wl.append(h('li', {}, h('span', { class: 'dbg-name' }, w), ' = ',
      h('span', { class: got && got.error ? 'muted' : 'dbg-value' }, got ? (got.error || got.value) : '…'),
      h('button', { type: 'button', class: 'link small', title: 'Stop watching', onclick: () => removeWatch(w) }, ' ×')));
  }
  side.append(wl);
  side.append(h('div', { class: 'dbg-title' }, 'Breakpoints'));
  const bl = h('ul', { class: 'dbg-bps' });
  for (const [file, lines] of bps) {
    for (const n of lines) {
      bl.append(h('li', {}, h('button', { type: 'button', class: 'tree-row', title: file, onclick: () => openFile(file, { line: n }) }, `● ${base(file)}:${n}`),
        h('button', { type: 'button', class: 'link small', title: 'Remove', onclick: () => {
          const left = (bps.get(file) || []).filter((x) => x !== n);
          for (const v of viewsFor(file)) setBreakpointLines(v, left);
          onEditorBreakpoints(file, left);
        } }, ' ×')));
    }
  }
  if (!bl.children.length) bl.append(h('li', { class: 'muted small' }, 'None: click left of a line number, or Ctrl+F8.'));
  side.append(bl);
  grid.append(vars, stack, side);
  el.append(grid);
}

// ------------------------------------------------------------------ events
function showPaused(d) {
  session = session || { target: '' };
  session.running = false;
  session.paused = d;
  clearExec();
  status.set('debug', `Debugging: paused${d.func ? ` in ${d.func}` : ''}`, { order: 20, side: 'left', title: 'F5 continue · F10 step over · F11 step into · Shift+F11 step out · Shift+F5 stop', onclick: () => panel.show('debug') });
  if (d.file && d.line) {
    openFile(d.file, { line: d.line }).then((t) => { if (t && t.view) setExecLine(t.view, d.line); });
  }
  if (!panel.isOpen() || panel.current !== 'debug') panel.show('debug');
  render();
  prevValues = new Map((d.locals || []).map((v) => [v.name, v.value]));
  if (d.crashed) toast(d.reason, 'error', 10000);
}

export function initDebugger() {
  panel.add({ id: 'debug', title: 'Debug', render(e) { el = h('div', { class: 'dbg' }); e.append(el); render(); } });
  call('state.get', { key: 'debug.breakpoints', fallback: {} }).then((saved) => {
    for (const [f, lines] of Object.entries(saved || {})) if (Array.isArray(lines) && lines.length) bps.set(f, lines);
    for (const t of tabs.list) if (t.view && t.file && bps.has(t.file)) setBreakpointLines(t.view, bps.get(t.file));
    for (const [f, lines] of bps) call('dbg.setBreakpoints', { file: f, lines }).catch(() => {});
    render();
  });
  call('state.get', { key: 'debug.watches', fallback: [] }).then((w) => { watches = Array.isArray(w) ? w : []; call('dbg.setWatches', { list: watches }).catch(() => {}); render(); });
  // a session from before a reload
  call('dbg.state').then((st) => { if (st.active) { session = { running: st.running, paused: st.paused }; if (st.paused) showPaused(st.paused); else render(); } }).catch(() => {});

  window.addEventListener('cpw-breakpoints', (e) => onEditorBreakpoints(e.detail.file, e.detail.lines));
  window.addEventListener('cpw-editor-opened', (e) => {
    const { file, view } = e.detail;
    if (bps.has(file)) setBreakpointLines(view, bps.get(file));
    if (session && session.paused && session.paused.file === file) setExecLine(view, session.paused.line);
  });

  on('dbg.started', (d) => { session = { running: true, paused: null, target: d.target }; prevValues = new Map(); status.set('debug', `Debugging ${d.target}`, { order: 20, side: 'left', onclick: () => panel.show('debug') }); render(); });
  on('dbg.running', () => { if (!session) return; session.running = true; clearExec(); status.set('debug', 'Debugging: running…', { order: 20, side: 'left', onclick: () => panel.show('debug') }); render(); });
  on('dbg.paused', showPaused);
  on('dbg.ended', (d) => {
    session = null;
    clearExec();
    status.set('debug', '');
    if (d.message) toast(d.message, d.code === 0 || d.code == null ? 'info' : 'error', 6000);
    render();
  });
  on('dbg.error', (d) => toast(`Debugger: ${d.message}`, 'error', 8000));

  command('debug.start', 'Debug: start (builds, then stops at your breakpoints or at main)', ['Ctrl+Shift+D'], start);
  command('debug.continue', 'Debug: continue', ['F5'], () => step('continue'), { priority: true, when: paused });
  command('debug.next', 'Debug: step over', ['F10'], () => step('next'), { priority: true, when: active });
  command('debug.step', 'Debug: step into', ['F11'], () => step('step'), { priority: true, when: active });
  command('debug.finish', 'Debug: step out', ['Shift+F11'], () => step('finish'), { priority: true, when: active });
  command('debug.toCursor', 'Debug: run to the cursor', ['Ctrl+F10'], runToCursor, { priority: true, when: paused });
  command('debug.stop', 'Debug: stop', ['Shift+F5'], () => call('dbg.stop'), { priority: true, when: active });
  command('debug.toggle', 'Add or remove a breakpoint on this line', ['Ctrl+F8'], () => { const t = activeEditor(); if (t) toggleBreakpoint(t.view); });
  command('debug.clearAll', 'Remove every breakpoint', [], () => {
    for (const f of [...bps.keys()]) { for (const v of viewsFor(f)) setBreakpointLines(v, []); onEditorBreakpoints(f, []); }
  });
  command('debug.panel', 'Debug panel', [], () => panel.show('debug'));
}

