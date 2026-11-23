'use strict';
// A name right at the start: asked after the first-visit screen (with a made-up one filled in), once per device, never
// under 13, not when the player already has one, and not on an invite link (the room comes first).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const BASE = process.env.ZZ_URL || 'http://127.0.0.1:8790/index.html?sw=off';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const ctxWith = async (store, consent) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'zh-TW' });
    await ctx.addInitScript(([s, c]) => {
      window.__zzAskName = true; if (c) window.__zzAskConsent = true;
      if (!window.__zzSeeded && s) { for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); }
      window.__zzSeeded = true;
    }, [store, consent]);
    return ctx;
  };
  const sheet = p => p.evaluate(() => ZZ.peek().sheet);
  const adult = { 'zhuanzhuan.consent.v1': { v: 2, at: 1, fonts: false, age: 'adult', region: 'tw', ask: false } };
  try {
    // ---------- the very first visit: the consent screen, then the name ----------
    const ctx = await ctxWith(null, true), page = await ctx.newPage();
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(BASE + '&lang=zh-Hant'); await sleep(900);
    ok(await sheet(page) === 'consent', 'the first visit starts with the consent screen');
    await page.click('[data-region="tw"]'); await page.click('[data-age="adult"]'); await page.click('[data-do="consentMin"]');
    await sleep(600);
    ok(await sheet(page) === 'naming', 'then it asks for a name');
    const first = await page.inputValue('#nmName');
    ok(first.length >= 2 && first.length <= 12 && /取個名字/.test(await page.textContent('#sheetCard')), 'a made-up name is already filled in', first);
    await page.screenshot({ path: path.join(OUT, 'naming.png') });
    let other = first;
    for (let i = 0; i < 6 && other === first; i++) { await page.click('[data-do="nmRoll"]'); other = await page.inputValue('#nmName'); }
    ok(other !== first && await page.evaluate(() => /🎲/.test(document.querySelector('[data-do="nmRoll"]').textContent)), 'the dice rolls another name', [first, other]);
    await page.fill('#nmName', '  '); await page.click('[data-do="nmOk"]'); await sleep(150);
    ok(await sheet(page) === 'naming' && /名字不能空白/.test(await page.textContent('#sheetCard')), 'an empty name is not taken');
    await page.fill('#nmName', '<>'); await page.click('[data-do="nmOk"]'); await sleep(150);
    ok(await sheet(page) === 'naming' && /不能用/.test(await page.textContent('#sheetCard')), 'a name that cannot be used is refused, and the player is told');
    await page.fill('#nmName', '阿明'); await page.press('#nmName', 'Enter'); await sleep(300);
    ok(await page.evaluate(() => ZZ.Meta.data.name === '阿明' && !ZZ.peek().sheet && document.getElementById('mName').textContent === '阿明'), 'Enter takes the name; it is on the menu');
    await page.reload(); await sleep(1800);
    ok(!(await sheet(page)), 'the next visit does not ask again');
    await page.evaluate(() => ZZ.App.openSheet('profile'));
    await page.click('[data-do="pRoll"]'); await sleep(200);
    ok(await page.evaluate(() => ZZ.Meta.data.name !== '阿明' && ZZ.Meta.data.name.length > 1 && document.getElementById('pName').value === ZZ.Meta.data.name), 'the profile has the same dice, and the name it rolls is kept');
    await ctx.close();
    // ---------- consent done before, no name yet: asked on arrival; Esc keeps the name that was showing ----------
    const c2 = await ctxWith(adult), p2 = await c2.newPage();
    p2.on('pageerror', e => problems.push(e.message));
    await p2.goto(BASE + '&lang=en'); await sleep(1800);
    ok(await sheet(p2) === 'naming' && /Pick a name/.test(await p2.textContent('#sheetCard')), 'a player who agreed before is asked on arrival (in their language)');
    const shown = await p2.inputValue('#nmName');
    ok(/^[A-Za-z]+\d{0,2}$/.test(shown) && shown.length <= 12, 'an English made-up name, twelve characters at most', shown);
    await p2.keyboard.press('Escape'); await sleep(300);
    ok(await p2.evaluate(n => ZZ.Meta.data.name === n && !ZZ.peek().sheet, shown), 'closing it keeps the name that was showing', shown);
    await c2.close();
    // ---------- not asked: under 13, a name already, an invite link ----------
    const c3 = await ctxWith({ 'zhuanzhuan.consent.v1': Object.assign({}, adult['zhuanzhuan.consent.v1'], { age: 'u13' }) }), p3 = await c3.newPage();
    await p3.goto(BASE); await sleep(1800);
    ok(!(await sheet(p3)) && !(await p3.evaluate(() => ZZ.Meta.data.name)), 'under 13: no name is asked for (there is no public name)');
    await c3.close();
    const c4 = await ctxWith(Object.assign({ 'zhuanzhuan.meta.v1': { name: '老玩家' } }, adult)), p4 = await c4.newPage();
    await p4.goto(BASE); await sleep(1800);
    ok(!(await sheet(p4)) && (await p4.evaluate(() => ZZ.Meta.data.name)) === '老玩家', 'a player with a name is not asked');
    await c4.close();
    const c5 = await ctxWith(adult), p5 = await c5.newPage();
    await p5.goto(BASE + '&room=ABCDE'); await sleep(1800);
    ok((await sheet(p5)) !== 'naming', 'an invite link goes to the room, not the name');
    await c5.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('naming checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
