'use strict';
// 2v2 接力 (relay) in real browsers, four players through tools/dev-server.js: the mode needs an even room of four or
// more, teammates share one wall and take turns of 8 pieces (the wall, hold and next pieces go across), the one
// waiting cannot move and watches, and cement sent at a team lands only on the teammate who is playing.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8800, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await page.evaluate(n => ZZ.Meta.setName(n), name);
    return page;
  };
  const R = p => p.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'battle' ? { relay: !!S.relay, active: S.relay && S.relay.active, left: S.relay && S.relay.left, team: S.relay && S.relay.team, seat: ZZ.Net.seat, state: S.state, pieces: S.me.stats.pieces, can: ZZ.peek().input ? null : null } : null; });
  try {
    const P = [await open('阿磚'), await open('小瓦'), await open('窯哥'), await open('土角')];
    const [A] = P;
    await A.evaluate(() => ZZ.App.go.online()); await sleep(200);
    await A.click('[data-do="netOpen"]');
    ok(await until(() => A.evaluate(() => !!ZZ.Net.code), 5000), 'A opens a room');
    const code = await A.evaluate(() => ZZ.Net.code);
    await P[1].evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code);
    await P[2].evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code);
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 3), 10000), 'three in the room');
    await A.evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await A.evaluate(() => document.querySelector('[data-nmode="relay"]').disabled), 'with three, 接力 cannot be picked');
    await P[3].evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code);
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 4 && !document.querySelector('[data-nmode="relay"]').disabled), 10000), 'with four it can');
    await A.click('[data-nmode="relay"]');
    ok(await until(() => P[3].evaluate(() => ZZ.Net.cfg.mode === 'relay'), 5000), 'everyone is told it is a relay');
    await A.click('[data-do="netStart"]');
    ok(await until(async () => (await Promise.all(P.map(R))).every(r => r && r.relay && r.state === 'play'), 10000), 'the relay starts for all four', await Promise.all(P.map(R)));
    const rs = await Promise.all(P.map(R));
    const teams = {};
    rs.forEach((r, i) => { const k = r.team.join(','); (teams[k] = teams[k] || []).push(i); });
    const groups = Object.values(teams);
    ok(groups.length === 2 && groups.every(g => g.length === 2), 'two teams of two', rs.map(r => r.team));
    const [t1, t2] = groups;
    const first = t1.find(i => rs[i].active), second = t1.find(i => !rs[i].active);
    ok(first != null && second != null, 'one teammate plays, the other waits', rs);
    ok(await P[second].evaluate(() => { const before = ZZ.App.S().me.stats.pieces; ZZ.App.sheetDo; document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); return before; }) === 0, 'the one waiting has placed nothing');
    await P[second].keyboard.press('Space'); await sleep(300);
    ok((await R(P[second])).pieces === 0 || (await R(P[second])).active === false, 'and cannot move while waiting');
    // the first player places 8 pieces: the wall goes to the teammate
    for (let i = 0; i < 8; i++) { await P[first].keyboard.press('Space'); await sleep(260); }
    ok(await until(async () => (await R(P[second])).active === true && (await R(P[first])).active === false, 6000), 'after 8 pieces the teammate takes over', [await R(P[first]), await R(P[second])]);
    const took = await R(P[second]);
    ok(took.pieces === 8 && took.left === 8, 'with the same wall (8 pieces on it) and 8 to place', took);
    ok(await P[first].evaluate(() => /正在放/.test(document.getElementById('strip').textContent)), 'the one who handed over sees whose turn it is');
    await P[second].screenshot({ path: path.join(OUT, 'relay.png') });
    // cement at team 1 lands only on whoever is playing it now
    const foe = t2.find(i => rs[i].active);
    await P[foe].evaluate(t => { ZZ.App.setTarget(t); }, rs[second].seat);
    const pend = p => p.evaluate(() => ZZ.App.S().me.pendingTotal());
    const b = [await pend(P[first]), await pend(P[second])];
    await P[foe].evaluate(() => ZZ.Net.attack(3));
    ok(await until(async () => (await pend(P[second])) > b[1], 5000), 'cement lands on the teammate playing', [b, await pend(P[second])]);
    ok(await P[first].evaluate(() => (ZZ.App.S().hits || []).length === 0), 'the one waiting takes none of it (they only see it on the shared wall)');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('relay checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
