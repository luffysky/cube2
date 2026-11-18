'use strict';
// Plays through the new features in a real browser and checks the results.
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
  async function open(name, opts, q) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(URL + (q || ''));
    await sleep(600);
    return { ctx, page };
  }
  const ev = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;var M=ZZ.Meta;' + expr + '})()');
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const desk = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'zh-TW' };

  // ---------- ranked match: opponent from rating, result moves rating and pays coins ----------
  {
    const { ctx, page } = await open('rank', desk);
    await page.click('[data-go="rank"]'); await sleep(200);
    ok(await page.evaluate(() => document.querySelector('.rankbox.big b').textContent.indexOf('陶土') === 0), 'rank sheet shows the starting tier');
    await page.click('[data-do="rankGo"]'); await sleep(2600);
    ok(await ev(page, 'return S.kind === "battle" && S.mode === "rank" && S.state === "play" && !S.o.items && S.total === 120000'), 'ranked match runs for 2 minutes without items');
    ok(await ev(page, 'return !!S.oppName && !!document.getElementById("ptsMe")'), 'opponent has a name and the score line exists');
    // score: a hard drop pays 2 a row
    await page.keyboard.press('Space'); await sleep(120);
    ok(await ev(page, 'return S.me.stats.score') >= 30, 'hard drop scores', await ev(page, 'return S.me.stats.score'));
    // force a win: knock the computer out and end the clock
    await ev(page, 'S.opp.topOut("lock"); return 1'); await sleep(300);
    ok(await ev(page, 'return S.ko.me') === 1, 'knockout counted');
    const sc = await ev(page, 'return S.me.stats.score');
    ok(sc >= 1500, 'knockout adds to the score', sc);
    await ev(page, 'S.left = 200; return 1'); await sleep(1700);
    ok(await ev(page, 'return p.sheet') === 'battleEnd', 'result sheet opens');
    const res = await ev(page, 'return {r:S.result, coins:S.reward.coins, rank:S.reward.rank && S.reward.rank.delta, rp:M.data.rp, have:M.data.coins, parts:S.reward.parts.map(function(x){return x.key})}');
    ok(res.r === 1 && res.rank >= 20 && res.rp === res.rank, 'rating went up after the win', res);
    ok(res.coins >= 30 + 4 + 50 && res.have === 200 + res.coins, 'coins were paid', res);
    ok(await page.evaluate(() => !!document.querySelector('.rankbox') && !!document.querySelector('.earn')), 'result sheet shows rating and coins');
    await shot(page, 'f_rank_end');
    // again: a new ranked match starts
    await page.click('[data-do="again"]'); await sleep(500);
    ok(await ev(page, 'return S.mode === "rank" && S.state === "count"'), 'again starts another ranked match');
    await ctx.close();
  }

  // ---------- versus with brought items, recording, then a ghost match against it ----------
  {
    const { ctx, page } = await open('ghost', desk);
    await ev(page, 'M.data.coins = 500; M.buyItem(2); M.buyItem(6); M.toggleBring(2); M.toggleBring(6); return 1');
    await page.click('[data-go="battle"]'); await sleep(200);
    ok(await page.evaluate(() => document.querySelectorAll('.bringb[aria-pressed="true"]').length === 2), 'two items chosen to bring');
    await page.click('[data-min="1"]'); await sleep(100);
    await page.evaluate(() => { var c = document.getElementById('bItems'); if (c.checked) c.click(); });
    await page.click('[data-do="fight"]'); await sleep(2600);
    ok(await ev(page, 'return S.me.inv.join(",")') === '2,6', 'brought items are in the bag', await ev(page, 'return S.me.inv'));
    ok(await ev(page, 'return M.data.items[2] === 0 && M.data.items[6] === 0'), 'stock was used up');
    ok(await page.evaluate(() => !document.getElementById('itemBox').hidden), 'item box shows even without item tiles');
    await page.keyboard.press('KeyF'); await sleep(200);
    ok(await ev(page, 'return S.opp.pendingTotal()') === 3, 'grout sent three rows');
    await page.keyboard.press('KeyF'); await sleep(200);
    ok(await ev(page, 'return S.freeze.opp > 0'), 'freeze stops the computer');
    // play a while with random placements so there is something to record
    for (let i = 0; i < 26; i++) {
      await page.keyboard.press(['KeyA', 'KeyD', 'KeyW', 'KeyA', 'KeyD'][i % 5]);
      if (i % 3 === 0) await page.keyboard.press('KeyD');
      await page.keyboard.press('Space'); await sleep(110);
    }
    await sleep(24000);
    await ev(page, 'S.left = Math.min(S.left, 300); return 1'); await sleep(1800);
    ok(await ev(page, 'return p.sheet') === 'battleEnd', 'versus result sheet');
    ok(await ev(page, 'return S.saved === true && ZZ.Replay.list().length === 1'), 'match was recorded');
    const rep = await ev(page, 'var r = ZZ.Replay.list()[0]; return {n:r.ev.length, pieces:r.ev.filter(function(e){return e[0]==="p"}).length, items:r.ev.filter(function(e){return e[0]==="i"}).length, size:JSON.stringify(r).length}');
    ok(rep.pieces >= 10 && rep.items === 2 && rep.size < 40000, 'recording has pieces and both items', rep);
    await page.click('[data-do="menu"]'); await sleep(300);
    ok(await page.evaluate(() => document.getElementById('mGhost').textContent === '1'), 'menu shows one recording');
    await page.click('[data-go="ghost"]'); await sleep(200);
    await shot(page, 'f_ghost_list');
    await page.click('[data-ghost="0"]'); await sleep(2700);
    ok(await ev(page, 'return S.mode === "ghost" && S.state === "play" && !!S.bot && S.bot.sync'), 'ghost match started');
    await sleep(9000);
    const gh = await ev(page, 'return {pieces:S.opp.stats.pieces, i:S.bot.i, sync:S.bot.sync, bot:!!S.bot.bot}');
    ok(gh.pieces >= 5 && gh.sync, 'ghost is replaying the recording', gh);
    await shot(page, 'f_ghost_play');
    // the ghost used grout and freeze at the recorded times, so we were hit
    await sleep(600);
    await ctx.close();
  }

  // ---------- opening lessons ----------
  {
    const { ctx, page } = await open('lesson', desk);
    await page.click('[data-go="openers"]'); await sleep(200);
    ok(await page.evaluate(() => document.querySelectorAll('[data-lesson]').length === 3), 'three lessons listed');
    await page.click('[data-lesson="0"]'); await sleep(500);
    ok(await ev(page, 'return S.kind === "lesson" && S.state === "play" && !!S.target && S.target.cells.length === 4'), 'lesson shows where the first piece goes');
    await shot(page, 'f_lesson');
    // wrong spot: the piece comes back
    await page.keyboard.press('KeyA'); await page.keyboard.press('KeyA'); await page.keyboard.press('Space'); await sleep(250);
    ok(await ev(page, 'return S.li === 0 && S.me.stats.pieces === 0 && !!S.me.cur'), 'a wrong placement is taken back', await ev(page, 'return [S.li, S.me.stats.pieces]'));
    // hold is not part of this lesson
    await page.keyboard.press('KeyC'); await sleep(250);
    ok(await ev(page, 'return S.li === 0 && !S.me.holdType'), 'hold is taken back too');
    // place every piece where the lesson wants it
    const n = await ev(page, 'return S.les.steps.length');
    for (let i = 0; i < n && (await ev(page, 'return S.li')) < n; i++) {
      await ev(page, 'var st = S.les.steps[S.li]; var c = S.me.cur; c.x = st[1]; c.y = st[2]; c.rot = st[3]; if (st[4] && st[4] !== "none") { S.me.lastMove = "rotate"; S.me.lastKick = 0; } S.me.lock(); return 1');
      await sleep(140);
    }
    await sleep(400);
    ok(await ev(page, 'return S.li') === n, 'all lesson pieces accepted', await ev(page, 'return S.li'));
    ok(await ev(page, 'return M.data.first.openers.indexOf("tsd") >= 0 && M.data.coins === 240'), 'first clear pays 40 coins', await ev(page, 'return M.data.coins'));
    await sleep(1900);
    ok(await ev(page, 'return p.sheet') === 'lessonDone', 'lesson done sheet');
    await page.click('[data-do="lessonNext"]'); await sleep(400);
    ok(await ev(page, 'return S.lesNo === 1'), 'next lesson loads');
    // demo of the cannon lesson runs to the end
    await page.evaluate(() => ZZ.App.begin('lesson', { lesson: 2 })); await sleep(300);
    await page.click('[data-act="demo"]'); await sleep(400);
    ok(await ev(page, 'return S.state === "demo" && S.steps.length === 15'), 'cannon demo has 15 steps');
    await ev(page, 'S.demoFast = 1; return 1');
    for (let i = 0; i < 80 && (await ev(page, 'return S.state')) === 'demo'; i++) await sleep(1000);
    ok(await ev(page, 'return S.state !== "demo"'), 'demo finished');
    await ctx.close();
  }

  // ---------- keys: rebind, conflict, defaults ----------
  {
    const { ctx, page } = await open('keys', desk);
    await page.evaluate(() => ZZ.App.openSheet('keys')); await sleep(200);
    await page.click('[data-unbind="HD|Space"]'); await sleep(100);
    await page.click('[data-bind="HD"]'); await sleep(100);
    await page.keyboard.press('KeyG'); await sleep(150);
    ok(await ev(page, 'return p.set.keys.HD.join()') === 'KeyG', 'hard drop bound to G', await ev(page, 'return p.set.keys.HD'));
    await page.click('[data-bind="HOLD"]').catch(() => {}); await sleep(100);
    // HOLD already has four keys: no capture
    ok(await ev(page, 'return !ZZ.App.capture'), 'no capture when an action is full');
    await page.click('[data-unbind="HOLD|ShiftRight"]'); await sleep(100);
    await page.click('[data-bind="HOLD"]'); await sleep(100);
    await page.keyboard.press('KeyA'); await sleep(150);
    ok(await ev(page, 'return p.set.keys.HOLD.indexOf("KeyA") >= 0 && p.set.keys.L.indexOf("KeyA") < 0'), 'a key taken by another action moves over');
    await page.evaluate(() => ZZ.App.closeSheet(true));
    await page.click('[data-go="practice"]'); await sleep(500);
    const y0 = await ev(page, 'return S.me.stats.pieces');
    await page.keyboard.press('Space'); await sleep(100);
    ok(await ev(page, 'return S.me.stats.pieces') === y0, 'space no longer drops');
    await page.keyboard.press('KeyG'); await sleep(100);
    ok(await ev(page, 'return S.me.stats.pieces') === y0 + 1, 'G drops');
    await page.reload(); await sleep(600);
    ok(await ev(page, 'return p.set.keys.HD.join()') === 'KeyG', 'bindings survive a reload');
    await page.evaluate(() => ZZ.App.openSheet('keys')); await sleep(150);
    await page.click('[data-do="keyDefaults"]'); await sleep(150);
    ok(await ev(page, 'return p.set.keys.HD.join()') === 'Space', 'defaults restore space');
    await ctx.close();
  }

  // ---------- languages ----------
  {
    const { ctx, page } = await open('lang', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ja-JP' });
    ok(await ev(page, 'return p.lang') === 'ja', 'follows the system language (ja)');
    ok(await page.evaluate(() => document.querySelector('[data-t="m.rank"]').textContent) === 'ランクマッチ', 'menu is in Japanese');
    await shot(page, 'f_menu_ja');
    for (const [code, want] of [['ko', '랭크전'], ['en', 'Ranked'], ['zh-Hans', '排位赛'], ['zh-Hant', '排位賽']]) {
      await page.evaluate(() => ZZ.App.openSheet('settings')); await sleep(150);
      await page.selectOption('#sLang', code); await sleep(250);
      ok(await page.evaluate(() => document.querySelector('[data-t="m.rank"]').textContent) === want, 'menu in ' + code);
      ok(await page.evaluate(() => document.documentElement.lang) === code, 'html lang is ' + code);
      await page.evaluate(() => ZZ.App.closeSheet(true)); await sleep(100);
      await shot(page, 'f_menu_' + code);
    }
    // every string exists in every language
    const miss = await page.evaluate(() => {
      var out = [], L = ZZ.L, keys = [];
      document.querySelectorAll('[data-t]').forEach(function (e) { keys.push(e.getAttribute('data-t')); });
      ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].forEach(function (lg) { L.set(lg); keys.forEach(function (k) { var v = L.t(k); if (!v || v === k) out.push(lg + ':' + k); }); });
      L.set('zh-Hant');
      return out;
    });
    ok(miss.length === 0, 'no missing menu strings', miss.slice(0, 8));
    await page.evaluate(() => { ZZ.App.set.lang = 'en'; ZZ.App.applyLang(); });
    await page.click('[data-go="battle"]'); await sleep(200);
    await shot(page, 'f_battle_en');
    await page.click('[data-do="fight"]'); await sleep(2800);
    await shot(page, 'f_play_en');
    await ctx.close();
  }

  // ---------- shop: buy, wear, membership trial ----------
  {
    const { ctx, page } = await open('shop', desk);
    await ev(page, 'M.data.coins = 3000; M.save(); return 1');
    await page.evaluate(() => ZZ.App.openSheet('shop')); await sleep(250);
    await page.click('[data-tab="tile"]'); await sleep(250);
    await page.click('[data-buy="tile|neon"]'); await sleep(300);
    ok(await ev(page, 'return M.data.equip.tile === "neon" && M.data.coins === 1800 && ZZ.View.LOOK.tile === "neon"'), 'bought and wearing neon tiles');
    await page.click('[data-tab="theme"]'); await sleep(200);
    await page.click('[data-buy="theme|kiln"]'); await sleep(300);
    ok(await page.evaluate(() => document.documentElement.getAttribute('data-skin')) === 'kiln', 'theme applied to the page');
    await page.click('[data-tab="bg"]'); await sleep(200);
    await page.click('[data-buy="bg|night"]'); await sleep(300);
    ok(await ev(page, 'return M.data.coins === 300 && ZZ.View.LOOK.bg === "night"'), 'wall bought');
    await page.click('[data-buy="bg|tatami"]'); await sleep(300);
    ok(await ev(page, 'return M.data.coins === 300 && M.data.equip.bg === "night"'), 'cannot buy without coins');
    await page.click('[data-tab="member"]'); await sleep(200);
    await page.click('[data-do="subStart"]'); await sleep(300);
    ok(await ev(page, 'return M.isSub() && M.canUse("bg", "tatami")'), 'trial membership unlocks every look');
    ok(await page.evaluate(() => !!document.querySelector('[data-pick="bg"]') && !!document.getElementById('picFile')), 'members can choose their own pictures');
    // hand the page a picture as if it had been chosen
    await page.setInputFiles('#picFile', path.join(OUT, 's_menu.png')).catch(() => {});
    await page.evaluate(() => { var f = document.getElementById('picFile'); });
    await page.click('[data-pick="bg"]').catch(() => {});
    await page.setInputFiles('#picFile', path.join(OUT, 's_menu.png')); await sleep(900);
    ok(await ev(page, 'return M.data.custom.bg === true && M.data.equip.bg === "custom" && !!ZZ.View.LOOK.img.bg'), 'own picture becomes the wall', await ev(page, 'return [M.data.custom, M.data.equip.bg]'));
    await page.evaluate(() => ZZ.App.closeSheet(true));
    await page.click('[data-go="practice"]'); await sleep(700);
    await shot(page, 'f_custom_wall');
    await page.reload(); await sleep(900);
    ok(await ev(page, 'return M.data.equip.bg === "custom" && !!ZZ.View.LOOK.img.bg'), 'the picture is still there after a reload');
    await ev(page, 'M.cancelSub(); ZZ.App.applyLook(); return 1');
    ok(await ev(page, 'return M.data.equip.bg === "wall" && M.data.equip.tile === "neon"'), 'ending the trial keeps bought looks and drops the rest');
    await ctx.close();
  }

  await browser.close();
  console.log('flow checks: ' + pass + ' passed, ' + fail + ' failed');
  console.log(problems.length ? problems.join('\n') : 'no page errors');
})();
