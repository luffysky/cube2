'use strict';
// Runs the browser tests one after another (Chrome and Playwright needed), with the two static servers they expect
// (8790 for most, 8765 for the screen-size test) started here if nothing is listening yet. Used by CI; locally
// `node test/browser-run.js` or `node test/browser-run.js flow rwd` for a few.
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..');
require('fs').mkdirSync(path.join(ROOT, 'shots'), { recursive: true });      // the tests save screenshots here (not in git)
const ALL = ['flow', 'rwd', 'drawer', 'onehand', 'howto', 'bag', 'cele', 'music', 'skies', 'wxnet', 'legal', 'pwa', 'gameslang', 'cloudui', 'consent', 'sites', 'bricks', 'minipay', 'quick', 'rtc'];
const list = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const up = port => new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 1500 }, s => { s.resume(); res(s.statusCode === 200); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });
(async () => {
  const kids = [];
  for (const port of [8790, 8765]) {
    if (await up(port)) continue;
    kids.push(spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
    for (let i = 0; i < 40 && !(await up(port)); i++) await new Promise(r => setTimeout(r, 250));
  }
  let bad = 0;
  for (const t of list) {
    const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(__dirname, t + '.js')], { encoding: 'utf8', timeout: 8 * 60000 });
    const out = (r.stdout || '') + (r.stderr || ''), last = out.trim().split('\n').filter(l => /passed/.test(l)).pop() || out.trim().split('\n').pop() || '';
    const good = r.status === 0 && !/[1-9]\d* failed/.test(last);
    console.log((good ? 'ok   ' : 'FAIL ') + t.padEnd(10) + last.slice(0, 80) + '  (' + Math.round((Date.now() - t0) / 1000) + 's)');
    if (!good) { bad++; console.log(out.split('\n').filter(l => /FAIL|CRASH|Error/.test(l)).slice(0, 15).join('\n')); }
  }
  kids.forEach(k => k.kill());
  process.exit(bad ? 1 : 0);
})();
