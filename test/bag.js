'use strict';
// The backpack in a real browser: owned items with their counts, a tap takes one into the next battle; looks the
// player can wear, worn from here; the last box opened. Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const ctx = await b.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await p.waitForTimeout(700);
    await p.evaluate(() => ZZ.App.openSheet('bag')); await p.waitForTimeout(200);
    ok(await p.evaluate(() => /還沒有道具/.test(document.getElementById('sheetCard').textContent)), 'an empty backpack says where items come from');
    await p.evaluate(() => { const d = ZZ.Meta.data; d.items[3] = 2; d.items[17] = 1; d.items[44] = 5; const tl = ZZ.Meta.CATALOG.tile.find(x => x.price > 0 && !x.sub && x.rank == null && !x.fest); d.owned.tile.push(tl.id); ZZ.Meta.draw(1); ZZ.App.openSheet('bag'); });
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.querySelectorAll('[data-bagbring]').length >= 3 && /×5/.test(document.getElementById('sheetCard').textContent)), 'every kind of item owned, with counts (the box may have added one)');
    await p.click('[data-bagbring="17"]'); await p.click('[data-bagbring="3"]'); await p.click('[data-bagbring="44"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => JSON.stringify(ZZ.Meta.data.bring) === '[17,3]' && document.querySelectorAll('.bag-it.on').length === 2), 'two picked for the next battle, a third is refused', await p.evaluate(() => ZZ.Meta.data.bring));
    await p.click('[data-bagtab="looks"]'); await p.waitForTimeout(300);
    const key = await p.getAttribute('#sheetCard [data-wear]', 'data-wear');
    await p.click('#sheetCard [data-wear]'); await p.waitForTimeout(200);
    ok(await p.evaluate(k => { const [kind, id] = k.split('|'); return ZZ.Meta.data.equip[kind] === id && ZZ.peek().sheet === 'bag'; }, key), 'a look is worn from the backpack, which stays open', key);
    await p.click('[data-bagtab="boxes"]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !!document.querySelector('#sheetCard .bx') && !!document.querySelector('#sheetCard [data-sheet="boxes"]')), 'the last box opened, and a way to open more');
    ok(await p.evaluate(() => !!document.querySelector('.dr-body [data-sheet="bag"]') && !!document.querySelector('.menu-foot [data-sheet="bag"]')), 'the side menu and the main menu both lead here');
    await ctx.close();
  } catch (e) { fail++; console.log('CRASH', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await b.close();
  console.log('backpack checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
