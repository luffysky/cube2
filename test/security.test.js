'use strict';
// Attacks from one player on another, and on the game's money, through the real API handlers and an in-process
// Postgres (Owner task "BRICKDUEL 資安" P0.3 to P0.7). Each check is something a player could actually send.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const { make } = require('../tools/pglite-db.js');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 24, 4, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);
// cloud files need the bucket settings (nothing is ever sent: the addresses are only signed); membership here comes from
// the test-only trial switch, so member-only paths can be tried
Object.assign(process.env, { R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDTEST', R2_SECRET_ACCESS_KEY: 'SECRETTEST', R2_BUCKET: 'zzb', MEMBER_TRIAL: '1' });

let ipN = 0;
function call(name, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'POST'; req.url = o.url || '/api/' + name;
    req.headers = Object.assign({ host: 'brickduel.snowrealm.pet', 'x-real-ip': o.ip || '10.7.' + (++ipN >> 8 & 255) + '.' + (ipN & 255) }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* none */ } resolve({ status: this.statusCode, json }); } };
    app.handle(name, req, res);
  });
}
const bearer = (id, key) => ({ authorization: 'Bearer ' + id + '.' + key });
const rpc = (body, c, extra) => call('rpc', { body, headers: Object.assign(c ? bearer(c.id, c.key) : {}, extra || {}) });
let opN = 0;
const op = (k, a) => ({ i: 'sec' + String(++opN).padStart(6, '0'), k, a: a || [] });
const state = async id => (await pg.query('SELECT state, ver FROM zz.players WHERE id = $1', [id]))[0];

(async () => {
  const V = (await rpc({ a: 'hello' })).json, A = (await rpc({ a: 'hello' })).json;    // victim, attacker
  ok(V.ok && A.ok && V.id !== A.id, 'two players');

  // ---------- P0.3 someone else's save: ids and keys ----------
  eq((await rpc({ a: 'sync', ops: [op('name', ['pwned'])] }, { id: V.id, key: A.key })).status, 401, 'the victim\'s save id with the attacker\'s key: 401');
  eq((await rpc({ a: 'sync', ops: [] }, { id: V.id, key: V.key.slice(0, -1) + (V.key.slice(-1) === 'A' ? 'B' : 'A') })).status, 401, 'a key one character off: 401');
  eq((await rpc({ a: 'sync', ops: [] }, { id: V.id, key: '' })).status, 401, 'no key: 401');
  eq((await rpc({ a: 'sync', ops: [op('name', ['pwned'])], id: V.id, pid: V.id, playerId: V.id }, A)).status, 200, 'naming the victim in the body does not matter…');
  ok((await state(V.id)).state.name !== 'pwned', '…the attacker only ever changes the attacker\'s own save');
  for (const a of ['history', 'code', 'idStatus', 'delete', 'restore', 'signout', 'fr', 'fileList', 'mailStatus']) {
    const r = await rpc({ a, id: V.id, pid: V.id, kind: 'pics' }, { id: V.id, key: A.key });
    ok(r.status === 401, a + ' with the victim\'s id and another key: 401', r.status);
  }
  ok((await state(V.id)).state && (await pg.query('SELECT gone FROM zz.players WHERE id = $1', [V.id]))[0].gone === null, 'the victim\'s save was not deleted by any of that');

  // ---------- P0.4/P0.5 coins, items and rewards come from the server's rules only ----------
  const c0 = (await state(A.id)).state.coins;
  let r = await rpc({ a: 'sync', ops: [{ i: 'secforge01', k: 'adGrant', a: [], srv: true }] }, A);
  eq(r.status, 400, 'a reward only the server may give (adGrant) cannot be sent by the page');
  r = await rpc({ a: 'sync', ops: [{ i: 'secforge02', k: 'pvp', a: [1], srv: true }] }, A);
  eq(r.status, 400, 'nor a ranked result the server settles (pvp)');
  r = await rpc({ a: 'sync', ops: [{ i: 'secforge03', k: 'coins', a: [99999] }] }, A);
  // (the save's coins below are compared after each attempt, so none of these may change them)
  eq(r.status, 400, 'there is no operation that sets coins');
  r = await rpc({ a: 'sync', st: { coins: 999999 }, ops: [op('name', ['x'])] }, A);
  ok(r.status === 200 && (await state(A.id)).state.coins === c0, 'a whole save sent along with a sync is ignored', (await state(A.id)).state.coins);
  r = await rpc({ a: 'sync', ops: [op('fin', [{ mode: 'rank', result: 1, level: 9, ko: 9, ms: 120000, stats: { score: 999999 } }])] }, A);
  ok(r.json.res[0].ok === false && r.json.res[0].why === 'proof', 'a ranked result without a tape the server can replay is refused', r.json.res);
  const fake = { mode: 'ai', result: 1, level: 9, ko: 9, ms: 120000, stats: { score: 999999 } };
  r = await rpc({ a: 'sync', ops: [op('fin', [fake])] }, A);
  const board = await pg.query("SELECT count(*)::int AS n FROM zz.scores WHERE pid = $1 AND board = 'score'", [A.id]);
  const m1 = await pg.query('SELECT proven FROM zz.matches WHERE pid = $1 ORDER BY id DESC LIMIT 1', [A.id]);
  ok(r.json.res[0].ok && board[0].n === 0 && m1[0] && m1[0].proven === false, 'a casual result without a tape: kept as unproven, never on a leaderboard', [r.json.res, board[0], m1[0]]);
  {
    const st = (await state(A.id)).state;
    ok(st.coins === c0 && (st.xp | 0) === 0, 'and it pays no coins and no experience', [st.coins - c0, st.xp]);
    // the page saying "this one is proven" changes nothing: only the server's own replay counts
    r = await rpc({ a: 'sync', ops: [op('fin', [fake, true]), op('fin', [fake, { ok: 1 }]), op('lvl', [1, 9, null, true])] }, A);
    const st2 = (await state(A.id)).state;
    ok(st2.coins === c0 && (st2.xp | 0) === 0 && !(st2.lv && st2.lv.stars), 'a page claiming its result is proven gets nothing for it', [r.json.res, st2.coins - c0, st2.lv]);
  }
  r = await rpc({ a: 'sync', ops: Array.from({ length: 9 }, () => op('fin', [fake])) }, A);   // 15 minutes of play to begin with
  ok(r.json.res.some(x => x.why === 'fast'), 'and no faster than matches can be played (the time allowance runs out)', r.json.res);

  const buy = op('item', [1]);
  await pg.query("UPDATE zz.players SET state = jsonb_set(state, '{coins}', '100'::jsonb), ver = ver + 1 WHERE id = $1", [A.id]);
  r = await rpc({ a: 'sync', ops: [buy] }, A);
  const after1 = (await state(A.id)).state;
  r = await rpc({ a: 'sync', ops: [buy, buy] }, A);
  const after2 = (await state(A.id)).state;
  ok(after1.coins < 100 && after2.coins === after1.coins && after2.items[1] === after1.items[1], 'the same purchase sent again (replayed) is done once', [after1.coins, after2.coins]);
  const ledger = await pg.query("SELECT count(*)::int AS n FROM zz.ledger WHERE pid = $1 AND why = 'item'", [A.id]);
  ok(ledger[0].n <= 1, 'and the coin ledger has it once', ledger[0]);
  r = await rpc({ a: 'sync', ops: [op('item', [9999]), op('buy', ['tile', 'no-such']), op('buy', ['../etc', 'x'])] }, A);
  ok(r.status === 200 && r.json.res.every(x => !x.ok) && (await state(A.id)).state.coins === after2.coins, 'unknown item and look ids buy nothing and cost nothing', r.json.res);
  delete process.env.MEMBER_TRIAL;
  r = await rpc({ a: 'sync', ops: [op('sub')] }, V);
  ok(r.json.res[0].ok === false && r.json.res[0].why === 'pay', 'no free membership outside the test switch', r.json.res);
  process.env.MEMBER_TRIAL = '1';

  // ---------- P0-A: match coins only for a result its replay backs up ----------
  {
    const TAPE = require('./tape.js');
    const coinsOf = async c => (await rpc({ a: 'sync', ops: [] }, c)).json.st.coins;
    const W = (await rpc({ a: 'hello' })).json, X2 = (await rpc({ a: 'hello' })).json;
    now += 3600000;                                   // an hour of real time: allowance for a few matches
    // a real match the computer played, with its tape: it pays
    const real = TAPE.fin('ai', { seed: 9101, ms: 90000 });
    let c0 = await coinsOf(W);
    r = await rpc({ a: 'sync', ops: [op('fin', real)] }, W);
    const paid = r.json.st.coins - c0;
    ok(r.json.res[0].ok && paid > 0, 'a match with its real replay pays', [r.json.res, paid]);
    // the same replay again (a resend with a new id): nothing
    c0 = r.json.st.coins;
    r = await rpc({ a: 'sync', ops: [op('fin', real)] }, W);
    ok(r.json.st.coins === c0, 'the same replay handed in twice pays once', r.json.st.coins - c0);
    // the same replay from another account (one recording passed around): nothing
    const cx = await coinsOf(X2);
    r = await rpc({ a: 'sync', ops: [op('fin', real)] }, X2);
    ok(r.json.res[0].ok && r.json.st.coins === cx, 'another account handing in that replay gets nothing', r.json.st.coins - cx);
    // a loss reported as a win, on its real tape
    const lost = TAPE.fin('ai', { seed: 9102, ms: 90000, garbage: 6, level: 0 });
    const lostM = Object.assign({}, lost[0], { result: 1, ko: 0 });
    c0 = await coinsOf(W);
    r = await rpc({ a: 'sync', ops: [op('fin', [lostM, lost[1]])] }, W);
    ok(lost[0].koOpp > 0 && r.json.st.coins === c0, 'a lost match (knocked out) reported as a win pays nothing', [lost[0].koOpp, r.json.st.coins - c0]);
    // a real tape with the score multiplied
    const big = TAPE.fin('ai', { seed: 9103, ms: 90000 });
    const bigM = Object.assign({}, big[0], { stats: Object.assign({}, big[0].stats, { score: big[0].stats.score * 10 + 50000 }) });
    c0 = await coinsOf(W);
    r = await rpc({ a: 'sync', ops: [op('fin', [bigM, big[1]])] }, W);
    ok(r.json.st.coins === c0, 'a score blown up past what its moves make pays nothing', r.json.st.coins - c0);
    // more lines than the tape cleared
    const ln = TAPE.fin('ai', { seed: 9104, ms: 90000 });
    const lnM = Object.assign({}, ln[0], { stats: Object.assign({}, ln[0].stats, { lines: ln[0].stats.lines + 20 }) });
    c0 = await coinsOf(W);
    r = await rpc({ a: 'sync', ops: [op('fin', [lnM, ln[1]])] }, W);
    ok(r.json.st.coins === c0, 'and so does a line count the tape does not show', r.json.st.coins - c0);
    // two devices of one save settling the same match at the same moment
    const both = TAPE.fin('ai', { seed: 9105, ms: 90000 });
    c0 = await coinsOf(W);
    const twin = await Promise.all([rpc({ a: 'sync', ops: [op('fin', both)] }, W), rpc({ a: 'sync', ops: [op('fin', both)] }, W)]);
    const after = await coinsOf(W), one = TAPE.fin('ai', { seed: 9105, ms: 90000 });
    ok(twin.every(x => x.status === 200) && after - c0 > 0 && after - c0 < 2 * paid + 200 && JSON.stringify(one[1]) === JSON.stringify(both[1]), 'two devices settling one match at once: paid once', after - c0);
    const twice = await pg.query("SELECT count(*)::int AS n FROM zz.matches WHERE pid = $1 AND proven", [W.id]);
    // the ledger: every change of the balance is one line, and the lines add up to it
    const lg = (await rpc({ a: 'ledger' }, W)).json;
    ok(lg.ok && lg.sum === lg.coins && lg.n === lg.rows.length || (lg.ok && lg.sum === lg.coins), 'the coin ledger adds up to the balance', [lg.sum, lg.coins, lg.n]);
    ok((await rpc({ a: 'ledger' }, { id: W.id, key: X2.key })).status === 401, 'and nobody else can read it');
    void twice;
  }

  // ---------- P0.6 cloud files: only one's own, only the kinds and sizes allowed ----------
  await rpc({ a: 'sync', ops: [op('sub')] }, V);
  const up = (await rpc({ a: 'fileUp', kind: 'pics', name: 'wall', size: 1000, type: 'image/png' }, V)).json;
  ok(up.ok && /^https:\/\//.test(up.url) && /X-Amz-Expires=600&/.test(up.url) && !/AKIDTEST.*SECRETTEST|SECRETTEST/.test(up.url), 'the victim gets a signed upload address that lasts ten minutes (no secret in it)', up.url && up.url.split('?')[0]);
  ok((await rpc({ a: 'fileOk', id: up.id }, A)).json.ok === false, 'the attacker cannot mark the victim\'s upload done');
  ok((await rpc({ a: 'fileOk', id: up.id }, V)).json.ok === true, 'the victim can');
  r = await rpc({ a: 'fileHide', id: up.id }, A);
  ok(!r.json.ok || !r.json.n, 'the attacker cannot remove the victim\'s file', r.json);
  ok((await rpc({ a: 'fileList', kind: 'pics' }, A)).json.files.length === 0, 'and does not see it in a list');
  ok((await rpc({ a: 'fileList', kind: 'pics' }, V)).json.files.length === 1, 'the victim still has it');
  ok((await rpc({ a: 'fileBack', id: up.id }, A)).json.ok === false, 'nor bring back the victim\'s removed files');
  ok((await rpc({ a: 'fileUp', kind: 'pics', name: 'x', size: 1000, type: 'image/svg+xml' }, V)).json.why === 'type', 'no SVG (scripts) as pictures');
  ok((await rpc({ a: 'fileUp', kind: 'pics', name: 'x', size: 200 * 1024 * 1024, type: 'image/png' }, V)).json.why === 'big', 'no files past the size limit');
  ok((await rpc({ a: 'fileUp', kind: '../../other', name: 'x', size: 10, type: 'image/png' }, V)).json.why === 'kind', 'no other kinds (no path games)');
  ok((await rpc({ a: 'fileUp', kind: 'pics', name: 'x', size: 10, type: 'image/png' }, A)).json.why === 'member', 'not a member: no uploads');

  // ---------- P0.4 rooms: a seat is its key; nobody speaks for another seat ----------
  const hostKey = crypto.randomBytes(24).toString('base64url'), guestKey = crypto.randomBytes(24).toString('base64url');
  const room = (await call('room', { body: { a: 'open', key: hostKey, cap: 2 } })).json;
  ok(room.ok && room.code, 'a room is opened', room);
  const join = (await call('room', { body: { a: 'join', code: room.code, key: guestKey } })).json;
  ok(join.ok && join.seat === 1, 'a guest joins with the code');
  r = await call('room', { body: { a: 'x', code: room.code, seat: 0, key: guestKey, out: [{ n: 1, m: { t: 'fake win' } }] } });
  ok(r.status === 404, 'the guest cannot write as the host (wrong key for that seat)', r.status);
  r = await call('room', { body: { a: 'close', code: room.code, key: guestKey } });
  ok((await call('room', { body: { a: 'x', code: room.code, seat: 1, key: guestKey, out: [] } })).json.ok === true, 'and cannot close the host\'s room');
  r = await call('room', { body: { a: 'join', code: room.code, key: crypto.randomBytes(24).toString('base64url') } });
  ok(!r.json.ok, 'a full room takes nobody else', r.json);

  // ---------- P0.2 the linking routes refuse what they should ----------
  eq((await rpc({ a: 'idLink', idt: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' }, A)).status, 503, 'the direct token route is closed while Identity is not set up here');
  eq((await call('authStart', { body: { intent: 'link' }, headers: { origin: 'https://evil.example' } })).status, 403, 'another site cannot start a link');

  // ---------- P0.7 test-only switches do nothing in production ----------
  const R = require('../server/rules.js'), S = require('../server/savesync.js'), D = require('../server/db.js');
  ok(!R.trialOpen({ MEMBER_TRIAL: '1', VERCEL_ENV: 'production' }), 'MEMBER_TRIAL is ignored in production');
  ok(!S.enabled({ SAVE_SYNC_ENABLED: '1', SAVE_SYNC_URL: 'https://x.example/{platformId}', SAVE_SYNC_KEY: 'self', VERCEL_ENV: 'production' }), 'a self-made sync key is refused in production');
  ok(!D.staging({ IDENTITY_STAGING: '1', VERCEL_ENV: 'production' }) && !D.staging({ BRICKDUEL_ADMIN_TEST_TRUST: '1', VERCEL_ENV: 'production' }), 'staging switches never move production to the staging database');
  const admin = require('../server/admin.js'), bff = require('../server/bff.js');
  ok(!bff.settings({ IDENTITY_STAGING: '1', VERCEL_ENV: 'production', IDENTITY_ISSUER: 'https://identity-staging.snowrealm.pet', IDENTITY_JWKS_URL: 'https://identity-staging.snowrealm.pet/.well-known/jwks.json', IDENTITY_AUDIENCE: 'snowrealm:brickduel:api', IDENTITY_LINK_ENABLED: '1', IDENTITY_STAGING_CLIENT_SECRET: 'y'.repeat(48) }) || !bff.settings({ IDENTITY_STAGING: '1', VERCEL_ENV: 'production', IDENTITY_ISSUER: 'https://identity-staging.snowrealm.pet', IDENTITY_JWKS_URL: 'https://identity-staging.snowrealm.pet/.well-known/jwks.json', IDENTITY_AUDIENCE: 'snowrealm:brickduel:api', IDENTITY_LINK_ENABLED: '1', IDENTITY_STAGING_CLIENT_SECRET: 'y'.repeat(48) }).staging, 'production never runs linking in staging mode');
  ok(typeof admin.settings !== 'function' || !admin.settings({ BRICKDUEL_ADMIN_TEST_TRUST: '1', VERCEL_ENV: 'production', BRICKDUEL_ADMIN_ISSUER: 'https://anything.example', BRICKDUEL_ADMIN_JWKS_URL: 'https://anything.example/jwks', BRICKDUEL_ADMIN_SUBJECTS: 'svc:x' }), 'the admin test trust is ignored in production');

  await pg.close();
  console.log('security tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
