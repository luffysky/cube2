'use strict';
// The prize show in a real browser: the wheel, the slot machine (when it pays) and a member's ad reward each open the
// full-screen moment with the coins counting up; a tap closes it; reduced motion keeps only the card.
// Needs the static server on 8790.
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
    await p.evaluate(() => ZZ.App.openSheet('bonus')); await p.waitForTimeout(300);
    await p.click('[data-do="wheelGo"]'); await p.waitForTimeout(4200);
    const w = await p.evaluate(() => { const c = document.getElementById('cele'); return c && { lvl: c.className, n: (document.getElementById('celeN') || {}).textContent || '', text: c.textContent }; });
    ok(w && /拿到|大獎|頭獎/.test(w.text), 'the wheel ends in the prize show', w);
    await p.click('#cele'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !document.getElementById('cele')), 'a tap closes it');
    // the slot machine: pull until it pays (the losing pulls show no prize)
    await p.evaluate(() => { ZZ.Meta.data.coins = 5000; ZZ.App.openSheet('bonus'); });
    let paid = false, lost = false;
    for (let i = 0; i < 8 && !(paid && lost); i++) {
      await p.evaluate(() => { ZZ.Meta.data.daily.slot = 0; ZZ.App.openSheet('bonus'); }); await p.waitForTimeout(150);
      await p.click('[data-do="slotGo"]'); await p.waitForTimeout(2200);
      const r = await p.evaluate(() => ({ cele: !!document.getElementById('cele'), got: ZZ.Meta.data.slot.last.got.length }));
      if (r.got) { paid = true; ok(r.cele, 'a paying pull opens the prize show'); }
      else { lost = true; ok(!r.cele, 'a losing pull does not'); }
      await p.click('#cele').catch(() => {}); await p.waitForTimeout(400);
    }
    // a member's ad reward
    await p.evaluate(() => { ZZ.Meta.subscribe(); ZZ.App.openSheet('bonus'); }); await p.waitForTimeout(200);
    await p.click('[data-do="adFree"]'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => !!document.getElementById('cele') && /\+/.test(document.getElementById('celeN').textContent)), "the member's ad reward gets it too");
    await ctx.close();
    const rc = await b.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const q = await rc.newPage(); q.on('pageerror', e => problems.push(e.message));
    await q.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await q.waitForTimeout(700);
    await q.evaluate(() => ZZ.App.celebrate([{ kind: 'coins', n: 300 }], 3)); await q.waitForTimeout(100);
    ok(await q.evaluate(() => document.getElementById('cele').classList.contains('still') && document.getElementById('celeN').textContent === '+300'), 'with reduced motion: the card at once, nothing flying');
    await rc.close();
  } catch (e) { fail++; console.log('CRASH', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await b.close();
  console.log('prize show checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
