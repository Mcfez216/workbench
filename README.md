# C++ Path Workbench

One window for learning and writing **C and C++**: write it, build it with
CMake (or a lone file with gcc / g++), test it, run it, break it on purpose,
step through it in gdb or Valgrind, ask two static analyzers about it, judge
competitive-programming solutions, commit it, read your notes vaults beside
it, talk about it, revise it, with music on. No plugins: it's all built in.

**C or C++.** The switch at the left of the toolbar (also Ctrl+Shift+J, or
the language on the status line) says what you're working in. New files and
projects, the sandbox and the judge follow it, with their own compiler and
standard (gcc / C17 and g++ / C++20 unless you change them in Settings). A
`.c` file is always C and a `.cpp` file always C++; a `.h` header follows the
switch.

It's the Kernel Path Workbench rebuilt around the CPP-Path vault. The two
install side by side: different name, icon, settings folder and window.
**Windows** (10 and 11, one double-click), Ubuntu and Fedora.

| Part | What it does |
|---|---|
| **Editor** | CodeMirror with the vault's C/C++ style (4 spaces, a mark after column 100, like `cpp-path.lua`; tabs and trailing spaces show up). clangd for completion, errors as you type, hover, go to definition (F12), references, rename, and **format** (Ctrl+Shift+O, clang-format through clangd). **Vim** keys by default with the same commands as `cpp-path.lua`; Standard or Emacs keys in Settings. |
| **Start screen** | What you see with nothing open: the C / C++ switch, New project / New file / Open, your recent files and folders, and your vaults. Help → Start screen opens it as a tab. |
| **Command palette** | Ctrl+Shift+P: every command the menus have, found by typing a few letters, with its key beside it. |
| **Toolbar** | The C / C++ switch, New ▾, Open, Save, Build, Run, Debug, Test, Sandbox, Judge, Guides, Commands. View → Show/hide toolbar. |
| **New project** | File → New project: a CMake project in C (C17) or C++ (C++20), either one program or a library with tests CTest runs (plain test programs, nothing to download). Warnings on, ASan + UBSan in Debug, a `.clang-format`, a `.gitignore`, optionally `git init`. |
| **New file** | Ctrl+N: a program with `main`, an empty source file, a header (include guard in C, `#pragma once` in C++), or a C++ class / C module as a header + source pair. Alt+F12 (`:A` in Vim, `C-c o` in Emacs) switches between a header and its source. |
| **Outline** | Ctrl+Shift+B: the functions, structs, classes, enums, typedefs and macros in the file, from the editor's own parse, so it works without clangd. |
| **Build** | F9 builds with **CMake**: the build directory is `build/` next to the top `CMakeLists.txt`, the same one Neovim's `:CMakeBuild` and the notes use, Debug by default so ASan and UBSan are on. The first build configures (Alt+F9 does it on its own). Errors land in **Problems**; click one to jump there. A template error deep in `<map>` points at **your** line, with the library's notes folded under it. Alt+F8 / Alt+F7 step through them, Turbo C++ style. A `.c` or `.cpp` file outside any CMake project builds on its own with gcc or g++. |
| **Run** | Ctrl+F9 builds the program the file belongs to and runs it in a terminal, so `std::cin` works. When AddressSanitizer or UBSan stops it, the line turns **red** in the editor with what happened under it, and it's in Problems (with where the memory was freed and allocated). "Run with arguments..." remembers them per file. |
| **Debug** | Ctrl+Shift+D: builds the program (a CMake target, or a lone `.c` / `.cpp` file) and starts **gdb** stopped at the line your cursor is on, with LeakSanitizer switched off as note 4.03 explains. |
| **Valgrind** | Build → Run under Valgrind: memcheck on a lone file or the sandbox (built without the sanitizers, which can't share a program with Valgrind), or on a CMake target when the build type isn't Debug. Leaks, uninitialised reads, bad frees. |
| **Tests** | F7 runs **ctest** (the library and the five solutions: 60 tests). The **Tests** sidebar ticks them off as they finish; click a test to jump to its `TEST_CASE`, ▶ to run just that one. Shift+F7 runs the `TEST_CASE` the cursor is in. |
| **Projects** | The Tests sidebar lists P01-P05. ▶ builds your **stub** and runs its tests: "3/9" means three test cases pass so far. ? opens the project note, ☼ peeks at the solution (it asks first). A test file's Shift+F7 runs against your stub, not the solution. |
| **Sandbox** | F4. A scratch file for the language you're in: C (gcc or clang, C89-C23) or C++ (g++ or clang++, C++17/20/23), each with its own file, warnings and sanitizers on, and examples. C++: references, RAII, move semantics, smart pointers, the STL, and "break it" (use after free, a dangling reference into a vector, one past the end, a missing virtual destructor, signed overflow, a leak). C: pointers and arrays, structs and malloc, safe strings, qsort, scanf, and "break it" (use after free, stack buffer overflow, one past the end of malloc, double free, a pointer to a dead local, signed overflow, a leak, and an uninitialised read only **Valgrind** catches). **Assembly** shows what the compiler made of it, Compiler Explorer style: directives stripped, names demangled, and the instructions from the line your cursor is on highlighted. |
| **Judge** | F8, for Phase 5 and Codeforces/LeetCode, in C or C++. Paste the sample input and expected output, F8 again: **AC**, **WA** (with the first differing token), **TLE**, **RE** per case, timed, compiled with -O2 like a judge. "New problem..." starts `cp/problems/<name>.cpp` from `cp/template.cpp`. Cases are remembered per file. |
| **Analysis** | Ctrl+Shift+K runs **clang-tidy** (with `build/compile_commands.json`), Ctrl+Shift+U runs **cppcheck** (note 4.04), as C for `.c` files. Findings go to Problems. Ctrl+Shift+O formats with clang-format (through clangd, or clang-format itself when clangd is off). |
| **DOS** | Tools → DOS retro track: compile the open file with Open Watcom (`owcc -bt=dos`) and run it in DOSBox-X (note 0.4), if you've installed them. |
| **Terminal** | F5. Real shells, several at once, still there when the window reloads. "Paste into terminal" on a note's commands goes to a shell, never into a program you're running, and `_code` becomes your `~/cpp-path`. |
| **Git** | F6. What changed, stage a file or one hunk, commit (Signed-off-by is there, off by default), amend, branches, the log, format-patch. One click adds `build/` and `.cache/` (clangd's index) to `.gitignore`. |
| **Guides** | F1. **All your vaults at once**: the CPP-Path vault, a C course, your own notes, each in its own section of the sidebar (fold it away, open its start note, search just it, remove it). A `[[link]]` looks in its own note's vault first, so two vaults can both have a "Pointers" note. Rendered with callouts, tables, `[[links]]`, and buttons on code blocks: **Copy**, **Paste into terminal**, **Try in sandbox**. `_code/...` paths open your copy of the file. |
| **Revise** | Ctrl+Shift+V. Flashcards from every vault (or one) in three decks: every check-yourself question, every "Why this matters", and the cheat-sheet tables (which container, what an ASan error means), with a Leitner schedule. |
| **IRC** | Tools → IRC (Ctrl+Shift+L). Libera.Chat, `#c++-basic` to start. Logs in with SASL (the password lives in the GNOME keyring) or a CertFP certificate. |
| **Mail** | Tools → Mail (Ctrl+Shift+M). The NeoMutt-style Gmail reader from the Kernel Path Workbench. |
| **Music** | Tools → Music. YouTube Music's own player in a tab. |

Five looks, from **Options → Theme** or Ctrl+Shift+Y: **Blue installer**,
**Turbo C++**, **Norton Commander**, **Amber CRT** and **Modern**. The retro
ones keep the DOS frames, title-in-the-border dialogs and drop shadows, but
use **soft colours** by default: the same hues with the brightness and
saturation down (a deep navy instead of full #0000AA blue, amber instead of
#FFFF55 yellow, off-white text, lighter shadows), so they're comfortable on a
modern LCD for hours. **Options → Retro colours → Authentic VGA** brings back
the real palette. **Options → Retro font** swaps the VGA pixel font (sharp
only at 16 or 32 px) for a smooth monospace font at any size, keeping the
retro look.

## Install

**Windows:** double-click **`Install on Windows.cmd`** in the app's folder.
It runs inside WSL (Ubuntu on Windows), so the sanitizers, Valgrind, gdb and
the terminal work exactly as on Linux, and you never have to type a Linux
command. It asks before each big step:

1. turns on WSL if it's off (administrator rights and one restart; it
   carries on by itself when you sign back in) and updates it, for WSLg;
2. uses your Ubuntu, or installs Ubuntu 24.04 (you pick a Linux user name
   and password);
3. copies the app into your Linux home, `~/cpp-path-workbench` (much faster
   builds than on `C:`);
4. installs the compilers and tools, Node.js and the app's packages inside
   Ubuntu (`scripts/wsl-setup.sh`; sudo asks for your Linux password);
5. puts **C++ Path Workbench** in the Start menu and on the desktop.

The shortcut starts it with no console window: in its own window through
WSLg (Windows 11, or 10 with the current WSL), or in your Windows browser
when there's no WSLg. Start menu → *C++ Path Workbench (in your browser)*
always uses the browser. To update, download the new version and run the
installer again (your settings, code and vaults are untouched). *Uninstall
C++ Path Workbench shortcuts* removes what it put on Windows. If it won't
start, the reason pops up, and the details are in
`~/.local/state/cpp-path-workbench/launch.log` in Ubuntu. Your vault can stay
in Documents or OneDrive: the app finds it there.

It runs on Ubuntu 24.04 (22.04 should work too, untested), including
Ubuntu in WSL on Windows (the installer above does all of this for you), and on Fedora. Node.js 22.12 or newer is needed; Ubuntu's own `nodejs` package is
older, so the setup script can add NodeSource's.

**Ubuntu**, or Ubuntu in WSL:

```bash
cd ~/CPP/cpp-path-workbench           # wherever you unzipped it
bash scripts/setup-ubuntu.sh --with-node   # read it first: apt packages + Node.js 22
npm install                           # downloads Electron (about 100 MB)
npm start
npm run install-desktop               # optional: a launcher
```

**Fedora:**

```bash
sudo dnf install nodejs npm python3 gcc-c++ clang clang-tools-extra cmake gdb cppcheck git ripgrep libsecret man-pages
cd ~/src/cpp-path-workbench && npm install && npm start
npm run install-desktop
```

If conda's `(base)` environment is active, run `conda deactivate` first (or
`conda config --set auto_activate_base false`), so `node` and `python3` are
the system ones. `npm install` and `npm start` check the Node version and
say what to do if it's too old.

The first run opens **Start here**, a checklist through every part. It
finds the vault by itself if it's in your home folder, Documents or an
Obsidian folder (the folder with `CPP Start Here.md` in it), and in WSL
also in your Windows Documents, OneDrive and Desktop; otherwise add it with
Guides → Add a vault (or Settings → Guides). Add as many more vaults as you
like the same way: a C course, your own notes, any folder of Markdown. Then step 2, **Copy the code to ~/cpp-path** (it
suggests a folder next to the app instead, like `~/CPP/cpp-path`, if
that's where the app lives): the vault's `_code` folder copied out, the way
CPP Start Here says, without ever
overwriting a file you already have, plus a `.gitignore` for `build/` and
`.cache/`. Then Alt+F9, F9, F7: 60 tests, all green.

Optional, for the DOS track: Open Watcom (`bash scripts/install-open-watcom.sh`
from the vault's code) and DOSBox-X (`setup-ubuntu.sh --with-dos`, or note
0.4 on Fedora). The app finds Open Watcom in `~/opt/open-watcom-2` or
wherever `$WATCOM` points, even if your shell setup hasn't been loaded.
**Help → Which tools are installed?** shows what's missing and the `apt`
(or `dnf`) line for it.

No window? `npm run web` starts the same app and prints an address to open
in a browser (in WSL, your Windows browser works). Everything works there
except the Music tab and the few keys a browser keeps for itself (Ctrl+W,
Ctrl+N, Ctrl+T, Ctrl+Shift+W).

### WSL notes

- The window needs **WSLg**, which comes with Windows 11's WSL (and
  Windows 10's, once updated): `wsl --update` in PowerShell if it's missing. The app draws without the GPU there, which avoids blank
  windows on some graphics drivers; `WORKBENCH_GPU=1 npm start` turns it on. Under WSL the app also turns off animated scrolling and draws through X11, which stops the stuttering wheel scroll; `WORKBENCH_SMOOTH=1` and `WORKBENCH_OZONE=wayland` (or `auto`) undo that. PageUp/PageDown, Space and the arrow keys scroll a guide as soon as you open it.
- Keep your code (`~/cpp-path`) in the Linux home, not under `/mnt/c`:
  builds, git and file watching are many times faster. The vault can stay
  on the Windows side; the app only reads it.
- Links (cppreference, the guides' web links) open in your Windows browser,
  through `wslview` (the setup script installs `wslu`).
- Passwords (IRC, mail) go into GNOME Keyring inside WSL. The first time
  one is stored, a window should ask you to choose a keyring password; after
  a WSL restart it may ask for it again. If the app says no keyring is
  answering, install what the message says and run `wsl --shutdown`.

## Setting up IRC and mail

**IRC.** Settings → IRC: your nick. To log in, register it first (connect,
then `/msg NickServ REGISTER <password> <email>` and confirm the mail).
Then set **Log in** to *SASL password* and press **Set IRC password...**: it
goes into the GNOME keyring with `secret-tool`, never into a file. Or use
*Client certificate (CertFP)* with a PEM holding your certificate and key
(add its fingerprint once with `/msg NickServ CERT ADD`). Commands work as
in WeeChat: `/join`, `/msg`, `/me`, `/nick`, `/whois`, `/ns`, `/close`.

**Mail.** Settings → Mail: your name and Gmail address, then **Set Gmail App
Password** (keyring again, `service neomutt user <address>`, the same entry
NeoMutt and the Kernel Path Workbench use).

The tests run on Ubuntu 24.04; the WSL parts (WSLg window, keyring prompt,
`wslview`, the Windows-side vault search on a real `C:` drive, the Windows
installer and launcher in `windows/`) are written for WSL but were checked on
plain Ubuntu, with WSL simulated.

## Split view

Put a file on one side and a guide on the other. Shift+click a note in Guides (or a file in Files) to open it beside, double-click any tab to send it across, or use View → Move this tab to the other side. Each side keeps its own active tab; tabs on the right are marked ▸. Drag the divider to resize. Double-click a right-hand tab or View → Close the split to go back to one side. The split and the divider position are remembered.

## Keys

| Key | | Key | |
|---|---|---|---|
| Ctrl+Shift+P | Command palette | Ctrl+Shift+J | Switch C / C++ |
| Ctrl+N | New file | Alt+F12 | Header ↔ source |
| Ctrl+Shift+B | Outline | Alt+Z | Word wrap |
| F1 | Guides | F6 | Git |
| F2 / Ctrl+S | Save | F7 | Run all tests |
| F3 / Ctrl+P | Open file | Shift+F7 | The test under the cursor |
| F4 | C++ sandbox | F8 | Judge (again: run the cases) |
| F5 / Ctrl+` | Terminal | F9 | Build |
| Alt+F9 | CMake configure | Ctrl+F9 | Build and run |
| Ctrl+Shift+D | gdb, stopped at this line | Alt+F8 / Alt+F7 | Next / previous problem |
| F12 / Shift+F12 | Definition / references | Ctrl+Shift+O | Format the file |
| Ctrl+Shift+K | clang-tidy | Ctrl+Shift+U | cppcheck |
| Ctrl+Shift+\| | move this tab to the other side (split) | Ctrl+Alt+Shift+\| | jump to the other side |
| Ctrl+Shift+A | Sandbox assembly | Ctrl+Shift+H | Look it up on cppreference |
| Ctrl+Shift+F | Search in files | Ctrl+Shift+V | Revise |
| Ctrl+Shift+T / W | New / close terminal | Ctrl+Shift+Y | Next theme |
| Ctrl+Shift+M / L | Mail / IRC | F10, Alt+letter | Menus |

With Vim or Emacs keys on, the editor and terminal get every key except
F1-F12 and Ctrl+Shift combinations. **Vim**, as in `cpp-path.lua`:
`:CMakeConfigure` `:CMakeBuild` `:CTestAll` `:CTestHere`, or `\cc` `\cb`
`\ct` `\cf`; plus `:w` `:q` `:wq` `:make` `:Format` `:Judge`, `gd`, `gr`.
One Escape leaves insert mode even with the completion list open.
**Emacs**: `C-x C-s`, `C-x C-f`, `M-.`, `M-?`, `C-c c` build, `C-c r` run,
`C-c t` tests.

## How it's built

```
main.js              Electron: the window, the music view's sandbox, links to your browser
server/              the backend (Node), bound to 127.0.0.1
  index.js           HTTP + WebSocket, token and origin checks, content security policy
  cmake.js           CMake (File API for the targets), CTest, the projects, run, gdb, Valgrind
  build.js           single C/C++ files, gdb and Valgrind on them, the C and C++ sandbox and
                     its assembly, clang-tidy, cppcheck, clang-format, DOS
  project.js         new projects (C or C++), file templates, header <-> source
  parse.js           compiler, linker, CMake, Catch2, sanitizer and Watcom output → Problems
  cp.js              the judge
  files.js pty.js    files; shells through a small Python pty helper (no native modules)
  git.js guides.js   git through the git command; the vaults (several at once) and their flashcards
  mail.js irc.js     ImapFlow + Nodemailer; irc-framework with SASL / CertFP
  lsp.js             one clangd per project, messages passed through untouched
  secrets.js         secret-tool (GNOME keyring)
  distro.js          Ubuntu or Fedora, WSL or not: install hints, the Windows-side vault search
windows/             Install.ps1 (WSL, Ubuntu, the app, shortcuts) and Launch.vbs (no console window);
                     "Install on Windows.cmd" runs Install.ps1. scripts/wsl-setup.sh and
                     scripts/wsl-launch.sh are their Linux halves
web/src/             the window: CodeMirror 6, xterm.js, markdown-it, bundled by esbuild
  lang.js            the C / C++ switch          palette.js   the command palette
  start.js           the start screen            newstuff.js  New file / New project dialogs
  outline.js         the Outline sidebar         themes.js    the looks, soft and VGA palettes
test/                npm test
```

Your things: settings in `~/.config/cpp-path-workbench/config.json` (an
older file with a single `"vault"` is read as the first of `"vaults"`); the
sandbox, the judge's cases and flashcard progress in
`~/.local/share/cpp-path-workbench/`. The app writes into your code only
when you save, copy the vault's code, start a new judge problem, or click
the `.gitignore` button; CMake writes `build/` and clangd writes `.cache/`.

**Security.** The backend can run a shell, so it only listens on
127.0.0.1, and every request needs a random 256-bit token that the window
gets once and keeps in an HttpOnly, SameSite=Strict cookie; the WebSocket
must also come from the app's own origin. The window has no Node access,
runs under a strict content security policy, and notes are rendered with
raw HTML switched off. Passwords only ever go to the GNOME keyring.

## Tests

```bash
npm test         # backend + the window in Chromium, against a throwaway CMake project
npm run smoke    # starts the real Electron app, opens the Music tab, checks its isolation
```

`npm test` builds a throwaway home with a small CMake project in git
(a library, tests that print what Catch2 prints, examples, a project stub
and its solution, a judge template) so nothing is downloaded, plus local
IMAP, SMTP and IRC (with SASL) servers. The window part needs Playwright;
without it only the backend runs. `CPW_VAULT=path` points the guide tests
at your vault, `CPW_SHOTS=dir` saves a screenshot of every step.

## Licence

GPL-2.0, like the Kernel Path Workbench it's built from. The VGA font is
drawn from the Linux kernel's `lib/fonts/font_8x16.c` (GPL-2.0).
