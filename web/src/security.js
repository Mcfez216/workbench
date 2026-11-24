// The Security menu: how a program is protected (and the same program built
// three ways, to see what each flag changes), a look inside a binary,
// fuzzing with libFuzzer, clang-tidy's secure-coding checks, and, in the
// editor, the functions that can't be used safely, underlined.

import { call } from './rpc.js';
import { h, clear, toast, dialog, pathText } from './ui.js';
import { tabs, command, runCommand, panel, status } from './layout.js';
import { activeEditor, openFile } from './editor.js';
import { startRun, finishRun } from './build.js';
import { functionAt } from './outline.js';
import { BANNED } from './banned.js';

// ------------------------------------------------------------------ which program?
async function pickBinary(title) {
  const t = activeEditor();
  const r = await call('security.binaries', { file: t ? t.file : null });
  const items = r.binaries;
  return dialog({
    title, width: '52em', buttons: [{ label: 'Cancel', value: null }, { label: 'Another file...', value: 'other' }],
    body: h('div', { class: 'pick-list' }, items.length ? items.map((b) => h('button', { type: 'button', class: 'list-row pick', 'data-path': b.path }, h('span', { class: 'grow' }, b.label), h('span', { class: 'muted path' }, pathText(b.path))))
      : h('p', { class: 'muted' }, 'No built programs found near this file. Build one (F9), run the sandbox, or choose another file.')),
    onOpen(box, done) { box.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => done(b.dataset.path))); },
  }).then(async (v) => {
    if (v !== 'other') return v;
    const { prompt } = await import('./ui.js');
    const p = await prompt(title, 'Path to the program', t ? t.file.replace(/\.[^./]+$/, '') : '~/');
    return p ? p.replace(/^~(?=\/|$)/, (await call('app.info')).home) : null;
  });
}

// ------------------------------------------------------------------ hardening
const mark = (on) => h('span', { class: on ? 'sec-on' : 'sec-off' }, on ? '✓' : '✗');
async function hardening(exe) {
  exe = typeof exe === 'string' ? exe : await pickBinary('Which program?');
  if (!exe) return;
  let r;
  try { r = await call('security.checksec', { exe }); } catch (err) { return toast(err.message, 'error'); }
  tabs.open({
    id: 'hardening', kind: 'hardening', title: 'Hardening', session: null,
    render(el) { this.page = h('div', { class: 'page' }); el.append(this.page); },
  });
  const t = tabs.get('hardening');
  clear(t.page);
  t.page.append(h('div', { class: 'md' }, h('h1', {}, 'How is it protected?'), h('p', { class: 'muted path' }, pathText(r.exe)),
    h('p', {}, 'Each line is a protection the compiler and linker can build in. None of them fixes a bug: they make a bug much harder to turn into an attack.')),
  h('table', { class: 'sec-table' }, h('tr', {}, h('th', {}, ''), h('th', {}, 'Protection'), h('th', {}, 'Here'), h('th', {}, 'What it stops'), h('th', {}, 'How to turn it on')),
    r.items.map((x) => h('tr', {}, h('td', {}, x.id === 'symbols' || x.id === 'sanitizers' ? h('span', { class: 'muted' }, '·') : mark(x.on)), h('td', {}, x.name), h('td', {}, x.state), h('td', {}, x.what), h('td', {}, h('code', {}, x.how))))),
  h('div', { class: 'row', style: { marginTop: '1em' } },
    h('button', { class: 'btn', type: 'button', onclick: () => hardening() }, 'Another program...'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => compare() }, 'Build the sandbox program three ways and compare')));
}

async function compare() {
  const sb = tabs.get('sandbox');
  if (!sb || !sb.view) { await runCommand('sandbox.open'); toast('Here\'s the sandbox: put a program in it, then compare again.', 'info', 6000); return; }
  startRun('Hardening: three builds');
  let r;
  try { r = await call('security.compare', { source: sb.view.state.doc.toString(), lang: sb.langId }); }
  catch (err) { status.set('build', ''); return toast(err.message, 'error'); }
  finishRun({ code: 0, problems: [] }, 'Hardening: built three ways');
  tabs.open({ id: 'hardening', kind: 'hardening', title: 'Hardening', render(el) { this.page = h('div', { class: 'page' }); el.append(this.page); } });
  const t = tabs.get('hardening');
  clear(t.page);
  const ok = r.variants.filter((v) => v.ok);
  const same = ok.length === 3 && JSON.stringify(ok[1].checks.map((c) => c.state)) === JSON.stringify(ok[2].checks.map((c) => c.state));
  t.page.append(h('div', { class: 'md' }, h('h1', {}, 'The same program, three ways'), h('p', {}, `The sandbox program, built with ${r.compiler}: everything switched off, the compiler's own defaults, and fully hardened.`),
    same ? h('p', { class: 'muted' }, 'Your compiler\'s defaults are already hardened (Ubuntu and Fedora build this way out of the box). The "everything off" column is what a program from an old compiler, or built carelessly, looks like.') : null),
  h('table', { class: 'sec-table' },
    h('tr', {}, h('th', {}, 'Protection'), r.variants.map((v) => h('th', {}, v.label))),
    (ok[0] ? ok[0].checks : []).filter((c) => c.id !== 'sanitizers').map((c, i) => h('tr', {}, h('td', { title: c.what }, c.name), r.variants.map((v) => h('td', {}, v.ok ? [mark(v.checks[i].on), ' ', v.checks[i].state] : 'build failed')))),
    h('tr', {}, h('td', {}, 'Size'), r.variants.map((v) => h('td', {}, v.ok ? `${(v.size / 1024).toFixed(1)} KB` : ''))),
    h('tr', {}, h('td', {}, 'Flags'), r.variants.map((v) => h('td', {}, h('code', { class: 'small' }, v.flags.join(' ')))))),
  h('p', { class: 'muted small' }, 'Try it: put "Break it: stack buffer overflow" in the C sandbox, compare, then run each program from the binary inspector\'s folder. The canary turns a silent overwrite into "stack smashing detected".'),
  h('div', { class: 'row' }, ok.map((v) => h('button', { class: 'btn small', type: 'button', onclick: () => inspect(v.exe) }, `Inspect: ${v.label}`))));
}

// ------------------------------------------------------------------ the binary inspector
async function inspect(exe) {
  exe = typeof exe === 'string' ? exe : await pickBinary('Inspect which program?');
  if (!exe) return;
  const t = tabs.open({
    id: 'inspect', kind: 'inspect', title: 'Inspect',
    render(el) {
      this.views = ['overview', 'sections', 'symbols', 'strings', 'disasm'];
      this.labels = { overview: 'Overview', sections: 'Sections', symbols: 'Symbols', strings: 'Strings', disasm: 'Disassembly' };
      this.bar = h('div', { class: 'choices', role: 'tablist' });
      this.filter = h('input', { class: 'field', type: 'search', placeholder: 'Filter', 'aria-label': 'Filter' });
      this.head = h('span', { class: 'muted path grow' });
      this.body = h('div', { class: 'page inspect-body' });
      el.append(h('div', { class: 'toolbar' }, this.bar, this.filter, this.head, h('button', { class: 'btn small', type: 'button', onclick: () => inspect() }, 'Another program...'), h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('term.new', this.exe.replace(/\/[^/]+$/, '')) }, 'Terminal there')), this.body);
      for (const v of this.views) {
        const b = h('button', { type: 'button', class: 'choice', 'data-v': v }, this.labels[v]);
        b.addEventListener('click', () => this.show(v));
        this.bar.append(b);
      }
      this.filter.addEventListener('input', () => this.draw());
      this.show = async (v, symbol) => {
        this.view = v;
        this.bar.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === v)));
        clear(this.body).append(h('p', { class: 'muted' }, 'Reading...'));
        try { this.data = await call('security.inspect', { exe: this.exe, what: v, symbol }); } catch (err) { clear(this.body).append(h('p', {}, err.message)); return; }
        this.draw();
      };
      this.draw = () => {
        const d = this.data, f = this.filter.value.trim().toLowerCase();
        const keep = (s) => !f || String(s).toLowerCase().includes(f);
        clear(this.body);
        if (this.view === 'overview') {
          this.body.append(h('div', { class: 'md' }, h('h2', {}, d.exe.split('/').pop()),
            h('table', { class: 'keys-table' }, [['Size', `${(d.size / 1024).toFixed(1)} KB`], ['Format', `${d.class}, ${d.machine}`], ['Type', d.type], ['Starts at', d.entry], ['Libraries', d.libs.join(', ') || 'none (static)']].map(([k, v]) => h('tr', {}, h('td', { class: 'muted' }, k), h('td', {}, v)))),
            h('h3', {}, 'Protections'), h('table', { class: 'keys-table' }, d.checksec.map((x) => h('tr', {}, h('td', {}, x.name), h('td', {}, x.state)))),
            h('p', { class: 'muted small' }, 'Sections: how the file is laid out. Symbols: the names in it (functions, globals). Strings: readable text inside (passwords hide here more often than you\'d think). Disassembly: the machine code, as instructions.')));
        } else if (this.view === 'sections') {
          this.body.append(h('table', { class: 'sec-table mono' }, h('tr', {}, ['Name', 'Type', 'Address', 'Size', 'Flags'].map((x) => h('th', {}, x))),
            d.rows.filter((r) => keep(r.name)).map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.type), h('td', {}, r.addr), h('td', {}, String(r.size)), h('td', { title: 'A alloc · W write · X execute' }, r.flags)))),
          h('p', { class: 'muted small' }, '.text is the code (flags AX: loaded, executable), .rodata constants and string literals, .data and .bss global variables, .got / .plt the tables used to call shared libraries.'));
        } else if (this.view === 'symbols') {
          this.body.append(h('p', { class: 'muted small' }, 'Click a function to disassemble it.'),
            h('table', { class: 'sec-table mono' }, h('tr', {}, ['Address', 'Kind', 'Name'].map((x) => h('th', {}, x))),
              d.rows.filter((r) => keep(r.pretty)).map((r) => h('tr', {}, h('td', {}, r.addr), h('td', {}, r.kind), h('td', {}, /code/.test(r.kind) ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.show('disasm', r.name); } }, r.pretty) : r.pretty)))));
        } else if (this.view === 'strings') {
          this.body.append(h('table', { class: 'sec-table mono' }, h('tr', {}, h('th', {}, 'Offset'), h('th', {}, 'Text')), d.rows.filter((r) => keep(r.text)).slice(0, 2000).map((r) => h('tr', {}, h('td', {}, r.offset), h('td', {}, r.text)))));
        } else {
          const lines = d.text.split('\n').filter((l) => keep(l));
          this.body.append(h('p', { class: 'muted small' }, d.symbol ? `${d.symbol}. Symbols → click another function.` : 'All the code (Symbols → click a function for just that one).'), h('pre', { class: 'disasm' }, lines.join('\n')));
        }
      };
    },
  });
  t.exe = exe;
  t.head.textContent = pathText(exe);
  t.show('overview');
}

// ------------------------------------------------------------------ fuzzing
async function fuzzFile() {
  const t = tabs.active();
  if (t && t.id === 'sandbox' && t.view) return fuzzRun({ source: t.view.state.doc.toString(), lang: t.langId });
  const e = activeEditor();
  if (!e || !/\.(c|cpp|cc|cxx)$/.test(e.file)) return toast('Open a C or C++ file (or the sandbox) to fuzz');
  if (e.dirty) await e.save();
  if (!/LLVMFuzzerTestOneInput/.test(e.view.state.doc.toString())) {
    const f = functionAt(e.view);
    const ok = await dialog({ title: 'Fuzz', width: '46em',
      body: h('div', {}, h('p', {}, `${e.title} has no fuzz target yet: a small function libFuzzer calls with its generated inputs.`), f ? h('p', {}, 'Make one that calls ', h('code', {}, f.name), '?') : h('p', { class: 'muted' }, 'Put the cursor inside the function you want to fuzz, then try again.')),
      buttons: f ? [{ label: 'Cancel', value: false }, { label: `Make fuzz_${f.name}`, value: true, primary: true }] : [{ label: 'OK', value: false, primary: true }] });
    if (!ok) return;
    const r = await call('security.fuzzTemplate', { file: e.file, func: f.name, signature: f.signature });
    await openFile(r.file);
    toast(`${r.existed ? 'Already there' : 'Made'}: ${r.file.split('/').pop()}. Fill in the TODO if there is one, then Security → Fuzz this file.`, 'ok', 9000);
    return;
  }
  return fuzzRun({ file: e.file });
}
async function fuzzRun(args) {
  const secs = await call('state.get', { key: 'fuzz.seconds', fallback: 30 });
  startRun('Fuzz: building with clang');
  let r;
  try { r = await call('security.fuzz', { ...args, seconds: secs }); }
  catch (err) { status.set('build', ''); return toast(err.message, 'error', 10000); }
  finishRun(r, `Fuzzing for ${r.seconds || secs} s`, 'Fuzz target doesn\'t build');
  if (r.ok) { panel.show('terminal'); toast(`Fuzzing for ${r.seconds} seconds. A crash lands in Problems; Security → Fuzz crashes shows the input that did it.`, 'ok', 8000); }
}
async function showCrashes() {
  const t = tabs.active();
  const args = t && t.id === 'sandbox' ? { source: '', lang: t.langId } : { file: activeEditor() ? activeEditor().file : '' };
  if (!args.source && args.file === '') return toast('Open the fuzz target (or the sandbox) first');
  const r = await call('security.crashes', args);
  if (!r.crashes.length) return toast('No crashes found (yet). Fuzz for longer, or the code is solid against what it tried.', 'ok', 6000);
  dialog({ title: `Inputs that crashed it (${r.crashes.length})`, width: 'min(92vw, 90ch)',
    body: h('div', {}, r.crashes.slice(0, 10).map((c) => h('div', { class: 'crash' }, h('div', { class: 'row' }, h('b', {}, c.kind), h('span', { class: 'muted' }, `${c.size} bytes`), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', type: 'button', onclick: () => call('build.runProgram', { cwd: r.dir, command: `'${r.exe}' '${c.file}'`, title: `fuzz: replay ${c.name.slice(0, 14)}` }).then(() => panel.show('terminal')) }, 'Run it again')),
      h('pre', { class: 'hexdump' }, c.hex)))) });
}

// ------------------------------------------------------------------ CERT
async function cert() {
  const t = activeEditor();
  if (!t) return toast('Open a C or C++ file first');
  if (t.dirty) await t.save();
  startRun('clang-tidy: secure coding (CERT)');
  const r = await call('security.cert', { file: t.file });
  finishRun({ ...r, code: r.problems.length ? 1 : 0 }, 'CERT checks: nothing found', `CERT checks: ${r.problems.length} finding${r.problems.length === 1 ? '' : 's'}`);
  if (r.problems.length) panel.show('problems');
}

export function initSecurity() {
  command('security.hardening', 'Hardening: how is this program protected?', [], hardening);
  command('security.compare', 'Hardening: build the sandbox three ways', [], compare);
  command('security.inspect', 'Inspect a binary (sections, symbols, strings, disassembly)', [], inspect);
  command('security.fuzz', 'Fuzz this file (libFuzzer)', [], fuzzFile);
  command('security.fuzzSeconds', 'Fuzz: how long...', [], async () => {
    const { prompt } = await import('./ui.js');
    const s = await prompt('Fuzz for', 'Seconds per run', String(await call('state.get', { key: 'fuzz.seconds', fallback: 30 })));
    if (s && +s > 0) call('state.set', { key: 'fuzz.seconds', value: Math.min(600, Math.round(+s)) });
  });
  command('security.crashes', 'Fuzz crashes: the inputs that did it', [], showCrashes);
  command('security.cert', 'Secure-coding check (clang-tidy CERT rules)', [], cert);
  command('security.banned', 'Unsafe functions: what they are', [], () => dialog({ title: 'Functions to avoid', width: '60em',
    body: h('table', { class: 'sec-table' }, Object.entries(BANNED).map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, v)))) }));
}
