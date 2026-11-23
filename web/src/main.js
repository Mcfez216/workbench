// Start-up: connect to the backend, apply the theme, build the window,
// register every part, then put back the tabs you had open.

import { connect, call, on } from './rpc.js';
import { h, toast, setHome } from './ui.js';
import { buildShell, menubar, sidebar, panel, tabs, status, command, runCommand } from './layout.js';
import { THEMES, applyTheme, themeName } from './themes.js';
import { setConfig, setKeymap, initEditorCommands, openFile } from './editor.js';
import { initFiles, setRoot } from './files.js';
import { initTerminal, newTerminal } from './terminal.js';
import { initBuild, openSandbox } from './build.js';
import { initTests } from './tests.js';
import { initJudge } from './judge.js';
import { initGit, refreshGit } from './git.js';
import { initGuides, openGuide, loadNotes } from './guides.js';
import { initRevise } from './revise.js';
import { initIrc } from './irc.js';
import { initMail } from './mail.js';
import { initMusic, setMusicUrl } from './music.js';
import { initSettings, onSettingsSaved } from './settings.js';
import { initWelcome } from './welcome.js';

let cfg;

const MENUS = [
  { label: 'File', hot: 'F', items: [
    { cmd: 'file.new' }, { cmd: 'file.quickOpen' }, { cmd: 'file.openFolder' }, { cmd: 'vault.copyCode' }, { sep: true },
    { cmd: 'file.save' }, { cmd: 'file.saveAll' }, { cmd: 'file.close' }, { sep: true },
    { cmd: 'app.settings' }, { cmd: 'app.quit' },
  ] },
  { label: 'Edit', hot: 'E', items: [
    { cmd: 'edit.find' }, { cmd: 'edit.gotoLine' }, { cmd: 'file.search' }, { sep: true },
    { cmd: 'edit.definition' }, { cmd: 'edit.references' }, { cmd: 'edit.rename' }, { cmd: 'edit.format' },
  ] },
  { label: 'View', hot: 'V', items: [
    { cmd: 'view.split' }, { cmd: 'view.focusside' }, { cmd: 'view.unsplit' }, { sep: true },
    { cmd: 'view.sidebar' }, { cmd: 'view.panel' },
  ] },
  { label: 'Build', hot: 'B', items: [
    { cmd: 'build.build' }, { cmd: 'build.run' }, { cmd: 'build.runArgs' }, { cmd: 'build.debug' }, { sep: true },
    { cmd: 'build.configure' }, { cmd: 'build.fresh' }, { cmd: 'build.target' }, { cmd: 'build.pickTarget' }, { sep: true },
    { cmd: 'analyze.tidy' }, { cmd: 'analyze.cppcheck' }, { sep: true },
    { cmd: 'build.nextProblem' }, { cmd: 'build.prevProblem' }, { cmd: 'build.showProblems' },
  ] },
  { label: 'Test', hot: 's', items: [
    { cmd: 'test.all' }, { cmd: 'test.here' }, { cmd: 'test.project' }, { cmd: 'test.show' }, { sep: true },
    { cmd: 'judge.open' }, { cmd: 'judge.new' },
  ] },
  { label: 'Git', hot: 'G', items: [
    { cmd: 'git.show', label: 'Status' }, { cmd: 'git.commit' }, { cmd: 'git.log' }, { cmd: 'git.formatPatch' }, { cmd: 'git.refresh' },
  ] },
  { label: 'Tools', hot: 'T', items: [
    { cmd: 'sandbox.open' }, { cmd: 'sandbox.asm' }, { cmd: 'term.toggle' }, { cmd: 'term.new' }, { cmd: 'term.close' }, { sep: true },
    { label: 'DOS retro track', submenu: [{ cmd: 'dos.build' }, { cmd: 'dos.run' }, { cmd: 'guides.open', args: ['0.4 DOSBox-X and Open Watcom - The DOS Retro Track'], label: 'Note 0.4: DOSBox-X and Open Watcom' }] },
    { sep: true },
    { cmd: 'mail.open' }, { cmd: 'mail.compose' }, { cmd: 'irc.open' }, { sep: true },
    { cmd: 'music.open' },
  ] },
  { label: 'Guides', hot: 'u', items: [
    { cmd: 'guides.show', label: 'Your vault' }, { cmd: 'guides.search' }, { cmd: 'revise.open' }, { sep: true },
    { cmd: 'guides.open', args: ['CPP Start Here'], label: 'CPP Start Here' },
    { cmd: 'guides.open', args: ['Projects/Start Here'], label: 'Projects: Start Here' },
    { cmd: 'guides.open', args: ['CPP Phase Gates'], label: 'Phase Gates' },
    { cmd: 'guides.open', args: ['CPP Best Practices Checklist'], label: 'Best Practices Checklist' },
    { cmd: 'guides.open', args: ['CPP Code Index'], label: 'Code Index' },
    { cmd: 'guides.open', args: ['CPP Done Log'], label: 'Done Log' },
    { label: 'Cheat sheets', submenu: [
      { cmd: 'guides.open', args: ['Cheat Sheet - CPP and STL'], label: 'C++ and the STL' },
      { cmd: 'guides.open', args: ['Cheat Sheet - CMake, gdb and Tooling'], label: 'CMake, gdb and tooling' },
    ] },
    { cmd: 'help.cppref' }, { cmd: 'help.man' },
  ] },
  { label: 'Options', hot: 'O', items: [
    { label: 'Theme', submenu: Object.entries(THEMES).map(([k, t]) => ({ cmd: 'theme.set', args: [k], label: t.label })) },
    { label: 'Editor keys', submenu: [
      { cmd: 'keys.set', args: ['vim'], label: 'Vim (like the vault\'s Neovim)' }, { cmd: 'keys.set', args: ['standard'], label: 'Standard' }, { cmd: 'keys.set', args: ['emacs'], label: 'Emacs' },
    ] },
    { cmd: 'theme.next' }, { cmd: 'font.bigger' }, { cmd: 'font.smaller' }, { sep: true },
    { cmd: 'view.sidebar' }, { cmd: 'view.panel' }, { cmd: 'view.files' }, { sep: true }, { cmd: 'app.settings' },
  ] },
  { label: 'Help', hot: 'H', items: [{ cmd: 'help.welcome' }, { cmd: 'help.keys' }, { cmd: 'help.tools' }, { cmd: 'help.cppref' }, { cmd: 'help.man' }, { cmd: 'help.about' }] },
];

const FKEYS = [['1', 'Guides', 'guides.show'], ['2', 'Save', 'file.save'], ['3', 'Open', 'file.quickOpen'], ['4', 'Sandbox', 'sandbox.open'], ['5', 'Term', 'term.toggle'],
  ['6', 'Git', 'git.show'], ['7', 'Tests', 'test.all'], ['8', 'Judge', 'judge.open'], ['9', 'Build', 'build.build'], ['10', 'Menu', 'menu']];

async function saveCfg(patch) {
  cfg = await call('config.save', { ...cfg, ...patch });
  setConfig(cfg);
  return cfg;
}

function setTheme(name, size = cfg.fontSize) {
  applyTheme(name, size);
  status.set('theme', THEMES[name].label, { order: 90, title: 'Theme (click for the next one)', onclick: () => runCommand('theme.next') });
}

function appCommands() {
  command('theme.set', 'Theme', [], async (name) => { setTheme(name); await saveCfg({ theme: name }); });
  command('theme.next', 'Next theme', ['Ctrl+Shift+Y'], () => {
    const names = Object.keys(THEMES);
    return runCommand('theme.set', names[(names.indexOf(themeName()) + 1) % names.length]);
  });
  command('keys.set', 'Editor keys', [], async (k) => { setKeymap(k); await saveCfg({ keymap: k }); toast(`Editor keys: ${k}`); });
  command('font.bigger', 'Bigger text', ['Ctrl+='], async () => {
    const retro = THEMES[themeName()].retro;
    const size = retro ? 32 : Math.min(cfg.fontSize + 2, 28);
    setTheme(themeName(), size); await saveCfg({ fontSize: size });
  });
  command('font.smaller', 'Smaller text', ['Ctrl+-'], async () => {
    const retro = THEMES[themeName()].retro;
    const size = retro ? 16 : Math.max(cfg.fontSize - 2, 11);
    setTheme(themeName(), size); await saveCfg({ fontSize: size });
  });
  command('view.split', 'Move this tab to the other side', ['Ctrl+Shift+|'], () => { const t = tabs.active(); if (t) tabs.move(t.id); });
  command('view.focusside', 'Switch to the other side', ['Ctrl+Alt+Shift+|'], () => tabs.focusSide(tabs.other()));
  command('view.unsplit', 'Close the split (all tabs to one side)', [], () => tabs.unsplit());
  command('view.sidebar', 'Show/hide sidebar', ['Ctrl+B'], () => sidebar.toggle());
  command('view.panel', 'Show/hide bottom panel', ['Ctrl+J'], () => panel.toggle());
  command('view.files', 'Files', ['Ctrl+Shift+E'], () => sidebar.show('files'));
  command('help.man', 'man page...', [], async () => {
    const { prompt } = await import('./ui.js');
    const page = await prompt('man page', 'Which page?', '3 printf', { hint: 'For example: gdb · cmake · ctest · clang-tidy · 3 printf. For the C++ library itself, cppreference is better (Ctrl+Shift+H).' });
    if (!page) return;
    const args = page.trim().split(/\s+/).filter((a) => /^[\w.+:-]+$/.test(a));
    if (args.length) newTerminal(undefined, ['man', ...args], `man ${args.join(' ')}`);
  });
  // cppreference.com, for the word under the cursor (std::vector, emplace_back...)
  command('help.cppref', 'Look it up on cppreference', ['Ctrl+Shift+H'], async () => {
    const { activeEditor } = await import('./editor.js');
    const { prompt } = await import('./ui.js');
    const t = activeEditor();
    let word = '';
    if (t) {
      const st = t.view.state, sel = st.selection.main;
      if (!sel.empty) word = st.sliceDoc(sel.from, sel.to);
      else {
        const line = st.doc.lineAt(sel.head), col = sel.head - line.from;
        const re = /[A-Za-z_][\w:]*/g;
        let m;
        while ((m = re.exec(line.text))) if (m.index <= col && col <= m.index + m[0].length) { word = m[0]; break; }
      }
    }
    const q = await prompt('cppreference', 'Look up', word.replace(/^std::/, 'std::'), { hint: 'Opens en.cppreference.com in your browser' });
    if (q && q.trim()) window.open(`https://en.cppreference.com/mwiki/index.php?search=${encodeURIComponent(q.trim())}`, '_blank', 'noopener');
  });
  // What's installed: which parts of the app will work on this machine
  command('help.tools', 'Which tools are installed?', [], async () => {
    const { dialog } = await import('./ui.js');
    const [t, info] = await Promise.all([call('build.tools'), call('app.info')]);
    const OPTIONAL = { ninja: 'optional', valgrind: 'optional', rg: 'optional: search uses grep without it', owcc: 'note 0.4, optional', 'dosbox-x': 'note 0.4, optional',
      'secret-tool': 'for the IRC and mail passwords' };
    const tools = Object.keys(t);
    const { packages } = await call('build.installLine', { tools });
    const missing = tools.filter((k) => !t[k] && !/optional/.test(OPTIONAL[k] || '') && k !== 'owcc');
    const { line } = await call('build.installLine', { tools: missing });
    dialog({ title: `Tools on ${info.distro.name}${info.distro.wsl ? ' (WSL)' : ''}`, width: '44em', body: h('div', {},
      h('table', { class: 'keys-table' }, tools.map((k) => h('tr', {}, h('td', {}, t[k] ? '[X]' : '[ ]'), h('td', {}, k),
        h('td', { class: 'muted' }, t[k] ? '' : [k === 'owcc' ? 'bash scripts/install-open-watcom.sh' : packages[k], OPTIONAL[k] ? ` (${OPTIONAL[k]})` : ''].join(''))))),
      missing.length ? h('p', {}, 'To install the missing ones: ', h('code', {}, line)) : h('p', {}, 'Everything the app needs is installed.')) });
  });
  // Copy the vault's _code folder out to the workspace, the way CPP Start Here says
  command('vault.copyCode', "Copy the vault's code to my workspace...", [], async () => {
    const { prompt, toast } = await import('./ui.js');
    const c = await call('config.get');
    const info = await call('app.info');
    if (!c.vault) { toast('Set the vault folder in Settings first', 'error'); return runCommand('app.settings'); }
    // ~/cpp-path as the vault says; or next to this app if you keep things together (~/CPP/cpp-path)
    const near = info.appParent && info.appParent !== info.home ? `${info.appParent.replace(info.home, '~')}/cpp-path` : '~/cpp-path';
    const to = await prompt("Copy the vault's code", 'Copy _code to', near, { hint: 'Files already there are kept, never overwritten. This becomes your workspace.' });
    if (!to) return;
    const dest = to.replace(/^~(?=\/|$)/, info.home);
    const r = await call('files.copyDir', { from: c.vault.replace(/^~(?=\/|$)/, info.home) + '/_code', to: dest });
    const next = await saveCfg({ workspace: dest });
    const { setRoot } = await import('./files.js');
    setRoot(next.workspace);
    sidebar.show('files');
    toast(`Copied ${r.copied} file${r.copied === 1 ? '' : 's'} to ${to}${r.kept ? ` (kept ${r.kept} you already had)` : ''}${r.gitignore ? ', with a .gitignore for build/ and .cache/' : ''}. Next: Alt+F9 to configure, F9 to build.`, 'ok', 9000);
  });
  command('app.quit', 'Quit', ['Ctrl+Q'], () => window.close());
}

async function restoreSession() {
  const saved = await call('state.get', { key: 'session.tabs', fallback: null });
  if (!saved || !saved.length) { runCommand('help.welcome'); return; }
  for (const s of saved) {
    try {
      if (s.kind === 'file') await openFile(s.path);
      else if (s.kind === 'guide') await openGuide(s.name);
      else if (s.kind === 'sandbox') openSandbox();
      else if (s.kind === 'judge') runCommand('judge.open');
      else if (s.kind === 'revise') runCommand('revise.open');
      else if (s.kind === 'irc') runCommand('irc.open');
      else if (s.kind === 'mail') runCommand('mail.open');
      else if (s.kind === 'music') runCommand('music.open', 'restore');
      else if (s.kind === 'settings') runCommand('app.settings');
      else if (s.kind === 'welcome') runCommand('help.welcome');
    } catch (err) { /* the file moved; skip it */ }
  }
  for (const s of saved) if (s.side === 'right' && s.id && tabs.get(s.id)) tabs.move(s.id, 'right');
  const splitW = await call('state.get', { key: 'ui.splitWidth', fallback: null });
  if (splitW) document.documentElement.style.setProperty('--split-w', splitW + 'px');
  const active = await call('state.get', { key: 'session.active', fallback: null });
  if (active && tabs.get(active)) tabs.focus(active);
}

async function boot() {
  connect();
  let lost = false;
  on('rpc.closed', () => { if (!lost) { lost = true; status.set('conn', 'backend offline, reconnecting...', { side: 'left', order: 0, cls: 'bad' }); } });
  on('rpc.open', () => { if (lost) { lost = false; status.set('conn', ''); toast('Reconnected', 'ok'); } });

  cfg = await call('config.get');
  setHome((await call('app.info')).home);
  setConfig(cfg);
  applyTheme(cfg.theme, cfg.fontSize);
  try { await document.fonts.load(`16px "Kernel Path VGA"`); } catch (e) { /* falls back */ }   // the VGA font, from the Kernel Path vault

  const root = document.getElementById('app');
  root.textContent = '';
  buildShell(root, FKEYS);
  initEditorCommands(); initFiles(); initTerminal(); initBuild(); initTests(); initJudge(); initGit(); initGuides(); initRevise();
  await initIrc(); initMail(); initMusic(); initSettings(); initWelcome(); appCommands();
  menubar.build(MENUS);
  sidebar.buildHead();
  setTheme(cfg.theme);
  setKeymap(cfg.keymap);
  setMusicUrl(cfg.music.url);
  if (cfg.workspace) setRoot(cfg.workspace);

  const [side, sideW, panelH, panelId] = await Promise.all(['ui.sidebar', 'ui.sideWidth', 'ui.panelHeight', 'ui.panel'].map((key) => call('state.get', { key })));
  if (sideW) document.documentElement.style.setProperty('--side-w', sideW + 'px');
  if (panelH) document.documentElement.style.setProperty('--panel-h', panelH + 'px');
  sidebar.show(side && sidebar.views.has(side) ? side : 'files');
  if (panelId && panel.views.has(panelId)) panel.show(panelId); else panel.hide();

  const prevChange = tabs.onChange;
  tabs.onChange = (t) => { prevChange(t); call('state.set', { key: 'session.active', value: t ? t.id : null }); if (t && t.file) refreshGit(); };

  onSettingsSaved((saved) => {
    const vaultChanged = saved.vault !== cfg.vault;
    cfg = saved; setConfig(cfg);
    setTheme(cfg.theme, cfg.fontSize); setKeymap(cfg.keymap); setMusicUrl(cfg.music.url);
    if (cfg.workspace) setRoot(cfg.workspace);
    if (vaultChanged) loadNotes();
  });

  await restoreSession();
}

boot().catch((err) => {
  document.getElementById('app').textContent = `Couldn't start: ${err.message}`;
  console.error(err);
});
