'use strict';
// 大逃殺 (battle royale) in real browsers, three players through tools/dev-server.js: the mode needs three, the floor
// rises and is never cleared, one knockout puts a player out for good, the one who is out sends ghost lines, and the
// last one standing wins on every screen with the places in the order players went out.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8799, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
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
    const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await page.evaluate(n => ZZ.Meta.setName(n), name);
    return page;
  };
  const R = p => p.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'battle' ? { royale: !!S.royale, out: S.royale && S.royale.out, state: S.state, over: S.me.over, floor: S.me.floorRows(), result: S.result } : null; });
  try {
    const A = await open('阿磚'), B = await open('小瓦'), C = await open('窯哥', 420, 860);
    await A.evaluate(() => ZZ.App.go.online()); await sleep(200);
    await A.click('[data-do="netOpen"]');
    ok(await until(() => A.evaluate(() => !!ZZ.Net.code), 5000), 'A opens a room');
    const code = await A.evaluate(() => ZZ.Net.code);
    await B.evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code);
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 2), 10000), 'B joins');
    await A.evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await A.evaluate(() => { const b = document.querySelector('[data-nmode="royale"]'); return !!b && b.disabled; }), 'with two in the room, 大逃殺 cannot be picked');
    await C.evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code);
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 3 && !!document.querySelector('[data-nmode="royale"]') && !document.querySelector('[data-nmode="royale"]').disabled), 10000), 'with three it can');
    await A.click('[data-nmode="royale"]');
    ok(await until(() => C.evaluate(() => ZZ.Net.cfg.mode === 'royale' && /大逃殺/.test(document.getElementById('sheet').textContent)), 5000), 'everyone is told the room plays 大逃殺');
    await A.click('[data-do="netStart"]');
    ok(await until(async () => { const a = await R(A), b = await R(B), c = await R(C); return a && b && c && a.royale && b.royale && c.royale && a.state === 'play' && b.state === 'play' && c.state === 'play'; }, 10000), 'the royale starts for all three');
    // the floor: brought forward on A
    await A.evaluate(() => { ZZ.App.S().royale.floorT = 1; }); await sleep(400);
    ok((await R(A)).floor === 1, 'a floor row rises under A');
    // C goes down: out for good, a ghost
    await C.evaluate(() => ZZ.App.S().me.topOut('lock'));
    ok(await until(async () => (await R(C)).out === true, 4000), 'one knockout puts C out');
    await sleep(2200);
    ok((await R(C)).over === true, 'and C\'s wall stays down (no comeback)');
    ok(await until(() => A.evaluate(() => /出局/.test(document.getElementById('strip').textContent)), 5000), 'the others see C marked out');
    ok(await C.evaluate(() => !!document.querySelector('#strip [data-do="ghostSend"]')), 'C has the ghost button');
    const tgt = await C.evaluate(() => ZZ.App.S().multi.target);
    const victim = tgt === (await A.evaluate(() => ZZ.Net.seat)) ? A : B;
    const before = await victim.evaluate(() => ZZ.App.S().me.pendingTotal());
    await C.click('#strip [data-do="ghostSend"]');
    ok(await until(async () => (await victim.evaluate(() => ZZ.App.S().me.pendingTotal() + ZZ.App.S().me.grid.filter(r => Array.from(r).some(v => v === 8)).length)) > before, 5000), 'the ghost line reaches the one C picked');
    ok(await C.evaluate(() => document.querySelector('#strip [data-do="ghostSend"]').disabled), 'then the button waits 8 seconds');
    await C.screenshot({ path: path.join(OUT, 'royale-ghost.png') });
    // B goes down: only A is left, the match ends everywhere
    await sleep(400);
    await B.evaluate(() => ZZ.App.S().me.topOut('lock'));
    ok(await until(async () => (await R(A)).result === 1 && (await R(B)).result === -1 && (await R(C)).result === -1, 12000), 'the last one standing wins on every screen', [await R(A), await R(B), await R(C)]);
    const list = await A.evaluate(() => ZZ.App.S().stand.list.map(p => [p.place, p.name]));
    ok(list[0][1] === '你' && list[1][1] === '小瓦' && list[2][1] === '窯哥', 'places follow who lasted longest: A, then B, then C', list);
    await A.screenshot({ path: path.join(OUT, 'royale-end.png') });
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('royale checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
