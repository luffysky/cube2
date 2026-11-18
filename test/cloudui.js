'use strict';
// The cloud save and leaderboards in a real browser, against tools/dev-server.js (the real API with an in-memory database).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8771, URL = 'http://127.0.0.1:' + PORT + '/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [], calls = [];
  async function phone(name, locale) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: locale || 'zh-TW' });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    page.on('request', r => { const u = r.url(); if (!/^data:|fonts\.(googleapis|gstatic)\.com/.test(u)) calls.push(name + ' ' + r.method() + ' ' + u.replace('http://127.0.0.1:' + PORT, '')); });
    await page.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);   // the first look for the API has come back
    return { ctx, page, name };
  }
  const ev = (d, expr) => d.page.evaluate('(function(){var p=ZZ.peek();var S=p.S;var M=ZZ.Meta;var C=ZZ.Cloud;' + expr + '})()');
  const shot = (d, n) => d.page.screenshot({ path: path.join(OUT, 'cloud-' + n + '.png') });
  const idle = async d => { for (let i = 0; i < 60; i++) { if (await ev(d, 'return !C.busy && !C.q.length')) return true; await sleep(100); } return false; };

  // ---------- a first visit ----------
  const A = await phone('A');
  ok(await ev(A, 'return C.status()') === 'new', 'the page finds its API', await ev(A, 'return [C.status(), C.on, C.dead]'));
  ok(await A.page.evaluate(() => !document.getElementById('mBoard').hidden && document.getElementById('mBoard').textContent === '排行榜'), 'the leaderboard link shows in the menu');
  ok(await A.page.evaluate(() => !localStorage.getItem('zhuanzhuan.cloud.v1') || !JSON.parse(localStorage.getItem('zhuanzhuan.cloud.v1')).id), 'no identity yet');
  await A.page.tap('.me'); await sleep(250);
  ok(await A.page.evaluate(() => /雲端存檔/.test(document.getElementById('sheetCard').textContent) && /打完第一場/.test(document.getElementById('clState').textContent)), 'profile explains when saving starts');
  await A.page.fill('#pName', '阿明'); await sleep(1200);
  await idle(A);
  ok(await ev(A, 'return C.status() === "ok" && !!C.cred && M.data.name === "阿明"'), 'typing a name made the account and saved it', await ev(A, 'return [C.status(), M.data.name, C.q.length]'));
  ok(await A.page.evaluate(() => document.activeElement && document.activeElement.id === 'pName' && document.getElementById('pName').value === '阿明'), 'without taking the cursor out of the name box');
  ok(await A.page.evaluate(() => /已經存到雲端/.test(document.getElementById('clState').textContent)), 'the status line updated in place');
  await shot(A, '1-profile');
  await A.page.tap('[data-do="close"]'); await sleep(150);

  // ---------- a real ranked match, cut short ----------
  await A.page.tap('[data-go="rank"]'); await sleep(250);
  ok(await A.page.evaluate(() => !!document.querySelector('[data-do="board"]')), 'the ranked sheet offers the leaderboards');
  await A.page.tap('[data-do="rankGo"]'); await sleep(3300);
  for (const k of ['L', 'HD', 'R', 'HD', 'CW', 'HD']) { await A.page.tap('.key[data-k="' + k + '"]'); await sleep(90); }
  await ev(A, 'S.total = 120000; S.left = 300; S.ko.me = 2; S.me.stats.score = 4321; return 1'); await sleep(2200);
  ok(await A.page.evaluate(() => /排位|勝|贏/.test(document.getElementById('sheetCard').textContent)), 'match ended');
  await idle(A);
  const afterMatch = await ev(A, 'return { rp: M.data.rp, coins: M.data.coins, games: M.data.tot.games, q: C.q.length, st: C.status() }');
  ok(afterMatch.rp > 0 && afterMatch.games === 1 && afterMatch.q === 0 && afterMatch.st === 'ok', 'the result is saved', afterMatch);
  await A.page.tap('[data-do="menu"]'); await sleep(300);

  // ---------- leaderboards ----------
  await A.page.tap('#mBoard'); await sleep(700);
  let rows = await A.page.evaluate(() => [...document.querySelectorAll('.lb li')].map(li => li.textContent));
  ok(rows.length === 1 && /阿明/.test(rows[0]) && /你/.test(rows[0]) && /陶土/.test(rows[0]), 'rating board shows the player', rows);
  await shot(A, '2-board-rp');
  await A.page.tap('[data-lb="score"]'); await sleep(600);
  rows = await A.page.evaluate(() => [...document.querySelectorAll('.lb li')].map(li => li.textContent));
  ok(rows.length === 1 && /4,321/.test(rows[0]), 'score board shows the match score', rows);
  ok(await A.page.evaluate(() => !!document.querySelector('[data-lbs="all"]')), 'season or all-time');
  await A.page.tap('[data-lbs="all"]'); await sleep(500);
  ok(await A.page.evaluate(() => document.querySelector('[data-lbs="all"]').getAttribute('aria-checked') === 'true' && document.querySelectorAll('.lb li').length === 1), 'all-time board');
  await A.page.tap('[data-lb="sprint"]'); await sleep(600);
  ok(await A.page.evaluate(() => !!document.querySelector('.lb-none') && /跑完一次/.test(document.getElementById('sheetCard').textContent)), 'an empty board says how to get on it');
  await shot(A, '3-board-empty');
  await A.page.tap('[data-do="close"]'); await sleep(150);

  // ---------- shop purchases go through the server ----------
  await ev(A, 'M.data.coins = 50000; M.save(); return 1');      // someone edits their coins in the browser
  await A.page.tap('.purse'); await sleep(250);
  await A.page.tap('[data-tab="tile"]'); await sleep(200);
  await A.page.tap('[data-buy="tile|neon"]'); await sleep(200);
  ok(await ev(A, 'return M.owns("tile", "neon")'), 'the page lets the edited coins buy it…');
  await sleep(1300); await idle(A);
  ok(await ev(A, 'return !M.owns("tile", "neon") && M.data.equip.tile === "glaze" && M.data.coins < 1000'), '…and the server takes it back', await ev(A, 'return [M.data.coins, M.data.owned.tile, M.data.equip.tile]'));
  ok(await A.page.evaluate(() => !document.querySelector('.card.on canvas[data-pv="tile|neon"]')), 'the shop redraws to match');
  await shot(A, '4-shop-after-reject');
  await A.page.tap('[data-do="close"]'); await sleep(150);

  // ---------- a code for a second device ----------
  await A.page.tap('.me'); await sleep(200);
  await A.page.tap('[data-do="cloud"]'); await sleep(250);
  ok(await A.page.evaluate(() => /換到另一台裝置/.test(document.getElementById('sheetCard').textContent) && /代號/.test(document.getElementById('sheetCard').textContent)), 'devices and data sheet');
  await A.page.tap('[data-do="cloudCode"]'); await sleep(700);
  const code = await A.page.evaluate(() => { const e = document.querySelector('.roomcode.xfer'); return e ? e.textContent : ''; });
  ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), 'a transfer code is shown', code);
  const fits = await A.page.evaluate(() => { const e = document.querySelector('.roomcode.xfer'), c = document.getElementById('sheetCard'); return e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= c.getBoundingClientRect().right; });
  ok(fits, 'the code fits the sheet');
  await shot(A, '5-code');

  // ---------- the second device ----------
  const B = await phone('B');
  await ev(B, 'M.buyItem(1); return 1'); await sleep(1100); await idle(B);
  const idB = await ev(B, 'return C.cred.id');
  await B.page.tap('.me'); await sleep(200);
  await B.page.tap('[data-do="cloud"]'); await sleep(250);
  await B.page.fill('#clCode', 'zzzz-zzzz'); await B.page.tap('[data-do="cloudPeek"]'); await sleep(600);
  ok(await B.page.evaluate(() => /不對，或是已經過期/.test(document.querySelector('.warn[role="status"]').textContent)), 'a wrong code says so');
  await B.page.fill('#clCode', code.toLowerCase()); await B.page.tap('[data-do="cloudPeek"]'); await sleep(600);
  ok(await B.page.evaluate(() => /找到這份存檔/.test(document.getElementById('sheetCard').textContent) && /阿明/.test(document.querySelector('.plan').textContent) && /會被取代/.test(document.querySelector('.plan').textContent)), 'the code shows whose save it is and what will be replaced', await B.page.evaluate(() => document.querySelector('.plan') && document.querySelector('.plan').textContent));
  ok(await ev(B, 'return C.cred.id') === idB, 'nothing has changed yet');
  await shot(B, '6-peek');
  await B.page.tap('[data-do="cloudUse"]'); await sleep(900);
  const idA = await ev(A, 'return C.cred.id');
  ok(await ev(B, 'return C.cred.id') === idA && await ev(B, 'return M.data.name') === '阿明' && await ev(B, 'return M.data.tot.games') === 1, 'device B is on the same save now', await ev(B, 'return [M.data.name, M.data.tot]'));
  await B.page.tap('[data-do="close"]'); await sleep(200);
  ok(await B.page.evaluate(() => document.getElementById('mName').textContent === '阿明'), 'and its menu shows it');
  // B changes something, A sees it when it comes back to the page
  await ev(B, 'M.claimLogin(); return 1'); await sleep(1000); await idle(B);
  const coinsB = await ev(B, 'return M.data.coins');
  await ev(A, 'return C.flush(true)'); await sleep(500); await idle(A);
  ok(await ev(A, 'return M.data.coins') === coinsB, 'device A picks up what device B did', [await ev(A, 'return M.data.coins'), coinsB]);

  // ---------- English, on the same sheet ----------
  await ev(B, 'p.set.lang = "en"; ZZ.App.applyLang(); return 1');
  await B.page.tap('#mBoard'); await sleep(600);
  ok(await B.page.evaluate(() => /Leaderboards/.test(document.querySelector('#sheetCard h2').textContent) && /You/.test(document.querySelector('.lb li').textContent)), 'leaderboards in English');
  await shot(B, '7-board-en');
  await B.page.tap('[data-do="close"]'); await sleep(150);
  await B.page.tap('.me'); await sleep(200); await B.page.tap('[data-do="cloud"]'); await sleep(250);
  const over = await B.page.evaluate(() => [...document.querySelectorAll('#sheetCard *')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible' && e.children.length === 0).map(e => e.textContent.slice(0, 40)));
  ok(over.length === 0, 'nothing spills out of the sheet in English', over);
  await shot(B, '8-cloud-en');

  // ---------- deleting the cloud data ----------
  await B.page.tap('[data-do="cloudDel"]'); await sleep(200);
  ok(await B.page.evaluate(() => !!document.querySelector('[data-do="cloudDelYes"]') && !!document.querySelector('[data-do="cloudDelNo"]')), 'delete asks first');
  await B.page.tap('[data-do="cloudDelNo"]'); await sleep(150);
  ok(await ev(B, 'return !!C.cred'), 'cancel keeps it');
  await B.page.tap('[data-do="cloudDel"]'); await sleep(150);
  await B.page.tap('[data-do="cloudDelYes"]'); await sleep(800);
  ok(await ev(B, 'return C.status() === "gone" && !C.cred && M.data.name === "阿明"'), 'deleted; local progress stays', await ev(B, 'return [C.status(), M.data.name]'));
  await shot(B, '9-deleted-en');
  await ev(A, 'M.claimLogin(); M.buyItem(2); return 1'); await sleep(1300); await idle(A);
  ok(await ev(A, 'return C.status()') === 'gone', 'the other device finds out on its next save', await ev(A, 'return C.status()'));
  ok(await A.page.evaluate(() => /雲端存檔已經不在了/.test(document.getElementById('mtoast').textContent) || /雲端存檔已經不在了/.test(document.getElementById('toast').textContent)), 'and tells the player');
  await A.page.tap('[data-do="close"]').catch(() => {}); await sleep(150);
  await A.page.tap('.me').catch(() => {}); await sleep(250);
  ok(await A.page.evaluate(() => !!document.querySelector('[data-do="cloudStart"]')), 'the profile offers to start a cloud save again');
  await A.page.tap('[data-do="cloudStart"]'); await sleep(900); await idle(A);
  ok(await ev(A, 'return C.status() === "ok" && !!C.cred && C.cred.id !== ' + JSON.stringify(idA)), 'a new save starts from what the device has', await ev(A, 'return C.status()'));

  // ---------- what went over the network ----------
  const api = calls.filter(c => /\/api\//.test(c));
  ok(api.length > 8 && api.every(c => /^[AB] (GET \/api\/(health|board\?[^ ]*)|POST \/api\/rpc)$/.test(c)), 'only the three endpoints are ever called', api.filter(c => !/^[AB] (GET \/api\/(health|board\?[^ ]*)|POST \/api\/rpc)$/.test(c)));
  ok(calls.every(c => /^[AB] (GET|POST) \//.test(c)), 'and nothing leaves for another site', calls.filter(c => !/^[AB] (GET|POST) \//.test(c)));
  ok(!problems.length, 'no page errors', problems);

  await browser.close();
  srv.kill();
  console.log('cloud ui checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
