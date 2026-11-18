'use strict';
// Quick look at the new build: loads the page at phone and desktop sizes, opens every sheet, saves screenshots.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  async function open(name, opts, q) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(URL + (q || ''));
    await sleep(700);
    return { ctx, page };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const want = (process.argv[2] || 'all');
  {
    const { ctx, page } = await open('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-TW' });
    await shot(page, 's_menu');
    for (const sh of ['shop', 'jobs', 'settings', 'help', 'profile']) {
      await page.evaluate(n => ZZ.App.openSheet(n), sh); await sleep(350);
      await shot(page, 's_' + sh);
      await page.evaluate(() => ZZ.App.closeSheet(true));
    }
    for (const tab of ['tile', 'bg', 'theme', 'fx', 'items', 'member']) {
      await page.evaluate(() => ZZ.App.openSheet('shop')); await sleep(100);
      await page.click('[data-tab="' + tab + '"]'); await sleep(350);
      await shot(page, 's_shop_' + tab);
    }
    await page.evaluate(() => ZZ.App.closeSheet(true));
    for (const go of ['rank', 'battle', 'online', 'ghost', 'openers']) {
      await page.click('[data-go="' + go + '"]'); await sleep(350);
      await shot(page, 's_go_' + go);
      await page.evaluate(() => ZZ.App.closeSheet(true));
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open('desk', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US' });
    await shot(page, 's_desk_menu_en');
    await page.evaluate(() => ZZ.App.openSheet('keys')); await sleep(300);
    await shot(page, 's_desk_keys');
    await page.evaluate(() => ZZ.App.closeSheet(true));
    await page.click('[data-go="rank"]'); await sleep(300);
    await page.click('[data-do="rankGo"]'); await sleep(4500);
    await shot(page, 's_desk_rank_play');
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'no page errors');
})();
