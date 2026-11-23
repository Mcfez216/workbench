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

function init(api) {
  api.register('guides.cards', cards);
  api.register('guides.list', list);
  api.register('guides.read', read);
  api.register('guides.search', search);
  api.register('guides.codePath', codePath);
}

module.exports = { init };
