'use strict';
// Files: browse, read, write, create, rename, trash, a quick-open index,
// and copying the vault's _code folder out to your workspace.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { expand } = require('./config');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '__pycache__', '.ccls-cache', '.clangd', 'build', '_deps', 'CMakeFiles']);
const MAX_READ = 8 * 1024 * 1024;

function abs(p) {
  const e = expand(p);
  if (!e || !path.isAbsolute(e)) throw new Error(`Not an absolute path: ${p}`);
  return path.normalize(e);
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

async function list({ dir, hidden = false }) {
  const d = abs(dir);
  const ents = await fsp.readdir(d, { withFileTypes: true });
  const out = [];
  for (const e of ents) {
    if (!hidden && e.name.startsWith('.')) continue;
    let type = e.isDirectory() ? 'dir' : e.isFile() ? 'file' : e.isSymbolicLink() ? 'link' : 'other';
    if (type === 'link') {
      try { type = (await fsp.stat(path.join(d, e.name))).isDirectory() ? 'dir' : 'file'; } catch (err) { type = 'file'; }
    }
    out.push({ name: e.name, path: path.join(d, e.name), type });
  }
  out.sort((a, b) => (a.type === 'dir') !== (b.type === 'dir') ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
  return out;
}

async function read({ file }) {
  const f = abs(file);
  const st = await fsp.stat(f);
  if (st.size > MAX_READ) throw new Error(`${path.basename(f)} is ${Math.round(st.size / 1e6)} MB, too big to open here`);
  const buf = await fsp.readFile(f);
  if (looksBinary(buf)) throw new Error(`${path.basename(f)} looks like a binary file`);
  return { file: f, text: buf.toString('utf8'), mtime: st.mtimeMs };
}

async function write({ file, text, expectMtime }) {
  const f = abs(file);
  if (expectMtime) {
    try {
      const st = await fsp.stat(f);
      if (Math.abs(st.mtimeMs - expectMtime) > 1) {
        const e = new Error(`${path.basename(f)} changed on disk since you opened it`);
        e.code = 'CONFLICT';
        throw e;
      }
    } catch (err) { if (err.code === 'CONFLICT') throw err; }
  }
  await fsp.mkdir(path.dirname(f), { recursive: true });
  // Write through a temp file so a crash never leaves half a file behind,
  // keeping the original's permissions (scripts stay executable).
  let mode;
  try { mode = (await fsp.stat(f)).mode; } catch (e) { /* new file */ }
  const tmp = path.join(path.dirname(f), `.${path.basename(f)}.cpw-${process.pid}`);
  await fsp.writeFile(tmp, text, mode ? { mode } : undefined);
  await fsp.rename(tmp, f);
  return { file: f, mtime: (await fsp.stat(f)).mtimeMs };
}

async function stat({ file }) {
  try {
    const st = await fsp.stat(abs(file));
    return { exists: true, type: st.isDirectory() ? 'dir' : 'file', mtime: st.mtimeMs, size: st.size };
  } catch (e) { return { exists: false }; }
}

async function create({ file, dir }) {
  if (dir) { await fsp.mkdir(abs(dir), { recursive: true }); return { path: abs(dir) }; }
  const f = abs(file);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const h = await fsp.open(f, 'wx');   // fails if it already exists
  await h.close();
  return { path: f };
}

async function rename({ from, to }) {
  const a = abs(from), b = abs(to);
  if (fs.existsSync(b)) throw new Error(`${path.basename(b)} already exists`);
  await fsp.rename(a, b);
  return { path: b };
}

// Never rm: move to the desktop trash, so a slip is recoverable.
// (Windows: the Recycle Bin, through .NET's VisualBasic file helpers.)
const PS_RECYCLE = 'Add-Type -AssemblyName Microsoft.VisualBasic; $f = $env:CPW_TRASH; '
  + 'if (Test-Path -LiteralPath $f -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($f, \'OnlyErrorDialogs\', \'SendToRecycleBin\') } '
  + 'else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($f, \'OnlyErrorDialogs\', \'SendToRecycleBin\') }';
function trash({ file }) {
  const f = abs(file);
  if (require('./platform').WIN) {
    return new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_RECYCLE], { env: { ...process.env, CPW_TRASH: f }, windowsHide: true },
        (err, so, se) => err ? reject(new Error(`Couldn't move it to the Recycle Bin: ${se || err.message}`)) : resolve({ ok: true }));
    });
  }
  return new Promise((resolve, reject) => {
    execFile('gio', ['trash', f], (err, so, se) => err ? reject(new Error(`Couldn't move to trash: ${se || err.message}`)) : resolve({ ok: true }));
  });
}

async function index({ root, limit = 30000 }) {
  const r = abs(root);
  const out = [];
  async function walk(d, depth) {
    if (out.length >= limit || depth > 12) return;
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (out.length >= limit) return;
      if (e.name.startsWith('.') && e.name !== '.clangd') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(p, depth + 1); }
      else if (e.isFile()) out.push(path.relative(r, p));
    }
  }
  await walk(r, 0);
  return { root: r, files: out, truncated: out.length >= limit };
}

// Search file contents with ripgrep when it's there, grep otherwise.
function grep({ root, query, limit = 400 }) {
  const r = abs(root);
  return new Promise((resolve) => {
    const useRg = true;
    const args = useRg
      ? ['--line-number', '--column', '--no-heading', '--color', 'never', '--max-count', '50', '--fixed-strings', '--smart-case', '--', query, r]
      : ['-rnIF', '--exclude-dir=.git', '--', query, r];
    execFile(useRg ? 'rg' : 'grep', args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err && err.code === 'ENOENT' && useRg) {
        return execFile('grep', ['-rnIF', '--exclude-dir=.git', '--', query, r], { maxBuffer: 16 * 1024 * 1024 }, (e2, so) => resolve(parseGrep(so, limit)));
      }
      resolve(parseGrep(stdout, limit));
    });
  });
}
function parseGrep(text, limit) {
  const hits = [];
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^(.*?):(\d+):(?:(\d+):)?(.*)$/);
    if (m) hits.push({ file: m[1], line: +m[2], col: m[3] ? +m[3] : 1, text: m[4].slice(0, 300) });
    if (hits.length >= limit) break;
  }
  return hits;
}

// "Copy the vault's code to ~/cpp-path": everything under _code, without
// ever overwriting a file that's already there (your work wins), and
// without a stale build/ folder.
async function copyDir({ from, to }) {
  const a = abs(from), b = abs(to);
  if (!fs.existsSync(a)) throw new Error(`${a} doesn't exist`);
  if (b === a || b.startsWith(a + path.sep)) throw new Error('Copy it somewhere outside the vault');
  let copied = 0, kept = 0;
  async function walk(src, dst) {
    await fsp.mkdir(dst, { recursive: true });
    for (const e of await fsp.readdir(src, { withFileTypes: true })) {
      if (e.name === 'build' || e.name === '.git' || e.name === 'node_modules') continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) await walk(s, d);
      else if (e.isFile()) {
        if (fs.existsSync(d)) { kept++; continue; }
        await fsp.copyFile(s, d);
        const mode = (await fsp.stat(s)).mode;
        if (mode & 0o111) await fsp.chmod(d, mode & 0o777);
        copied++;
      }
    }
  }
  await walk(a, b);
  // CMake's build/ and clangd's index don't belong in git
  let gitignore = false;
  if (!fs.existsSync(path.join(b, '.gitignore'))) {
    await fsp.writeFile(path.join(b, '.gitignore'), '# made by MHDE when it copied the vault\'s code\nbuild/\n.cache/\n');
    gitignore = true;
  }
  return { to: b, copied, kept, gitignore };
}

function init(api) {
  api.register('files.copyDir', copyDir);
  api.register('files.list', list);
  api.register('files.read', read);
  api.register('files.write', write);
  api.register('files.stat', stat);
  api.register('files.create', create);
  api.register('files.rename', rename);
  api.register('files.trash', trash);
  api.register('files.index', index);
  api.register('files.grep', grep);
}

module.exports = { init, abs };
