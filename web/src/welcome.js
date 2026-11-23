// The tutorial: a first-run checklist that walks through every part of the
// app using the vault's own lessons, plus the keyboard reference.

import { call } from './rpc.js';
import { h, clear } from './ui.js';
import { tabs, command, commands, runCommand } from './layout.js';
import { THEMES, PALETTES, themeName } from './themes.js';

const STEPS = [
  { id: 'look', title: 'Pick a look', body: 'The blue installer, Turbo C++, Norton Commander, an amber CRT, and a modern dark one. The retro ones use soft colours that are easy on an LCD; Options → Retro colours has the authentic VGA palette, and Options → Retro font a smooth font that works at any size.', theme: true },
  { id: 'lang', title: 'C or C++?', body: 'The switch at the left of the toolbar (or Ctrl+Shift+J, or the language on the status line) picks what you\'re working in: new files and projects, the sandbox and the judge follow it. A .c file is always C and a .cpp file always C++; a .h header follows the switch. Settings has the C and C++ compilers and standards.', actions: [['C', 'lang.set', 'c'], ['C++', 'lang.set', 'cpp']] },
  { id: 'exercises', title: 'Do an exercise, one step at a time', body: 'Learn (on the toolbar) lists the exercises: C basics, C++ basics, a security lab and capture-the-flag puzzles. Each opens your file beside its steps; F7 checks it and says exactly what came back ("got 4, expected 5"). Hints come one at a time; a passed step opens the next. The sanitizers are on, so a memory bug fails a step too.', actions: [['Exercises', 'learn.show'], ['First functions', 'exercise.open', 'c-first-functions']] },
  { id: 'focus', title: 'Focus, and where you were', body: 'Ctrl+Shift+G: name the one thing you\'re doing, pick 10, 25 or 45 minutes, and everything else hides until you\'re done; messages wait. When you come back after a while, "Where was I?" shows your file, your exercise and the note you left. Settings → Comfort: quiet mode, reduced motion, relaxed spacing, a reading font, break reminders.', actions: [['Focus', 'focus.toggle'], ['Where was I?', 'help.where'], ['Comfort settings', 'app.settings']] },
  { id: 'memory', title: 'See memory', body: 'Learn → Visualise memory runs a program one line at a time and draws its variables as boxes and its pointers as arrows: the stack, the heap, NULL. ← and → step backwards and forwards. The best way to understand pointers.', actions: [['Visualise memory', 'memviz.open'], ['C vs C++', 'learn.compare']] },
  { id: 'security', title: 'Security, hands on', body: 'The Security menu: what protections a program was built with (and the same program three ways), a look inside a binary (sections, symbols, strings, disassembly), fuzzing with libFuzzer, and the CERT secure-coding checks. gets, strcpy and friends are underlined in the editor. The security lab and the capture-the-flag puzzles are in Learn.', actions: [['Hardening', 'security.compare'], ['Inspect a binary', 'security.inspect']] },
  { id: 'palette', title: 'Find any command by name', body: 'Ctrl+Shift+P opens the command palette: type a few letters of anything the menus have (build, valgrind, theme, vault...) and press Enter. Each row shows its key, so you pick up the shortcuts as you go.', actions: [['Command palette', 'app.palette']] },
  { id: 'folders', title: 'Copy the vault\'s code out, and point the app at it', body: 'CPP Start Here: your working copy of _code lives outside the vault, in ~/cpp-path. This copies it (never overwriting anything you already have) and makes it the workspace. File → Add folder puts more folders beside it in Files.', actions: [['Copy the code to ~/cpp-path', 'vault.copyCode'], ['Settings', 'app.settings']] },
  { id: 'vaults', title: 'Open all your vaults', body: 'Guides shows every vault you add, side by side, each in its own section: the CPP-Path vault, a C course, your own notes. Links in a note stay inside its vault; search and the flashcards cover them all (or one).', actions: [['Add a vault', 'vault.add'], ['Guides', 'guides.show']] },
  { id: 'newproj', title: 'Start a project of your own', body: 'File → New project makes a CMake project in C or C++: a program, or a library with tests that F7 runs. Warnings and the sanitizers are on in Debug; there is a .clang-format and a .gitignore, and it can start a git repository.', actions: [['New project...', 'project.new'], ['New file...', 'file.new']] },
  { id: 'tools', title: 'Check the tools are installed', body: 'g++, CMake, gdb, clangd, clang-tidy and cppcheck (note 0.1). This lists what\'s missing and the line that installs it (apt on Ubuntu, dnf on Fedora).', actions: [['Which tools are installed?', 'help.tools']] },
  { id: 'build', title: 'Configure, build, and see 60 tests pass', body: 'Alt+F9 configures (the first time it fetches Catch2, so it takes a minute), F9 builds. F7 runs ctest: the library and the five projects\' solutions, 60 tests, all green. Milestone M1 in CPP Start Here.', actions: [['Configure (Alt+F9)', 'build.configure'], ['Build (F9)', 'build.build'], ['Run the tests (F7)', 'test.all']] },
  { id: 'hello', title: 'Run something in the sandbox', body: 'F4 opens the sandbox for the language you\'re in: one scratch file each for C and C++, compiled with warnings and the sanitizers on. Ctrl+F9 runs it in the terminal, "Valgrind" runs it under memcheck, and "Assembly" shows what the compiler made of it, line by line.', actions: [['C++ sandbox', 'sandbox.open', 'Hello, C++'], ['C sandbox', 'sandbox.open', 'Hello, C']] },
  { id: 'break', title: 'Break something on purpose', body: 'Load "Break it: dangling reference into a vector". AddressSanitizer stops the program; the line turns red in the editor and lands in Problems. The ship\'s computer shouting "proximity alert" before you hit the asteroid.', actions: [['Load the broken program', 'sandbox.open', 'Break it: dangling reference into a vector (ASan)']] },
  { id: 'guide', title: 'Read with the guides open', body: 'F1 shows your vault. Code blocks have buttons: "Try in sandbox" for programs, "Paste into terminal" for commands (_code becomes your ~/cpp-path; it waits for you to press Enter). _code/... paths open your copy of the file.', actions: [['CPP Start Here', 'guides.open', 'CPP Start Here'], ['1.01 The compile-link model', 'guides.open', '1.01 Why CPP and the Compile-Link Model']] },
  { id: 'project', title: 'Turn a project stub green', body: 'The Tests sidebar lists P01-P05. ▶ builds your stub and runs its tests ("2/7" means two test cases pass). Open the stub, write the code, ▶ again. Shift+F7 runs just the TEST_CASE your cursor is in. ☼ peeks at the solution, if you must.', actions: [['Tests sidebar', 'test.show'], ['P01 Text Statistics', 'guides.open', 'P01 Text Statistics']] },
  { id: 'debug', title: 'Step through it in gdb', body: 'Put the cursor on a line and press Ctrl+Shift+D: it builds that program (a CMake target, or a lone .c / .cpp file) and starts gdb stopped there, with LeakSanitizer switched off the way note 4.03 explains. n, s, p x, bt, c. Build → Run under Valgrind is the other half of note 4.03.', actions: [['Note 4.03: gdb', 'guides.open', '4.03 Debugging with gdb']] },
  { id: 'lint', title: 'Ask two analyzers', body: 'Ctrl+Shift+K runs clang-tidy on the file, Ctrl+Shift+U runs cppcheck (note 4.04). Try both on examples/16_static_analysis_demo.cpp: same bug, two vantage points.', actions: [['Note 4.04', 'guides.open', '4.04 Static Analysis - clang-tidy and cppcheck']] },
  { id: 'judge', title: 'Judge a competitive-programming solution', body: 'F8 opens the judge for the file you\'re in. Paste a problem\'s sample input and output, F8 again: AC, WA, TLE or RE per case, timed, compiled with -O2 like Codeforces. "New problem..." starts from cp/template.cpp.', actions: [['Open the judge', 'judge.open'], ['New problem...', 'judge.new']] },
  { id: 'git', title: 'Checkpoints, and git', body: 'The Checkpoint button saves everything as it is now; Git → Go back returns to any checkpoint (saving the present first, so nothing is lost). F6 shows git itself: stage files or single hunks, write a subject line, Ctrl+Enter commits. Learn → Project journal keeps a few lines a day next to the code.', actions: [['Save a checkpoint', 'git.checkpoint'], ['Git', 'git.show'], ['Journal', 'journal.open']] },
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
        h('p', {}, 'Everything for learning and writing C and C++ in one window: an editor that knows both (clangd, or snippets and an outline without it), CMake and CTest, gdb, Valgrind and the sanitizers, clang-tidy and cppcheck, a C and a C++ sandbox with an assembly view, a judge for competitive programming, a terminal, git, your vaults\' guides and flashcards, IRC, mail and music. Work down the list; tick each one off when you have done it.'),
        h('p', { class: 'muted' }, 'F10 opens the menus, Ctrl+Shift+P finds any command by name. Every function key is on the bar at the bottom.')));
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
        if (s.theme) li.append(h('div', { class: 'row' }, Object.entries(PALETTES).map(([k, label]) => h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('look.palette', k) }, label)),
          h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('look.font', 'modern') }, 'Smooth font'), h('button', { class: 'btn small', type: 'button', onclick: () => runCommand('look.font', 'vga') }, 'VGA font')));
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
        h('p', {}, 'Ctrl+Shift+P finds any command by name, with its key. With Vim or Emacs keys on, those keys go to the editor and terminal first; F-keys and Ctrl+Shift combinations always reach the app. With Vim keys, the same commands as the vault\'s cpp-path.lua: :CMakeConfigure :CMakeBuild :CTestAll :CTestHere (or \\cc \\cb \\ct \\cf), plus :w :q :wq :make :Format :Judge, :A (header ↔ source), gd and gr. With Emacs keys: C-x C-s save, C-x C-f open, M-. definition, M-? references, C-c o header ↔ source, C-c c build, C-c r run, C-c t tests.'),
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
  dialog({ title: 'About', body: h('div', {}, h('p', {}, `C++ Path Workbench ${info.version}: C and C++`), h('p', {}, 'Made for the CPP-Path vault (and any other vaults you add), from the same parts as the Kernel Path Workbench. GPL-2.0; the VGA font is drawn from the Linux kernel\'s font_8x16.c.'), h('p', { class: 'muted' }, `Settings: ${info.configFile}`)) });
}

export function initWelcome() {
  command('help.welcome', 'Start here (tutorial)', [], openWelcome);
  command('help.keys', 'Keyboard shortcuts', ['Ctrl+Shift+?'], openKeys);
  command('help.about', 'About', [], about);
}
