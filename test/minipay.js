'use strict';
// The brick games paying into 轉磚 in a real browser: a game ends and says what it brings, the directory shows it
// waiting, 轉磚 pays it when it opens; and 轉磚's sign-up guide to SnowRealm Games. Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const page = await browser.newPage({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => problems.push(e.message + ' @ ' + page.url() + ' ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')));
    await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(800);
    const c0 = await page.evaluate(() => ZZ.Meta.data.coins);
    // a game of 磚蛇 on normal that scored 400 over two minutes
    await page.goto(BASE + 'games/snake/'); await sleep(400);
    await page.click('[data-lv="normal"]'); await page.click('#go'); await sleep(150);
    await page.evaluate(() => { const { g } = window.__snake(); g.score = 400; g.lives = 1; g.cement = []; g.spikes = []; g.portals = null; g.food = null; g.turns = []; g.body = g.body.slice(0, 3); g.body.forEach((p, i) => { p.x = 12 - i; p.y = 8; }); g.dir = 'right'; });
    // pretend it took two minutes (the start time is inside the page)
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 120000; });
    await page.waitForFunction(() => window.__snake().state === 'over', null, { timeout: 8000 });
    const card = await page.evaluate(() => document.querySelector('#end p.coins') && document.querySelector('#end p.coins').textContent);
    ok(/紀錄已存進/.test(card || '') && /不發金幣/.test(card || '') && !/\+\d+ 金幣/.test(card || ''), 'the end card says the record is kept and no coins are paid (no proof of a brick game yet)', card);
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('snowrealm.mini.queue')).length === 1), 'the result waits in the queue');
    await page.screenshot({ path: path.join(OUT, 'minipay-snake.png') });
    await page.goto(BASE + 'games/'); await sleep(300);
    const wallet = await page.evaluate(() => { const w = document.getElementById('wallet'); return w.hidden ? '' : w.textContent; });
    ok(!/待入帳/.test(wallet), 'the directory shows nothing waiting to be paid', wallet);
    ok(await page.evaluate(() => !!document.querySelector('a[href="https://games.snowrealm.pet/"]')), 'the directory links SnowRealm Games sign-up');
    await page.screenshot({ path: path.join(OUT, 'minipay-dir.png') });
    await page.addInitScript(() => { window.__toasts = []; document.addEventListener('DOMContentLoaded', () => { ['toast', 'mtoast'].forEach(id => { const t = document.getElementById(id); if (t) new MutationObserver(() => window.__toasts.push(t.textContent)).observe(t, { childList: true, characterData: true, subtree: true }); }); }); });
    await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(2600);
    const after = await page.evaluate(() => ({ coins: ZZ.Meta.data.coins, best: ZZ.Meta.data.mini.snake[1], q: localStorage.getItem('snowrealm.mini.queue'), toast: window.__toasts.join(' | ') }));
    ok(after.coins === c0 && after.best === 400 && !after.q, '轉磚 takes it on opening: the best is kept, no coins', after);
    ok(!/金幣入帳/.test(after.toast), 'and says no coins came in', after.toast);
    // a level game: stars carried in the record show in the game's own list
    await page.evaluate(() => { ZZ.Meta.data.mini.push = '30'; ZZ.Meta.save(); });
    await page.goto(BASE + 'games/push/'); await sleep(400);
    ok(await page.evaluate(() => /★★★/.test(document.querySelector('[data-lv="0"]').textContent) && !document.querySelector('[data-lv="1"]').disabled), 'stars in the record count in the level list');
    // the play log: with a cloud save on this browser, a brick game goes straight to the server too (one request,
    // the save's own key, the result's own id), and 轉磚 still takes the queue (the server counts it once by that id)
    {
      const sent = []; let answer = 200;
      await page.route('**/api/rpc', async route => {
        const req = route.request();
        sent.push({ auth: req.headers()['authorization'] || '', body: JSON.parse(req.postData() || '{}') });
        const b = sent[sent.length - 1].body;
        await route.fulfill({ status: b.a === 'sync' ? answer : 200, contentType: 'application/json', body: JSON.stringify(b.a !== 'sync' ? { ok: true, list: [], inv: [] } : answer === 200 ? { ok: true, st: {}, res: [] } : { ok: false }) });
      });
      await page.goto(BASE + 'games/'); await sleep(200);
      await page.evaluate(() => localStorage.setItem('zhuanzhuan.cloud.v1', JSON.stringify({ v: 1, id: '11111111-2222-4333-8444-555555555555', key: 'testkeytestkey', q: [] })));
      await page.goto(BASE + 'games/stack/'); await sleep(300);
      await page.evaluate(() => window.SnowRealmMini.report({ game: 'stack', lv: 1, value: 12, ms: 40000 }));
      await sleep(300);
      const q1 = await page.evaluate(() => JSON.parse(localStorage.getItem('snowrealm.mini.queue') || '[]'));
      const m = sent.find(x => x.body && x.body.ops && x.body.ops[0].k === 'mini');
      ok(m && m.auth === 'Bearer 11111111-2222-4333-8444-555555555555.testkeytestkey' && m.body.a === 'sync' && m.body.ops[0].a[0] === 'stack' && m.body.ops[0].a[5] === q1[0].id && m.body.ops[0].i === 'm' + q1[0].id,
        'a brick game result goes to the cloud save at once, with its own id (and still waits for 轉磚)', [m, q1]);
      // 地城小隊's runs: sent; kept for 轉磚 only when the server did not take it
      await page.goto(BASE + 'games/dungeon/'); await sleep(300);
      ok(await page.evaluate(() => window.SnowRealmMini.play('dungeon', 'party3', 420000, 1)) === true && await page.evaluate(() => !localStorage.getItem('snowrealm.play.queue')), 'a dungeon run: sent, nothing left waiting');
      const pz = sent.find(x => x.body.ops && x.body.ops[0] && x.body.ops[0].k === 'play');
      ok(pz && JSON.stringify(pz.body.ops[0].a.slice(0, 4)) === JSON.stringify(['dungeon', 'party3', 420000, 1]), 'as a play of the dungeon', pz);
      answer = 503;
      await page.evaluate(() => window.SnowRealmMini.play('dungeon', 'solo1', 60000, -1));
      const left = await page.evaluate(() => JSON.parse(localStorage.getItem('snowrealm.play.queue') || '[]'));
      ok(left.length === 1 && left[0].mode === 'solo1' && left[0].result === -1, 'the server down: it waits in this browser', left);
      await page.unroute('**/api/rpc');
      // without a save on this browser nothing is sent; 轉磚 sends what waits when it opens
      await page.evaluate(() => localStorage.removeItem('zhuanzhuan.cloud.v1'));
      const n0 = sent.length;
      await page.goto(BASE + 'games/snake/'); await sleep(200);
      await page.evaluate(() => window.SnowRealmMini.report({ game: 'snake', lv: 0, value: 50, ms: 30000 }));
      await sleep(200);
      ok(sent.length === n0, 'no save on this browser: nothing is sent from the brick game');
      await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(300);
      await page.evaluate(() => { window.__ops = []; const was = ZZ.Meta.onOp; ZZ.Meta.onOp = (k, a) => { window.__ops.push([k, a]); if (was) was(k, a); }; });
      await sleep(2600);
      const ops = await page.evaluate(() => window.__ops);
      const mini = ops.find(o => o[0] === 'mini' && o[1][0] === 'snake'), pl = ops.find(o => o[0] === 'play');
      ok(mini && typeof mini[1][5] === 'string' && pl && pl[1][0] === 'dungeon' && pl[1][1] === 'solo1' && pl[1][4] === left[0].id && !(await page.evaluate(() => localStorage.getItem('snowrealm.play.queue'))),
        '轉磚 takes both queues: the brick game with its id, the waiting dungeon run as a play', ops);
    }
    // sign-up guide
    await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(800);
    await page.click('[data-sheet="srAccount"]'); await sleep(300);
    const sr = await page.evaluate(() => { const a = document.querySelector('#sheetCard a[data-sr="signup"]'); return a && { href: a.href, target: a.target, rel: a.rel, text: document.getElementById('sheetCard').textContent }; });
    ok(sr && sr.href === 'https://games.snowrealm.pet/' && sr.target === '_blank' && /noopener/.test(sr.rel) && /右上角「登入」/.test(sr.text) && /註冊／登入/.test(sr.text), 'the sign-in / register entry leads to SnowRealm Games', sr);
    await page.screenshot({ path: path.join(OUT, 'minipay-signup.png') });
    await page.evaluate(() => ZZ.App.closeSheet()); await sleep(200);
    await page.click('[data-sheet="profile"]'); await sleep(300);
    ok(await page.evaluate(() => !!document.querySelector('#sheetCard a[data-sr="signup"]')), 'and the profile has it too');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('brick game coin checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
