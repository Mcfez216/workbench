'use strict';
// Small pieces of remembered state: open tabs, run commands, revision
// progress, the music list. One JSON file in the data directory.

const fs = require('fs');
const config = require('./config');

let file, data = null;
function load() {
  file = file || config.dataPath('state.json');
  if (!data) { try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { data = {}; } }
  return data;
}
let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }, 250);
}

function init(api) {
  api.register('state.get', async ({ key, fallback = null }) => (key in load() ? load()[key] : fallback));
  api.register('state.set', async ({ key, value }) => { load()[key] = value; persist(); return true; });
  api.onExit.push(() => { if (timer) { clearTimeout(timer); fs.writeFileSync(file, JSON.stringify(data || {})); } });
}

module.exports = { init };
