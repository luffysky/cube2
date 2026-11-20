'use strict';
// The brick games pages in a real browser: the directory, the link to it from 轉磚's menu, and 磚蛇 played for a while
// (keys, the pad on a phone, pausing, the end and the best score kept). Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => problems.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) problems.push(m.text()); });
    await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(500);
    ok(await page.evaluate(() => !!document.querySelector('.menu-foot a[href="games/"]')), "轉磚's menu links to the other games");
    await page.click('.menu-foot a[href="games/"]'); await sleep(500);
    ok(/\/games\/$/.test(page.url()) && (await page.$$('.card')).length === 10, 'the directory lists ten games', page.url());
    ok((await page.$$('a.card')).length === 2 && (await page.$$('.card.soon')).length === 8, 'two playable, eight coming');
    await page.screenshot({ path: path.join(OUT, 'games-dir.png'), fullPage: true });
    await page.click('a.card[href="snake/"]'); await sleep(500);
    ok(await page.evaluate(() => !document.getElementById('intro').hidden && document.getElementById('pause').disabled), '磚蛇 opens on its start card');
    await page.screenshot({ path: path.join(OUT, 'snake-intro.png') });
    await page.click('#go'); await sleep(200);
    ok(await page.evaluate(() => window.__snake().state === 'play'), 'start');
    // steer toward the food for a while with the arrow keys
    for (let i = 0; i < 120; i++) {
      const s = await page.evaluate(() => { const { g, state } = window.__snake(); return state === 'play' ? { h: g.body[0], f: g.food, dir: g.dir } : null; });
      if (!s) break;
      const REV = { right: 'left', left: 'right', up: 'down', down: 'up' };
      let want = s.f.x > s.h.x ? 'right' : s.f.x < s.h.x ? 'left' : s.f.y > s.h.y ? 'down' : 'up';
      if (want === REV[s.dir]) want = s.dir === 'left' || s.dir === 'right' ? (s.h.y < 8 ? 'down' : 'up') : (s.h.x < 8 ? 'right' : 'left');
      if (want !== s.dir) await page.keyboard.press({ right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' }[want]);
      if (i > 60 && (await page.evaluate(() => window.__snake().g.eaten)) >= 2) break;
      await sleep(90);
    }
    const mid = await page.evaluate(() => { const { g, state } = window.__snake(); return { state, eaten: g.eaten, score: g.score, len: g.body.length, shown: +document.getElementById('score').textContent }; });
    ok(mid.eaten >= 1 && mid.score >= 10 && mid.shown === mid.score, 'eating with the arrow keys; the score is shown', mid);
    await page.screenshot({ path: path.join(OUT, 'snake-play.png') });
    await page.keyboard.press(' '); await sleep(200);
    ok(await page.evaluate(() => window.__snake().state === 'pause' && !document.getElementById('paused').hidden), 'space pauses');
    await page.click('#resume'); await sleep(150);
    ok(await page.evaluate(() => window.__snake().state === 'play'), 'and it carries on');
    // run into the wall
    await page.evaluate(() => { const { g } = window.__snake(); g.cement = []; g.food = null; g.gold = null; g.turns = []; g.body = g.body.slice(0, 3); g.body.forEach((p, i) => { p.x = 8 - i; p.y = 8; }); g.dir = 'right'; });
    await page.waitForFunction(() => window.__snake().state === 'over', null, { timeout: 8000 });
    const end = await page.evaluate(() => ({ text: document.getElementById('end').textContent, best: +localStorage.getItem('snowrealm.snake.best'), score: window.__snake().g.score }));
    ok(/撞到牆了/.test(end.text) && end.best === end.score && end.best > 0, 'hitting the wall ends it and keeps the best', end);
    await page.screenshot({ path: path.join(OUT, 'snake-over.png') });
    await page.reload(); await sleep(400);
    ok(await page.evaluate(() => +document.getElementById('best').textContent > 0), 'the best is still there after a reload');

    // a phone: the pad and swiping
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const ph = await ctx.newPage();
    ph.on('pageerror', e => problems.push('phone: ' + e.message));
    await ph.goto(BASE + 'games/snake/'); await sleep(500);
    const lay = await ph.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), p = document.getElementById('pad').getBoundingClientRect(); return { boardBottom: b.bottom, padTop: p.top, padBottom: p.bottom, vh: innerHeight, w: b.width, padShown: getComputedStyle(document.getElementById('pad')).display !== 'none' }; });
    ok(lay.padShown && lay.boardBottom <= lay.padTop && lay.padBottom <= lay.vh && lay.w >= 300, 'on a phone the field and the pad both fit', lay);
    await ph.tap('#go'); await sleep(150);
    await ph.tap('[data-d="up"]'); await sleep(400);
    ok(await ph.evaluate(() => window.__snake().g.dir === 'up'), 'the pad turns the snake');
    await ph.screenshot({ path: path.join(OUT, 'snake-phone.png') });
    await ctx.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('brick games checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
