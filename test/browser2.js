'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || ('file://' + path.join(__dirname, '..', 'index.html'));
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  async function open(name, opts) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await sleep(500);
    return { ctx, page };
  }
  const ev = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;' + expr + '})()');

  // ---------- touch ----------
  {
    const { ctx, page } = await open('touch', { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.tap('[data-go="practice"]');
    await sleep(300);
    const box = async k => { const b = await page.locator('.key[data-k="' + k + '"]').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const L = await box('L'), R = await box('R'), D = await box('D'), HD = await box('HD');
    const fire = (type, pt, id) => page.evaluate(([t, x, y, i]) => {
      const target = t === 'pointerdown' ? document.elementFromPoint(x, y) : document.getElementById('pad');
      target.dispatchEvent(new PointerEvent(t, { pointerId: i, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
    }, [type, pt.x, pt.y, id]);
    const x0 = await ev(page, 'return S.me.cur.x');
    await fire('pointerdown', L, 11);
    ok(await ev(page, 'return S.me.cur.x') === x0 - 1, 'tap left moves one cell');
    ok(await page.evaluate(() => document.querySelector('.key[data-k="L"]').classList.contains('on')), 'left key shows pressed');
    await fire('pointermove', R, 11);
    ok(await ev(page, 'return S.me.cur.x') === x0, 'sliding onto right moves back');
    ok(await page.evaluate(() => !document.querySelector('.key[data-k="L"]').classList.contains('on') && document.querySelector('.key[data-k="R"]').classList.contains('on')), 'slide swaps pressed key');
    await sleep(520);
    const atWall = await ev(page, 'var c=S.me.cur; return !S.me.fits(c.type,c.rot,c.x+1,c.y)');
    ok(atWall, 'holding right auto-shifts to the wall');
    const piecesBefore = await ev(page, 'return S.me.stats.pieces');
    await fire('pointermove', HD, 11);
    await sleep(60);
    ok(await ev(page, 'return S.me.stats.pieces') === piecesBefore, 'sliding onto hard drop does not drop');
    await fire('pointerup', HD, 11);
    ok(await page.evaluate(() => !document.querySelector('.key.on')), 'no key left pressed after release');
    // two thumbs: hold soft drop and tap a turn
    await fire('pointerdown', D, 21);
    await sleep(480);
    ok(await ev(page, 'return S.me.grounded()'), 'holding soft drop reaches the floor');
    await fire('pointerup', D, 21);
    await page.tap('#holdBox');
    await sleep(80);
    ok(await ev(page, 'return !!S.me.holdType'), 'tapping the hold slot holds');
    // radar picks up a ready slot
    await ev(page, "S.me.reset(); S.me.setBoard(['.....XX...','XXX...XXXX','XXXX.XXXXX']); S.me.queue.unshift('T'); S.me.start();");
    await sleep(120);
    const tg = await ev(page, 'return S.target ? {label:S.target.label, strong:S.target.strong, n:S.target.cells.length} : null');
    ok(tg && tg.label === 'T 轉雙消' && tg.strong === true && tg.n === 4, 'radar marks the T-spin double slot', tg);
    await page.screenshot({ path: path.join(OUT, 't1-radar.png') });
    // do the spin with touch keys
    await page.tap('.key[data-k="CCW"]');
    await fire('pointerdown', D, 31); await sleep(480); await fire('pointerup', D, 31);
    await page.tap('.key[data-k="CCW"]');
    await sleep(40);
    ok(await ev(page, 'return S.me.spinState()') === 'full', 'T is armed after the turn');
    await page.tap('.key[data-k="HD"]');
    await sleep(140);
    await page.screenshot({ path: path.join(OUT, 't2-tspin-pop.png') });
    const st = await ev(page, 'return {tsd:S.me.stats.tsd, atk:S.me.stats.attack, b2b:S.me.b2b}');
    ok(st.tsd === 1 && st.atk === 4 && st.b2b === 0, 'touch T-spin double scores', st);
    await ctx.close();
  }

  // ---------- keyboard, KO, sprint end, resize ----------
  {
    const { ctx, page } = await open('keys', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.click('[data-go="practice"]');
    await sleep(200);
    await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight');
    ok(await ev(page, 'var c=S.me.cur; return !S.me.fits(c.type,c.rot,c.x+1,c.y)'), 'keyboard auto-shift reaches the wall');
    await page.keyboard.down('ArrowLeft'); await sleep(60); await page.keyboard.down('ArrowRight'); await sleep(40);
    const xa = await ev(page, 'return S.me.cur.x');
    await page.keyboard.up('ArrowRight'); await sleep(350);
    ok(await ev(page, 'var c=S.me.cur; return !S.me.fits(c.type,c.rot,c.x-1,c.y)'), 'older held direction takes over again', xa);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('Escape'); await sleep(100);
    ok(await ev(page, 'return p.sheet') === 'pause' && await ev(page, 'return S.state') === 'pause', 'Escape pauses');
    await page.keyboard.press('Escape'); await sleep(100);
    ok(await ev(page, 'return p.sheet') === '' && await ev(page, 'return S.state') === 'play', 'Escape resumes');
    // T-spin triple by keyboard
    await ev(page, "S.me.reset(); S.me.setBoard(['....XX....','.....X....','XXXX.XXXXX','XXX..XXXXX','XXXX.XXXXX']); S.me.queue.unshift('T'); S.me.start();");
    await sleep(80);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.down('ArrowDown'); await sleep(480); await page.keyboard.up('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('KeyZ');
    await sleep(60);
    await page.keyboard.press('Space');
    await sleep(120);
    const st = await ev(page, 'return {tst:S.me.stats.tst, atk:S.me.stats.attack}');
    ok(st.tst === 1 && st.atk === 6, 'keyboard T-spin triple scores', st);
    await page.screenshot({ path: path.join(OUT, 'k3-tst.png') });
    // undo
    await page.keyboard.press('KeyU'); await sleep(80);
    ok(await ev(page, 'return S.me.stats.tst') === 0, 'undo takes the triple back');
    // dojo ignores hold
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');
    await page.click('[data-go="dojo"]'); await sleep(200);
    await page.keyboard.press('KeyC'); await sleep(60);
    ok(await ev(page, 'return S.me.holdType') === null, 'hold is off in the dojo');
    // wrong placement fails and reloads the drill
    await page.keyboard.press('Space'); await sleep(200);
    ok(await ev(page, 'return S.state') === 'wait', 'a plain drop fails the drill');
    await sleep(1500);
    ok(await ev(page, 'return S.state') === 'play' && await ev(page, 'return S.drill') === 0, 'drill reloads after a miss');
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');
    // sprint end
    await page.click('[data-go="sprint"]'); await sleep(2300);
    await ev(page, "S.me.setBoard(['XXXXXXXXX.','XXXXXXXXX.','XXXXXXXXX.','XXXXXXXXX.']); S.me.stats.lines = 36; S.me.cur = {type:'I', rot:1, x:7, y:21};");
    await page.keyboard.press('Space'); await sleep(250);
    ok(await ev(page, 'return p.sheet') === 'sprintEnd' && await ev(page, 'return p.save.best') > 0, 'sprint finishes at 40 lines');
    await page.screenshot({ path: path.join(OUT, 'k4-sprint-end.png') });
    await page.click('[data-do="menu"]');
    ok(await page.evaluate(() => document.getElementById('mSprint').textContent.length > 0), 'menu shows the best sprint time');
    // battle KO and revive
    await page.click('[data-go="battle"]'); await page.click('[data-level="0"]'); await page.click('[data-do="fight"]'); await sleep(2300);
    await ev(page, "for (var r = 14; r < 40; r++) for (var x = 1; x < 10; x++) S.me.grid[r][x] = 8;");
    await page.keyboard.press('Space'); await sleep(80); await page.keyboard.press('Space'); await sleep(80); await page.keyboard.press('Space'); await sleep(150);
    const ko = await ev(page, 'return {ko:S.ko, over:S.me.over}');
    ok(ko.ko.opp === 1 && ko.over === true, 'topping out gives the opponent a knockout', ko);
    await page.screenshot({ path: path.join(OUT, 'k5-ko.png') });
    await sleep(1400);
    const rv = await ev(page, 'return {over:S.me.over, cur:!!S.me.cur, h:S.me.stackHeight(), ko:S.ko}');
    ok(rv.over === false && rv.cur && rv.h <= 10 && rv.ko.opp === 1, 'revive clears the cement and continues', rv);
    // garbage round trip: opponent attack lands on my wall
    await ev(page, 'S.me.receive(3);');
    await sleep(600);
    await page.keyboard.press('Space'); await sleep(120);
    ok(await ev(page, 'var n=0; for (var x=0;x<10;x++) if (S.me.grid[39][x]===8) n++; return n') === 9, 'queued cement lands after a lock');
    // resize while playing
    const c1 = await ev(page, 'return p.V.me.cell');
    await page.setViewportSize({ width: 900, height: 560 }); await sleep(200);
    const c2 = await ev(page, 'return p.V.me.cell');
    ok(c2 < c1 && c2 >= 12, 'layout follows the window', [c1, c2]);
    await page.screenshot({ path: path.join(OUT, 'k6-small-window.png') });
    await page.setViewportSize({ width: 1280, height: 800 }); await sleep(200);
    await page.screenshot({ path: path.join(OUT, 'k7-battle-hud.png') });
    // soak: random keys against the top bot for a while
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');
    await page.click('[data-go="battle"]'); await page.click('[data-level="4"]'); await page.click('[data-do="fight"]'); await sleep(2300);
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyZ', 'Space', 'KeyC', 'KeyA', 'ArrowDown', 'Space', 'ArrowLeft', 'ArrowRight'];
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { await page.keyboard.press(keys[Math.floor(Math.random() * keys.length)]); await sleep(25); }
    const soak = await ev(page, 'return {state:S.state, me:S.me.stats.pieces, opp:S.opp.stats.pieces, ko:S.ko, oppSpins:S.opp.stats.spins, oppSent:S.opp.stats.sent, left:Math.round(S.left/1000)}');
    console.log('soak:', JSON.stringify(soak));
    ok(soak.state === 'play' && soak.me > 20 && soak.opp > 30, 'battle keeps running under random input', soak);
    await page.screenshot({ path: path.join(OUT, 'k8-soak.png') });
    await ctx.close();
  }

  console.log('browser checks: ' + pass + ' passed, ' + fail + ' failed');
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await browser.close();
  process.exit(fail || problems.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
