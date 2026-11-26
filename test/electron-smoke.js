'use strict';
// Starts the real desktop app, opens the Music tab, checks the window and
// the isolated web view, saves a screenshot and quits.
//   npx electron test/electron-smoke.js [screenshot-dir]
// (inside a container running as root, Chromium also needs --no-sandbox)

const { app, webContents } = require('electron');
const fs = require('fs');
const path = require('path');

const outDir = process.argv.find((a, i) => i > 1 && !a.startsWith('-') && !a.endsWith('.js')) || null;
const results = [];
const check = (ok, name) => { results.push([ok, name]); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`); };

require('../main.js');

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const js = (code) => win.webContents.executeJavaScript(code);
      for (let i = 0; i < 50 && !(await js('!!document.querySelector(".menubar-item")')); i++) await wait(200);
      check(await js('!!document.querySelector(".menubar-item")'), 'the window loads the app from the local backend');
      check(await js('typeof require === "undefined" && typeof process === "undefined"'), 'the page has no Node access');
      check(win.getTitle() === "McFez's HomeBrew Development Environment (MHDE)", `the window is titled MHDE (${win.getTitle()})`);
      // let the last session's tabs finish coming back
      let n = -1;
      for (let i = 0; i < 30; i++) { await wait(400); const m = await js('document.querySelectorAll(".tab").length'); if (m === n) break; n = m; }
      await js(`(() => { [...document.querySelectorAll('.menubar-item')].find((b) => b.textContent === 'Tools').click();
        [...document.querySelectorAll('.menu-item')].find((b) => b.textContent.startsWith('Music')).click(); })()`);
      let guest = null;
      for (let i = 0; i < 50 && !guest; i++) { await wait(200); guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview'); }
      check(!!guest, 'the Music tab attaches an isolated web view');
      if (guest) {
        check(guest.session !== win.webContents.session, 'music has its own cookie jar (persist:music)');
        check(!(await guest.executeJavaScript('typeof require !== "undefined"').catch(() => false)), 'the music view has no Node access');
        check(await js('!!document.querySelector(".tab-page.active[data-kind=music] webview")'), 'the music tab is showing');
      }
      await wait(2500);
      if (outDir) fs.writeFileSync(path.join(outDir, 'electron-music.png'), (await win.webContents.capturePage()).toPNG());
    } catch (e) { check(false, e.message); }
    const failed = results.filter((r) => !r[0]).length;
    console.log(failed ? `electron: ${failed} failed` : 'electron: all passed');
    app.exit(failed ? 1 : 0);
  });
});
