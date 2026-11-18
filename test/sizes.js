'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const sizes = [[360, 640, true], [390, 660, true], [414, 896, true], [320, 568, true], [768, 1024, true], [1024, 768, true], [780, 360, true], [1440, 900, false], [1000, 700, false], [700, 900, false]];
  for (const [w, h, touch] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, locale: 'zh-TW' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(URL); await sleep(300);
    const out = [];
    for (const mode of ['battle', 'dojo']) {
      if (mode === 'battle') { await page.click('[data-go="battle"]'); await page.click('[data-do="fight"]'); }
      else await page.click('[data-go="dojo"]');
      await sleep(350);
      const m = await page.evaluate(() => {
        const r = id => { const e = document.getElementById(id); return e && !e.hidden ? e.getBoundingClientRect() : null; };
        const pad = r('pad'), stage = r('stage'), well = r('wellWrap'), hud = r('hud'), colR = r('colR'), colL = r('colL');
        const p = ZZ.peek();
        return { cell: p.V.me.cell, padH: pad ? Math.round(pad.height) : 0, bottom: Math.round((pad || stage).bottom), wellBottom: Math.round(well.bottom), colRBottom: Math.round(colR.bottom), colLBottom: Math.round(colL.bottom),
          left: Math.round(Math.min(colL.left, well.left)), right: Math.round(colR.right), H: innerHeight, W: innerWidth };
      });
      const flags = [];
      if (m.bottom > m.H + 1) flags.push('OVERFLOW-BOTTOM');
      if (m.right > m.W + 1 || m.left < -1) flags.push('OVERFLOW-SIDE');
      if (m.colRBottom > m.wellBottom + 2) flags.push('RIGHT-COL-TALLER');
      if (m.colLBottom > m.wellBottom + 2) flags.push('LEFT-COL-TALLER');
      out.push(mode + ' cell=' + m.cell + ' pad=' + m.padH + ' bottom=' + m.bottom + '/' + m.H + (flags.length ? ' ' + flags.join(',') : ''));
      await page.screenshot({ path: path.join(OUT, 's-' + w + 'x' + h + '-' + mode + '.png') });
      if (await page.evaluate(() => !document.getElementById('rotate').hidden)) { out[out.length - 1] = mode + ' asks for portrait'; await page.reload(); await sleep(300); continue; }
      await page.evaluate(() => document.getElementById('pauseBtn').click()); await sleep(80);
      await page.click('[data-do="menu"]'); await sleep(80);
    }
    console.log((w + 'x' + h + (touch ? ' touch' : ' mouse')).padEnd(18), out.join(' | '), errs.length ? 'ERR ' + errs.join(';') : '');
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
