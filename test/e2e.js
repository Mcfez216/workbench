'use strict';
// End-to-end: the real window in Chromium (browser mode), driven by Playwright.
// Needs playwright installed (npm i -D playwright && npx playwright install chromium).
//   CPW_SHOTS=dir   also save a screenshot of each step / theme there
//   HOME=...        point at a test home (see test/run-all.js, which makes one)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('e2e: playwright not installed, skipped'); process.exit(0); }

const shots = process.env.CPW_SHOTS;
const root = path.join(__dirname, '..');
const PROJ = path.join(process.env.HOME, 'cpp-path');

async function main() {
  const urlFile = path.join(os.tmpdir(), `cpw-url-${process.pid}`);
  const srv = spawn(process.execPath, [path.join(root, 'server', 'index.js'), '--web'], { env: { ...process.env, CPW_URL_FILE: urlFile }, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 100 && !fs.existsSync(urlFile); i++) await new Promise((r) => setTimeout(r, 100));
  const url = fs.readFileSync(urlFile, 'utf8');
  fs.rmSync(urlFile);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  let current = 'start';
  page.on('pageerror', (e) => errors.push(`[${current}] pageerror: ${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${current}] console: ${m.text()}`); });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const step = async (name, fn) => {
    current = name; process.stdout.write(`  ${name} ... `);
    if (process.env.CPW_DEBUG) console.error(`[step] ${name} ${new Date().toISOString()}`);
    try { await fn(); } catch (e) { await shot('FAILED').catch(() => {}); throw e; }
    console.log('ok');
  };
  const menu = async (bar, item) => {
    await page.locator('.menubar-item', { hasText: bar }).click();
    await page.waitForSelector('.menu-pop.from-bar');
    await page.locator('.menu-pop .menu-item .mi-label', { hasText: new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
  };
  // click through the Files tree: open folders stay open
  const openTree = async (...parts) => {
    await page.locator('.side-head button', { hasText: 'Files' }).click();
    let p = PROJ;
    for (const [i, part] of parts.entries()) {
      p = `${p}/${part}`;
      const row = page.locator(`.side-view:not([hidden]) .tree-row[data-path="${p}"]`);
      if (i < parts.length - 1) { if ((await row.locator('.twisty').innerText()) === '[+]') await row.click(); }
      else await row.click();
    }
    await page.waitForSelector(`.tab.active[title="${p}"]`);
    await page.waitForSelector('.tab-page.active .cm-editor');
  };
  const status = () => page.locator('.statusline').innerText();

  try {
    await page.goto(url);
    await page.waitForSelector('.menubar-item');
    await page.waitForTimeout(500);

    await step('first run opens the tutorial', async () => {
      await page.waitForSelector('.tab-page.active .steps .step');
      assert.match(await page.locator('.tab-page.active h1').innerText(), /McFez's HomeBrew Development Environment/);
      assert.strictEqual(await page.title(), "McFez's HomeBrew Development Environment (MHDE)");
      await shot('01-welcome-blue');
    });

    await step('menu opens with F10 and arrows move between menus; Test menu is there', async () => {
      await page.keyboard.press('F10');
      await page.waitForSelector('.menu-pop');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      assert.ok(await page.locator('.menubar-item.open', { hasText: 'Edit' }).count());
      await page.keyboard.press('Escape');
      await page.locator('.menubar-item', { hasText: 'Build' }).click();
      assert.ok(await page.locator('.menu-pop .menu-item', { hasText: 'Debug with gdb' }).count());
      await shot('02-menu-build');
      await page.keyboard.press('Escape');
    });

    await step('Help → tools names this system\'s install command', async () => {
      await menu('Help', 'Which tools are installed?');
      await page.waitForSelector('.dialog .keys-table');
      const title = await page.locator('.dialog h2, .dialog .dialog-title').first().innerText();
      const fam = require('../server/distro').FAMILY;
      if (fam === 'debian') {
        assert.match(title, /Ubuntu|Debian/);
        assert.doesNotMatch(await page.locator('.dialog').innerText(), /dnf/);
      }
      await page.keyboard.press('Escape');
    });

    await step('a C++ file opens with the vault\'s style: C++, 4 spaces, the column-100 mark', async () => {
      await openTree('examples', '03_square.cpp');
      const txt = await page.locator('.tab-page.active .cm-content').innerText();
      assert.match(txt, /square\(i\)/);
      assert.ok(await page.locator('.tab-page.active .cm-editor.cpp-ruler').count(), 'ruler');
      assert.match(await status(), /C\+\+/);
      const ed = page.locator('.tab-page.active .cm-content');
      await ed.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('int f() {\n');
      const lines = await page.locator('.tab-page.active .cm-line').allInnerTexts();
      assert.ok(lines.includes('    '), `indents with 4 spaces: ${JSON.stringify(lines.slice(-3))}`);
      for (let i = 0; i < 6 && /int f\(\)/.test(await ed.innerText()); i++) await page.keyboard.press('Control+z');
      assert.doesNotMatch(await ed.innerText(), /int f\(\)/);
      await page.keyboard.press('F2');
    });

    await step('F9 configures and builds; a broken line lands in Problems and jumps there', async () => {
      await page.keyboard.press('F9');
      await page.waitForFunction(() => /Build OK/.test(document.querySelector('.statusline').innerText), null, { timeout: 180000 });
      const ed = page.locator('.tab-page.active .cm-content');
      await ed.click();
      await page.keyboard.press('Control+Home');
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.type(' nope;');
      await page.keyboard.press('F9');
      await page.waitForSelector('.st-item.bad', { timeout: 60000 });
      await page.waitForSelector('.problems .sev-error');
      const first = await page.locator('.problems button').first().innerText();
      assert.match(first, /03_square\.cpp:7:/);
      await shot('03-build-error');
      await page.locator('.problems button').first().click();
      assert.match(await page.locator('.st-left').innerText(), /\b7:\d+/);
      for (let i = 0; i < 8 && /nope/.test(await ed.innerText()); i++) await page.keyboard.press('Control+z');
      assert.doesNotMatch(await ed.innerText(), /nope/);
      await page.keyboard.press('F2');
      await page.keyboard.press('F9');
      await page.waitForFunction(() => /Build OK/.test(document.querySelector('.statusline').innerText), null, { timeout: 60000 });
    });

    await step('F7 runs every test; the Tests sidebar ticks them off', async () => {
      await page.keyboard.press('F7');
      await page.waitForFunction(() => /100% tests passed/.test(document.querySelector('.statusline').innerText), null, { timeout: 60000 });
      await page.waitForFunction(() => document.querySelectorAll('.tests-view .test-row.st-passed').length === 6, null, { timeout: 10000 });
      await page.waitForFunction(() => /CTest: 6 tests · 6 ✓/.test(document.querySelector('.tests-view')?.innerText || ''), null, { timeout: 10000 });
      await shot('04-tests');
    });

    await step('a project stub: ▶ builds it and shows 1/3 test cases passing', async () => {
      await page.locator('.test-proj .row-tools button[title^="Build the stub"]').click();
      await page.waitForFunction(() => /1\/3/.test(document.querySelector('.test-proj .test-badge')?.innerText || ''), null, { timeout: 60000 });
      assert.match(await status(), /1\/3 test cases pass/);
      assert.ok(await page.locator('.problems button', { hasText: 'test_words.cpp:5' }).count(), 'the failing CHECK is a problem');
      await page.locator('.test-proj .tree-row').click();
      await page.waitForSelector('.tab.active:has-text("words.cpp")');
      await shot('05-project-stub');
    });

    await step('Ctrl+F9 runs a program; AddressSanitizer\'s report turns its line red', async () => {
      await openTree('examples', '02_dangling.cpp');
      await page.keyboard.press('Control+F9');
      await page.waitForSelector('.tab-page.active .cm-runtimeLine', { timeout: 60000 });
      assert.match(await page.locator('.tab-page.active .cm-runtimeMsg').innerText(), /heap-use-after-free/);
      assert.ok(await page.locator('.problems .sev-error', { hasText: 'runtime' }).count());
      await shot('06-runtime-asan');
    });

    await step('the sandbox: break it, see the red line, then the assembly', async () => {
      await page.keyboard.press('F4');
      await page.waitForSelector('.tab-page.active[data-kind="sandbox"] .cm-editor');
      await page.selectOption('.tab-page.active select', { label: 'Break it: use after free (ASan)' });
      await page.keyboard.press('Control+F9');
      await page.waitForSelector('.tab-page.active[data-kind="sandbox"] .cm-runtimeLine', { timeout: 30000 });
      assert.match(await page.locator('.tab-page.active .cm-runtimeMsg').innerText(), /use-after-free/);
      await page.locator('.tab-page.active .btn', { hasText: 'Assembly' }).click();
      await page.waitForFunction(() => /main:/.test(document.querySelector('.tab-page.active .asm-host')?.innerText || ''), null, { timeout: 20000 });
      await page.locator('.tab-page.active .editor-host').first().locator('.cm-line', { hasText: 'delete p' }).click();
      await page.waitForSelector('.tab-page.active .asm-host .cm-asmHot');
      await shot('07-sandbox-asm');
      await page.locator('.tab-page.active .btn', { hasText: 'Assembly' }).click();
    });

    await step('the judge: AC for the right answer, WA for a wrong one', async () => {
      await openTree('cp', 'template.cpp');
      await page.keyboard.press('F8');
      await page.waitForSelector('.tab-page.active .judge-case');
      // start from one empty case (the cases for a file are remembered)
      while (await page.locator('.tab-page.active .judge-case').count() > 1) await page.locator('.tab-page.active .judge-case .judge-head .btn').first().click();
      const ta = page.locator('.tab-page.active .judge-case textarea');
      await ta.nth(0).fill('3\n1 2 3\n');
      await ta.nth(1).fill('6\n');
      await page.locator('.tab-page.active .btn', { hasText: 'Add case' }).click();
      await ta.nth(2).fill('2\n5 5\n');
      await ta.nth(3).fill('11\n');
      await page.keyboard.press('F8');
      await page.waitForSelector('.tab-page.active .judge-case .verdict', { timeout: 60000 });
      assert.deepStrictEqual(await page.locator('.tab-page.active .judge-case .verdict').allInnerTexts(), ['AC', 'WA']);
      assert.match(await page.locator('.tab-page.active .judge-summary').innerText(), /1 of 2 cases accepted/);
      await shot('08-judge');
    });

    await step('terminal tabs close with ×, Ctrl+Shift+W and exit', async () => {
      await page.keyboard.press('F5');
      await page.waitForSelector('.term-tabs');
      const before = await page.locator('.term-tab').count();
      await page.keyboard.press('Control+Shift+T');
      await page.waitForFunction((b) => document.querySelectorAll('.term-tab').length === b + 1, before);
      await page.keyboard.press('Control+Shift+T');
      await page.waitForFunction((b) => document.querySelectorAll('.term-tab').length === b + 2, before);
      const n = before + 2;
      await page.locator('.term-tab.active .term-x').click();
      await page.waitForFunction((m) => document.querySelectorAll('.term-tab').length === m - 1, n);
      await page.locator('.term-tab').last().locator('.term-label').click();
      await page.keyboard.press('Control+Shift+W');
      await page.waitForFunction((m) => document.querySelectorAll('.term-tab').length === m - 2, n);
      await page.keyboard.press('Control+Shift+T');
      await page.waitForFunction((m) => document.querySelectorAll('.term-tab').length === m - 1, n);
      await page.waitForTimeout(2300);
      await page.keyboard.type('exit');
      await page.keyboard.press('Enter');
      await page.waitForFunction((m) => document.querySelectorAll('.term-tab').length === m - 2, n, { timeout: 5000 });
      assert.strictEqual(await page.locator('.term-tab', { hasText: '(ended)' }).count(), 0);
    });

    await step('split: a file on the left, another tab beside it, divider, collapse', async () => {
      assert.ok(await page.locator('.tab', { hasText: /\.cpp|\.h/ }).count() > 0, 'a file tab is open');
      const fileTab = page.locator('.tab', { hasText: /\.cpp|\.h/ }).first();
      await fileTab.click();
      const name = (await fileTab.locator('.tab-label').innerText()).replace('● ', '');
      // open Settings, then send it to the right
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      // Ctrl+Shift+P is the command palette: it opens, lists commands with their keys, Escape closes it
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette .palette-row');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.veil'));
      await page.locator('.menubar-item', { hasText: 'View' }).click();
      await page.locator('.menu-pop >> text=Move this tab to the other side').click();
      await page.waitForSelector('.tabbody.split .pane.right:not([hidden]) .tab-page.active');
      // left still shows something, right shows the moved tab, both visible at once
      assert.strictEqual(await page.locator('.pane.right .tab-page.active').count(), 1);
      assert.strictEqual(await page.locator('.pane.left .tab-page.active').count(), 1);
      const wl = await page.locator('.pane.left').evaluate((e) => e.getBoundingClientRect().width);
      const wr = await page.locator('.pane.right').evaluate((e) => e.getBoundingClientRect().width);
      assert.ok(wl > 100 && wr > 100, `both sides have room (${wl}, ${wr})`);
      assert.ok(await page.locator('.tab.right').count() === 1);
      // drag the divider
      const d = await page.locator('.split-div').boundingBox();
      await page.mouse.move(d.x + 2, d.y + 40); await page.mouse.down(); await page.mouse.move(d.x + 202, d.y + 40); await page.mouse.up();
      const wl2 = await page.locator('.pane.left').evaluate((e) => e.getBoundingClientRect().width);
      assert.ok(Math.abs(wl2 - (wl + 200)) < 12, `divider moved (${wl} -> ${wl2})`);
      await shot('09b-split');
      // clicking the left side makes it the focused one
      await page.locator('.pane.left').click({ position: { x: 40, y: 80 } });
      assert.ok(await page.locator('.pane.left.focused').count() === 1);
      // double-click the right tab: it comes back, the split collapses
      await page.locator('.tab.right').dblclick();
      await page.waitForFunction(() => !document.querySelector('.tabbody.split'));
      assert.strictEqual(await page.locator('.pane.right').isVisible(), false);
      assert.ok(await page.locator('.tab', { hasText: name }).count() >= 1);
    });

    if (process.env.CPW_VAULT_OK) {
      await step('guides render the vault: callouts, wikilinks, Try in sandbox, and _code means your copy', async () => {
        await page.keyboard.press('F1');
        await page.locator('.side-view:not([hidden]) .tree-row', { hasText: 'CPP Start Here' }).click();
        await page.waitForSelector('.tab-page.active .md .callout[data-callout="abstract"]');
        assert.ok(await page.locator('.tab-page.active a.wikilink').count() > 0);
        await shot('09-guide');
        await page.locator('.side-view:not([hidden]) .tree-row', { hasText: '5.03 A Competitive Programming Starter Template' }).click();
        await page.waitForSelector('.tab.active:has-text("5.03")');
        await page.waitForSelector('.tab-page.active .code-tools button:has-text("Try in sandbox")');
        await page.locator('.side-view:not([hidden]) .tree-row', { hasText: 'P01 Text Statistics' }).click();
        await page.waitForSelector('.tab.active:has-text("P01 Text Statistics")');
        await page.locator('.tab-page.active .codeblock[data-lang="bash"] button:has-text("Paste into terminal")').first().click();
        await page.waitForFunction(() => /cd ~\/cpp-path/.test(document.querySelector('.term-host')?.innerText || ''), null, { timeout: 10000 });
        await page.keyboard.press('Control+c');
      });
      await step('revise: three decks, a card, graded', async () => {
        await page.keyboard.press('Control+Shift+V');
        await page.waitForSelector('.tab-page.active .card-front');
        const decks = await page.locator('.tab-page.active select').first().locator('option').allInnerTexts();
        assert.deepStrictEqual(decks.map((d) => d.replace(/ \(\d+\)$/, '')), ['Check-yourself questions', 'Why this matters', 'Cheat-sheet tables']);
        await page.keyboard.press('Space');
        await page.waitForSelector('.tab-page.active .card-back:not([hidden])');
        await shot('10-revise');
        await page.keyboard.press('3');
      });
    }

    await step('git: a change shows, a hunk stages, a commit lands (no sign-off by default)', async () => {
      await openTree('tests', 'MathTest.cpp');
      const ed = page.locator('.tab-page.active .cm-content');
      await ed.click();
      await page.keyboard.press('Control+Home');
      await page.keyboard.type('// Tests for the demo library\n');
      await page.keyboard.press('F2');
      await page.keyboard.press('F6');
      await page.waitForSelector('.git-file');
      // clangd's index (.cache/) shows up untracked: one click ignores it
      if (await page.locator('.btn', { hasText: 'Ignore .cache/' }).count()) {
        await page.locator('.btn', { hasText: 'Ignore .cache/' }).click();
        await page.waitForSelector('.git-file[title=".gitignore (modified)"]');
      }
      assert.strictEqual(await page.locator('.git-file[title^=".cache/"]').count(), 0);
      await page.locator('.git-file', { hasText: 'tests/MathTest.cpp' }).click();
      await page.waitForSelector('.tab-page.active .hunk');
      await shot('11-git-diff');
      await page.locator('.tab-page.active .hunk-head button').first().click();
      await page.waitForSelector('.git-head:has-text("Staged")');
      assert.strictEqual(await page.locator('.git-commit input[type="checkbox"]').first().isChecked(), false, 'Signed-off-by is off');
      await page.fill('.commit-msg', 'tests: say what the file tests');
      await page.locator('.git-commit .btn.primary').click();
      await page.waitForSelector('.toast.ok');
      await page.keyboard.press('Escape');
    });

    if (process.env.CPW_FAKE_SERVERS) {
      await step('IRC: SASL login, join #c++-basic, hear alice, say hello', async () => {
        await menu('Tools', 'IRC');
        await page.waitForSelector('.tab.active:has-text("IRC")');
        await page.locator('.tab-page.active .irc .btn', { hasText: 'Connect' }).click();
        await page.locator('.irc-buf', { hasText: '#c++-basic' }).click({ timeout: 10000 });
        await page.waitForFunction(() => document.querySelector('.irc-lines')?.innerText.includes('welcome to #c++-basic'), null, { timeout: 10000 });
        await page.fill('.irc-input', 'hello from the workbench');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.irc-lines')?.innerText.includes('hello from the workbench'));
        assert.ok(await page.locator('.irc-user', { hasText: 'alice' }).count());
        await shot('12-irc');
      });
      await step('mail: threads, read a patch, mutt keys', async () => {
        await page.keyboard.press('Control+Shift+M');
        await page.waitForFunction(() => document.querySelectorAll('.tab-page.active .mail-row').length === 4, null, { timeout: 15000 });
        const rows = await page.locator('.tab-page.active .mail-row').allInnerTexts();
        assert.ok(rows.some((r) => /└─>/.test(r)), 'replies are threaded');
        await page.locator('.tab-page.active .mail-row', { hasText: '[PATCH]' }).click();
        await page.keyboard.press('Enter');
        await page.waitForSelector('.tab-page.active .mail.reading .mail-body');
        assert.ok(await page.locator('.tab-page.active .btn', { hasText: 'Apply with git am' }).count());
        await page.keyboard.press('j');
        await page.waitForFunction(() => /Reviewed-by/.test(document.querySelector('.tab-page.active .mail-body')?.innerText || ''));
        await page.keyboard.press('q');
        assert.strictEqual(await page.locator('.tab-page.active .mail.reading').count(), 0);
      });
    }

    await step('Vim keys: :w, :CMakeBuild and \\ct like the vault\'s cpp-path.lua', async () => {
      const keys = async (label) => {
        await page.locator('.menubar-item', { hasText: 'Options' }).click();
        await page.locator('.menu-item', { hasText: 'Editor keys' }).click();
        await page.locator('.menu-item', { hasText: label }).click();
        await page.waitForTimeout(200);
      };
      await page.locator('.tab', { hasText: '03_square.cpp' }).first().click();
      await keys('Vim');
      const ed = page.locator('.tab-page.active .cm-content');
      await ed.click();
      await page.keyboard.press('Escape');
      assert.match(await page.locator('.st-item.mode').innerText(), /NORMAL/);
      await page.keyboard.type('A ');
      assert.match(await page.locator('.st-item.mode').innerText(), /INSERT/, 'the mode shows for a tab opened before Vim keys');
      await page.keyboard.press('Escape');
      assert.match(await page.locator('.st-item.mode').innerText(), /NORMAL/, 'one Escape leaves insert mode, even with completion pending');
      await page.keyboard.type(':w'); await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      assert.strictEqual(await page.locator('.tab.active .tab-label').innerText(), '03_square.cpp', ':w saved (no dirty mark)');
      await page.keyboard.press('u');
      await page.keyboard.type(':w'); await page.keyboard.press('Enter');
      await page.keyboard.type(':CMakeBuild'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => /Build OK/.test(document.querySelector('.statusline').innerText), null, { timeout: 60000 });
      await page.keyboard.type('\\ct');
      await page.waitForFunction(() => /100% tests passed/.test(document.querySelector('.statusline').innerText), null, { timeout: 60000 });
      await keys('Standard');
    });

    await step('the toolbar\'s C / C++ switch: the sandbox becomes C, and ASan still catches it', async () => {
      await page.locator('.toolbar-main .lang-switch .choice', { hasText: /^C$/ }).click();
      await page.waitForFunction(() => /C: C17 · gcc/.test(document.querySelector('.statusline').innerText));
      await page.keyboard.press('F4');
      await page.waitForSelector('.tab.active:has-text("C sandbox")');
      assert.strictEqual(await page.locator('.tab-page.active .sb-file').innerText(), 'scratch.c');
      await page.selectOption('.tab-page.active select', { label: 'Break it: use after free (ASan)' });
      await page.waitForFunction(() => /free\(p\);/.test(document.querySelector('.tab-page.active .cm-content')?.innerText || ''));
      await page.keyboard.press('Control+F9');
      await page.waitForSelector('.tab-page.active[data-kind="sandbox"] .cm-runtimeLine', { timeout: 30000 });
      assert.match(await page.locator('.tab-page.active .cm-runtimeMsg').innerText(), /use-after-free/);
      await shot('14-c-sandbox');
      // Ctrl+Shift+J flips back: the sandbox brings back its C++ source
      await page.keyboard.press('Control+Shift+J');
      await page.waitForSelector('.tab.active:has-text("C++ sandbox")');
      await page.waitForFunction(() => /std::/.test(document.querySelector('.tab-page.active .cm-content')?.innerText || '') || /#include <i/.test(document.querySelector('.tab-page.active .cm-content')?.innerText || ''));
      assert.match(await page.locator('.statusline').innerText(), /C\+\+: C\+\+20 · g\+\+/);
    });

    await step('guides: several vaults side by side, and a link stays in its own vault', async () => {
      await page.keyboard.press('F1');
      await page.waitForSelector('.side-view:not([hidden]) .vault-row:has-text("C-Path")');
      assert.ok(await page.locator('.side-view:not([hidden]) .vault-row', { hasText: 'Scratch Notes' }).count());
      await page.locator('.side-view:not([hidden]) .tree-row', { hasText: 'C Start Here' }).click();
      await page.waitForSelector('.tab.active:has-text("C Start Here")');
      await page.locator('.tab-page.active a.wikilink', { hasText: 'Pointers' }).click();
      await page.waitForSelector('.tab-page.active h1:has-text("Pointers in C")');
      // the C example goes to the C sandbox
      await page.locator('.tab-page.active .code-tools button', { hasText: 'Try in sandbox' }).click();
      await page.waitForSelector('.tab.active:has-text("C sandbox")');
      await page.waitForFunction(() => /int \*p = &x;/.test(document.querySelector('.tab-page.active .cm-content')?.innerText || ''));
      // the other vault's Start Here links to its own Pointers note
      await page.keyboard.press('F1');
      await page.locator('.side-view:not([hidden]) .tree-row', { hasText: /^Start Here$/ }).click();
      await page.locator('.tab-page.active a.wikilink', { hasText: 'Pointers' }).click();
      await page.waitForSelector('.tab-page.active h1:has-text("Pointers, in my words")');
      assert.strictEqual(await page.locator('.tab .tab-label', { hasText: /^Pointers$/ }).count(), 2, 'two Pointers tabs, one per vault');
      // fold a vault away
      await page.locator('.side-view:not([hidden]) .vault-row', { hasText: 'Scratch Notes' }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll('.side-view:not([hidden]) .tree-row')].some((b) => b.textContent === 'Start Here'));
      await shot('15-vaults');
      await page.keyboard.press('Control+Shift+J');   // back to C++
      await page.waitForFunction(() => /C\+\+: /.test(document.querySelector('.statusline').innerText));
    });

    await step('notes: what links here, the graph, today\'s note, a box ticked in the file, a tag', async () => {
      const foot = page.locator('.tab-page.active .note-foot');
      await foot.waitFor();
      assert.match(await foot.innerText(), /Linked from 1 note[\s\S]*Start Here[\s\S]*My own take/);
      await foot.locator('button', { hasText: 'Show in graph' }).click();
      await page.waitForSelector('.tab-page.active .graph-node.focus');
      assert.strictEqual(await page.locator('.tab-page.active .graph-node').count(), 2);
      await page.waitForTimeout(400);
      await shot('16-graph');
      await page.locator('.tab-page.active .graph-node', { hasText: 'Start Here' }).click();
      await page.waitForSelector('.tab-page.active h1:has-text("My notes")');
      // today's note, made in the vault you're reading; tick its first box
      await page.keyboard.press('F1');
      await page.locator('.side-view:not([hidden]) .side-tools button', { hasText: 'Day' }).click();
      await page.locator('.tab', { hasText: /^\d{4}-\d\d-\d\d/ }).first().waitFor();
      const daily = (() => { for (const v of ['Scratch Notes', 'C-Path']) { const d = path.join(process.env.HOME, 'Notes', v, 'Daily'); if (fs.existsSync(d)) return path.join(d, fs.readdirSync(d)[0]); } return null; })();
      assert.ok(daily, 'Daily/<today>.md made');
      await page.locator('.tab', { hasText: /^\d{4}-\d\d-\d\d/ }).first().click();
      await page.locator('.tab-page.active[data-kind=guide] button.task').first().click();
      await page.waitForFunction(() => document.querySelector('.tab-page.active[data-kind=guide] button.task.done'));
      assert.match(fs.readFileSync(daily, 'utf8'), /- \[x\] Read one note/);
      await page.locator('.tab-page.active[data-kind=guide] .note-foot a.tag', { hasText: '#daily' }).click();
      await page.waitForSelector('.tab-page.active h2:has-text("#daily")');
      // close today's note (page and editor) before it goes, so a reload doesn't look for it
      while (await page.locator('.tab', { hasText: /^\d{4}-\d\d-\d\d/ }).count()) await page.locator('.tab', { hasText: /^\d{4}-\d\d-\d\d/ }).first().locator('.tab-close').click();
      fs.rmSync(path.dirname(daily), { recursive: true, force: true });
    });

    await step('Rust: the switch has three languages; the Rust sandbox runs, a panic turns its line red, a borrow error explains itself', async () => {
      const sw = page.locator('.toolbar-main .lang-switch');
      assert.deepStrictEqual((await sw.locator('.choice').allInnerTexts()).map((t) => t.trim()), ['C', 'C++', 'Rust']);
      await sw.locator('.choice', { hasText: 'Rust' }).click();
      await page.waitForFunction(() => /Rust: Edition 2024/.test(document.querySelector('.statusline').innerText));
      await page.keyboard.press('F4');
      await page.waitForSelector('.tab-page.active .sb-file:text("scratch.rs")');
      assert.ok(await page.locator('.tab-page.active .toolbar button:has-text("Valgrind")').isHidden(), 'no Valgrind for Rust');
      await page.locator('.tab-page.active select[title="Load an example"]').selectOption('Break it: index out of bounds (panic)');
      await page.keyboard.press('Control+F9');
      await page.waitForSelector('.tab-page.active .cm-runtimeLine', { timeout: 30000 });
      await page.waitForFunction(() => /index out of bounds/.test(document.querySelector('.statusline').innerText), null, { timeout: 30000 });
      await shot('17-rust-panic');
      await page.locator('.tab-page.active select[title="Load an example"]').selectOption('Break it: use after move (compile error)');
      await page.keyboard.press('Control+F9');
      await page.waitForSelector('.problems li:has-text("borrow of moved value")', { timeout: 30000 });
      await page.locator('.problems li:has-text("borrow of moved value") .explain-toggle').click();
      await page.waitForSelector('.problems .explain .ex-title:has-text("Using a value after it moved")');
      await page.locator('.problems button:has-text("rustc --explain E0382")').click();
      await page.waitForSelector('.rust-explain');
      await page.keyboard.press('Control+W');
      await sw.locator('.choice', { hasText: /^C\+\+$/ }).click();
      await page.waitForFunction(() => /C\+\+: /.test(document.querySelector('.statusline').innerText));
    });

    await step('Rust projects: the Tests sidebar lists R01-R05, ▶ runs your stub, Shift+F7 runs the #[test] under the cursor', async () => {
      fs.cpSync(path.join(__dirname, '..', 'vaults', 'Rust-Path', '_code'), path.join(PROJ, 'rust-path'), { recursive: true });
      await page.locator('.side-head button', { hasText: 'Files' }).click();
      await page.locator('.side-view:not([hidden]) .side-title button[title="Refresh"]').first().click().catch(() => {});
      await openTree('rust-path', 'projects', 'r01_word_frequency', 'src', 'lib.rs');
      await page.locator('.side-head button', { hasText: 'Tests' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.tests-view .test-proj').length === 5, null, { timeout: 30000 });
      const r01 = page.locator('.test-proj', { hasText: /R01 word frequency/i });
      await r01.locator('.row-tools button[title^="Build the stub"]').click();
      await page.waitForFunction(() => /0\/10/.test(document.querySelector('.test-proj .test-badge')?.innerText || ''), null, { timeout: 120000 });
      assert.match(await status(), /0\/10 test cases pass/);
      assert.ok(await r01.locator('button[title^="Peek"]').count(), 'the solution is there to peek at');
      await openTree('rust-path', 'projects', 'r01_word_frequency', 'tests', 'r01_word_frequency.rs');
      // line 41, in ties_are_alphabetical (the editor only draws the lines on screen)
      await page.locator('.tab-page.active .cm-line').first().click();
      for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => /\b41:\d+/.test(document.querySelector('.st-left').innerText));
      await page.keyboard.press('Shift+F7');
      await page.waitForFunction(() => /0\/1 test cases pass/.test(document.querySelector('.statusline').innerText), null, { timeout: 60000 });
      await shot('18-rust-projects');
      await page.keyboard.press('Control+W');
      await page.keyboard.press('Control+W');
    });

    await step('colour by language: off by default; on, C is a lighter blue, C++ the dark blue, Rust orange; the terminal keeps its colours', async () => {
      const v = (k) => page.evaluate((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim(), k);
      const sw = page.locator('.toolbar-main .lang-switch');
      const cppBg = await v('--editor-bg');
      await sw.locator('.choice', { hasText: /^C$/ }).click();
      assert.strictEqual(await v('--editor-bg'), cppBg, 'off unless you turn it on');
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('colour by language');
      await page.waitForSelector('.palette-row.sel:has-text("Colour by language")');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'c');
      const cBg = await v('--editor-bg');
      assert.notStrictEqual(cBg, cppBg);
      await shot('19-lang-colour-c');
      await sw.locator('.choice', { hasText: /^C\+\+$/ }).click();
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'cpp');
      assert.strictEqual(await v('--editor-bg'), cppBg, 'C++ is the theme as it was');
      await shot('19-lang-colour-cpp');
      await sw.locator('.choice', { hasText: 'Rust' }).click();
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'rust');
      const rustBg = await v('--editor-bg');
      const [r, g, b] = rustBg.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
      assert.ok(r > g && g > b, `orange-ish: ${rustBg}`);
      await shot('19-lang-colour-rust');
      // a theme change keeps it; it survives a reload (it's a setting)
      await page.reload();
      await page.waitForSelector('.menubar-item');
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'rust');
      await page.waitForTimeout(500);
      // the switch can follow the tab in front: a .cpp file makes it C++ (blue again)
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('switch follows');
      await page.waitForSelector('.palette-row.sel:has-text("follows the file")');
      await page.keyboard.press('Enter');
      await openTree('examples', '01_greet.cpp');
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'cpp');
      await openTree('rust-path', 'projects', 'r01_word_frequency', 'src', 'lib.rs');
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'rust');
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('switch follows');
      await page.waitForSelector('.palette-row.sel:has-text("follows the file")');
      await page.keyboard.press('Enter');
      // and off again
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('colour by language');
      await page.waitForSelector('.palette-row.sel:has-text("Colour by language")');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.documentElement.dataset.langColours === 'off');
      assert.strictEqual(await v('--editor-bg'), cppBg);
      await sw.locator('.choice', { hasText: /^C\+\+$/ }).click();
    });

    await step('the palette runs anything by name; New file makes a C program; the outline lists it', async () => {
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('new file');
      await page.waitForSelector('.palette-row.sel:has-text("New file")');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.dialog:has-text("New file")');
      await page.locator('.dialog .choice', { hasText: /^C$/ }).click();
      await page.locator('.dialog #nf-name').fill('tryit');
      await page.locator('.dialog #nf-dir').fill('~/scratch-c');      // not in a CMake project: gcc builds it alone
      assert.match(await page.locator('.dialog .hint').innerText(), /tryit\.c$/);
      await page.locator('.dialog .dlg-btn', { hasText: 'Create' }).click();
      await page.waitForSelector('.tab.active:has-text("tryit.c")');
      await page.waitForFunction(() => /int main\(void\)/.test(document.querySelector('.tab-page.active .cm-content')?.innerText || ''));
      await page.keyboard.press('Control+Shift+B');
      await page.waitForSelector('.side-view:not([hidden]) .outline-row:has-text("main")');
      assert.match(await page.locator('.side-view:not([hidden]) .outline-row').first().innerText(), /main\s*\(void\)/);
      // Ctrl+F9 on a lone .c file: gcc, then it runs
      await page.keyboard.press('Control+F9');
      await page.waitForFunction(() => /Hello from tryit!/.test(document.querySelector('.term-host')?.innerText || ''), null, { timeout: 20000 });
      await page.keyboard.press('Control+Shift+W');
    });

    await step('the start screen: the language, ways to begin, and recent files', async () => {
      await page.locator('.menubar-item', { hasText: 'Help' }).click();
      await page.locator('.menu-pop .menu-item', { hasText: 'Start screen' }).click();
      await page.waitForSelector('.tab-page.active .start .start-action:has-text("New project")');
      assert.ok(await page.locator('.tab-page.active .start .list-row', { hasText: 'tryit.c' }).count(), 'recent files');
      assert.ok(await page.locator('.tab-page.active .start .list-row', { hasText: 'C-Path' }).count(), 'vaults');
      await shot('16-start');
      await page.keyboard.press('Control+W');
    });

    await step('an exercise: F7 says what came back, fix it, the next step opens', async () => {
      await page.locator('.toolbar-main .tb-btn', { hasText: 'Learn' }).click();
      await page.locator('.side-view:not([hidden]) .ex-row', { has: page.locator('.name', { hasText: /^First functions$/ }) }).click();
      await page.waitForSelector('.tab-page[data-kind="exercise"] .ex-step.current');
      await page.waitForSelector('.tab.active:has-text("first.c")');
      // (the backend tests used this exercise too: start it from a wrong add, whatever they left)
      const f = path.join(process.env.HOME, 'workbench-exercises', 'c-first-functions', 'first.c');
      const setAdd = (body) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/int add\(int a, int b\) \{[\s\S]*?\n\}/, `int add(int a, int b) {\n    ${body}\n}`));
      setAdd('return a * b;');
      await page.keyboard.press('F7');
      await page.waitForFunction(() => /got 6, expected 5/.test(document.querySelector('.ex-result')?.innerText || ''), null, { timeout: 30000 });
      setAdd('return a + b;');
      await page.keyboard.press('F7');
      await page.waitForFunction(() => /Step 1 passes/.test(document.querySelector('.ex-result')?.innerText || ''), null, { timeout: 30000 });
      assert.ok(await page.locator('.ex-step.current', { hasText: 'max3' }).count(), 'step 2 is open');
      await page.locator('.tab-page[data-kind="exercise"] .btn', { hasText: 'A hint' }).click();
      assert.ok(await page.locator('.ex-hints li').count() === 1, 'one hint at a time');
      await shot('17-exercise');
    });

    await step('a compile error has a ? that explains it in plain words; it becomes a flashcard', async () => {
      const f = path.join(process.env.HOME, 'workbench-exercises', 'c-first-functions', 'first.c');
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('return a + b;', 'return a + c;'));
      await page.keyboard.press('F7');
      await page.waitForSelector('.problems .explain-toggle', { timeout: 30000 });
      await page.locator('.problems .explain-toggle').first().click();
      await page.waitForSelector('.problems .explain .ex-label:has-text("Try this")');
      assert.match(await page.locator('.problems .explain .ex-title').first().innerText(), /Not declared/);
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('return a + c;', 'return a + b;'));
      await page.keyboard.press('Control+Shift+V');
      await page.waitForSelector('.tab-page.active .card-stage');
      await page.selectOption('.tab-page.active select', 'mistakes');
      const label = await page.locator('.tab-page.active select option[value="mistakes"]').innerText();
      assert.ok(+(label.match(/\((\d+)\)/) || [])[1] >= 1, label);
      await page.waitForSelector('.tab-page.active .card-front');
    });

    await step('focus mode: one task, a timer, the editor still there; Done brings it all back', async () => {
      await page.locator('.tab', { hasText: 'first.c' }).click();
      await page.keyboard.press('Control+Shift+G');
      await page.locator('.dialog #focus-task').fill('make step 2 pass');
      await page.locator('.dialog .dlg-btn', { hasText: 'Start' }).click();
      await page.waitForSelector('.focus-bar .fb-time');
      assert.strictEqual(await page.locator('.sidebar').isVisible(), false);
      assert.ok((await page.locator('.tab-page.active .cm-editor').boundingBox()).width > 400, 'the editor keeps its room');
      await shot('18-focus');
      await page.locator('.focus-bar .fb-btn', { hasText: 'Done' }).click();
      await page.waitForFunction(() => !document.querySelector('.focus-bar') && document.querySelector('.sidebar').offsetWidth > 0);
    });

    await step('memory view: frames, a pointer arrow, the heap, stepping back and forth', async () => {
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('visualise memory');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.tab-page.active .viz-frame', { timeout: 60000 });
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.waitForSelector('.tab-page.active .viz-arrow');
      const n = await page.locator('.tab-page.active .viz-slider').getAttribute('max');
      assert.ok(+n > 3);
      await shot('19-memviz');
      await page.keyboard.press('Control+W');
    });

    await step('security: hardening compared three ways, and the binary inspector', async () => {
      await page.keyboard.press('F4');
      await page.waitForSelector('.tab.active:has-text("sandbox")');
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('three ways');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.tab-page.active .sec-table', { timeout: 60000 });
      assert.match(await page.locator('.tab-page.active .sec-table').innerText(), /Stack canary/);
      await page.locator('.tab-page.active .btn', { hasText: 'Inspect: Everything off' }).click();
      await page.locator('.tab-page.active .choice', { hasText: 'Symbols' }).click();
      await page.locator('.tab-page.active .inspect-body a', { hasText: /^main$/ }).first().click();
      await page.waitForSelector('.tab-page.active pre.disasm');
      await shot('20-inspect');
      await page.keyboard.press('Control+W');
      await page.locator('.tab', { hasText: 'Hardening' }).click();
      await page.keyboard.press('Control+W');
    });

    await step('every theme applies (and saves)', async () => {
      await page.locator('.tab', { hasText: '03_square.cpp' }).first().click();
      for (const name of ['turbo', 'norton', 'amber', 'modern', 'calm', 'blue']) {
        await page.keyboard.press('Control+Shift+Y');
        await page.waitForTimeout(250);
        const t = await page.evaluate(() => document.documentElement.dataset.theme);
        assert.strictEqual(t, name);
        await shot(`13-theme-${name}`);
      }
    });

    await step('reload keeps the open tabs and the terminals', async () => {
      // diffs and search results are throwaway; everything else comes back
      const titles = async () => (await page.locator('.tab .tab-label').allInnerTexts()).filter((t) => !/^(Diff|Staged):/.test(t)).sort();
      const before = await titles();
      // a split survives the reload: send the Judge tab right first
      await page.locator('.tab', { hasText: 'Judge' }).click();
      await page.keyboard.press('Control+Shift+|');
      await page.waitForSelector('.tabbody.split');
      await page.reload();
      await page.waitForSelector('.tab');
      await page.waitForTimeout(1200);
      assert.deepStrictEqual(await titles(), before);
      assert.strictEqual(await page.locator('.tab.right .tab-label', { hasText: 'Judge' }).count(), 1, 'Judge is still on the right');
      assert.ok(await page.locator('.tabbody.split .pane.right .tab-page.active').count() === 1);
      // back to one side for the rest (an exercise sits on the right too, so close the split itself)
      await page.keyboard.press('Control+Shift+P');
      await page.waitForSelector('.palette input:focus');
      await page.keyboard.type('close the split');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.tabbody.split'));
      // terminals live in the backend: they come back with their output
      if (!(await page.locator('.term-host').count()) || !(await page.locator('.term-host').isVisible())) await page.keyboard.press('F5');
      await page.locator('.term-tab .term-label', { hasText: 'run: ex02_dangling' }).click();
      await page.waitForFunction(() => /ABORTING/.test(document.querySelector('.term-host')?.innerText || ''), null, { timeout: 10000 });
    });

    const real = errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED|status of 404/.test(e));
    assert.deepStrictEqual(real, [], 'no errors in the page');
  } finally {
    await browser.close();
    srv.kill();
  }
}

main().then(() => console.log('e2e: all passed')).catch((e) => { console.error('\ne2e FAILED:', e.message); process.exit(1); });
