'use strict';
// 守塔戰 (tower battle) in real browsers: against the computer (the switch in the battle sheet), and two players in a
// friend's room through tools/dev-server.js. Towers fall with the cement the other side sends and with knockouts;
// the match ends when one falls, and the taller tower wins.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8798, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
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
  const tw = p => p.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'battle' ? { tower: !!S.tower, state: S.state, t: ZZ.App.towers(), r: S.result, hud: document.getElementById('hud').textContent } : null; });
  try {
    // ---------- against the computer ----------
    const A = await open('阿磚');
    await A.evaluate(() => ZZ.App.openSheet('battle')); await sleep(200);
    ok(await A.evaluate(() => !!document.getElementById('bTower') && /守塔戰/.test(document.getElementById('sheetCard').textContent)), 'the battle sheet has the tower switch and says the rule');
    await A.click('label[for="bTower"]');
    await A.click('#sheetCard [data-do="fight"]');
    ok(await until(async () => { const s = await tw(A); return s && s.tower && s.state === 'play'; }, 8000), 'a tower battle against the computer starts');
    let s = await tw(A);
    ok(s.t.me === 100 && s.t.opp === 100 && /塔/.test(s.hud), 'both towers start at 100, shown in the bar', s);
    await A.evaluate(() => { ZZ.App.S().opp.stats.sent = 10; }); await sleep(300);
    s = await tw(A);
    ok(s.t.me === 80 && s.state === 'play', '10 lines sent at you take 20 off your tower', s.t);
    await A.evaluate(() => { ZZ.App.S().opp.topOut('lock'); }); await sleep(400);
    s = await tw(A);
    ok(s.t.opp === 80, 'knocking the computer out takes 20 off its tower', s.t);
    await A.screenshot({ path: path.join(OUT, 'tower-ai.png') });
    await A.evaluate(() => { ZZ.App.S().me.stats.sent = 40; }); await sleep(500);
    s = await tw(A);
    ok(s.t.opp === 0 && s.state === 'over' && s.r === 1, 'its tower at 0 ends the match, and you win', s);
    ok(await until(() => A.evaluate(() => /塔：你 80/.test(document.getElementById('sheetCard').textContent)), 4000), 'the result card shows both towers');
    // ---------- two players in a room ----------
    await A.evaluate(() => ZZ.App.toMenu());
    const H = await open('窯哥'), G = await open('小瓦');
    await H.evaluate(() => { ZZ.App.openSheet('online'); }); await sleep(200);
    await H.evaluate(() => ZZ.Net.open('窯哥'));
    ok(await until(() => H.evaluate(() => !!ZZ.Net.code), 8000), 'a room is opened');
    await G.evaluate(c => ZZ.Net.join(c, '小瓦'), await H.evaluate(() => ZZ.Net.code));
    ok(await until(() => H.evaluate(() => ZZ.Net.count() === 2 && !!document.querySelector('[data-nmode="tower"]')), 10000), 'the host can pick 守塔戰');
    await H.click('[data-nmode="tower"]');
    ok(await until(() => G.evaluate(() => ZZ.Net.cfg.mode === 'tower' && /守塔戰/.test(document.getElementById('sheet').textContent)), 5000), 'the guest is told the room is a tower battle');
    await H.click('[data-do="netStart"]');
    ok(await until(async () => { const a = await tw(H), b = await tw(G); return a && b && a.tower && b.tower && a.state === 'play' && b.state === 'play'; }, 8000), 'both play a tower battle');
    // the guest sends 50 lines' worth: the host's tower falls, on both screens
    await G.evaluate(() => { ZZ.App.S().me.stats.sent = 50; ZZ.App.S().me.hardDrop(); });
    ok(await until(async () => (await H.evaluate(() => ZZ.App.S().result)) === -1 && (await G.evaluate(() => ZZ.App.S().result)) === 1, 12000), 'the host\'s tower falls: the host loses, the guest wins', [await tw(H), await tw(G)]);
    await G.screenshot({ path: path.join(OUT, 'tower-net.png') });
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('tower checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
