'use strict';
// The API end to end: the real request handlers and the real SQL, against a Postgres running inside this process.
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const core = require('../server/core.js');
const rules = require('../server/rules.js');
const { make } = require('../tools/pglite-db.js');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

let now = Date.UTC(2026, 10, 19, 4, 0, 0);   // noon in Taiwan, 19 Nov 2026
app.setClock(() => now);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
let pg = make();
dbm.use(pg);

function call(name, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'GET';
    req.url = o.url || '/api/' + name;
    req.headers = Object.assign({ host: 'game.test', 'x-real-ip': o.ip || '203.0.113.7' }, o.headers || {});
    if (o.parsed !== undefined) { req.headers['content-type'] = 'application/json'; req.body = o.parsed; }
    else if (o.body !== undefined) {
      const text = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
      if (!('content-type' in req.headers)) req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(Buffer.byteLength(text));
      req.push(text);
    }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ } resolve({ status: this.statusCode, headers: this.headers, json, text }); } };
    app.handle(name, req, res);
  });
}
const rpc = (body, cred, o) => call('rpc', Object.assign({ method: 'POST', body, headers: Object.assign({}, cred ? { authorization: 'Bearer ' + cred.id + '.' + cred.key } : {}, (o && o.headers) || {}) }, o && o.ip ? { ip: o.ip } : {}));
let opN = 0;
const op = (k, a) => ({ i: 'op' + String(++opN).padStart(6, '0'), k, a: a || [] });
const sync = (cred, ops, o) => rpc({ a: 'sync', ops: ops || [] }, cred, o);
const match = (o) => Object.assign({ mode: 'ai', result: 1, level: 2, ko: 2, koOpp: 0, itemsUsed: 0, ms: 120000, stats: { score: 12000, spins: 3, minis: 0, sent: 30, quads: 1, maxCombo: 2, xspins: 0, lines: 40, pieces: 120 } }, o || {});
async function newPlayer(st, ip) { const r = await rpc({ a: 'hello', st }, null, { ip }); if (!r.json || !r.json.ok) throw new Error('hello failed ' + r.text); return { id: r.json.id, key: r.json.key, pub: r.json.pub, st: r.json.st }; }
const dump = async () => { let all = ''; for (const t of ['players', 'keys', 'codes', 'scores', 'rate']) all += JSON.stringify(await pg.query('SELECT * FROM zz.' + t)); return all; };

(async () => {
  // ---------- health, and tables that make themselves ----------
  let r = await call('health');
  ok(r.status === 200 && r.json.ok && r.json.app === 'zhuanzhuan' && r.json.db === true && r.json.api === 1, 'health says the API is here and a database is linked', r.json);
  ok(/s-maxage/.test(r.headers['cache-control']), 'plain health can be cached');
  ok(pg.calls() === 0, 'plain health does not touch the database', pg.calls());
  r = await call('health', { method: 'POST' });
  eq(r.status, 405, 'health is GET only');
  let missing = false; try { await pg.query('SELECT 1 FROM zz.players'); } catch (e) { missing = e.code === '42P01' || e.code === '3F000'; }
  ok(missing, 'the database starts empty');
  r = await call('health', { url: '/api/health?deep=1' });
  ok(r.json.ready === true && typeof r.json.ms === 'number', 'deep health creates the tables on first use and reports a round trip', r.json);
  eq((await pg.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'zz'"))[0].n, 7, 'seven tables in their own schema');
  await dbm.migrate(); await dbm.migrate();
  ok(true, 'creating the tables again is harmless');

  // ---------- a new account ----------
  r = await rpc({ a: 'hello' });
  ok(r.status === 200 && r.json.ok && /^[0-9a-f-]{36}$/.test(r.json.id) && /^[A-Za-z0-9_-]{43}$/.test(r.json.key) && /^[a-z0-9]{8}$/.test(r.json.pub), 'hello makes an account', r.json);
  eq(r.headers['cache-control'], 'no-store', 'account answers are never cached');
  ok(r.json.st.coins === 200 && r.json.st.rp === 0 && r.json.ver === 1 && r.json.now === now, 'a fresh record', r.json.st);
  const A = { id: r.json.id, key: r.json.key, pub: r.json.pub };
  const everything = await dump();
  ok(everything.indexOf(A.key) < 0, 'the device secret is not stored anywhere');
  ok(everything.indexOf(core.sha(A.key)) >= 0, 'only its hash is');
  ok(everything.indexOf('203.0.113.7') < 0, 'no address is stored either');

  // a record brought in from the device is taken over, within reason
  const B = await newPlayer({ name: ' <i>林董</i> ', coins: 999999, rp: 5000, peak: 9999, rgames: 77, owned: { tile: ['neon', 'gem', 'nope'], bg: ['night'] }, equip: { tile: 'neon', bg: 'night', theme: 'market' },
    items: [5, 99, 3], tot: { games: 12, wins: 50, best: 9e9, sprint: 1200 }, first: { drills: [0, 1, 1, 400], openers: ['tsd', 'x'] }, note: { kind: 'season', coins: 1e9 } }, '203.0.113.8');
  ok(B.st.name === 'i林董/i' && B.st.coins === 20000 && B.st.rp === 900 && B.st.peak === 900 && B.st.rgames === 0, 'imported record is held to plausible values', B.st);
  eq(B.st.owned, { tile: ['neon'], bg: ['night'], theme: [], fx: [] }, 'only things that exist and can be bought are kept');
  eq(B.st.equip, { tile: 'neon', bg: 'night', theme: 'auto', fx: 'shard' }, 'a look that is not owned comes off');
  ok(B.st.items[1] === 20 && B.st.items[2] === 3 && B.st.items[0] === 0 && B.st.tot.wins === 12 && B.st.tot.sprint === 0 && B.st.note === null, 'items and totals clamped', B.st);
  eq(B.st.first, { drills: [0, 1], openers: ['tsd'] }, 'first clears: real ones only, once each');
  r = await call('board', { url: '/api/board?b=rp' });
  ok(r.status === 200 && r.json.top.length === 0, 'an imported rating is not on the board', r.json);
  r = await call('board', { url: '/api/board?b=score&s=all' });
  eq(r.json.top.length, 0, 'nor is an imported best score');

  // ---------- signing in ----------
  let c0 = pg.calls();
  r = await sync(A);
  ok(r.status === 200 && r.json.st.coins === 200 && r.json.pub === A.pub && r.json.res.length === 0, 'a pull returns the record', r.json);
  eq(pg.calls() - c0, 1, 'a pull is one round trip');
  eq((await sync({ id: A.id, key: 'x'.repeat(43) })).status, 401, 'wrong secret');
  eq((await sync({ id: B.id, key: A.key })).status, 401, "one player's secret does not open another's record");
  eq((await sync({ id: 'not-a-uuid', key: A.key })).status, 401, 'malformed id');
  eq((await rpc({ a: 'sync' }, null)).status, 401, 'no credentials');
  eq((await rpc({ a: 'sync' }, null, { headers: { authorization: 'Basic abc' } })).status, 401, 'wrong scheme');
  eq((await rpc({ a: 'sync' }, null, { headers: { authorization: 'Bearer ' + A.id + '.' + A.key + "' OR '1'='1" } })).status, 401, 'a quote in the header gets nowhere');

  // ---------- changes ----------
  c0 = pg.calls();
  r = await sync(A, [op('item', [1]), op('item', [1]), op('bring', [1])]);
  ok(r.json.ok && r.json.st.coins === 120 && r.json.st.items[1] === 2 && r.json.st.bring[0] === 1 && r.json.ver === 2 && r.json.res.every(x => x.ok), 'buying items costs coins on the server', r.json);
  eq(pg.calls() - c0, 2, 'a save is two round trips');
  r = await sync(A, [op('buy', ['tile', 'neon'])]);
  ok(r.json.ok && r.json.res[0].ok === false && r.json.res[0].why === 'poor' && r.json.st.coins === 120 && r.json.st.owned.tile.length === 0, 'cannot buy what you cannot afford, whatever the page says', r.json);
  r = await sync(A, [op('wear', ['tile', 'neon']), op('wear', ['bg', 'ember']), op('buy', ['tile', 'gem']), op('buy', ['tile', 'custom'])]);
  ok(r.json.res.every(x => x.ok === false) && r.json.st.equip.tile === 'glaze', 'cannot wear what you do not own', r.json.res);
  const again = op('item', [2]);
  r = await sync(A, [again]); const coinsAfter = r.json.st.coins;
  r = await sync(A, [again]);
  ok(r.json.res[0].dup === true && r.json.st.coins === coinsAfter && r.json.st.items[2] === 1, 'the same change sent twice happens once', r.json);
  r = await sync(A, [again, op('name', ['阿明']), again]);
  ok(r.json.res[0].dup && r.json.res[2].dup && r.json.st.name === '阿明', 'a repeat inside a batch is skipped too', r.json.res);
  eq((await rpc({ a: 'sync', ops: [{ i: 'abcdef1', k: 'hack', a: [] }] }, A)).status, 400, 'unknown kind of change');
  eq((await rpc({ a: 'sync', ops: [{ i: 'x', k: 'take', a: [] }] }, A)).status, 400, 'bad change id');
  eq((await rpc({ a: 'sync', ops: [{ i: 'abcdef2', k: 'take' }] }, A)).status, 400, 'no arguments');
  eq((await rpc({ a: 'sync', ops: 'take' }, A)).status, 400, 'changes must be a list');
  eq((await rpc({ a: 'sync', ops: Array.from({ length: 41 }, () => op('take')) }, A)).status, 400, 'too many changes in one request');
  r = await sync(A, [op('name', ["Robert'); DROP TABLE zz.players;--"])]);
  ok(r.json.ok && r.json.st.name === 'Robert); DRO' && (await pg.query('SELECT count(*)::int AS n FROM zz.players'))[0].n === 2, 'a name is just text', r.json.st.name);
  await sync(A, [op('name', ['阿明'])]);

  // ---------- matches ----------
  r = await sync(A, [op('fin', [match()])]);
  let stA = r.json.st;
  ok(r.json.res[0].ok && stA.coins === coinsAfter + 30 + 22 + 8 + 50 && stA.tot.games === 1 && stA.tot.best === 12000, 'a match pays what the rules say', stA);
  r = await call('board', { url: '/api/board?b=score&me=' + A.pub });
  ok(r.json.top.length === 1 && r.json.top[0].p === A.pub && r.json.top[0].n === '阿明' && r.json.top[0].v === 12000 && r.json.me.rank === 1 && r.json.scope === 'season' && r.json.season === '2026-11', 'the score is on the season board', r.json);
  ok(/s-maxage=30/.test(r.headers['cache-control']), 'boards are cached for half a minute');
  r = await call('board', { url: '/api/board?b=score&s=all' });
  ok(r.json.top.length === 1 && r.json.scope === 'all' && r.json.me === null, 'and on the all-time board', r.json);
  r = await sync(A, [op('fin', [match({ stats: { score: 9000, lines: 30, pieces: 90 } })])]);
  r = await call('board', { url: '/api/board?b=score' });
  eq(r.json.top[0].v, 12000, 'a lower score does not replace the best');
  r = await sync(A, [op('fin', [match({ stats: { score: 5e9, sent: 5e9, lines: 1, pieces: 1 } })])]);
  ok(r.json.st.tot.best === 365000, 'an absurd score is cut down to what two minutes allow', r.json.st.tot);
  r = await call('board', { url: '/api/board?b=rp&me=' + A.pub });
  ok(r.json.top.length === 0 && r.json.me === null, 'no ranked match yet, so not on the rating board');
  r = await sync(A, [op('fin', [match({ mode: 'rank', ko: 3, koOpp: 1 })])]);
  ok(r.json.st.rp === 26 && r.json.st.rgames === 1, 'a ranked win moves the rating', r.json.st);
  r = await call('board', { url: '/api/board?b=rp&me=' + A.pub });
  ok(r.json.top.length === 1 && r.json.top[0].v === 26 && r.json.me.rank === 1 && r.json.me.v === 26, 'now on the rating board', r.json);
  // sprint
  r = await sync(A, [op('fin', [{ mode: 'sprint', result: 1, ms: 9000, stats: { lines: 40, pieces: 100 } }])]);
  ok(r.json.res[0].ok === false && r.json.res[0].why === 'range' && r.json.st.tot.sprint === 0, 'a nine-second sprint is not believed', r.json.res);
  r = await sync(A, [op('fin', [{ mode: 'sprint', result: 1, ms: 60000, stats: { lines: 12, pieces: 30 } }])]);
  ok(r.json.res[0].why === 'range', 'nor one that cleared too few lines');
  r = await sync(A, [op('fin', [{ mode: 'sprint', result: 1, ms: 71500, stats: { score: 9000, lines: 40, pieces: 101 } }])]);
  ok(r.json.res[0].ok && r.json.st.tot.sprint === 71500, 'a real sprint counts', r.json.st.tot);
  r = await call('board', { url: '/api/board?b=sprint&s=all&me=' + A.pub });
  ok(r.json.top[0].v === 71500 && r.json.me.rank === 1 && r.json.me.v === 71500, 'sprint board shows the time', r.json);
  // the time allowance
  let fast = 0, taken = 0;
  for (let i = 0; i < 12; i++) { r = await sync(A, [op('fin', [match({ ms: 180000 })])]); if (r.json.res[0].ok) taken++; else if (r.json.res[0].why === 'fast') fast++; }
  ok(taken >= 1 && taken <= 3 && fast >= 9, 'matches cannot be reported faster than they could be played', [taken, fast]);
  const gamesNow = r.json.st.tot.games;
  now += 10 * MIN;
  r = await sync(A, [op('fin', [match({ ms: 180000 })])]);
  ok(r.json.res[0].ok && r.json.st.tot.games === gamesNow + 1, 'after real time has passed they are accepted again', r.json.res);
  // The allowance so far: 900 s to start with, 551.5 s of matches and one 180 s match used, 900 s gained in the ten
  // minutes just waited, another 180 s used: 888.5 s left. At the 20-second minimum that is 44 more matches, however short.
  const burst = (await sync(A, Array.from({ length: 40 }, () => op('fin', [match({ ms: 1 })])))).json.res.concat((await sync(A, Array.from({ length: 40 }, () => op('fin', [match({ ms: 1 })])))).json.res);
  eq([burst.filter(x => x.ok).length, burst.filter(x => x.why === 'fast').length], [44, 36], 'even one-millisecond matches use up the allowance');

  // ---------- two devices saving at the same moment ----------
  now += HOUR;
  await sync(B, [op('name', ['林董'])]);
  const [p1, p2, p3] = await Promise.all([sync(B, [op('item', [3])]), sync(B, [op('item', [4])]), sync(B, [op('item', [5])])]);
  r = await sync(B);
  ok(p1.json.ok && p2.json.ok && p3.json.ok && r.json.st.items[3] === 1 && r.json.st.items[4] === 1 && r.json.st.items[5] === 1 && r.json.st.coins === 20000 - 40 - 60 - 50, 'three saves at once all land', [r.json.st.items, r.json.st.coins, r.json.ver]);
  eq(r.json.ver, 5, 'one version step per save');

  // ---------- boards with several players ----------
  const C = await newPlayer({ name: '小釉' }, '203.0.113.9'), D = await newPlayer({ name: '' }, '203.0.113.10');
  await sync(C, [op('fin', [match({ stats: { score: 30000, lines: 60, pieces: 150 } })]), op('fin', [match({ mode: 'rank', ko: 1 })])]);
  now += 1000;
  await sync(D, [op('fin', [match({ stats: { score: 30000, lines: 60, pieces: 150 } })])]);
  await sync(B, [op('fin', [match({ mode: 'rank', result: -1, ko: 0, koOpp: 3 })])]);
  r = await call('board', { url: '/api/board?b=score&me=' + D.pub });
  ok(r.json.top[0].p === A.pub && r.json.top[1].p === C.pub && r.json.top[2].p === D.pub && r.json.top[1].v === 30000 && r.json.me.rank === 3, 'best first; ties go to whoever got there first', r.json.top.map(x => x.n + ':' + x.v));
  ok(r.json.top[2].n === '' && Object.keys(r.json.top[0]).join() === 'p,n,v', 'rows carry a tag, a name and a value and nothing else', r.json.top[2]);
  r = await call('board', { url: '/api/board?b=rp&me=' + B.pub });
  ok(r.json.top[0].p === B.pub && r.json.top[0].v === 900 && r.json.me.rank === 1 && r.json.top.length === 3, 'rating board in order', r.json.top);
  await pg.query('UPDATE zz.players SET ban = true WHERE pub = $1', [B.pub]);
  r = await call('board', { url: '/api/board?b=rp&me=' + B.pub });
  ok(r.json.top.length === 2 && r.json.top.every(x => x.p !== B.pub) && r.json.me === null, 'a player marked as banned disappears from the boards', r.json);
  await pg.query('UPDATE zz.players SET ban = false WHERE pub = $1', [B.pub]);
  eq((await call('board', { url: '/api/board?b=coins' })).status, 400, 'unknown board');
  eq((await call('board', { url: '/api/board' })).status, 400, 'no board named');
  r = await call('board', { url: "/api/board?b=score&me=" + encodeURIComponent("x' OR 1=1 --") + '&s=' + encodeURIComponent("all'; DROP SCHEMA zz CASCADE;--") });
  ok(r.status === 200 && r.json.me === null && r.json.scope === 'season', 'odd query values are ignored', r.json);
  eq((await call('board', { method: 'POST', url: '/api/board?b=rp' })).status, 405, 'boards are GET only');

  // ---------- moving to another device ----------
  eq((await rpc({ a: 'code' }, null)).status, 401, 'a code needs an account');
  r = await rpc({ a: 'code' }, A);
  ok(r.json.ok && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(r.json.code) && r.json.exp === now + 10 * MIN, 'a code to carry to another device', r.json);
  const code1 = r.json.code;
  ok((await dump()).indexOf(code1.replace('-', '')) < 0, 'the code itself is not stored');
  r = await rpc({ a: 'redeem', code: code1.toLowerCase().replace('-', ' ') }, null, { ip: '198.51.100.1' });
  ok(r.json.ok && r.json.peek.name === '阿明' && r.json.peek.rp === 26 && r.json.peek.pub === A.pub && r.json.peek.same === false && !r.json.key, 'looking first shows whose save it is and hands nothing over', r.json);
  r = await rpc({ a: 'redeem', code: code1, go: true }, null, { ip: '198.51.100.1' });
  ok(r.json.ok && r.json.id === A.id && r.json.key !== A.key && r.json.st.name === '阿明' && r.json.pub === A.pub, 'the new device joins the account', r.json);
  const A2 = { id: r.json.id, key: r.json.key };
  ok((await sync(A2)).json.ok && (await sync(A)).json.ok, 'both devices work');
  eq((await rpc({ a: 'redeem', code: code1, go: true }, null, { ip: '198.51.100.1' })).status, 404, 'a code works once');
  eq((await rpc({ a: 'redeem', code: 'AAAA-BBBB', go: true }, null, { ip: '198.51.100.1' })).status, 404, 'a wrong code');
  eq((await rpc({ a: 'redeem', code: 12345678, go: true }, null, { ip: '198.51.100.1' })).status, 404, 'a code that is not text');
  r = await rpc({ a: 'code' }, A); const code2 = r.json.code;
  r = await rpc({ a: 'code' }, A); const code3 = r.json.code;
  eq((await rpc({ a: 'redeem', code: code2 }, null, { ip: '198.51.100.1' })).status, 404, 'asking for a new code cancels the old one');
  now += 10 * MIN + 1;
  eq((await rpc({ a: 'redeem', code: code3 }, null, { ip: '198.51.100.1' })).status, 404, 'a code runs out after ten minutes');
  // guessing is slowed down per address
  now += HOUR;
  let slowed = 0;
  for (let i = 0; i < 16; i++) { r = await rpc({ a: 'redeem', code: 'ZZZZ-ZZZ' + 'ABCDEFGHJKLMNPQR'[i] }, null, { ip: '198.51.100.66' }); if (r.status === 429) slowed++; }
  eq(slowed, 4, 'the thirteenth guess from one address is refused');
  r = await rpc({ a: 'code' }, A);
  eq((await rpc({ a: 'redeem', code: r.json.code }, null, { ip: '198.51.100.66' })).status, 429, 'even a right code, while that address is slowed');
  ok((await rpc({ a: 'redeem', code: r.json.code }, null, { ip: '198.51.100.67' })).json.ok, 'another address is not affected');
  // a device that already had its own account: it leaves that one, and an account nobody can reach is removed
  const E = await newPlayer({ name: '舊機' }, '203.0.113.11');
  await sync(E, [op('fin', [match({ stats: { score: 777, lines: 5, pieces: 20 } })])]);
  r = await rpc({ a: 'code' }, A);
  r = await rpc({ a: 'redeem', code: r.json.code }, E, { ip: '198.51.100.2' });
  ok(r.json.peek.same === false, 'peek from another account');
  r = await rpc({ a: 'code' }, A);
  const peekSame = await rpc({ a: 'redeem', code: r.json.code }, A2, { ip: '198.51.100.2' });
  ok(peekSame.json.peek.same === true, 'peek says when the code is for the account this device is already on');
  r = await rpc({ a: 'redeem', code: r.json.code, go: true }, E, { ip: '198.51.100.2' });
  const A3 = { id: r.json.id, key: r.json.key };
  ok(r.json.ok && A3.id === A.id && (await sync(E)).status === 401, 'the old account is gone once its only device has moved', r.json);
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.players WHERE id = $1', [E.id]))[0].n, 0, 'its row is deleted');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.scores WHERE pid = $1', [E.id]))[0].n, 0, 'and its scores with it');
  // at most five devices: the oldest drops off
  const devs = [];
  for (let i = 0; i < 4; i++) { now += 1000; r = await rpc({ a: 'code' }, A3); r = await rpc({ a: 'redeem', code: r.json.code, go: true }, null, { ip: '198.51.100.' + (10 + i) }); devs.push({ id: r.json.id, key: r.json.key }); }
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.keys WHERE pid = $1', [A.id]))[0].n, 5, 'five devices kept');
  ok((await sync(A)).status === 401 && (await sync(A2)).status === 401 && (await sync(A3)).json.ok && (await sync(devs[3])).json.ok, 'the two oldest devices were signed out');

  // ---------- a new day, a new season ----------
  r = await sync(A3, [op('login')]);
  const c1 = r.json.st.coins;
  ok(r.json.res[0].ok && r.json.st.daily.streak === 1, 'daily check-in', r.json.st.daily);
  r = await sync(A3, [op('login'), op('login')]);
  ok(r.json.res.every(x => !x.ok) && r.json.st.coins === c1, 'once a day, however often it is asked');
  now += DAY;
  r = await sync(A3, [op('login')]);
  ok(r.json.res[0].ok && r.json.st.coins === c1 + 30 && r.json.st.daily.streak === 2, 'next day: second day in a row', r.json.st.daily);
  now = Date.UTC(2026, 10, 30, 16, 0, 5);   // five seconds into December, Taiwan time
  r = await sync(A3);
  ok(r.json.st.season === '2026-12' && r.json.st.note && r.json.st.note.kind === 'season' && r.json.st.rgames === 0, 'the season turns over for everyone at the same moment', r.json.st);
  r = await call('board', { url: '/api/board?b=rp' });
  ok(r.json.season === '2026-12' && r.json.top.length === 0, 'a new season starts with an empty rating board', r.json);
  r = await sync(A3, [op('note'), op('fin', [match({ mode: 'rank', ko: 2 })])]);
  ok(r.json.st.note === null && r.json.st.rgames === 1, 'first ranked match of the new season', r.json.st);
  r = await call('board', { url: '/api/board?b=rp&me=' + A.pub });
  ok(r.json.top.length === 1 && r.json.me.rank === 1, 'and back on the board');
  r = await call('board', { url: '/api/board?b=score' });
  eq(r.json.top.length, 1, 'season score board holds this season only');
  r = await call('board', { url: '/api/board?b=score&s=all' });
  ok(r.json.top.length >= 3, 'all-time board keeps everything', r.json.top.length);

  // ---------- deleting an account ----------
  eq((await rpc({ a: 'delete' }, null)).status, 401, 'delete needs credentials');
  eq((await rpc({ a: 'delete' }, { id: C.id, key: D.key })).status, 401, "cannot delete someone else's");
  r = await rpc({ a: 'delete' }, C);
  ok(r.json.ok && (await sync(C)).status === 401, 'account deleted');
  const left = await dump();
  ok(left.indexOf(C.id) < 0 && left.indexOf(C.pub) < 0 && left.indexOf('小釉') < 0, 'nothing of it is left in any table');

  // ---------- rooms for online matches ----------
  const room = (body, o) => call('room', Object.assign({ method: 'POST', body }, o || {}));
  const hostKey = 'h'.repeat(24), guestKey = 'g'.repeat(24), otherKey = 'o'.repeat(24);
  eq((await room({ a: 'open' })).status, 400, 'a room needs a seat key');
  eq((await room({ a: 'open', key: 'short' })).status, 400, 'of a sensible shape');
  r = await room({ a: 'open', key: hostKey });
  ok(r.json.ok && /^[A-HJ-NP-Z2-9]{5}$/.test(r.json.code), 'opening a room gives a five-character code', r.json);
  const rc = r.json.code;
  ok((await dump()).indexOf(hostKey) < 0 && JSON.stringify(await pg.query('SELECT * FROM zz.rooms')).indexOf(core.sha(hostKey)) > 0, 'the seat key is stored as a hash only');
  const x = (key, role, ack, out, code) => room({ a: 'x', code: code || rc, key, role, ack, out });
  r = await x(hostKey, 0, 0, []);
  ok(r.json.ok && r.json.paired === false && r.json.in.length === 0, 'the host waits alone', r.json);
  eq((await x(otherKey, 0, 0, [])).status, 404, 'a wrong key gets nothing');
  eq((await x(hostKey, 1, 0, [])).status, 404, "the host's key does not open the guest's seat");
  eq((await room({ a: 'join', code: 'ZZZZZ', key: guestKey })).status, 404, 'joining a room that does not exist');
  eq((await room({ a: 'join', code: rc, key: hostKey })).status, 409, 'the host cannot take both seats');
  r = await room({ a: 'join', code: rc.toLowerCase().split('').join(' '), key: guestKey });
  ok(r.json.ok && r.json.code === rc, 'a friend joins with the code, typed any old way', r.json);
  ok((await room({ a: 'join', code: rc, key: guestKey })).json.ok, 'asking again with the same key is fine (a retry)');
  r = await room({ a: 'join', code: rc, key: otherKey });
  ok(r.status === 409 && r.json.why === 'full', 'a third player is told the room is full', r.json);
  ok((await x(hostKey, 0, 0, [])).json.paired === true, 'the host sees that someone joined');
  // letters go across, in order, once
  c0 = pg.calls();
  r = await x(hostKey, 0, 0, [{ n: 1, m: { t: 'hello', name: '阿明' } }, { n: 2, m: { t: 'cfg', minutes: 2 } }]);
  eq(pg.calls() - c0, 1, 'one round trip per exchange');
  r = await x(guestKey, 1, 0, [{ n: 1, m: { t: 'hello', name: '小華' } }]);
  eq(r.json.in.map(l => [l.n, l.m.t, l.m.name || l.m.minutes]), [[1, 'hello', '阿明'], [2, 'cfg', 2]], 'the guest collects what the host said');
  r = await x(guestKey, 1, 0, []);
  eq(r.json.in.length, 2, 'not acknowledged yet, so it is still there (the answer may have been lost)');
  r = await x(guestKey, 1, 2, []);
  eq(r.json.in.length, 0, 'acknowledged: nothing new');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.mail WHERE room = $1 AND dst = 1', [rc]))[0].n, 0, 'and the read letters are removed');
  r = await x(hostKey, 0, 0, [{ n: 2, m: { t: 'cfg', minutes: 3 } }, { n: 3, m: { t: 'start', seed: 7 } }]);
  eq(r.json.in.map(l => [l.n, l.m.t, l.m.name]), [[1, 'hello', '小華']], 'the host collects the reply');
  r = await x(hostKey, 0, 1, [{ n: 3, m: { t: 'start', seed: 7 } }, { n: 4, m: { t: 'a', n: 4 } }]);
  r = await x(guestKey, 1, 2, []);
  eq(r.json.in.map(l => l.n + ':' + l.m.t), ['3:start', '4:a'], 'a letter sent twice arrives once; one already read does not come back');
  // odd input
  eq((await x(hostKey, 0, 0, 'hello')).status, 400, 'letters must be a list');
  eq((await x(hostKey, 0, 0, [{ n: 0, m: {} }])).status, 400, 'numbered from one');
  eq((await x(hostKey, 0, 0, [{ n: 5, m: 'text' }])).status, 400, 'each one an object');
  eq((await x(hostKey, 0, 0, [{ n: 5, m: { big: 'x'.repeat(5000) } }])).status, 400, 'and not huge');
  eq((await x(hostKey, 0, 0, Array.from({ length: 81 }, (_, i) => ({ n: 10 + i, m: {} })))).status, 400, 'nor too many at once');
  eq((await x(hostKey, 0, "0; DROP TABLE zz.mail", [], "x' OR '1'='1")).status, 404, 'odd codes find no room');
  ok((await x(hostKey, 0, '1; DROP TABLE zz.mail', [])).json.ok && (await pg.query('SELECT count(*)::int AS n FROM zz.mail'))[0].n >= 0, 'an odd acknowledgement is just a number');
  eq((await room({ a: 'x', code: rc, key: hostKey, role: 0 }, { method: 'GET' })).status, 405, 'rooms are POST only');
  eq((await room({ a: 'open', key: otherKey }, { headers: { origin: 'https://evil.example' } })).status, 403, 'another site may not use rooms');
  eq((await room({ a: 'dance' })).status, 400, 'unknown room action');
  // a box that nobody empties stops filling
  for (let i = 0; i < 6; i++) await x(hostKey, 0, 1, Array.from({ length: 80 }, (_, k) => ({ n: 100 + i * 80 + k, m: { t: 's' } })));
  const waiting = (await pg.query('SELECT count(*)::int AS n FROM zz.mail WHERE room = $1 AND dst = 1', [rc]))[0].n;
  ok(waiting >= 400 && waiting < 480, 'unread letters are capped', waiting);
  // closing
  ok((await room({ a: 'close', code: rc, key: guestKey })).json.ok && (await x(hostKey, 0, 1, [])).json.ok, 'only the host can close the room');
  ok((await room({ a: 'close', code: rc, key: hostKey })).json.ok, 'the host closes it');
  eq([(await x(guestKey, 1, 2, [])).status, (await x(hostKey, 0, 1, [])).status, (await room({ a: 'join', code: rc, key: otherKey })).status], [404, 404, 404], 'a closed room is gone for everyone');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.mail WHERE room = $1', [rc]))[0].n, 0, 'with everything that was waiting in it');
  // the host leaves: a goodbye sent together with "this is my last word"
  const last = (key, role, code, out) => room({ a: 'x', code, key, role, ack: 0, out: out || [], end: true });
  r = await room({ a: 'open', key: hostKey }, { ip: '198.51.100.210' }); const rc3 = r.json.code;
  ok((await last(hostKey, 0, rc3)).json.ok, 'the host of an empty room says its last word');
  eq([(await room({ a: 'join', code: rc3, key: guestKey })).status, (await pg.query('SELECT count(*)::int AS n FROM zz.rooms WHERE code = $1', [rc3]))[0].n], [404, 0], 'an empty room is gone at once: its code no longer works');
  r = await room({ a: 'open', key: hostKey }, { ip: '198.51.100.210' }); const rc4 = r.json.code;
  await room({ a: 'join', code: rc4, key: guestKey });
  ok((await last(guestKey, 1, rc4, [{ n: 1, m: { t: 'bye' } }])).json.ok && (await x(hostKey, 0, 0, [], rc4)).json.in.length === 1, 'a guest leaving does not take the room down; the host hears the goodbye');
  ok((await room({ a: 'x', code: rc4, key: hostKey, role: 0, ack: 1, out: [], end: 'yes' })).json.ok && (await x(guestKey, 1, 0, [], rc4)).status === 200, 'only a real true counts as the last word');
  ok((await last(hostKey, 0, rc4, [{ n: 1, m: { t: 'end', score: 99 } }, { n: 2, m: { t: 'bye' } }])).json.ok, 'the host leaves a room with a guest in it');
  r = await x(guestKey, 1, 0, [], rc4);
  eq(r.json.in.map(l => l.m.t), ['end', 'bye'], 'the guest still collects the final score and the goodbye');
  eq((await room({ a: 'join', code: rc4, key: otherKey })).status, 409, 'nobody new gets in meanwhile');
  now += 15001;
  eq([(await x(guestKey, 1, 2, [], rc4)).status, (await x(hostKey, 0, 1, [], rc4)).status, (await room({ a: 'join', code: rc4, key: otherKey })).status], [404, 404, 404], 'fifteen seconds later the room is gone');
  // rooms run out by themselves
  r = await room({ a: 'open', key: hostKey }); const rc2 = r.json.code;
  now += 3 * HOUR + 1;
  eq([(await x(hostKey, 0, 0, [], rc2)).status, (await room({ a: 'join', code: rc2, key: guestKey })).status], [404, 404], 'a room expires after three hours');
  await room({ a: 'open', key: hostKey }, { ip: '198.51.100.200' });
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.rooms WHERE code = $1', [rc2]))[0].n, 0, 'and is swept out when the next one opens');
  // opening rooms and guessing codes are both slowed per address
  let opened = 0;
  for (let i = 0; i < 44; i++) if ((await room({ a: 'open', key: hostKey }, { ip: '198.51.100.201' })).status === 200) opened++;
  eq(opened, 40, 'forty rooms an hour from one address');
  let guesses = 0;
  for (let i = 0; i < 64; i++) if ((await room({ a: 'join', code: 'QQQQ' + 'ABCDEFGH'[i % 8], key: guestKey }, { ip: '198.51.100.202' })).status === 404) guesses++;
  eq(guesses, 60, 'sixty code tries in ten minutes from one address');

  // ---------- too many new accounts from one address ----------
  let made = 0, refused = 0;
  for (let i = 0; i < 44; i++) { r = await rpc({ a: 'hello' }, null, { ip: '192.0.2.99' }); if (r.status === 200) made++; else if (r.status === 429) refused++; }
  eq([made, refused], [40, 4], 'forty accounts a day from one address');
  ok((await rpc({ a: 'hello' }, null, { ip: '192.0.2.100' })).json.ok, 'other addresses carry on');
  now += DAY;
  ok((await rpc({ a: 'hello' }, null, { ip: '192.0.2.99' })).json.ok, 'and the next day it may again');
  ok((await pg.query('SELECT count(*)::int AS n FROM zz.rate'))[0].n <= 3, 'old counters are cleared out', (await pg.query('SELECT * FROM zz.rate')));

  // ---------- the shape of requests ----------
  eq((await call('rpc', { method: 'GET' })).status, 405, 'rpc is POST only');
  eq((await call('rpc', { method: 'POST', body: '{"a":"hello"}', headers: { 'content-type': 'text/plain' } })).status, 415, 'must say it is JSON');
  eq((await call('rpc', { method: 'POST', body: '{"a":' })).status, 400, 'broken JSON');
  eq((await call('rpc', { method: 'POST', body: '[1,2]' })).status, 400, 'a list is not a request');
  eq((await call('rpc', { method: 'POST', body: '"hello"' })).status, 400, 'nor is a string');
  eq((await call('rpc', { method: 'POST', body: { a: 'hello', pad: 'x'.repeat(30000) } })).status, 413, 'too big');
  eq((await call('rpc', { method: 'POST', parsed: { a: 'hello', pad: 'x'.repeat(30000) } })).status, 413, 'too big, already parsed');
  eq((await rpc({ a: 'nope' })).status, 400, 'unknown action');
  eq((await rpc({})).status, 400, 'no action');
  eq((await rpc({ a: 'hello' }, null, { headers: { origin: 'https://evil.example' } })).status, 403, 'another site may not call it');
  eq((await rpc({ a: 'hello' }, null, { headers: { origin: 'null' } })).status, 403, 'nor a page with no origin of its own');
  ok((await rpc({ a: 'hello' }, null, { headers: { origin: 'https://game.test' }, ip: '192.0.2.50' })).json.ok, 'the game page itself may');
  ok((await call('rpc', { method: 'POST', parsed: { a: 'hello' }, ip: '192.0.2.51' })).json.ok, 'a body the platform already parsed works');
  ok((await call('rpc', { method: 'POST', parsed: '{"a":"hello"}', ip: '192.0.2.52' })).json.ok, 'so does one handed over as text');
  ok((await call('rpc', { method: 'POST', parsed: Buffer.from('{"a":"hello"}'), ip: '192.0.2.53' })).json.ok, 'or as bytes');
  r = await rpc({ a: 'hello' }, null, { ip: '192.0.2.54' });
  ok(!('access-control-allow-origin' in r.headers) && r.headers['x-content-type-options'] === 'nosniff', 'no cross-site access is offered', r.headers);

  // ---------- when the database is in trouble ----------
  const logged = []; const realErr = console.error; console.error = (...a) => logged.push(a.join(' '));
  dbm.use({ query: async () => { const e = new Error('connect failed for postgresql://neondb_owner:s3cretPass@ep-x.neon.tech/neondb?sslmode=require'); e.code = 'XX000'; throw e; }, batch: async () => { throw new Error('boom'); } });
  r = await sync(A3);
  ok(r.status === 500 && r.text === '{"ok":false,"why":"server"}', 'a failure tells the page nothing about the inside', r.text);
  ok(logged.length === 1 && logged[0].indexOf('s3cretPass') < 0 && logged[0].indexOf('[connection string]') > 0, 'and the log line has the connection string taken out', logged);
  dbm.use({ query: async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }, batch: async () => [] });
  r = await sync(A3);
  ok(r.status === 503 && r.json.why === 'busy' && r.headers['retry-after'] === '5', 'a slow database asks the page to try again', r.json);
  dbm.use({ query: async () => { const e = new Error('Error connecting to database: TypeError: fetch failed'); e.name = 'NeonDbError'; e.sourceError = new TypeError('fetch failed'); throw e; }, batch: async () => [] });
  r = await sync(A3);
  ok(r.status === 503 && r.json.why === 'busy', 'so does a database that cannot be reached', r.json);
  dbm.use(null);
  r = await call('health');
  ok(r.json.ok && r.json.db === false, 'health says so when no database is linked', r.json);
  r = await sync(A3);
  ok(r.status === 503 && r.json.why === 'nodb', 'and requests answer plainly', r.json);
  console.error = realErr;
  dbm.use(pg);
  ok((await sync(A3)).json.ok, 'back to normal');

  // ---------- an older database gains what it lacks ----------
  await pg.query('DROP TABLE zz.rate');
  ok((await rpc({ a: 'hello' }, null, { ip: '192.0.2.77' })).json.ok, 'a missing table is put back on the next request that needs it');

  await pg.close();
  console.log('api tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
