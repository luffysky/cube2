'use strict';
// Runs every test that needs nothing but Node: the game rules, the server and the page-to-server sync.
// The browser tests (flow, pad, cloudui, …) need Chrome and Playwright and are run one by one; see README.
const { spawnSync } = require('child_process');
const path = require('path');
let bad = 0;
for (const t of ['engine', 'score', 'meta', 'replay', 'openers', 'drills', 'i18n', 'api', 'ws', 'cloud', 'tabs', 'luck', 'weather']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, t + '.test.js')], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop() || '';
  console.log((r.status === 0 ? 'ok   ' : 'FAIL ') + t.padEnd(8) + last.slice(0, 90));
  if (r.status !== 0) { bad++; console.log((r.stdout || '').split('\n').filter(l => /FAIL|CRASH/.test(l)).slice(0, 20).join('\n')); console.log((r.stderr || '').slice(0, 2000)); }
}
process.exit(bad ? 1 : 0);
