// Good habits, made easy:
//   Checkpoints   one button saves everything as it is (git, without the
//                 staging); "go back" returns to any checkpoint, after saving
//                 the present one, so nothing is ever lost
//   Journal       JOURNAL.md in the project: today's heading, Did / Learned /
//                 Stuck on / Next. The Next line is what "Where was I?" shows
//   Tests         a test file for the function under the cursor, added to
//                 CMake when the project has one

import { call } from './rpc.js';
import { h, toast, confirm, prompt, pathText, relTime } from './ui.js';
import { tabs, command } from './layout.js';
import { activeEditor, openFile } from './editor.js';
import { functionAt } from './outline.js';

async function where() {
  const t = activeEditor();
  if (t) {
    const r = await call('cmake.root', { file: t.file });
    return r.root || t.file.replace(/\/[^/]+$/, '');
  }
  const { workspaceRoot } = await import('./files.js');
  return workspaceRoot();
}
async function lastStatus() {
  const run = await call('state.get', { key: 'where.run', fallback: null });
  if (!run || Date.now() - run.at > 3600000) return 'unknown';
  return run.ok ? 'green' : 'red';
}

async function saveCheckpoint() {
  for (const t of tabs.list) if (t.file && t.dirty) await t.save();
  const cwd = await where();
  if (!cwd) return toast('Open a file or a folder first');
  const note = await prompt('Save a checkpoint', 'What is it? (optional)', '', { placeholder: 'e.g. step 2 passes', hint: 'Everything in the project is saved as it is now. You can come back to it any time (Checkpoints → Go back).' });
  if (note === null) return;
  const status = await lastStatus();
  let r = await call('git.checkpoint', { cwd, note, status });
  if (r.needRepo) {
    if (!(await confirm('Start keeping checkpoints', `${pathText(cwd)} isn't a git repository yet. Make it one, so checkpoints can be kept? (A hidden .git folder; your files don't change.)`, 'Yes, start'))) return;
    r = await call('git.checkpoint', { cwd, note, status, init: true });
  }
  if (r.nothing) return toast('Nothing changed since the last checkpoint.', 'info');
  toast(`Checkpoint ${r.hash} saved${status === 'green' ? ' (everything passing)' : ''}.`, 'ok');
  window.dispatchEvent(new CustomEvent('cpw-git'));
}

async function goBack() {
  const cwd = await where();
  const r = await call('git.checkpoints', { cwd });
  if (!r.root || !r.list.length) return toast('No checkpoints here yet: save one first.');
  const { pickFromList } = await import('./newstuff.js');
  const hash = await pickFromList('Go back to...', r.list.map((c) => ({
    label: `${c.status === 'green' ? '✓ ' : c.status === 'red' ? '✗ ' : ''}${c.subject}`,
    hint: `${relTime(new Date(c.time).toISOString())} · ${c.hash}`, value: c.hash,
  })));
  if (!hash) return;
  if (!(await confirm('Go back', `Put every file back as it was at ${hash}? What you have now is saved as a checkpoint first, so you can come forward again.`, 'Go back'))) return;
  const g = await call('git.goBack', { cwd, hash });
  // open files show what's on disk now
  for (const t of tabs.list) if (t.file && t.file.startsWith(g.root + '/')) {
    const st = await call('files.stat', { file: t.file });
    if (!st.exists) await tabs.close(t.id, true);
    else if (t.view) { const res = await call('files.read', { file: t.file }); t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: res.text } }); t.mtime = res.mtime; t.savedDoc = t.view.state.doc; tabs.setDirty(t.id, false); }
  }
  toast(`Back at ${hash}. (Where you were is checkpoint ${g.saved || 'saved'}.)`, 'ok', 7000);
  window.dispatchEvent(new CustomEvent('cpw-git'));
}

// ------------------------------------------------------------------ journal
async function journal() {
  const root = await where();
  if (!root) return toast('Open a file or a folder first');
  const file = `${root}/JOURNAL.md`;
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const st = await call('files.stat', { file });
  let text = st.exists ? (await call('files.read', { file })).text : `# Journal: ${root.split('/').pop()}\n\nA few lines a day: what you did, what you learned, where you got stuck, what\'s next.\nThe "Next" line shows up in "Where was I?".\n`;
  if (!text.includes(`## ${day}`)) {
    text = text.replace(/\s*$/, '\n') + `\n## ${day}\n\n- Did: \n- Learned: \n- Stuck on: \n- Next: \n`;
    await call('files.write', { file, text });
  }
  const t = await openFile(file, { side: 'right' });
  if (t && t.view) {
    const pos = t.view.state.doc.toString().lastIndexOf('- Did: ');
    if (pos >= 0) t.view.dispatch({ selection: { anchor: pos + 7 }, scrollIntoView: true });
  }
}
// the last "Next:" in a journal becomes the note in "Where was I?"
window.addEventListener('cpw-saved', async (e) => {
  if (!/\/JOURNAL\.md$/.test(e.detail.file)) return;
  const { text } = await call('files.read', { file: e.detail.file });
  const nexts = [...text.matchAll(/^- Next:[ \t]*(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
  if (nexts.length) call('state.set', { key: 'where.next', value: nexts[nexts.length - 1] });
});

// ------------------------------------------------------------------ a test for this function
async function testForFunction() {
  const t = activeEditor();
  if (!t) return toast('Open the file with the function in it');
  const f = functionAt(t.view);
  if (!f) return toast('Put the cursor inside the function you want to test');
  const r = await call('project.testFor', { file: t.file, func: f.name, signature: f.signature });
  await openFile(r.file);
  toast(r.existed ? 'That test file is already there.' : `Made ${r.file.split('/').pop()}${r.cmake ? ', and added it to CMakeLists.txt (F9 builds it, F7 runs it)' : ': compile it together with the file it tests'}.`, 'ok', 8000);
}

export function initHabits() {
  command('git.checkpoint', 'Save a checkpoint', [], saveCheckpoint);
  command('git.goBack', 'Go back to a checkpoint...', [], goBack);
  command('journal.open', 'Project journal (today)', [], journal);
  command('test.forFunction', 'Write a test for this function', [], testForFunction);
  void h;
}
