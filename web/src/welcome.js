// The tutorial: a first-run checklist that walks through every part of the
// app using the vault's own lessons, plus the keyboard reference.

import { call } from './rpc.js';
import { h, clear } from './ui.js';
import { tabs, command, commands, runCommand } from './layout.js';
import { THEMES, themeName } from './themes.js';

const STEPS = [
  { id: 'look', title: 'Pick a look', body: 'Four themes: the blue installer, Turbo C++, Norton Commander, and a modern dark one. Options menu (Alt+O) switches any time.', theme: true },
  { id: 'folders', title: 'Copy the vault\'s code out, and point the app at it', body: 'CPP Start Here: your working copy of _code lives outside the vault, in ~/cpp-path. This copies it (never overwriting anything you already have) and makes it the workspace. Settings has the vault folder, for the guides.', actions: [['Copy the code to ~/cpp-path', 'vault.copyCode'], ['Settings', 'app.settings']] },
  { id: 'tools', title: 'Check the tools are installed', body: 'g++, CMake, gdb, clangd, clang-tidy and cppcheck (note 0.1). This lists what\'s missing and the line that installs it (apt on Ubuntu, dnf on Fedora).', actions: [['Which tools are installed?', 'help.tools']] },
  { id: 'build', title: 'Configure, build, and see 60 tests pass', body: 'Alt+F9 configures (the first time it fetches Catch2, so it takes a minute), F9 builds. F7 runs ctest: the library and the five projects\' solutions, 60 tests, all green. Milestone M1 in CPP Start Here.', actions: [['Configure (Alt+F9)', 'build.configure'], ['Build (F9)', 'build.build'], ['Run the tests (F7)', 'test.all']] },
  { id: 'hello', title: 'Run something in the sandbox', body: 'F4 opens the C++ sandbox: one scratch file, compiled with warnings and the sanitizers on. Ctrl+F9 runs it in the terminal. "Assembly" shows what the compiler made of it, line by line.', actions: [['Open the sandbox', 'sandbox.open', 'Hello, C++']] },
  { id: 'break', title: 'Break something on purpose', body: 'Load "Break it: dangling reference into a vector". AddressSanitizer stops the program; the line turns red in the editor and lands in Problems. The ship\'s computer shouting "proximity alert" before you hit the asteroid.', actions: [['Load the broken program', 'sandbox.open', 'Break it: dangling reference into a vector (ASan)']] },
  { id: 'guide', title: 'Read with the guides open', body: 'F1 shows your vault. Code blocks have buttons: "Try in sandbox" for programs, "Paste into terminal" for commands (_code becomes your ~/cpp-path; it waits for you to press Enter). _code/... paths open your copy of the file.', actions: [['CPP Start Here', 'guides.open', 'CPP Start Here'], ['1.01 The compile-link model', 'guides.open', '1.01 Why CPP and the Compile-Link Model']] },
  { id: 'project', title: 'Turn a project stub green', body: 'The Tests sidebar lists P01-P05. ▶ builds your stub and runs its tests ("2/7" means two test cases pass). Open the stub, write the code, ▶ again. Shift+F7 runs just the TEST_CASE your cursor is in. ☼ peeks at the solution, if you must.', actions: [['Tests sidebar', 'test.show'], ['P01 Text Statistics', 'guides.open', 'P01 Text Statistics']] },
  { id: 'debug', title: 'Step through it in gdb', body: 'Put the cursor on a line and press Ctrl+Shift+D: it builds that program and starts gdb stopped there, with LeakSanitizer switched off the way note 4.03 explains. n, s, p x, bt, c.', actions: [['Note 4.03: gdb', 'guides.open', '4.03 Debugging with gdb']] },
  { id: 'lint', title: 'Ask two analyzers', body: 'Ctrl+Shift+K runs clang-tidy on the file, Ctrl+Shift+U runs cppcheck (note 4.04). Try both on examples/16_static_analysis_demo.cpp: same bug, two vantage points.', actions: [['Note 4.04', 'guides.open', '4.04 Static Analysis - clang-tidy and cppcheck']] },
  { id: 'judge', title: 'Judge a competitive-programming solution', body: 'F8 opens the judge for the file you\'re in. Paste a problem\'s sample input and output, F8 again: AC, WA, TLE or RE per case, timed, compiled with -O2 like Codeforces. "New problem..." starts from cp/template.cpp.', actions: [['Open the judge', 'judge.open'], ['New problem...', 'judge.new']] },
  { id: 'git', title: 'Commit it', body: 'F6 shows git. Stage whole files or single hunks from the diff, write a subject line, Ctrl+Enter commits.', actions: [['Git', 'git.show'], ['Git log', 'git.log']] },
  { id: 'revise', title: 'Revise', body: 'Flashcards from the vault: every check-yourself question, every "Why this matters", and the cheat-sheet tables. Space shows the answer, 1/2/3 grades it; the ones you miss come back first.', actions: [['Revise', 'revise.open']] },
  { id: 'irc', title: 'Say hello on IRC', body: 'Settings → IRC: your nick, and a SASL login once you\'ve registered it with NickServ (the password goes in the keyring). #c++-basic on Libera.Chat is the channel for learners. Lurk first; paste code with a paste site, not into the channel.', actions: [['IRC', 'irc.open']] },
  { id: 'dos', title: 'Optional: the DOS retro track', body: 'Note 0.4. With Open Watcom and DOSBox-X installed, open dos/hello.cpp and use Tools → DOS retro track → compile and run: C++ the way it looked on a 1991 PC.', actions: [['Note 0.4', 'guides.open', '0.4 DOSBox-X and Open Watcom - The DOS Retro Track']] },
  { id: 'music', title: 'Music while you work', body: 'Tools → Music opens YouTube Music\'s own player in a tab. It keeps playing when you switch tabs; your keyboard\'s media keys work.', actions: [['Music', 'music.open']] },
];

async function openWelcome() {
  tabs.open({
    id: 'welcome', kind: 'welcome', title: 'Start here', session: { kind: 'welcome' },
    async render(el) {
      const page = h('div', { class: 'page' });
      el.append(page);
      const done = new Set(await call('state.get', { key: 'welcome.done', fallback: [] }));
      const save = () => call('state.set', { key: 'welcome.done', value: [...done] });
      page.append(h('div', { class: 'md' },
        h('h1', {}, 'C++ Path Workbench'),
        h('p', {}, 'Everything for the C++ path in one window: an editor that knows C++ (clangd), CMake and CTest, gdb, the sanitizers, clang-tidy and cppcheck, a C++ sandbox with an assembly view, a judge for competitive programming, a terminal, git, your vault\'s guides and flashcards, IRC, mail and music. Work down the list; tick each one off when you have done it.'),
        h('p', { class: 'muted' }, 'F10 opens the menus. Every function key is on the bar at the bottom.')));
      const list = h('ol', { class: 'steps md' });
      for (const s of STEPS) {
        const li = h('li', { class: 'step' + (done.has(s.id) ? ' done' : '') });
        const box = h('button', { type: 'button', title: 'Tick this off', 'aria-pressed': String(done.has(s.id)) }, done.has(s.id) ? '[X]' : '[ ]');
        box.addEventListener('click', () => {
          if (done.has(s.id)) done.delete(s.id); else done.add(s.id);
          li.classList.toggle('done', done.has(s.id)); box.textContent = done.has(s.id) ? '[X]' : '[ ]'; box.setAttribute('aria-pressed', String(done.has(s.id)));
          save();
        });
        li.append(h('h3', {}, box, s.title), h('p', {}, s.body));
        if (s.theme) {
          const row = h('div', { class: 'row' });
          for (const [k, t] of Object.entries(THEMES)) {
            const b = h('button', { class: 'choice', type: 'button', 'aria-pressed': String(themeName() === k) }, t.label);
            b.addEventListener('click', async () => { await runCommand('theme.set', k); row.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); });
            row.append(b);
          }
          li.append(row);
        }
        if (s.actions) li.append(h('div', { class: 'row' }, s.actions.map(([label, cmd, arg]) => h('button', { class: 'btn', type: 'button', onclick: () => runCommand(cmd, ...(arg ? [arg] : [])) }, label))));
        list.append(li);
      }
      page.append(list);
    },
  });
}

function openKeys() {
  tabs.open({
    id: 'keys', kind: 'keys', title: 'Keys',
    render(el) {
      const rows = [...commands.values()].filter((c) => c.keys.length).sort((a, b) => a.title.localeCompare(b.title));
      el.append(h('div', { class: 'page' }, h('div', { class: 'md' },
        h('h1', {}, 'Keyboard'),
        h('p', {}, 'With Vim or Emacs keys on, those keys go to the editor and terminal first; F-keys and Ctrl+Shift combinations always reach the app. With Vim keys, the same commands as the vault\'s cpp-path.lua: :CMakeConfigure :CMakeBuild :CTestAll :CTestHere (or \\cc \\cb \\ct \\cf), plus :w :q :wq :make :Format :Judge, gd and gr. With Emacs keys: C-x C-s save, C-x C-f open, M-. definition, M-? references, C-c c build, C-c r run, C-c t tests.'),
        h('table', { class: 'keys-table' }, rows.map((c) => h('tr', {}, h('td', {}, c.keys.map((k) => h('span', { class: 'kbd' }, k)).reduce((a, k) => (a.length ? [...a, ' ', k] : [k]), [])), h('td', {}, c.title)))),
        h('h2', {}, 'In the mail tab'),
        h('p', {}, 'j/k move · Enter read · q back · Space page down · r reply · g reply all · L reply to list · m new · A git am · c folder · $ refresh'),
        h('h2', {}, 'In IRC'),
        h('p', {}, '/join #chan · /part · /msg nick text · /me · /nick · /topic · /whois · /ns (NickServ) · /raw · /close · Tab completes nicks · Up/Down history · Alt+1..9 buffers'))));
    },
  });
}

async function about() {
  const info = await call('app.info');
  const { dialog } = await import('./ui.js');
  dialog({ title: 'About', body: h('div', {}, h('p', {}, `C++ Path Workbench ${info.version}`), h('p', {}, 'Made for the CPP-Path vault, from the same parts as the Kernel Path Workbench. GPL-2.0; the VGA font is drawn from the Linux kernel\'s font_8x16.c.'), h('p', { class: 'muted' }, `Settings: ${info.configFile}`)) });
}

export function initWelcome() {
  command('help.welcome', 'Start here (tutorial)', [], openWelcome);
  command('help.keys', 'Keyboard shortcuts', ['Ctrl+Shift+?'], openKeys);
  command('help.about', 'About', [], about);
}
