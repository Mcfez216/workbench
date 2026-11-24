// Comfort: the parts of the app that work with an ADHD / autistic brain
// rather than against it. All optional, all in Settings → Comfort.
//
//   Focus mode      one task on screen, a timer you chose, nothing else
//                   (Ctrl+Shift+G). Messages wait. When time's up it asks,
//                   gently; a break has a countdown and a few ideas.
//   Break reminder  after N minutes of work, a "take a break?" (for when
//                   hyperfocus eats the afternoon)
//   Where was I?    the last file and line, the last build or test, the
//                   exercise you were on, and the note you left yourself,
//                   when you come back after a while
//   Quiet           messages go to the inbox (✉ on the status line), not
//                   pop-ups; reduced motion; calmer spacing; a readable font

import { call } from './rpc.js';
import { h, toast, dialog, setQuiet, onInbox, inboxMessages, clearInbox, choices, relTime, pathText } from './ui.js';
import { status, command, runCommand } from './layout.js';
import { activeEditor, openFile, goTo } from './editor.js';

let cfg = null;
export function applyComfort(c) {
  cfg = c;
  const k = c.comfort || {};
  const root = document.documentElement;
  root.classList.toggle('reduce-motion', !!k.reduceMotion);
  root.classList.toggle('spacing-relaxed', k.spacing === 'relaxed');
  root.classList.toggle('reading-font', k.readingFont === 'readable');
  setQuiet('settings', !!k.quiet);
  window.dispatchEvent(new CustomEvent('cpw-comfort', { detail: k }));
  scheduleBreakReminder();
}

// ------------------------------------------------------------------ the inbox
function showInbox() {
  const list = inboxMessages();
  dialog({
    title: `Messages (${list.length})`, width: '56em',
    body: h('div', { class: 'inbox' }, list.length ? list.map((m) => h('div', { class: `inbox-row ${m.kind}` }, h('span', { class: 'muted' }, relTime(new Date(m.at).toISOString())), h('span', {}, m.text)))
      : h('p', { class: 'muted' }, 'Nothing waiting.')),
    buttons: [{ label: 'Clear', value: 'clear' }, { label: 'Close', value: null, primary: true }],
  }).then((v) => { if (v === 'clear') clearInbox(); });
}
onInbox((list) => status.set('inbox', list.length ? `✉ ${list.length}` : '', { order: 70, title: 'Messages that waited quietly (click to read)', onclick: showInbox }));

// ------------------------------------------------------------------ focus mode
let focus = null;   // { task, end, minutes, timer, paused, startedAt, workedMs }
const bar = () => document.querySelector('.focus-bar');
function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

async function startFocus() {
  if (focus) return endFocus();
  const where = await call('state.get', { key: 'where.exercise', fallback: null });
  const next = await call('state.get', { key: 'where.next', fallback: '' });
  const guess = next || (where && where.title ? `${where.title}${where.step !== undefined ? `, step ${where.step + 1}` : ''}` : '');
  const task = h('input', { class: 'field', type: 'text', value: guess, placeholder: 'e.g. make step 2 of Pointers pass', spellcheck: 'true', id: 'focus-task' });
  const mins = choices([[10, 'Just 10 minutes'], [25, '25 minutes'], [45, '45 minutes'], [0, 'No timer']], (cfg && cfg.focus && cfg.focus.minutes) || 25, { label: 'How long' });
  const ok = await dialog({
    title: 'Focus', width: '46em',
    body: h('div', { class: 'form dialog-form' },
      h('label', { for: 'focus-task' }, 'The one thing'), task,
      h('label', {}, 'For'), mins,
      h('div', { class: 'full hint small muted' }, 'Everything except the editor and this task hides; messages wait in the inbox. Ctrl+Shift+G again (or Done) brings it all back. "Just 10 minutes" is a fine way to start something you\'ve been putting off.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Start', value: true, primary: true }],
  });
  if (!ok) return;
  const minutes = +mins.value;
  focus = { task: task.value.trim() || 'Focus', minutes, end: minutes ? Date.now() + minutes * 60000 : null, startedAt: Date.now(), paused: null };
  document.documentElement.classList.add('focus-mode');
  setQuiet('focus', true);
  const b = h('div', { class: 'focus-bar', role: 'status' },
    h('span', { class: 'fb-dot', 'aria-hidden': 'true' }, '◎'), h('span', { class: 'fb-task' }, focus.task), h('span', { class: 'fb-time' }),
    h('button', { type: 'button', class: 'fb-btn', title: 'Pause the timer', onclick: togglePause }, 'Pause'),
    minutes ? h('button', { type: 'button', class: 'fb-btn', title: 'Five more minutes', onclick: () => { if (focus && focus.end) { focus.end += 5 * 60000; tick(); } } }, '+5') : null,
    h('button', { type: 'button', class: 'fb-btn primary', title: 'Finish (Ctrl+Shift+G)', onclick: () => endFocus() }, 'Done'));
  document.getElementById('app').prepend(b);
  focus.timer = setInterval(tick, 1000);
  tick();
  window.dispatchEvent(new Event('resize'));
}
function togglePause() {
  if (!focus) return;
  if (focus.paused) { if (focus.end) focus.end += Date.now() - focus.paused; focus.paused = null; }
  else focus.paused = Date.now();
  const btn = bar() && bar().querySelector('.fb-btn');
  if (btn) btn.textContent = focus.paused ? 'Resume' : 'Pause';
  tick();
}
function tick() {
  if (!focus) return;
  const t = bar() && bar().querySelector('.fb-time');
  const now = focus.paused || Date.now();
  if (t) t.textContent = focus.end ? `${fmt(focus.end - now)} left${focus.paused ? ' (paused)' : ''}` : `${fmt(now - focus.startedAt)}${focus.paused ? ' (paused)' : ''}`;
  if (focus.end && !focus.paused && Date.now() >= focus.end) timeUp();
}
async function timeUp() {
  const f = focus;
  clearInterval(f.timer);
  f.paused = Date.now();
  const brk = (cfg && cfg.focus && cfg.focus.breakMinutes) || 5;
  const r = await dialog({
    title: 'Time\'s up', width: '42em',
    body: h('div', {}, h('p', {}, `${f.minutes} minutes on: ${f.task}.`), h('p', {}, 'A break now keeps the next round good. Or keep going, if you\'re in the middle of something.'),
      h('p', { class: 'muted small' }, 'Before you go: anything to remember for when you come back? (It shows up in "Where was I?")'),
      h('input', { class: 'field', type: 'text', id: 'focus-next', placeholder: 'Next I\'ll...', style: { width: '100%' } })),
    buttons: [{ label: 'Finish', value: 'done' }, { label: '10 more minutes', value: 'more' }, { label: `${brk} minute break`, value: 'break', primary: true }],
    onOpen(box) { box.querySelector('#focus-next').value = ''; },
  });
  const note = document.getElementById('focus-next');
  if (note && note.value.trim()) call('state.set', { key: 'where.next', value: note.value.trim() });
  if (r === 'more') { f.end = Date.now() + 10 * 60000; f.paused = null; f.timer = setInterval(tick, 1000); tick(); return; }
  await endFocus(true);
  if (r === 'break') takeBreak(brk);
}
async function endFocus(quietly) {
  if (!focus) return;
  clearInterval(focus.timer);
  const worked = (focus.paused || Date.now()) - focus.startedAt;
  call('progress.minutes', { minutes: worked / 60000 });
  focus = null;
  document.documentElement.classList.remove('focus-mode');
  setQuiet('focus', false);
  if (bar()) bar().remove();
  window.dispatchEvent(new Event('resize'));
  if (!quietly && worked > 60000) toast(`Focused for ${Math.round(worked / 60000)} minutes.`, 'ok');
  lastBreakAt = Date.now();
}

// A break: a calm screen, a countdown, a few ideas
function takeBreak(minutes) {
  const ideas = ['Stand up and stretch', 'Drink some water', 'Look at something far away for 20 seconds', 'Walk to another room and back', 'A few slow breaths', 'Nothing at all: that counts too'];
  const pick = ideas.sort(() => Math.random() - 0.5).slice(0, 3);
  const end = Date.now() + minutes * 60000;
  const left = h('div', { class: 'break-time' });
  const veil = h('div', { class: 'break-veil', role: 'dialog', 'aria-label': 'Break' },
    h('div', { class: 'break-box' }, h('h2', {}, 'Break'), left, h('ul', {}, pick.map((x) => h('li', {}, x))),
      h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Back to work')));
  const t = setInterval(() => { const ms = end - Date.now(); left.textContent = fmt(ms); if (ms <= 0) { close(); toast('Break\'s over. Whenever you\'re ready.', 'ok', 6000); } }, 1000);
  function close() { clearInterval(t); veil.remove(); lastBreakAt = Date.now(); }
  left.textContent = fmt(end - Date.now());
  document.body.append(veil);
}

// ------------------------------------------------------------------ break reminder
let lastBreakAt = Date.now(), lastActivity = Date.now(), reminderTimer = null;
['keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, () => {
  // a long gap (10 minutes or more) means you already had a break
  if (Date.now() - lastActivity > 10 * 60000) lastBreakAt = Date.now();
  lastActivity = Date.now();
}, true));
function scheduleBreakReminder() {
  clearInterval(reminderTimer);
  const mins = cfg && cfg.comfort && +cfg.comfort.breakReminder;
  if (!mins) return;
  reminderTimer = setInterval(() => {
    if (focus || document.querySelector('.break-veil, .veil')) return;
    if (Date.now() - lastBreakAt >= mins * 60000 && Date.now() - lastActivity < 60000) {
      lastBreakAt = Date.now();
      dialog({ title: 'Break?', body: h('div', {}, h('p', {}, `You've been at it for ${mins} minutes.`), h('p', { class: 'muted' }, 'A few minutes away usually makes the next part easier.')),
        buttons: [{ label: 'Not now', value: false }, { label: 'Take a break', value: true, primary: true }] }).then((v) => { if (v) takeBreak((cfg.focus && cfg.focus.breakMinutes) || 5); });
    }
  }, 30000);
}

// ------------------------------------------------------------------ where was I?
// Kept up to date quietly; shown on the start screen, by Learn → Where was I?,
// and by itself when you come back after a few hours.
export function rememberRun(text, ok) { call('state.set', { key: 'where.run', value: { text, ok, at: Date.now() } }); }
function rememberCursor() {
  const t = activeEditor();
  if (!t) return;
  const line = t.view.state.doc.lineAt(t.view.state.selection.main.head).number;
  call('state.set', { key: 'where.file', value: { file: t.file, line, at: Date.now() } });
}
export async function whereWasI() {
  const [file, run, ex, next] = await Promise.all(['where.file', 'where.run', 'where.exercise', 'where.next'].map((key) => call('state.get', { key, fallback: null })));
  return { file, run, ex, next };
}
export function whereBox(w, { onNote } = {}) {
  const rows = [];
  if (w.ex && w.ex.id) rows.push(h('button', { type: 'button', class: 'list-row', onclick: () => runCommand('exercise.open', w.ex.id) }, h('span', {}, 'Exercise'), h('span', { class: 'grow' }, `${w.ex.title || w.ex.id}${w.ex.step !== undefined ? `, step ${w.ex.step + 1}` : ''}`)));
  if (w.file && w.file.file) rows.push(h('button', { type: 'button', class: 'list-row', onclick: async () => { const t = await openFile(w.file.file); if (t) goTo(t.view, w.file.line); } }, h('span', {}, 'File'), h('span', { class: 'grow' }, `${w.file.file.split('/').pop()}, line ${w.file.line}`), h('span', { class: 'muted path' }, pathText(w.file.file.replace(/\/[^/]+$/, '')))));
  if (w.run && w.run.text) rows.push(h('div', { class: 'list-row' }, h('span', {}, 'Last run'), h('span', { class: 'grow ' + (w.run.ok ? 'ok' : 'error') }, w.run.text), h('span', { class: 'muted' }, relTime(new Date(w.run.at).toISOString()))));
  const note = h('input', { class: 'field', type: 'text', value: w.next || '', placeholder: 'A note to future you: "next I\'ll..."', spellcheck: 'true', 'aria-label': 'Note for next time' });
  note.addEventListener('change', () => { call('state.set', { key: 'where.next', value: note.value.trim() }); if (onNote) onNote(note.value.trim()); });
  return h('div', { class: 'where' }, rows.length ? rows : h('p', { class: 'muted' }, 'Nothing yet: it fills in as you work.'), h('div', { class: 'where-note' }, h('span', { class: 'muted' }, 'Next:'), note));
}
async function showWhere() {
  const w = await whereWasI();
  dialog({ title: 'Where was I?', width: '56em', body: whereBox(w), buttons: [{ label: 'OK', value: true, primary: true }] });
}

export function initComfort() {
  command('focus.toggle', 'Focus mode (one task, a timer, nothing else)', ['Ctrl+Shift+G'], startFocus);
  command('focus.break', 'Take a break now', [], () => takeBreak((cfg && cfg.focus && cfg.focus.breakMinutes) || 5));
  command('help.where', 'Where was I?', [], showWhere);
  command('app.inbox', 'Messages that waited (inbox)', [], showInbox);
  // keep "where was I" current
  let t = null;
  window.addEventListener('cpw-editor-update', () => { clearTimeout(t); t = setTimeout(rememberCursor, 2000); });
  window.addEventListener('cpw-saved', rememberCursor);
  window.addEventListener('beforeunload', () => { rememberCursor(); call('state.set', { key: 'where.lastSeen', value: Date.now() }); });
  setInterval(() => call('state.set', { key: 'where.lastSeen', value: Date.now() }), 60000);
  // back after a while (3 hours or more): say where you were, once
  call('state.get', { key: 'where.lastSeen', fallback: null }).then((last) => {
    if (last && Date.now() - last > 3 * 3600000 && (!cfg || !cfg.comfort || cfg.comfort.whereOnStart !== false)) setTimeout(showWhere, 1500);
  });
}
