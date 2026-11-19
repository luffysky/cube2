'use strict';
// The tape in a real browser: play a ranked match and part of a sprint with the keyboard, then check that the tape
// the page made gives the game's own numbers when it is played back, and that the server took the ranked match.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8776, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    await page.goto(URL); await sleep(500);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    const keys = ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'KeyZ', 'KeyC', 'ArrowDown', 'Space', 'Space', 'Space'];
    let rnd = 12345; const pick = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return keys[rnd % keys.length]; };
    const mash = async (ms, only) => { for (const end = Date.now() + ms; Date.now() < end;) { const k = pick(); if (!only || only.indexOf(k) >= 0) await page.keyboard.press(k); await sleep(25); } };
    const playing = () => page.evaluate(() => { const S = ZZ.peek().S; return !!S && S.state === 'play'; });

    // ---- a ranked match ----
    await page.evaluate(() => { window.fins = []; const old = ZZ.Meta.onOp; ZZ.Meta.onOp = (k, a) => { if (k === 'fin') window.fins.push(JSON.parse(JSON.stringify(a))); return old && old(k, a); }; });
    await page.evaluate(() => ZZ.App.begin('battle', { mode: 'rank', minutes: 2, items: false, cfg: ZZ.Meta.botFor(900), foe: 'x' }));
    for (let i = 0; i < 80 && !(await playing()); i++) await sleep(100);
    ok(await playing(), 'the ranked match is under way');
    await mash(24000);
    const mid = await page.evaluate(() => { const S = ZZ.peek().S, tp = S.tape.done(); return { ev: tp.ev.length, holds: tp.ev.filter(e => e[6] === 1).length, cement: tp.ev.filter(e => e[0] === 'g').length, kos: tp.ev.filter(e => e[0] === 'o').length }; });
    ok(mid.ev > 30 && mid.holds > 0, 'the tape has pieces and holds on it', mid);
    await page.evaluate(() => { ZZ.peek().S.left = 300; });
    for (let i = 0; i < 80 && !(await page.evaluate(() => window.fins.length)); i++) await sleep(100);
    const fin = (await page.evaluate(() => window.fins))[0];
    ok(fin && fin[1] && fin[1].v === 1 && fin[1].ev.length >= mid.ev, 'the result went out with its tape', fin && [fin[0], fin[1] && fin[1].ev.length]);
    const v = await page.evaluate(a => ZZ.Replay.check(a[1]), fin), st = fin[0].stats;
    ok(v && v.pieces === st.pieces && v.lines === st.lines && v.spins === st.spins && v.minis === st.minis && v.xspins === st.xspins && v.quads === st.quads && v.maxCombo === st.maxCombo && v.attack >= st.sent && v.score <= st.score && v.kos === fin[0].koOpp && v.ms <= fin[0].ms + 500,
      'played back, the tape gives the numbers the game reported', [v, fin[0]]);
    console.log('  ranked: ' + JSON.stringify(mid) + ', tape ' + JSON.stringify(fin[1]).length + ' bytes');
    for (let i = 0; i < 80 && (await page.evaluate(() => ZZ.Cloud.busy || ZZ.Cloud.q.length)); i++) await sleep(100);
    const after = await page.evaluate(() => ({ rg: ZZ.Meta.data.rgames, st: ZZ.Cloud.status() }));
    ok(after.st === 'ok' && after.rg === 1, 'and the server counted the ranked match', after);

    // ---- a sprint, part of the way ----
    await page.goto(URL + '&go=sprint'); await sleep(600);
    for (let i = 0; i < 80 && !(await playing()); i++) await sleep(100);
    await mash(1100, ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space']);      // (short: mashing fills the wall within seconds, and the next key press starts over)
    const sp = await page.evaluate(() => { const S = ZZ.peek().S, tp = S.tape.done(), v = ZZ.Replay.check(JSON.parse(JSON.stringify(tp))), st = S.me.stats; return { n: tp.ev.length, same: !!v && v.pieces === st.pieces && v.lines === st.lines && v.score <= st.score, v, st }; });
    ok(sp.n > 3 && sp.same, 'a sprint tape plays back the same too', sp);
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close(); srv.kill();
  console.log('tape (browser) checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
