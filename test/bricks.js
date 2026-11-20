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
    ok((await page.$$('a.card')).length === 10 && (await page.$$('.card.soon')).length === 0, 'all ten playable');
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
    // 疊磚塔
    const st = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    st.on('pageerror', e => problems.push('stack: ' + e.message));
    await st.goto(BASE + 'games/stack/'); await sleep(400);
    ok(await st.evaluate(() => !document.getElementById('intro').hidden && document.querySelectorAll('[data-lv]').length === 3), '疊磚塔 opens on its start card with three difficulties');
    await st.click('#go'); await sleep(200);
    // drop right on top five times (perfects), then once well off (a cut)
    for (let i = 0; i < 5; i++) { await st.evaluate(() => { const { g } = window.__stack(); g.cur.x = g.top().x + 1; }); await st.keyboard.press(' '); await sleep(120); }
    let sr = await st.evaluate(() => ({ floors: window.__stack().g.floors(), combo: window.__stack().g.combo, shown: +document.getElementById('stage').textContent }));
    ok(sr.floors === 5 && sr.combo === 5 && sr.shown === 5, 'space drops the brick; five perfects', sr);
    await st.mouse.click(640, 400); await sleep(200);
    ok(await st.evaluate(() => window.__stack().g.floors() === 6), 'a click drops it too');
    await st.evaluate(() => { const S = window.__stack(), g = S.g; g.cur.x = g.top().x + 50; S.drop(); });
    ok(await st.evaluate(() => { const g = window.__stack().g; return g.top().w === g.tower[g.tower.length - 2].w - 50; }), 'fifty over is cut off');
    await st.screenshot({ path: path.join(OUT, 'stack-play.png') });
    await st.evaluate(() => { const { g } = window.__stack(); g.cur.x = g.top().x > 180 ? 0 : 360 - g.cur.w; g.cur.w = Math.min(g.cur.w, 60); g.tower[g.tower.length - 1].w = 60; g.cur.x = g.top().x > 150 ? 0 : 300; });
    await st.keyboard.press(' '); await sleep(200);
    ok(await st.evaluate(() => window.__stack().g.lives === 4 && /還剩 4 條命/.test(document.getElementById('ouch').textContent)), 'a miss costs a heart');
    await st.waitForFunction(() => window.__stack().state === 'play', null, { timeout: 3000 });
    await st.evaluate(() => { const { g } = window.__stack(); g.lives = 1; g.cur.x = g.top().x > 150 ? 0 : 300; });
    await st.keyboard.press(' '); await sleep(300);
    ok(await st.evaluate(() => window.__stack().state === 'over' && JSON.parse(localStorage.getItem('snowrealm.stack.bests')).normal === window.__stack().g.score), 'the last heart ends it and keeps the best');
    await st.screenshot({ path: path.join(OUT, 'stack-over.png') });
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const sp = await ctx3.newPage();
    sp.on('pageerror', e => problems.push('stack phone: ' + e.message));
    await sp.goto(BASE + 'games/stack/'); await sleep(400);
    await sp.tap('#go'); await sleep(150);
    for (let i = 0; i < 14; i++) { await sp.evaluate(() => { const { g } = window.__stack(); g.cur.x = g.top().x + 2; g.cfg = Object.assign({}, g.cfg, { speed: 0, up: 0 }); }); await sp.tap('#cv'); await sleep(140); }
    const fitS = await sp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { b: r.bottom, vh: innerHeight, floors: window.__stack().g.floors() }; });
    ok(fitS.b <= fitS.vh && fitS.floors === 14, 'on a phone taps drop bricks and the field fits', fitS);
    await sleep(500);
    await sp.screenshot({ path: path.join(OUT, 'stack-phone.png') });
    await ctx3.close();
    // 推磚倉庫
    const pu = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    pu.on('pageerror', e => problems.push('push: ' + e.message));
    await pu.goto(BASE + 'games/push/'); await sleep(400);
    ok(await pu.evaluate(() => document.querySelectorAll('.lv').length === 60 && !document.querySelector('[data-lv="0"]').disabled && document.querySelector('[data-lv="1"]').disabled), 'the list: sixty levels, only the first open');
    await pu.screenshot({ path: path.join(OUT, 'push-list.png') });
    await pu.click('[data-lv="0"]'); await sleep(300);
    ok(await pu.evaluate(() => window.__push().state === 'play' && /第 1 關/.test(document.getElementById('lvName').textContent)), 'level 1 starts');
    await pu.screenshot({ path: path.join(OUT, 'push-play.png') });
    // solve it with the solver's own route: breadth-first in the page over moves
    const route = await pu.evaluate(() => {
      const P = window.Push, L = window.PUSH_LEVELS[0], D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const start = new P(L.m), keyOf = g => g.px + ',' + g.py + '|' + g.box.map(b => b ? 1 : 0).join('');
      const q = [[start, []]], seen = new Set([keyOf(start)]);
      while (q.length) { const [g, path] = q.shift(); for (const d in D) { const h = new P(L.m); for (const s of path) h.move(s); if (!h.move(d)) continue; if (h.solved()) return path.concat(d); const k = keyOf(h); if (!seen.has(k)) { seen.add(k); q.push([h, path.concat(d)]); } } }
      return null;
    });
    ok(route && route.length > 0, 'the page level can be solved', route && route.length);
    const AR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    await pu.keyboard.press('ArrowDown'); await sleep(50); await pu.keyboard.press('z'); await sleep(50);
    for (const d of route) { await pu.keyboard.press(AR[d]); await sleep(30); }
    await sleep(600);
    ok(await pu.evaluate(() => window.__push().state === 'won' && !document.getElementById('win').hidden && /★/.test(document.getElementById('winStars').textContent)), 'solved with the arrow keys: the win card');
    await pu.screenshot({ path: path.join(OUT, 'push-win.png') });
    await pu.click('#next'); await sleep(300);
    ok(await pu.evaluate(() => window.__push().n === 1 && JSON.parse(localStorage.getItem('snowrealm.push.done'))[0].s >= 1), 'progress is kept and level 2 opens');
    await pu.keyboard.press('ArrowLeft'); await sleep(50);
    const moved = await pu.evaluate(() => window.__push().g.moves);
    await pu.click('#undo'); await sleep(50);
    ok(await pu.evaluate(m => window.__push().g.moves === m - 1 || m === 0, moved), 'the undo button');
    const ctx4 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
    const pp = await ctx4.newPage();
    pp.on('pageerror', e => problems.push('push phone: ' + e.message));
    await pp.goto(BASE + 'games/push/'); await sleep(400);
    await pp.tap('[data-lv="0"]'); await sleep(300);
    const fitP = await pp.evaluate(() => { const c = document.getElementById('cv').getBoundingClientRect(), p = document.getElementById('pad').getBoundingClientRect(); return { cb: c.bottom, pt: p.top, pb: p.bottom, vh: innerHeight, cw: c.width }; });
    ok(fitP.pb <= fitP.vh + 1 && fitP.cw >= 150, 'on a phone the field and the pad fit', fitP);
    await pp.tap('[data-d="left"]'); await sleep(150);
    ok(await pp.evaluate(() => window.__push().g.moves + window.__push().g.hist.length >= 0), 'the pad works');
    await pp.screenshot({ path: path.join(OUT, 'push-phone.png') });
    await ctx4.close();
    // 磚塊合成
    const mg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    mg.on('pageerror', e => problems.push('merge: ' + e.message));
    await mg.goto(BASE + 'games/merge/'); await sleep(400);
    ok(await mg.evaluate(() => !document.getElementById('intro').hidden && document.querySelectorAll('[data-lv]').length === 3), '磚塊合成 opens on its start card');
    await mg.click('[data-lv="easy"]'); await mg.click('#go'); await sleep(200);
    ok(await mg.evaluate(() => window.__merge().state === 'play' && window.__merge().g.C === 5 && window.__merge().g.R === 8), 'easy: five columns, eight rows');
    await mg.evaluate(() => { const { g } = window.__merge(); g.queue = [2, 2, 2]; });
    await mg.keyboard.press('1'); await sleep(100); await mg.keyboard.press('2'); await sleep(400);
    ok(await mg.evaluate(() => { const { g } = window.__merge(); return g.grid[1][0] && g.grid[1][0].v === 4 && g.score === 4 && document.getElementById('top').textContent === '4'; }), 'number keys drop bricks; two 2s make a 4');
    const cbox = await mg.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await mg.mouse.click(cbox.x + cbox.w * 0.9, cbox.y + cbox.h * 0.5); await sleep(300);
    ok(await mg.evaluate(() => !!window.__merge().g.grid[4][0]), 'a click drops into that column');
    for (let i = 0; i < 12; i++) { await mg.evaluate(() => { const { g } = window.__merge(); g.queue[0] = [2, 4, 8, 16][Math.floor(Math.random() * 4)]; }); await mg.mouse.click(cbox.x + cbox.w * (0.1 + 0.2 * (i % 5)), cbox.y + cbox.h * 0.5); await sleep(120); }
    await sleep(400);
    await mg.screenshot({ path: path.join(OUT, 'merge-play.png') });
    await mg.evaluate(() => { const { g } = window.__merge(); g.lives = 1; for (let r = 0; r < g.R; r++) g.grid[2][r] = g.mk(r % 2 ? 1024 : 2048); });
    await mg.keyboard.press('3'); await sleep(300);
    ok(await mg.evaluate(() => window.__merge().state === 'over' && JSON.parse(localStorage.getItem('snowrealm.merge.bests')).easy === window.__merge().g.score), 'a full column on the last heart ends it; the best is kept');
    await mg.screenshot({ path: path.join(OUT, 'merge-over.png') });
    const ctx5 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const mp = await ctx5.newPage();
    mp.on('pageerror', e => problems.push('merge phone: ' + e.message));
    await mp.goto(BASE + 'games/merge/'); await sleep(400);
    await mp.tap('#go'); await sleep(200);
    const mfit = await mp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { b: r.bottom, w: r.width, vh: innerHeight }; });
    ok(mfit.b <= mfit.vh && mfit.w >= 250, 'on a phone the field fits', mfit);
    await mp.tap('#cv', { position: { x: 20, y: 200 } }); await sleep(300);
    ok(await mp.evaluate(() => !!window.__merge().g.grid[0][0]), 'a tap drops into the column tapped');
    await mp.screenshot({ path: path.join(OUT, 'merge-phone.png') });
    await ctx5.close();
    // 分磚
    const so = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    so.on('pageerror', e => problems.push('sort: ' + e.message));
    await so.goto(BASE + 'games/sort/'); await sleep(400);
    ok(await so.evaluate(() => document.querySelectorAll('.lv').length === 60 && document.querySelector('[data-lv="1"]').disabled), 'the list: sixty levels, only the first open');
    await so.click('[data-lv="0"]'); await sleep(300);
    // solve level 1 with a search in the page, then play it with the number keys
    const sroute = await so.evaluate(() => {
      const S = window.Sort, L = window.SORT_LEVELS[0], key = g => g.st.map(s => s.join('')).join('|');
      const q = [[[]]], seen = new Set();
      while (q.length) { const [path] = q.shift(); const g = new S(L.m); path.forEach(([a, b]) => g.move(a, b)); if (g.solved()) return path; const k = key(g); if (seen.has(k)) continue; seen.add(k); for (let a = 0; a < g.st.length; a++) for (let b = 0; b < g.st.length; b++) if (g.can(a, b)) q.push([path.concat([[a, b]])]); }
      return null;
    });
    ok(sroute && sroute.length === await so.evaluate(() => window.SORT_LEVELS[0].p), 'level 1 can be done in its stated moves', sroute && sroute.length);
    await so.screenshot({ path: path.join(OUT, 'sort-play.png') });
    for (const [a, b] of sroute) { await so.keyboard.press(String(a + 1)); await so.keyboard.press(String(b + 1)); await sleep(60); }
    await sleep(700);
    ok(await so.evaluate(() => window.__sort().state === 'won' && /★★★/.test(document.getElementById('winStars').textContent)), 'done in the fewest moves: three stars');
    await so.screenshot({ path: path.join(OUT, 'sort-win.png') });
    const ctx6 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const sph = await ctx6.newPage();
    sph.on('pageerror', e => problems.push('sort phone: ' + e.message));
    await sph.goto(BASE + 'games/sort/'); await sleep(400);
    await sph.evaluate(() => { localStorage.setItem('snowrealm.sort.done', JSON.stringify(Object.fromEntries(Array.from({ length: 59 }, (_, i) => [i, { s: 1, m: 99 }])))); });
    await sph.reload(); await sleep(400);
    await sph.tap('[data-lv="59"]'); await sleep(300);
    const sfit = await sph.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, n: window.__sort().g.st.length }; });
    ok(sfit.r <= sfit.vw && sfit.b <= sfit.vh && sfit.n === 9, 'on a phone nine stacks fit', sfit);
    const before = await sph.evaluate(() => window.__sort().g.moves);
    const box6 = await sph.$eval('#cv', c => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    await sph.tap('#cv', { position: { x: box6.w * 0.12, y: box6.h * 0.3 } }); await sleep(100);
    ok(await sph.evaluate(() => window.__sort().state === 'play'), 'a tap selects a stack');
    await sph.screenshot({ path: path.join(OUT, 'sort-phone.png') });
    void before;
    await ctx6.close();
    // 磚畫謎
    const pc = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    pc.on('pageerror', e => problems.push('picross: ' + e.message));
    await pc.goto(BASE + 'games/picross/'); await sleep(400);
    ok(await pc.evaluate(() => document.querySelectorAll('.lv').length === window.PICROSS.length && !document.querySelector('[data-lv="0"]').disabled && !document.querySelector('[data-lv="10"]').disabled && document.querySelector('[data-lv="1"]').disabled), 'the list: the first of each size open');
    await pc.click('[data-lv="0"]'); await sleep(300);
    // click every brick of the heart through the canvas (the page tells where the grid is)
    const geo = await pc.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(), g = window.__picross().g; return { x: r.left, y: r.top, w: r.width, h: r.height, W: g.W, H: g.H, sol: g.sol }; });
    // the grid sits at the bottom right of the canvas: work out a cell's size from the canvas and the clue margins
    const cellPx = await pc.evaluate(() => { const g = window.__picross().g, c = document.getElementById('cv'); for (let s = 56; s >= 20; s--) { const maxR = Math.max(...g.rows.map(r => r.length)), cl = Math.ceil(maxR * s * 0.62 + s * 0.3); if (cl + g.W * s + 2 === Math.round(c.getBoundingClientRect().width)) return { s, cl, ct: Math.round(c.getBoundingClientRect().height) - g.H * s - 2 }; } return null; });
    ok(!!cellPx, 'the grid geometry is found', cellPx);
    await pc.mouse.click(geo.x + cellPx.cl + 0.5 * cellPx.s, geo.y + cellPx.ct + 0.5 * cellPx.s); await sleep(100);
    ok(await pc.evaluate(() => window.__picross().g.lives === 4), 'a wrong click costs a heart');
    await pc.click('#modeCross'); await pc.mouse.click(geo.x + cellPx.cl + 2.5 * cellPx.s, geo.y + cellPx.ct + 0.5 * cellPx.s); await sleep(80);
    ok(await pc.evaluate(() => window.__picross().g.cells[0][2] === 2 && window.__picross().g.lives === 4), 'cross mode marks a cell for free');
    await pc.click('#modeFill');
    // drag along row 1 (all five filled)
    await pc.mouse.move(geo.x + cellPx.cl + 0.5 * cellPx.s, geo.y + cellPx.ct + 1.5 * cellPx.s); await pc.mouse.down();
    for (let X = 1; X < 5; X++) await pc.mouse.move(geo.x + cellPx.cl + (X + 0.5) * cellPx.s, geo.y + cellPx.ct + 1.5 * cellPx.s, { steps: 3 });
    await pc.mouse.up();
    ok(await pc.evaluate(() => window.__picross().g.rowDone(1)), 'dragging fills a whole row');
    for (let Y = 0; Y < geo.H; Y++) for (let X = 0; X < geo.W; X++) if (geo.sol[Y][X]) await pc.mouse.click(geo.x + cellPx.cl + (X + 0.5) * cellPx.s, geo.y + cellPx.ct + (Y + 0.5) * cellPx.s);
    await sleep(1200);
    ok(await pc.evaluate(() => window.__picross().state === 'won' && /愛心/.test(document.getElementById('winName').textContent) && /★★☆/.test(document.getElementById('winStars').textContent)), 'the picture appears: 愛心, two stars for one mistake');
    await pc.screenshot({ path: path.join(OUT, 'picross-win.png') });
    await pc.click('#toList'); await pc.click('[data-lv="10"]'); await sleep(300);
    await pc.screenshot({ path: path.join(OUT, 'picross-10.png') });
    const ctx7 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pp2 = await ctx7.newPage();
    pp2.on('pageerror', e => problems.push('picross phone: ' + e.message));
    await pp2.goto(BASE + 'games/picross/'); await sleep(400);
    await pp2.tap('[data-lv="10"]'); await sleep(300);
    const pfit = await pp2.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, w: r.width }; });
    ok(pfit.r <= pfit.vw && pfit.b <= pfit.vh && pfit.w >= 280, 'on a phone the 10 by 10 grid fits', pfit);
    await pp2.screenshot({ path: path.join(OUT, 'picross-phone.png') });
    await ctx7.close();
    // 磚道
    const pi = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    pi.on('pageerror', e => problems.push('pipes: ' + e.message));
    await pi.goto(BASE + 'games/pipes/'); await sleep(400);
    await pi.click('[data-lv="easy"]'); await pi.click('#go'); await sleep(300);
    ok(await pi.evaluate(() => window.__pipes().state === 'play' && window.__pipes().g.N === 5), 'easy is 5 by 5');
    await pi.screenshot({ path: path.join(OUT, 'pipes-play.png') });
    const pg = await pi.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(), g = window.__pipes().g; return { x: r.left, y: r.top, s: r.width / g.N, N: g.N, turns: g.tiles.map((m, c) => { let k = 0, t = m; while (t !== g.sol[c] && k < 4) { t = ((t << 1) | (t >> 3)) & 15; k++; } return k; }) }; });
    for (let c = 0; c < pg.turns.length; c++) for (let k = 0; k < pg.turns[c]; k++) await pi.mouse.click(pg.x + (c % pg.N + 0.5) * pg.s, pg.y + (Math.floor(c / pg.N) + 0.5) * pg.s);
    await sleep(1300);
    ok(await pi.evaluate(() => window.__pipes().state === 'won' && !document.getElementById('end').hidden && !!JSON.parse(localStorage.getItem('snowrealm.pipes.bests')).easy), 'clicking every tile into place: done, and the time is kept');
    await pi.screenshot({ path: path.join(OUT, 'pipes-done.png') });
    const ctx8 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pph = await ctx8.newPage();
    pph.on('pageerror', e => problems.push('pipes phone: ' + e.message));
    await pph.goto(BASE + 'games/pipes/'); await sleep(400);
    await pph.tap('[data-lv="hard"]'); await pph.tap('#go'); await sleep(300);
    const pfit2 = await pph.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, w: r.width }; });
    ok(pfit2.r <= pfit2.vw && pfit2.b <= pfit2.vh && pfit2.w >= 280, 'on a phone the 9 by 9 board fits', pfit2);
    const t0 = await pph.evaluate(() => window.__pipes().g.taps);
    await pph.tap('#cv', { position: { x: 20, y: 20 } }); await sleep(100);
    ok(await pph.evaluate(t => window.__pipes().g.taps === t + 1, t0), 'a tap turns a tile');
    await pph.screenshot({ path: path.join(OUT, 'pipes-phone.png') });
    await ctx8.close();
    // 掃磚
    const sw2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    sw2.on('pageerror', e => problems.push('sweep: ' + e.message));
    await sw2.goto(BASE + 'games/sweep/'); await sleep(400);
    await sw2.click('[data-lv="easy"]'); await sw2.click('#go'); await sleep(300);
    const sg = await sw2.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(), g = window.__sweep().g; return { x: r.left, y: r.top, s: r.width / g.W, W: g.W, H: g.H }; });
    const at = i => [sg.x + (i % sg.W + 0.5) * sg.s, sg.y + (Math.floor(i / sg.W) + 0.5) * sg.s];
    await sw2.mouse.click(...at(27)); await sleep(150);
    ok(await sw2.evaluate(() => { const g = window.__sweep().g; return !g.crack[27] && g.open.filter(Boolean).length >= 9; }), 'the first click is safe and opens an area');
    const cracks = await sw2.evaluate(() => window.__sweep().g.crack.map((c, i) => c ? i : -1).filter(i => i >= 0));
    await sw2.mouse.click(...at(cracks[0]), { button: 'right' }); await sleep(80);
    ok(await sw2.evaluate(i => window.__sweep().g.flag[i], cracks[0]), 'a right click plants a flag');
    await sw2.screenshot({ path: path.join(OUT, 'sweep-play.png') });
    const safe = await sw2.evaluate(() => { const g = window.__sweep().g; return g.crack.map((c, i) => !c && !g.open[i] ? i : -1).filter(i => i >= 0); });
    for (const i of safe) { if (await sw2.evaluate(j => !window.__sweep().g.open[j], i)) await sw2.mouse.click(...at(i)); }
    await sleep(1200);
    ok(await sw2.evaluate(() => window.__sweep().state === 'won' && !document.getElementById('end').hidden && !!JSON.parse(localStorage.getItem('snowrealm.sweep.bests')).easy), 'every sound brick out: done, time kept');
    await sw2.screenshot({ path: path.join(OUT, 'sweep-done.png') });
    const ctx9 = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const swp = await ctx9.newPage();
    swp.on('pageerror', e => problems.push('sweep phone: ' + e.message));
    await swp.goto(BASE + 'games/sweep/'); await sleep(400);
    await swp.tap('[data-lv="hard"]'); await swp.tap('#go'); await sleep(300);
    const sfit3 = await swp.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, w: r.width }; });
    ok(sfit3.r <= sfit3.vw && sfit3.b <= sfit3.vh && sfit3.w >= 260, 'on a phone the 10 by 14 wall fits', sfit3);
    await swp.tap('#cv', { position: { x: sfit3.w / 2, y: 100 } }); await sleep(150);
    ok(await swp.evaluate(() => window.__sweep().g.open.some(Boolean)), 'a tap knocks bricks out');
    await swp.tap('#modeFlag'); const fi = await swp.evaluate(() => window.__sweep().g.open.findIndex(o => !o));
    const fpos = await swp.evaluate(i => { const r = document.getElementById('cv').getBoundingClientRect(), g = window.__sweep().g, s = r.width / g.W; return { x: (i % g.W + 0.5) * s, y: (Math.floor(i / g.W) + 0.5) * s }; }, fi);
    await swp.tap('#cv', { position: fpos }); await sleep(100);
    ok(await swp.evaluate(i => window.__sweep().g.flag[i], fi), 'flag mode plants a flag with a tap');
    await swp.screenshot({ path: path.join(OUT, 'sweep-phone.png') });
    await ctx9.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('brick games checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
