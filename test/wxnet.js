'use strict';
// Weather battles in real browsers: against the computer, and two players through random matchmaking in the weather
// pool (one sky from a shared seed, a four-line clear throws weather at the other side, storm points at the end), and
// a friend's room with the weather switch on. Runs tools/dev-server.js (the game's own relay).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8779, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  const open = async (name, w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w || 420, height: h || 860 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await page.evaluate(n => ZZ.Meta.setName(n), name);
    return page;
  };
  const sky = p => p.evaluate(() => { const S = ZZ.peek().S; return S && S.kind === 'battle' ? { mode: S.mode, wx: S.o.wx || 0, sky: !!S.sky, seed: S.sky && S.sky.me.seed, state: S.state, hit: S.sky && S.sky.me.hitLeft > 0 ? S.sky.me.hitKind : S.sky && S.sky.me.dis ? S.sky.me.dis.kind : '', oppHit: S.sky && S.sky.opp ? S.sky.opp.hitLeft > 0 || !!S.sky.opp.dis : null } : null; });
  const quad = p => p.evaluate(() => { const S = ZZ.peek().S; ZZ.App.hooks.forEach(h => h(S.me, { type: 'lock', lines: 4, tspin: 'none' }, true)); });
  try {
    // ---------- against the computer ----------
    const A = await open('阿磚');
    await A.click('[data-go="weather"]'); await sleep(300);
    ok(await A.evaluate(() => /天氣對戰/.test(document.getElementById('sheetCard').textContent) && !!document.querySelector('[data-do="wxQuick"]')), 'the weather sheet offers weather battles and random matching');
    await A.click('[data-do="wxAi"]'); await sleep(300);
    let s = await sky(A);
    ok(s && s.mode === 'ai' && s.sky && s.oppHit === false, 'a weather battle against the computer', s);
    await until(async () => (await sky(A)).state === 'play', 5000);
    await quad(A); await sleep(100);
    ok((await sky(A)).oppHit === true, 'a four-line clear throws weather at the computer');
    await A.evaluate(() => { const S = ZZ.peek().S; ZZ.App.hooks.forEach(h => h(S.opp, { type: 'lock', lines: 4, tspin: 'none' }, false)); });
    await sleep(300);
    s = await sky(A);
    ok(!!s.hit, 'and the computer throws back', s);
    ok(await A.evaluate(() => /風速/.test((document.getElementById('wxInfo') || {}).textContent || '')), 'wind and rain shown by the next pieces in a battle');
    await A.screenshot({ path: path.join(OUT, 'wx-battle.png') });
    const r0 = await A.evaluate(() => ZZ.Meta.data.lv.wxr);
    await A.evaluate(() => { const S = ZZ.peek().S; S.ko.me = 1; S.left = 200; });
    ok(await until(() => A.evaluate(() => ZZ.peek().sheet === 'battleEnd'), 6000), 'the battle ends');
    const end = await A.evaluate(() => ({ r: ZZ.peek().S.result, wxr: ZZ.Meta.data.lv.wxr, text: document.getElementById('sheetCard').textContent }));
    ok(end.r === 1 && end.wxr === r0 + 15 && /天氣排位 15（\+15）/.test(end.text), 'a win against the computer: +15 storm points, shown on the result', end);
    await A.screenshot({ path: path.join(OUT, 'wx-battle-end.png') });
    await A.evaluate(() => ZZ.App.toMenu()); await sleep(200);

    // ---------- random matching in the weather pool ----------
    const B = await open('小瓦'), C = await open('窯哥');
    await C.evaluate(() => { ZZ.App.openSheet('online'); ZZ.Net.quick('窯哥'); });      // an ordinary battle: never matched with the weather pool
    await sleep(600);
    await A.evaluate(() => { ZZ.App.openSheet('online'); ZZ.Net.quick('阿磚', false, 'wx'); });
    await sleep(600);
    await B.evaluate(() => { ZZ.App.openSheet('online'); ZZ.Net.quick('小瓦', false, 'wx'); });
    const both = await until(async () => { const a = await sky(A), b = await sky(B); return a && b && a.mode === 'net' && b.mode === 'net'; }, 15000);
    ok(both, 'the two weather players are matched', [await sky(A), await sky(B)]);
    const sa = await sky(A), sb = await sky(B);
    ok(sa.sky && sb.sky && sa.seed === sb.seed && sa.seed > 0, 'both play under the same sky', [sa, sb]);
    ok(await C.evaluate(() => ZZ.Net.state === 'matching'), 'the ordinary player is still waiting');
    await C.evaluate(() => ZZ.Net.leave());
    await until(async () => (await sky(A)).state === 'play' && (await sky(B)).state === 'play', 8000);
    await quad(A);
    ok(await until(async () => !!(await sky(B)).hit, 6000), "A's four-line clear lands on B's sky", await sky(B));
    ok(!(await sky(A)).hit, 'and not on A');
    await B.screenshot({ path: path.join(OUT, 'wx-net-hit.png') });
    await A.evaluate(() => ZZ.Net.leave()); await B.evaluate(() => ZZ.Net.leave());
    await A.evaluate(() => ZZ.App.toMenu()); await B.evaluate(() => ZZ.App.toMenu());
    await sleep(500);

    // ---------- a friend's room with the weather switch ----------
    await A.evaluate(() => { ZZ.App.openSheet('online'); ZZ.Net.open('阿磚'); });
    ok(await until(() => A.evaluate(() => ZZ.Net.state === 'waiting' && !!ZZ.Net.code), 6000), 'A opens a room');
    const code = await A.evaluate(() => ZZ.Net.code);
    await B.evaluate(c => ZZ.Net.join(c, '小瓦'), code);
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 2 && document.querySelectorAll('[data-nmode]').length === 4), 10000), 'the host sees the four room modes with two in the room');
    await A.click('[data-nmode="lv"]');
    ok(await until(() => B.evaluate(() => ZZ.Net.cfg.mode === 'lv' && /關卡地形/.test(document.getElementById('sheet').textContent)), 5000), 'the guest is told the room plays on a level wall');
    await A.click('[data-nmode="wx"]');
    ok(await until(() => B.evaluate(() => ZZ.Net.cfg.wx === true && ZZ.Net.cfg.mode === 'wx'), 5000), 'the guest is told the room has weather');
    await A.click('[data-do="netStart"]');
    ok(await until(async () => { const a = await sky(A), b = await sky(B); return a && b && a.sky && b.sky && a.seed === b.seed; }, 8000), 'the room plays under one sky');
    // the host switches to a level wall and starts again: both start on the same numbered level's wall
    await A.evaluate(() => { ZZ.Net.setCfg({ minutes: 1, items: false, team: false, mode: 'lv' }); ZZ.Net.start(); });
    const wall = P => P.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'battle' ? { lv: S.lvNo || 0, sky: !!S.sky, cells: S.me.grid.reduce((n, r) => n + r.filter(c => c).length, 0) } : null; });
    ok(await until(async () => { const a = await wall(A), b = await wall(B); return a && b && a.lv > 0 && a.lv === b.lv && !a.sky && !b.sky && a.cells > 0; }, 8000), 'a level-wall room starts both on the same level', [await wall(A), await wall(B)]);
    // a 40-line race: no cement goes across, the first to 40 lines wins
    await A.evaluate(() => { ZZ.Net.setCfg({ minutes: 2, items: false, team: false, mode: 'race' }); ZZ.Net.start(); });
    ok(await until(async () => (await A.evaluate(() => { const S = ZZ.App.S(); return !!(S && S.race && S.state === 'play'); })) && (await B.evaluate(() => { const S = ZZ.App.S(); return !!(S && S.race && S.state === 'play'); })), 8000), 'both play a race');
    ok(await B.evaluate(() => { const S = ZZ.App.S(); const before = ZZ.Net.cfg; S.me.onAttack(4); return S.me.pendingTotal() === 0 && /\/ 40/.test(document.getElementById('hud').textContent); }), 'nobody sends cement, and the bar shows lines out of 40');
    await B.evaluate(() => { const S = ZZ.App.S(); S.me.stats.lines = 39; S.me.stats.lines = 40; S.me.hardDrop(); });
    ok(await until(async () => (await A.evaluate(() => ZZ.App.S().result)) === -1 && (await B.evaluate(() => ZZ.App.S().result)) === 1, 10000), 'the one who reached 40 first wins, the other loses', [await A.evaluate(() => ZZ.App.S().result), await B.evaluate(() => ZZ.App.S().result)]);
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('weather battle checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
