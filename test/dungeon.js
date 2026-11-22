'use strict';
// 地城小隊 in real browsers through tools/dev-server.js: a room of three (open, join with the code, classes, start),
// rounds that wait for everyone and come out the same on every screen, a cleared floor and the upgrades, the time
// running out for someone who does not pick, the host leaving, playing alone, and the way in from 轉磚.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8803, BASE = 'http://127.0.0.1:' + PORT + '/', URL = BASE + 'games/dungeon/index.html?lang=zh-Hant';
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
    const ctx = await browser.newContext({ viewport: { width: w || 400, height: h || 860 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(500);
    await page.fill('#name', name);
    return page;
  };
  const S = p => p.evaluate(() => { const s = DGPage.state(); return { screen: DGPage.screen(), ph: s && s.ph, fl: s && s.fl, rd: s && s.rd, h: s && s.h.map(h => [h.s, h.c, h.hp, h.a ? 1 : 0, h.off ? 1 : 0]), m: s && s.m.map(m => m.hp), log: s && s.log.length }; });
  try {
    // ---------- a room of three ----------
    const A = await open('阿勇'), B = await open('小弓'), C = await open('牧牧');
    ok(await A.evaluate(() => /地城小隊/.test(document.querySelector('h1').textContent) && document.querySelectorAll('#clsStart [data-cls]').length === 4), 'the page is there, with four classes');
    await A.click('#clsStart [data-cls="warrior"]');
    await A.click('#open');
    ok(await until(() => A.evaluate(() => DGPage.screen() === 'lobby' && /^[A-Z0-9]{5}$/.test(document.getElementById('lobbyCode').textContent)), 8000), 'a room is opened and its code shown');
    const code = await A.evaluate(() => document.getElementById('lobbyCode').textContent);
    await B.click('#clsStart [data-cls="ranger"]'); await B.fill('#code', code.toLowerCase()); await B.click('#join');
    await C.click('#clsStart [data-cls="cleric"]'); await C.fill('#code', code); await C.click('#join');
    ok(await until(() => A.evaluate(() => DGPage.lobby().length === 3), 10000), 'two friends join with the code (lower case works too)', await A.evaluate(() => DGPage.lobby()));
    ok(await until(() => C.evaluate(() => DGPage.screen() === 'lobby' && DGPage.lobby().length === 3 && /小弓/.test(document.getElementById('lobbyList').textContent) && /弓手/.test(document.getElementById('lobbyList').textContent)), 8000), 'everyone sees the whole party with their classes');
    ok(await B.evaluate(() => document.getElementById('go').hidden && !document.getElementById('lobbyWait').hidden), 'only the host can start');
    await B.click('#clsLobby [data-cls="mage"]');
    ok(await until(() => A.evaluate(() => DGPage.lobby().some(p => p.s === 1 && p.c === 'mage')), 6000), 'a class changed in the lobby reaches the host');
    await A.screenshot({ path: path.join(OUT, 'dungeon-lobby.png') });
    await A.click('#go');
    ok(await until(async () => (await Promise.all([A, B, C].map(S))).every(s => s.screen === 'play' && s.ph === 'fight' && s.fl === 1), 8000), 'the host starts: everyone is on floor 1');
    let s = await S(C);
    ok(s.h.length === 3 && s.h.map(h => h[1]).join() === 'warrior,mage,cleric' && s.m.length === 2, 'three heroes, two slimes on floor 1', s);
    // ---------- a round waits for everyone, and comes out the same everywhere ----------
    await A.click('[data-do="atk"]'); await A.click('[data-foe="0"]');
    ok(await until(() => B.evaluate(() => DGPage.state().h[0].a !== null && /已選/.test(document.getElementById('party').textContent)), 6000), 'the others see that the host has picked');
    ok(await A.evaluate(() => /你選了：攻擊/.test(document.getElementById('acts').textContent)), 'the host is told what they picked');
    await B.click('[data-do="skill"]');
    ok((await S(A)).rd === 1, 'the round waits for the last one');
    await C.click('[data-do="guard"]');
    ok(await until(async () => (await Promise.all([A, B, C].map(S))).every(x => x.rd === 2), 8000), 'everyone has picked: round 2 on every screen');
    const [a2, b2, c2] = await Promise.all([A, B, C].map(S));
    ok(JSON.stringify(a2.m) === JSON.stringify(b2.m) && JSON.stringify(a2.m) === JSON.stringify(c2.m) && JSON.stringify(a2.h.map(h => h[2])) === JSON.stringify(c2.h.map(h => h[2])), 'the same monsters and the same health on every screen', [a2, b2, c2]);
    ok(await B.evaluate(() => /丟出火球/.test(document.getElementById('log').textContent) && /防禦/.test(document.getElementById('log').textContent)), 'the battle log tells what happened');
    await B.screenshot({ path: path.join(OUT, 'dungeon-fight.png') });
    // ---------- the time runs out for someone who does not pick: they guard ----------
    await A.click('[data-do="guard"]'); await B.click('[data-do="guard"]');
    await A.evaluate(() => DGPage.deadline(300));
    ok(await until(async () => (await S(C)).rd === 3, 6000), 'time up: the round is played without the last pick');
    ok(await C.evaluate(() => DGPage.state().log.some(l => l[0] === 'guard' && l[1] === 2)), 'the one who did not pick guarded');
    // ---------- a cleared floor and the upgrades ----------
    await A.evaluate(() => { DGPage.state().m.forEach(m => { m.hp = 1; }); });
    await A.click('[data-do="atk"]'); await A.click('[data-foe="0"]');
    await B.click('[data-do="skill"]'); await C.click('[data-do="guard"]');
    ok(await until(async () => (await Promise.all([A, B, C].map(S))).every(x => x.screen === 'loot'), 8000), 'the floor is cleared: everyone picks an upgrade');
    ok(await B.evaluate(() => document.querySelectorAll('#ups [data-up]').length === 3), 'three upgrades to choose from');
    for (const P of [A, B, C]) await P.click('#ups [data-up]');
    ok(await until(async () => (await Promise.all([A, B, C].map(S))).every(x => x.screen === 'play' && x.fl === 2 && x.rd === 1), 8000), 'all have chosen: floor 2');
    // ---------- the host leaves ----------
    await A.click('.bar a').catch(() => {});
    await A.goto('about:blank');
    ok(await until(() => B.evaluate(() => DGPage.screen() === 'start' && /房主離開了/.test(document.getElementById('startErr').textContent)), 10000), 'the host leaving ends the game for the others');
    // ---------- alone ----------
    const D = await open('獨行俠');
    await D.click('#clsStart [data-cls="ranger"]'); await D.click('#solo');
    ok(await until(async () => (await S(D)).ph === 'fight', 3000), 'one player can play alone, without a room');
    await D.click('[data-do="atk"]'); await D.click('[data-foe="0"]');
    ok(await until(async () => (await S(D)).rd === 2, 3000), 'alone, a pick plays the round at once');
    await D.evaluate(() => { const s = DGPage.state(); s.h[0].hp = 1; s.h[0].df = 0; s.m.forEach(m => { m.atk = 999; }); });
    await D.click('[data-do="guard"]');
    ok(await until(() => D.evaluate(() => DGPage.screen() === 'end' && /全員倒下/.test(document.getElementById('endTitle').textContent)), 4000), 'losing shows the end');
    await D.click('#again');
    ok(await until(async () => { const x = await S(D); return x.ph === 'fight' && x.fl === 1 && x.rd === 1; }, 3000), 'and a new run starts');
    // ---------- a wrong code ----------
    const E = await open('路人');
    await E.fill('#code', 'ZZZZZ'); await E.click('#join');
    ok(await until(() => E.evaluate(() => /找不到這個房間/.test(document.getElementById('startErr').textContent)), 6000), 'a code with no room says so');
    // ---------- the way in from 轉磚 and the games page ----------
    const Z = await (await browser.newContext({ viewport: { width: 420, height: 860 } })).newPage();
    await Z.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(500);
    for (let i = 0; i < 60 && !(await Z.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await Z.evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await Z.evaluate(() => { const a = document.querySelector('#sheetCard a[href="games/dungeon/"]'); return !!a && /地城小隊/.test(a.textContent); }), '轉磚\'s online sheet links to 地城小隊');
    await Z.goto(BASE + 'games/index.html?lang=zh-Hant'); await sleep(500);
    ok(await Z.evaluate(() => !!document.querySelector('.cards a[href="dungeon/"]') && /多人一起玩/.test(document.body.textContent)), 'the games page has it under 多人一起玩');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('dungeon checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
