'use strict';
// Git, through the real git command, so your own ~/.gitconfig (name, email,
// signoff, diff settings) all apply.

const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { expand } = require('./config');

function git(cwd, args, { input, allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: expand(cwd), env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } });
    let out = '', err = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `git is not installed (${require('./distro').installHint('git')})` : e.message)));
    child.on('close', (code) => {
      if (code !== 0 && !allowFail) return reject(new Error((err || out).trim() || `git ${args[0]} failed (${code})`));
      resolve({ code, out, err });
    });
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}

async function root({ cwd }) {
  const r = await git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  return r.code === 0 ? { root: r.out.trim() } : { root: null };
}

// porcelain v2: one record per changed file, NUL-separated
async function status({ cwd }) {
  const { out } = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
  const res = { branch: '', upstream: '', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], conflicted: [] };
  const recs = out.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (!r) continue;
    if (r.startsWith('# branch.head ')) res.branch = r.slice(14);
    else if (r.startsWith('# branch.upstream ')) res.upstream = r.slice(18);
    else if (r.startsWith('# branch.ab ')) { const m = r.match(/\+(\d+) -(\d+)/); if (m) { res.ahead = +m[1]; res.behind = +m[2]; } }
    else if (r[0] === '1' || r[0] === '2') {
      const parts = r.split(' ');
      const xy = parts[1];
      const file = r[0] === '1' ? parts.slice(8).join(' ') : parts.slice(9).join(' ');
      const orig = r[0] === '2' ? recs[++i] : undefined;
      if (xy[0] !== '.') res.staged.push({ path: file, code: xy[0], orig });
      if (xy[1] !== '.') res.unstaged.push({ path: file, code: xy[1] });
    } else if (r[0] === 'u') res.conflicted.push({ path: r.split(' ').slice(10).join(' ') });
    else if (r[0] === '?') res.untracked.push({ path: r.slice(2) });
  }
  return res;
}

async function diff({ cwd, file, staged, commit, context = 3 }) {
  const args = commit ? ['show', '--stat', '--patch', '--format=fuller', `-U${context}`, commit]
    : ['diff', `-U${context}`, ...(staged ? ['--cached'] : []), '--', ...(file ? [file] : [])];
  const { out } = await git(cwd, args, { allowFail: !!file });
  if (!out && file && !staged) {
    // untracked file: show it as all-new (a tracked file with no changes left
    // after a commit shows nothing)
    const tracked = await git(cwd, ['ls-files', '--error-unmatch', '--', file], { allowFail: true });
    if (tracked.code === 0) return { text: '' };
    const r = await git(cwd, ['diff', '--no-index', '--', '/dev/null', file], { allowFail: true });
    return { text: r.out };
  }
  return { text: out };
}

async function stage({ cwd, paths }) { await git(cwd, ['add', '--', ...paths]); return true; }
async function unstage({ cwd, paths }) { await git(cwd, ['restore', '--staged', '--', ...paths]); return true; }
async function discard({ cwd, paths }) { await git(cwd, ['restore', '--', ...paths]); return true; }

// Stage or unstage one hunk: the "git add -p" habit, by clicking.
async function applyHunk({ cwd, patch, reverse }) {
  const args = ['apply', '--cached', '--whitespace=nowarn', ...(reverse ? ['--reverse'] : []), '-'];
  await git(cwd, args, { input: patch });
  return true;
}

async function commit({ cwd, message, signoff = true, amend = false }) {
  if (!message.trim() && !amend) throw new Error('Write a commit message first');
  const args = ['commit', '-F', '-', ...(signoff ? ['--signoff'] : []), ...(amend ? ['--amend'] : [])];
  const r = await git(cwd, args, { input: message });
  return { output: r.out.trim() };
}

async function log({ cwd, limit = 300, file }) {
  const fmt = '%x1f%h%x1f%an%x1f%ar%x1f%d%x1f%s';
  const args = ['log', '--graph', `--format=${fmt}`, `-n${limit}`, '--all', '--color=never', ...(file ? ['--', file] : [])];
  const { out } = await git(cwd, args, { allowFail: true });
  return out.split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf('\x1f');
    if (i < 0) return { graph: line };
    const [graph, hash, author, when, refs, subject] = line.split('\x1f');
    return { graph, hash, author, when, refs: refs.trim(), subject };
  });
}

async function branches({ cwd }) {
  const { out } = await git(cwd, ['branch', '--all', '--format=%(HEAD)%1f%(refname:short)%1f%(objectname:short)%1f%(contents:subject)'], { allowFail: true });
  return out.split('\n').filter(Boolean).map((l) => {
    const [head, name, hash, subject] = l.split('\x1f');
    return { current: head === '*', name, hash, subject };
  });
}

async function switchBranch({ cwd, name, create, start }) {
  await git(cwd, create ? ['switch', '-c', name, ...(start ? [start] : [])] : ['switch', name]);
  return true;
}

async function formatPatch({ cwd, count = 1, version, cover, outDir }) {
  const dir = outDir || path.join(expand(cwd), 'outgoing');
  const args = ['format-patch', `-${count}`, '-o', dir, ...(cover ? ['--cover-letter'] : []), ...(version && version > 1 ? [`-v${version}`] : [])];
  const { out } = await git(cwd, args);
  return { files: out.split('\n').filter(Boolean), dir };
}

// Apply a mail (a patch) as a commit, with 3-way merge on conflicts.
async function am({ cwd, mbox }) {
  const tmp = path.join(os.tmpdir(), `cpw-am-${Date.now()}.eml`);
  fs.writeFileSync(tmp, mbox);
  try {
    const r = await git(cwd, ['am', '-3', tmp], { allowFail: true });
    if (r.code !== 0) {
      await git(cwd, ['am', '--abort'], { allowFail: true });
      throw new Error(`git am failed and was rolled back:\n${(r.out + r.err).trim()}`);
    }
    return { output: r.out.trim() };
  } finally { fs.rmSync(tmp, { force: true }); }
}

async function init_({ cwd }) { await git(cwd, ['init']); return true; }

function init(api) {
  api.register('git.root', root);
  api.register('git.status', status);
  api.register('git.diff', diff);
  api.register('git.stage', stage);
  api.register('git.unstage', unstage);
  api.register('git.discard', discard);
  api.register('git.applyHunk', applyHunk);
  api.register('git.commit', commit);
  api.register('git.log', log);
  api.register('git.branches', branches);
  api.register('git.switch', switchBranch);
  api.register('git.formatPatch', formatPatch);
  api.register('git.am', am);
  api.register('git.init', init_);
}

module.exports = { init, git, am };
