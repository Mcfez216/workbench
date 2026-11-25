// Start-up: connect to the backend, apply the theme, build the window,
// register every part, then put back the tabs you had open.

import { connect, call, on } from './rpc.js';
import { h, toast, setHome } from './ui.js';
import { buildShell, menubar, toolbar, sidebar, panel, tabs, status, command, runCommand } from './layout.js';
import { THEMES, PALETTES, applyTheme, themeName, usesPixelFont } from './themes.js';
import { setLanguageConfig, setLanguage, language, otherLanguage, langInfo, toolchainLabel, onLanguageChange } from './lang.js';
import { initPalette } from './palette.js';
import { initNewStuff } from './newstuff.js';
import { initOutline } from './outline.js';
import { initStart } from './start.js';
import { initExercises } from './exercises.js';
import { initComfort, applyComfort } from './comfort.js';
import { initProgress } from './progress.js';
import { initMemviz } from './memviz.js';
import { initCompare } from './compare.js';
import { initReference } from './reference.js';
import { initSecurity } from './security.js';
import { initHabits } from './habits.js';
import { setConfig, setKeymap, initEditorCommands, openFile } from './editor.js';
import { initFiles, setRoot, setFolders } from './files.js';
import { initTerminal, newTerminal } from './terminal.js';
import { initBuild, openSandbox, langSwitch } from './build.js';
import { initTests } from './tests.js';
import { initJudge } from './judge.js';
import { initGit, refreshGit } from './git.js';
import { initGuides, openGuide, loadNotes } from './guides.js';
import { initNotes } from './notes.js';
import { initRevise } from './revise.js';
import { initIrc } from './irc.js';
import { initMail } from './mail.js';
import { initMusic, setMusicUrl, setMusicWhere } from './music.js';
import { initSettings, onSettingsSaved } from './settings.js';

// The window opened with ?t=<token> (traded for a cookie): keep it out of the address
if (/[?&]t=/.test(location.search)) history.replaceState(null, '', location.pathname);
import { initWelcome } from './welcome.js';

let cfg;

const MENUS = [
  { label: 'File', hot: 'F', items: [
    { cmd: 'project.new' }, { cmd: 'file.new' }, { cmd: 'file.newHeader' }, { cmd: 'file.newPair' }, { sep: true },
    { cmd: 'file.quickOpen' }, { cmd: 'file.recent' }, { cmd: 'file.openFolder' }, { cmd: 'file.openRecentFolder' }, { cmd: 'file.addFolder' }, { cmd: 'vault.copyCode' }, { sep: true },
    { cmd: 'file.save' }, { cmd: 'file.saveAll' }, { cmd: 'edit.autosave' }, { cmd: 'file.close' }, { sep: true },
    { cmd: 'app.settings' }, { cmd: 'app.quit' },
  ] },
  { label: 'Edit', hot: 'E', items: [
    { cmd: 'app.palette' }, { sep: true },
    { cmd: 'edit.find' }, { cmd: 'edit.gotoLine' }, { cmd: 'file.search' }, { sep: true },
    { cmd: 'edit.definition' }, { cmd: 'edit.references' }, { cmd: 'edit.rename' }, { cmd: 'edit.otherFile' }, { cmd: 'edit.format' }, { cmd: 'edit.wrap' },
  ] },
  { label: 'View', hot: 'V', items: [
    { cmd: 'view.split' }, { cmd: 'view.focusside' }, { cmd: 'view.unsplit' }, { sep: true },
    { cmd: 'view.files' }, { cmd: 'view.outline' }, { cmd: 'guides.show', label: 'Guides' }, { cmd: 'test.show', label: 'Tests' }, { sep: true },
    { cmd: 'view.toolbar' }, { cmd: 'view.sidebar' }, { cmd: 'view.panel' }, { cmd: 'help.start', label: 'Start screen' },
  ] },
  { label: 'Build', hot: 'B', items: [
    { cmd: 'build.build' }, { cmd: 'build.run' }, { cmd: 'build.runArgs' }, { cmd: 'build.debug' }, { cmd: 'build.valgrind' }, { sep: true },
    { cmd: 'build.configure' }, { cmd: 'build.fresh' }, { cmd: 'build.target' }, { cmd: 'build.pickTarget' }, { sep: true },
    { cmd: 'analyze.tidy' }, { cmd: 'analyze.cppcheck' }, { sep: true },
    { cmd: 'build.nextProblem' }, { cmd: 'build.prevProblem' }, { cmd: 'build.showProblems' },
  ] },
  { label: 'Test', hot: 's', items: [
    { cmd: 'test.all' }, { cmd: 'test.here' }, { cmd: 'test.project' }, { cmd: 'test.show' }, { sep: true },
    { cmd: 'judge.open' }, { cmd: 'judge.new' },
  ] },
  { label: 'Learn', hot: 'L', items: [
    { cmd: 'learn.show', label: 'Exercises' }, { cmd: 'exercise.check' }, { cmd: 'learn.progress' }, { sep: true },
    { cmd: 'focus.toggle' }, { cmd: 'focus.break' }, { cmd: 'help.where' }, { sep: true },
    { cmd: 'memviz.open' }, { cmd: 'learn.compare' }, { cmd: 'help.reference' }, { cmd: 'revise.open' }, { sep: true },
    { cmd: 'journal.open' }, { cmd: 'test.forFunction' },
  ] },
  { label: 'Security', hot: 'c', items: [
    { cmd: 'learn.show', label: 'Security lab and capture the flag (in Exercises)' }, { sep: true },
    { cmd: 'security.hardening' }, { cmd: 'security.compare' }, { cmd: 'security.inspect' }, { sep: true },
    { cmd: 'security.fuzz' }, { cmd: 'security.crashes' }, { cmd: 'security.fuzzSeconds' }, { sep: true },
    { cmd: 'security.cert' }, { cmd: 'analyze.tidy' }, { cmd: 'analyze.cppcheck' }, { cmd: 'security.banned' }, { sep: true },
    { cmd: 'build.valgrind' }, { cmd: 'sandbox.valgrind' },
  ] },
  { label: 'Git', hot: 'G', items: [
    { cmd: 'git.checkpoint' }, { cmd: 'git.goBack' }, { sep: true }, { cmd: 'git.show', label: 'Status' }, { cmd: 'git.commit' }, { cmd: 'git.log' }, { cmd: 'git.formatPatch' }, { cmd: 'git.refresh' },
  ] },
  { label: 'Tools', hot: 'T', items: [
    { cmd: 'sandbox.open' }, { cmd: 'sandbox.asm' }, { cmd: 'sandbox.valgrind' }, { cmd: 'memviz.open' }, { sep: true },
    { cmd: 'term.toggle' }, { cmd: 'term.new' }, { cmd: 'term.close' }, { sep: true },
    { label: 'DOS retro track', submenu: [{ cmd: 'dos.build' }, { cmd: 'dos.run' }, { cmd: 'guides.open', args: ['0.4 DOSBox-X and Open Watcom - The DOS Retro Track'], label: 'Note 0.4: DOSBox-X and Open Watcom' }] },
    { sep: true },
    { cmd: 'mail.open' }, { cmd: 'mail.compose' }, { cmd: 'irc.open' }, { sep: true },
    { cmd: 'music.open' }, { cmd: 'music.inside' },
  ] },
  { label: 'Guides', hot: 'u', items: [
    { cmd: 'guides.show', label: 'Your vaults' }, { cmd: 'guides.search' }, { cmd: 'vault.add' }, { cmd: 'vaults.updateCourse' }, { cmd: 'revise.open' }, { sep: true },
    { cmd: 'notes.new' }, { cmd: 'notes.daily' }, { cmd: 'notes.graph' }, { cmd: 'notes.tags' }, { cmd: 'notes.backlinks' }, { cmd: 'notes.random' }, { sep: true },
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
    { label: 'Language', submenu: [{ cmd: 'lang.set', args: ['c'], label: 'C' }, { cmd: 'lang.set', args: ['cpp'], label: 'C++' }] },
    { label: 'Theme', submenu: Object.entries(THEMES).map(([k, t]) => ({ cmd: 'theme.set', args: [k], label: t.label })) },
    { label: 'Retro colours', submenu: Object.entries(PALETTES).map(([k, label]) => ({ cmd: 'look.palette', args: [k], label })) },
    { label: 'Retro font', submenu: [{ cmd: 'look.font', args: ['vga'], label: 'VGA pixel font (16 / 32 px)' }, { cmd: 'look.font', args: ['modern'], label: 'Smooth modern font (any size)' }] },
    { label: 'Editor keys', submenu: [
      { cmd: 'keys.set', args: ['vim'], label: 'Vim (like the vault\'s Neovim)' }, { cmd: 'keys.set', args: ['standard'], label: 'Standard' }, { cmd: 'keys.set', args: ['emacs'], label: 'Emacs' },
    ] },
    { cmd: 'theme.next' }, { cmd: 'font.bigger' }, { cmd: 'font.smaller' }, { sep: true },
    { cmd: 'view.toolbar' }, { cmd: 'view.sidebar' }, { cmd: 'view.panel' }, { cmd: 'view.files' }, { sep: true }, { cmd: 'app.settings' },
  ] },
  { label: 'Help', hot: 'H', items: [{ cmd: 'help.start', label: 'Start screen' }, { cmd: 'help.where' }, { cmd: 'help.welcome' }, { cmd: 'help.keys' }, { cmd: 'app.palette' }, { cmd: 'app.inbox' }, { cmd: 'help.tools' }, { cmd: 'help.reference' }, { cmd: 'help.cppref' }, { cmd: 'help.man' }, { cmd: 'help.about' }] },
];

// The toolbar: the language, then the everyday commands in the order you use them
const TOOLBAR = [
  { el: () => { const s = langSwitch(); s.title = 'The language you\'re working in: new files, projects, the sandbox and the judge (Ctrl+Shift+J)'; return s; } },
  { sep: true },
  { label: 'New', icon: '+', menu: [{ cmd: 'project.new' }, { cmd: 'file.new' }, { cmd: 'file.newHeader' }, { cmd: 'file.newPair' }, { sep: true }, { cmd: 'judge.new' }] },
  { cmd: 'file.quickOpen', label: 'Open', icon: '▤' },
  { cmd: 'file.save', label: 'Save', icon: '■' },
  { sep: true },
  { cmd: 'build.build', label: 'Build', icon: '≡' },
  { cmd: 'build.run', label: 'Run', icon: '►', primary: true },
  { cmd: 'build.debug', label: 'Debug', icon: '☼' },
  { cmd: 'test.all', label: 'Test', icon: '√' },
  { sep: true },
  { cmd: 'sandbox.open', label: 'Sandbox', icon: '◊' },
  { cmd: 'judge.open', label: 'Judge', icon: '±' },
  { cmd: 'guides.show', label: 'Guides', icon: '?' },
  { sep: true },
  { cmd: 'learn.show', label: 'Learn', icon: '♦' },
  { cmd: 'focus.toggle', label: 'Focus', icon: '◎' },
  { cmd: 'git.checkpoint', label: 'Checkpoint', icon: '⌂' },
  { spring: true },
  { cmd: 'app.palette', label: 'Commands', icon: '»' },
];

const FKEYS = [['1', 'Guides', 'guides.show'], ['2', 'Save', 'file.save'], ['3', 'Open', 'file.quickOpen'], ['4', 'Sandbox', 'sandbox.open'], ['5', 'Term', 'term.toggle'],
  ['6', 'Git', 'git.show'], ['7', 'Tests', 'test.all'], ['8', 'Judge', 'judge.open'], ['9', 'Build', 'build.build'], ['10', 'Menu', 'menu']];

// Always from the backend's latest copy: other parts (Files, Guides, the
// editor) save settings too, and a stale copy here would undo them.
async function saveCfg(patch) {
  const fresh = await call('config.get');
  cfg = await call('config.save', { ...fresh, ...patch });
  setConfig(cfg);
  return cfg;
}

function setTheme(name, size = cfg.fontSize) {
  applyTheme(name, size, cfg.look || {});
  status.set('theme', THEMES[name].label, { order: 90, title: 'Theme (click for the next one)', onclick: () => runCommand('theme.next') });
}

function showLanguage() {
  const l = language();
  status.set('langmode', `${langInfo(l).label}: ${toolchainLabel(l)}`, { order: 85, title: `Working in ${langInfo(l).label}: new files, the sandbox and the judge use it. Click (or Ctrl+Shift+J) for ${langInfo(otherLanguage()).label}.`, onclick: () => runCommand('lang.toggle') });
}

function appCommands() {
  command('lang.set', 'Language', [], async (l) => {
    if (l !== 'c' && l !== 'cpp') return;
    if (l === language()) return;
    setLanguage(l);                 // the switch lights up and the status line says it: no toast needed
    await saveCfg({ language: l });
  }, { needsArgs: true });
  command('lang.toggle', 'Switch between C and C++', ['Ctrl+Shift+J'], () => runCommand('lang.set', otherLanguage()));
  command('look.palette', 'Retro colours', [], async (p) => { cfg = await saveCfg({ look: { ...cfg.look, palette: p } }); setTheme(themeName()); toast(`Retro colours: ${PALETTES[p]}`, 'ok', 2000); }, { needsArgs: true });
  command('look.font', 'Retro font', [], async (f) => {
    cfg = await saveCfg({ look: { ...cfg.look, retroFont: f } });
    setTheme(themeName(), f === 'vga' ? (cfg.fontSize >= 24 ? 32 : 16) : cfg.fontSize);
  }, { needsArgs: true });
  command('view.toolbar', 'Show/hide toolbar', [], () => toolbar.toggle());
  command('theme.set', 'Theme', [], async (name) => { setTheme(name); await saveCfg({ theme: name }); }, { needsArgs: true });
  command('theme.next', 'Next theme', ['Ctrl+Shift+Y'], () => {
    const names = Object.keys(THEMES);
    return runCommand('theme.set', names[(names.indexOf(themeName()) + 1) % names.length]);
  });
  command('keys.set', 'Editor keys', [], async (k) => { setKeymap(k); await saveCfg({ keymap: k }); toast(`Editor keys: ${k}`); }, { needsArgs: true });
  command('font.bigger', 'Bigger text', ['Ctrl+='], async () => {
    const size = usesPixelFont(themeName(), (cfg.look || {}).retroFont) ? 32 : Math.min(cfg.fontSize + 2, 28);
    setTheme(themeName(), size); await saveCfg({ fontSize: size });
  });
  command('font.smaller', 'Smaller text', ['Ctrl+-'], async () => {
    const size = usesPixelFont(themeName(), (cfg.look || {}).retroFont) ? 16 : Math.max(cfg.fontSize - 2, 11);
    setTheme(themeName(), size); await saveCfg({ fontSize: size });
  });
  command('view.split', 'Move this tab to the other side', ['Ctrl+Shift+|'], () => { const t = tabs.active(); if (t) tabs.move(t.id); });
  command('view.focusside', 'Switch to the other side', ['Ctrl+Alt+Shift+|'], () => tabs.focusSide(tabs.other()));
  command('view.unsplit', 'Close the split (all tabs to one side)', [], () => tabs.unsplit());
  command('view.sidebar', 'Show/hide sidebar', ['Ctrl+B'], () => sidebar.toggle());
  command('view.panel', 'Show/hide bottom panel', ['Ctrl+J'], () => panel.toggle());
  command('view.files', 'Files', ['Ctrl+Shift+E'], () => sidebar.show('files'));
  // What's installed: which parts of the app will work on this machine
  command('help.tools', 'Which tools are installed?', [], async () => {
    const { dialog } = await import('./ui.js');
    const [t, info] = await Promise.all([call('build.tools'), call('app.info')]);
    const OPTIONAL = { ninja: 'optional', valgrind: 'optional: Run under Valgrind', clang: 'optional: the other C compiler', 'clang++': 'optional: the other C++ compiler', rg: 'optional: search uses grep without it', owcc: 'note 0.4, optional', 'dosbox-x': 'note 0.4, optional',
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
    if (!c.vaults || !c.vaults.length) { toast('Add your vault first (Guides → Add a vault)', 'error'); return runCommand('vault.add'); }
    // the vault whose _code to copy: the only one, or the one you pick
    const withCode = [];
    for (const v of c.vaults) { const st = await call('files.stat', { file: v.path.replace(/^~(?=\/|$)/, info.home) + '/_code' }); if (st.exists) withCode.push(v); }
    if (!withCode.length) return toast('None of your vaults has a _code folder to copy', 'error');
    let vault = withCode[0];
    if (withCode.length > 1) {
      const { pickFromList } = await import('./newstuff.js');
      vault = await pickFromList('Copy whose code?', withCode.map((v) => ({ label: v.name, hint: v.path, value: v })));
      if (!vault) return;
    }
    // ~/cpp-path as the vault says; or next to this app if you keep things together (~/CPP/cpp-path)
    const near = info.appParent && info.appParent !== info.home ? `${info.appParent.replace(info.home, '~')}/cpp-path` : '~/cpp-path';
    const to = await prompt("Copy the vault's code", 'Copy _code to', near, { hint: 'Files already there are kept, never overwritten. This becomes your workspace.' });
    if (!to) return;
    const dest = to.replace(/^~(?=\/|$)/, info.home);
    const r = await call('files.copyDir', { from: vault.path.replace(/^~(?=\/|$)/, info.home) + '/_code', to: dest });
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
  if (!saved) { runCommand('help.welcome'); return; }       // the very first start: the tutorial
  if (!saved.length) return;                                // nothing open: the start screen shows
  for (const s of saved) {
    try {
      if (s.kind === 'file') await openFile(s.path);
      else if (s.kind === 'guide') await openGuide(s.name, undefined, s.vault ? { vault: s.vault } : {});
      else if (s.kind === 'sandbox') openSandbox();
      else if (s.kind === 'judge') runCommand('judge.open');
      else if (s.kind === 'revise') runCommand('revise.open');
      else if (s.kind === 'graph') { const { openGraph } = await import('./notes.js'); await openGraph(s.vault, s.focus); }
      else if (s.kind === 'tag') { const { openTag } = await import('./notes.js'); await openTag(s.tag); }
      else if (s.kind === 'tags') runCommand('notes.tags');
      else if (s.kind === 'irc') runCommand('irc.open');
      else if (s.kind === 'mail') runCommand('mail.open');
      else if (s.kind === 'music') runCommand('music.open', 'restore');
      else if (s.kind === 'settings') runCommand('app.settings');
      else if (s.kind === 'welcome') runCommand('help.welcome');
      else if (s.kind === 'start') runCommand('help.start');
      else if (s.kind === 'exercise') await runCommand('exercise.open', s.ex);
      else if (s.kind && s.kind.startsWith('page:')) runCommand(s.kind.slice(5));
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
  const appInfo = await call('app.info');
  setHome(appInfo.home);
  setConfig(cfg);
  setLanguageConfig(cfg);
  applyTheme(cfg.theme, cfg.fontSize, cfg.look || {});
  try { await document.fonts.load(`16px "Kernel Path VGA"`); } catch (e) { /* falls back */ }   // the VGA font, from the Kernel Path vault

  const root = document.getElementById('app');
  root.textContent = '';
  buildShell(root, FKEYS);
  initEditorCommands(); initFiles(); initExercises(); initOutline(); initTerminal(); initBuild(); initTests(); initJudge(); initGit(); initGuides(); initNotes(); initRevise();
  await initIrc(); initMail(); initMusic(); initSettings(); initWelcome(); initPalette(); initNewStuff(); initStart();
  initComfort(); initProgress(); initMemviz(); initCompare(); initReference(); initSecurity(); initHabits(); appCommands();
  applyComfort(cfg);
  menubar.build(MENUS);
  toolbar.build(TOOLBAR);
  sidebar.buildHead();
  showLanguage();
  onLanguageChange(() => showLanguage());
  setTheme(cfg.theme);
  setKeymap(cfg.keymap);
  setMusicUrl(cfg.music.url);
  setMusicWhere(cfg.music.where, appInfo.distro && appInfo.distro.wsl);
  if (cfg.workspace) setRoot(cfg.workspace);
  setFolders(cfg.folders || []);

  const [side, sideW, panelH, panelId, tb] = await Promise.all(['ui.sidebar', 'ui.sideWidth', 'ui.panelHeight', 'ui.panel', 'ui.toolbar'].map((key) => call('state.get', { key })));
  if (tb === false) document.documentElement.classList.add('no-toolbar');
  if (sideW) document.documentElement.style.setProperty('--side-w', sideW + 'px');
  if (panelH) document.documentElement.style.setProperty('--panel-h', panelH + 'px');
  sidebar.show(side && sidebar.views.has(side) ? side : 'files');
  if (panelId && panel.views.has(panelId)) panel.show(panelId); else panel.hide();

  const prevChange = tabs.onChange;
  tabs.onChange = (t) => { prevChange(t); call('state.set', { key: 'session.active', value: t ? t.id : null }); if (t && t.file) refreshGit(); };

  const vaultKey = (c) => JSON.stringify(c.vaults || []);
  onSettingsSaved((saved) => {
    const vaultChanged = vaultKey(saved) !== vaultKey(cfg);
    cfg = saved; setConfig(cfg); setLanguageConfig(cfg); showLanguage(); applyComfort(cfg);
    setTheme(cfg.theme, cfg.fontSize); setKeymap(cfg.keymap); setMusicUrl(cfg.music.url); setMusicWhere(cfg.music.where, appInfo.distro && appInfo.distro.wsl);
    if (cfg.workspace) setRoot(cfg.workspace);
    setFolders(cfg.folders || []);
    if (vaultChanged) loadNotes();
  });
  // another part saved settings (a folder added, a vault removed, word wrap): keep up
  window.addEventListener('cpw-config', (e) => { if (e.detail) { cfg = e.detail; setConfig(cfg); applyComfort(cfg); } });

  await restoreSession();
}

boot().catch((err) => {
  document.getElementById('app').textContent = `Couldn't start: ${err.message}`;
  console.error(err);
});
