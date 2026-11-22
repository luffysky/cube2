'use strict';
// 磚之冒險 第一章 in a real browser: the map, picking a class, a fight (damage, the monster's cement, the skill on the
// item key), winning a stage with the reward checked by the server, the boss getting angry, and losing.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8802, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
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
  try {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const A = await ctx.newPage();
    A.on('pageerror', e => problems.push(e.message));
    await A.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await A.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    const fight = () => A.evaluate(() => { const S = ZZ.App.S(); return S && S.kind === 'rpg' ? { n: S.rpg.n, hp: S.rpg.hp, max: S.rpg.max, state: S.state, charge: S.rpg.charge, need: S.rpg.need, rage: S.rpg.rage, every: S.rpg.every, pend: S.me.pendingTotal(), shield: S.me.shield, strip: document.getElementById('strip').textContent } : null; });
    // ---------- the menu and the map ----------
    ok(await A.evaluate(() => !!document.querySelector('.menu-in [data-go="rpg"]') && /磚之冒險/.test(document.querySelector('.menu-in [data-go="rpg"]').textContent)), 'the menu has 磚之冒險');
    const freshOn = await A.evaluate(() => Date.now() < ZZ.App.freshUntil);      // the 新 tags come off by themselves after a while
    if (freshOn) ok(await A.evaluate(() => ['rpg', 'battle', 'online'].every(g => document.querySelector('.menu-in [data-go="' + g + '"]').classList.contains('fresh')) && document.querySelector('.drawer [data-sheet="history"]').classList.contains('fresh') && !document.querySelector('.menu-in [data-go="rank"]').classList.contains('fresh')), 'what was added lately is tagged 新');
    await A.click('.menu-in [data-go="rpg"]');
    ok(await until(() => A.evaluate(() => /第一章：迷霧森林/.test(document.getElementById('sheetCard').textContent)), 3000), 'the map opens on chapter 1');
    if (freshOn) ok(await A.evaluate(() => !document.querySelector('.menu-in [data-go="rpg"]').classList.contains('fresh') && !document.querySelector('.drawer [data-go="rpg"]').classList.contains('fresh') && document.querySelector('.menu-in [data-go="battle"]').classList.contains('fresh')), 'opening it once takes its tag away, everywhere; the others stay');
    ok(await A.evaluate(() => document.querySelectorAll('[data-rpgo]').length === 10 && !document.querySelector('[data-rpgo="1"]').disabled && document.querySelector('[data-rpgo="2"]').disabled), 'ten stages; only the first is open');
    ok(await A.evaluate(() => /還沒解鎖/.test(document.querySelector('.rp-gear').textContent) && /騎士的裝備/.test(document.getElementById('sheetCard').textContent)), 'the gear slots of the class start locked');
    await A.screenshot({ path: path.join(OUT, 'rpg-map.png') });
    await A.click('[data-rpcls="mage"]');
    ok(await until(() => A.evaluate(() => ZZ.Meta.data.rpg.cls === 'mage' && document.querySelector('[data-rpcls="mage"]').getAttribute('aria-checked') === 'true' && /法師的裝備/.test(document.getElementById('sheetCard').textContent) && /法杖/.test(document.querySelector('.rp-gear').textContent)), 3000), 'picking 法師 is kept, and the mage\'s own gear is shown');
    // ---------- a fight ----------
    await A.click('[data-rpgo="1"]');
    ok(await until(async () => { const f = await fight(); return f && f.state === 'play'; }, 8000), 'stage 1 starts');
    let f = await fight();
    ok(f.hp === 16 && f.need === 6 && /史萊姆/.test(f.strip) && /16／16/.test(f.strip), 'the monster and its hit points are on the strip; a mage needs 6 lines', f);
    await A.evaluate(() => ZZ.App.kinds.rpg.lock({ lines: 4, attack: 4, tspin: 'none' })); await sleep(200);
    f = await fight();
    ok(f.hp === 4 && f.charge === 4 && /-12/.test(f.strip), 'a four-line clear does 12 damage and charges the skill', f);
    await A.evaluate(() => { ZZ.App.S().rpg.t = 50; }); await sleep(400);
    f = await fight();
    ok(f.pend === 1, 'the monster sends a line of cement on its clock', f);
    await A.evaluate(() => { ZZ.App.S().rpg.charge = 6; }); await sleep(200);
    ok(/放技能（F）/.test((await fight()).strip), 'a full gauge says the skill is ready, with its key');
    await A.evaluate(() => { const g = ZZ.App.S().me; g.pushGarbage(5, 3); });
    const rows0 = await A.evaluate(() => ZZ.App.S().me.grid.filter(r => r.some(c => c)).length);
    await A.keyboard.press('KeyF'); await sleep(250);
    const rows1 = await A.evaluate(() => ZZ.App.S().me.grid.filter(r => r.some(c => c)).length);
    ok(rows1 === rows0 - 4 && (await fight()).charge === 0, 'the mage\'s skill on the item key clears four rows', [rows0, rows1]);
    await A.screenshot({ path: path.join(OUT, 'rpg-fight.png') });
    const c0 = await A.evaluate(() => ZZ.Meta.data.coins);
    await A.evaluate(() => { const S = ZZ.App.S(); S.rpg.pieces = 30; ZZ.App.kinds.rpg.lock({ lines: 4, attack: 4 }); });
    ok(await until(() => A.evaluate(() => /打倒了/.test(document.getElementById('sheetCard').textContent)), 5000), 'beating it shows the win card');
    ok(await until(() => A.evaluate(c => ZZ.Meta.data.rpg.best === 1 && ZZ.Meta.data.coins === c + 40 && ZZ.Cloud.q.length === 0, c0), 8000), 'the server agrees: stage 1 beaten, 40 coins', await A.evaluate(() => [ZZ.Meta.data.rpg, ZZ.Meta.data.coins]));
    ok(await A.evaluate(() => /40 金幣/.test(document.getElementById('sheetCard').textContent)), 'the card shows the coins');
    // ---------- the boss gets angry at half its hit points ----------
    await A.evaluate(() => { ZZ.App.closeSheet(); ZZ.App.begin('rpg', { stage: 10 }); }); await sleep(600);
    f = await fight();
    ok(f && f.n === 10 && f.hp === 140, 'the boss has 140 hit points', f);
    await A.evaluate(() => { ZZ.App.S().rpg.hp = 71; ZZ.App.kinds.rpg.lock({ lines: 1, attack: 0 }); }); await sleep(300);
    f = await fight();
    ok(f.rage && f.every === 4800, 'at half its hit points the boss attacks faster', f);
    // ---------- losing ----------
    await A.evaluate(() => ZZ.App.S().me.topOut('lock'));
    ok(await until(() => A.evaluate(() => /被打倒了/.test(document.getElementById('sheetCard').textContent)), 5000), 'topping out loses the fight');
    ok(await A.evaluate(() => ZZ.Meta.data.rpg.best === 1), 'and the record stays where it was');
    await A.click('[data-do="rpMap"]');
    ok(await until(() => A.evaluate(() => !document.querySelector('[data-rpgo="2"]').disabled && document.querySelector('[data-rpgo="3"]').disabled && document.getElementById('mRpg').textContent === '1/10'), 3000), 'back on the map stage 2 is open, and the menu shows 1/10');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('rpg checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
