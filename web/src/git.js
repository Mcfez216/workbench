// Git: what changed, staging by file or by hunk (git add -p, by clicking),
// commits (Signed-off-by if you want it), branches, the log, and format-patch.

import { call } from './rpc.js';
import { h, clear, toast, prompt, confirm, dialog, popupMenu, debounce, pathText } from './ui.js';
import { sidebar, tabs, command, runCommand, status } from './layout.js';
import { openFile } from './editor.js';
import { workspaceRoot } from './files.js';

let repo = null;        // top of the current repository
let viewEl = null;
let st = null;
let msgBox, signoff, amend;

const CODES = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', T: 'type changed', U: 'unmerged' };

async function findRepo() {
  const t = tabs.active();
  const from = t && t.file ? t.file.slice(0, t.file.lastIndexOf('/')) : workspaceRoot();
  if (!from) return null;
  const r = await call('git.root', { cwd: from });
  return r.root;
}

let refreshGen = 0;
export async function refreshGit() {
  const gen = ++refreshGen;
  const r = await findRepo().catch(() => null);
  repo = r || repo;
  if (!viewEl) { if (repo) updateStatusLine(); return; }
  let stErr = null, next = null;
  if (repo) { try { next = await call('git.status', { cwd: repo }); } catch (err) { stErr = err; } }
  if (gen !== refreshGen) return;          // a newer refresh is drawing
  clear(viewEl);
  if (!repo) {
    viewEl.append(h('p', { class: 'muted pad' }, 'This folder is not a git repository.'),
      h('div', { class: 'pad' }, h('button', { class: 'btn', type: 'button', onclick: async () => { await call('git.init', { cwd: workspaceRoot() }); refreshGit(); } }, 'git init here')));
    status.set('git', '');
    return;
  }
  if (stErr) { viewEl.append(h('p', { class: 'pad' }, stErr.message)); return; }
  st = next;
  updateStatusLine();

  const head = h('div', { class: 'side-title' },
    h('button', { class: 'linkish', type: 'button', title: 'Switch or create a branch', onclick: (e) => branchMenu(e) }, `branch: ${st.branch}`),
    h('span', { class: 'muted' }, st.upstream ? ` ${st.ahead ? '↑' + st.ahead : ''}${st.behind ? ' ↓' + st.behind : ''}` : ''),
    h('span', { class: 'side-tools' },
      h('button', { type: 'button', title: 'Log', onclick: () => openLog() }, 'Log'),
      h('button', { type: 'button', title: 'Refresh', onclick: () => refreshGit() }, '↻')));
  viewEl.append(head, h('div', { class: 'muted pad path', title: repo }, pathText(repo)));

  const section = (title, items, kind) => {
    if (!items.length) return;
    const all = h('button', { type: 'button', class: 'mini', title: kind === 'staged' ? 'Unstage all' : 'Stage all' }, kind === 'staged' ? '−all' : '+all');
    all.addEventListener('click', () => (kind === 'staged' ? call('git.unstage', { cwd: repo, paths: items.map((i) => i.path) }) : call('git.stage', { cwd: repo, paths: items.map((i) => i.path) })).then(refreshGit));
    viewEl.append(h('div', { class: 'git-head' }, h('span', {}, `${title} (${items.length})`), all));
    const ul = h('ul', { class: 'git-files' });
    for (const it of items) {
      const code = kind === 'untracked' ? '?' : it.code;
      const act = h('button', { type: 'button', class: 'mini', title: kind === 'staged' ? 'Unstage' : 'Stage' }, kind === 'staged' ? '−' : '+');
      act.addEventListener('click', (e) => { e.stopPropagation(); (kind === 'staged' ? call('git.unstage', { cwd: repo, paths: [it.path] }) : call('git.stage', { cwd: repo, paths: [it.path] })).then(refreshGit).catch((err) => toast(err.message, 'error')); });
      const row = h('button', { type: 'button', class: 'git-file', title: `${it.path} (${CODES[code] || 'new file'})` },
        h('span', { class: `gcode g-${code === '?' ? 'u' : code}` }, code), h('span', { class: 'name' }, it.path));
      row.addEventListener('click', () => openDiff(it.path, kind === 'staged'));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        popupMenu([
          { label: 'Show changes', run: () => openDiff(it.path, kind === 'staged') },
          { label: 'Open file', run: () => openFile(`${repo}/${it.path}`) },
          kind === 'unstaged' ? { label: 'Discard changes...', run: () => discard(it.path) } : null,
        ].filter(Boolean), e.clientX, e.clientY);
      });
      ul.append(h('li', {}, row, act));
    }
    viewEl.append(ul);
  };
  section('Conflicts', st.conflicted, 'unstaged');
  section('Staged', st.staged, 'staged');
  section('Changes', st.unstaged, 'unstaged');
  section('Untracked', st.untracked, 'untracked');
  // CMake's build/ and clangd's .cache/ are made by tools, not by you
  const noise = [...new Set(st.untracked.map((u) => (u.path.match(/^(build|\.cache)\//) || [])[1]).filter(Boolean))];
  if (noise.length) {
    const b = h('button', { class: 'btn small', type: 'button', title: 'They are made by CMake and clangd; they don\'t belong in git' }, `Ignore ${noise.map((n) => n + '/').join(' and ')} (.gitignore)`);
    b.addEventListener('click', async () => {
      const f = `${repo}/.gitignore`;
      let text = '';
      try { text = (await call('files.read', { file: f })).text; } catch (e) { /* no .gitignore yet */ }
      const add = noise.map((n) => n + '/').filter((n) => !text.split('\n').includes(n));
      await call('files.write', { file: f, text: (text && !text.endsWith('\n') ? text + '\n' : text) + add.join('\n') + '\n' });
      toast(`Added ${add.join(' ')} to .gitignore`, 'ok');
      refreshGit();
    });
    viewEl.append(h('div', { class: 'pad' }, b));
  }
  if (!st.staged.length && !st.unstaged.length && !st.untracked.length) viewEl.append(h('p', { class: 'muted pad' }, 'Nothing to commit, working tree clean.'));

  // commit box
  const prev = msgBox ? msgBox.value : '';
  msgBox = h('textarea', { class: 'field mono commit-msg', rows: 7, spellcheck: 'true', placeholder: 'subsystem: short summary in the imperative\n\nWhy this change is needed, wrapped at 72 columns.', 'aria-label': 'Commit message' });
  msgBox.value = prev;
  const ruler = h('div', { class: 'muted small' });
  const check = () => {
    const lines = msgBox.value.split('\n');
    const long = lines.findIndex((l, i) => (i === 0 ? l.length > 72 : l.length > 72));
    ruler.textContent = `subject ${lines[0].length}/72${lines.length > 1 && lines[1] !== '' ? ' · leave line 2 blank' : ''}${long > 0 ? ` · line ${long + 1} is over 72` : ''}`;
    ruler.classList.toggle('warn', lines[0].length > 72 || long > 0 || (lines.length > 1 && lines[1] !== ''));
  };
  msgBox.addEventListener('input', check);
  msgBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); doCommit(); } });
  check();
  signoff = h('input', { type: 'checkbox', checked: false });
  amend = h('input', { type: 'checkbox' });
  viewEl.append(h('div', { class: 'git-commit pad' }, msgBox, ruler,
    h('label', { class: 'check' }, signoff, ' Signed-off-by (-s)'),
    h('label', { class: 'check' }, amend, ' Amend the last commit'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', title: 'Ctrl+Enter', onclick: doCommit }, 'Commit'),
      h('button', { class: 'btn', type: 'button', onclick: formatPatch }, 'Format patch...'))));
}

function updateStatusLine() {
  if (!st) return;
  const n = st.staged.length + st.unstaged.length + st.untracked.length;
  status.set('git', `git:${st.branch}${n ? ` +${n}` : ''}`, { order: 40, title: `${repo}\n${st.staged.length} staged, ${st.unstaged.length} changed, ${st.untracked.length} untracked`, onclick: () => sidebar.show('git') });
}

async function doCommit() {
  try {
    const r = await call('git.commit', { cwd: repo, message: msgBox.value, signoff: signoff.checked, amend: amend.checked });
    msgBox.value = '';
    toast(r.output.split('\n')[0], 'ok', 5000);
    refreshGit();
    const log = tabs.get('git:log');
    if (log) log.refresh();
  } catch (err) { toast(err.message, 'error', 8000); }
}

async function discard(path) {
  if (!(await confirm('Discard changes', `Throw away your changes to ${path}? This can't be undone.`, 'Discard'))) return;
  await call('git.discard', { cwd: repo, paths: [path] });
  refreshGit();
}

async function branchMenu(e) {
  const list = await call('git.branches', { cwd: repo });
  const r = e.target.getBoundingClientRect();
  popupMenu([
    { label: 'New branch...', run: async () => {
      const name = await prompt('New branch', 'Branch name', '', { placeholder: 'fix-typo-in-foo', hint: 'Starts from where you are now and switches to it' });
      if (name) { await call('git.switch', { cwd: repo, name, create: true }).catch((err) => toast(err.message, 'error', 8000)); refreshGit(); }
    } },
    { sep: true },
    ...list.filter((b) => !b.name.includes('HEAD')).slice(0, 30).map((b) => ({
      label: (b.current ? '● ' : '  ') + b.name, keys: b.hash,
      run: async () => { if (!b.current) { await call('git.switch', { cwd: repo, name: b.name.replace(/^origin\//, '') }).catch((err) => toast(err.message, 'error', 8000)); refreshGit(); } },
    })),
  ], r.left, r.bottom);
}

// ------------------------------------------------------------------ diffs
function parseDiff(text) {
  // -> [{header: [...lines], hunks: [{head, lines}]}] per file
  const files = [];
  let f = null, hunk = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) { f = { header: [line], hunks: [] }; files.push(f); hunk = null; }
    else if (!f) continue;
    else if (line.startsWith('@@')) { hunk = { head: line, lines: [] }; f.hunks.push(hunk); }
    else if (hunk) hunk.lines.push(line);
    else f.header.push(line);
  }
  for (const fl of files) for (const hk of fl.hunks) while (hk.lines.length && hk.lines[hk.lines.length - 1] === '') hk.lines.pop();
  return files;
}

function diffLines(lines, cls = '') {
  return lines.map((l) => {
    const c = l[0] === '+' ? 'd-add' : l[0] === '-' ? 'd-del' : l.startsWith('@@') ? 'd-hunk' : l[0] === '\\' ? 'd-meta' : 'd-ctx';
    return h('div', { class: `dl ${c} ${cls}` }, l || ' ');
  });
}

export async function openDiff(path, staged) {
  const id = `git:diff:${staged ? 's' : 'u'}:${path}`;
  const t = tabs.open({
    id, kind: 'diff', title: `${staged ? 'Staged' : 'Diff'}: ${path.split('/').pop()}`, tooltip: path,
    render(el) { this.box = h('div', { class: 'diffview' }); el.append(this.box); this.refresh = () => renderDiff(this, path, staged); this.refresh(); },
    onShow() { if (this.refresh) this.refresh(); },
  });
  return t;
}

async function renderDiff(t, path, staged) {
  const { text } = await call('git.diff', { cwd: repo, file: path, staged });
  clear(t.box);
  const files = parseDiff(text);
  t.box.append(h('div', { class: 'toolbar' },
    h('span', {}, `${staged ? 'Staged changes' : 'Changes not staged yet'} in ${path}`),
    h('button', { class: 'btn', type: 'button', onclick: () => openFile(`${repo}/${path}`) }, 'Open file'),
    h('button', { class: 'btn', type: 'button', onclick: async () => { await call(staged ? 'git.unstage' : 'git.stage', { cwd: repo, paths: [path] }); refreshGit(); t.refresh(); } }, staged ? 'Unstage whole file' : 'Stage whole file')));
  if (!files.length) { t.box.append(h('p', { class: 'muted pad' }, staged ? 'Nothing staged in this file.' : 'No unstaged changes in this file.')); return; }
  const untracked = st && st.untracked.some((u) => u.path === path);
  for (const f of files) {
    t.box.append(h('div', { class: 'diff-file' }, diffLines(f.header, 'd-meta')));
    f.hunks.forEach((hk) => {
      const btn = untracked ? null : h('button', { type: 'button', class: 'mini' }, staged ? 'Unstage hunk' : 'Stage hunk');
      if (btn) btn.addEventListener('click', async () => {
        const patch = [...f.header, hk.head, ...hk.lines, ''].join('\n');
        try { await call('git.applyHunk', { cwd: repo, patch, reverse: staged }); refreshGit(); t.refresh(); }
        catch (err) { toast(err.message, 'error', 8000); }
      });
      t.box.append(h('div', { class: 'hunk' }, h('div', { class: 'hunk-head' }, h('span', { class: 'd-hunk' }, hk.head), btn), diffLines(hk.lines)));
    });
  }
}

// ------------------------------------------------------------------ log
async function openLog() {
  if (!repo) return toast('Not in a git repository');
  tabs.open({
    id: 'git:log', kind: 'log', title: 'Git log',
    render(el) {
      const split = h('div', { class: 'split' });
      this.list = h('div', { class: 'log-list' });
      this.show = h('div', { class: 'log-show' }, h('p', { class: 'muted pad' }, 'Click a commit to see it.'));
      split.append(this.list, this.show);
      el.append(split);
      this.refresh = async () => {
        const rows = await call('git.log', { cwd: repo });
        clear(this.list);
        for (const r of rows) {
          const b = h('button', { type: 'button', class: 'log-row', disabled: !r.hash },
            h('span', { class: 'graph' }, r.graph), r.hash ? [h('span', { class: 'hash' }, r.hash), ' ', r.refs ? h('span', { class: 'refs' }, r.refs + ' ') : null, h('span', { class: 'subj' }, r.subject), h('span', { class: 'muted' }, ` ${r.author}, ${r.when}`)] : null);
          if (r.hash) b.addEventListener('click', () => this.open(r.hash, b));
          this.list.append(b);
        }
      };
      this.open = async (hash, row) => {
        this.list.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        if (row) row.classList.add('sel');
        const { text } = await call('git.diff', { cwd: repo, commit: hash });
        clear(this.show);
        this.show.append(h('div', { class: 'diffview' }, diffLines(text.split('\n'))));
      };
      this.refresh();
    },
  });
}

// ------------------------------------------------------------------ format-patch
async function formatPatch() {
  const count = h('input', { class: 'field', type: 'number', min: 1, max: 50, value: 1, style: { width: '6em' } });
  const version = h('input', { class: 'field', type: 'number', min: 1, max: 20, value: 1, style: { width: '6em' } });
  const cover = h('input', { type: 'checkbox' });
  const r = await dialog({
    title: 'git format-patch',
    body: h('div', { class: 'form' },
      h('label', {}, 'How many commits (from HEAD back) ', count),
      h('label', {}, 'Version (v2, v3... for a resend) ', version),
      h('label', { class: 'check' }, cover, ' Cover letter (for a series)'),
      h('p', { class: 'muted small' }, 'Patches go in outgoing/ in the repository, ready for git send-email or to attach to a mail.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }],
  });
  if (!r) return;
  try {
    const out = await call('git.formatPatch', { cwd: repo, count: +count.value, version: +version.value, cover: cover.checked });
    toast(`Wrote ${out.files.length} file${out.files.length === 1 ? '' : 's'} to ${out.dir}`, 'ok', 6000);
    if (out.files[0]) openFile(out.files[out.files.length === 1 ? 0 : 1] || out.files[0]);
  } catch (err) { toast(err.message, 'error', 8000); }
}

export function initGit() {
  sidebar.add({
    id: 'git', title: 'Git', short: 'Git',
    render(el) { viewEl = h('div', { class: 'git-view' }); el.append(viewEl); refreshGit(); },
    onShow() { refreshGit(); },
  });
  const soon = debounce(refreshGit, 400);
  window.addEventListener('cpw-saved', soon);
  window.addEventListener('focus', soon);
  command('git.show', 'Git', ['F6'], () => { sidebar.show('git'); });
  command('git.log', 'Git log', [], openLog);
  command('git.commit', 'Commit...', [], () => { sidebar.show('git'); setTimeout(() => msgBox && msgBox.focus(), 50); });
  command('git.formatPatch', 'Format patch...', [], formatPatch);
  command('git.refresh', 'Refresh git status', [], refreshGit);
}
