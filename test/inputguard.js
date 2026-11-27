'use strict';
// The keys must keep answering for the whole match (2026-11-27: on an Android phone they stopped for the rest of a
// friend-room match, with nothing on screen). In a real browser on a touch phone: a lift the page never heard does not
// hold a key down; the same finger again lets its old key go; sound that breaks cannot stop a key; taps that cannot
// reach the keys, and keys that do nothing although they could, send one report and let every key go; a script
// error during a match is reported; setting up a key ends when another sheet opens. Needs the static server on 8790.
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const ctx = await b.newContext(Object.assign({}, devices['Pixel 7'], { locale: 'zh-TW' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/test boom/.test(e.message)) problems.push(e.message); });
    const sent = [];
    await p.route('**/api/rpc', async route => { const body = JSON.parse(route.request().postData() || '{}'); if (body.a === 'diag') sent.push(body); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(700);
    const play = async () => {
      await p.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 0, minutes: 3, items: false }));
      await p.evaluate(() => { if (ZZ.peek().sheet) ZZ.App.closeSheet(); });
      for (let i = 0; i < 40 && !(await p.evaluate(() => ZZ.peek().S.state === 'play' && !!ZZ.peek().S.me.cur)); i++) await sleep(100);
    };
    await play();
    ok(await p.evaluate(() => ZZ.App.env.touch && !document.getElementById('pad').hidden), 'a touch phone: the keys are on screen');
    const center = k => p.evaluate(k => { const e = document.querySelector('#pad .key[data-k="' + k + '"]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, k);
    const ptr = (type, k, id) => p.evaluate(([type, k, id]) => { const e = document.querySelector('#pad .key[data-k="' + k + '"]'), r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }, [type, k, id]);

    // 1) soft drop held, and its lift never arrives: once no finger is on the screen, it is let go
    await ptr('pointerdown', 'D', 71);
    ok(await p.evaluate(() => ZZ.App.input.sd === true && document.querySelector('#pad .key[data-k="D"]').classList.contains('on')), 'soft drop held');
    await p.evaluate(() => document.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })));
    ok(await p.evaluate(() => ZZ.App.input.sd === false && !document.querySelector('#pad .key[data-k="D"]').classList.contains('on') && !ZZ.peek().S.me.soft), 'no finger left on the screen: soft drop is let go (its lift was never heard)');
    // 2) the same finger comes down again on another key: the old one is let go
    await ptr('pointerdown', 'L', 72);
    await ptr('pointerdown', 'R', 72);
    ok(await p.evaluate(() => ZZ.App.input.l === false && ZZ.App.input.r === true && !document.querySelector('#pad .key[data-k="L"]').classList.contains('on')), 'the same finger again: its old key is let go', await p.evaluate(() => ({ l: ZZ.App.input.l, r: ZZ.App.input.r })));
    await ptr('pointerup', 'R', 72);
    // 3) a capture lost without a lift lets the key go too
    await ptr('pointerdown', 'L', 73);
    await p.evaluate(() => document.getElementById('pad').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 73, pointerType: 'touch', bubbles: true })));
    ok(await p.evaluate(() => ZZ.App.input.l === false && !document.querySelector('#pad .key[data-k="L"]').classList.contains('on')), 'a lost capture lets the key go');
    // 4) sound breaking cannot stop a key
    await p.evaluate(() => { window.__wake = ZZ.App.sfx.wake; ZZ.App.sfx.wake = function () { throw new Error('audio broke'); }; });
    let x0 = await p.evaluate(() => { const S = ZZ.peek().S, c = S.me.cur; if (!S.me.fits(c.type, c.rot, c.x - 1, c.y)) S.me.move(1); return S.me.cur.x; });
    const L = await center('L');
    await p.touchscreen.tap(L.x, L.y); await sleep(80);
    ok(await p.evaluate(() => ZZ.peek().S.me.cur.x) === x0 - 1, 'with the sound throwing, a tap still moves the piece');
    await p.evaluate(() => { ZZ.App.sfx.wake = window.__wake; });
    // 5) something on top of the keys: four taps that cannot reach them send one report, and every key is let go
    await play();
    sent.length = 0;
    await ptr('pointerdown', 'D', 74);     // a finger holding soft drop when the cover arrives
    await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cover'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:45%;z-index:99;background:transparent'; document.body.appendChild(d); });
    for (let i = 0; i < 4; i++) { await p.touchscreen.tap(L.x, L.y); await sleep(120); }
    await sleep(300);
    const rep = sent.find(s => s.kind === 'input');
    ok(rep && rep.d.why === 'blocked' && Array.isArray(rep.d.top) && /div#cover/.test(rep.d.top[0]) && rep.d.mode === 'ai' && rep.d.state === 'play', 'taps that cannot reach the keys: one report naming what is on top', rep);
    ok(await p.evaluate(() => ZZ.App.input.sd === false && ZZ.App.lastTrouble && ZZ.App.lastTrouble.why === 'blocked'), 'and the held soft drop is let go');
    ok(rep && !/key|secret/i.test(JSON.stringify(Object.keys(rep.d))) && !('name' in rep.d), 'the report holds the game state only');
    await p.evaluate(() => document.getElementById('cover').remove());
    // 6) keys that reach the game but do nothing although the piece could move: noticed (one report a match: no second)
    await p.evaluate(() => { const S = ZZ.peek().S; S.me.move = function () { return false; }; });
    for (let i = 0; i < 4; i++) { const r = await center(i % 2 ? 'R' : 'L'); await p.touchscreen.tap(r.x, r.y); await sleep(100); }
    ok(await p.evaluate(() => ZZ.App.lastTrouble && ZZ.App.lastTrouble.why === 'noeffect-tap'), 'keys that change nothing four times running are noticed', await p.evaluate(() => ZZ.App.lastTrouble));
    ok(sent.filter(s => s.kind === 'input').length === 1, 'one report a match');
    await p.evaluate(() => { delete ZZ.peek().S.me.move; });
    // 7) a script error during a match is reported (a few at most)
    await p.evaluate(() => setTimeout(() => { throw new Error('test boom'); }, 0));
    await sleep(400);
    const je = sent.find(s => s.kind === 'jserr');
    ok(je && /test boom/.test(je.d.msg) && je.d.state === 'play', 'a script error in a match is reported', je);
    // 8) the keys still play normally after all this
    x0 = await p.evaluate(() => { const S = ZZ.peek().S, c = S.me.cur; if (!S.me.fits(c.type, c.rot, c.x - 1, c.y)) S.me.move(1); return S.me.cur.x; });
    await p.touchscreen.tap(L.x, L.y); await sleep(80);
    ok(await p.evaluate(() => ZZ.peek().S.me.cur.x) === x0 - 1, 'the keys answer as before');
    // 9) a key being set up ends when another sheet takes its place
    await p.evaluate(() => { ZZ.App.openSheet('keys'); });
    await sleep(150);
    await p.evaluate(() => { const b = document.querySelector('[data-bind]'); if (b) b.click(); });
    const capOn = await p.evaluate(() => !!ZZ.App.capture);
    await p.evaluate(() => ZZ.App.openSheet('settings'));
    ok(capOn && !(await p.evaluate(() => !!ZZ.App.capture)), 'setting up a key ends when another sheet opens', { capOn });
    // 10) held sideways the keys' strip spans the wall: taps on the wall itself are not "something on top"
    const ctx2 = await b.newContext(Object.assign({}, devices['Pixel 7 landscape'], { locale: 'zh-TW' }));
    const q = await ctx2.newPage(), sent2 = [];
    q.on('pageerror', e => problems.push(e.message));
    await q.route('**/api/rpc', async route => { const body = JSON.parse(route.request().postData() || '{}'); if (body.a === 'diag') sent2.push(body); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await q.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(700);
    await q.evaluate(() => ZZ.App.begin('battle', { mode: 'ai', level: 0, minutes: 3, items: false }));
    await q.evaluate(() => { if (ZZ.peek().sheet) ZZ.App.closeSheet(); });
    for (let i = 0; i < 40 && !(await q.evaluate(() => ZZ.peek().S.state === 'play' && !!ZZ.peek().S.me.cur)); i++) await sleep(100);
    const wall = await q.evaluate(() => { const c = document.querySelector('#play canvas'); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8, land: document.getElementById('play').classList.contains('land') }; });
    for (let i = 0; i < 6; i++) { await q.touchscreen.tap(wall.x, wall.y); await sleep(100); }
    await sleep(200);
    ok(wall.land && !sent2.length && !(await q.evaluate(() => ZZ.App.lastTrouble)), 'sideways: taps on the wall send nothing', { wall, sent2 });
    await ctx2.close();
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await b.close();
  console.log('input guard checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
