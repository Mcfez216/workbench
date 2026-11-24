'use strict';
// Guides: your notes vaults (the CPP-Path vault, a C one, any folder of
// Markdown notes), several at once, read straight from their folders so the
// app always shows your current notes. Rendering happens in the window.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('./config');

// Every vault in Settings, in order. A vault is any folder of Markdown notes
// (an Obsidian vault, or part of one): the CPP-Path vault, a C one, your own.
function vaultList() {
  const cfg = config.get();
  const list = (cfg.vaults || []).map((v) => ({ path: path.normalize(config.expand(v.path)), name: v.name || path.basename(v.path) }));
  if (!list.length) throw new Error('Add a vault in Settings → Guides (a folder of notes, like your CPP-Path vault with "CPP Start Here.md" in it)');
  return list;
}
function vaultOf(file) {
  const p = path.normalize(file);
  return vaultList().find((v) => p.startsWith(v.path + path.sep)) || null;
}

let cache = null;
async function scanVault(v) {
  const notes = [];
  async function walk(d) {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '_code' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.md')) {
        const text = await fsp.readFile(p, 'utf8');
        const rel = path.relative(v.path, d);
        const phase = (text.match(/^phase:\s*(\d+)/m) || [])[1] ?? (rel.match(/^Phase (\d+)\b/) || [])[1];
        notes.push({
          name: e.name.slice(0, -3), path: p,
          folder: rel || '',
          phase: phase === undefined ? null : +phase,
          vault: v.path, vaultName: v.name,
        });
      }
    }
  }
  await walk(v.path);
  notes.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return notes;
}

async function scan() {
  const vaults = vaultList();
  const notes = [];
  const info = [];
  for (const v of vaults) {
    if (!fs.existsSync(v.path)) { info.push({ ...v, count: 0, error: `${v.path} isn't there` }); continue; }
    try {
      const n = await scanVault(v);
      notes.push(...n);
      info.push({ ...v, count: n.length, start: startNote(n) });
    } catch (err) { info.push({ ...v, count: 0, error: err.message }); }
  }
  cache = { root: vaults[0].path, vaults: info, notes, at: Date.now() };
  return cache;
}
// The note to open first in a vault: "... Start Here", else a README / index
function startNote(notes) {
  const top = notes.filter((n) => !n.folder);
  const pick = top.find((n) => /start here$/i.test(n.name)) || top.find((n) => /^(readme|index|home)$/i.test(n.name)) || top[0] || notes[0];
  return pick ? pick.name : null;
}

async function list() { return scan(); }

// A note by name. Links inside a note look in that note's own vault first,
// so two vaults can both have a "Start Here".
async function resolveName(name, vault) {
  if (!cache || Date.now() - cache.at > 5000) await scan();
  const want = name.toLowerCase().replace(/\.md$/, '');
  const v = vault ? path.normalize(config.expand(vault)) : null;
  const pools = v ? [cache.notes.filter((n) => n.vault === v), cache.notes] : [cache.notes];
  for (const pool of pools) {
    const hit = pool.find((n) => n.name.toLowerCase() === want)
      || pool.find((n) => path.relative(n.vault, n.path).toLowerCase().replace(/\.md$/, '') === want);
    if (hit) return hit;
  }
  return null;
}

async function read({ name, file, vault }) {
  const n = file ? { path: file, name: path.basename(file, '.md') } : await resolveName(name, vault);
  if (!n) throw new Error(`No note called "${name}"`);
  const p = path.normalize(n.path);
  const v = vaultOf(p);
  if (!v) throw new Error('That file is outside your vaults');
  return { name: n.name, path: p, vault: v.path, vaultName: v.name, text: await fsp.readFile(p, 'utf8') };
}

async function search({ query, limit = 200, vault }) {
  const { notes } = await scan();
  const q = query.toLowerCase();
  const hits = [];
  const v = vault ? path.normalize(config.expand(vault)) : null;
  for (const n of notes) {
    if (v && n.vault !== v) continue;
    const lines = (await fsp.readFile(n.path, 'utf8')).split('\n');
    lines.forEach((l, i) => {
      if (hits.length < limit && l.toLowerCase().includes(q)) hits.push({ name: n.name, vault: n.vault, vaultName: n.vaultName, line: i + 1, text: l.trim().slice(0, 240) });
    });
    if (n.name.toLowerCase().includes(q) && hits.length < limit) hits.unshift({ name: n.name, vault: n.vault, vaultName: n.vaultName, line: 1, text: '(note title)' });
  }
  return hits;
}

// `_code/projects/P01_text_stats/text_stats.cpp` in a note: prefer your
// working copy in the workspace (~/cpp-path/projects/...), then the other
// folders you have open, then the copy inside the note's own vault.
async function codePath({ rel, vault }) {
  const clean = rel.replace(/^_code\//, '');
  const cfg = config.get();
  const roots = [cfg.workspace, ...(cfg.folders || [])].filter(Boolean).map(config.expand);
  const vaults = (() => { try { return vaultList(); } catch (e) { return []; } })();
  const own = vault ? vaults.filter((v) => v.path === path.normalize(config.expand(vault))) : [];
  const candidates = [...roots.map((r) => path.join(r, clean)), ...[...own, ...vaults.filter((v) => !own.includes(v))].map((v) => path.join(v.path, '_code', clean))];
  for (const c of candidates) if (fs.existsSync(c)) return { path: c };
  return { path: null, tried: candidates };
}

// Revision cards, three decks: every "question" callout (answer folded
// inside), every "Why this matters" summary at the top of a note, and the
// rows of the cheat-sheet tables (which container, what an ASan error means).
function callouts(src) {
  const out = [];
  const lines = src.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) fence = !fence;
    const m = fence ? null : l.match(/^> \[!([a-z-]+)\]([+-]?)\s*(.*)$/);
    if (!m) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].startsWith('>'); j++) body.push(lines[j].replace(/^> ?/, ''));
    out.push({ kind: m[1], title: m[3].trim(), body: body.join('\n'), line: i });
    i = j - 1;
  }
  return out;
}
function tableRows(lines) {
  const rows = [];
  let header = null, heading = '';
  for (const l of lines) {
    const hm = l.match(/^#{2,4}\s+(.*)$/);
    if (hm) { heading = hm[1].trim(); header = null; continue; }
    if (!l.startsWith('|')) { header = null; continue; }
    if (/^\|[\s:|-]+\|\s*$/.test(l)) continue;
    const cells = l.replace(/\\\|/g, '\0').trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\0/g, '|'));
    if (!header) { header = cells; continue; }
    if (cells.length < 2 || !cells[0]) continue;
    rows.push({ heading, header, cells });
  }
  return rows;
}
async function cards() {
  const { root, notes, vaults } = await scan();
  const deck = { questions: [], why: [], reference: [] };
  for (const n of notes) {
    if (/^Templates?(\/|$)/.test(n.folder)) continue;
    const src = await fsp.readFile(n.path, 'utf8');
    const lines = src.split('\n');
    if (/(^|\/)Parked(\/|$)/.test(n.folder) || /^tags:.*\bparked\b/m.test(src)) continue;
    for (const c of callouts(src)) {
      let phase = n.phase;
      if (/Phase Gates$/.test(n.name)) {
        const gates = lines.slice(0, c.line).map((l) => l.match(/^## Gate (\d+)/)).filter(Boolean);
        phase = gates.length ? +gates[gates.length - 1][1] : null;
      }
      if (c.kind === 'question') deck.questions.push({ note: n.name, vault: n.vault, vaultName: n.vaultName, phase, q: c.title, a: c.body });
      else if (c.kind === 'abstract' && c.body.trim()) {
        const topic = n.name.replace(/^\d+\.\d+\s+/, '');
        const q = !c.title || /^why this matters$/i.test(c.title) ? `Why does "${topic}" matter?` : `${n.name}: ${c.title}`;
        deck.why.push({ note: n.name, vault: n.vault, vaultName: n.vaultName, phase, q, a: c.body });
      }
    }
    if (/^Cheat Sheet/.test(n.name)) {
      for (const r of tableRows(lines)) {
        const a = r.cells.slice(1).map((c, i) => (r.header[i + 1] ? `**${r.header[i + 1]}:** ${c}` : c)).join('\n\n');
        const q = r.header[0] ? `${r.heading ? r.heading + ' · ' : ''}${r.header[0]}: ${r.cells[0]}` : r.cells[0];
        deck.reference.push({ note: n.name, vault: n.vault, vaultName: n.vaultName, phase: null, q, a });
      }
    }
  }
  return { root, vaults: vaults.map((v) => ({ path: v.path, name: v.name })), ...deck };
}

// ------------------------------------------------------------------ links, tags, new notes
// What a note links to and how it's tagged, read from its text. Code (fenced
// blocks and `inline`) doesn't count: `[[nodiscard]]` in C++ isn't a link.
const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
function stripCode(text) { return stripFences(text).replace(/`[^`\n]*`/g, ''); }
function frontTags(text) {
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1];
  if (!fm) return [];
  const inline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(',').map((t) => t.trim().replace(/^["'#]|["']$/g, '')).filter(Boolean);
  const block = fm.match(/^tags:\s*\n((?:\s+-\s*.*\n?)+)/m);
  if (block) return block[1].split('\n').map((l) => l.replace(/^\s+-\s*/, '').trim().replace(/^["'#]|["']$/g, '')).filter(Boolean);
  const one = fm.match(/^tags:\s*(\S.*)$/m);
  return one ? one[1].split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean) : [];
}
const TAG_RE = /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;
function parseNote(text) {
  const body = stripCode(text.replace(/^---\n[\s\S]*?\n---\n?/, ''));
  const links = [];
  for (const m of body.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
    const target = m[1].replace(/\\\|/g, '|').split('|')[0].split('#')[0].trim();
    if (target) links.push(target);
  }
  const tags = new Set(frontTags(text).map((t) => t.toLowerCase()));
  for (const m of body.matchAll(TAG_RE)) tags.add(m[2].toLowerCase().replace(/\/$/, ''));
  return { links, tags: [...tags] };
}
// Resolve a link target the way the app opens it: same vault first, by name
// or by path inside the vault.
function resolveIn(notes, target, vault) {
  const want = target.toLowerCase().replace(/\.md$/, '');
  const pools = [notes.filter((n) => n.vault === vault), notes];
  for (const pool of pools) {
    const hit = pool.find((n) => n.name.toLowerCase() === want)
      || pool.find((n) => path.relative(n.vault, n.path).toLowerCase().replace(/\.md$/, '') === want);
    if (hit) return hit;
  }
  return null;
}

// Every note's links and tags, for backlinks, the graph and the tag list.
// Re-read at most every few seconds; edits show up straight after that.
let linkCache = null;
async function linkMap() {
  if (linkCache && Date.now() - linkCache.at < 3000) return linkCache;
  const { notes } = await scan();
  const out = [];
  for (const n of notes) {
    let text = '';
    try { text = await fsp.readFile(n.path, 'utf8'); } catch (e) { continue; }
    const { links, tags } = parseNote(text);
    out.push({ ...n, text, links, tags });
  }
  for (const n of out) {
    n.out = [];
    n.missing = [];
    for (const l of n.links) {
      const hit = resolveIn(out, l, n.vault);
      if (hit) { if (hit.path !== n.path && !n.out.includes(hit.path)) n.out.push(hit.path); }
      else if (!n.missing.includes(l)) n.missing.push(l);
    }
  }
  linkCache = { at: Date.now(), notes: out };
  return linkCache;
}
const brief = (n) => ({ name: n.name, path: n.path, vault: n.vault, vaultName: n.vaultName, folder: n.folder });

// Who links here, with the line that does it, plus this note's own tags and
// the links in it that go nowhere yet.
async function backlinks({ file }) {
  const p = path.normalize(file);
  const { notes } = await linkMap();
  const me = notes.find((n) => n.path === p);
  if (!me) throw new Error('That note is not in your vaults');
  const from = [];
  for (const n of notes) {
    if (n.path === p || !n.out.includes(p)) continue;
    const lines = stripFences(n.text).split('\n');
    const names = [me.name.toLowerCase(), path.relative(me.vault, me.path).toLowerCase().replace(/\.md$/, '')];
    const line = lines.find((l) => [...l.matchAll(/\[\[([^\]\n]+)\]\]/g)].some((m) => names.includes(m[1].replace(/\\\|/g, '|').split('|')[0].split('#')[0].trim().toLowerCase())));
    from.push({ ...brief(n), line: (line || '').trim().slice(0, 240) });
  }
  return { from, tags: me.tags, missing: me.missing, out: me.out.length };
}

// Notes and links of a vault (or all of them), for the graph view
async function graph({ vault } = {}) {
  const { notes } = await linkMap();
  const v = vault ? path.normalize(config.expand(vault)) : null;
  const mine = notes.filter((n) => !v || n.vault === v);
  const index = new Map(mine.map((n, i) => [n.path, i]));
  const edges = [];
  mine.forEach((n, i) => { for (const o of n.out) if (index.has(o)) edges.push([i, index.get(o)]); });
  return { nodes: mine.map((n) => ({ ...brief(n), phase: n.phase, tags: n.tags, missing: n.missing.length })), edges };
}

// Every tag and the notes that carry it
async function tags({ vault } = {}) {
  const { notes } = await linkMap();
  const v = vault ? path.normalize(config.expand(vault)) : null;
  const map = new Map();
  for (const n of notes) {
    if (v && n.vault !== v) continue;
    for (const t of n.tags) {
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(brief(n));
    }
  }
  return [...map].map(([tag, list]) => ({ tag, notes: list })).sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag));
}

// A note name that is safe as a file name: no folders sneaking in with ../,
// none of the characters Windows or Obsidian refuse in file names.
function cleanName(name) {
  const n = String(name || '').replace(/[\\:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!n || n.split('/').some((part) => !part.trim() || part === '.' || part === '..' || part.startsWith('.'))) throw new Error(`"${name}" can't be a note name`);
  return n.split('/').map((s) => s.trim()).join('/');
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// The vault's note template, if it has one (Templates/Note Template.md, or
// any note in a Templates folder), with {{title}} and {{date}} filled in.
async function templateText(v, title, which) {
  const { notes } = await scan();
  const tpls = notes.filter((n) => n.vault === v.path && /^Templates?(\/|$)/.test(n.folder));
  const want = which ? tpls.find((n) => n.name.toLowerCase() === which.toLowerCase()) : tpls.find((n) => /note template/i.test(n.name)) || tpls[0];
  if (!want) return null;
  const text = await fsp.readFile(want.path, 'utf8');
  return text.replace(/\{\{\s*title\s*\}\}/gi, title).replace(/\{\{\s*date(?::[^}]*)?\s*\}\}/gi, today()).replace(/\{\{\s*time\s*\}\}/gi, new Date().toTimeString().slice(0, 5));
}
// Make a new note (never overwriting one): in a vault, optionally a folder,
// from the vault's template or a blank page with the title on top.
async function create({ vault, name, folder = '', template, text }) {
  const vs = vaultList();
  const v = vs.find((x) => x.path === path.normalize(config.expand(vault || ''))) || vs[0];
  const rel = cleanName(folder ? `${folder}/${name}` : name);
  const file = path.join(v.path, rel + '.md');
  if (!file.startsWith(v.path + path.sep)) throw new Error('Notes go inside the vault');
  if (fs.existsSync(file)) return { path: file, name: path.basename(rel), vault: v.path, existed: true };
  const title = path.basename(rel);
  let body = typeof text === 'string' ? text : template === false ? null : await templateText(v, title, template);
  if (body == null) body = `# ${title}\n\n`;
  else if (!/^#\s/m.test(body.replace(/^---\n[\s\S]*?\n---\n?/, ''))) body = body.replace(/^(---\n[\s\S]*?\n---\n)?/, (fm) => `${fm || ''}# ${title}\n\n`);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, body, { flag: 'wx' });
  cache = null; linkCache = null;
  return { path: file, name: title, vault: v.path, existed: false };
}
// Today's note: Daily/2026-11-24.md in the vault, made the first time
async function daily({ vault }) {
  const d = today();
  return create({ vault, name: d, folder: 'Daily', template: false,
    text: `---\ntags: [daily]\n---\n# ${d}\n\n## Today I want to\n\n- [ ] Read one note\n- [ ] Write and run one program\n\n## What I learned\n\n- \n\n## Stuck on\n\n- \n` });
}
// Tick or untick the nth task box (- [ ]) in a note. Counts the same boxes
// the page shows: none inside code blocks.
async function toggleTask({ file, index, done, expectText }) {
  const p = path.normalize(file);
  if (!vaultOf(p)) throw new Error('That file is outside your vaults');
  const text = await fsp.readFile(p, 'utf8');
  const lines = text.split('\n');
  let fence = false, n = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const m = lines[i].match(/^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\](?:\s|$))/);
    if (!m || ++n !== index) continue;
    if (expectText && !lines[i].includes(expectText)) throw new Error('The note changed on disk: reload it and try again');
    lines[i] = m[1] + (done ? 'x' : ' ') + lines[i].slice(m[1].length + 1);
    await fsp.writeFile(p, lines.join('\n'));
    linkCache = null;
    return { done: !!done, line: i + 1 };
  }
  throw new Error('That task box is no longer in the note: reload it');
}

function init(api) {
  api.register('guides.cards', cards);
  api.register('guides.list', list);
  api.register('guides.read', read);
  api.register('guides.search', search);
  api.register('guides.codePath', codePath);
  api.register('guides.backlinks', backlinks);
  api.register('guides.graph', graph);
  api.register('guides.tags', tags);
  api.register('guides.create', create);
  api.register('guides.daily', daily);
  api.register('guides.toggleTask', toggleTask);
}

module.exports = { init, parseNote, cleanName };
