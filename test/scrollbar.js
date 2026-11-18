'use strict';
// The menu and the sheets scroll without showing a scrollbar. Runs Chrome with its real scrollbars switched on.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 }, locale: 'zh-TW' })).newPage();
  await page.goto(URL); await sleep(600);
  const gutter = id => page.evaluate(i => { const e = document.getElementById(i); return { gutter: e.offsetWidth - e.clientWidth, canScroll: e.scrollHeight > e.clientHeight }; }, id);
  const menu = await gutter('menu');
  await page.mouse.move(500, 300); await page.mouse.wheel(0, 400); await sleep(300);
  const menuTop = await page.evaluate(() => document.getElementById('menu').scrollTop);
  await page.evaluate(() => { document.getElementById('menu').focus(); ZZ.App.openSheet('help'); }); await sleep(300);
  const sheet = await gutter('sheetCard');
  await page.mouse.move(500, 300); await page.mouse.wheel(0, 500); await sleep(300);
  const sheetTop = await page.evaluate(() => document.getElementById('sheetCard').scrollTop);
  await page.evaluate(() => { ZZ.App.openSheet('shop'); }); await sleep(300);
  const tabs = await page.evaluate(() => { const e = document.querySelector('.tabs'); return e.offsetHeight - e.clientHeight; });
  await browser.close();
  const ok = menu.gutter === 0 && menu.canScroll && menuTop > 0 && sheet.gutter === 0 && sheet.canScroll && sheetTop > 0 && tabs === 0;
  console.log(JSON.stringify({ menu, menuTop, sheet, sheetTop, tabs }));
  console.log(ok ? 'scrollbar check: passed' : 'scrollbar check: FAILED');
  process.exit(ok ? 0 : 1);
})();
