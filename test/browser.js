'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, '..', 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const which = process.argv[2] || 'all';

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  async function open(name, opts) {
    const ctx = await browser.newContext(Object.assign({ locale: 'zh-TW' }, opts));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await sleep(700);
    return { ctx, page };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const peek = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;return ' + expr + ';})()');

  if (which === 'all' || which === 'mobile') {
    const { ctx, page } = await open('mobile', { viewport: { width: 390, height: 760 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const tapKey = async k => { const b = await page.locator('.key[data-k="' + k + '"]').boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
    await sleep(1500);
    await shot(page, 'm1-menu');
    await page.tap('[data-go="battle"]');
    await sleep(200);
    await shot(page, 'm2-battle-sheet');
    await page.tap('[data-level="2"]');
    await page.tap('[data-do="fight"]');
    await sleep(900);
    await shot(page, 'm3-count');
    await sleep(1600);
    const seq = ['CW', 'L', 'L', 'HD', 'R', 'R', 'R', 'HD', 'CCW', 'L', 'HD', 'HOLD', 'R', 'HD', 'CW', 'CW', 'L', 'L', 'L', 'HD', 'R', 'R', 'R', 'R', 'HD', 'HD', 'CW', 'R', 'HD'];
    for (const k of seq) { await tapKey(k); await sleep(60); }
    await sleep(400);
    await shot(page, 'm4-play');
    console.log('mobile battle:', JSON.stringify(await peek(page, '({state:S.state,pieces:S.me.stats.pieces,opp:S.opp.stats.pieces,left:Math.round(S.left),cell:p.V.me.cell,oppCell:p.V.opp.cell,pad:document.getElementById("pad").offsetHeight,stage:document.getElementById("stage").offsetHeight,H:innerHeight})')));
    await sleep(5000);
    await shot(page, 'm5-play-later');
    await page.tap('#pauseBtn');
    await sleep(200);
    await shot(page, 'm6-pause');
    await page.tap('[data-do="settings"]');
    await sleep(200);
    await shot(page, 'm7-settings');
    await page.tap('[data-do="close"]');
    await sleep(100);
    console.log('back to pause sheet:', await peek(page, 'p.sheet'));
    await page.tap('[data-do="resume"]');
    await page.evaluate('ZZ.peek().S.left = 1500');
    await sleep(3000);
    await shot(page, 'm8-result');
    console.log('result sheet:', await peek(page, 'p.sheet'), await peek(page, 'S.result'));
    await page.tap('[data-do="menu"]');
    // dojo
    await page.tap('[data-go="dojo"]');
    await sleep(500);
    await shot(page, 'm9-dojo');
    await page.tap('[data-act="demo"]');
    await sleep(2600);
    await shot(page, 'm10-dojo-demo');
    await sleep(4200);
    console.log('after demo:', JSON.stringify(await peek(page, '({state:S.state,drill:S.drill,dojo:p.save.dojo})')));
    // play drill 1 by touch: turn left, soft drop to the floor, turn left again
    await tapKey('CCW');
    const d = await page.locator('.key[data-k="D"]').boundingBox();
    await page.dispatchEvent('.key[data-k="D"]', 'pointerdown', { pointerId: 5, clientX: d.x + 20, clientY: d.y + 20, bubbles: true });
    await sleep(900);
    await page.dispatchEvent('#pad', 'pointerup', { pointerId: 5, clientX: d.x + 20, clientY: d.y + 20, bubbles: true });
    await tapKey('CCW');
    await sleep(120);
    await shot(page, 'm11-dojo-armed');
    await tapKey('HD');
    await sleep(500);
    await shot(page, 'm12-dojo-win');
    await sleep(1800);
    console.log('after own solve:', JSON.stringify(await peek(page, '({state:S.state,drill:S.drill,dojo:p.save.dojo})')));
    await shot(page, 'm13-dojo-2');
    // practice with radar
    await page.tap('#pauseBtn'); await page.tap('[data-do="menu"]');
    await page.tap('[data-go="practice"]');
    await sleep(300);
    for (const k of ['L', 'L', 'L', 'HD', 'R', 'R', 'HD', 'HD', 'CW', 'R', 'R', 'R', 'R', 'HD']) { await tapKey(k); await sleep(50); }
    await sleep(300);
    await shot(page, 'm14-practice');
    await page.tap('[data-act="undo"]');
    await sleep(200);
    console.log('practice:', JSON.stringify(await peek(page, '({pieces:S.me.stats.pieces,hist:S.hist.length})')));
    await page.tap('#pauseBtn'); await page.tap('[data-do="help"]');
    await sleep(200);
    await shot(page, 'm15-help');
    await ctx.close();
  }

  if (which === 'all' || which === 'desktop') {
    const { ctx, page } = await open('desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await sleep(1200);
    await shot(page, 'd1-menu');
    await page.click('[data-go="battle"]');
    await page.click('[data-level="4"]');
    await page.click('[data-do="fight"]');
    await sleep(2300);
    const keys = ['ArrowUp', 'ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowRight', 'Space', 'KeyZ', 'Space', 'KeyC', 'ArrowRight', 'Space'];
    for (let i = 0; i < 4; i++) for (const k of keys) { await page.keyboard.press(k); await sleep(45); }
    await page.keyboard.down('ArrowLeft'); await sleep(400); await page.keyboard.up('ArrowLeft');
    await sleep(300);
    await shot(page, 'd2-battle');
    await sleep(6000);
    await shot(page, 'd3-battle-later');
    console.log('desktop battle:', JSON.stringify(await peek(page, '({state:S.state,me:S.me.stats.pieces,opp:S.opp.stats.pieces,oppSent:S.opp.stats.sent,ko:S.ko,cell:p.V.me.cell,oppCell:p.V.opp.cell})')));
    await ctx.close();
    const dark = await open('dark', { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    await sleep(1500);
    await shot(dark.page, 'k1-menu-dark');
    await dark.page.tap('[data-go="sprint"]');
    await sleep(2400);
    await shot(dark.page, 'k2-sprint-dark');
    await dark.ctx.close();
  }

  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
