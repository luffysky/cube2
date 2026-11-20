'use strict';
// The levels mode in a real browser: the list, playing a level through (the computer moves the pieces), stars and
// coins, the next level opening, running out of pieces, the endless run, the editor and a shared level link.
// Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8790/index.html?sw=off&lang=zh-Hant';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', e => problems.push(e.message));
  // the computer plays one piece for us
  const step = () => page.evaluate(() => {
    const S = ZZ.peek().S, g = S && S.me, B = ZZ.Bot;
    if (!g || !g.cur || S.state !== 'play') return S ? S.state : 'none';
    const d = B.think(g, Object.assign({}, B.LEVELS[2], { noise: 0, hold: true, depth: 2 }));
    if (d) { if (d.hold) g.hold(); for (const a of d.path) { if (a === B.L) g.move(-1); else if (a === B.R) g.move(1); else if (a === B.CW) g.rotate(1); else if (a === B.CCW) g.rotate(-1); else g.sonicDrop(); } }
    g.hardDrop();
    return 'play';
  });
  const playOut = async () => { for (let i = 0; i < 200; i++) { const s = await step(); if (s !== 'play') break; await sleep(60); } await sleep(1600); };
  try {
    await page.goto(URL); await sleep(600);
    await page.click('[data-go="levels"]'); await sleep(300);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'levels' && document.querySelectorAll('.lvb').length === 50 && !document.querySelector('[data-lvn="1"]').disabled && document.querySelector('[data-lvn="2"]').disabled), 'fifty levels a page; only the first is open');
    await page.screenshot({ path: path.join(OUT, 'levels-list.png') });
    const c0 = await page.evaluate(() => ZZ.Meta.data.coins);
    await page.click('[data-lvn="1"]'); await sleep(400);
    ok(await page.evaluate(() => ZZ.peek().S.kind === 'level' && /第 1 關/.test(document.body.textContent)), 'level 1 starts');
    await page.screenshot({ path: path.join(OUT, 'levels-play.png') });
    await playOut();
    const r = await page.evaluate(() => ({ sheet: ZZ.peek().sheet, stars: ZZ.Meta.lvStars(1), coins: ZZ.Meta.data.coins, open2: ZZ.Meta.lvOpen(2) }));
    ok(r.sheet === 'levelDone' && r.stars >= 1 && r.coins > c0 && r.open2, 'cleared: stars, coins, and level 2 opens', r);
    await page.screenshot({ path: path.join(OUT, 'levels-done.png') });
    // out of pieces
    await page.click('[data-do="lvNext"]'); await sleep(400);
    await page.evaluate(() => { const S = ZZ.peek().S; S.pieces = S.limit - 1; });
    await step(); await sleep(1400);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'levelFail' && /方塊用完了/.test(document.getElementById('sheetCard').textContent)), 'running out of pieces ends the level');
    // the endless run: a cleared stage leads straight to the next
    await page.click('[data-do="lvList"]'); await sleep(300);
    await page.click('[data-do="endlessGo"]'); await sleep(400);
    ok(await page.evaluate(() => ZZ.peek().S.lv.endless === 1), 'the endless run starts at stage 1');
    await playOut(); await sleep(400);
    ok(await page.evaluate(() => ZZ.peek().S.lv.endless === 2), 'and goes on to stage 2', await page.evaluate(() => ZZ.peek().S && ZZ.peek().S.lv && ZZ.peek().S.lv.endless));
    await page.evaluate(() => ZZ.peek().S.me.topOut('block')); await sleep(1300);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'endlessOver' && ZZ.Meta.data.lv.endless >= 1), 'losing ends the run and keeps the best');
    // the editor
    await page.click('[data-do="lvList"]'); await sleep(300);
    await page.click('[data-do="lvEdit"]'); await sleep(300);
    const before = await page.evaluate(() => document.querySelectorAll('.edc.on').length);
    await page.click('[data-edc="0,0"]'); await sleep(150);
    ok(await page.evaluate(n => document.querySelectorAll('.edc.on').length !== n, before), 'a tap changes a cell');
    await page.screenshot({ path: path.join(OUT, 'levels-editor.png') });
    await page.click('[data-edg="lines"]'); await sleep(150);
    await page.click('[data-do="edTry"]'); await sleep(400);
    ok(await page.evaluate(() => { const S = ZZ.peek().S; return S.kind === 'level' && S.lv.custom && S.lv.goal === 'lines'; }), 'the built level can be tried at once');
    // a link with a level
    const code = await page.evaluate(() => ZZ.Levels.encode({ goal: 'dig', need: 0, limit: 30, board: ['XXXX.XXXXX', 'XXX.XXXXXX'] }));
    await page.goto(URL + '&lv=' + code); await sleep(1000);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'lvInvite'), 'a shared link offers the level');
    await page.click('[data-do="lvInviteGo"]'); await sleep(400);
    ok(await page.evaluate(() => ZZ.peek().S.lv.custom && ZZ.peek().S.lv.board.length === 2), 'and plays it');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close();
  console.log('level checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
