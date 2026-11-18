'use strict';
// Two pages play an online match against each other. Default transport is the in-browser test channel (?net=bc);
// set ZZ_PEER=host:port/path to go through a real PeerJS broker and WebRTC instead.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const BASE = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const PEER = process.env.ZZ_PEER || '';
const Q = PEER ? '?peer=' + encodeURIComponent(PEER) : '?net=bc&code=TEST2';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1, locale: 'zh-TW' });
  async function open(name) {
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await page.goto(BASE + Q);
    await sleep(600);
    return page;
  }
  const ev = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;var N=ZZ.Net;' + expr + '})()');
  const A = await open('host'), B = await open('guest');
  await ev(A, 'ZZ.Meta.data.name = "阿明"; return 1'); await ev(B, 'ZZ.Meta.data.name = "小華"; return 1');
  await A.click('[data-go="online"]'); await sleep(200);
  await A.click('[data-do="netOpen"]');
  for (let i = 0; i < 40 && (await ev(A, 'return N.state')) !== 'waiting'; i++) await sleep(250);
  const code = await ev(A, 'return N.code');
  ok((await ev(A, 'return N.state')) === 'waiting' && /^[A-Z0-9]{5}$/.test(code), 'host has a room code', [await ev(A, 'return N.state'), code, await ev(A, 'return N.err')]);
  await A.screenshot({ path: path.join(OUT, 'n_wait.png') });
  await B.click('[data-go="online"]'); await sleep(200);
  await B.fill('#nCode', code.toLowerCase());
  await B.click('[data-do="netJoin"]');
  for (let i = 0; i < 60 && ((await ev(A, 'return N.state')) !== 'ready' || (await ev(B, 'return N.state')) !== 'ready'); i++) await sleep(250);
  ok((await ev(A, 'return N.state')) === 'ready' && (await ev(B, 'return N.state')) === 'ready', 'both sides connected', [await ev(A, 'return N.state'), await ev(B, 'return [N.state, N.err]')]);
  ok((await ev(A, 'return N.foe')) === '小華' && (await ev(B, 'return N.foe')) === '阿明', 'names were exchanged');
  // host changes the rules, guest sees them
  await A.click('[data-nmin="1"]'); await sleep(300);
  await A.evaluate(() => document.getElementById('nItems').click()); await sleep(300);
  ok((await ev(B, 'return N.cfg.minutes === 1 && N.cfg.items === true')), 'guest sees the host rules', await ev(B, 'return N.cfg'));
  await B.screenshot({ path: path.join(OUT, 'n_guest.png') });
  await A.click('[data-do="netStart"]'); await sleep(2800);
  ok((await ev(A, 'return S && S.mode === "net" && S.state === "play"')) && (await ev(B, 'return S && S.mode === "net" && S.state === "play"')), 'both are playing');
  ok((await ev(A, 'return S.me.seed')) === (await ev(B, 'return S.me.seed')), 'same piece order for both');
  ok((await ev(A, 'return S.oppName')) === '小華', 'opponent name on the HUD');
  // A stacks a few pieces; B's mirror of A shows the same wall
  for (let i = 0; i < 8; i++) { await A.bringToFront(); await A.keyboard.press(['KeyA', 'KeyD', 'KeyA', 'KeyD'][i % 4]); await A.keyboard.press('Space'); await sleep(120); }
  await sleep(500);
  const wallA = await ev(A, 'return S.me.grid.map(function(r){return Array.prototype.join.call(r,"")}).join("|")');
  const wallB = await ev(B, 'return S.opp.grid.map(function(r){return Array.prototype.join.call(r,"")}).join("|")');
  ok(wallA === wallB && /[1-7]/.test(wallA), 'guest mirrors the host wall');
  ok((await ev(B, 'return S.opp.stats.pieces')) === 8, 'piece count mirrored', await ev(B, 'return S.opp.stats.pieces'));
  // attack: A sends 4 lines, B gets them queued
  await ev(A, 'S.me.onAttack(4); return 1'); await sleep(400);
  ok((await ev(B, 'return S.me.pendingTotal()')) === 4, 'attack arrives on the other side', await ev(B, 'return S.me.pendingTotal()'));
  // item: A freezes B
  await ev(A, 'S.me.inv.push(6); return 1'); await A.bringToFront(); await A.keyboard.press('KeyF'); await sleep(400);
  ok((await ev(B, 'return S.freeze.me > 0')), 'freeze item lands on the other side');
  ok((await ev(A, 'return S.freeze.opp > 0')), 'and shows on the sender screen');
  // knockout: B tops out, A gets the credit
  await ev(B, 'S.me.topOut("lock"); return 1'); await sleep(600);
  ok((await ev(A, 'return S.ko.me')) === 1 && (await ev(B, 'return S.ko.opp')) === 1, 'knockout counted on both sides', [await ev(A, 'return S.ko'), await ev(B, 'return S.ko')]);
  await sleep(1500);
  ok((await ev(B, 'return !S.me.over')), 'knocked out side got back up');
  await A.bringToFront(); await A.screenshot({ path: path.join(OUT, 'n_play.png') });
  // end: both clocks run out, results agree
  await ev(A, 'S.left = 300; return 1'); await ev(B, 'S.left = 320; return 1');
  await sleep(2600);
  const rA = await ev(A, 'return {sheet:p.sheet, r:S.result, ko:S.ko}'), rB = await ev(B, 'return {sheet:p.sheet, r:S.result, ko:S.ko}');
  ok(rA.sheet === 'battleEnd' && rB.sheet === 'battleEnd', 'both see the result', [rA, rB]);
  ok(rA.r === 1 && rB.r === -1 && rA.ko.me === rB.ko.opp, 'results agree: host won', [rA, rB]);
  // rematch needs both
  await A.click('[data-do="again"]'); await sleep(400);
  ok((await ev(A, 'return p.sheet === "battleEnd" && N.wantAgain')), 'host waits for the other side');
  ok((await B.evaluate(() => document.getElementById('sheetCard').textContent.indexOf('對方想再來一場') >= 0)), 'guest is told the host wants a rematch');
  await B.click('[data-do="again"]'); await sleep(1200);
  ok((await ev(A, 'return S.state === "count" || S.state === "play"')) && (await ev(B, 'return S.state === "count" || S.state === "play"')), 'rematch started on both');
  // leaving mid-match hands the win to the one who stayed
  await sleep(2500);
  await B.bringToFront(); await B.keyboard.press('Escape'); await sleep(300);
  ok((await ev(B, 'return p.sheet')) === 'netLeave', 'pause shows the leave question');
  await B.click('[data-do="menu"]'); await sleep(1200);
  const left = await ev(A, 'return {sheet:p.sheet, why:S.why, r:S.result}');
  ok(left.sheet === 'battleEnd' && left.why === 'left' && left.r === 1, 'the one who stayed wins', left);
  await browser.close();
  console.log('net checks (' + (PEER ? 'peer ' + PEER : 'test channel') + '): ' + pass + ' passed, ' + fail + ' failed');
  console.log(problems.length ? problems.join('\n') : 'no page errors');
})();
