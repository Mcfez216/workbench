// Notes features for the guides, built in (no plugins): what links here
// (backlinks), #tags, a graph of how notes link, new notes from the vault's
// template, a daily note, task boxes you can tick, link previews on hover,
// links to notes that don't exist yet (click to write them), a random note.

import { call } from './rpc.js';
import { h, clear, toast, prompt } from './ui.js';
import { tabs, command, sidebar } from './layout.js';
import { renderMarkdown } from './markdown.js';
import { openGuide, guideNotes, guideVaults, loadNotes } from './guides.js';

// ------------------------------------------------------------------ resolving links like the backend
function findNote(name, vault) {
  const want = String(name).toLowerCase().replace(/\.md$/, '');
  const all = guideNotes();
  const rel = (n) => (n.folder ? n.folder + '/' : '') + n.name;
  for (const pool of [all.filter((n) => n.vault === vault), all]) {
    const hit = pool.find((n) => n.name.toLowerCase() === want) || pool.find((n) => rel(n).toLowerCase() === want);
    if (hit) return hit;
  }
  return null;
}

// ------------------------------------------------------------------ on every note page
// Marks links that go nowhere yet, and adds the footer: tags, backlinks,
// and the notes this one wants that haven't been written.
export async function decorateNote(t) {
  const page = t.page;
  for (const a of page.querySelectorAll('a.wikilink[data-note]')) {
    if (a.dataset.note && !findNote(a.dataset.note, t.note.vault)) {
      a.classList.add('missing');
      a.title = `"${a.dataset.note}" isn't written yet. Click to start it.`;
    }
  }
  let info;
  try { info = await call('guides.backlinks', { file: t.note.path }); } catch (e) { return; }
  if (!page.isConnected && !page.parentElement) return;
  page.querySelector('.note-foot')?.remove();
  const foot = h('section', { class: 'note-foot', 'aria-label': 'Links and tags' });
  if (info.tags.length) {
    foot.append(h('div', { class: 'note-tags' }, h('span', { class: 'muted' }, 'Tags '),
      info.tags.map((tag) => h('a', { href: '#', class: 'tag', 'data-tag': tag }, '#' + tag))));
  }
  const head = h('div', { class: 'pane-title' }, info.from.length ? `Linked from ${info.from.length} note${info.from.length === 1 ? '' : 's'}` : 'Linked from: nothing yet');
  foot.append(head);
  if (info.from.length) {
    const ul = h('ul', { class: 'backlinks' });
    for (const b of info.from) {
      const btn = h('button', { type: 'button', class: 'list-row backlink' },
        h('span', { class: 'name' }, b.vault !== t.note.vault ? `${b.vaultName} › ${b.name}` : b.name),
        b.line ? h('span', { class: 'muted small grow' }, plainLine(b.line)) : null);
      btn.addEventListener('click', (e) => openGuide(b.name, undefined, { vault: b.vault, ...(e.shiftKey ? { side: tabs.other() } : {}) }));
      ul.append(h('li', {}, btn));
    }
    foot.append(ul);
  }
  if (info.missing.length) {
    foot.append(h('div', { class: 'pane-title' }, 'Not written yet'),
      h('p', { class: 'small' }, info.missing.map((m, i) => [i ? ', ' : '', h('a', { href: '#', class: 'wikilink missing', 'data-note': m, 'data-heading': '' }, m)])));
  }
  foot.append(h('div', { class: 'row small' },
    h('button', { type: 'button', class: 'btn small', onclick: () => openGraph(t.note.vault, t.note.path) }, 'Show in graph'),
    h('span', { class: 'muted' }, `${info.out} link${info.out === 1 ? '' : 's'} out`)));
  page.append(foot);
}

// A line of Markdown as plain words: [[links]] by their label, no table bars
function plainLine(l) {
  return l.replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g, (m, n, alias) => alias || n)
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '').replace(/\s*\|\s*/g, ' · ').replace(/^[>#\s-]+/, '').replace(/[*`]/g, '');
}

// ------------------------------------------------------------------ clicks on a note page
// Returns true when it handled the click.
export async function onNoteClick(t, e) {
  const tag = e.target.closest('a.tag');
  if (tag) { e.preventDefault(); openTag(tag.dataset.tag, t.note.vault); return true; }
  const box = e.target.closest('button.task[data-task]');
  if (box) {
    e.preventDefault();
    const done = !box.classList.contains('done');
    try {
      await call('guides.toggleTask', { file: t.note.path, index: +box.dataset.task, done, expectText: box.dataset.text });
      box.classList.toggle('done', done);
      box.textContent = done ? '[x]' : '[ ]';
      box.setAttribute('aria-checked', String(done));
      if (done) { box.classList.add('pop'); setTimeout(() => box.classList.remove('pop'), 500); }
      t.stale = false;
    } catch (err) { toast(err.message, 'error'); }
    return true;
  }
  const missing = e.target.closest('a.wikilink.missing');
  if (missing) { e.preventDefault(); await startNote(missing.dataset.note, t.note.vault, t.note.name); return true; }
  return false;
}

// "Start writing [[X]]?" Then X is made from the template, next to the
// vault's other notes, and opened for editing.
async function startNote(name, vault, from) {
  const { confirm } = await import('./ui.js');
  const v = guideVaults().find((x) => x.path === vault);
  if (!(await confirm('New note', `"${name}" doesn't exist yet${from ? ` (${from} links to it)` : ''}. Start it in ${v ? v.name : 'this vault'}?`, 'Start it'))) return;
  return makeNote({ vault, name });
}
async function makeNote({ vault, name, folder, daily }) {
  let r;
  try { r = daily ? await call('guides.daily', { vault }) : await call('guides.create', { vault, name, folder }); }
  catch (err) { toast(err.message, 'error'); return null; }
  await loadNotes();
  const t = await openGuide(r.name, undefined, { vault: r.vault });
  if (!r.existed) {
    const { openFile } = await import('./editor.js');
    openFile(r.path, { side: t ? tabs.other() : undefined });
    toast(`${r.name}: written, open beside the page. It updates as you save.`, 'ok');
  }
  return r;
}

// ------------------------------------------------------------------ link previews
// Rest the pointer on a [[link]] for a moment: the top of that note, without
// leaving the page you're reading.
let pop = null, popTimer = null;
function hidePreview() { clearTimeout(popTimer); popTimer = null; if (pop) { pop.remove(); pop = null; } }
export function initPreviews(root) {
  root.addEventListener('mouseover', (e) => {
    const a = e.target.closest && e.target.closest('.md a.wikilink[data-note]:not(.missing)');
    if (!a || !a.dataset.note) return;
    clearTimeout(popTimer);
    popTimer = setTimeout(() => showPreview(a), 450);
    a.addEventListener('mouseleave', () => { clearTimeout(popTimer); setTimeout(() => { if (pop && !pop.matches(':hover')) hidePreview(); }, 200); }, { once: true });
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePreview(); });
  window.addEventListener('scroll', hidePreview, true);
}
async function showPreview(a) {
  const page = a.closest('.page');
  const tab = tabs.list.find((x) => x.page === page);
  let note;
  try { note = await call('guides.read', { name: a.dataset.note, vault: tab && tab.note ? tab.note.vault : undefined }); } catch (e) { return; }
  if (!a.isConnected) return;
  hidePreview();
  // the first part: up to the second heading, or about 1500 characters
  let text = note.text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  if (a.dataset.heading) {
    const at = text.search(new RegExp('^#{1,6}\\s+' + a.dataset.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'mi'));
    if (at >= 0) text = text.slice(at);
  }
  const lines = text.split('\n');
  let cut = lines.length, heads = 0;
  for (let i = 0; i < lines.length; i++) if (/^## /.test(lines[i]) && ++heads === 2) { cut = i; break; }
  text = lines.slice(0, cut).join('\n');
  if (text.length > 1500) text = text.slice(0, 1500).replace(/\n[^\n]*$/, '') + '\n\n…';
  pop = h('div', { class: 'note-preview md', role: 'tooltip' });
  pop.innerHTML = renderMarkdown(text).html;
  pop.querySelectorAll('button, .code-tools').forEach((b) => b.remove());
  pop.prepend(h('div', { class: 'muted small' }, `${note.vaultName} · click the link to open it`));
  document.body.append(pop);
  const r = a.getBoundingClientRect();
  const w = Math.min(560, window.innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + 'px';
  const below = r.bottom + 8, ph = pop.offsetHeight;
  pop.style.top = (below + ph < window.innerHeight - 8 ? below : Math.max(8, r.top - ph - 8)) + 'px';
  pop.addEventListener('mouseleave', hidePreview);
}

// ------------------------------------------------------------------ tags
export async function openTag(tag, vault) {
  const all = await call('guides.tags', {});
  const hit = all.find((x) => x.tag === tag);
  tabs.open({
    id: 'tag:' + tag, kind: 'search', title: '#' + tag, session: { kind: 'tag', tag },
    render(el) {
      const page = h('div', { class: 'page' }, h('h2', {}, '#' + tag),
        h('p', { class: 'muted' }, hit ? `${hit.notes.length} note${hit.notes.length === 1 ? '' : 's'}` : 'No notes have this tag any more.'));
      for (const n of hit ? hit.notes : []) {
        const b = h('button', { type: 'button', class: 'list-row' }, h('span', { class: 'grow' }, n.name), h('span', { class: 'muted small' }, guideVaults().length > 1 ? n.vaultName : n.folder));
        b.addEventListener('click', () => openGuide(n.name, undefined, { vault: n.vault }));
        page.append(b);
      }
      el.append(page);
    },
  });
}
async function tagList() {
  const all = await call('guides.tags', {});
  tabs.open({
    id: 'tags', kind: 'search', title: 'Tags', session: { kind: 'tags' },
    render(el) {
      const page = h('div', { class: 'page' }, h('h2', {}, 'Tags'), h('p', { class: 'muted' }, all.length ? 'From each note\'s frontmatter (tags: [...]) and #tags in the text. Click one for its notes.' : 'No tags yet. Add tags: [cpp, pointers] at the top of a note, or #todo anywhere in it.'));
      const cloud = h('div', { class: 'tag-cloud' });
      const max = Math.max(1, ...all.map((x) => x.notes.length));
      for (const x of all) {
        const size = 0.9 + 0.7 * Math.sqrt(x.notes.length / max);
        cloud.append(h('a', { href: '#', class: 'tag', 'data-tag': x.tag, style: { fontSize: size.toFixed(2) + 'em' }, onclick: (e) => { e.preventDefault(); openTag(x.tag); } }, `#${x.tag}`, h('sup', { class: 'muted' }, String(x.notes.length))));
      }
      page.append(cloud);
      el.append(page);
    },
  });
}

// ------------------------------------------------------------------ the graph
// Every note a dot, every link a line, laid out by a small spring
// simulation: linked notes pull together, all notes push apart. Drag to pan,
// wheel to zoom, hover to see a note's neighbours, click to open it.
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

export async function openGraph(vault, focusPath) {
  const id = 'graph';
  const existing = tabs.get(id);
  if (existing) { tabs.focus(id); existing.load(vault, focusPath); return existing; }
  return tabs.open({
    id, kind: 'graph', title: 'Graph', session: { kind: 'graph', vault, focus: focusPath },
    render(el) {
      const vaults = guideVaults();
      const pick = h('select', { class: 'field', 'aria-label': 'Which vault' },
        vaults.length > 1 ? h('option', { value: '' }, 'All vaults') : null,
        vaults.map((v) => h('option', { value: v.path }, v.name)));
      const find = h('input', { class: 'field', type: 'search', placeholder: 'Highlight notes...', 'aria-label': 'Highlight notes by name' });
      const local = h('input', { type: 'checkbox', id: 'graph-local' });
      const stats = h('span', { class: 'muted small' });
      const svg = s('svg', { class: 'graph-svg', role: 'img', 'aria-label': 'Graph of notes and their links' });
      const bar = h('div', { class: 'graph-bar row' }, pick, find,
        h('label', { class: 'small', for: 'graph-local', title: 'Only the focused note and the notes within two links of it' }, local, ' Near this note only'),
        h('button', { type: 'button', class: 'btn small', onclick: () => this.load(pick.value, this.focus) }, 'Re-run layout'), stats);
      el.append(h('div', { class: 'graph-page' }, bar, svg));
      this.svg = svg; this.pick = pick; this.find = find; this.local = local; this.stats = stats;
      pick.addEventListener('change', () => this.load(pick.value, null));
      local.addEventListener('change', () => this.load(pick.value, this.focus));
      find.addEventListener('input', () => this.highlight());
      this.load = (v, f) => loadGraph(this, v, f);
      this.load(vault ?? (vaults.length > 1 ? '' : vaults[0]?.path), focusPath);
    },
    onClose() { cancelAnimationFrame(this.raf); },
  });
}

async function loadGraph(t, vault, focusPath) {
  cancelAnimationFrame(t.raf);
  t.focus = focusPath || null;
  if (vault !== undefined) t.pick.value = vault || '';
  let g;
  try { g = await call('guides.graph', { vault: t.pick.value || undefined }); } catch (e) { toast(e.message, 'error'); return; }
  let nodes = g.nodes.map((n, i) => ({ ...n, i, x: 0, y: 0, vx: 0, vy: 0, deg: 0 }));
  let edges = g.edges.map(([a, b]) => ({ a, b }));
  const focus = nodes.find((n) => n.path === t.focus);
  if (t.local.checked && focus) {
    // the focused note and everything within two links of it
    const adj = nodes.map(() => []);
    for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
    const keep = new Set([focus.i]);
    let frontier = [focus.i];
    for (let hop = 0; hop < 2; hop++) {
      const next = [];
      for (const i of frontier) for (const j of adj[i]) if (!keep.has(j)) { keep.add(j); next.push(j); }
      frontier = next;
    }
    const map = new Map([...keep].map((i, j) => [i, j]));
    nodes = [...keep].map((i) => ({ ...nodes[i], i: map.get(i) }));
    edges = edges.filter((e) => keep.has(e.a) && keep.has(e.b)).map((e) => ({ a: map.get(e.a), b: map.get(e.b) }));
  }
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  // start on a circle, so every run lands the same way
  const R = 40 + 18 * Math.sqrt(nodes.length);
  nodes.forEach((n, k) => { const a = (k / Math.max(1, nodes.length)) * Math.PI * 2; n.x = Math.cos(a) * R; n.y = Math.sin(a) * R; });
  t.nodes = nodes; t.edges = edges;
  t.stats.textContent = `${nodes.length} notes, ${edges.length} links${nodes.filter((n) => !n.deg).length ? `, ${nodes.filter((n) => !n.deg).length} on their own` : ''}`;
  drawGraph(t);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alpha = 1;
  const step = () => {
    for (let k = 0; k < (reduce ? 300 : 3) && alpha > 0.01; k++) { tick(nodes, edges, alpha); alpha *= 0.985; }
    place(t);
    if (alpha > 0.01) t.raf = requestAnimationFrame(step);
  };
  step();
}

function tick(nodes, edges, alpha) {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      if (d2 > 160000) continue;
      const f = (900 * alpha) / d2;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
  }
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = ((d - 70) / d) * 0.06 * alpha;
    a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
  }
  for (const p of nodes) {
    p.vx -= p.x * 0.004 * alpha; p.vy -= p.y * 0.004 * alpha;   // a gentle pull to the middle
    p.vx *= 0.6; p.vy *= 0.6;
    p.x += Math.max(-30, Math.min(30, p.vx)); p.y += Math.max(-30, Math.min(30, p.vy));
  }
}

function drawGraph(t) {
  const svg = t.svg;
  clear(svg);
  const view = { x: 0, y: 0, k: 1 };
  t.view = view;
  const root = s('g');
  const lines = s('g', { class: 'graph-links' });
  const dots = s('g', { class: 'graph-nodes' });
  root.append(lines, dots);
  svg.append(root);
  t.root = root;
  t.edgeEls = t.edges.map((e) => { const l = s('line'); lines.append(l); return l; });
  t.nodeEls = t.nodes.map((n) => {
    const g = s('g', { class: 'graph-node' + (n.path === t.focus ? ' focus' : '') + (n.missing ? ' wants' : ''), tabindex: '0', role: 'button', 'aria-label': n.name });
    const r = 3.5 + Math.min(9, Math.sqrt(n.deg) * 1.8);
    const c = s('circle', { r: r.toFixed(1) });
    if (n.phase !== null && n.phase !== undefined) c.setAttribute('data-phase', String(n.phase));
    const label = s('text', { x: (r + 3).toFixed(1), y: '4' });
    label.textContent = n.name;
    const tip = s('title'); tip.textContent = `${n.name}${n.folder ? `\n${n.folder}` : ''}${n.tags.length ? `\n#${n.tags.join(' #')}` : ''}\n${n.deg} link${n.deg === 1 ? '' : 's'}`;
    g.append(c, label, tip);
    const open = (e) => openGuide(n.name, undefined, { vault: n.vault, ...(e.shiftKey ? { side: tabs.other() } : {}) });
    g.addEventListener('click', (e) => { if (!t.dragged) open(e); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    g.addEventListener('mouseenter', () => neighbours(t, n.i, true));
    g.addEventListener('mouseleave', () => neighbours(t, n.i, false));
    g.addEventListener('focus', () => neighbours(t, n.i, true));
    g.addEventListener('blur', () => neighbours(t, n.i, false));
    dots.append(g);
    return g;
  });
  // pan and zoom
  let drag = null;
  svg.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; t.dragged = false; };
  svg.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { t.dragged = true; svg.setPointerCapture(e.pointerId); }
    view.x = drag.vx + dx; view.y = drag.vy + dy; place(t);
  };
  svg.onpointerup = () => { drag = null; setTimeout(() => { t.dragged = false; }, 0); };
  svg.onwheel = (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const k = Math.max(0.2, Math.min(5, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k;
    place(t);
  };
  t.highlight = () => {
    const q = t.find.value.trim().toLowerCase();
    t.nodes.forEach((n, i) => t.nodeEls[i].classList.toggle('hit', !!q && n.name.toLowerCase().includes(q)));
    svg.classList.toggle('searching', !!q);
  };
  t.highlight();
}
function place(t) {
  const r = t.svg.getBoundingClientRect();
  const v = t.view;
  t.root.setAttribute('transform', `translate(${(r.width / 2 + v.x).toFixed(1)} ${(r.height / 2 + v.y).toFixed(1)}) scale(${v.k.toFixed(3)})`);
  t.nodes.forEach((n, i) => t.nodeEls[i].setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`));
  t.edges.forEach((e, i) => {
    const a = t.nodes[e.a], b = t.nodes[e.b], l = t.edgeEls[i];
    l.setAttribute('x1', a.x.toFixed(1)); l.setAttribute('y1', a.y.toFixed(1)); l.setAttribute('x2', b.x.toFixed(1)); l.setAttribute('y2', b.y.toFixed(1));
  });
}
function neighbours(t, i, on) {
  t.svg.classList.toggle('hovering', on);
  const near = new Set([i]);
  t.edges.forEach((e, k) => { const hit = e.a === i || e.b === i; t.edgeEls[k].classList.toggle('near', on && hit); if (hit) { near.add(e.a); near.add(e.b); } });
  t.nodeEls.forEach((el, k) => el.classList.toggle('near', on && near.has(k)));
}

// ------------------------------------------------------------------ commands
function currentVault() {
  const t = tabs.list.find((x) => x.id === tabs.activeId);
  if (t && t.note) return t.note.vault;
  const v = guideVaults();
  return v.length ? v[0].path : undefined;
}
async function newNote() {
  const vaults = guideVaults();
  if (!vaults.length) { toast('Add a vault first', 'error'); return; }
  const { dialog } = await import('./ui.js');
  const name = h('input', { class: 'field', type: 'text', placeholder: 'Pointers to pointers', spellcheck: 'false' });
  const folder = h('input', { class: 'field', type: 'text', placeholder: '(the top of the vault)', spellcheck: 'false' });
  const cur = currentVault();
  const t = tabs.list.find((x) => x.id === tabs.activeId);
  if (t && t.note) folder.value = (guideNotes().find((n) => n.path === t.note.path) || {}).folder || '';
  const pick = h('select', { class: 'field' }, vaults.map((v) => h('option', { value: v.path, selected: v.path === cur }, v.name)));
  const ok = await dialog({ title: 'New note', width: '40em',
    onOpen: () => name.focus(),
    body: h('div', { class: 'form dialog-form' }, h('label', {}, 'Name'), name, h('label', {}, 'Vault'), pick, h('label', {}, 'Folder'), folder,
      h('div', { class: 'full hint small muted' }, 'Made from the vault\'s Templates folder if it has one ({{title}} and {{date}} are filled in), else a blank page. An existing note is opened, never overwritten.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }] });
  if (ok && name.value.trim()) return makeNote({ vault: pick.value, name: name.value.trim(), folder: folder.value.trim() });
}
function randomNote() {
  const v = currentVault();
  const pool = guideNotes().filter((n) => n.vault === v && !/^Templates?(\/|$)/.test(n.folder));
  if (!pool.length) return toast('No notes to pick from', 'error');
  const n = pool[Math.floor(Math.random() * pool.length)];
  toast(`Random note: ${n.name}`);
  return openGuide(n.name, undefined, { vault: n.vault });
}

export function initNotes() {
  initPreviews(document.body);
  command('notes.new', 'New note...', ['Ctrl+Alt+N'], newNote);
  command('notes.daily', "Today's note", ['Ctrl+Alt+D'], () => makeNote({ vault: currentVault(), daily: true }));
  command('notes.graph', 'Graph of notes', ['Ctrl+Alt+G'], () => {
    const t = tabs.list.find((x) => x.id === tabs.activeId);
    return openGraph(t && t.note ? t.note.vault : undefined, t && t.note ? t.note.path : undefined);
  });
  command('notes.tags', 'Tags', [], tagList);
  command('notes.random', 'Random note', [], randomNote);
  command('notes.tag', 'Notes with a tag...', [], async (tag) => {
    const q = typeof tag === 'string' ? tag : await prompt('Notes with a tag', 'Tag (without the #)');
    if (q) openTag(q.replace(/^#/, '').toLowerCase());
  });
  command('notes.backlinks', 'What links here', [], () => {
    const t = tabs.list.find((x) => x.id === tabs.activeId);
    if (!t || !t.note) { sidebar.show('guides'); return toast('Open a note first'); }
    t.page.querySelector('.note-foot')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}
