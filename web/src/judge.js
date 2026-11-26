// The judge (Phase 5): sample cases for a competitive-programming
// solution, run the way Codeforces would run them. Paste the sample input
// and expected output from the problem page, F8, and every case comes back
// AC (accepted), WA (wrong answer), TLE (too slow), RE (crashed) or RAN
// (no expected output to compare with).

import { call } from './rpc.js';
import { h, clear, toast, prompt, debounce, pathText } from './ui.js';
import { tabs, command, runCommand } from './layout.js';
import { activeEditor, openFile } from './editor.js';
import { startRun, finishRun } from './build.js';
import { language } from './lang.js';

const VERDICT = { AC: 'Accepted', WA: 'Wrong answer', TLE: 'Time limit exceeded', RE: 'Runtime error', OLE: 'Too much output', RAN: 'Ran (nothing to compare with)' };

function firstDifference(out, expected) {
  const a = out.split(/\s+/).filter(Boolean), b = expected.split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `token ${i + 1}: got ${a[i] === undefined ? 'nothing' : JSON.stringify(a[i])}, expected ${b[i] === undefined ? 'nothing more' : JSON.stringify(b[i])}`;
  }
  return '';
}

async function openJudge(file) {
  const ed = activeEditor();
  file = typeof file === 'string' ? file : ed && /\.(cpp|cc|cxx|c|rs)$/.test(ed.file) ? ed.file : await call('state.get', { key: 'judge.last', fallback: null });
  const existing = tabs.get('judge');
  if (existing && file && existing.file !== file) { existing.load(file); tabs.focus('judge'); return existing; }
  if (existing) { tabs.focus('judge'); return existing; }
  return tabs.open({
    id: 'judge', kind: 'judge', title: 'Judge', session: { kind: 'judge' },
    render(el) {
      const page = h('div', { class: 'page judge' });
      el.append(page);
      const fileEl = h('span', { class: 'grow judge-file' });
      const tl = h('input', { class: 'field', type: 'number', min: '100', step: '100', style: { width: '8ch' }, title: 'Time limit per case, in milliseconds' });
      const runBtn = h('button', { class: 'btn primary', type: 'button', title: 'Compile with -O2 and run every case (F8, or Ctrl+Enter)' }, 'Run all');
      const addBtn = h('button', { class: 'btn', type: 'button' }, 'Add case');
      const newBtn = h('button', { class: 'btn', type: 'button', title: 'A new solution file from cp/template.cpp (or template.c, in C)' }, 'New problem...');
      const useBtn = h('button', { class: 'btn', type: 'button', title: 'Judge the file you have open instead' }, 'Use current file');
      const summary = h('div', { class: 'judge-summary' });
      const list = h('div', { class: 'judge-cases' });
      page.append(h('div', { class: 'toolbar' }, fileEl, h('label', { class: 'muted' }, 'limit ', tl, ' ms'), runBtn, addBtn, useBtn, newBtn), summary, list,
        h('p', { class: 'muted small' }, 'Output is compared token by token, the way judges do it: spacing and line breaks don\'t matter, numbers with a decimal point may differ by 1e-6. Compiled with -O2 and no sanitizers (gcc for .c files, g++ for .cpp, rustc -O for .rs), like a judge; run it with Ctrl+F9 to get the sanitizers (or, in Rust, the debug build\'s checks).'));
      this.cases = [];
      const save = debounce(() => { if (this.file) call('cp.saveCases', { file: this.file, cases: this.cases, timeLimitMs: +tl.value }); }, 500);
      const draw = (results = []) => {
        clear(list);
        this.cases.forEach((c, i) => {
          const r = results[i];
          const input = h('textarea', { class: 'field mono', rows: 5, spellcheck: 'false', placeholder: 'Input (paste the sample input)' }, c.input);
          const expected = h('textarea', { class: 'field mono', rows: 5, spellcheck: 'false', placeholder: 'Expected output' }, c.expected);
          input.addEventListener('input', () => { c.input = input.value; save(); });
          expected.addEventListener('input', () => { c.expected = expected.value; save(); });
          const del = h('button', { class: 'btn small', type: 'button', title: 'Remove this case' }, '×');
          del.addEventListener('click', () => { this.cases.splice(i, 1); if (!this.cases.length) this.cases.push({ input: '', expected: '' }); save(); draw(); });
          const card = h('div', { class: 'judge-case' + (r ? ' v-' + r.verdict : '') },
            h('div', { class: 'judge-head' }, h('b', {}, `Case ${i + 1}`),
              r ? h('span', { class: 'verdict v-' + r.verdict, title: VERDICT[r.verdict] }, r.verdict) : null,
              r ? h('span', { class: 'muted' }, `${r.ms} ms`) : null,
              r && r.verdict === 'WA' ? h('span', { class: 'muted small grow' }, firstDifference(r.output, c.expected)) : h('span', { class: 'grow' }),
              del),
            h('div', { class: 'judge-io' }, h('label', { class: 'stack' }, h('span', { class: 'muted small' }, 'Input'), input), h('label', { class: 'stack' }, h('span', { class: 'muted small' }, 'Expected'), expected)),
            r ? h('div', { class: 'judge-out' }, h('span', { class: 'muted small' }, r.verdict === 'RE' ? `Output (exit ${r.signal || r.code})` : 'Output'), h('pre', { class: 'output' }, r.output || '(nothing)'),
              r.stderr ? [h('span', { class: 'muted small' }, 'stderr'), h('pre', { class: 'output o-err' }, r.stderr)] : null) : null);
          list.append(card);
        });
      };
      this.load = async (f) => {
        this.file = f || null;
        clear(summary);
        if (!f) {
          fileEl.textContent = 'No solution file: open one, or start a new problem.';
          this.cases = [{ input: '', expected: '' }];
          draw();
          return;
        }
        fileEl.replaceChildren(h('a', { href: '#', onclick: (e) => { e.preventDefault(); openFile(f); } }, pathText(f)));
        call('state.set', { key: 'judge.last', value: f });
        const d = await call('cp.cases', { file: f });
        this.cases = d.cases.length ? d.cases : [{ input: '', expected: '' }];
        tl.value = d.timeLimitMs;
        draw();
      };
      this.run = async () => {
        if (!this.file) return toast('Open a solution file first');
        const t = tabs.get('file:' + this.file);
        if (t && t.dirty) await t.save();
        startRun('Judge');
        runBtn.disabled = true;
        let r;
        try { r = await call('cp.judge', { file: this.file, cases: this.cases, timeLimitMs: +tl.value }); } finally { runBtn.disabled = false; }
        if (!r.compiled) { finishRun({ code: 1, problems: r.problems }, '', 'Judge: compile error'); clear(summary); summary.append(h('span', { class: 'verdict v-CE' }, 'CE'), ' Compile error: see Problems'); draw(); return; }
        const ac = r.results.filter((x) => x.verdict === 'AC').length;
        const judged = r.results.filter((x) => x.verdict !== 'RAN').length;
        finishRun({ code: 0, problems: r.problems }, judged ? `Judge: ${ac}/${judged} accepted` : 'Judge: ran');
        clear(summary);
        const worst = ['RE', 'TLE', 'OLE', 'WA', 'AC', 'RAN'].find((v) => r.results.some((x) => x.verdict === v));
        summary.append(h('span', { class: 'verdict v-' + worst }, worst), ` ${judged ? `${ac} of ${judged} cases accepted` : 'no expected output given'} · slowest ${Math.max(...r.results.map((x) => x.ms))} ms of ${r.timeLimitMs}`);
        draw(r.results);
        this.el.querySelector('.tab-page.active .judge-summary, .judge-summary')?.scrollIntoView({ block: 'nearest' });
      };
      runBtn.addEventListener('click', () => this.run());
      addBtn.addEventListener('click', () => { this.cases.push({ input: '', expected: '' }); save(); draw(); list.lastChild?.querySelector('textarea')?.focus(); });
      useBtn.addEventListener('click', () => { const e = activeEditor(); if (e) this.load(e.file); else toast('Open the solution file in a tab first'); });
      newBtn.addEventListener('click', () => runCommand('judge.new'));
      tl.addEventListener('change', save);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this.run(); } });
      this.load(file);
    },
  });
}

export function initJudge() {
  command('judge.open', 'Judge: test a solution against sample cases', ['F8'], async () => {
    const t = tabs.get('judge');
    if (t && tabs.active() === t && t.run) return t.run();
    return openJudge();
  });
  command('judge.new', 'Judge: new problem from the template...', [], async () => {
    const lang = language();
    const label = { c: 'C', cpp: 'C++', rust: 'Rust' }[lang] || 'C++', ext = { c: 'c', cpp: 'cpp', rust: 'rs' }[lang] || 'cpp';
    const name = await prompt(`New ${label} problem`, `A name for it (the file is cp/problems/<name>.${ext} in your workspace)`, '', { placeholder: 'cf-1850A', hint: 'Switch C / C++ / Rust on the toolbar (Ctrl+Shift+J) for another language.' });
    if (!name) return;
    try {
      const r = await call('cp.newProblem', { name, lang });
      await openFile(r.file);
      const j = await openJudge(r.file);
      if (j && j.load) j.load(r.file);
      toast(r.from ? `Started from ${r.from.split('/').slice(-2).join('/')}` : 'Started from a built-in template', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}
export { openJudge };
