'use strict';
// The API end to end: the real request handlers and the real SQL, against a Postgres running inside this process.
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const core = require('../server/core.js');
const rules = require('../server/rules.js');
const { make } = require('../tools/pglite-db.js');

// membership here comes from the old free trial, which only a test setup may open (MEMBER_TRIAL=1, never production);
// the checks that it stays shut everywhere else are in the membership section below
process.env.MEMBER_TRIAL = '1';
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
const TAPE = require('./tape.js'); TAPE.stub(rules.ZZ);
const taped = m => [m, TAPE.fake(m)];      // a match report with a stand-in tape that states the same numbers (see test/tape.js)
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
  r = await call('health', { url: '/api/health?deep=1&x=' + Math.random() });
  ok(r.json.ok && r.json.ready === undefined, 'only the exact ?deep=1 goes to the database (other parameters get the plain answer)', r.json);
  eq((await pg.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'zz'"))[0].n, 31, 'thirty-one tables in their own schema (entitle, orders and entevents the newest)');
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
  eq(B.st.owned, { tile: ['neon'], bg: ['night'], theme: [], fx: [], ghost: [], site: [] }, 'only things that exist and can be bought are kept');
  eq(B.st.equip, { tile: 'neon', bg: 'night', theme: 'auto', fx: 'shard', ghost: 'line', site: 'default' }, 'a look that is not owned comes off');
  ok(B.st.items[1] === 20 && B.st.items[2] === 3 && B.st.items[0] === 0 && B.st.tot.wins === 12 && B.st.tot.sprint === 0 && B.st.note === null, 'items and totals clamped', B.st);
  eq(B.st.first, { drills: [0, 1], openers: ['tsd'] }, 'first clears: real ones only, once each');
  const many = []; for (let i = 0; i <= 200; i++) many.push(99);
  const Bi = await newPlayer({ items: many }, '203.0.113.8');
  ok(Bi.st.items.reduce((a, b) => a + b, 0) === 80 && Bi.st.items[1] === 20, 'imported items are capped per kind and in total', Bi.st.items.slice(0, 6));
  // boxes already opened today on the device are not handed out again by a new cloud save
  const today = Math.floor((now + 8 * 3600000) / 86400000);
  const Bx = await newPlayer({ daily: { day: today, jobs: [{ id: 'tspin', n: 0, paid: false }], draws: 5 } }, '203.0.113.8');
  ok(Bx.st.daily.draws === 5, 'boxes opened today come along with the record', Bx.st.daily);
  const Bw = await newPlayer({ daily: { day: today, jobs: [{ id: 'tspin', n: 0, paid: false }], wave: 3 } }, '203.0.113.8');
  ok(Bw.st.daily.wave === 3 && Bw.st.daily.jobs.length === 5, 'the day\'s job wave comes along too', Bw.st.daily);
  const By = await newPlayer({ daily: { day: today - 1, jobs: [{ id: 'tspin', n: 0, paid: false }], draws: 5 } }, '203.0.113.8');
  ok(By.st.daily.draws === 0, 'yesterday\'s boxes do not count against today', By.st.daily);
  const Bz = await newPlayer({ daily: { day: today, jobs: [{ id: 'tspin', n: 0, paid: false }], draws: 999 } }, '203.0.113.8');
  ok(Bz.st.daily.draws === 10, 'and the count is held to a real day', Bz.st.daily);
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
  ok(r.json.ok && r.json.st.name === 'Robert); DRO' && (await pg.query('SELECT count(*)::int AS n FROM zz.players'))[0].n === 7, 'a name is just text', r.json.st.name);
  await sync(A, [op('name', ['阿明'])]);

  // ---------- matches ----------
  r = await sync(A, [op('fin', taped(match()))]);
  let stA = r.json.st;
  ok(r.json.res[0].ok && stA.coins === coinsAfter + 30 + 22 + 8 + 50 && stA.tot.games === 1 && stA.tot.best === 12000, 'a match pays what the rules say', stA);
  r = await call('board', { url: '/api/board?b=score&me=' + A.pub });
  ok(r.json.top.length === 1 && r.json.top[0].p === A.pub && r.json.top[0].n === '阿明' && r.json.top[0].v === 12000 && r.json.me.rank === 1 && r.json.scope === 'season' && r.json.season === '2026-11', 'the score is on the season board', r.json);
  ok(/s-maxage=30/.test(r.headers['cache-control']), 'boards are cached for half a minute');
  r = await call('board', { url: '/api/board?b=score&s=all' });
  ok(r.json.top.length === 1 && r.json.scope === 'all' && r.json.me === null, 'and on the all-time board', r.json);
  r = await sync(A, [op('fin', taped(match({ stats: { score: 9000, lines: 30, pieces: 90 } })))]);
  r = await call('board', { url: '/api/board?b=score' });
  eq(r.json.top[0].v, 12000, 'a lower score does not replace the best');
  r = await sync(A, [op('fin', taped(match({ stats: { score: 5e9, sent: 5e9, lines: 1, pieces: 1 } })))]);
  ok(r.json.st.tot.best === 365000, 'an absurd score is cut down to what two minutes allow', r.json.st.tot);
  r = await call('board', { url: '/api/board?b=rp&me=' + A.pub });
  ok(r.json.top.length === 0 && r.json.me === null, 'no ranked match yet, so not on the rating board');
  // the match log: one line per reported match, with what the placements proved
  let ml = await pg.query('SELECT mode, result, proven, room, seats, data FROM zz.matches WHERE pid = $1 ORDER BY id', [A.id]);
  ok(ml.length === 3 && ml[0].mode === 'ai' && ml[0].result === 1 && ml[0].proven === true && ml[0].room === '' && ml[0].seats === 1 && ml[0].data.score === 12000, 'each match is logged', ml[0]);
  ok(ml[2].data.score === 365000, 'the log keeps the score as the server cut it down', ml[2].data);
  r = await sync(A, [op('fin', taped(match({ mode: 'rank', ko: 3, koOpp: 1 })))]);
  ok(r.json.st.rp === 26 && r.json.st.rgames === 1, 'a ranked win moves the rating', r.json.st);
  r = await call('board', { url: '/api/board?b=rp&me=' + A.pub });
  ok(r.json.top.length === 1 && r.json.top[0].v === 26 && r.json.me.rank === 1 && r.json.me.v === 26, 'now on the rating board', r.json);
  // sprint
  r = await sync(Bx, [op('fin', [match({ mode: 'net', room: 'AB23C', seats: 4, result: -1 })])]);
  ml = await pg.query('SELECT mode, result, proven, room, seats FROM zz.matches WHERE pid = $1 ORDER BY id DESC LIMIT 1', [Bx.id]);
  ok(ml[0].mode === 'net' && ml[0].room === 'AB23C' && ml[0].seats === 4 && ml[0].proven === false, 'an online match keeps its room, and an untaped one is marked unproven', ml[0]);
  r = await sync(Bx, [op('fin', [match({ mode: 'ai', room: 'AB23C' })])]);
  ml = await pg.query('SELECT room FROM zz.matches WHERE pid = $1 ORDER BY id DESC LIMIT 1', [Bx.id]);
  eq(ml[0].room, '', 'only online matches carry a room');
  r = await sync(A, [op('fin', taped({ mode: 'sprint', result: 1, ms: 9000, stats: { lines: 40, pieces: 100 } }))]);
  ok(r.json.res[0].ok === false && r.json.res[0].why === 'range' && r.json.st.tot.sprint === 0, 'a nine-second sprint is not believed', r.json.res);
  r = await sync(A, [op('fin', taped({ mode: 'sprint', result: 1, ms: 60000, stats: { lines: 12, pieces: 30 } }))]);
  ok(r.json.res[0].why === 'range', 'nor one that cleared too few lines');
  r = await sync(A, [op('fin', taped({ mode: 'sprint', result: 1, ms: 71500, stats: { score: 9000, lines: 40, pieces: 101 } }))]);
  ok(r.json.res[0].ok && r.json.st.tot.sprint === 71500, 'a real sprint counts', r.json.st.tot);

  // ---------- 對戰紀錄 (match history) ----------
  eq((await rpc({ a: 'history' })).status, 401, 'history needs the save\'s key');
  r = await rpc({ a: 'history' }, A);
  let mine = await pg.query('SELECT count(*)::int AS n FROM zz.matches WHERE pid = $1', [A.id]);
  ok(r.json.ok && r.json.total === mine[0].n && r.json.items.length === mine[0].n && r.json.page === 1 && r.json.pages === 1 && r.json.per === 20, 'history lists every match of this save', r.json);
  ok(r.json.items[0].mode === 'sprint' && r.json.items[0].ms === 71500 && r.json.items.every((m, i, a) => !i || a[i - 1].at >= m.at), 'newest first, with the length of each', r.json.items.map(m => [m.mode, m.at]));
  let rk = r.json.items.find(m => m.mode === 'rank');
  ok(rk && rk.ko === 3 && rk.koOpp === 1 && rk.result === 1 && rk.proven === true && rk.quads === 1 && rk.combo === 2 && rk.spins === 3 && rk.sent === 30 && rk.pieces === 120 && typeof rk.at === 'number', 'each match carries K/D and the detail', rk);
  ok(r.json.sum.games === mine[0].n && r.json.sum.ko >= 3 && r.json.sum.koOpp >= 1 && r.json.sum.sprint === 71500 && r.json.sum.best === 365000, 'totals for the same choice', r.json.sum);
  ok(!/"(pid|key|hash|pub|state|srv)"/.test(r.text), 'nothing about keys or the raw record', r.text.slice(0, 300));
  r = await rpc({ a: 'history', mode: 'ai' }, A);
  ok(r.json.mode === 'ai' && r.json.items.length === 3 && r.json.items.every(m => m.mode === 'ai') && r.json.sum.games === 3, 'one mode at a time', r.json.items.map(m => m.mode));
  r = await rpc({ a: 'history', mode: 'nope' }, A);
  eq(r.json.mode, '', 'an unknown mode means all');
  r = await rpc({ a: 'history' }, Bx);
  ok(r.json.items.every(m => m.mode !== 'sprint' || false) && r.json.total === 2, 'another save sees only its own', r.json.total);
  // twenty to a page, the last page clamps
  await pg.query("INSERT INTO zz.matches (pid, at, mode, result, proven, data) SELECT $1, $2::float8 - g * 1000, 'ghost', CASE WHEN g % 3 = 0 THEN -1 ELSE 1 END, true, jsonb_build_object('ko', 1, 'koOpp', g % 2, 'ms', 60000, 'score', g) FROM generate_series(1, 45) g", [Bx.id, Date.now()]);
  r = await rpc({ a: 'history', mode: 'ghost', page: 1 }, Bx);
  ok(r.json.items[0].as === null, 'a match logged without assists says so (null, shown as a dash)', r.json.items[0]);
  ok(r.json.total === 45 && r.json.pages === 3 && r.json.items.length === 20 && r.json.items[0].score === 1 && r.json.items[19].score === 20, 'page 1 has the newest twenty', r.json.items.map(m => m.score));
  r = await rpc({ a: 'history', mode: 'ghost', page: 3 }, Bx);
  ok(r.json.page === 3 && r.json.items.length === 5 && r.json.items[4].score === 45, 'the last page has the rest', r.json.items.map(m => m.score));
  r = await rpc({ a: 'history', mode: 'ghost', page: 99 }, Bx);
  ok(r.json.page === 3 && r.json.items.length === 5, 'a page past the end shows the last one', r.json.page);
  r = await rpc({ a: 'history', mode: 'ghost', page: -4 }, Bx);
  eq(r.json.page, 1, 'a page before the start shows the first');
  ok((await rpc({ a: 'history', mode: 'ghost' }, Bx)).json.sum.win === 30 && (await rpc({ a: 'history', mode: 'ghost' }, Bx)).json.sum.loss === 15, 'wins and losses add up');
  // an online room: who else reported from it, and the place
  const Hn = await newPlayer({ name: '阿華' }, '203.0.113.88');
  r = await sync(Hn, [op('fin', [match({ mode: 'net', room: 'AB23C', seats: 4, result: 1, place: 1, ko: 1, assists: 2, koRoom: 5 })])]);
  r = await rpc({ a: 'history', mode: 'net' }, Hn);
  ok(r.json.items[0].foes.length === 1 && r.json.items[0].place === 1 && r.json.items[0].seats === 4, 'an online match names the others from the room and the place', r.json.items[0]);
  ok(r.json.items[0].ko === 1 && r.json.items[0].as === 2 && r.json.items[0].kr === 5 && r.json.sum.as === 2, 'its own K, assists and the room total are kept', r.json.items[0]);
  r = await rpc({ a: 'history', mode: 'net' }, Bx);
  ok(r.json.items[0].foes.indexOf('阿華') >= 0, 'and the other side sees this one', r.json.items[0].foes);
  r = await call('board', { url: '/api/board?b=sprint&s=all&me=' + A.pub });
  ok(r.json.top[0].v === 71500 && r.json.me.rank === 1 && r.json.me.v === 71500, 'sprint board shows the time', r.json);
  // the coin ledger: written by the server, adds up to the balance, never twice for one change
  {
    const lg = await pg.query('SELECT key, kind, why, delta, bal FROM zz.ledger WHERE pid = $1 ORDER BY id', [A.id]);
    const cur = (await pg.query('SELECT state FROM zz.players WHERE id = $1', [A.id]))[0].state.coins;
    ok(lg.length > 3 && lg[0].kind === 'open' && lg.reduce((a, x) => a + x.delta, 0) === cur && lg[lg.length - 1].bal === cur, 'the ledger adds up to the balance', [lg.length, cur]);
    ok(lg.some(x => x.kind === 'fin' && x.why === 'rank' && x.delta > 0), 'a match payout says which mode paid it', lg.filter(x => x.kind === 'fin').slice(0, 2));
    const fx = op('fin', taped(match({ ms: 120000 })));
    await sync(Bx, [fx]);
    const one = (await pg.query('SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1', [Bx.id]))[0].n;
    ok((await pg.query('SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND key = $2', [Bx.id, fx.i]))[0].n === 1, 'the line carries the change id');
    await sync(Bx, [fx]);   // the same change sent again (a retry after a lost answer)
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1', [Bx.id]))[0].n, one, 'a retried change writes no second line');
  }
  // the time allowance
  let fast = 0, taken = 0;
  for (let i = 0; i < 12; i++) { r = await sync(A, [op('fin', taped(match({ ms: 180000 })))]); if (r.json.res[0].ok) taken++; else if (r.json.res[0].why === 'fast') fast++; }
  ok(taken >= 1 && taken <= 3 && fast >= 9, 'matches cannot be reported faster than they could be played', [taken, fast]);
  const gamesNow = r.json.st.tot.games;
  now += 10 * MIN;
  r = await sync(A, [op('fin', taped(match({ ms: 180000 })))]);
  ok(r.json.res[0].ok && r.json.st.tot.games === gamesNow + 1, 'after real time has passed they are accepted again', r.json.res);
  // The allowance so far: 900 s to start with, 551.5 s of matches and one 180 s match used, 900 s gained in the ten
  // minutes just waited, another 180 s used: 888.5 s left. At the 20-second minimum that is 44 more matches, however short.
  const burst = (await sync(A, Array.from({ length: 40 }, () => op('fin', taped(match({ ms: 1 })))))).json.res.concat((await sync(A, Array.from({ length: 40 }, () => op('fin', taped(match({ ms: 1 })))))).json.res);
  eq([burst.filter(x => x.ok).length, burst.filter(x => x.why === 'fast').length], [44, 36], 'even one-millisecond matches use up the allowance');

  // ---------- treasure boxes ----------
  {
    const clockWas = now;
    now += 6 * HOUR;
    const X = await newPlayer({ name: '抽抽' }, '203.0.113.88');
    let j = (await sync(X, [op('draw', [3])])).json;
    const last = j.st.box.last;
    ok(j.res[0].ok && last && last.boxes.length === 3 && j.st.daily.draws === 3, 'the server opens three boxes', j.json || j.res);
    ok(last.boxes.every(b => ['wood', 'iron', 'gold', 'gem'].indexOf(b.grade) >= 0 && b.got.length >= 1), 'each with a grade and something in it', last.boxes);
    const logged = await pg.query('SELECT boxes FROM zz.draws WHERE pid = $1', [X.id]);
    const flat = b => b.map(x => x.grade + ':' + x.got.map(g => g.kind + (g.id || '') + (g.k || '') + (g.n || '')).join(',')).join('|');
    ok(logged.length === 1 && flat(logged[0].boxes) === flat(last.boxes), 'and the draw is kept in the log as it was', logged);
    j = (await sync(X, [op('draw', [3])])).json;
    ok(j.res[0].ok === false && j.st.daily.draws === 3, 'five a day: three more do not fit after three', j.res);
    j = (await sync(X, [op('draw', [2])])).json;
    ok(j.res[0].ok && j.st.daily.draws === 5, 'two more do');
    j = (await sync(X, [op('draw', [1])])).json;
    ok(j.res[0].ok === false, 'and then none');
    now += DAY;
    j = (await sync(X, [op('draw', [1])])).json;
    ok(j.res[0].ok && j.st.daily.draws === 1, 'a new day brings new draws');
    // ---------- membership: never started by the page on a real server ----------
    delete process.env.MEMBER_TRIAL;
    j = (await sync(X, [op('sub')])).json;
    ok(j.res[0].ok === false && j.res[0].why === 'pay' && !(j.st.sub.until > now), 'no free trial: the page cannot start a membership (why: pay)', j.res);
    process.env.MEMBER_TRIAL = '1'; process.env.VERCEL_ENV = 'production';
    j = (await sync(X, [op('sub')])).json;
    ok(j.res[0].ok === false && j.res[0].why === 'pay', 'and in production not even with the test switch on', j.res);
    const imp = (await rpc({ a: 'hello', st: { coins: 50, sub: { until: now + 20 * DAY, demo: true } } })).json;
    ok(imp.ok && !(imp.st.sub.until > now), 'a membership the device claims is not brought into a new cloud save', imp.st && imp.st.sub);
    delete process.env.VERCEL_ENV;
    j = (await sync(X, [op('sub'), op('draw', [9])])).json;
    ok(j.res[1].ok && j.st.daily.draws === 10, 'members get ten', j.res);
    // a page cannot pick its own prizes: the server ignores anything but the count
    const coins0 = j.st.coins;
    j = (await sync(X, [op('draw', [1, { got: [{ kind: 'coins', n: 99999 }] }])])).json;
    ok(j.res[0].ok === false && j.st.coins === coins0, 'nothing extra comes with a request');
    // over many draws the grades come out near the published odds
    const grades = { wood: 0, iron: 0, gold: 0, gem: 0 };
    for (let d = 0; d < 60; d++) { now += DAY; const r = (await sync(X, [op('sub'), op('draw', [10])])).json; if (r.res[1].ok) r.st.box.last.boxes.forEach(b => grades[b.grade]++); }      // (a membership trial lasts a week: start it again each day)
    const n = Object.values(grades).reduce((a, b) => a + b, 0);
    ok(n === 600 && grades.wood > 290 && grades.wood < 430 && grades.iron > 110 && grades.iron < 230 && grades.gem < 40, 'six hundred draws land near 60 / 28 / 10 / 2', grades);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.draws WHERE pid = $1', [X.id]))[0].n, 64, 'every draw request that went through is in the log (4 + 60)');
    now = clockWas;      // the tests below expect the date they started with
  }

  // ---------- the tape: what a match report has to be backed by ----------
  {
    now += 6 * HOUR;
    const T = await newPlayer({ name: '帶子' }, '203.0.113.77');
    const res = async (a) => (await sync(T, [op('fin', a)])).json;
    const real = TAPE.fin('rank', { seed: 4242, ms: 90000, garbage: 2 });
    let j = await res(real);
    ok(j.res[0].ok && j.st.rgames === 1, 'a ranked match with a true tape counts', j.res);
    j = await res(TAPE.fin('rank', { seed: 4242, ms: 90000, garbage: 2 }));
    ok(j.res[0].ok === false && j.res[0].why === 'proof' && j.st.rgames === 1, 'the same tape handed in again does not', j.res);
    j = await res([real[0]]);
    ok(j.res[0].why === 'proof', 'a ranked match with no tape is not counted', j.res);
    const lie = TAPE.fin('rank', { seed: 4243, ms: 90000 }); lie[0].stats.lines += 10;
    ok((await res(lie)).res[0].why === 'proof', 'more lines than the moves cleared');
    const lie2 = TAPE.fin('rank', { seed: 4244, ms: 90000 }); lie2[0].stats.score += 100000;
    ok((await res(lie2)).res[0].why === 'proof', 'more points than the moves score');
    const lie3 = TAPE.fin('rank', { seed: 4245, ms: 90000 }); lie3[0].stats.spins += 5;
    ok((await res(lie3)).res[0].why === 'proof', 'twists that never happened');
    const lie4 = TAPE.fin('rank', { seed: 4246, ms: 90000, garbage: 6, level: 5 });
    ok(lie4[1].ev.some(e => e[0] === 'o'), 'the test match has a knockout in it');
    lie4[0].koOpp = 0; lie4[0].result = 1; lie4[0].ko = 2;
    ok((await res(lie4)).res[0].why === 'proof', 'hiding your own knockouts');
    const lie5 = TAPE.fin('rank', { seed: 4247, ms: 90000 }); lie5[0].ko = 40;
    ok((await res(lie5)).res[0].why === 'proof', 'more knockouts than there was time for');
    const lie6 = TAPE.fin('rank', { seed: 4248, ms: 90000 }); lie6[1].seed = 4249;
    ok((await res(lie6)).res[0].why === 'proof', 'a tape for a different deal of pieces');
    const lie7 = TAPE.fin('rank', { seed: 4250, ms: 90000 }); const p7 = lie7[1].ev.find(e => typeof e[0] === 'number'); p7[3] -= 3;
    ok((await res(lie7)).res[0].why === 'proof', 'a piece left hanging in the air');
    const lie8 = TAPE.fin('rank', { seed: 4251, ms: 90000 }); lie8[1].ev.filter(e => typeof e[0] === 'number' && e[1] !== 1).forEach(e => { e[5] = 3; });
    ok((await res(lie8)).res[0].why === 'proof', 'every piece claimed as a twist');
    const lie9 = TAPE.fin('rank', { seed: 4252, ms: 90000 }); lie9[0].ms = 20000;
    ok((await res(lie9)).res[0].why === 'proof', 'ninety seconds of moves in a twenty-second match');
    ok((await res([real[0], 'tape'])).res[0].why === 'proof' && (await res([real[0], { v: 1, rv: 1, seed: 5, ev: 'x' }])).res[0].why === 'proof' && (await res([real[0], { v: 1, rv: 99, seed: 5, ev: [] }])).res[0].why === 'proof', 'nonsense where the tape should be');
    const big = TAPE.fin('rank', { seed: 4253, ms: 90000 }); big[1].pad = 'x'.repeat(30000);
    ok((await res(big)).res[0].why === 'proof', 'an oversized tape');
    // sprint
    const sp = TAPE.fin('sprint', { seed: 4300 });
    j = await res(sp);
    ok(j.res[0].ok && j.st.tot.sprint === sp[0].ms, 'a sprint with a true tape counts', j.res);
    const sl = TAPE.fin('sprint', { seed: 4301 }); sl[0].ms = Math.max(15000, sl[0].ms - 20000);
    ok((await res(sl)).res[0].why === 'proof', 'a sprint reported faster than its own tape');
    ok((await res([sp[0]])).res[0].why === 'proof', 'a sprint with no tape');
    // other matches without a tape: a game played, and nothing paid (no coins, no experience), never on a board
    now += HOUR;
    const free = TAPE.fin('ai', { seed: 4400, ms: 60000 });
    const before = (await sync(T)).json.st;
    j = await res([Object.assign({}, free[0], { stats: Object.assign({}, free[0].stats, { score: 150000 }) })]);
    ok(j.res[0].ok && j.st.coins === before.coins && j.st.xp === before.xp && j.st.tot.games === before.tot.games + 1 && j.st.tot.best !== 150000, 'a match against the computer without a tape: counted as played, pays nothing', [j.res, j.st.coins - before.coins]);
    let b = (await call('board', { url: '/api/board?b=score&s=all&me=' + T.pub })).json;
    ok(!b.me || b.me.v < 150000, 'but its score stays off the board', b.me);
    j = await res(free);
    b = (await call('board', { url: '/api/board?b=score&s=all&me=' + T.pub })).json;
    ok(j.res[0].ok && b.me && b.me.v === Math.max(real[0].stats.score, free[0].stats.score), 'a checked score goes on the board', [b.me, free[0].stats.score]);
    ok((await rpc({ a: 'delete' }, T)).json.ok, 'the tape player leaves again');
  }

  // ---------- two devices saving at the same moment ----------
  now += HOUR;
  await sync(B, [op('name', ['林董'])]);
  const [p1, p2, p3] = await Promise.all([sync(B, [op('item', [3])]), sync(B, [op('item', [4])]), sync(B, [op('item', [5])])]);
  r = await sync(B);
  ok(p1.json.ok && p2.json.ok && p3.json.ok && r.json.st.items[3] === 1 && r.json.st.items[4] === 1 && r.json.st.items[5] === 1 && r.json.st.coins === 20000 - 40 - 60 - 50, 'three saves at once all land', [r.json.st.items, r.json.st.coins, r.json.ver]);
  eq(r.json.ver, 5, 'one version step per save');

  // ---------- boards with several players ----------
  const C = await newPlayer({ name: '小釉' }, '203.0.113.9'), D = await newPlayer({ name: '' }, '203.0.113.10');
  await sync(C, [op('fin', taped(match({ stats: { score: 30000, lines: 60, pieces: 150 } }))), op('fin', taped(match({ mode: 'rank', ko: 1 })))]);
  now += 1000;
  await sync(D, [op('fin', taped(match({ stats: { score: 30000, lines: 60, pieces: 150 } })))]);
  await sync(B, [op('fin', taped(match({ mode: 'rank', result: -1, ko: 0, koOpp: 3 })))]);
  r = await call('board', { url: '/api/board?b=score&me=' + D.pub });
  ok(r.json.top[0].p === A.pub && r.json.top[1].p === C.pub && r.json.top[2].p === D.pub && r.json.top[1].v === 30000 && r.json.me.rank === 3, 'best first; ties go to whoever got there first', r.json.top.map(x => x.n + ':' + x.v));
  ok(r.json.top[2].n === '' && Object.keys(r.json.top[0]).join() === 'p,n,v,lv,t' && r.json.top[0].lv >= 1, 'rows carry a tag, a name, a value, a level and a title, and nothing else', r.json.top[2]);
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
  await sync(E, [op('fin', taped(match({ stats: { score: 777, lines: 5, pieces: 20 } })))]);
  r = await rpc({ a: 'code' }, A);
  r = await rpc({ a: 'redeem', code: r.json.code }, E, { ip: '198.51.100.2' });
  ok(r.json.peek.same === false, 'peek from another account');
  r = await rpc({ a: 'code' }, A);
  const peekSame = await rpc({ a: 'redeem', code: r.json.code }, A2, { ip: '198.51.100.2' });
  ok(peekSame.json.peek.same === true, 'peek says when the code is for the account this device is already on');
  r = await rpc({ a: 'redeem', code: r.json.code, go: true }, E, { ip: '198.51.100.2' });
  const A3 = { id: r.json.id, key: r.json.key };
  ok(r.json.ok && A3.id === A.id && (await sync(E)).status === 401, 'the old account is gone once its only device has moved', r.json);
  ok((await pg.query('SELECT gone FROM zz.players WHERE id = $1', [E.id]))[0].gone === now, 'its row is put aside (kept 30 days), not deleted at once');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.scores WHERE pid = $1', [E.id]))[0].n, 2, 'and its scores are kept with it');
  ok(!(await call('board', { url: '/api/board?b=score&s=all' })).json.top.some(x => x.p === E.pub), 'but it is off the boards');
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
  r = await sync(A3, [op('note'), op('fin', taped(match({ mode: 'rank', ko: 2 })))]);
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
  const askedAt = now;
  ok(r.json.ok && r.json.until === askedAt + 30 * DAY, 'deletion asked: kept until exactly 30 days (server time) from now', r.json);
  r = await sync(C);
  ok(r.status === 409 && r.json.why === 'pending' && r.json.until === askedAt + 30 * DAY, 'the save is waiting: nothing can change it', r.json);
  eq((await sync(C, [op('name', ['不准'])])).status, 409, 'not even a name change');
  eq((await rpc({ a: 'code' }, C)).status, 409, 'and no transfer code can be made for it');
  ok(!(await call('board', { url: '/api/board?b=score&s=all' })).json.top.some(x => x.p === C.pub) && !(await call('board', { url: '/api/board?b=rp' })).json.top.some(x => x.p === C.pub), 'it is off every board at once');
  now += HOUR;
  r = await rpc({ a: 'delete' }, C);
  ok(r.json.ok && r.json.until === askedAt + 30 * DAY, 'asking again changes nothing: the first moment counts');
  eq((await rpc({ a: 'restore' }, { id: C.id, key: D.key })).status, 401, "another player's key cannot take it back");
  eq((await rpc({ a: 'restore' }, null)).status, 401, 'nor can no key');
  let left = await dump();
  ok(left.indexOf(C.id) >= 0, 'everything is still kept');
  // day 29: taken back, and the purge leaves it alone
  now = askedAt + 29 * DAY;
  r = await rpc({ a: 'restore' }, C);
  ok(r.json.ok && r.json.restored === true && r.json.st.name === '小釉', 'day 29: taken back, the save as it was', r.json);
  ok((await sync(C)).json.ok, 'and it plays again');
  now = askedAt + 31 * DAY; await newPlayer({ name: '清理零' }, '203.0.113.70');
  ok((await dump()).indexOf(C.id) >= 0, 'a save taken back is not purged later');
  eq((await rpc({ a: 'restore' }, C)).json.restored, false, 'taking back a save that is not waiting is harmless');
  // asked again, and this time left to run out
  const askedAgain = now;
  ok((await rpc({ a: 'delete' }, C)).json.until === askedAgain + 30 * DAY, 'deleted again: a new 30 days from the new moment');
  now = askedAgain + 30 * DAY - 1000; await newPlayer({ name: '清理一' }, '203.0.113.71');
  ok((await dump()).indexOf(C.id) >= 0, 'still there a second before the 30 days are up');
  now = askedAgain + 30 * DAY + 1000;
  eq((await rpc({ a: 'restore' }, C)).status, 410, 'once the 30 days are up it cannot be taken back');
  await newPlayer({ name: '清理二' }, '203.0.113.72');
  left = await dump();
  ok(left.indexOf(C.id) < 0 && left.indexOf(C.pub) < 0 && left.indexOf('小釉') < 0 && left.indexOf(E.id) < 0, 'after 30 days nothing of it is left in any table');
  eq((await rpc({ a: 'delete' }, C)).status, 401, 'and asking about it finds nothing');
  const pr = await pg.query('SELECT * FROM zz.purges ORDER BY at');
  ok(pr.length >= 1 && pr.every(x => Object.keys(x).join() === 'at,n' && x.n >= 1), 'each purge leaves only when and how many', pr);
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.purges WHERE at = $1', [now]))[0].n, 1, 'one record for that purge');
  await rpc({ a: 'delete' }, C); await newPlayer({ name: '清理三' }, '203.0.113.73');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.purges'))[0].n, pr.length, 'a purge with nothing to remove leaves no record');
  now = askedAt;
  await pg.query('DELETE FROM zz.rate WHERE exp > $1', [now + 2 * DAY]);   // (the two sign-ups a month ahead: their counters would outlive the tests below)

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
  { const again = await room({ a: 'join', code: rc, key: hostKey }); ok(again.status === 200 && again.json.seat === 0, 'the host asking to join is told the seat it already has, and takes no second one', again.json); }
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
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.post WHERE room = $1 AND dst = 1', [rc]))[0].n, 0, 'and the read letters are removed');
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
  eq((await x(hostKey, 0, "0; DROP TABLE zz.post", [], "x' OR '1'='1")).status, 404, 'odd codes find no room');
  ok((await x(hostKey, 0, '1; DROP TABLE zz.post', [])).json.ok && (await pg.query('SELECT count(*)::int AS n FROM zz.post'))[0].n >= 0, 'an odd acknowledgement is just a number');
  eq((await room({ a: 'x', code: rc, key: hostKey, role: 0 }, { method: 'GET' })).status, 405, 'rooms are POST only');
  eq((await room({ a: 'open', key: otherKey }, { headers: { origin: 'https://evil.example' } })).status, 403, 'another site may not use rooms');
  eq((await room({ a: 'dance' })).status, 400, 'unknown room action');
  // a box that nobody empties stops filling
  for (let i = 0; i < 6; i++) await x(hostKey, 0, 1, Array.from({ length: 80 }, (_, k) => ({ n: 100 + i * 80 + k, m: { t: 's' } })));
  const waiting = (await pg.query('SELECT count(*)::int AS n FROM zz.post WHERE room = $1 AND dst = 1', [rc]))[0].n;
  ok(waiting >= 400 && waiting < 480, 'unread letters are capped', waiting);
  // closing
  ok((await room({ a: 'close', code: rc, key: guestKey })).json.ok && (await x(hostKey, 0, 1, [])).json.ok, 'only the host can close the room');
  ok((await room({ a: 'close', code: rc, key: hostKey })).json.ok, 'the host closes it');
  eq([(await x(guestKey, 1, 2, [])).status, (await x(hostKey, 0, 1, [])).status, (await room({ a: 'join', code: rc, key: otherKey })).status], [404, 404, 404], 'a closed room is gone for everyone');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.post WHERE room = $1', [rc]))[0].n, 0, 'with everything that was waiting in it');

// ---------- random matchmaking ----------
{
  const Q = n => ('quick-match-seat-' + n + '-yyyyyyyyyyyyyyyyyyyy').slice(0, 32);
  const quick = (n, ip) => room({ a: 'quick', key: Q(n) }, { ip: ip || '198.51.100.' + (50 + n) });
  const a = await quick(1);
  ok(a.status === 200 && a.json.seat === 0 && a.json.quick, 'the first to ask for anyone waits in a room of their own', a.json);
  const b = await quick(2);
  ok(b.json.seat === 1 && b.json.code === a.json.code, 'the next one sits down in that room', [a.json, b.json]);
  const ex = await room({ a: 'x', code: a.json.code, key: Q(1), seat: 0, out: [] });
  ok(ex.json.paired === true, 'and the host sees a guest');
  const c = await quick(3);
  ok(c.json.seat === 0 && c.json.code !== a.json.code, 'a full room is not offered again', c.json);
  eq((await room({ a: 'still', code: c.json.code, key: Q(3) })).json.queued, true, 'a waiting host can say it is still here');
  eq((await room({ a: 'still', code: c.json.code, key: Q(4) })).json.queued, false, 'but only with its own key');
  // a host who stopped saying so is skipped
  now += 40000;
  const d = await quick(5);
  ok(d.json.seat === 0 && d.json.code !== c.json.code, 'a host gone quiet is not matched', d.json);
  // several asking at once: each waiting host gets exactly one guest
  const hosts = await Promise.all([6, 7, 8].map(n => quick(n)));
  const guests = await Promise.all([9, 10, 11, 12, 13].map(n => quick(n)));
  const codes = guests.filter(g => g.json.seat === 1).map(g => g.json.code);
  ok(new Set(codes).size === codes.length, 'no room gets two guests', guests.map(g => g.json));
  const waiting = hosts.filter(h => h.json.seat === 0).map(h => h.json.code);
  ok(waiting.length >= 1 && waiting.every(c => codes.indexOf(c) >= 0), 'every host left waiting was matched', [waiting, codes]);
  // leaving takes the room off the queue
  const e = await quick(14, '198.51.100.99');
  await room({ a: 'x', code: e.json.code, key: Q(14), seat: 0, out: [], end: true });
  const f = await quick(15, '198.51.100.98');
  ok(f.json.code !== e.json.code, 'a host who left is not matched');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.queue WHERE code = $1', [e.json.code]))[0].n, 0, 'and the queue forgets it');
  // one address cannot hammer it
  let slow = 0;
  for (let i = 0; i < 35; i++) if ((await room({ a: 'quick', key: Q(20) }, { ip: '198.51.100.200' })).status === 429) slow++;
  ok(slow >= 4, 'asking too often from one address is slowed down', slow);
  eq((await room({ a: 'quick', key: 'short' })).status, 400, 'a bad key is refused');
}
// ---------- rooms with more than two seats ----------
{
  const K = n => ('seat-key-number-' + n + '-xxxxxxxxxxxxxxxxxxxx').slice(0, 32);
  const opened = await room({ a: 'open', key: K(0), cap: 4 });
  ok(opened.status === 200 && opened.json.seat === 0 && opened.json.cap === 4, 'a room for four opens', opened.json);
  const c4 = opened.json.code;
  eq((await room({ a: 'open', key: K(9), cap: 9 })).status, 400, 'no room is bigger than eight');
  eq((await room({ a: 'open', key: K(8), cap: 8 })).json.cap, 8, 'a room of eight opens');
  eq((await room({ a: 'open', key: K(9), cap: 1 })).status, 400, 'or smaller than two');
  const j1 = await room({ a: 'join', code: c4, key: K(1) }), j2 = await room({ a: 'join', code: c4, key: K(2) });
  ok(j1.json.seat === 1 && j2.json.seat === 2, 'guests take seats in order', [j1.json, j2.json]);
  eq((await room({ a: 'join', code: c4, key: K(1) })).json.seat, 1, 'a repeated join keeps its seat');
  const X = (n, out, acks) => room({ a: 'x', code: c4, key: K(n), seat: n, out: out || [], acks: acks || [] });
  // seat 0 speaks to everyone, seat 2 speaks to seat 1 only; both use the number 1
  await X(0, [{ n: 1, m: { t: 'all' } }]);
  await X(2, [{ n: 1, m: { t: 'one' }, to: 1 }]);
  const in1 = (await X(1)).json.in, in2 = (await X(2)).json.in, in0 = (await X(0)).json.in;
  ok(in1.length === 2 && in1[0].f === 0 && in1[0].m.t === 'all' && in1[1].f === 2 && in1[1].m.t === 'one', 'seat 1 hears both, and who said what', in1);
  ok(in2.length === 1 && in2[0].f === 0, 'seat 2 hears only the broadcast', in2);
  eq(in0.length, 0, 'the speaker does not hear itself');
  await X(0, [{ n: 1, m: { t: 'all' } }]);
  eq((await X(1)).json.in.length, 2, 'the same number twice is kept once');
  // reading is acknowledged per speaker
  eq((await X(1, [], [1, 0, 0, 0])).json.in.length, 1, 'acknowledging seat 0 leaves seat 2 waiting');
  eq((await X(1, [], [1, 0, 1, 0])).json.in.length, 0, 'acknowledging both empties the box');
  eq((await X(1, [], [])).json.in.length, 0, 'and what was read is gone');
  eq((await room({ a: 'x', code: c4, key: K(1), seat: 2 })).status, 404, 'a key only opens its own seat');
  eq((await room({ a: 'x', code: c4, key: K(1), seat: 7 })).status, 404, 'there is no seat 7');
  eq((await X(0, [{ n: 5, m: { t: 'x' }, to: 9 }])).status, 400, 'a letter to a seat that cannot exist is refused');
  ok((await X(0)).json.seats === 3 && (await X(0)).json.cap === 4, 'everyone is told how many are seated');
  eq((await room({ a: 'lock', code: c4, key: K(1) })).status, 404, 'only the host shuts the door');
  ok((await room({ a: 'lock', code: c4, key: K(0) })).json.seats === 3, 'the host shuts the door at three');
  eq((await room({ a: 'join', code: c4, key: K(3) })).status, 409, 'and a fourth can no longer come in');
  eq((await room({ a: 'join', code: c4, key: K(2) })).json.seat, 2, 'while those inside still find their seats');
  // a late broadcast reaches every seat that exists now
  await X(1, [{ n: 2, m: { t: 'hi' } }]);
  ok((await X(0)).json.in.some(l => l.f === 1 && l.m.t === 'hi') && (await X(2, [], [1])).json.in.some(l => l.f === 1), 'a guest can speak to all');
  // pages from before this change still work in a room for two
  const old = await room({ a: 'open', key: K(5) }), oc = old.json.code;
  await room({ a: 'join', code: oc, key: K(6) });
  await room({ a: 'x', code: oc, key: K(5), role: 0, ack: 0, out: [{ n: 1, m: { t: 'old' } }] });
  const o1 = await room({ a: 'x', code: oc, key: K(6), role: 1, ack: 0, out: [] });
  ok(o1.json.paired === true && o1.json.in.length === 1 && o1.json.in[0].n === 1, 'the old two-seat way of talking still works', o1.json);
  eq((await room({ a: 'x', code: oc, key: K(6), role: 1, ack: 1, out: [] })).json.in.length, 0, 'with its single acknowledgement');
}
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
  eq((await call('rpc', { method: 'POST', body: { a: 'hello', pad: 'x'.repeat(100000) } })).status, 413, 'too big');
  eq((await call('room', { method: 'POST', body: { a: 'open', pad: 'x'.repeat(30000) } })).status, 413, 'the smaller limit still holds where no tapes travel');
  eq((await call('rpc', { method: 'POST', parsed: { a: 'hello', pad: 'x'.repeat(100000) } })).status, 413, 'too big, already parsed');
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

  // ---------- rewarded ads: paid only on a signed callback, once, within the day ----------
  {
    const crypto = require('crypto'), ads = require('../server/ads.js');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    ads.setFetch(async () => ({ ok: true, json: async () => ({ keys: [{ keyId: 77, pem }] }) }));
    const P = await newPlayer(null, '203.0.113.60');
    const signedQ = (o, key) => {
      const q = 'ad_network=5450213213286189855&ad_unit=' + (o.unit || 'unit-1') + '&custom_data=' + (o.tag || P.pub) + '&key_id=77&reward_amount=15&reward_item=coins&timestamp=' + (o.ts || now) + '&transaction_id=' + o.tx + '&user_id=x';
      const sig = crypto.sign('sha256', Buffer.from(q), { key: key || privateKey, dsaEncoding: 'der' }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return q + '&signature=' + sig + '&key_id=77';
    };
    const coins = async () => (await pg.query('SELECT state FROM zz.players WHERE id = $1', [P.id]))[0].state;
    let a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000001' }) });
    eq(a.status, 503, 'with no ad settings the callback is switched off');
    r = await call('health');
    ok(r.json.ads === false, 'health says ads are off');
    process.env.ADS_SSV_KEYS_URL = 'https://keys.test/verifier.json'; process.env.ADS_AD_UNITS = 'unit-1';
    const c0 = (await coins()).coins;
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000001' }) });
    ok(a.status === 200 && a.json.paid === true && (await coins()).coins === c0 + 15, 'a signed callback pays 15 coins', a.json);
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000001' }) });
    ok(a.status === 200 && a.json.paid === false && (await coins()).coins === c0 + 15, 'the same transaction never pays twice', a.json);
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000002' }, other) });
    ok(a.status === 403 && (await coins()).coins === c0 + 15, 'a forged signature is refused', a.json);
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000003' }).replace('reward_amount=15', 'reward_amount=99999') });
    ok(a.status === 403, 'a changed amount breaks the signature');
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000004', unit: 'unit-9' }) });
    ok(a.status === 403, 'only our own ad units pay');
    a = await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx000005', ts: now - 2 * HOUR }) });
    ok(a.status === 403, 'an old callback is not paid');
    for (let i = 10; i < 50; i++) await call('ad', { url: '/api/ad?' + signedQ({ tx: 'tx0000' + i }) });
    const st = await coins();
    ok(st.daily.ads === 30 && st.coins === c0 + 30 * 15, 'thirty a day at most', [st.daily.ads, st.coins - c0]);
    const lg = await pg.query("SELECT count(*)::int AS n, sum(delta)::int AS s FROM zz.ledger WHERE pid = $1 AND kind = 'adGrant'", [P.id]);
    ok(lg[0].n === 30 && lg[0].s === 450, 'every paid ad is in the coin ledger', lg[0]);
    // a page cannot pay itself
    r = await sync(P, [op('adGrant')]);
    ok(r.status === 400, 'the server-only change cannot be sent by a page', r.json);
    // a member takes the reward without an ad, from the same daily count
    now += DAY;
    await sync(P, [op('sub')]);
    const m0 = (await coins());
    r = await sync(P, [op('adFree')]);
    ok(r.json.res[0].ok && r.json.st.coins === m0.coins + 15 && r.json.st.daily.ads === 1, 'a member claims without an ad', r.json.res);
    const Q = await newPlayer(null, '203.0.113.61');
    r = await sync(Q, [op('adFree')]);
    ok(r.json.res[0].ok === false, 'a non-member cannot', r.json.res);
    now -= DAY;
    delete process.env.ADS_SSV_KEYS_URL; delete process.env.ADS_AD_UNITS; ads.setFetch(null);
  }

  // ---------- the wheel and the slot machine: drawn by the server, limited per day, logged ----------
  {
    const W = await newPlayer(null, '203.0.113.62');
    r = await sync(W, [op('wheel')]);
    ok(r.json.res[0].ok && r.json.st.daily.wheel === 1 && r.json.st.wheel.last && r.json.st.wheel.last.got.length >= 1, 'the server spins the wheel', r.json.st.wheel);
    r = await sync(W, [op('wheel')]);
    ok(r.json.res[0].ok === false && r.json.st.wheel.n === 1, 'once a day for a non-member', r.json.res);
    const c0 = r.json.st.coins;
    r = await sync(W, [op('slot')]);
    const sl = r.json.st.slot.last, won = sl.got.filter(g => g.kind === 'coins').reduce((a, g) => a + g.n, 0);
    ok(r.json.res[0].ok && r.json.st.coins === c0 - 50 + won && r.json.st.daily.slot === 1, 'a pull costs 50 coins and pays what the server drew', [c0, r.json.st.coins, sl]);
    const logged = await pg.query("SELECT kind FROM zz.draws WHERE pid = $1 ORDER BY id", [W.id]);
    eq(logged.map(x => x.kind), ['wheel', 'slot'], 'both are logged with their kind');
    const lg = await pg.query("SELECT kind, delta FROM zz.ledger WHERE pid = $1 AND kind = 'slot'", [W.id]);
    ok(lg.length === 1 && lg[0].delta === won - 50, 'and the slot shows in the coin ledger as cost and win together', lg);
    // twenty a day; and no pull without the coins
    const ops = []; for (let i = 0; i < 25; i++) ops.push(op('slot'));
    r = await sync(W, ops);
    ok(r.json.st.daily.slot <= 20, 'at most twenty pulls a day', r.json.st.daily.slot);
    const Poor = await newPlayer({ coins: 10 }, '203.0.113.63');
    r = await sync(Poor, [op('slot')]);
    ok(r.json.res[0].ok === false, 'no pull without the coins', r.json.res);
  }

  // ---------- levels: in order, plausible, not faster than they can be played ----------
  {
    const V = await newPlayer(null, '203.0.113.64');
    const par1 = rules.ZZ.Levels.level(1).par;
    r = await sync(V, [op('lvl', [3, par1])]);
    ok(r.json.res[0].ok === false, 'a level cannot be skipped to', r.json.res);
    r = await sync(V, [op('lvl', [1, 9999])]);
    ok(r.json.res[0].ok === false, 'more pieces than the limit is not a clear');
    const c0 = r.json.st.coins;
    r = await sync(V, [op('lvl', [1, par1])]);
    ok(r.json.res[0].ok === false && r.json.res[0].why === 'proof' && r.json.st.lv.stars === '', 'a clear without its replay is not recorded', r.json.res);
    const L1 = TAPE.level(1), lv1 = rules.ZZ.Levels.level(1), st1 = rules.ZZ.Levels.stars(lv1, L1.pieces);
    r = await sync(V, [op('lvl', [1, L1.pieces + 3, L1.tape])]);
    ok(r.json.res[0].why === 'proof', 'nor one reporting other piece counts than its replay', r.json.res);
    r = await sync(V, [op('lvl', [2, L1.pieces, L1.tape])]);
    ok(r.json.res[0].ok === false, 'nor level 1\'s replay handed in for level 2', r.json.res);
    const short = JSON.parse(JSON.stringify(L1.tape)); short.ev = short.ev.slice(0, -2);
    r = await sync(V, [op('lvl', [1, L1.pieces - 2, short])]);
    ok(r.json.res[0].why === 'proof', 'nor a replay that stops before the goal is met', r.json.res);
    r = await sync(V, [op('lvl', [1, L1.pieces, L1.tape])]);
    ok(r.json.res[0].ok && r.json.st.lv.stars === String(st1) && r.json.st.coins === c0 + 20 + st1 * 10, 'level 1 with its replay: stars, first-clear coins and star coins', [r.json.res, r.json.st.lv, r.json.st.coins - c0]);
    r = await sync(V, [op('lvl', [1, L1.pieces, L1.tape])]);
    ok(r.json.res[0].why === 'proof' && r.json.st.coins === c0 + 20 + st1 * 10, 'the same replay a second time counts for nothing', r.json.res);
    const many = []; for (let n = 2; n <= 40; n++) many.push(op('lvl', [n, rules.ZZ.Levels.level(n).par]));
    r = await sync(V, many);
    ok(r.json.res.every(x => !x.ok) && r.json.st.lv.stars.length === 1, 'forty levels reported without replays: none taken', r.json.st.lv.stars);
    const lg = await pg.query("SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND kind = 'lvl'", [V.id]);
    ok(lg[0].n >= 1, 'level coins are in the coin ledger');
  }

  // ---------- friends: asked by code, agreed by asking back, ended by either; invites only between friends ----------
  {
    const F1 = await newPlayer(null, '203.0.113.81'), F2 = await newPlayer(null, '203.0.113.82'), F3 = await newPlayer(null, '203.0.113.83');
    const fr = (who, body) => rpc(Object.assign({ a: 'fr' }, body || {}), who);
    r = await fr(F1);
    ok(r.json.ok && r.json.me === F1.pub && r.json.list.length === 0 && r.json.inv.length === 0, 'nobody to start with; the friend code is the public tag', r.json);
    r = await rpc({ a: 'frAdd', p: F1.pub.toUpperCase() }, F1);
    ok(r.status === 400 && r.json.why === 'self', 'not yourself');
    r = await rpc({ a: 'frAdd', p: 'zzzzzzzz' }, F1);
    ok(r.status === 404 && r.json.why === 'nobody', 'a code nobody has');
    r = await rpc({ a: 'frAdd', p: 'no' }, F1);
    ok(r.status === 400 && r.json.why === 'code', 'something that is not a code');
    r = await rpc({ a: 'frAdd', p: ' ' + F2.pub.toUpperCase().slice(0, 4) + '-' + F2.pub.toUpperCase().slice(4) + ' ' }, F1);
    ok(r.json.ok && r.json.st === 'ask', 'a request is sent (capitals, a dash and spaces are fine)', r.json);
    r = await fr(F2);
    ok(r.json.list.length === 1 && r.json.list[0].p === F1.pub && r.json.list[0].st === 'in' && !r.json.list[0].on, 'the other side sees the request (and not whether the asker is online)', r.json.list);
    r = await fr(F1);
    ok(r.json.list[0].st === 'out', 'the asker sees it waiting');
    r = await rpc({ a: 'frInv', p: F2.pub, g: 'zz', code: 'ABCDE' }, F1);
    ok(r.status === 403, 'no invites before both agree');
    r = await rpc({ a: 'frAdd', p: F1.pub }, F2);
    ok(r.json.ok && r.json.st === 'ok', 'asking back: friends');
    r = await fr(F1);
    ok(r.json.list[0].st === 'ok' && r.json.list[0].on === true && typeof r.json.list[0].lv === 'number', 'friends see each other online, with a level', r.json.list);
    now += 2 * MIN;
    r = await fr(F2);
    ok(r.json.list[0].on === false && r.json.list[0].seen > 0, 'two minutes without the game open: not online any more, last seen shown', r.json.list);
    r = await rpc({ a: 'frInv', p: F2.pub, g: 'dg', code: 'abcde' }, F1);
    ok(r.json.ok, 'a friend invites a friend into a room');
    r = await fr(F2);
    ok(r.json.inv.length === 1 && r.json.inv[0].p === F1.pub && r.json.inv[0].g === 'dg' && r.json.inv[0].code === 'ABCDE', 'the invitation arrives, with the game and the room', r.json.inv);
    r = await rpc({ a: 'frInv', p: F2.pub, g: 'chess', code: 'ABCDE' }, F1);
    ok(r.status === 400, 'only the two games');
    r = await rpc({ a: 'frInv', p: F2.pub, g: 'zz', code: 'ABCDE' }, F3);
    ok(r.status === 403 || r.status === 404, 'a stranger cannot invite', r.status);
    now += 11 * MIN;
    r = await fr(F2);
    ok(r.json.inv.length === 0, 'an invitation runs out after ten minutes');
    r = await rpc({ a: 'frDrop', p: F1.pub }, F2);
    ok(r.json.ok, 'either side can end it');
    r = await fr(F1);
    ok(r.json.list.length === 0, 'and it is gone from both lists');
    r = await rpc({ a: 'frAdd', p: F2.pub }, F1);
    ok(r.status === 409 && r.json.why === 'wait', 'the one who was dropped cannot ask again straight away');
    now += DAY + MIN;
    r = await rpc({ a: 'frAdd', p: F2.pub }, F1);
    ok(r.json.ok && r.json.st === 'ask', 'but can after a day');
    r = await rpc({ a: 'frAdd', p: F1.pub }, F2);
    ok(r.json.st === 'ok', 'and the two are friends again');
    const rows = await pg.query('SELECT st FROM zz.friends');
    ok(rows.length === 1, 'one row per pair, whatever happens', rows);
    // an ended friendship is removed by the daily job once its day is over, with any invitation between the two
    await rpc({ a: 'frAdd', p: F3.pub }, F1); await rpc({ a: 'frAdd', p: F1.pub }, F3);
    await rpc({ a: 'frInv', p: F3.pub, g: 'zz', code: 'ABCDE' }, F1);
    await rpc({ a: 'frDrop', p: F1.pub }, F3);
    let td = await core.friendsTidy(pg, now);
    ok(td.friends === 0 && (await pg.query('SELECT count(*)::int AS n FROM zz.friends'))[0].n === 2, 'not before the day is over (it still stops asking again)', td);
    td = await core.friendsTidy(pg, now + DAY + MIN);
    const left = await pg.query('SELECT st FROM zz.friends'), invs = await pg.query('SELECT count(*)::int AS n FROM zz.invites i JOIN zz.players p ON p.id = i.src WHERE p.pub = $1 AND i.dst = (SELECT id FROM zz.players WHERE pub = $2)', [F1.pub, F3.pub]);
    ok(td.friends === 1 && td.invites === 1 && left.length === 1 && left[0].st === 'ok' && invs[0].n === 0, 'after a day: the ended one and its invitation are gone; friends stay', [td, left]);
    r = await rpc({ a: 'fr' }, null);
    ok(r.status === 401, 'not without a save');
  }

  // ---------- 磚之冒險: stages in order, checked on the server, never faster than a monster can be beaten ----------
  {
    const Q = await newPlayer({ rpg: { cls: 'mage', best: 10, gear: { tank: { w: 5, a: 5, c: 5 }, rogue: { w: 5, a: 5, c: 5 }, mage: { w: 5, a: 5, c: 5 } }, wins: 99 } }, '203.0.113.69');
    ok(Q.st.rpg.best === 0 && Q.st.rpg.gear.mage.w === 0, 'adventure progress on the device is not brought into a new cloud save', Q.st.rpg);
    const c0 = Q.st.coins;
    r = await sync(Q, [op('rpg', [2, 40, 'tank'])]);
    ok(r.json.res[0].ok === false, 'a stage cannot be skipped to', r.json.res);
    r = await sync(Q, [op('rpg', [1, 40, 'mage'])]);
    ok(r.json.res[0].ok === false, 'the class must be the one on record', r.json.res);
    r = await sync(Q, [op('rpgCls', ['rogue']), op('rpg', [1, 40, 'rogue'])]);
    ok(r.json.res.every(x => x.ok) && r.json.st.rpg.best === 1 && r.json.st.rpg.cls === 'rogue' && r.json.st.coins === c0, 'a class is picked and stage 1 is beaten: progress counts, no coins (no proof of a stage yet)', [r.json.res, r.json.st.rpg, r.json.st.coins - c0]);
    r = await sync(Q, [op('rpg', [2, 40, 'rogue']), op('rpg', [3, 40, 'rogue'])]);
    ok(['tank', 'rogue', 'mage'].every(c => r.json.st.rpg.gear[c].w === 1), 'stage 3 opens the weapon slot for every class on the server too', r.json.st.rpg);
    r = await sync(Q, [op('rpgUp', ['rogue', 'w']), op('rpgUp', ['rogue', 'a'])]);
    ok(r.json.res[0].ok && !r.json.res[1].ok && r.json.st.rpg.gear.rogue.w === 2 && r.json.st.rpg.gear.tank.w === 1, 'an open slot can be upgraded, for that class only; a shut one cannot', r.json.res);
    let fast = false;
    for (let k = 0; k < 3 && !fast; k++) { const many = []; for (let i = 0; i < 30; i++) many.push(op('rpg', [1, 3, 'rogue'])); r = await sync(Q, many); fast = r.json.res.some(x => x.why === 'fast'); }
    ok(fast, 'stages cannot be reported faster than they could be played', r.json.res.filter(x => !x.ok).length);
    const lg = await pg.query("SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND kind = 'rpg'", [Q.id]);
    ok(lg[0].n === 0, 'and the coin ledger has no adventure coins');
  }

  // ---------- weather runs: paid by time, never faster than they could be played, on their own board ----------
  {
    const X = await newPlayer(null, '203.0.113.65');
    const c0 = (await sync(X)).json.st.coins;
    r = await sync(X, [op('wx', [120, 20, 30000, 0])]);
    ok(r.json.res[0].ok && r.json.st.coins === c0 && r.json.st.lv.wx === 30000 && r.json.st.lv.wxs === 120, 'a two-minute run is kept as the best and pays no coins (no proof of a run yet)', [r.json.res, r.json.st.coins - c0, r.json.st.lv]);
    r = await call('board', { url: '/api/board?b=wx&s=all' });
    ok(r.status === 200 && r.json.top.some(x => x.v === 30000), 'and it is on the weather board', r.json);
    r = await sync(X, [op('wx', [3000, 999, 1e9, 0])]);
    ok(r.json.res[0].ok === false && r.json.res[0].why === 'fast', 'an hour-long run cannot be reported straight after', r.json.res);
    r = await sync(X, [op('wx', [10, 2, 1e9, 1])]);
    const lg = await pg.query("SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND kind = 'wx'", [X.id]);
    ok(lg[0].n === 0, 'no weather coins in the coin ledger', lg);
    r = await sync(X, [op('wxb', [1, 1])]);
    ok(r.json.res[0].ok && r.json.st.lv.wxr === 25, 'a weather battle won against a person: storm points', r.json.st.lv);
    r = await call('board', { url: '/api/board?b=wxr&s=all' });
    ok(r.status === 200 && r.json.top.some(x => x.v === 25), 'and they are on the storm-rank board', r.json);
    const many = []; for (let i = 0; i < 40; i++) many.push(op('wxb', [1, 1]));
    r = await sync(X, many);
    ok(r.json.res.some(x => x.why === 'fast') && r.json.st.lv.wxr < 25 * 41, 'storm points cannot be reported faster than battles are played', r.json.st.lv.wxr);
  }
  // ---------- the brick games pay through the server, no faster than they can be played ----------
  {
    const Y = await newPlayer(null, '203.0.113.95');
    const c0 = (await sync(Y)).json.st.coins;
    r = await sync(Y, [op('mini', ['snake', 1, 400, 0, 120000])]);
    ok(r.json.res[0].ok && r.json.st.coins === c0 && r.json.st.mini.snake[1] === 400, 'a brick game result: the best is kept, no coins (no proof of a brick game yet)', [r.json.res, r.json.st.coins - c0, r.json.st.mini]);
    r = await sync(Y, [op('mini', ['push', 0, 0, 3, 30000])]);
    ok(r.json.res[0].ok && r.json.st.mini.push === '3', 'a level cleared: its stars are kept', r.json.st.mini);
    r = await sync(Y, [op('mini', ['breakout', 2, 1e7, 0, 3600000])]);
    ok(r.json.res[0].ok === false && r.json.res[0].why === 'fast', 'an hour-long game cannot be reported straight after', r.json.res);
    const lg = await pg.query("SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND kind = 'mini'", [Y.id]);
    ok(lg[0].n === 0, 'no brick game coins in the coin ledger', lg);
  }
  // ---------- random matching keeps weather battles apart from ordinary ones ----------
  {
    let ipn = 70;
    const q = (key, pool) => room(Object.assign({ a: 'quick', key }, pool ? { pool } : {}), { ip: '203.0.113.' + (ipn++) });
    const k = n => ('poolkey' + n).padEnd(28, 'x');
    const plain = await q(k(1)), w1 = await q(k(2), 'wx');
    ok(plain.json.seat === 0 && w1.json.seat === 0 && plain.json.code !== w1.json.code, 'a weather asker does not take an ordinary waiting room', [plain.json, w1.json]);
    const w2 = await q(k(3), 'wx'), p2 = await q(k(4));
    ok(w2.json.seat === 1 && w2.json.code === w1.json.code, 'a second weather asker sits with the first', w2.json);
    ok(p2.json.seat === 1 && p2.json.code === plain.json.code, 'and an ordinary one with the ordinary room', p2.json);
  }

    // ---------- the brick games' boards ----------
    {
      const mh = await rpc({ a: 'hello' }, null, { ip: '198.51.100.230' });
      const M = { id: mh.json.id, key: mh.json.key, pub: mh.json.pub };
      now += 3600000;      // a fresh hour of play time
      r = await sync(M, [op('mini', ['snake', 1, 800, 0, 60000]), op('mini', ['pipes', 0, 45000, 0, 50000]), op('mini', ['push', 0, 3, 2, 30000]), op('mini', ['breakout', 2, 9e8, 0, 4000])]);
      ok(r.json.res.slice(0, 3).every(x => x.ok), 'brick game results are taken', r.json.res);
      r = await call('board', { url: '/api/board?b=m_snake_1&me=' + M.pub });
      ok(r.json.top.some(x => x.p === M.pub && x.v === 800) && r.json.me.v === 800, 'a snake score is on its board (normal difficulty)', r.json);
      r = await call('board', { url: '/api/board?b=m_pipes_0' });
      ok(r.json.top.some(x => x.p === M.pub && x.v === 45000), 'a time is shown as the time it took', r.json.top);
      r = await call('board', { url: '/api/board?b=m_push' });
      ok(r.json.top.some(x => x.p === M.pub && x.v === 2), 'a level game counts its stars', r.json.top);
      r = await call('board', { url: '/api/board?b=m_breakout_2' });
      ok(!r.json.top.some(x => x.p === M.pub), 'a score too big for the time played stays off the board', r.json.top);
      eq((await call('board', { url: '/api/board?b=m_tetris_0' })).status, 400, 'a board that does not exist');
    }

  // ---------- ranked against people: the server settles it once both records are in and agree ----------
  {
    now += 3 * 3600000;
    const P1 = await newPlayer(null, '198.51.100.241'), P2 = await newPlayer(null, '198.51.100.242');
    const pm = (res, ko, koOpp, room) => taped(match({ mode: 'net', result: res, ko, koOpp, quick: true, pr: true, room, seats: 2 }));
    let x = await sync(P1, [op('fin', pm(1, 2, 1, 'PVPAA'))]);
    ok(x.json.res[0].ok && x.json.st.pvp.games === 0, 'one record alone moves nothing', x.json);
    x = await sync(P2, [op('fin', pm(-1, 1, 2, 'PVPAA'))]);
    const s2 = (await sync(P2)).json.st.pvp, s1 = (await sync(P1)).json.st.pvp;
    ok(s1.games === 1 && s1.wins === 1 && s1.rp > 0 && s2.games === 1 && s2.wins === 0, 'with both in and agreeing, both ratings move', [s1, s2, x.json.res]);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.pvp WHERE ok'))[0].n, 1, 'settled once');
    await sync(P2, [op('fin', pm(-1, 1, 2, 'PVPAA'))]);
    ok((await sync(P1)).json.st.pvp.games === 1, 'a report that has no partner left settles nothing');
    await sync(P1, [op('fin', pm(1, 2, 0, 'PVPBB'))]); await sync(P2, [op('fin', pm(1, 2, 0, 'PVPBB'))]);
    const d1 = (await sync(P1)).json.st.pvp, d2 = (await sync(P2)).json.st.pvp;
    ok(d1.games === 1 && d2.games === 1, 'two records that disagree (both claim the win) move nobody', [d1, d2]);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.pvp WHERE NOT ok'))[0].n, 1, 'and the disagreement is kept on record');
    x = await rpc({ a: 'sync', ops: [{ i: 'pvpself1', k: 'pvp', a: [1], srv: true }] }, P1);
    ok(x.status === 400 || (x.json.res && !x.json.res[0].ok), 'a page cannot send the server-only change', x.json);
    ok((await sync(P1)).json.st.pvp.games === 1, 'and it did not count');
    r = await call('board', { url: '/api/board?b=prp' });
    ok(r.json.top.some(t => t.p === P1.pub && t.v === s1.rp), 'the winner is on the ranked board', r.json.top);
  }

  // ---------- level boards: stars across the levels, the endless run's best stage ----------
  {
    now += 3 * 3600000;
    const L1 = await newPlayer(null, '198.51.100.244');
    const T1 = TAPE.level(1, { step: 260 });        // a play of its own (another account's replay would not count)
    let x = await sync(L1, [op('lvl', [1, T1.pieces, T1.tape]), op('endless', [12])]);
    ok(x.json.res.every(y => y.ok), 'a level with its replay and an endless run are taken', x.json.res);
    const stars = String(x.json.st.lv.stars).split('').reduce((n, c) => n + (+c || 0), 0);
    r = await call('board', { url: '/api/board?b=lvs&me=' + L1.pub });
    ok(stars > 0 && r.json.me && r.json.me.v === stars, 'the stars add up on the levels board', [stars, r.json.me]);
    r = await call('board', { url: '/api/board?b=lve&me=' + L1.pub });
    ok(r.json.me && r.json.me.v === 12, 'the endless stage is on its board', r.json.me);
    x = await sync(L1, [op('endless', [900])]);
    r = await call('board', { url: '/api/board?b=lve&me=' + L1.pub });
    ok(r.json.me.v === 12, 'a stage too far for the time played stays off the board', r.json.me);
  }

  // ---------- a member's own files in the cloud (R2) ----------
  {
    const files = require('../server/files.js');
    const F = await newPlayer(null, '198.51.100.246'), G = await newPlayer(null, '198.51.100.247');
    ok(!files.configured() && (await rpc({ a: 'fileList', kind: 'music' }, F)).status === 503, 'off while the R2 keys are not set');
    Object.assign(process.env, { R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDEXAMPLE', R2_SECRET_ACCESS_KEY: 'SECRETEXAMPLE', R2_BUCKET: 'zzb' });
    // the same signed addresses that AWS's own library (boto3) makes for these inputs
    eq(files.presign('GET', 'u/abc/music/x1', 3600, Date.parse('2026-11-20T17:53:00Z')).split('Signature=')[1], '80594d6389584b296df9335e8d3333e95d9942b31bcff0ab245ae88c5efaa193', 'a read address signed exactly as AWS signs it');
    eq(files.presign('PUT', 'u/abc/music/x1', 600, Date.parse('2026-11-20T17:53:06Z'), { 'content-type': 'audio/mpeg' }).split('Signature=')[1], 'cd3d2b90ecbee6057ed63c8beb87af3693e886967125068af7cdf04b08901740', 'and an upload address with its content type');
    ok((await call('health')).json.files === true, 'health says uploads are on');
    let x = await rpc({ a: 'fileUp', kind: 'music', name: 'song.mp3', size: 3e6, type: 'audio/mpeg' }, F);
    ok(x.status === 403 && x.json.why === 'member', 'members only', x.json);
    await sync(F, [op('sub')]);
    x = await rpc({ a: 'fileUp', kind: 'music', name: '<b>my song</b>.mp3', size: 3e6, type: 'audio/mpeg' }, F);
    ok(x.status === 200 && /^https:\/\/acct123\.r2\.cloudflarestorage\.com\/zzb\/u\/[0-9a-f-]{36}\/music\//.test(x.json.url) && /X-Amz-SignedHeaders=content-type%3Bhost/.test(x.json.url), 'a member gets an address to put the file straight into the bucket', x.json);
    const fid = x.json.id;
    eq((await rpc({ a: 'fileList', kind: 'music' }, F)).json.files.length, 0, 'not on the list until the upload is done');
    ok((await rpc({ a: 'fileOk', id: fid }, F)).json.ok, 'the upload is reported done');
    x = await rpc({ a: 'fileList', kind: 'music' }, F);
    ok(x.json.files.length === 1 && x.json.files[0].name === 'bmy song/b.mp3' && /X-Amz-Expires=3600/.test(x.json.files[0].url), 'then listed, name cleaned, with an address to read it', x.json.files);
    eq((await rpc({ a: 'fileUp', kind: 'music', name: 'big', size: 16 * 1024 * 1024, type: 'audio/mpeg' }, F)).json.why, 'big', 'a file over 15 MB is refused');
    eq((await rpc({ a: 'fileUp', kind: 'music', name: 'x.exe', size: 1000, type: 'application/x-msdownload' }, F)).json.why, 'type', 'only sound files for music');
    eq((await rpc({ a: 'fileUp', kind: 'pics', name: 'p', size: 1000, type: 'image/svg+xml' }, F)).json.why, 'type', 'and only plain pictures (no SVG) for pictures');
    eq((await rpc({ a: 'fileOk', id: fid }, G)).status, 404, 'nobody else can touch the file');
    // the keys files are locked with in the browser
    let k1 = await rpc({ a: 'fileKey' }, F);
    ok(k1.json.ok && /^[A-Za-z0-9_-]{43}$/.test(k1.json.key) && k1.json.vault === null, 'fileKey: this player\'s server-kept key, no vault yet', k1.json);
    eq((await rpc({ a: 'fileKey' }, F)).json.key, k1.json.key, 'the same key every time');
    ok((await rpc({ a: 'fileKey' }, G)).json.key !== k1.json.key, 'another player has another key');
    eq((await rpc({ a: 'fileKey' })).status, 401, 'no key without the device key');
    const box = { salt: 'c2FsdHNhbHRzYWx0c2FsdA', iv: 'aXZpdml2aXZpdml2', w: 'd3JhcHBlZHdyYXBwZWR3cmFwcGVkd3JhcHBlZA' };
    eq((await rpc({ a: 'fileVault', vault: { rounds: 600000, p: box } }, F)).json.why, 'vault', 'a vault needs both locks');
    eq((await rpc({ a: 'fileVault', vault: { rounds: 10, p: box, r: box } }, F)).json.why, 'vault', 'and enough rounds');
    ok((await rpc({ a: 'fileVault', vault: { rounds: 600000, p: box, r: box, extra: 'x' } }, F)).json.ok, 'a vault is kept');
    k1 = await rpc({ a: 'fileKey' }, F);
    ok(k1.json.vault && k1.json.vault.rounds === 600000 && k1.json.vault.p.w === box.w && !('extra' in k1.json.vault), 'and given back as it was locked (nothing else kept)', k1.json.vault);
    eq((await rpc({ a: 'fileVault', vault: { rounds: 600000, p: box, r: box } }, F)).status, 409, 'not replaced by accident');
    ok((await rpc({ a: 'fileVault', vault: { rounds: 700000, p: box, r: box }, replace: true }, F)).json.ok && (await rpc({ a: 'fileKey' }, F)).json.vault.rounds === 700000, 'replaced when asked (a new password)');
    const keyRows = JSON.stringify(await pg.query('SELECT * FROM zz.files'));
    ok(keyRows.indexOf(k1.json.key) < 0, 'the key is not kept with the files');
    x = await rpc({ a: 'fileUp', kind: 'music', name: 'locked', size: 2000, type: 'audio/mpeg', enc: 'p' }, F);
    await rpc({ a: 'fileOk', id: x.json.id }, F);
    ok((await rpc({ a: 'fileList', kind: 'music' }, F)).json.files.some(f => f.id === x.json.id && f.enc === 'p'), 'the list says how each file is locked');
    await pg.query('DELETE FROM zz.files WHERE id = $1', [x.json.id]);      // (the test's own row, so the counts below stay as they were)
    ok((await rpc({ a: 'fileHide', id: fid }, F)).json.ok && (await rpc({ a: 'fileList', kind: 'music' }, F)).json.files.length === 0, 'taken off the list');
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.files WHERE id = $1', [fid]))[0].n, 1, 'but the record stays for now');
    // "recently removed": 30 days to change one's mind, then the daily job deletes it (C-034)
    x = await rpc({ a: 'fileList', kind: 'music', trash: true }, F);
    ok(x.json.files.length === 1 && x.json.files[0].id === fid && x.json.files[0].left === 30 && !x.json.files[0].url, 'listed under recently removed, 30 days left, no read address', x.json);
    eq((await rpc({ a: 'fileBack', id: fid }, G)).status, 404, 'nobody else can bring it back');
    ok((await rpc({ a: 'fileBack', id: fid }, F)).json.ok && (await rpc({ a: 'fileList', kind: 'music' }, F)).json.files.length === 1, 'brought back onto the list');
    eq((await rpc({ a: 'fileList', kind: 'music', trash: true }, F)).json.files.length, 0, 'and gone from recently removed');
    // pictures: a new wall picture sends the old one to recently removed
    const pic = async () => { const u = await rpc({ a: 'fileUp', kind: 'pics', name: 'bg', size: 2000, type: 'image/jpeg' }, F); await rpc({ a: 'fileOk', id: u.json.id }, F); return u.json.id; };
    const p1 = await pic(), p2 = await pic();
    x = await rpc({ a: 'fileList', kind: 'pics' }, F);
    ok(x.json.files.length === 1 && x.json.files[0].id === p2, 'only the newest wall picture is on the list', x.json);
    eq((await rpc({ a: 'fileList', kind: 'pics', trash: true }, F)).json.files.map(f => f.id).join(), p1, 'the one it replaced waits in recently removed');
    ok((await rpc({ a: 'fileBack', id: p1 }, F)).json.ok, 'bringing the old one back');
    eq((await rpc({ a: 'fileList', kind: 'pics' }, F)).json.files.map(f => f.id).join(), p1, 'puts it in place of the newer one');
    ok((await rpc({ a: 'fileHide', kind: 'pics', name: 'bg' }, F)).json.ok && (await rpc({ a: 'fileList', kind: 'pics' }, F)).json.files.length === 0, 'removing the wall picture takes it off by name');
    // the daily job
    await rpc({ a: 'fileHide', id: fid }, F);
    const t0 = now, dropped = [];
    let r = await files.purge(pg, t0 + 29 * 86400000, async k => { dropped.push(k); return true; });
    ok(r.status === 200 && r.body.due === 0 && !dropped.length, 'nothing is deleted before 30 days', r.body);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.files WHERE pid = $1', [F.id]))[0].n, 3, 'all three files still there');
    r = await files.purge(pg, t0 + 31 * 86400000, async k => { dropped.push(k); return !/\/pics\//.test(k); });
    ok(r.body.due === 3 && r.body.gone === 1 && r.body.kept === 2, 'after 30 days: the bucket says gone for one, not for two', r.body);
    eq((await pg.query('SELECT id FROM zz.files WHERE pid = $1 ORDER BY id', [F.id])).map(f => f.id).sort().join(), [p1, p2].sort().join(), 'a row goes only once its object is out of the bucket');
    ok(dropped.every(k => k.indexOf('u/' + F.id + '/') === 0), 'objects named by player, kind and file', dropped);
    r = await files.purge(pg, t0 + 31 * 86400000, async () => true);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.files WHERE pid = $1', [F.id]))[0].n, 0, 'the next run finishes the rest');
    process.env.CRON_SECRET = 'cronsecret-test';
    eq((await call('cron')).status, 401, 'the daily job needs Vercel\'s secret when one is set');
    const cr = await call('cron', { headers: { authorization: 'Bearer cronsecret-test' } });
    eq(cr.status, 200, 'and runs with it');
    // it also counts what is past its keeping time in the audit log and sign-in sessions, without removing anything
    await pg.query("INSERT INTO zz.admin_log (at, sub, jti, path, status) VALUES ($1, 'svc:snowrealm-games-admin', 'j-old', 'overview', 200), ($2, 'svc:snowrealm-games-admin', 'j-new', 'overview', 200)", [now - 200 * DAY, now]);
    await pg.query("INSERT INTO zz.authsess (id, intent, box, made, exp) VALUES ('s-old', 'recover', 'sealed', $1, $2)", [now - 3 * DAY, now - 3 * DAY + 600000]);
    const w = (await call('cron', { headers: { authorization: 'Bearer cronsecret-test' } })).json.watch;
    ok(w && w.adminLog.rows === 2 && w.adminLog.pastKeep === 1 && w.adminLog.keepDays === 180 && /Z$/.test(w.adminLog.oldest) && w.authSessions.expired === 1 && w.authSessions.expiredWithData === 1, 'the daily job reports what is past its time', w);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.admin_log'))[0].n + (await pg.query('SELECT count(*)::int AS n FROM zz.authsess'))[0].n, 3, 'and deletes none of it');
    delete process.env.CRON_SECRET;
    for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];
  }

  // ---------- random matching: keyboards with keyboards, touch screens with touch screens, mixed only after a wait ----------
  {
    let ipn = 120;
    const q = (key, dev, mix) => room(Object.assign({ a: 'quick', key, dev }, mix ? { mix: true } : {}), { ip: '203.0.113.' + (ipn++) });
    const k = n => ('devkey' + n).padEnd(28, 'x');
    const pcHost = await q(k(1), 'pc');
    const touch1 = await q(k(2), 'touch');
    ok(pcHost.json.seat === 0 && touch1.json.seat === 0 && touch1.json.code !== pcHost.json.code, 'a phone does not take a keyboard player who has just started waiting', [pcHost.json, touch1.json]);
    const pc2 = await q(k(3), 'pc');
    ok(pc2.json.seat === 1 && pc2.json.code === pcHost.json.code, 'a keyboard player sits with the keyboard player', pc2.json);
    const touch2 = await q(k(4), 'touch');
    ok(touch2.json.seat === 1 && touch2.json.code === touch1.json.code, 'and a phone with the phone', touch2.json);
    // nobody of the same kind: after the wait, the other kind is taken
    const lonePc = await q(k(5), 'pc');
    now += 9000;
    const loneTouch = await q(k(6), 'touch');
    ok(loneTouch.json.seat === 1 && loneTouch.json.code === lonePc.json.code, 'after waiting a while a keyboard player is matched with a phone', loneTouch.json);
    // two hosts of different kinds both waiting: the one who says "still here" after the wait moves into the other's room
    const h1 = await q(k(7), 'pc');
    const h2 = await q(k(8), 'touch');
    ok(h1.json.seat === 0 && h2.json.seat === 0 && h1.json.code !== h2.json.code, 'two of different kinds, both waiting');
    eq((await room({ a: 'still', code: h2.json.code, key: k(8), mix: true })).json.join, undefined, 'not before the wait');
    now += 9000;
    const st = await room({ a: 'still', code: h2.json.code, key: k(8), mix: true });
    ok(st.json.join === h1.json.code && st.json.seat === 1, 'after it, the waiting phone moves into the keyboard player\'s room', st.json);
    eq((await pg.query('SELECT count(*)::int AS n FROM zz.queue WHERE code = ANY($1)', [[h1.json.code, h2.json.code]]))[0].n, 0, 'and neither room is waiting any more');
    ok((await room({ a: 'x', code: h1.json.code, key: k(7), seat: 0, out: [] })).json.paired === true, 'the keyboard player sees a guest');
  }

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
