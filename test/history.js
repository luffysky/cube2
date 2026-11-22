'use strict';
// 對戰紀錄 in a real browser, against tools/dev-server.js (the real API with an in-memory database): matches played
// show up newest first with date, time and K/D, a row opens to its detail, the mode filter asks the server again,
// and the pager walks twenty at a time.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8779, URL = 'http://127.0.0.1:' + PORT + '/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [], asked = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-TW' });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('request', r => { if (/\/api\/rpc$/.test(r.url()) && r.method() === 'POST') { try { const b = JSON.parse(r.postData() || '{}'); if (b.a === 'history') asked.push(b); } catch (e) { /* not json */ } } });
  const ev = expr => page.evaluate('(function(){var M=ZZ.Meta;var C=ZZ.Cloud;var A=ZZ.App;' + expr + '})()');
  const card = () => page.evaluate(() => document.getElementById('sheetCard').textContent);
  const idle = async () => { for (let i = 0; i < 80; i++) { if (await ev('return !C.busy && !C.q.length')) return true; await sleep(100); } return false; };
  await page.goto(URL); await sleep(400);
  for (let i = 0; i < 60 && !(await ev('return C.on')); i++) await sleep(100);

  // before any cloud save there is nothing to ask
  await ev('A.openSheet("history"); return 1'); await sleep(200);
  ok(/打完第一場/.test(await card()) && asked.length === 0, 'without a cloud save the sheet says when history starts', await card());
  await ev('A.closeSheet ? A.closeSheet() : document.querySelector("#sheetCard [data-do=close]").click(); return 1');

  // three matches of different kinds, reported the way the game reports them
  await ev('M.data.name = "阿明"; return 1');
  const fin = (m) => ev('M.finish(' + JSON.stringify(m) + ', null); C.flush(true); return 1');
  await fin({ mode: 'ai', result: 1, level: 2, ko: 3, koOpp: 1, itemsUsed: 2, ms: 120000, stats: { score: 12000, sent: 30, spins: 3, quads: 1, maxCombo: 4, lines: 40, pieces: 120 } });
  await idle();
  for (let i = 0; i < 40 && !(await ev('return !!C.cred')); i++) await sleep(100);
  await fin({ mode: 'ai', result: -1, level: 4, ko: 1, koOpp: 3, ms: 90000, stats: { score: 5000, sent: 12, lines: 20, pieces: 70 } });
  await idle();
  await fin({ mode: 'ghost', result: 1, ko: 2, koOpp: 0, ms: 100000, stats: { score: 8000, sent: 20, lines: 30, pieces: 90 } });
  await idle();
  ok(await ev('return !!C.cred'), 'the matches made a cloud save');

  // from the side menu
  await page.tap('#drOpen').catch(() => ev('document.querySelector("[data-sheet=history]").click(); return 1'));
  await sleep(200);
  const inDrawer = await page.$('#drawer [data-sheet="history"]');
  ok(!!inDrawer, 'the side menu has 對戰紀錄');
  if (inDrawer && await inDrawer.isVisible()) await inDrawer.tap(); else await ev('A.openSheet("history"); return 1');
  for (let i = 0; i < 40 && /讀取中/.test(await card()); i++) await sleep(100);
  let rows = await page.$$eval('.hi-list > li', l => l.map(li => li.textContent));
  ok(rows.length === 3, 'all three matches are listed', rows);
  ok(/鬼影|幽靈|Ghost|ghost/i.test(rows[0]) || rows[0].indexOf(await ev('return ZZ.L.t("m.ghost")')) >= 0, 'newest first', rows[0]);
  ok(rows.every(r => /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(r)), 'each row has its date and time', rows);
  ok(/勝/.test(rows[0]) && /敗/.test(rows[1]), 'win and loss are marked', rows);
  ok(/1／3/.test(rows[1].replace(/\s/g, '')), 'K/D on the row', rows[1]);
  const sum = await page.$$eval('.hi-sum div', l => l.map(d => d.textContent));
  ok(sum.some(s => /場數3/.test(s)) && sum.some(s => /勝／敗／和2／1／0/.test(s)) && sum.some(s => /K／D／A.*6／4／0/.test(s)) && sum.some(s => /KDA1\.50/.test(s)), 'totals: games, W/L/D, K/D and ratio', sum);

  // a row opens to its detail
  await page.tap('.hi-list > li:nth-child(3) .hi-row'); await sleep(150);
  let detail = await page.$eval('.hi-list > li.open', li => li.textContent);
  ok(/每分鐘攻擊15\.0/.test(detail) && /每秒方塊1\.00/.test(detail) && /最高連擊4/.test(detail) && /道具2/.test(detail) && /學徒|熟手|師傅/.test(detail), 'the detail has APM, PPS, combo, items and the computer level', detail);
  ok(await page.$eval('.hi-list > li.open .hi-row', b => b.getAttribute('aria-expanded')) === 'true', 'and says it is open');
  await page.screenshot({ path: path.join(OUT, 'history-list.png') });

  // one mode
  const before = asked.length;
  await page.tap('[data-hi-mode="ai"]'); await sleep(150);
  for (let i = 0; i < 40 && /讀取中/.test(await card()); i++) await sleep(100);
  rows = await page.$$eval('.hi-list > li', l => l.length);
  ok(rows === 2 && asked.length === before + 1 && asked[asked.length - 1].mode === 'ai' && asked[asked.length - 1].page === 1, 'the filter asks the server for that mode', [rows, asked.slice(-1)]);

  // the pager: a fake answer of three pages, so the buttons and page numbers can be checked
  await page.route('**/api/rpc', async route => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.a !== 'history') return route.continue();
    const p = Math.min(3, Math.max(1, b.page || 1)), n = p < 3 ? 20 : 5;
    const items = Array.from({ length: n }, (_, i) => ({ id: String(p * 100 + i), at: Date.UTC(2026, 10, 20, 12, 0, 0) - (p * 20 + i) * 60000, mode: 'rank', result: i % 2 ? -1 : 1, proven: true, seats: 1, pvp: null, foes: [], level: 0, ms: 120000, ko: 2, koOpp: 1, score: 1000 * (p * 20 + i), sent: 10, lines: 10, pieces: 50, spins: 0, minis: 0, xspins: 0, tst: 0, quads: 0, combo: 0, items: 0, place: 0, team: false, quick: false, pr: false }));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: b.mode, page: p, per: 20, total: 45, pages: 3, items, sum: { games: 45, win: 23, loss: 22, draw: 0, ko: 90, koOpp: 45, sent: 450, lines: 450, pieces: 2250, ms: 5400000, best: 64000, sprint: null }, keep: 0, now: Date.now() }) });
  });
  await page.tap('[data-hi-mode="rank"]'); await sleep(200);
  for (let i = 0; i < 40 && /讀取中/.test(await card()); i++) await sleep(100);
  ok((await page.$$('.hi-list > li')).length === 20 && /第 1／3 頁・共 45 場/.test(await card()), 'twenty to a page, with the page count', await card());
  ok(await page.$eval('[data-hi-page="1"]', b => b.disabled) && !(await page.$eval('[data-hi-page="2"]', b => b.disabled)), 'first and previous are off on page 1');
  await page.tap('[data-hi-page="2"]'); await sleep(200);
  for (let i = 0; i < 40 && /讀取中/.test(await card()); i++) await sleep(100);
  ok(/第 2／3 頁/.test(await card()) && asked[asked.length - 1].page === 2, 'next asks for page 2', asked.slice(-1));
  await page.tap('.hi-pager [data-hi-page="3"]:last-child'); await sleep(200);
  for (let i = 0; i < 40 && /讀取中/.test(await card()); i++) await sleep(100);
  ok(/第 3／3 頁/.test(await card()) && (await page.$$('.hi-list > li')).length === 5, 'the last page has the rest', await card());
  await page.screenshot({ path: path.join(OUT, 'history-pager.png'), fullPage: false });
  await page.unroute('**/api/rpc');

  // the profile links here too
  await ev('A.openSheet("profile"); return 1'); await sleep(150);
  ok(!!(await page.$('#sheetCard [data-do="history"]')), 'the profile has a button for it');

  ok(!problems.length, 'no page errors', problems);
  await browser.close(); srv.kill();
  console.log('history: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
