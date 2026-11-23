// Settings: one page for everything in ~/.config/cpp-path-workbench/config.json.
// Passwords never go in there; the mail and IRC buttons store them in the
// GNOME keyring.

import { call } from './rpc.js';
import { h, clear, toast, dialog } from './ui.js';
import { tabs, command, runCommand } from './layout.js';
import { THEMES, applyTheme, themeName } from './themes.js';

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
      const f = {
        theme: choice(Object.entries(THEMES).map(([k, t]) => [k, t.label]), c.theme),
        fontSize: choice([[16, '16px'], [32, '32px (big)']].concat(THEMES[c.theme]?.retro ? [] : [[14, '14px'], [18, '18px'], [20, '20px']]), c.fontSize),
        keymap: choice([['vim', 'Vim'], ['standard', 'Standard (Ctrl+S...)'], ['emacs', 'Emacs']], c.keymap),
        workspace: text(c.workspace, { placeholder: '~/cpp-path' }), vault: text(c.vault, { placeholder: '~/Obsidian/Programming/CPP-Path' }),
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
      };
      // preview the theme straight away
      f.theme.addEventListener('change', () => applyTheme(f.theme.value, +f.fontSize.value));
      const words = (s) => s.value.trim() ? s.value.trim().split(/\s+/) : [];
      const collect = () => ({
        ...c, theme: f.theme.value, fontSize: +f.fontSize.value, keymap: f.keymap.value,
        workspace: f.workspace.value.trim(), vault: f.vault.value.trim() || null,
        build: { ...c.build, buildType: f.buildType.value, jobs: Math.max(1, +f.jobs.value || 4), compiler: f.compiler.value, std: f.std.value, sandboxFlags: words(f.sandboxFlags) },
        judge: { ...c.judge, timeLimitMs: Math.max(100, +f.judgeTl.value || 2000), flags: words(f.judgeFlags) },
        tidy: { ...c.tidy, checks: f.tidyChecks.value.trim() },
        clangd: { ...c.clangd, enabled: f.clangd.checked, args: words(f.clangdArgs) },
        irc: { ...c.irc, host: f.ircHost.value.trim(), port: +f.ircPort.value || 6697, tls: f.ircTls.checked, nick: f.ircNick.value.trim(),
          username: f.ircUser.value.trim(), realname: f.ircReal.value.trim(), login: f.ircLogin.value, account: f.ircAccount.value.trim(),
          certFile: f.ircCert.value.trim(), channels: words(f.ircChannels), autoConnect: f.ircAuto.checked },
        mail: { ...c.mail, name: f.mailName.value.trim(), address: f.mailAddr.value.trim(), imapHost: f.imapHost.value.trim(), imapPort: +f.imapPort.value || 993,
          smtpHost: f.smtpHost.value.trim(), smtpPort: +f.smtpPort.value || 465, keyringService: f.keyring.value.trim() || 'neomutt', fetchCount: +f.fetch.value || 200 },
        music: { url: f.musicUrl.value.trim() || 'https://music.youtube.com/' },
      });
      const save = async () => {
        try {
          const saved = await call('config.save', collect());
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
        ...field('Theme', f.theme, 'Blue installer, Turbo C++ and Norton Commander use the VGA font; it is only sharp at 16px or 32px.'),
        ...field('Text size', f.fontSize),
        ...field('Editor keys', f.keymap, 'Vim matches the vault\'s Neovim setup (:CMakeBuild, \\cb, \\ct...). Vim and Emacs keys get every key except F1-F10 and Ctrl+Shift combinations.'),
        h('h2', {}, 'Folders'),
        ...field('Workspace', f.workspace, 'Your copy of the vault\'s _code folder, for example ~/cpp-path (File → Copy the vault\'s code makes it)'),
        ...field('CPP-Path vault', f.vault, 'The folder with "CPP Start Here.md" in it'),
        h('h2', {}, 'Build'),
        ...field('CMake build type', f.buildType, 'Debug turns on AddressSanitizer and UBSan (the vault\'s CMakeLists.txt). Changing it reconfigures on the next build.'),
        ...field('Parallel jobs', f.jobs),
        ...field('Compiler', f.compiler, 'For single files, the sandbox and the judge. CMake projects use what CMake found.'),
        ...field('C++ standard', f.std, 'Same: CMake projects set their own (the vault uses C++20).'),
        ...field('Sandbox flags', f.sandboxFlags),
        ...field('Judge time limit (ms)', f.judgeTl), ...field('Judge flags', f.judgeFlags, 'Judges compile with -O2 and no sanitizers'),
        ...field('clang-tidy checks', f.tidyChecks, 'For example -*,modernize-*,performance-* (note 4.04)'),
        ...field('clangd', h('label', { class: 'check' }, f.clangd, ' completion, errors as you type, go to definition, formatting'), 'Needs clang-tools-extra and a configured build (Alt+F9) for build/compile_commands.json.'),
        ...field('clangd arguments', f.clangdArgs),
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
        h('h2', {}, 'Files'),
        h('div', { class: 'full muted' }, `Settings: ${info.configFile}`), h('div', { class: 'full muted' }, `Data (sandbox, judge cases, flashcard progress): ${info.dataDir}`),
        h('div', { class: 'full row', style: { marginTop: '1em' } }, h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save settings'),
          h('button', { class: 'btn', type: 'button', onclick: () => runCommand('help.tools') }, 'Which tools are installed?'))));
      this.page = page;
    },
    onClose() { /* an unsaved theme preview reverts */ call('config.get').then((c) => { if (c.theme !== themeName()) applyTheme(c.theme, c.fontSize); }); },
  });
}

export function initSettings() {
  command('app.settings', 'Settings', ['Ctrl+,'], openSettings);
}
