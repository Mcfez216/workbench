'use strict';
// Guides: the CPP-Path vault, read straight from its folder so the app is
// always showing your current notes. Rendering happens in the window.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('./config');

function vaultRoot() {
  const v = config.expand(config.get().vault);
  if (!v || !fs.existsSync(v)) throw new Error('Set the location of your CPP-Path vault in Settings (the folder with "CPP Start Here.md" in it)');
  return v;
}

let cache = null;
async function scan() {
  const root = vaultRoot();
  const notes = [];
  async function walk(d) {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '_code') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.md')) {
        const text = await fsp.readFile(p, 'utf8');
        const rel = path.relative(root, d);
        const phase = (text.match(/^phase:\s*(\d+)/m) || [])[1] ?? (rel.match(/^Phase (\d+)\b/) || [])[1];
        notes.push({
          name: e.name.slice(0, -3), path: p,
          folder: path.relative(root, d) || '',
          phase: phase === undefined ? null : +phase,
        });
      }
    }
  }
  await walk(root);
  notes.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  cache = { root, notes, at: Date.now() };
  return cache;
}

async function list() { return scan(); }

async function resolveName(name) {
  if (!cache || Date.now() - cache.at > 5000) await scan();
  const want = name.toLowerCase().replace(/\.md$/, '');
  return cache.notes.find((n) => n.name.toLowerCase() === want)
    || cache.notes.find((n) => path.relative(cache.root, n.path).toLowerCase().replace(/\.md$/, '') === want);
}

async function read({ name, file }) {
  const n = file ? { path: file, name: path.basename(file, '.md') } : await resolveName(name);
  if (!n) throw new Error(`No note called "${name}"`);
  const root = vaultRoot();
  const p = path.normalize(n.path);
  if (!p.startsWith(root + path.sep)) throw new Error('That file is outside the vault');
  return { name: n.name, path: p, text: await fsp.readFile(p, 'utf8') };
}

async function search({ query, limit = 200 }) {
  const { notes } = await scan();
  const q = query.toLowerCase();
  const hits = [];
  for (const n of notes) {
    const lines = (await fsp.readFile(n.path, 'utf8')).split('\n');
    lines.forEach((l, i) => {
      if (hits.length < limit && l.toLowerCase().includes(q)) hits.push({ name: n.name, line: i + 1, text: l.trim().slice(0, 240) });
    });
    if (n.name.toLowerCase().includes(q) && hits.length < limit) hits.unshift({ name: n.name, line: 1, text: '(note title)' });
  }
  return hits;
}

// `_code/projects/P01_text_stats/text_stats.cpp` in a note: prefer your
// working copy in the workspace (~/cpp-path/projects/...), fall back to the
// copy inside the vault.
async function codePath({ rel }) {
  const clean = rel.replace(/^_code\//, '');
  const ws = config.expand(config.get().workspace);
  const candidates = [path.join(ws, clean), path.join(vaultRoot(), '_code', clean)];
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
  const { root, notes } = await scan();
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
      if (c.kind === 'question') deck.questions.push({ note: n.name, phase, q: c.title, a: c.body });
      else if (c.kind === 'abstract' && c.body.trim()) {
        const topic = n.name.replace(/^\d+\.\d+\s+/, '');
        const q = !c.title || /^why this matters$/i.test(c.title) ? `Why does "${topic}" matter?` : `${n.name}: ${c.title}`;
        deck.why.push({ note: n.name, phase, q, a: c.body });
      }
    }
    if (/^Cheat Sheet/.test(n.name)) {
      for (const r of tableRows(lines)) {
        const a = r.cells.slice(1).map((c, i) => (r.header[i + 1] ? `**${r.header[i + 1]}:** ${c}` : c)).join('\n\n');
        const q = r.header[0] ? `${r.heading ? r.heading + ' · ' : ''}${r.header[0]}: ${r.cells[0]}` : r.cells[0];
        deck.reference.push({ note: n.name, phase: null, q, a });
      }
    }
  }
  return { root, ...deck };
}

function init(api) {
  api.register('guides.cards', cards);
  api.register('guides.list', list);
  api.register('guides.read', read);
  api.register('guides.search', search);
  api.register('guides.codePath', codePath);
}

module.exports = { init };
