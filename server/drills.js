'use strict';
// "Predict the output" (drill-data.js): compile and run a drill for real,
// with your compiler, so the answer is what actually happens here.

const fs = require('fs');
const path = require('path');
const config = require('./config');
const platform = require('./platform');
const DATA = require('./drill-data');

const byId = new Map(DATA.map((d) => [d.id, d]));
const norm = (s) => String(s || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

function list() { return DATA.map(({ id, lang, topic, code, explain }) => ({ id, lang, topic, code, explain })); }

async function run({ id, guess }) {
  const d = byId.get(id);
  if (!d) throw new Error(`No drill ${id}`);
  const b = require('./build');
  const tc = b.toolchain(d.lang);
  const dir = config.dataPath('drills');
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, `${id}.${d.lang === 'c' ? 'c' : 'cpp'}`);
  fs.writeFileSync(src, d.code);
  const exe = path.join(dir, platform.exe(id));
  const c = await b.execStream({ cmd: tc.cc, args: [`-std=${tc.std}`, '-o', exe, src, ...(d.lang === 'c' ? ['-lm'] : [])], cwd: dir, title: `predict: ${tc.cc} ${path.basename(src)}`, quiet: true });
  if (c.code !== 0) return { ok: false, problems: c.problems, output: '' };
  const r = await b.execStream({ cmd: exe, args: [], cwd: dir, title: `predict: ${id}`, quiet: true, timeoutMs: 5000 });
  const output = norm(r.output);
  return { ok: true, output, right: guess != null ? norm(guess) === output : null, explain: d.explain };
}

function init(a) {
  a.register('drills.list', list);
  a.register('drills.run', run);
}

module.exports = { init, list, run, norm };
