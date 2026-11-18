'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  async function open(name, opts) {
    const ctx = await browser.newContext(Object.assign({ locale: 'zh-TW' }, opts));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await sleep(500);
    return { ctx, page };
  }
  const ev = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;' + expr + '})()');

  // ---------- desktop: WASD, music, spins, items, layout ----------
  {
    const { ctx, page } = await open('desk', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.click('[data-sheet="settings"]'); await sleep(150);
    ok(await page.evaluate(() => !!document.getElementById('sMvol') && !!document.getElementById('sLock') && !!document.getElementById('sReal')), 'settings has music volume, lock time and clip toggle');
    await page.click('[data-do="close"]');
    await sleep(1500);
    const m1 = await ev(page, 'return {name:p.sfx.mname, clips:Object.keys(p.sfx.buf).length, state:p.sfx.ac && p.sfx.ac.state}');
    ok(m1.name === 'menu' && m1.clips >= 24, 'menu music plays and clips are decoded', m1);
    await page.click('[data-go="practice"]'); await sleep(900);
    ok(await ev(page, 'return p.sfx.mname') === 'calm', 'practice switches to the calm track');
    // WASD
    const x0 = await ev(page, 'return S.me.cur.x');
    await page.keyboard.press('KeyD');
    ok(await ev(page, 'return S.me.cur.x') === x0 + 1, 'D moves right');
    await page.keyboard.press('KeyA'); await page.keyboard.press('KeyA');
    ok(await ev(page, 'return S.me.cur.x') === x0 - 1, 'A moves left');
    const r0 = await ev(page, 'return S.me.cur.rot');
    await page.keyboard.press('KeyW');
    const r1 = await ev(page, 'return [S.me.cur.type, S.me.cur.rot]');
    ok(r1[0] === 'O' || r1[1] === ((r0 + 1) & 3), 'W turns clockwise', r1);
    await page.keyboard.press('KeyJ');
    ok(await ev(page, 'return S.me.cur.rot') === r0 || r1[0] === 'O', 'J turns back');
    await page.keyboard.down('KeyS'); await sleep(480); await page.keyboard.up('KeyS');
    ok(await ev(page, 'return S.me.grounded()'), 'S soft drops to the floor');
    await page.keyboard.press('KeyE'); await sleep(60);
    ok(await ev(page, 'return !!S.me.holdType'), 'E holds');
    // Z-spin by keyboard, radar first
    await ev(page, "S.me.reset(); S.me.setBoard(['..X.......','XXX..XXXXX','XXXX..XXXX']); S.me.queue.unshift('Z'); S.me.start();");
    await sleep(120);
    const tg = await ev(page, 'return S.target ? S.target.label : null');
    ok(tg === 'Z 轉雙消', 'radar marks the Z-spin slot', tg);
    await page.screenshot({ path: path.join(OUT, 'n1-zspin-radar.png') });
    await page.keyboard.press('KeyX'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.down('ArrowDown'); await sleep(480); await page.keyboard.up('ArrowDown');
    await page.keyboard.press('KeyX'); await sleep(50);
    ok(await ev(page, 'return S.me.spinState()') === 'spin', 'Z is locked in after the turn');
    await page.keyboard.press('Space'); await sleep(150);
    const zs = await ev(page, 'return {x:S.me.stats.xspins, atk:S.me.stats.attack, pop:document.getElementById("pops").textContent}');
    ok(zs.x === 1 && zs.atk === 2 && /Z 轉雙消/.test(zs.pop), 'Z-spin double is recognised and announced', zs);
    await page.screenshot({ path: path.join(OUT, 'n2-zspin-pop.png') });
    // dojo list and a Z drill demo
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');
    await page.evaluate(() => { ZZ.peek().save.dojo = 8; });
    await page.click('[data-go="dojo"]'); await sleep(150);
    ok(await page.evaluate(() => document.querySelectorAll('#sheetCard [data-drill]').length) === 15, 'dojo lists fifteen drills');
    ok(await page.evaluate(() => /長條轉/.test(document.querySelector('#sheetCard [data-drill="13"]').textContent) && /長條轉/.test(document.querySelector('#sheetCard [data-drill="14"]').textContent)), 'the last two are the long-bar spins');
    await page.screenshot({ path: path.join(OUT, 'n3-dojo-list.png') });
    // the long-bar spin, played by hand: stand it up at the left wall, drop it down the shaft, turn toward the roof
    await page.click('[data-drill="13"]'); await sleep(300);
    for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'KeyZ']) { await page.keyboard.press(k); await sleep(40); }
    await page.keyboard.down('ArrowDown'); await sleep(700); await page.keyboard.up('ArrowDown');
    await page.keyboard.press('KeyX'); await sleep(60);
    ok(await ev(page, 'return S.me.spinState()') === 'spin' && await ev(page, 'return S.me.cur && S.me.cur.type') === 'I', 'the long bar twists in under the roof and is locked in', await ev(page, 'return [S.me.spinState(), S.me.cur && [S.me.cur.x, S.me.cur.y, S.me.cur.rot]]'));
    await page.keyboard.press('Space'); await sleep(200);
    ok(/長條轉單消/.test(await page.evaluate(() => document.getElementById('pops').textContent + document.getElementById('banner').textContent + document.getElementById('strip').textContent)), 'and is called by its name', await page.evaluate(() => document.getElementById('pops').textContent));
    ok(await ev(page, 'return p.save.dojo') === 14, 'the drill counts as passed', await ev(page, 'return p.save.dojo'));
    await page.screenshot({ path: path.join(OUT, 'n3b-ispin.png') });
    await sleep(1700);
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');
    await page.evaluate(() => { ZZ.peek().save.dojo = 8; });
    await page.click('[data-go="dojo"]'); await sleep(150);
    await page.click('[data-drill="8"]'); await sleep(300);
    await page.click('[data-act="demo"]'); await sleep(4200);
    await page.screenshot({ path: path.join(OUT, 'n4-zdrill-demo.png') });
    await sleep(2600);
    ok(await ev(page, 'return S.state') === 'play' && await ev(page, 'return p.save.dojo') === 8, 'Z drill demo finishes without counting as a pass');
    // play the Z drill for real
    await page.keyboard.press('KeyX'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.down('ArrowDown'); await sleep(480); await page.keyboard.up('ArrowDown');
    await page.keyboard.press('KeyX'); await page.keyboard.press('Space'); await sleep(300);
    ok(await ev(page, 'return p.save.dojo') === 9, 'Z drill passes when played');
    await sleep(1600);
    await page.keyboard.press('Escape'); await page.click('[data-do="menu"]');

    // battle with items, opponent on the left
    await page.click('[data-go="battle"]'); await sleep(120);
    ok(await page.evaluate(() => document.getElementById('bItems').checked), 'item battle is on by default');
    await page.click('[data-level="2"]'); await page.click('[data-do="fight"]'); await sleep(2400);
    const lay = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      return { opp: r('oppWide').left, well: r('wellWrap').left, next: r('colR').left, hudL: document.getElementById('hudL').textContent, hudR: document.getElementById('hudR').textContent, itemBox: !document.getElementById('itemBox').hidden };
    });
    ok(lay.opp < lay.well && lay.well < lay.next && /師傅/.test(lay.hudL) && /你/.test(lay.hudR) && lay.itemBox, 'opponent wall and its numbers sit on the left', lay);
    ok(await ev(page, 'return p.sfx.mname') === 'battle2' || await ev(page, 'return p.sfx.mload') === 'battle2', 'battle music follows the opponent level');
    // item tiles appear
    for (let i = 0; i < 9; i++) { await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.keyboard.press('Space'); await sleep(40); }
    const tiles = await ev(page, 'var n=0; for (var r=0;r<40;r++) for (var x=0;x<10;x++) if (S.me.grid[r][x]>>4) n++; return n');
    ok(tiles >= 1, 'an item tile shows up on the wall', tiles);
    await page.screenshot({ path: path.join(OUT, 'n5-battle-items.png') });
    // every item, used by me
    await ev(page, "S.me.reset(); S.me.itemsOn = true; S.me.setBoard(['X.X.X.X.X.','.X.X.X.X.X','XXXXXXXXX.','XXXXXXXXX.']); S.me.start(); S.me.inv = [1];");
    await page.keyboard.press('KeyF'); await sleep(80);
    ok(await ev(page, 'return S.me.stackHeight()') === 1, 'chisel item removes three rows');
    await ev(page, 'S.me.inv = [2]; S.opp.pending = [];');
    await page.keyboard.press('KeyF'); await sleep(60);
    ok(await ev(page, 'return S.opp.pendingTotal()') === 3, 'cement item queues three rows on the opponent');
    await ev(page, 'S.me.inv = [3]; S.me.receive(4);');
    await page.keyboard.press('KeyV'); await sleep(60);
    const sh = await ev(page, 'var a=S.me.pendingTotal(); S.me.receive(5); return [a, S.me.pendingTotal(), S.me.shield > 7000]');
    ok(sh[0] === 0 && sh[1] === 0 && sh[2], 'shield item clears the queue and blocks new cement', sh);
    await ev(page, 'S.me.inv = [4];');
    await page.keyboard.press('Enter'); await sleep(60);
    ok(await ev(page, 'return S.me.queue.slice(0,2).join("")') === 'TT', 'gold item puts two T pieces next');
    await ev(page, "S.me.setBoard(['X.........','..........','X.........']); S.me.inv = [5];");
    await page.keyboard.press('KeyF'); await sleep(60);
    ok(await ev(page, 'return [S.me.grid[39][0], S.me.grid[38][0], S.me.grid[37][0]].map(function(v){return v?1:0}).join("")') === '110', 'trowel item closes the gaps');
    await ev(page, 'S.me.inv = [6];');
    const oppBefore = await ev(page, 'return S.opp.stats.pieces');
    await page.keyboard.press('KeyF'); await sleep(1500);
    const fz = await ev(page, 'return [S.freeze.opp > 0, S.opp.stats.pieces]');
    ok(fz[0] && fz[1] === oppBefore, 'ice item stops the opponent', fz);
    await page.screenshot({ path: path.join(OUT, 'n6-frozen-opp.png') });
    await sleep(1900);
    ok(await ev(page, 'return S.freeze.opp') === 0, 'ice wears off');
    await ev(page, 'S.me.inv = [7];');
    await page.keyboard.press('KeyF'); await sleep(60);
    ok(await ev(page, 'return S.me.boost > 7000'), 'double item starts its timer');
    // opponent uses ice on me
    await ev(page, 'S.opp.inv = [6]; p.useItem("opp");');
    const xb = await ev(page, 'return S.me.cur ? S.me.cur.x : -99');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space'); await sleep(80);
    const frozen = await ev(page, 'return [S.freeze.me > 0, S.me.cur ? S.me.cur.x : -99, document.getElementById("chips").textContent]');
    ok(frozen[0] && frozen[1] === xb && /結冰/.test(frozen[2]), 'being frozen blocks my input and shows a timer', frozen);
    await page.screenshot({ path: path.join(OUT, 'n7-frozen-me.png') });
    await sleep(3200);
    await page.keyboard.press('ArrowLeft'); await sleep(40);
    ok(await ev(page, 'return S.freeze.me') === 0, 'my freeze ends');
    // let the bot collect and use items on its own for a while
    await ev(page, 'S.opp.itemEvery = 2; S.left = 60000;');
    await sleep(14000);
    const botUse = await ev(page, 'return {got:S.opp.stats.items, inv:S.opp.inv.length, state:S.state}');
    console.log('bot items:', JSON.stringify(botUse));
    ok(botUse.state === 'play' && botUse.got >= 1, 'the computer picks up items in play', botUse);
    ok(botUse.inv < botUse.got || botUse.got === 0, 'the computer spends its items', botUse);
    await page.screenshot({ path: path.join(OUT, 'n8-battle-later.png') });
    await ctx.close();
  }

  // ---------- phone: item key and slot ----------
  {
    const { ctx, page } = await open('phone', { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.tap('[data-go="battle"]'); await page.tap('[data-do="fight"]'); await sleep(2400);
    ok(await page.evaluate(() => !document.getElementById('itemKey').hidden && document.getElementById('itemBox').hidden), 'phone shows the item key; the item slot is folded into it');
    await ev(page, 'S.me.inv = [1, 6, 3];');
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, 'n9-phone-items.png') });
    ok(await page.evaluate(() => !!document.querySelector('#itemKey .itile svg') && document.querySelectorAll('#itemKey .itile').length === 3), 'item key shows the bag');
    await page.tap('#itemKey'); await sleep(80);
    ok(await ev(page, 'return S.me.inv.join("")') === '63', 'tapping the item key uses the first item');
    await page.tap('#itemKey'); await sleep(80);
    ok(await ev(page, 'return S.me.inv.join("")') === '3' && await ev(page, 'return S.freeze.opp > 0'), 'a second tap uses the next one');
    const fit = await page.evaluate(() => { const p = document.getElementById('pad').getBoundingClientRect(), l = document.getElementById('colL').getBoundingClientRect(), w = document.getElementById('wellWrap').getBoundingClientRect(); return [Math.round(p.bottom), innerHeight, Math.round(l.bottom), Math.round(w.bottom)]; });
    ok(fit[0] <= fit[1] + 1, 'phone layout still fits with the item key', fit);
    await page.tap('#pauseBtn'); await page.tap('[data-do="help"]'); await sleep(150);
    await page.evaluate(() => { const c = document.getElementById('sheetCard'); c.scrollTop = c.scrollHeight; });
    await sleep(100);
    await page.screenshot({ path: path.join(OUT, 'n10-help-items.png') });
    await ctx.close();
  }

  console.log('feature checks: ' + pass + ' passed, ' + fail + ' failed');
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await browser.close();
  process.exit(fail || problems.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
