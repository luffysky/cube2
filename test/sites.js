'use strict';
// Site themes in a real browser: the shop's 網站主題 tab (tiers, the Steam tag, buying, wearing), the colours of the
// whole page changing (not just the game), the side menu and Settings reaching the tab, and a brick-game page
// following the pick. Needs the static server on 8790.
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
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: m, isMobile: m });
      const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
      await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(700);
      const floor = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const before = await floor();
      await p.click('#mDrawer'); await sleep(300); await p.click('.dr-body [data-sitepick]'); await sleep(400);
      let s = await p.evaluate(() => ({ sheet: ZZ.peek().sheet, cards: document.querySelectorAll('#sheetCard .pv.sw.site').length, h3: [...document.querySelectorAll('#sheetCard h3')].map(x => x.textContent), steam: [...document.querySelectorAll('#sheetCard .steamtag')].map(x => x.textContent), locks: document.querySelectorAll('#sheetCard .tag.lock').length, buys: document.querySelectorAll('#sheetCard [data-sbuy]').length }));
      ok(s.sheet === 'shop' && s.cards === 18, w + ': the side menu opens the site themes, all 18', s);
      ok(['基本', '免費', '金幣購買', '會員限定', 'Steam 限定'].every(x => s.h3.includes(x)), w + ': grouped by tier', s.h3);
      ok(s.steam.length === 2 && s.steam.every(x => x === 'Steam 限定'), w + ': the two Steam ones say Steam 限定', s.steam);
      ok(s.locks === 6 && s.buys === 5, w + ': members and Steam locked, coins to buy', s);
      ok(await p.evaluate(() => document.querySelector('#sheetCard [data-tab="site"]').getAttribute('aria-selected') === 'true' || /網站主題/.test(document.querySelector('#sheetCard').textContent)), w + ': on the 網站主題 tab');
      if (w === 390) await p.screenshot({ path: path.join(OUT, 'site-themes-phone.png') });
      await p.click('#sheetCard [data-swear="dark"]'); await sleep(300);
      ok(await p.evaluate(() => document.documentElement.getAttribute('data-site')) === 'dark' && await floor() !== before, w + ': wearing 黑 changes the page colours');
      const panel = await p.evaluate(() => { const d = document.getElementById('drawer'); return getComputedStyle(d).backgroundColor; });
      ok(/rgb\((30|18), (34|20), (40|24)\)/.test(panel), w + ': the side menu too', panel);
      await p.evaluate(() => { ZZ.Meta.data.coins = 5000; ZZ.Meta.save(); ZZ.App.openSheet('shop'); }); await sleep(200);
      await p.click('#sheetCard [data-sbuy="starry"]'); await sleep(400);
      ok(await p.evaluate(() => document.documentElement.getAttribute('data-site') === 'starry' && ZZ.Meta.data.coins === 3500 && ZZ.Meta.owns('site', 'starry')), w + ': buying 星夜 pays 1500 and puts it on');
      if (w === 1280) await p.screenshot({ path: path.join(OUT, 'site-themes-starry.png') });
      await p.evaluate(() => ZZ.App.closeSheet()); await sleep(200);
      await p.evaluate(() => ZZ.App.openSheet('settings')); await sleep(200);
      await p.click('#sheetCard [data-tab="site"]'); await sleep(300);
      ok(await p.evaluate(() => ZZ.peek().sheet === 'shop' && document.querySelectorAll('#sheetCard .pv.sw.site').length === 18), w + ': Settings reaches it too');
      await p.evaluate(() => ZZ.App.closeSheet());
      // a brick game follows
      const g = await ctx.newPage(); g.on('pageerror', e => problems.push(e.message));
      await g.goto(BASE + 'games/snake/'); await sleep(500);
      const gs = await g.evaluate(() => ({ site: document.documentElement.getAttribute('data-site'), bg: getComputedStyle(document.body).backgroundColor }));
      ok(gs.site === 'starry' && gs.bg === 'rgb(16, 20, 43)', w + ': the snake page wears 星夜 too', gs);
      if (w === 390) await g.screenshot({ path: path.join(OUT, 'site-themes-snake.png') });
      await g.goto(BASE + 'games/'); await sleep(300);
      ok(await g.evaluate(() => document.documentElement.getAttribute('data-site') === 'starry'), w + ': and the games directory');
      // back to default
      await p.evaluate(() => { ZZ.Meta.wearSite('default'); ZZ.App.applyLook(); }); await sleep(100);
      ok(!(await p.evaluate(() => document.documentElement.hasAttribute('data-site'))) && await floor() === before, w + ': 預設 brings the old look back');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL crashed', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await browser.close();
  console.log('site theme tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
