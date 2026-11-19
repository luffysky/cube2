'use strict';
// Treasure boxes in a real browser: with the game's server (the server opens them) and on a plain static host (the
// page opens them). The odds table is on show, the daily count holds, prizes land in the save.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8779, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const STATIC = process.env.ZZ_URL || 'http://127.0.0.1:8790/index.html?sw=off&lang=zh-Hant';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  try {
    // ---- with the server ----
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(URL); await sleep(500);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    ok(await page.evaluate(() => !document.getElementById('mBoxDot').hidden), 'the menu shows boxes are waiting');
    await page.click('[data-sheet="boxes"]'); await sleep(300);
    ok(await page.evaluate(() => /今天還能開 5 次/.test(document.getElementById('sheetCard').textContent)), 'five today');
    await page.click('[data-do="boxOdds"]'); await sleep(200);
    const odds = await page.evaluate(() => [...document.querySelectorAll('.odds tbody td.oc')].map(td => parseFloat(td.textContent)));
    ok(odds.length === 9 && Math.abs(odds.reduce((a, b) => a + b, 0) - 100) < 0.01, 'the odds table lists every result and adds up to 100%', odds);
    await page.screenshot({ path: path.join(OUT, 'boxes-odds.png') });
    const items0 = await page.evaluate(() => ZZ.Meta.data.items.reduce((a, b) => a + b, 0));
    await page.click('[data-draw="5"]');
    ok(await until(() => page.evaluate(() => document.querySelectorAll('.opened .bx').length === 5), 6000), 'all five open, as the server says');
    const st = await page.evaluate(() => ({ left: ZZ.Meta.drawsLeft(), last: ZZ.Meta.data.box.last, items: ZZ.Meta.data.items.reduce((a, b) => a + b, 0) }));
    const gotItems = st.last.boxes.reduce((a, b) => a + b.got.filter(g => g.kind === 'item').length, 0);
    ok(st.left === 0 && st.items === items0 + gotItems, 'none left, and the items are in the bag', st);
    const db = await (await fetch('http://127.0.0.1:' + PORT + '/_dev/state')).json();
    ok(db.players.length === 1, 'the draw went through the cloud save');
    ok(await page.evaluate(() => document.querySelector('[data-draw="1"]').disabled && document.getElementById('mBoxDot').hidden), 'the button and the dot go quiet');
    await sleep(900); await page.evaluate(() => { document.getElementById('sheetCard').scrollTop = 0; });
    await page.screenshot({ path: path.join(OUT, 'boxes-open.png') });
    // ---- a plain static host: the page opens them ----
    const p2 = await browser.newPage({ viewport: { width: 420, height: 900 } });
    p2.on('pageerror', e => problems.push('static: ' + e.message));
    await p2.goto(STATIC); await sleep(700);
    await p2.evaluate(() => ZZ.App.openSheet('boxes')); await sleep(200);
    await p2.click('[data-draw="1"]');
    ok(await until(() => p2.evaluate(() => document.querySelectorAll('.opened .bx').length === 1), 3000), 'without a server the page opens a box itself');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close(); srv.kill();
  console.log('box checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
