'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(process.env.ZZ_URL || ('file://' + path.join(__dirname, '..', 'index.html'))); await sleep(600);
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'r1-menu-reduced.png') });
  await page.tap('[data-go="dojo"]'); await sleep(300);
  await page.tap('[data-act="demo"]'); await sleep(5200);
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'r2-dojo-reduced.png') });
  console.log('reduced motion:', errs.length ? errs.join('; ') : 'no page errors', await page.evaluate(() => ZZ.peek().set.smooth));
  await browser.close();
})();
