'use strict';
// The weather mode in a real browser: the setup sheet, a run under each kind of weather (the sky drawn over the board,
// wind and rain shown beside the next pieces, lightning turning a block to cement), and the result at the end.
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
  const inked = () => page.evaluate(() => {
    const c = document.querySelector('.wxcv'); if (!c || c.hidden || !c.width) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++;
    return n;
  });
  try {
    await page.goto(URL); await sleep(600);
    await page.click('[data-go="weather"]'); await sleep(300);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'wxSetup' && document.querySelectorAll('.wxp').length === 6), 'the setup sheet lists changing weather and five kinds');
    await page.screenshot({ path: path.join(OUT, 'wx-setup.png') });
    for (const k of ['rain', 'snow', 'wind', 'fog', 'storm']) {
      await page.evaluate(() => { if (ZZ.peek().S) ZZ.App.toMenu(); });
      await sleep(100);
      if (!(await page.evaluate(() => ZZ.peek().sheet === 'wxSetup'))) { await page.click('[data-go="weather"]'); await sleep(250); }
      await page.click('[data-wxonly="' + k + '"]'); await sleep(120);
      await page.click('[data-do="wxGo"]'); await sleep(2600);
      const st = await page.evaluate(() => { const S = ZZ.peek().S; return { kind: S.kind, wx: S.wx.kind, state: S.state, info: (document.getElementById('wxInfo') || {}).textContent || '', now: (document.getElementById('wxNow') || {}).textContent || '' }; });
      ok(st.kind === 'weather' && st.wx === k && st.state === 'play', k + ': the run starts', st);
      ok(/風速/.test(st.info) && /雨量/.test(st.info), k + ': wind and rain shown by the next pieces', st.info);
      if (k === 'storm') {
        await page.evaluate(() => { const S = ZZ.peek().S; for (let x = 0; x < 10; x++) S.me.grid[ZZ.ROWS - 1][x] = x === 4 ? 0 : 3; S.wx.boltAt = 0; });
        await sleep(200);
        ok(await page.evaluate(() => ZZ.peek().S.me.grid.some(r => Array.from(r).some(c => c === ZZ.GARBAGE))), 'storm: lightning leaves cement');
      }
      if (k === 'snow') { await page.evaluate(() => { const S = ZZ.peek().S; S.wx.driftAcc = 1e9; }); await sleep(200); ok(await page.evaluate(() => ZZ.peek().S.me.grid.some(r => Array.from(r).some(c => c === ZZ.SNOW))), 'snow settles'); }
      await sleep(400);
      ok((await inked()) > 30, k + ': the sky is drawn over the board', await inked());
      await page.screenshot({ path: path.join(OUT, 'wx-' + k + '.png') });
    }
    // a changing-weather run to the end
    await page.evaluate(() => ZZ.App.toMenu()); await sleep(100);
    await page.click('[data-go="weather"]'); await sleep(250);
    await page.click('[data-wxonly=""]'); await sleep(100);
    await page.click('[data-do="wxGo"]'); await sleep(2400);
    ok(await page.evaluate(() => ZZ.peek().S.wx.kind === 'clear' && !ZZ.peek().S.wx.only), 'a mixed run starts calm');
    const c0 = await page.evaluate(() => ZZ.Meta.data.coins);
    await page.evaluate(() => { const S = ZZ.peek().S; S.time = 65000; S.me.stats.lines = 12; S.me.topOut('block'); });
    await sleep(1500);
    const end = await page.evaluate(() => ({ sheet: ZZ.peek().sheet, text: document.getElementById('sheetCard').textContent, coins: ZZ.Meta.data.coins, best: ZZ.Meta.data.lv.wx }));
    ok(end.sheet === 'wxOver' && /撐了 1:05/.test(end.text) && end.coins === c0 + 3 + 3 && end.best > 0, 'the result: time, coins and a best score', end);
    await page.screenshot({ path: path.join(OUT, 'wx-over.png') });
    await page.click('[data-do="again"]'); await sleep(400);
    ok(await page.evaluate(() => ZZ.peek().S && ZZ.peek().S.kind === 'weather'), 'go again starts a new run');
    await page.evaluate(() => ZZ.App.toMenu()); await sleep(300);
    ok(await page.evaluate(() => document.querySelector('.wxcv').hidden), 'the sky goes away at the menu');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('weather checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
