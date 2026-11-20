'use strict';
// One-handed keys and a phone held sideways, in a real browser: with "one hand (right)" every key, hold and item
// included, sits on the right (left for the left hand); held sideways they sit beside the wall, never on it.
// Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    for (const [w, h, hand] of [[390, 844, 'R'], [390, 844, 'L'], [844, 390, 'R'], [844, 390, 'L'], [844, 390, 'two']]) {
      const ctx = await b.newContext({ locale: 'zh-TW', viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
      await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await p.waitForTimeout(700);
      await p.evaluate(() => ZZ.App.openSheet('settings')); await p.waitForTimeout(200);
      await p.click('[data-hand="' + hand + '"]'); await p.waitForTimeout(200);
      await p.evaluate(() => ZZ.App.closeSheet());
      await p.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 2, minutes: 2, items: true })); await p.waitForTimeout(3600);
      const r = await p.evaluate(() => {
        const R = e => e.getBoundingClientRect(), well = R(document.getElementById('wellWrap'));
        const keys = [...document.querySelectorAll('#pad .key, .side .key')].filter(k => k.offsetParent).map(k => ({ k: k.dataset.k || k.id, b: R(k) }));
        return { mid: well.left + well.width / 2, keys: keys.map(x => ({ k: x.k, l: x.b.left, r: x.b.right })), over: keys.filter(x => ['L', 'R', 'D', 'HD', 'CW', 'CCW'].includes(x.k) && !(x.b.right <= well.left || x.b.left >= well.right || x.b.bottom <= well.top || x.b.top >= well.bottom)).length, state: ZZ.peek().S.state, rot: !document.getElementById('rotate').hidden };
      });
      const name = w + 'x' + h + ' ' + hand;
      ok(r.state === 'play' && !r.rot, name + ': the match plays (no "turn your phone")');
      if (hand === 'R') ok(r.keys.every(k => k.l > w * 0.15), name + ': the keys are on the right', r.keys);
      if (hand === 'L') ok(r.keys.every(k => k.r < w * 0.85), name + ': the keys are on the left', r.keys);
      if (w > h) ok(r.over === 0, name + ': sideways, no key covers the wall');
      if (w > h && hand !== 'two') ok(r.keys.filter(k => ['L', 'R', 'D', 'HD', 'CW', 'CCW'].includes(k.k)).every(k => hand === 'R' ? k.l > r.mid : k.r < r.mid), name + ': all six on that side of the wall');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('CRASH', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await b.close();
  console.log('one-hand and sideways checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
