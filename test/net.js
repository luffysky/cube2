'use strict';
// Two pages play an online match against each other. Default transport is the in-browser test channel (?net=bc);
// set ZZ_RELAY=1 to go through the game's own API (the test starts tools/dev-server.js for it),
// or ZZ_PEER=host:port/path to go through a real PeerJS broker and WebRTC instead.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const RELAY = !!process.env.ZZ_RELAY, PORT = 8773;
const BASE = RELAY ? 'http://127.0.0.1:' + PORT + '/index.html' : process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html';
const PEER = process.env.ZZ_PEER || '';
const Q = RELAY ? '' : PEER ? '?peer=' + encodeURIComponent(PEER) : '?net=bc&code=TEST2';
const W = RELAY ? 2.2 : 1;      // the relay needs a round trip or two more than a direct channel
const OUT = path.join(__dirname, '..', 'shots');
const nap = ms => new Promise(r => setTimeout(r, ms));
const sleep = ms => nap(ms * W);
const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await nap(120); } return false; };
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
(async () => {
  let srv = null;
  if (RELAY) { srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] }); await new Promise(r => srv.stdout.once('data', r)); }
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
  const problems = [], reqs = [];
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1, locale: 'zh-TW' });
  async function open(name) {
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    page.on('request', r => { if (!/^data:/.test(r.url())) reqs.push(r.url()); });
    await page.goto(BASE + Q);
    await sleep(600);
    if (RELAY) for (let i = 0; i < 40 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await nap(150);
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
  await A.click('[data-do="netStart"]'); await nap(RELAY ? 4600 : 2800);
  ok((await ev(A, 'return S && S.mode === "net" && S.state === "play"')) && (await ev(B, 'return S && S.mode === "net" && S.state === "play"')), 'both are playing');
  ok((await ev(A, 'return S.me.seed')) === (await ev(B, 'return S.me.seed')), 'same piece order for both');
  ok((await ev(A, 'return S.oppName')) === '小華', 'opponent name on the HUD');
  // A stacks a few pieces; B's mirror of A shows the same wall
  for (let i = 0; i < 8; i++) { await A.bringToFront(); await A.keyboard.press(['KeyA', 'KeyD', 'KeyA', 'KeyD'][i % 4]); await A.keyboard.press('Space'); await sleep(120); }
  await sleep(500);
  // (a page that is not in front runs its timers once a second, so in this two-tab test the watching side can lag)
  if (RELAY) await until(() => ev(B, 'return S.opp.stats.pieces === 8'), 8000);
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
  if (RELAY) {
    // Both pages are tabs of one browser here, so they share one save. Both finished at the same moment and both
    // wanted to make the cloud account: there must be one account, and both results must be on it.
    await until(async () => (await ev(A, 'return !ZZ.Cloud.busy && !ZZ.Cloud.q.length && !!ZZ.Cloud.cred')) && (await ev(B, 'return !ZZ.Cloud.busy && !ZZ.Cloud.q.length && !!ZZ.Cloud.cred')), 8000);
    const db = await (await fetch('http://127.0.0.1:' + PORT + '/_dev/state')).json();
    const ids = [await ev(A, 'return ZZ.Cloud.cred && ZZ.Cloud.cred.id'), await ev(B, 'return ZZ.Cloud.cred && ZZ.Cloud.cred.id')];
    ok(db.players.length === 1 && ids[0] === db.players[0].id && ids[1] === db.players[0].id, 'two tabs of one browser end up on one cloud account', [db.players, ids]);
    ok(db.players[0] && db.players[0].games === 2, 'and neither tab lost its result', db.players);
    await ev(A, 'ZZ.Cloud.flush(true); return 1'); await ev(B, 'ZZ.Cloud.flush(true); return 1');
    ok(await until(async () => (await ev(A, 'return ZZ.Meta.data.tot.games')) === 2 && (await ev(B, 'return ZZ.Meta.data.tot.games')) === 2, 5000), 'both tabs show both matches', [await ev(A, 'return ZZ.Meta.data.tot'), await ev(B, 'return ZZ.Meta.data.tot')]);
  }
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
  if (RELAY) {
    const api = (body) => fetch('http://127.0.0.1:' + PORT + '/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
    const state = async () => (await fetch('http://127.0.0.1:' + PORT + '/_dev/state')).json();
    await A.bringToFront(); await A.click('[data-do="menu"]'); await sleep(300);
    await B.bringToFront(); await sleep(300);

    // ---------- a room whose host is not looking (still in the chat app where the code was sent) ----------
    const hostKey = 'testhostkey0123456789testhostkey';
    const made = await api({ a: 'open', key: hostKey });
    ok(made.status === 200 && /^[A-Z0-9]{5}$/.test(made.json.code), 'a room with nobody watching it', made);
    await B.click('[data-go="online"]'); await sleep(200);
    await B.fill('#nCode', made.json.code);
    await B.click('[data-do="netJoin"]');
    ok(await until(() => ev(B, 'return N.state === "joining" && N.seated'), 6000), 'the guest gets into the room', await ev(B, 'return [N.state, N.seated, N.err]'));
    ok(await B.evaluate(() => /進房了/.test(document.getElementById('sheetCard').textContent) && !!document.querySelector('[data-do="netQuit"]')), 'and is told it is waiting for the host, with a way out');
    await B.screenshot({ path: path.join(OUT, 'n_seated.png') });
    await nap(2500);
    ok((await ev(B, 'return N.state')) === 'joining', 'it keeps waiting: the host may be back any moment');
    // the host comes back and answers: the guest connects after all
    let got = await api({ a: 'x', code: made.json.code, key: hostKey, role: 0, ack: 0, out: [{ n: 1, m: { t: 'hello', v: 1, name: '遲到的房主' } }, { n: 2, m: { t: 'cfg', minutes: 3, items: false } }] });
    ok(got.json.paired && got.json.in.some(l => l.m.t === 'hello' && typeof l.m.name === 'string'), 'the host finds the guest waiting', got.json);
    ok(await until(() => ev(B, 'return N.state === "ready" && N.foe === "遲到的房主" && !N.seated && N.cfg.minutes === 3'), 6000), 'and the guest is connected as soon as the host answers', await ev(B, 'return [N.state, N.foe, N.seated]'));
    await B.click('[data-do="netQuit"]'); await sleep(500);
    got = await api({ a: 'x', code: made.json.code, key: hostKey, role: 0, ack: 0, out: [] });
    ok(got.json.in.some(l => l.m.t === 'bye'), 'leaving says goodbye to the host', got.json.in.map(l => l.m.t));

    // ---------- a host who never comes back ----------
    const made2 = await api({ a: 'open', key: hostKey });
    await ev(B, 'N.QUIET.first = 2500; return 1');
    await B.fill('#nCode', made2.json.code);
    await B.click('[data-do="netJoin"]');
    ok(await until(() => ev(B, 'return N.state === "error"'), 12000) && (await ev(B, 'return N.err')) === 'host', 'the guest gives up after a while and says why', await ev(B, 'return [N.state, N.err]'));
    ok(await B.evaluate(() => /房主一直沒有回應/.test(document.getElementById('sheetCard').textContent)), 'in words that say what to do next');
    await B.screenshot({ path: path.join(OUT, 'n_nohost.png') });
    await nap(400);
    got = await api({ a: 'x', code: made2.json.code, key: hostKey, role: 0, ack: 0, out: [] });
    ok(got.status === 200 && got.json.in[got.json.in.length - 1].m.t === 'bye', 'and leaves a goodbye, so a host who does come back is not shown a live room', got.json && got.json.in.map(l => l.m.t));
    await ev(B, 'N.QUIET.first = 150000; return 1');
    await B.click('[data-do="close"]'); await sleep(200);

    // ---------- the host closes the page while waiting: the code stops working ----------
    const C = await open('host2');
    await C.click('[data-go="online"]'); await sleep(200);
    await C.click('[data-do="netOpen"]');
    await until(() => ev(C, 'return N.state === "waiting"'), 8000);
    const code3 = await ev(C, 'return N.code');
    ok((await state()).rooms.some(r => r.code === code3), 'a third tab opens a room', code3);
    await C.goto('about:blank'); await nap(700);
    ok(!(await state()).rooms.some(r => r.code === code3), 'closing the page takes the room down');
    ok((await api({ a: 'join', code: code3, key: 'testguestkey0123456789testguest' })).status === 404, 'so a friend who tries the code is told at once that the room is gone');
    await C.close();

    // what the relay asked of the server during all that
    const rooms = reqs.filter(u => /\/api\/room$/.test(u)).length;
    ok(rooms > 20 && reqs.every(u => /^http:\/\/127\.0\.0\.1:/.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u)), 'everything went through this site, nothing through a public broker', [rooms, reqs.filter(u => !/^http:\/\/127\.0\.0\.1:/.test(u) && !/fonts\./.test(u)).slice(0, 5)]);
    ok(await ev(A, 'return !window.Peer'), 'the PeerJS library was never loaded');
  }
  await browser.close();
  if (srv) srv.kill();
  console.log('net checks (' + (RELAY ? 'own relay' : PEER ? 'peer ' + PEER : 'test channel') + '): ' + pass + ' passed, ' + fail + ' failed');
  console.log(problems.length ? problems.join('\n') : 'no page errors');
})();
