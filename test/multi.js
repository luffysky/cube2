'use strict';
// Rooms of three and four in real browsers, through tools/dev-server.js (the game's own relay):
// a free-for-all of three, then 2 vs 2. Attacks go to the target only; a player who leaves drops out; results add up.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8778, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
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
    const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(URL); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await page.evaluate(n => ZZ.Meta.setName(n), name);
    return page;
  };
  const S = p => p.evaluate(() => { const S = ZZ.peek().S; return S && S.kind === 'battle' ? { mode: S.mode, multi: !!S.multi, target: S.multi && S.multi.target, foes: S.multi && Object.keys(S.multi.foes).length, state: S.state, downs: S.ko.opp } : null; });
  try {
    // ---------- three players ----------
    const A = await open('阿磚'), B = await open('小瓦', 420, 860), C = await open('窯哥');
    await A.evaluate(() => ZZ.App.go.online()); await sleep(200);
    await A.click('[data-do="netOpen"]');
    ok(await until(() => A.evaluate(() => ZZ.Net.state === 'waiting' && !!ZZ.Net.code), 5000), 'A opens a room');
    const code = await A.evaluate(() => ZZ.Net.code);
    for (const P of [B, C]) { await P.evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code); }
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 3), 12000), 'two friends join: three in the room', await A.evaluate(() => ZZ.Net.roster()));
    ok(await until(async () => (await B.evaluate(() => ZZ.Net.count())) === 3 && (await C.evaluate(() => ZZ.Net.count())) === 3, 8000), 'everybody sees all three');
    await A.evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await A.evaluate(() => document.querySelectorAll('.roster li').length === 3 && /3／4/.test(document.getElementById('sheetCard').textContent)), 'the host sees the list of who is in');
    await A.screenshot({ path: path.join(OUT, 'multi-lobby.png') });
    await A.click('[data-do="netStart"]');
    const started = await until(async () => { const a = await S(A), b = await S(B), c = await S(C); return a && b && c && a.multi && b.multi && c.multi; }, 8000);
    ok(started, 'the match of three starts on every screen', [await S(A), await S(B), await S(C)]);
    ok(await A.evaluate(() => document.querySelectorAll('#strip .foe').length === 2 && !document.getElementById('strip').hidden), 'A has a name tag for each of the other two');
    const fourth = await open('遲到');
    ok((await fourth.evaluate(c => fetch('api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'join', code: c, key: 'latecomerkey0123456789abcdefgh' }) }).then(r => r.status), code)) === 409, 'nobody can come in once the match has started');
    await fourth.context().close();
    // A aims at C and sends cement: only C gets it
    await until(async () => (await S(A)).state === 'play', 6000);
    const cSeat = await C.evaluate(() => ZZ.Net.seat), bSeat = await B.evaluate(() => ZZ.Net.seat);
    await A.click('#strip .foe[data-foe="' + cSeat + '"]');
    ok((await S(A)).target === cSeat, 'tapping a name tag makes that player the target');
    ok(await A.evaluate(n => document.getElementById('oppName').textContent.indexOf(n) >= 0 || document.getElementById('oppNameW').textContent.indexOf(n) >= 0, '窯哥'), 'the wall on show is the target\'s');
    const pend = p => p.evaluate(() => ZZ.peek().S.me.pendingTotal() + ZZ.peek().S.me.stats.pieces * 0);
    const before = { b: await pend(B), c: await pend(C) };
    await A.evaluate(() => ZZ.Net.attack(4));
    await sleep(2500);
    const after = { b: await pend(B), c: await pend(C), cg: await C.evaluate(() => ZZ.peek().S.me.grid.filter(r => Array.from(r).some(v => v === 8)).length) };
    ok(after.b === before.b && (after.c > before.c || after.cg > 0), 'the cement reached the target and nobody else', [before, after]);
    // everybody's wall reaches everybody
    for (const P of [A, B, C]) for (let i = 0; i < 4; i++) { await P.keyboard.press('Space'); await sleep(120); }
    await sleep(2500);
    const seen = await B.evaluate(() => Object.values(ZZ.peek().S.multi.foes).map(f => f.g.grid.some(r => r.some(v => v))));
    ok(seen.length === 2 && seen.every(Boolean), 'B sees both other walls', seen);
    // a knockout is counted from the player's own report
    await C.evaluate(() => { const g = ZZ.peek().S.me; g.topOut('lock'); });
    ok(await until(() => A.evaluate(s => ZZ.peek().S.multi.foes[s].downs === 1, cSeat), 6000), "C's knockout shows on A's screen", await A.evaluate(s => ZZ.peek().S.multi.foes[s].downs, cSeat));
    // the knockout goes to whoever sent C the cement in the 15 seconds before (A), told by C itself
    ok(await until(() => A.evaluate(() => ZZ.peek().S.kda.k === 1), 6000), 'A gets the K for knocking C out', await A.evaluate(() => ZZ.peek().S.kda));
    ok(await B.evaluate(() => ZZ.peek().S.kda.k === 0 && ZZ.peek().S.kda.a === 0), 'B, who sent C nothing, gets neither', await B.evaluate(() => ZZ.peek().S.kda));
    await A.screenshot({ path: path.join(OUT, 'multi-play.png') });
    await B.screenshot({ path: path.join(OUT, 'multi-play-phone.png') });
    // B leaves mid-match: the other two play on
    await B.evaluate(() => ZZ.Net.leave()); await B.goto('about:blank');
    ok(await until(() => A.evaluate(s => ZZ.peek().S.multi.foes[s].gone, bSeat), 8000), 'A sees B leave');
    ok((await S(A)).state === 'play' && (await S(C)).state === 'play', 'and the match goes on for the other two');
    // time up: results
    for (const P of [A, C]) await P.evaluate(() => { ZZ.peek().S.left = 300; });
    ok(await until(async () => (await A.evaluate(() => ZZ.peek().sheet)) === 'battleEnd' && (await C.evaluate(() => ZZ.peek().sheet)) === 'battleEnd', 10000), 'both get the result card');
    const ra = await A.evaluate(() => ({ r: ZZ.peek().S.result, list: ZZ.peek().S.stand.list.map(p => [p.place, p.name, p.downs, p.gone]) }));
    const rc = await C.evaluate(() => ({ r: ZZ.peek().S.result }));
    ok(ra.r === 1 && rc.r === -1, 'A (no downs) wins, C (one down) does not', [ra, rc]);
    ok(ra.list[0][1] === '你' && ra.list[ra.list.length - 1][3] === true, 'the one who left is listed last', ra.list);
    await A.screenshot({ path: path.join(OUT, 'multi-end.png') });
    await A.evaluate(() => ZZ.Net.leave()); await C.evaluate(() => ZZ.Net.leave());
    await sleep(500);

    // ---------- 2 vs 2 ----------
    const P = [await open('一號'), await open('二號'), await open('三號'), await open('四號')];
    await P[0].evaluate(() => ZZ.App.go.online()); await sleep(200);
    await P[0].click('[data-do="netOpen"]');
    await until(() => P[0].evaluate(() => ZZ.Net.state === 'waiting' && !!ZZ.Net.code), 5000);
    const code2 = await P[0].evaluate(() => ZZ.Net.code);
    for (let i = 1; i < 4; i++) await P[i].evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code2);
    ok(await until(() => P[0].evaluate(() => ZZ.Net.count() === 4), 12000), 'four in the room');
    await P[0].evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await P[0].evaluate(() => !!document.getElementById('nTeam')), 'with four, the host can switch on teams');
    await P[0].click('label[for="nTeam"]');
    await sleep(300);
    ok(await P[0].evaluate(() => ZZ.Net.cfg.team === true && document.querySelectorAll('.roster li.t0').length === 2 && document.querySelectorAll('.roster li.t1').length === 2), 'teams are shown two and two');
    ok(await until(() => P[3].evaluate(() => ZZ.Net.cfg.team === true), 5000), 'guests hear about the teams');
    await P[0].click('[data-do="netStart"]');
    ok(await until(async () => { for (const p of P) { const s = await S(p); if (!s || !s.multi) return false; } return true; }, 8000), '2 vs 2 starts on all four');
    const info = await Promise.all(P.map(p => p.evaluate(() => { const M = ZZ.peek().S.multi; return { me: M.me, team: M.myTeam, target: M.target, targetTeam: M.foes[M.target].team, mates: Object.values(M.foes).filter(f => f.team === M.myTeam).length, tags: document.querySelectorAll('#strip .foe.mate').length }; })));
    ok(info.every(x => x.targetTeam !== x.team && x.mates === 1 && x.tags === 1), 'everyone aims at the other team and sees one teammate', info);
    // a teammate cannot be made the target
    const mate = await P[0].evaluate(() => { const M = ZZ.peek().S.multi; return Object.values(M.foes).filter(f => f.team === M.myTeam)[0].seat; });
    await P[0].evaluate(s => ZZ.App.setTarget(s), mate);
    ok((await S(P[0])).target !== mate, 'a teammate cannot be the target');
    await until(async () => (await S(P[0])).state === 'play', 6000);
    // team 1 goes down twice, team 0 once: team 0 wins
    const byTeam = k => P.filter((p, i) => info[i].team === k);
    await byTeam(1)[0].evaluate(() => ZZ.peek().S.me.topOut('lock'));
    await sleep(1600);
    await byTeam(1)[1].evaluate(() => ZZ.peek().S.me.topOut('lock'));
    await byTeam(0)[0].evaluate(() => ZZ.peek().S.me.topOut('lock'));
    await sleep(2500);
    for (const p of P) await p.evaluate(() => { ZZ.peek().S.left = 300; });
    ok(await until(async () => { for (const p of P) if ((await p.evaluate(() => ZZ.peek().sheet)) !== 'battleEnd') return false; return true; }, 10000), 'all four get the result card');
    const res = await Promise.all(P.map((p, i) => p.evaluate(() => ({ r: ZZ.peek().S.result, teams: ZZ.peek().S.stand.teams.map(t => t.downs) }))));
    ok(res.every((x, i) => x.r === (info[i].team === 0 ? 1 : -1)), 'the team with fewer downs wins, on every screen', res);
    await P[0].screenshot({ path: path.join(OUT, 'multi-team-end.png') });
    // rematch: everyone asks, the host starts again
    for (const p of P) await p.evaluate(() => ZZ.Net.again());
    ok(await until(async () => { for (const p of P) { const s = await S(p); if (!s || s.state === 'over') return false; } return true; }, 8000), 'a rematch starts once all four ask for one');
    for (const p of P) await p.close();
    // ---------- a room of eight: 4 vs 4 ----------
    const E = []; for (let i = 0; i < 8; i++) E.push(await open('八' + i, i ? 420 : 1280, i ? 860 : 800));
    await E[0].evaluate(() => ZZ.App.go.online()); await sleep(200);
    ok(await E[0].evaluate(() => document.querySelectorAll('[data-nsize]').length === 3), 'the host can pick a room of 4, 6 or 8');
    await E[0].click('[data-nsize="8"]'); await sleep(150);
    await E[0].click('[data-do="netOpen"]');
    await until(() => E[0].evaluate(() => ZZ.Net.state === 'waiting' && !!ZZ.Net.code), 5000);
    const code8 = await E[0].evaluate(() => ZZ.Net.code);
    ok(await E[0].evaluate(() => ZZ.Net.cap === 8), 'the room holds eight');
    for (let i = 1; i < 8; i++) await E[i].evaluate(c => ZZ.Net.join(c, ZZ.Meta.data.name), code8);
    ok(await until(() => E[0].evaluate(() => ZZ.Net.count() === 8), 20000), 'eight in the room', await E[0].evaluate(() => ZZ.Net.count()));
    await E[0].evaluate(() => ZZ.App.openSheet('online')); await sleep(300);
    ok(await E[0].evaluate(() => /8／8/.test(document.getElementById('sheetCard').textContent) && /4 對 4/.test(document.getElementById('sheetCard').textContent)), 'the lobby says 8 of 8 and offers 4 vs 4');
    await E[0].click('label[for="nTeam"]'); await sleep(300);
    await E[0].screenshot({ path: path.join(OUT, 'multi-8-lobby.png') });
    await E[0].click('[data-do="netStart"]');
    ok(await until(async () => { for (const p of E) { const s = await S(p); if (!s || !s.multi) return false; } return true; }, 12000), '4 vs 4 starts on all eight');
    const inf8 = await Promise.all(E.map(p => p.evaluate(() => { const M = ZZ.peek().S.multi; return { team: M.myTeam, foes: M.order.length, mates: Object.values(M.foes).filter(f => f.team === M.myTeam).length, rows: !!document.querySelector('#strip .foes.many') }; })));
    ok(inf8.every(x => x.foes === 7 && x.mates === 3 && x.rows), 'everyone sees seven others, three of them teammates, in two rows', inf8);
    await until(async () => (await S(E[0])).state === 'play', 6000);
    await sleep(1500);
    await E[0].screenshot({ path: path.join(OUT, 'multi-8-play.png') });
    await E[1].screenshot({ path: path.join(OUT, 'multi-8-phone.png') });
    const t1 = E.filter((p, i) => inf8[i].team === 1);
    await t1[0].evaluate(() => ZZ.peek().S.me.topOut('lock'));
    await sleep(2500);
    for (const p of E) await p.evaluate(() => { ZZ.peek().S.left = 300; });
    ok(await until(async () => { for (const p of E) if ((await p.evaluate(() => ZZ.peek().sheet)) !== 'battleEnd') return false; return true; }, 15000), 'all eight get the result card');
    const res8 = await Promise.all(E.map((p, i) => p.evaluate(() => ZZ.peek().S.result)));
    ok(res8.every((r, i) => r === (inf8[i].team === 0 ? 1 : -1)), 'the team that went down less wins, on every screen', res8);
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close(); srv.kill();
  console.log('multi checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
