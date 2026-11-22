'use strict';
// The sound engine comes back on its own: after the tab was hidden, after the browser stopped it (Safari's
// 'interrupted' is played by a suspend here), and after the browser closed the context altogether. Needs the static
// server on 8790 (tools/dev-server.js), like test/music.js.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 400, height: 800 } });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    await p.goto(BASE + 'index.html?sw=off&cloud=off&lang=zh-Hant'); await sleep(1200);
    const state = () => p.evaluate(() => ZZ.App.sfx.ac ? ZZ.App.sfx.ac.state : 'none');
    await p.mouse.click(200, 400); await sleep(300);
    ok(await state() === 'running', 'a first tap starts the sound', await state());
    // the browser stops it by itself while the page is in view (as Safari does on a call or another app's audio)
    await p.evaluate(() => ZZ.App.sfx.ac.suspend()); await sleep(200);
    for (let i = 0; i < 20 && await state() !== 'running'; i++) await sleep(100);
    ok(await state() === 'running', 'stopped by the browser while in view: it starts again by itself', await state());
    await p.evaluate(() => { ZZ.App.sfx.ac.onstatechange = null; return ZZ.App.sfx.ac.suspend(); }); await sleep(200);
    ok(await state() === 'suspended', '(stopped, and not starting by itself this time)');
    await p.touchscreen.tap(200, 400); await sleep(300);
    ok(await state() === 'running', 'a tap on a touch screen starts it again', await state());
    // the browser closed the context altogether: a new one is made on the next tap
    const first = await p.evaluate(() => { window.__oldAc = ZZ.App.sfx.ac; return ZZ.App.sfx.ac.close().then(() => ZZ.App.sfx.ac.state); });
    ok(first === 'closed', '(closed)');
    await p.mouse.click(200, 400); await sleep(400);
    ok(await p.evaluate(() => ZZ.App.sfx.ac !== window.__oldAc) && await state() === 'running', 'after the browser closed it, the next tap makes a new one that runs', await state());
    for (let i = 0; i < 30 && !(await p.evaluate(() => Object.keys(ZZ.App.sfx.buf).length > 3)); i++) await sleep(100);
    ok(await p.evaluate(() => Object.keys(ZZ.App.sfx.buf).length > 3), 'and the recorded sounds are decoded again for it');
    // hidden and back
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    ok(await state() === 'suspended', 'hidden: quiet');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    for (let i = 0; i < 20 && await state() !== 'running'; i++) await sleep(100);
    ok(await state() === 'running', 'back in view: sound again', await state());
    // a key also wakes it
    await p.evaluate(() => ZZ.App.sfx.ac.suspend()); await p.evaluate(() => { ZZ.App.sfx.ac.onstatechange = null; });
    await p.keyboard.press('Shift'); await sleep(300);
    ok(await state() === 'running', 'a key press starts it again', await state());
    await ctx.close();
  } catch (e) { fail++; console.log('CRASH', e); }
  ok(problems.length === 0, 'no page errors', problems);
  await browser.close();
  console.log('sound checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
