'use strict';
// Touch layout: nothing sits between the move keys and the rotate keys; hold and the half turn are beside the wall
// above the rotate keys, the item key is on the other side, and both side columns stay as tall as the wall.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } }

const measure = () => {
  const r = id => { const e = typeof id === 'string' ? document.querySelector(id) : id; if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const k = n => r('.key[data-k="' + n + '"]');
  const p = ZZ.peek();
  return {
    W: innerWidth, H: innerHeight, well: r('#wellWrap'), colL: r('#colL'), colR: r('#colR'), pad: r('#pad'), pause: r('#pauseBtn'), next: r('#nextBox'), holdBox: r('#holdBox'), itemBox: r('#itemBox'),
    opp: r('#oppMini'), chips: r('#chips'), L: k('L'), R: k('R'), CW: k('CW'), CCW: k('CCW'), D: k('D'), HD: k('HD'), HOLD: k('HOLD'), ITEM: k('ITEM'), HALF: k('180'),
    mid: !!document.querySelector('#pad .mid'), padKeys: document.querySelectorAll('#pad .key').length, cell: p.V.me.cell,
    nextH: r('#nextCv') ? r('#nextCv').h : 0, lastL: (() => { const c = [...document.getElementById('colL').children].filter(e => !e.hidden && e.getClientRects().length); const e = c[c.length - 1]; return e ? Math.round(e.getBoundingClientRect().bottom) : 0; })(),
    lastR: (() => { const c = [...document.getElementById('colR').children].filter(e => !e.hidden && e.getClientRects().length); const e = c[c.length - 1]; return e ? Math.round(e.getBoundingClientRect().bottom) : 0; })()
  };
};
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const sizes = [[414, 720], [360, 640], [390, 660], [320, 568], [390, 844], [768, 1024], [1024, 768]];
  const modes = {
    practice: 'ZZ.App.begin("practice")',
    battle: 'ZZ.App.begin("battle", { mode: "ai", level: 1, minutes: 2, items: true })',
    dojo: 'ZZ.App.begin("dojo", { drill: 0 })',
    lesson: 'ZZ.App.begin("lesson", { lesson: 0 })',
    sprint: 'ZZ.App.begin("sprint")'
  };
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-TW' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(URL); await sleep(400);
    for (const [mode, start] of Object.entries(modes)) {
      for (const variant of ['', 'swap', 'half']) {
        if (variant && !(mode === 'battle' || mode === 'practice')) continue;
        await page.evaluate(v => { const p = ZZ.peek(); p.set.swap = v === 'swap'; p.set.half = v === 'half'; ZZ.App.applySettings(); }, variant);
        await page.evaluate(start); await sleep(mode === 'battle' ? 3600 : 500);
        if (mode === 'battle') { await page.evaluate(() => { const g = ZZ.peek().S.me; g.inv = [1, 3, 6]; }); await sleep(120); }
        const tag = w + 'x' + h + ' ' + mode + (variant ? '+' + variant : '');
        if (await page.evaluate(() => !document.getElementById('rotate').hidden)) { console.log(tag, 'asks for portrait'); await page.evaluate(() => ZZ.App.toMenu()); continue; }
        const m = await page.evaluate(measure);
        await page.screenshot({ path: path.join(OUT, 'pad-' + w + 'x' + h + '-' + mode + (variant ? '-' + variant : '') + '.png') });
        const spinSide = variant === 'swap' ? m.colL : m.colR, moveSide = variant === 'swap' ? m.colR : m.colL;
        ok(!m.mid && m.padKeys === 6, tag + ': pad holds only the six move and rotate keys', m.padKeys);
        const left = variant === 'swap' ? [m.CCW, m.CW] : [m.L, m.R], right = variant === 'swap' ? [m.L, m.R] : [m.CCW, m.CW];
        ok(right[0].l - left[1].r >= 18, tag + ': a clear gap between the two hands', right[0].l - left[1].r);
        ok(m.L.w >= Math.floor((Math.min(m.W, 620) - 24 - 46) / 4) - 1, tag + ': move keys use the freed width', m.L.w);
        const holdOff = mode === 'dojo' || mode === 'lesson';
        ok(!!m.HOLD === !holdOff, tag + ': hold key ' + (holdOff ? 'hidden' : 'shown'));
        if (m.HOLD) {
          ok(m.HOLD.l >= spinSide.l - 1 && m.HOLD.r <= spinSide.r + 1, tag + ': hold key is in the side column above the rotate keys', m.HOLD);
          ok(Math.abs(m.HOLD.b - m.well.b) <= 2, tag + ': hold key sits at the foot of the column', [m.HOLD.b, m.well.b]);
          ok(m.HOLD.h >= (h < 600 ? 34 : 44) && m.HOLD.w >= 50, tag + ': hold key is big enough to hit', [m.HOLD.w, m.HOLD.h]);
          ok(!hit(m.HOLD, m.pause) && !hit(m.HOLD, m.next) && !hit(m.HOLD, m.pad) && !hit(m.HOLD, m.opp) && !hit(m.HOLD, m.holdBox), tag + ': hold key overlaps nothing');
        }
        ok(!!m.HALF === (variant === 'half'), tag + ': half-turn key follows its setting');
        if (m.HALF) ok(m.HALF.b <= m.HOLD.t - 6 && m.HALF.l === m.HOLD.l && !hit(m.HALF, m.pause) && !hit(m.HALF, m.next), tag + ': half-turn key is right above hold', [m.HALF, m.pause, m.next]);
        ok(!!m.ITEM === (mode === 'battle'), tag + ': item key only where items exist');
        if (m.ITEM) {
          ok(m.ITEM.l >= moveSide.l - 1 && m.ITEM.r <= moveSide.r + 1 && Math.abs(m.ITEM.b - m.well.b) <= 2, tag + ': item key is at the foot of the other column', m.ITEM);
          ok(!m.itemBox, tag + ': the item box at the top is not shown on a touch screen');
          ok(!hit(m.ITEM, m.opp) && !hit(m.ITEM, m.holdBox) && !hit(m.ITEM, m.pause) && !hit(m.ITEM, m.next), tag + ': item key overlaps nothing', [m.ITEM, m.opp, m.chips]);
          ok(await page.evaluate(() => document.querySelectorAll('#itemKey .itile').length === 3 && !!document.querySelector('#itemKey .itile svg')), tag + ': item key shows the bag');
          const tiles = await page.evaluate(() => { const k = document.getElementById('itemKey').getBoundingClientRect(); return [...document.querySelectorAll('#itemKey .itile')].every(e => { const b = e.getBoundingClientRect(); return b.top >= k.top && b.bottom <= k.bottom - 4 && b.left >= k.left && b.right <= k.right; }); });
          ok(tiles, tag + ': the bag is drawn inside the key');
        }
        ok(m.lastL <= m.well.b + 2 && m.lastR <= m.well.b + 2, tag + ': side columns end with the wall', [m.lastL, m.lastR, m.well.b]);
        ok(m.next.b <= (m.pause ? m.pause.t : m.well.b) && m.nextH >= 40, tag + ': the queue of coming pieces fits', [m.next, m.nextH]);
        ok(m.pad.b <= m.H + 1 && m.colR.r <= m.W + 1 && m.colL.l >= -1, tag + ': everything is on screen');
        // the keys do what they say
        if (m.HOLD && mode !== 'battle') {
          await page.evaluate(() => { const S = ZZ.peek().S; if (S.state !== 'play') S.state = 'play'; if (!S.me.cur) S.me.start(); });
          const before = await page.evaluate(() => ZZ.peek().S.me.holdType || '');
          await page.tap('#holdKey'); await sleep(60);
          const after = await page.evaluate(() => ZZ.peek().S.me.holdType || '');
          ok(!before && !!after, tag + ': tapping the hold key holds the piece', [before, after]);
        }
        if (m.ITEM) {
          await page.tap('#itemKey'); await sleep(80);
          ok(await page.evaluate(() => ZZ.peek().S.me.inv.length === 2), tag + ': tapping the item key uses an item');
        }
        if (m.HALF && mode === 'practice') {
          const r0 = await page.evaluate(() => ZZ.peek().S.me.cur.rot);
          await page.tap('#halfKey'); await sleep(60);
          const r1 = await page.evaluate(() => ZZ.peek().S.me.cur.rot);
          ok((r0 + 2) % 4 === r1 || r0 === r1, tag + ': the half-turn key turns the piece around', [r0, r1]);
        }
        await page.evaluate(() => ZZ.App.toMenu()); await sleep(80);
      }
    }
    ok(!errs.length, w + 'x' + h + ': no page errors', errs);
    await ctx.close();
  }
  // a mouse-only screen keeps the item box and shows no touch keys
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' });
  const page = await ctx.newPage();
  await page.goto(URL); await sleep(300);
  await page.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 1, minutes: 2, items: true })); await sleep(600);
  const d = await page.evaluate(measure);
  ok(!d.HOLD && !d.ITEM && !d.pad && !!d.itemBox, 'mouse screen: no touch keys, item box stays', [d.HOLD, d.ITEM, d.pad, d.itemBox]);
  ok(d.lastL <= d.well.b + 2 && d.lastR <= d.well.b + 2 && d.nextH >= 100, 'mouse screen: columns fit', [d.lastL, d.lastR, d.well.b, d.nextH]);
  await page.screenshot({ path: path.join(OUT, 'pad-1280x800-battle.png') });
  await ctx.close();
  await browser.close();
  console.log('pad tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
