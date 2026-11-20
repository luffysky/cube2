'use strict';
// How to play, before every match, in a real browser: the countdown waits until it is closed; a keyboard shows the
// bound keys and how to use items; a phone describes its keys; "do not show again" sticks; an online match does not
// wait for it. Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    for (const touch of [false, true]) {
      const ctx = await b.newContext({ locale: 'zh-TW', viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(() => { window.__zzHowto = 1; });
      const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
      await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await p.waitForTimeout(700);
      const name = touch ? 'phone' : 'keyboard';
      await p.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 0, minutes: 2, items: true }));
      await p.waitForTimeout(2500);
      const s = await p.evaluate(() => ({ sheet: ZZ.peek().sheet, state: ZZ.peek().S.state, text: document.getElementById('sheetCard').textContent, kbd: document.querySelectorAll('#sheetCard kbd').length }));
      ok(s.sheet === 'howto' && s.state === 'howto', name + ': how to play shows and the countdown waits', s);
      ok(/道具怎麼用/.test(s.text) && (touch ? /「道具」/.test(s.text) && /左手管移動/.test(s.text) : s.kbd >= 8 && /Space|空白/.test(s.text)), name + ': the keys for this device, and how to use items', s.text.slice(0, 200));
      await p.click('[data-do="close"]'); await p.waitForTimeout(2600);
      ok(await p.evaluate(() => ZZ.peek().S.state === 'play'), name + ': closing it starts the countdown, then the match');
      await p.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 0, minutes: 2 })); await p.waitForTimeout(300);
      ok(await p.evaluate(() => ZZ.peek().sheet === 'howto' && !/道具怎麼用/.test(document.getElementById('sheetCard').textContent)), name + ': it shows again next match; no item part without items');
      await p.check('#htOff'); await p.click('[data-do="close"]'); await p.waitForTimeout(200);
      await p.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 0, minutes: 2 })); await p.waitForTimeout(300);
      ok(await p.evaluate(() => !ZZ.peek().sheet && ZZ.peek().S.state === 'count'), name + ': "do not show" sticks');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('CRASH', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await b.close();
  console.log('how-to checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
