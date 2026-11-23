// Revise: flashcards from the vault (every check-yourself question, every
// "Why this matters", the cheat-sheet tables) with a simple Leitner box
// schedule, so the ones you know come back less often and the ones you
// don't come back tomorrow.

import { call } from './rpc.js';
import { h, clear, toast } from './ui.js';
import { tabs, command } from './layout.js';
import { renderMarkdown, renderInline } from './markdown.js';
import { openGuide } from './guides.js';

const DAYS = [0, 1, 3, 7, 16, 35];     // box -> days until it comes back
const DAY = 86400000;
const DECKS = { questions: 'Check-yourself questions', why: 'Why this matters', reference: 'Cheat-sheet tables', mistakes: 'Your mistakes' };

function cardId(deck, c) {
  let x = 0;
  for (const ch of deck + c.note + c.q) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return deck[0] + (x >>> 0).toString(36);
}

async function openRevise() {
  tabs.open({
    id: 'revise', kind: 'revise', title: 'Revise', session: { kind: 'revise' },
    async render(el) {
      const page = h('div', { class: 'page revise' });
      el.append(page);
      let data, boxes;
      // the vaults' decks (if there are vaults), plus one made from your own mistakes
      const { mistakeCards } = await import('./explain.js');
      [data, boxes] = await Promise.all([call('guides.cards').catch(() => ({ questions: [], why: [], reference: [], vaults: [] })), call('state.get', { key: 'revise.boxes', fallback: {} })]);
      data.mistakes = await mistakeCards();
      const opts = await call('state.get', { key: 'revise.opts', fallback: { deck: 'questions', phase: 'all', vault: 'all' } });
      if (!DECKS[opts.deck]) opts.deck = 'questions';
      const deckSel = h('select', { class: 'field', 'aria-label': 'Deck' }, Object.entries(DECKS).map(([k, v]) => h('option', { value: k, selected: k === opts.deck }, `${v} (${data[k].length})`)));
      const phaseSel = h('select', { class: 'field', 'aria-label': 'Phase' }, ['all', 0, 1, 2, 3, 4, 5].map((p) => h('option', { value: String(p), selected: String(p) === String(opts.phase) }, p === 'all' ? 'All phases' : `Phase ${p}`)));
      // several vaults: cards from all of them, or just one
      const vaults = data.vaults || [];
      const vaultSel = h('select', { class: 'field', 'aria-label': 'Vault', hidden: vaults.length < 2 },
        h('option', { value: 'all' }, 'Every vault'), vaults.map((v) => h('option', { value: v.path, selected: v.path === opts.vault }, v.name)));
      const counts = h('span', { class: 'muted' });
      const stage = h('div', { class: 'card-stage' });
      page.append(h('div', { class: 'toolbar' }, deckSel, phaseSel, vaultSel, counts), stage);

      let queue = [], card = null, shown = false;
      const save = () => call('state.set', { key: 'revise.boxes', value: boxes });
      const build = () => {
        const deck = deckSel.value, ph = phaseSel.value, vault = vaultSel.value;
        call('state.set', { key: 'revise.opts', value: { deck, phase: ph, vault } });
        const now = Date.now();
        const all = (data[deck] || []).filter((c) => vault === 'all' || c.vault === vault)
          .filter((c) => ph === 'all' || c.phase === +ph || (c.phase === null && deck === 'reference')).map((c) => ({ ...c, id: cardId(deck, c) }));
        const due = all.filter((c) => !boxes[c.id] || boxes[c.id].due <= now);
        // never-seen and low boxes first, shuffled within a box
        queue = due.map((c) => [c, (boxes[c.id]?.box ?? -1) + Math.random()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
        const learned = all.filter((c) => (boxes[c.id]?.box || 0) >= 3).length;
        counts.textContent = `${queue.length} due · ${learned}/${all.length} learned`;
        next();
      };
      const next = () => {
        card = queue.shift();
        shown = false;
        clear(stage);
        if (!card) {
          if (deckSel.value === 'mistakes' && !data.mistakes.length) { stage.append(h('div', { class: 'card done' }, h('h2', {}, 'No mistakes yet.'), h('p', {}, 'When the compiler or a sanitizer catches something in your code, a card about it lands here, so the ones you meet most come back most.'))); return; }
          stage.append(h('div', { class: 'card done' }, h('h2', {}, 'Nothing due.'), h('p', {}, 'Every card in this deck is scheduled for later. Pick another deck or phase, or come back tomorrow.'),
            h('p', { class: 'muted' }, '"Do. Or do not. There is no try." You did. The 60 tests would be proud.')));
          return;
        }
        const back = h('div', { class: 'card-back md', hidden: true });
        back.innerHTML = renderMarkdown(card.a).html;
        const reveal = h('button', { class: 'btn primary', type: 'button' }, 'Show answer (Space)');
        const grade = h('div', { class: 'card-grade', hidden: true },
          h('button', { class: 'btn', type: 'button', 'data-g': '0' }, 'Again (1)'),
          h('button', { class: 'btn', type: 'button', 'data-g': '1' }, 'Hard (2)'),
          h('button', { class: 'btn primary', type: 'button', 'data-g': '2' }, 'Got it (3)'));
        const front = h('div', { class: 'card-front md' });
        front.innerHTML = `<p>${renderInline(card.q)}</p>`;
        const src = h('a', { href: '#', class: 'muted', onclick: (e) => { e.preventDefault(); openGuide(card.note, undefined, { vault: card.vault }); } }, `${vaults.length > 1 ? card.vaultName + ' › ' : ''}${card.note}${card.phase !== null && card.phase !== undefined ? ' · Phase ' + card.phase : ''}`);
        stage.append(h('div', { class: 'card' }, h('div', { class: 'card-src' }, src), front, back, h('div', { class: 'card-actions' }, reveal, grade)));
        back.querySelectorAll('.codeblock .code-tools').forEach((x) => x.remove());
        const show = () => { shown = true; back.hidden = false; reveal.hidden = true; grade.hidden = false; grade.querySelector('[data-g="2"]').focus(); };
        reveal.addEventListener('click', show);
        grade.addEventListener('click', (e) => { const g = e.target.closest('[data-g]'); if (g) rate(+g.dataset.g); });
        this.keys = (e) => {
          if (e.key === ' ' && !shown) { e.preventDefault(); show(); }
          else if (shown && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); rate(+e.key - 1); }
        };
        reveal.focus();
      };
      const rate = (g) => {
        const b = boxes[card.id]?.box || 0;
        const nb = g === 0 ? 0 : g === 1 ? Math.max(1, b) : Math.min(b + 1, DAYS.length - 1);
        boxes[card.id] = { box: nb, due: Date.now() + DAYS[nb] * DAY - 3600000 };
        if (g === 0) queue.splice(Math.min(queue.length, 3), 0, card);   // see it again soon
        save();
        next();
      };
      deckSel.addEventListener('change', build);
      phaseSel.addEventListener('change', build);
      vaultSel.addEventListener('change', build);
      el.addEventListener('keydown', (e) => { if (this.keys && !e.target.closest('select')) this.keys(e); });
      el.tabIndex = -1;
      build();
    },
    onShow() { this.el.focus(); },
  });
}

export function initRevise() {
  command('revise.open', 'Revise (flashcards)', ['Ctrl+Shift+V'], openRevise);
}
