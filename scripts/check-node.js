// Runs before `npm install` and `npm start`: Electron and the mail libraries
// need Node.js 22.12 or newer, and Ubuntu's own nodejs package is older
// (18 on 24.04, 12 on 22.04). Written in old-style JavaScript on purpose, so
// it can still explain itself on an old Node.
/* eslint-disable no-var */
var NEED = [22, 12];
var have = process.versions.node.split('.').map(Number);
var ok = have[0] > NEED[0] || (have[0] === NEED[0] && have[1] >= NEED[1]);
if (ok) process.exit(0);

var fs = require('fs');
var rel = '';
try { rel = fs.readFileSync('/etc/os-release', 'utf8'); } catch (e) { /* not Linux */ }
var debian = /^ID(_LIKE)?=.*\b(ubuntu|debian)\b/m.test(rel);
var conda = process.env.CONDA_PREFIX && process.execPath.indexOf(process.env.CONDA_PREFIX) === 0;

var lines = [
  '',
  'This needs Node.js ' + NEED.join('.') + ' or newer; this is ' + process.version + ' (' + process.execPath + ').',
];
if (conda) {
  lines.push('That node is from your conda environment. Run "conda deactivate" and try again,',
    'or install a newer one into it.');
} else if (debian) {
  lines.push('On Ubuntu, NodeSource\'s packages are the easy way (bash scripts/setup-ubuntu.sh --with-node does this):',
    '  curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh',
    '  less nodesource_setup.sh          # read it first',
    '  sudo -E bash nodesource_setup.sh',
    '  sudo apt-get install -y nodejs');
} else {
  lines.push('On Fedora: sudo dnf install nodejs, then check that node --version is 22.12 or newer.');
}
lines.push('');
console.error(lines.join('\n'));
process.exit(1);
