'use strict';
// Random matchmaking in real browsers against tools/dev-server.js: two players find each other and the match starts
// by itself; a player alone gets the computer after the wait, and the computer is named as one.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8777, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const open = async name => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(500);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    return page;
  };
  const st = p => p.evaluate(() => ({ net: ZZ.Net.state, matched: ZZ.Net.matched, host: ZZ.Net.host, S: ZZ.peek().S ? { kind: ZZ.peek().S.kind, mode: ZZ.peek().S.mode, opp: ZZ.peek().S.oppName, state: ZZ.peek().S.state } : null, sheet: ZZ.peek().sheet }));
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  try {
    const A = await open('A'), B = await open('B');
    await A.evaluate(() => ZZ.App.go.online());
    await sleep(300);
    ok(await A.evaluate(() => !!document.querySelector('[data-do="netQuick"]')), 'the online sheet offers quick match');
    await A.click('[data-do="netQuick"]');
    ok(await until(async () => (await st(A)).net === 'matching', 3000), 'A is looking');
    await sleep(1200);
    ok(await A.evaluate(() => /正在找對手/.test(document.getElementById('sheetCard').textContent)), 'A sees the countdown');
    await B.evaluate(() => { ZZ.App.go.online(); });
    await sleep(300);
    await B.click('[data-do="netQuick"]');
    const both = await until(async () => { const a = await st(A), b = await st(B); return a.S && b.S && a.S.mode === 'net' && b.S.mode === 'net'; }, 15000);
    const a = await st(A), b = await st(B);
    ok(both, 'they found each other and the match started by itself', [a, b]);
    ok(a.host !== b.host && a.matched && b.matched, 'one hosts, one joined', [a, b]);
    // a few seconds of play goes across
    await sleep(3500);
    for (const k of ['Space', 'Space', 'Space']) { await A.keyboard.press(k); await sleep(200); }
    await sleep(2500);
    const seen = await B.evaluate(() => ZZ.peek().S.opp.grid.some(r => r.some(v => v)));
    ok(seen, "B sees A's wall");
    await A.evaluate(() => ZZ.Net.leave()); await B.evaluate(() => ZZ.Net.leave());
    await sleep(600);

    // alone: the computer, after the wait
    const C = await open('C');
    await C.evaluate(() => { ZZ.Net.QUICK_WAIT = 4000; ZZ.App.go.online(); });
    await sleep(300);
    await C.click('[data-do="netQuick"]');
    const cpu = await until(async () => { const c = await st(C); return c.S && c.S.kind === 'battle'; }, 9000);
    const c = await st(C);
    ok(cpu && c.S.mode === 'ai' && /電腦/.test(c.S.opp), 'nobody came, so the computer plays, and is named as the computer', c);
    const rooms = await (await fetch('http://127.0.0.1:' + PORT + '/_dev/state')).json();
    ok(!rooms.rooms.some(r => r.seats === 1 && r.exp > Date.now() + 60000 && r.code), 'the empty room was taken down', rooms.rooms);
    // and the end card offers to look for a real player again
    await C.evaluate(() => { const S = ZZ.peek().S; S.state = 'play'; S.left = 200; });
    ok(await until(() => C.evaluate(() => !!document.querySelector('[data-do="netQuickAgain"]')), 8000), 'the result card offers another quick match');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close(); srv.kill();
  console.log('quick match checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
