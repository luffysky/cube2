'use strict';
// 搶地盤 (territory) in real browsers: against the computer (the switch in the battle sheet), and two players in a
// friend's room through tools/dev-server.js, where the host keeps the one field and both screens show the same.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8801, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
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
  const T = p => p.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'battle' ? { terr: !!S.terr, state: S.state, own: S.terr && S.terr.own.join(','), count: ZZ.App.terrCount(), r: S.result } : null; });
  const clear = (p, mine, lines, attack) => p.evaluate(([mine, lines, attack]) => { const S = ZZ.App.S(); ZZ.App.hooks.forEach(h => h(mine ? S.me : S.opp, { type: 'lock', lines, attack }, mine)); }, [mine, lines, attack]);
  try {
    // ---------- against the computer ----------
    const A = await open('阿磚');
    await A.evaluate(() => ZZ.App.openSheet('battle')); await sleep(200);
    await A.click('label[for="bTower"]'); await A.click('label[for="bTerr"]');
    ok(await A.evaluate(() => document.getElementById('bTerr').checked && !document.getElementById('bTower').checked), 'territory and the tower battle are one or the other');
    await A.click('#sheetCard [data-do="fight"]');
    ok(await until(async () => { const s = await T(A); return s && s.terr && s.state === 'play'; }, 8000), 'a territory battle against the computer starts');
    ok(await A.evaluate(() => document.querySelectorAll('#terr .tgrid i').length === 60), 'the 10 × 6 field is under the clock');
    await clear(A, true, 4, 4); await sleep(200);
    let s = await T(A);
    ok(s.count.me === 8 && s.count.best === 0, 'a four-line clear that sends 4 paints 8 cells', s.count);
    await clear(A, false, 2, 1); await sleep(200);
    s = await T(A);
    ok(s.count.me === 8 && s.count.best === 3, 'the computer paints its own', s.count);
    for (let i = 0; i < 7; i++) await clear(A, true, 4, 4);
    await sleep(200);
    s = await T(A);
    ok(s.count.me + s.count.best === 60 && s.count.best < 3, 'once the field is full, cells are taken from the leader', s.count);
    await A.screenshot({ path: path.join(OUT, 'terr-ai.png') });
    await A.evaluate(() => { ZZ.App.S().left = 200; });
    ok(await until(async () => (await T(A)).r === 1, 5000), 'at time-up the most cells wins', await T(A));
    ok(await until(() => A.evaluate(() => /地盤：你 \d+ 格/.test(document.getElementById('sheetCard').textContent)), 4000), 'the result card shows the cells');
    // ---------- two players in a room ----------
    await A.evaluate(() => ZZ.App.toMenu());
    const H = await open('窯哥'), G = await open('小瓦');
    await H.evaluate(() => ZZ.App.openSheet('online')); await sleep(200);
    await H.evaluate(() => ZZ.Net.open('窯哥'));
    ok(await until(() => H.evaluate(() => !!ZZ.Net.code), 8000), 'a room is opened');
    await G.evaluate(c => ZZ.Net.join(c, '小瓦'), await H.evaluate(() => ZZ.Net.code));
    ok(await until(() => H.evaluate(() => ZZ.Net.count() === 2 && !!document.querySelector('[data-nmode="terr"]')), 10000), 'the host can pick 搶地盤');
    await H.click('[data-nmode="terr"]');
    ok(await until(() => G.evaluate(() => ZZ.Net.cfg.mode === 'terr' && /搶地盤/.test(document.getElementById('sheet').textContent)), 5000), 'the guest is told the room plays 搶地盤');
    await H.click('[data-do="netStart"]');
    ok(await until(async () => { const a = await T(H), b = await T(G); return a && b && a.terr && b.terr && a.state === 'play' && b.state === 'play'; }, 8000), 'both play 搶地盤');
    await until(async () => (await T(G)).state === 'play', 4000);
    await clear(G, true, 3, 2);
    await clear(H, true, 1, 0);
    ok(await until(async () => { const a = await T(H), b = await T(G); return a.own === b.own && a.count.me === 1 && b.count.me === 5; }, 6000), 'the host keeps one field, and both screens show the same cells', [await T(H), await T(G)]);
    await G.screenshot({ path: path.join(OUT, 'terr-net.png') });
    for (const P of [H, G]) await P.evaluate(() => { ZZ.App.S().left = 300; });
    ok(await until(async () => (await T(H)).r === -1 && (await T(G)).r === 1, 10000), 'the one with more cells wins on both screens', [await T(H), await T(G)]);
    // ---------- quick match: two who picked 搶地盤 meet and play it ----------
    for (const P of [H, G]) { await P.evaluate(() => { ZZ.Net.leave(); ZZ.App.toMenu(); }); }
    await sleep(600);
    const D = await open('阿土'), E = await open('阿泥');
    for (const P of [D, E]) { await P.evaluate(() => ZZ.App.go.online()); await sleep(300); await P.click('[data-qmode="terr"]'); await sleep(150); }
    await D.click('[data-do="netQuick"]'); await sleep(800); await E.click('[data-do="netQuick"]');
    ok(await until(async () => { const a = await T(D), b = await T(E); return a && b && a.terr && b.terr && a.state === 'play' && b.state === 'play'; }, 15000), 'two who picked 搶地盤 in quick match are matched and play it');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('territory checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
