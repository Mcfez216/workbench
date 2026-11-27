// Settings: one page for everything in ~/.config/cpp-path-workbench/config.json.
// Passwords never go in there; the mail and IRC buttons store them in the
// GNOME keyring.

import { call } from './rpc.js';
import { h, clear, toast, dialog } from './ui.js';
import { tabs, command, runCommand } from './layout.js';
import { THEMES, PALETTES, applyTheme, themeName, usesPixelFont } from './themes.js';
import { LANGS } from './lang.js';

let onSaved = () => {};
export function onSettingsSaved(fn) { onSaved = fn; }

function field(label, input, hint) {
  return [h('label', { for: input.id }, label), input, hint ? h('div', { class: 'hint small' }, hint) : null];
}
let n = 0;
function text(value, opts = {}) { return h('input', { class: 'field', type: opts.type || 'text', id: 'f' + (++n), value: value ?? '', spellcheck: 'false', placeholder: opts.placeholder || '', autocomplete: 'off' }); }
function check(value) { return h('input', { type: 'checkbox', id: 'f' + (++n), checked: !!value }); }
function choice(options, value) {
  const box = h('div', { class: 'choices', role: 'group' });
  box.value = value;
  for (const [v, label] of options) {
    const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(v === value) }, label);
    b.addEventListener('click', () => { box.value = v; box.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); box.dispatchEvent(new Event('change')); });
    box.append(b);
  }
  return box;
}

async function openSettings() {
  tabs.open({
    id: 'settings', kind: 'settings', title: 'Settings', session: { kind: 'settings' },
    async render(el) {
      const page = h('div', { class: 'page' });
      el.append(page);
      const c = await call('config.get');
      const info = await call('app.info');
      const look = { palette: 'soft', retroFont: 'vga', ...(c.look || {}) };
      const sizes = () => (usesPixelFont(f.theme.value, f.retroFont.value) ? [[16, '16px'], [32, '32px (big)']] : [[13, '13px'], [14, '14px'], [15, '15px'], [16, '16px'], [18, '18px'], [20, '20px'], [24, '24px']]);
      const f = {
        theme: choice(Object.entries(THEMES).map(([k, t]) => [k, t.label]), c.theme),
        palette: choice(Object.entries(PALETTES), look.palette),
        retroFont: choice([['vga', 'VGA pixel font'], ['modern', 'Smooth modern font']], look.retroFont),
        langColours: h('input', { type: 'checkbox', checked: !!look.langColours, 'aria-label': 'Colour by language' }),
        fontSize: null,
        keymap: choice([['vim', 'Vim'], ['standard', 'Standard (Ctrl+S...)'], ['emacs', 'Emacs']], c.keymap),
        language: choice([['c', 'C'], ['cpp', 'C++'], ['rust', 'Rust']], c.language || 'cpp'),
        followFile: h('input', { type: 'checkbox', checked: !!(c.editor || {}).followFile, 'aria-label': 'The switch follows the file you are in' }),
        cCompiler: choice(LANGS.c.compilers.map((x) => [x, x]), c.build.cCompiler || 'gcc'),
        cStd: choice(LANGS.c.stds, c.build.cStd || 'c17'),
        rustEdition: choice(LANGS.rust.stds, String(c.build.rustEdition || '2024')),
        rustAnalyzer: check(c.rustAnalyzer !== false),
        autosave: check(c.editor && c.editor.autosave), wrap: check(c.editor && c.editor.wrap), snippets: check(!c.editor || c.editor.snippets !== false),
        banned: check(!c.editor || c.editor.banned !== false),
        quiet: check(c.comfort && c.comfort.quiet), reduceMotion: check(c.comfort && c.comfort.reduceMotion),
        spacing: choice([['normal', 'Normal'], ['relaxed', 'Relaxed']], (c.comfort && c.comfort.spacing) || 'normal'),
        readingFont: choice([['mono', 'The code font'], ['readable', 'A reading font']], (c.comfort && c.comfort.readingFont) || 'mono'),
        breakReminder: choice([[0, 'Never'], [30, 'After 30 min'], [45, 'After 45 min'], [60, 'After an hour'], [90, 'After 90 min']], (c.comfort && +c.comfort.breakReminder) || 0),
        whereOnStart: check(!c.comfort || c.comfort.whereOnStart !== false),
        focusMinutes: choice([[10, '10 min'], [25, '25 min'], [45, '45 min']], (c.focus && c.focus.minutes) || 25),
        breakMinutes: choice([[3, '3 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']], (c.focus && c.focus.breakMinutes) || 5),
        exercisesDir: text(c.exercisesDir, { placeholder: '~/workbench-exercises' }),
        workspace: text(c.workspace, { placeholder: '~/cpp-path' }),
        folders: h('textarea', { class: 'field', rows: 3, spellcheck: 'false', placeholder: 'One folder per line, e.g. ~/src/c-exercises' }, (c.folders || []).join('\n')),
        buildType: choice([['Debug', 'Debug (sanitizers on)'], ['RelWithDebInfo', 'RelWithDebInfo'], ['Release', 'Release']], c.build.buildType),
        jobs: text(c.build.jobs, { type: 'number' }),
        compiler: choice([['g++', 'g++'], ['clang++', 'clang++']], c.build.compiler),
        std: choice([['c++17', 'C++17'], ['c++20', 'C++20'], ['c++23', 'C++23']], c.build.std),
        sandboxFlags: text((c.build.sandboxFlags || []).join(' ')),
        judgeTl: text(c.judge.timeLimitMs, { type: 'number' }), judgeFlags: text((c.judge.flags || []).join(' ')),
        tidyChecks: text(c.tidy.checks, { placeholder: 'empty: your .clang-tidy, or a sensible set' }),
        clangd: check(c.clangd.enabled), clangdArgs: text((c.clangd.args || []).join(' ')),
        ircHost: text(c.irc.host), ircPort: text(c.irc.port, { type: 'number' }), ircTls: check(c.irc.tls),
        ircNick: text(c.irc.nick), ircUser: text(c.irc.username), ircReal: text(c.irc.realname),
        ircLogin: choice([['none', 'Not logged in'], ['sasl', 'SASL password'], ['certfp', 'Client certificate (CertFP)']], c.irc.login || 'none'),
        ircAccount: text(c.irc.account, { placeholder: 'the same as your nick, usually' }),
        ircCert: text(c.irc.certFile, { placeholder: '~/.config/weechat/certs/libera.pem' }), ircChannels: text((c.irc.channels || []).join(' ')), ircAuto: check(c.irc.autoConnect),
        mailName: text(c.mail.name), mailAddr: text(c.mail.address, { placeholder: 'you@gmail.com' }),
        imapHost: text(c.mail.imapHost), imapPort: text(c.mail.imapPort, { type: 'number' }),
        smtpHost: text(c.mail.smtpHost), smtpPort: text(c.mail.smtpPort, { type: 'number' }),
        keyring: text(c.mail.keyringService), fetch: text(c.mail.fetchCount, { type: 'number' }),
        musicUrl: text(c.music.url),
        musicWhere: choice([['auto', 'Its own Windows window (under WSL)'], ['app', 'Inside the app']], c.music.where || 'auto'),
      };
      f.fontSize = choice(sizes(), c.fontSize);
      const sizeHost = h('div', {}, f.fontSize);
      const resize = () => { const v = +f.fontSize.value; const opts = sizes(); const keep = opts.some(([x]) => x === v) ? v : opts.reduce((a, [x]) => (Math.abs(x - v) < Math.abs(a - v) ? x : a), opts[0][0]); f.fontSize = choice(opts, keep); f.fontSize.addEventListener('change', preview); sizeHost.replaceChildren(f.fontSize); };
      // preview the look straight away
      const preview = () => applyTheme(f.theme.value, +f.fontSize.value, { palette: f.palette.value, retroFont: f.retroFont.value, langColours: f.langColours.checked });
      for (const x of [f.theme, f.palette, f.retroFont, f.langColours]) x.addEventListener('change', () => { resize(); preview(); });
      f.fontSize.addEventListener('change', preview);
      // the vaults: a row each, name and folder, removable; Add puts a new row
      const vaultRows = h('div', { class: 'vault-rows' });
      const addVaultRow = (v = { name: '', path: '' }) => {
        const name = h('input', { class: 'field', type: 'text', value: v.name || '', placeholder: 'Name', spellcheck: 'false', 'aria-label': 'Vault name' });
        const where = h('input', { class: 'field', type: 'text', value: v.path || '', placeholder: '~/Obsidian/CPP-Path', spellcheck: 'false', 'aria-label': 'Vault folder' });
        const row = h('div', { class: 'vault-edit' }, name, where, h('button', { class: 'btn small', type: 'button', title: 'Remove (nothing is deleted)', onclick: () => row.remove() }, '×'));
        row.read = () => ({ name: name.value.trim(), path: where.value.trim() });
        vaultRows.append(row);
        return row;
      };
      (c.vaults || []).forEach((v) => addVaultRow(v));
      if (!(c.vaults || []).length) addVaultRow();
      const words = (s) => s.value.trim() ? s.value.trim().split(/\s+/) : [];
      const collect = (latest) => ({
        ...latest, theme: f.theme.value, fontSize: +f.fontSize.value, keymap: f.keymap.value,
        look: { ...latest.look, palette: f.palette.value, retroFont: f.retroFont.value, langColours: f.langColours.checked },
        language: f.language.value,
        editor: { ...latest.editor, followFile: f.followFile.checked, autosave: f.autosave.checked, wrap: f.wrap.checked, snippets: f.snippets.checked, banned: f.banned.checked },
        comfort: { ...latest.comfort, quiet: f.quiet.checked, reduceMotion: f.reduceMotion.checked, spacing: f.spacing.value, readingFont: f.readingFont.value, breakReminder: +f.breakReminder.value, whereOnStart: f.whereOnStart.checked },
        focus: { ...latest.focus, minutes: +f.focusMinutes.value, breakMinutes: +f.breakMinutes.value },
        exercisesDir: f.exercisesDir.value.trim() || '~/workbench-exercises',
        workspace: f.workspace.value.trim(),
        folders: f.folders.value.split('\n').map((x) => x.trim()).filter(Boolean),
        vaults: [...vaultRows.children].map((r) => r.read()).filter((v) => v.path).map((v) => ({ path: v.path, ...(v.name ? { name: v.name } : {}) })),
        build: { ...latest.build, buildType: f.buildType.value, jobs: Math.max(1, +f.jobs.value || 4), compiler: f.compiler.value, std: f.std.value, cCompiler: f.cCompiler.value, cStd: f.cStd.value, rustEdition: f.rustEdition.value, sandboxFlags: words(f.sandboxFlags) },
        judge: { ...latest.judge, timeLimitMs: Math.max(100, +f.judgeTl.value || 2000), flags: words(f.judgeFlags) },
        tidy: { ...latest.tidy, checks: f.tidyChecks.value.trim() },
        clangd: { ...latest.clangd, enabled: f.clangd.checked, args: words(f.clangdArgs) },
        rustAnalyzer: f.rustAnalyzer.checked,
        irc: { ...latest.irc, host: f.ircHost.value.trim(), port: +f.ircPort.value || 6697, tls: f.ircTls.checked, nick: f.ircNick.value.trim(),
          username: f.ircUser.value.trim(), realname: f.ircReal.value.trim(), login: f.ircLogin.value, account: f.ircAccount.value.trim(),
          certFile: f.ircCert.value.trim(), channels: words(f.ircChannels), autoConnect: f.ircAuto.checked },
        mail: { ...latest.mail, name: f.mailName.value.trim(), address: f.mailAddr.value.trim(), imapHost: f.imapHost.value.trim(), imapPort: +f.imapPort.value || 993,
          smtpHost: f.smtpHost.value.trim(), smtpPort: +f.smtpPort.value || 465, keyringService: f.keyring.value.trim() || 'neomutt', fetchCount: +f.fetch.value || 200 },
        music: { ...latest.music, url: f.musicUrl.value.trim() || 'https://music.youtube.com/', where: f.musicWhere.value },
      });
      const save = async () => {
        try {
          const saved = await call('config.save', collect(await call('config.get')));
          Object.assign(c, saved);
          onSaved(saved);
          toast('Settings saved', 'ok');
          return true;
        } catch (err) { toast(err.message, 'error', 8000); return false; }
      };
      const ircPassword = async () => {
        if (!(await save())) return;
        const input = h('input', { type: 'password', class: 'field', autocomplete: 'off' });
        const ok = await dialog({ title: 'IRC password', width: '34em',
          body: h('label', { class: 'stack' }, h('span', {}, `The NickServ password for ${f.ircAccount.value.trim() || f.ircNick.value.trim()} on ${f.ircHost.value.trim()}`), input,
            h('small', { class: 'muted' }, 'Stored in the GNOME keyring (secret-tool), never in the settings file.')),
          buttons: [{ label: 'Cancel', value: false }, { label: 'Store it', value: true, primary: true }] });
        if (!ok || !input.value) return;
        try { const r = await call('irc.setPassword', { password: input.value }); toast(`Stored in the keyring for ${r.user}`, 'ok'); }
        catch (err) { toast(err.message, 'error', 8000); }
      };
      const loginHint = h('div', { class: 'hint small' });
      const showLogin = () => {
        const v = f.ircLogin.value;
        loginHint.textContent = v === 'sasl' ? 'Logs in to your NickServ account as you connect. Register first: /msg NickServ REGISTER <password> <email>, then confirm the mail.'
          : v === 'certfp' ? 'A PEM file with your certificate and key. Add its fingerprint to your account once: /msg NickServ CERT ADD (while logged in).'
            : 'You can still /msg NickServ IDENTIFY <password> by hand after connecting.';
      };
      f.ircLogin.addEventListener('change', showLogin);
      showLogin();
      page.append(h('div', { class: 'form' },
        h('h2', {}, 'Look'),
        ...field('Theme', f.theme, 'The retro themes are the DOS screens you remember; Amber CRT is a monochrome monitor; Modern is a plain dark editor.'),
        ...field('Retro colours', f.palette, 'Soft keeps the DOS look with toned-down colours that are easy on an LCD (no full-brightness blue and yellow). Authentic VGA is the real 1991 palette.'),
        ...field('Colour by language', f.langColours, 'The theme\'s main colour follows the language switch: C a lighter blue, C++ the dark blue, Rust orange. Every theme except Amber CRT.'),
        ...field('Retro font', f.retroFont, 'The VGA pixel font is only sharp at 16px or 32px. The modern font keeps the frames and colours and works at any size.'),
        ...field('Text size', sizeHost),
        ...field('Editor keys', f.keymap, 'Vim matches the vault\'s Neovim setup (:CMakeBuild, \\cb, \\ct, :A...). Vim and Emacs keys get every key except F1-F12 and Ctrl+Shift combinations.'),
        h('h2', {}, 'Language'),
        ...field('Working in', f.language, 'New files and projects, the sandbox and the judge start in this language; a .h header is treated as it. Switch any time from the toolbar or with Ctrl+Shift+J.'),
        ...field('Follow the file', f.followFile, 'The switch follows the tab in front: a .c file sets C, a .cpp file C++, a .rs file Rust (with Colour by language, the colours follow too). What you pick yourself is still what new files use when you start the app.'),
        ...field('C compiler', f.cCompiler, 'For .c files outside CMake, the C sandbox and C judge solutions.'),
        ...field('C standard', f.cStd),
        ...field('Rust edition', f.rustEdition, 'For lone .rs files, the sandbox, the judge and new Cargo projects. A Cargo project uses the edition in its own Cargo.toml.'),
        h('h2', {}, 'Comfort'),
        h('div', { class: 'full hint small' }, 'For brains that like things calm and predictable (ADHD, autism, tired, or just people). Everything stays where you put it; nothing here changes by itself.'),
        ...field('Quiet', h('label', { class: 'check' }, f.quiet, ' messages wait in the inbox (✉ on the status line) instead of popping up; errors still show')),
        ...field('Reduce motion', h('label', { class: 'check' }, f.reduceMotion, ' no blinking cursors, no animations, no smooth scrolling')),
        ...field('Spacing', f.spacing, 'Relaxed: more room between lines and letters in guides, exercises and other pages.'),
        ...field('Reading text in', f.readingFont, 'For guides and exercises (code stays in the code font). Uses Atkinson Hyperlegible, Lexend or OpenDyslexic if one is installed (Ubuntu: sudo apt install fonts-atkinson-hyperlegible, or download it).'),
        ...field('Break reminder', f.breakReminder, 'A gentle "take a break?" after this long without one: for when hyperfocus eats the afternoon.'),
        ...field('Where was I?', h('label', { class: 'check' }, f.whereOnStart, ' when you come back after a few hours, show the file, the exercise and the note you left')),
        ...field('Focus timer', f.focusMinutes, 'What focus mode (Ctrl+Shift+G) offers first.'),
        ...field('Break length', f.breakMinutes),
        h('h2', {}, 'Editor'),
        ...field('Autosave', h('label', { class: 'check' }, f.autosave, ' save a moment after you stop typing, and when you switch tabs')),
        ...field('Word wrap', h('label', { class: 'check' }, f.wrap, ' wrap long lines (Alt+Z)')),
        ...field('Unsafe functions', h('label', { class: 'check' }, f.banned, ' underline gets, strcpy, sprintf... with why, and what to use instead')),
        ...field('Snippets', h('label', { class: 'check' }, f.snippets, ' for, if, main, printf, malloc, class... in the completion list (Tab moves between the blanks)')),
        h('h2', {}, 'Folders'),
        ...field('Workspace', f.workspace, 'Where builds, the terminal and new files start: your copy of the vault\'s _code (for example ~/cpp-path), or any project'),
        ...field('Exercises', f.exercisesDir, 'Where your exercise files go (yours to keep; put the folder in git if you like).'),
        ...field('More folders', f.folders, 'Shown in Files beside the workspace. Quick open (F3) and search in files cover them all.'),
        h('h2', {}, 'Guides (vaults)'),
        h('div', { class: 'full' }, vaultRows, h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => addVaultRow().querySelector('input').focus() }, '+ Add a vault')),
          h('div', { class: 'hint small', style: { marginTop: '4px' } }, 'Every folder of notes here gets a section in Guides: the CPP-Path vault (the folder with "CPP Start Here.md"), a C vault, your own notes. The first one is where "Copy the vault\'s code" looks first.')),
        h('h2', {}, 'Build'),
        ...field('CMake build type', f.buildType, 'Debug turns on AddressSanitizer and UBSan (the vault\'s CMakeLists.txt). Changing it reconfigures on the next build.'),
        ...field('Parallel jobs', f.jobs),
        ...field('C++ compiler', f.compiler, 'For .cpp files outside CMake, the C++ sandbox and the judge. CMake projects use what CMake found.'),
        ...field('C++ standard', f.std, 'Same: CMake projects set their own (the vault uses C++20).'),
        ...field('Sandbox flags', f.sandboxFlags),
        ...field('Judge time limit (ms)', f.judgeTl), ...field('Judge flags', f.judgeFlags, 'Judges compile with -O2 and no sanitizers'),
        ...field('clang-tidy checks', f.tidyChecks, 'For example -*,modernize-*,performance-* (note 4.04)'),
        ...field('clangd', h('label', { class: 'check' }, f.clangd, ' completion, errors as you type, go to definition, formatting'), 'Needs clang-tools-extra and a configured build (Alt+F9) for build/compile_commands.json.'),
        ...field('clangd arguments', f.clangdArgs),
        ...field('rust-analyzer', h('label', { class: 'check' }, f.rustAnalyzer, ' completion, errors as you type and go to definition in Rust files'), 'Install it with: rustup component add rust-analyzer'),
        h('h2', {}, 'IRC'),
        ...field('Server', f.ircHost), ...field('Port', f.ircPort), ...field('TLS', h('label', { class: 'check' }, f.ircTls, ' encrypted (port 6697)')),
        ...field('Nick', f.ircNick),
        ...field('Username', f.ircUser), ...field('Real name', f.ircReal),
        ...field('Log in', f.ircLogin), h('div', { class: 'full' }, loginHint),
        ...field('Account', f.ircAccount),
        h('div', { class: 'full row' }, h('button', { class: 'btn', type: 'button', onclick: ircPassword }, 'Set IRC password...')),
        ...field('Client certificate', f.ircCert, 'Only for CertFP'),
        ...field('Channels', f.ircChannels, 'Joined when you connect, separated by spaces. On Libera, #c++-basic is for learners; #c++ is the main channel (#c++-general for chat).'),
        ...field('Connect on start', h('label', { class: 'check' }, f.ircAuto, ' connect when the app opens')),
        h('h2', {}, 'Mail'),
        ...field('Your name', f.mailName),
        ...field('Address', f.mailAddr),
        ...field('IMAP server', f.imapHost), ...field('IMAP port', f.imapPort),
        ...field('SMTP server', f.smtpHost), ...field('SMTP port', f.smtpPort),
        ...field('Keyring service', f.keyring, 'secret-tool entry name. "neomutt" shares the password with a NeoMutt setup (and the Kernel Path Workbench).'),
        ...field('Messages to load', f.fetch),
        h('div', { class: 'full row' }, h('button', { class: 'btn', type: 'button', onclick: () => runCommand('mail.password') }, 'Set Gmail App Password...')),
        h('h2', {}, 'Music'),
        ...field('Start page', f.musicUrl, 'A music.youtube.com or www.youtube.com address'),
        ...field('Where music plays', f.musicWhere, 'Under WSL, sound from inside the app goes through WSLg and can crackle; in its own window (Microsoft Edge with no tabs or address bar) it plays through Windows directly, and your media keys work. Elsewhere it always plays inside the app.'),
        h('h2', {}, 'Files'),
        h('div', { class: 'full muted' }, `Settings: ${info.configFile}`), h('div', { class: 'full muted' }, `Data (sandbox, judge cases, flashcard progress): ${info.dataDir}`),
        h('div', { class: 'full row', style: { marginTop: '1em' } }, h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save settings'),
          h('button', { class: 'btn', type: 'button', onclick: () => runCommand('help.tools') }, 'Which tools are installed?'))));
      this.page = page;
    },
    onClose() { /* an unsaved look preview reverts */ call('config.get').then((c) => applyTheme(c.theme, c.fontSize, c.look || {})); },
  });
}

export function initSettings() {
  command('app.settings', 'Settings', ['Ctrl+,'], openSettings);
}
