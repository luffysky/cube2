'use strict';
// The menu, a sheet and a match on many screen sizes: nothing may run off the screen, the layout must be the one meant
// for that size, and the tiles must grow with the screen. Also saves a picture of each (shots/rwd-<what>-<screen>.png)
// for looking at the breakpoints. Needs the static server on 8765 (python3 -m http.server 8765).
//   node test/rwd.js            every screen
//   node test/rwd.js p320,d1920 only these
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html?sw=off';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
// name, width, height, touch, menu layout expected ('one' column, 'two' panes), smallest tile expected in a match (0: asks to turn the phone)
const SIZES = [
  ['p320', 320, 568, 1, 'one', 13], ['p360', 360, 740, 1, 'one', 16], ['p390', 390, 844, 1, 'one', 19], ['p430', 430, 932, 1, 'one', 22],
  ['land844', 844, 390, 1, 'two', 0], ['land932', 932, 430, 1, 'two', 0],
  ['t600', 600, 960, 1, 'one', 28], ['t768', 768, 1024, 1, 'one', 30], ['t820', 820, 1180, 1, 'one', 38], ['t1024l', 1024, 768, 1, 'two', 22], ['t1180l', 1180, 820, 1, 'two', 24], ['t1366l', 1366, 1024, 1, 'two', 30],
  ['d1000', 1000, 700, 0, 'one', 26], ['d1280', 1280, 720, 0, 'two', 27], ['d1366', 1366, 768, 0, 'two', 29], ['d1440', 1440, 900, 0, 'two', 35], ['d1920', 1920, 1080, 0, 'two', 42], ['d2560', 2560, 1440, 0, 'two', 56], ['d3440', 3440, 1440, 0, 'two', 56]
];
const only = (process.argv[2] || '').split(',').filter(Boolean);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  let lastCell = {};
  for (const [name, w, h, touch, cols, minCell] of SIZES) {
    if (only.length && only.indexOf(name) < 0) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !!touch, isMobile: !!touch, locale: 'zh-TW' });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' ' + e.message));
    await page.goto(URL); await sleep(500);
    // ---- menu ----
    const m = await page.evaluate(() => {
      const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const q = s => document.querySelector(s);
      const hero = r(q('.hero')), modes = r(q('.menu-in > .modes:not(.two)')), menu = q('#menu');
      const out = [...document.querySelectorAll('.menu-in *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1); }).map(e => e.className || e.tagName).slice(0, 5);
      const clipped = [...document.querySelectorAll('.mode b, .mode span, .link, .lede, .about')].filter(e => !e.children.length && e.scrollWidth > e.clientWidth + 2).map(e => e.textContent.slice(0, 12)).slice(0, 5);
      return { hero, modes, side: modes.l >= hero.r - 2, scrollX: document.documentElement.scrollWidth > innerWidth + 1, out, clipped,
        canScroll: menu.scrollHeight > menu.clientHeight + 2, fits: menu.scrollHeight <= menu.clientHeight + 2, well: r(q('#demoCv')), logo: parseFloat(getComputedStyle(q('.logo')).fontSize) };
    });
    ok(!m.scrollX && !m.out.length, name + ': the menu stays inside the screen', m.out);
    ok(!m.clipped.length, name + ': no menu text is cut off', m.clipped);
    ok((cols === 'two') === m.side, name + ': the menu is laid out in ' + cols + (cols === 'two' ? ' panes' : ' column'), [m.hero, m.modes]);
    ok(m.well.w >= 80 && m.well.r <= w + 1 && m.logo >= 36, name + ': the little wall and the name are there', [m.well, m.logo]);
    if (cols === 'two' && h >= 700) ok(m.fits, name + ': the whole menu is on one screen');
    await page.screenshot({ path: path.join(OUT, 'rwd-menu-' + name + '.png') });
    // ---- a sheet ----
    await page.evaluate(() => document.querySelector('[data-go="battle"]').click()); await sleep(250);
    const s = await page.evaluate(() => {
      const c = document.getElementById('sheetCard').getBoundingClientRect(), sh = document.getElementById('sheet').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#sheetCard *')].filter(e => e.getBoundingClientRect().right > c.right + 1).length;
      return { l: c.left, r: c.right, t: c.top, b: c.bottom, w: c.width, cover: sh.left <= 0 && sh.right >= innerWidth && sh.top <= 0 && sh.bottom >= innerHeight, wide, levels: document.querySelectorAll('#sheetCard .lvl').length };
    });
    ok(s.l >= -1 && s.r <= w + 1 && s.t >= -1 && s.b <= h + 1 && !s.wide, name + ': the sheet stays inside the screen', s);
    ok(s.cover, name + ': the dimmed backdrop covers the whole screen');
    ok(s.levels === 7, name + ': seven rivals to pick from', s.levels);
    await page.screenshot({ path: path.join(OUT, 'rwd-sheet-' + name + '.png') });
    // ---- a match ----
    await page.evaluate(() => document.querySelector('[data-do="fight"]').click()); await sleep(4200);
    const p = await page.evaluate(() => {
      const r = id => { const e = document.getElementById(id); if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const g = ZZ.peek(), keys = [...document.querySelectorAll('#pad .key')].map(k => k.getBoundingClientRect()).filter(b => b.width > 0);
      return { cell: g.V.me.cell, rot: !document.getElementById('rotate').hidden, well: r('wellWrap'), colL: r('colL'), colR: r('colR'), pad: r('pad'), hud: r('hud'), opp: r('oppWide'),
        keyMin: keys.length ? Math.min.apply(null, keys.map(b => Math.min(b.width, b.height))) : 0, keyOut: keys.filter(b => b.left < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1).length, state: g.S && g.S.state };
    });
    if (!minCell) ok(p.rot, name + ': a phone held sideways is asked to turn', p.cell);
    else {
      const left = Math.min(p.colL.l, p.opp ? p.opp.l : 9999), bottom = Math.max(p.well.b, p.pad ? p.pad.b : 0);
      ok(!p.rot && p.state === 'play', name + ': the match runs', p.state);
      ok(left >= -1 && p.colR.r <= w + 1 && bottom <= h + 1 && p.hud.t >= -1, name + ': the match stays inside the screen', { left, right: p.colR.r, bottom });
      ok(p.cell >= minCell, name + ': tiles of at least ' + minCell + ' px', p.cell);
      ok(p.well.h >= h * (touch ? 0.5 : 0.82) || p.cell >= 34, name + ': the wall uses the height it has', [p.well.h, h]);
      if (touch) ok(p.pad && p.keyMin >= 40 && !p.keyOut, name + ': touch keys are big enough and on screen', [p.keyMin, p.keyOut]);
      else ok(!p.pad, name + ': no touch keys with a mouse');
      lastCell[name] = p.cell;
    }
    await page.screenshot({ path: path.join(OUT, 'rwd-play-' + name + '.png') });
    console.log(name.padEnd(8), (w + 'x' + h).padEnd(10), 'menu:', cols, '| tile', p.cell, '| wall', p.well ? Math.round(p.well.h) : 0, p.rot ? '(asks to turn)' : '');
    await ctx.close();
  }
  if (!only.length) {
    ok(lastCell.d1920 > lastCell.d1440 && lastCell.d2560 > lastCell.d1920, 'bigger desktop screens get bigger tiles', lastCell);
    ok(lastCell.t820 > lastCell.p430 && lastCell.p430 > lastCell.p320, 'and so do bigger phones and tablets', lastCell);
  }
  ok(!problems.length, 'no page errors', problems);
  await browser.close();
  console.log('screen size checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
