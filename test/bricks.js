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
    ok((await page.$$('a.card')).length === 3 && (await page.$$('.card.soon')).length === 7, 'three playable, seven coming');
    await page.screenshot({ path: path.join(OUT, 'games-dir.png'), fullPage: true });
    await page.click('a.card[href="snake/"]'); await sleep(500);
    ok(await page.evaluate(() => !document.getElementById('intro').hidden && document.getElementById('pause').disabled), '磚蛇 opens on its start card');
    await page.screenshot({ path: path.join(OUT, 'snake-intro.png') });
    ok(await page.evaluate(() => document.querySelectorAll('[data-lv]').length === 3 && document.querySelector('[data-lv="normal"]').getAttribute('aria-checked') === 'true'), 'three difficulties, normal picked');
    await page.click('[data-lv="easy"]');
    await page.click('#go'); await sleep(200);
    ok(await page.evaluate(() => window.__snake().state === 'play' && window.__snake().g.level === 'easy' && window.__snake().g.speed() === 260), 'start on easy: slower');
    ok(await page.evaluate(() => document.getElementById('hearts').textContent === '♥♥♥♥♥'), 'five hearts');
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
    // run into the wall: a heart goes and the snake comes back
    const wall = () => page.evaluate(() => { const { g } = window.__snake(); g.cement = []; g.spikes = []; g.portals = null; g.food = null; g.gold = null; g.turns = []; g.body = g.body.slice(0, 3); g.body.forEach((p, i) => { p.x = 12 - i; p.y = 8; }); g.dir = 'right'; });
    await wall();
    await page.waitForFunction(() => window.__snake().state === 'ouch', null, { timeout: 8000 });
    ok(await page.evaluate(() => window.__snake().g.lives === 4 && document.getElementById('hearts').textContent === '♥♥♥♥♡' && /還剩 4 條命/.test(document.getElementById('ouch').textContent)), 'a wall costs a heart');
    await page.screenshot({ path: path.join(OUT, 'snake-ouch.png') });
    await page.waitForFunction(() => window.__snake().state === 'play', null, { timeout: 4000 });
    ok(true, 'and play goes on');
    // traps on screen
    await page.evaluate(() => { const { g } = window.__snake(); g.eaten = 10; g.addTraps(); });
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'snake-traps.png') });
    ok(await page.evaluate(() => window.__snake().g.spikes.length === 1 && !!window.__snake().g.portals), 'easy has one spike and a pair of portals');
    await page.evaluate(() => { window.__snake().g.lives = 1; });
    await wall();
    await page.waitForFunction(() => window.__snake().state === 'over', null, { timeout: 8000 });
    const end = await page.evaluate(() => ({ text: document.getElementById('end').textContent, best: +localStorage.getItem('snowrealm.snake.best'), score: window.__snake().g.score }));
    ok(/命用完了/.test(end.text) && end.score > 0, 'the last heart ends it', end);
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('snowrealm.snake.bests')).easy === window.__snake().g.score), 'the best is kept for that difficulty');
    const contrast = await page.evaluate(() => [...document.querySelectorAll('#end .btn')].map(b => { const s = getComputedStyle(b); return [s.color, s.backgroundColor]; }));
    ok(contrast.length === 3 && contrast.every(([c, b]) => c !== b) && contrast.filter(([c]) => c === 'rgb(27, 37, 48)').length === 2, 'every button on the end card can be read', contrast);
    await page.screenshot({ path: path.join(OUT, 'snake-over.png') });
    await page.reload(); await sleep(400);
    ok(await page.evaluate(() => +document.getElementById('best').textContent > 0 && document.querySelector('[data-lv="easy"]').getAttribute('aria-checked') === 'true'), 'the best and the difficulty are still there after a reload');

    // a phone: the pad and swiping
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
    const ph = await ctx.newPage();
    ph.on('pageerror', e => problems.push('phone: ' + e.message));
    await ph.goto(BASE + 'games/snake/'); await sleep(500);
    const lay = await ph.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), p = document.getElementById('pad').getBoundingClientRect(); return { boardBottom: b.bottom, padTop: p.top, padBottom: p.bottom, vh: innerHeight, w: b.width, padShown: getComputedStyle(document.getElementById('pad')).display !== 'none' }; });
    ok(lay.padShown && lay.boardBottom <= lay.padTop && lay.padBottom <= lay.vh && lay.w >= 300, 'on a phone the field and the pad both fit', lay);
    await ph.tap('#go'); await sleep(150);
    await ph.tap('[data-d="up"]'); await sleep(400);
    ok(await ph.evaluate(() => window.__snake().g.dir === 'up'), 'the pad turns the snake');
    await ph.screenshot({ path: path.join(OUT, 'snake-phone.png') });
    await ph.evaluate(() => { const { g } = window.__snake(); g.lives = 1; g.cement = []; g.spikes = []; g.portals = null; g.food = null; g.turns = []; g.dir = 'up'; });
    await ph.waitForFunction(() => window.__snake().state === 'over', null, { timeout: 8000 });
    const dark = await ph.evaluate(() => { const b = document.querySelector('#end .btn.plain'), s = getComputedStyle(b); return [s.color, s.backgroundColor]; });
    ok(dark[0] === 'rgb(27, 37, 48)' && dark[1] !== dark[0], 'in dark mode the light buttons keep dark writing', dark);
    await ph.screenshot({ path: path.join(OUT, 'snake-over-dark.png') });
    await ctx.close();
    // 打磚塊
    const bk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    bk.on('pageerror', e => problems.push('breakout: ' + e.message));
    await bk.goto(BASE + 'games/breakout/'); await sleep(400);
    ok(await bk.evaluate(() => !document.getElementById('intro').hidden && document.querySelectorAll('[data-lv]').length === 3), '打磚塊 opens on its start card with three difficulties');
    await bk.click('[data-lv="easy"]'); await bk.click('#go'); await sleep(200);
    ok(await bk.evaluate(() => window.__breakout().state === 'play' && window.__breakout().g.held && window.__breakout().g.level === 'easy'), 'the ball waits on the paddle');
    await bk.screenshot({ path: path.join(OUT, 'breakout-serve.png') });
    const box = await bk.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await bk.mouse.move(box.x + box.w * 0.3, box.y + box.h * 0.8); await sleep(100);
    ok(await bk.evaluate(() => Math.abs(window.__breakout().g.paddle.x - 108) < 4), 'the mouse moves the paddle', await bk.evaluate(() => window.__breakout().g.paddle.x));
    await bk.keyboard.press(' '); await sleep(100);
    ok(await bk.evaluate(() => !window.__breakout().g.held), 'space launches the ball');
    // keep the paddle under the ball for a few seconds
    for (let i = 0; i < 60; i++) { await bk.evaluate(() => { const { g } = window.__breakout(); if (g.balls[0]) g.move(g.balls[0].x); }); await sleep(50); }
    const run = await bk.evaluate(() => ({ score: window.__breakout().g.score, shown: +document.getElementById('score').textContent, lives: window.__breakout().g.lives }));
    ok(run.score > 0 && run.shown === run.score && run.lives === 5, 'bricks break and the score shows', run);
    await bk.screenshot({ path: path.join(OUT, 'breakout-play.png') });
    await bk.evaluate(() => { const { g } = window.__breakout(); g.lives = 1; g.paddle.x = 20; g.balls = [{ x: 340, y: 520, vx: 0, vy: 400 }]; });
    await bk.waitForFunction(() => window.__breakout().state === 'over', null, { timeout: 5000 });
    ok(await bk.evaluate(() => JSON.parse(localStorage.getItem('snowrealm.breakout.bests')).easy === window.__breakout().g.score), 'the end keeps the best for that difficulty');
    await bk.screenshot({ path: path.join(OUT, 'breakout-over.png') });
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const bp = await ctx2.newPage();
    bp.on('pageerror', e => problems.push('breakout phone: ' + e.message));
    await bp.goto(BASE + 'games/breakout/'); await sleep(400);
    await bp.tap('#go'); await sleep(150);
    const fit = await bp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { b: r.bottom, w: r.width, vh: innerHeight }; });
    ok(fit.b <= fit.vh && fit.w >= 300, 'on a phone the whole field fits on screen', fit);
    const pb = await bp.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await bp.tap('#cv', { position: { x: pb.w * 0.7, y: pb.h * 0.5 } }); await sleep(150);
    ok(await bp.evaluate(() => !window.__breakout().g.held && Math.abs(window.__breakout().g.paddle.x - 252) < 6), 'a tap moves the paddle there and serves', await bp.evaluate(() => window.__breakout().g.paddle.x));
    await bp.screenshot({ path: path.join(OUT, 'breakout-phone.png') });
    await ctx2.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('brick games checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
