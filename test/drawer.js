'use strict';
// The side menus in a real browser: 轉磚's (opens and closes, every entry reaches the same place as the page's own
// button, sign-out explains itself, ?go=profile from the brick games) and the brick games' (pauses the game, marks the
// page it is on, links back to 轉磚's profile). Needs the static server on 8790.
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
    for (const [w, h, m] of [[390, 844, true], [1280, 800, false]]) {
      const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: w, height: h }, hasTouch: m, isMobile: m });
      const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
      await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(700);
      const st = () => p.evaluate(() => ({ open: document.getElementById('drawer').classList.contains('open'), sheet: ZZ.peek().sheet, inert: document.querySelector('#menu .menu-in').hasAttribute('inert') }));
      ok(!(await st()).open, w + ': the side menu starts closed');
      await p.click('#mDrawer'); await sleep(350);
      let s = await st();
      ok(s.open && s.inert && await p.evaluate(() => document.activeElement.id === 'drClose'), w + ': it opens, the page behind cannot be tabbed into, focus is on close', s);
      ok(await p.evaluate(() => /玩家/.test(document.getElementById('drName').textContent) && /訪客/.test(document.getElementById('drAcct').textContent) && document.querySelectorAll('.dr-body [data-go]').length === 10), w + ': the player, the account state and every mode');
      if (w === 390) await p.screenshot({ path: path.join(OUT, 'drawer-phone.png') });
      await p.keyboard.press('Escape'); await sleep(300);
      ok(!(await st()).open && !(await st()).inert, w + ': Escape closes it');
      for (const [sel, want] of [['[data-go="levels"]', 'levels'], ['[data-sheet="shop"]', 'shop'], ['[data-sheet="srAccount"]', 'srAccount'], ['[data-sheet="profile"]', 'profile'], ['[data-sheet="drLogout"]', 'drLogout']]) {
        await p.click('#mDrawer'); await sleep(300);
        await p.click('.dr-body ' + sel); await sleep(350);
        s = await st();
        ok(!s.open && s.sheet === want, w + ': ' + want + ' from the side menu', s);
        await p.evaluate(() => ZZ.App.closeSheet()); await sleep(150);
      }
      await p.click('#mDrawer'); await sleep(300); await p.click('.dr-body [data-sheet="drLogout"]'); await sleep(300);
      ok(await p.evaluate(() => /綁好 SnowRealm 帳號以後才能登出/.test(document.getElementById('sheetCard').textContent)), w + ': sign-out says why it waits for a linked account');
      await p.evaluate(() => ZZ.App.closeSheet());
      ok(await p.evaluate(() => !!document.querySelector('.menu-foot [data-sheet="shop"]') && document.querySelectorAll('.modes [data-go]').length === 10), w + ': the page keeps all its own buttons');
      await ctx.close();
    }
    // the brick games
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true });
    const g = await ctx.newPage(); g.on('pageerror', e => problems.push('games: ' + e.message));
    await g.goto(BASE + 'games/snake/'); await sleep(400);
    await g.tap('#go'); await sleep(250);
    await g.tap('.burger'); await sleep(350);
    const gs = await g.evaluate(() => ({ open: document.getElementById('drawer').classList.contains('open'), state: window.__snake().state, cur: (document.querySelector('.dr-body a[aria-current]') || {}).textContent, n: document.querySelectorAll('.dr-body a[href$="/"]').length }));
    ok(gs.open && gs.state === 'pause' && gs.cur === '磚蛇', 'a brick game: the menu opens, the game pauses, the page is marked', gs);
    await g.screenshot({ path: path.join(OUT, 'drawer-game.png') });
    const fit = await g.evaluate(() => { const b = document.querySelector('.bar').getBoundingClientRect(); return b.right <= innerWidth && document.querySelector('.bar').scrollWidth <= document.querySelector('.bar').clientWidth + 1; });
    ok(fit, 'the top bar still fits on a small phone');
    await g.tap('.dr-body a[href="../../?go=profile"]'); await sleep(1300);
    ok(await g.evaluate(() => location.search === '?go=profile' && ZZ.peek().sheet === 'profile'), 'its profile link opens 轉磚 on the profile');
    await g.goto(BASE + 'games/'); await sleep(300);
    ok(await g.evaluate(() => !!document.querySelector('.dir header .burger')), 'the directory has the menu too');
    for (const gm of ['breakout', 'stack', 'push', 'merge', 'sort', 'picross', 'pipes', 'sweep']) {
      await g.goto(BASE + 'games/' + gm + '/'); await sleep(250);
      if (!(await g.evaluate(() => !!document.querySelector('.bar .burger') && !!document.getElementById('drawer')))) ok(false, gm + ' has the menu');
    }
    ok(true, 'every brick game has the menu');
    await ctx.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('side menu checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
