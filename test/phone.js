'use strict';
// Phone-sized screenshots of the new screens.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = (process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html') + '?net=bc&code=PHONE';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: process.env.ZZ_LOCALE || 'zh-TW' });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.goto(URL); await sleep(700);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  const ev = expr => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;var M=ZZ.Meta;' + expr + '})()');
  await page.tap('[data-go="rank"]'); await sleep(250);
  await page.tap('[data-do="rankGo"]'); await sleep(3200);
  for (let i = 0; i < 6; i++) { await page.tap('.key[data-k="' + ['L', 'R', 'CW', 'L', 'R', 'CCW'][i] + '"]'); await page.tap('.key[data-k="HD"]'); await sleep(150); }
  await shot('p_rank_play');
  await ev('S.opp.topOut("lock"); S.left = 400; return 1'); await sleep(2000);
  await shot('p_rank_end');
  await page.evaluate(() => { document.getElementById('sheetCard').scrollTop = 600; }); await sleep(150);
  await shot('p_rank_end2');
  await page.tap('[data-do="menu"]'); await sleep(300);
  await page.evaluate(() => ZZ.App.begin('lesson', { lesson: 2 })); await sleep(700);
  await shot('p_lesson_dt');
  await page.evaluate(() => ZZ.App.toMenu()); await sleep(200);
  await page.tap('[data-go="online"]'); await sleep(200);
  await page.tap('[data-do="netOpen"]'); await sleep(500);
  await shot('p_online_wait');
  await page.evaluate(() => { ZZ.Net.leave(); ZZ.App.closeSheet(true); });
  await page.evaluate(() => { ZZ.Meta.data.coins = 9000; ZZ.Meta.buySet('market'); ZZ.Meta.equipSet('market'); ZZ.App.applyLook(); ZZ.App.begin('battle', { mode: 'ai', level: 3, minutes: 2, items: true }); });
  await sleep(9000);
  await shot('p_market_play');
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'no page errors');
})();
