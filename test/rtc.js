'use strict';
// The direct line (WebRTC) in real browsers, through tools/dev-server.js: two in a room connect straight to each
// other, the match goes down the line (and far fewer requests go to the server), and when the line drops the room
// carries on with nothing lost. ?rtc=off leaves it out.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8781, BASE = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  // the machine's own addresses instead of the hidden .local names, so two pages on one computer can reach each other
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const problems = [];
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  const open = async (name, extra) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    page.reqs = 0; page.on('request', r => { if (/\/api\/room/.test(r.url())) page.reqs++; });
    await page.goto(BASE + (extra || '')); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    return page;
  };
  const pair = async (A, B) => {
    await A.evaluate(() => { ZZ.App.openSheet('online'); ZZ.Net.open('阿直'); });
    await until(() => A.evaluate(() => ZZ.Net.state === 'waiting' && !!ZZ.Net.code), 6000);
    const code = await A.evaluate(() => ZZ.Net.code);
    await B.evaluate(c => ZZ.Net.join(c, '小連'), code);
    return until(() => A.evaluate(() => ZZ.Net.count() === 2), 10000);
  };
  const wallCells = p => p.evaluate(() => ZZ.peek().S.opp.grid.reduce((n, r) => n + Array.from(r).filter(Boolean).length, 0));
  try {
    const A = await open('A', '&ws=off'), B = await open('B', '&ws=off');
    ok(await pair(A, B), 'two in a room');
    ok(await until(async () => (await A.evaluate(() => ZZ.Net.direct())) && (await B.evaluate(() => ZZ.Net.direct())), 15000), 'they connect straight to each other');
    ok(await A.evaluate(() => /直接連線/.test(document.getElementById('sheetCard').textContent)), 'and the room says so');
    await A.click('[data-do="netStart"]');
    ok(await until(async () => (await A.evaluate(() => ZZ.peek().S && ZZ.peek().S.state === 'play')) && (await B.evaluate(() => ZZ.peek().S && ZZ.peek().S.state === 'play')), 12000), 'the match starts');
    // a few seconds of play over the line: count the requests to the room meanwhile
    A.reqs = 0;
    for (let i = 0; i < 6; i++) { await A.keyboard.press('Space'); await sleep(500); }
    const t0 = Date.now(); await sleep(3000);
    const perSec = A.reqs / ((Date.now() - t0 + 3000) / 1000);
    ok(await until(async () => (await wallCells(B)) >= 20, 4000), 'B sees A\'s wall', await wallCells(B));
    ok(perSec < 2, 'with the direct line, the room is asked rarely (' + perSec.toFixed(1) + ' a second)', perSec);
    // the line drops: the room takes over, nothing lost
    const before = await wallCells(B);
    await A.evaluate(() => { const l = ZZ.Net._link ? ZZ.Net._link() : null; if (l && l.dc) l.dc.close(); });
    await sleep(300);
    ok(await A.evaluate(() => !ZZ.Net.direct()), 'the line is gone');
    for (let i = 0; i < 4; i++) { await A.keyboard.press('Space'); await sleep(400); }
    ok(await until(async () => (await wallCells(B)) > before, 6000), 'and A\'s moves still reach B through the room', [before, await wallCells(B)]);
    await A.evaluate(() => ZZ.Net.leave()); await B.evaluate(() => ZZ.Net.leave());
    // ?rtc=off: no line at all
    const C = await open('C', '&rtc=off'), D = await open('D', '&rtc=off');
    ok(await pair(C, D), 'two more in a room, with the line switched off');
    await sleep(4000);
    ok(!(await C.evaluate(() => ZZ.Net.direct())) && !(await D.evaluate(() => ZZ.Net.direct())), 'no direct line then');
  } catch (e) { fail++; console.log('CRASH', e); }
  ok(problems.length === 0, 'no page errors', problems);
  await browser.close(); srv.kill();
  console.log('direct line checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
