'use strict';
// npm test: backend tests, then the window in Chromium if Playwright is
// installed, all inside a throwaway home with local mail and IRC servers.
//   CPW_SHOTS=dir npm test     also saves screenshots of every theme
//   CPW_VAULT=path npm test    the CPP-Path vault to test the guides with
//   CPW_ONLY=backend npm test  just the backend

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const fx = require('./fixtures');

function run(file, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(__dirname, file)], { env, stdio: 'inherit' });
    p.on('close', resolve);
  });
}

(async () => {
  const { home, bin, patch } = fx.makeHome();
  const mail = await fx.startMail(patch);
  const irc = await fx.startIrc();
  const vault = fx.findVault();
  fx.writeConfig(home, { imapPort: mail.imapPort, smtpPort: mail.smtpPort, ircPort: irc.port, vault });
  const env = {
    ...process.env, HOME: home, XDG_CONFIG_HOME: '', XDG_DATA_HOME: '', PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: '/dev/null', CPW_FAKE_SERVERS: '1', ...(vault ? { CPW_VAULT_OK: '1' } : {}),
  };
  delete env.XDG_CONFIG_HOME; delete env.XDG_DATA_HOME;
  console.log(`test home: ${home}${vault ? `\nvault: ${vault}` : '\n(no vault found: guide tests skipped; set CPW_VAULT)'}`);

  let failed = 0;
  console.log('\nbackend');
  if (await run('backend.js', env)) failed++;
  try {
    assert.strictEqual(mail.sent.length, 1, 'one mail sent');
    const m = mail.sent[0];
    assert.deepStrictEqual(m.rcpt.sort(), ['bob@example.org', 'cpp-study@example.org']);
    assert.match(m.raw, /^From: "?Josh McFerran"? <josh@example\.org>/m);
    assert.match(m.raw, /^In-Reply-To: <review-1@example\.org>/m);
    assert.match(m.raw, /^Content-Type: text\/plain/m);
    assert.doesNotMatch(m.raw, /text\/html/);
    assert.ok(irc.said.some((s) => /hello from the workbench/.test(s)), 'IRC message arrived');
    assert.ok(irc.logins.includes('joshm'), 'logged in with SASL');
    console.log('  ok    the SMTP and IRC servers got exactly what was sent');
  } catch (e) { failed++; console.log(`  FAIL  ${e.message}`); }

  if (process.env.CPW_ONLY !== 'backend') {
    console.log('\nwindow (Chromium)');
    if (await run('e2e.js', env)) failed++;
  }

  await mail.close();
  await irc.close();
  if (!failed) fs.rmSync(home, { recursive: true, force: true });
  console.log(failed ? `\n${failed} part(s) failed (test home kept: ${home})` : '\nall tests passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
