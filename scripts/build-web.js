#!/usr/bin/env node
// Bundles web/src into web/dist/app.js and web/app.css (+ xterm's CSS) into
// web/dist/app.css, and copies the VGA font next to them. npm run build.

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const dist = path.join(web, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });

// The font: from the app's own copy, or the vault's _code/fonts if you have it.
const fontSrc = [path.join(web, 'fonts', 'KernelPathVGA.ttf')].find((p) => fs.existsSync(p));
if (fontSrc) fs.copyFileSync(fontSrc, path.join(dist, 'fonts', 'KernelPathVGA.ttf'));
else console.warn('warning: web/fonts/KernelPathVGA.ttf is missing; the retro themes will use DejaVu Sans Mono');

function css() {
  const xterm = fs.readFileSync(require.resolve('@xterm/xterm/css/xterm.css'), 'utf8');
  const app = fs.readFileSync(path.join(web, 'app.css'), 'utf8');
  fs.writeFileSync(path.join(dist, 'app.css'), `/* xterm.js */\n${xterm}\n/* app */\n${app}`);
}

const opts = {
  entryPoints: [path.join(web, 'src', 'main.js')],
  bundle: true, format: 'esm', target: 'chrome120', outfile: path.join(dist, 'app.js'),
  sourcemap: true, minify: !watch, legalComments: 'linked', logLevel: 'info',
  // @replit/codemirror-emacs marks its own key-binding setup calls as
  // /* @__PURE__ */, so a tree-shaking bundler deletes them and C-e, C-n,
  // C-f... silently stop working. Ignore those annotations.
  ignoreAnnotations: true,
};

(async () => {
  css();
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    fs.watch(path.join(web, 'app.css'), css);
    console.log('watching web/src and web/app.css');
  } else {
    await esbuild.build(opts);
  }
})().catch((e) => { console.error(e); process.exit(1); });
