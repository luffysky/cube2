'use strict';
// The read-only admin API (server/admin.js) end to end: the real handler and SQL against an in-process Postgres.
// Machine tokens are signed here with keys made for the test; the cube1 fixture (public key and an expired token,
// test/fixtures/cube1-brickduel-admin-jwt.json) is checked at its own clock. No real issuer, key or player.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const admin = require('../server/admin.js');
const TAPE = require('./tape.js');
const rules = require('../server/rules.js');
const { make } = require('../tools/pglite-db.js');
const FIX = require('./fixtures/cube1-brickduel-admin-jwt.json');

// membership here comes from the old free trial, which only a test setup may open (MEMBER_TRIAL=1, never production)
process.env.MEMBER_TRIAL = '1';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 21, 2, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);
TAPE.stub(rules.ZZ);

function call(url, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'GET'; req.url = url;
    req.headers = Object.assign({ host: 'game.test', 'x-real-ip': '203.0.113.9' }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ } resolve({ status: this.statusCode, headers: this.headers, json, text }); } };
    const name = /^\/internal\/admin\//.test(url) || /^\/api\/admin/.test(url) ? 'admin' : /^\/api\/([a-z]+)/.exec(url)[1];
    app.handle(name, req, res);
  });
}
const rpc = (body, cred) => call('/api/rpc', { method: 'POST', body, headers: cred ? { authorization: 'Bearer ' + cred.id + '.' + cred.key } : {} });
let opN = 0;
const op = (k, a) => ({ i: 'op' + String(++opN).padStart(6, '0'), k, a: a || [] });
const match = o => Object.assign({ mode: 'ai', result: 1, level: 2, ko: 2, koOpp: 0, itemsUsed: 0, ms: 120000, stats: { score: 12000, spins: 3, minis: 0, sent: 30, quads: 1, maxCombo: 2, xspins: 0, lines: 40, pieces: 120 } }, o || {});
const taped = m => [m, TAPE.fake(m)];
async function newPlayer() { const r = await rpc({ a: 'hello' }); return { id: r.json.id, key: r.json.key, pub: r.json.pub }; }

// ---------- machine tokens ----------
const ISS = 'https://identity.snowrealm.pet', SUB = 'svc:snowrealm-games-admin';
const K1 = crypto.generateKeyPairSync('ed25519'), K2 = crypto.generateKeyPairSync('ed25519'), WRONG = crypto.generateKeyPairSync('ed25519'), PLAYER = crypto.generateKeyPairSync('ed25519');
const jwk = (k, kid) => Object.assign({ kid, use: 'sig', alg: 'EdDSA' }, k.publicKey.export({ format: 'jwk' }));
let published = [jwk(K1, 'adm-1')], jwksDown = false, fetches = 0, fetchedUrl = '';
admin.setFetch(async url => { fetches++; fetchedUrl = url; if (jwksDown) throw new Error('down'); return { ok: true, json: async () => ({ keys: published }) }; });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims, o) {
  o = o || {};
  const sec = Math.floor(now / 1000), head = Object.assign({ alg: 'EdDSA', typ: 'JWT', kid: o.kid || 'adm-1' }, o.head || {});
  const body = Object.assign({ iss: ISS, aud: 'snowrealm:brickduel:admin', sub: SUB, scope: 'brickduel:admin:read', iat: sec, nbf: sec, exp: sec + 300, jti: crypto.randomUUID() }, claims || {});
  for (const k of o.drop || []) delete body[k];
  const data = b64(head) + '.' + b64(body);
  return data + '.' + crypto.sign(null, Buffer.from(data), (o.key || K1).privateKey).toString('base64url');
}
const get = (path, tok, o) => call('/internal/admin/v1/' + path, Object.assign({ headers: tok ? { authorization: 'Bearer ' + tok } : {} }, o || {}));
const ENV = ['BRICKDUEL_ADMIN_SUBJECTS', 'BRICKDUEL_ADMIN_JWKS', 'BRICKDUEL_ADMIN_JWKS_URL', 'BRICKDUEL_ADMIN_ISSUER', 'BRICKDUEL_ADMIN_TEST_TRUST', 'VERCEL_ENV'];
const reset = () => { for (const k of ENV) delete process.env[k]; admin.clearCache(); };

(async () => {
  reset();
  // ---------- off until the subjects are set ----------
  let r = await get('overview', sign());
  ok(r.status === 503 && r.json.error === 'disabled' && r.headers['cache-control'] === 'no-store', 'no subjects set: 503 disabled, not cached', r);
  eq((await get('overview', null, { method: 'POST' })).status, 405, 'not GET: 405 even while off');
  ok((await get('overview', null, { method: 'DELETE' })).headers.allow === 'GET', 'and says GET is allowed');
  process.env.BRICKDUEL_ADMIN_SUBJECTS = 'not a subject, also bad';
  eq((await get('overview', sign())).status, 503, 'a subjects list with nothing valid in it is still off');
  process.env.BRICKDUEL_ADMIN_SUBJECTS = 'svc:some-other-service';
  eq((await get('overview', sign({ sub: 'svc:some-other-service' }))).status, 503, 'outside tests only svc:snowrealm-games-admin can be listed: anything else leaves it off');
  process.env.BRICKDUEL_ADMIN_SUBJECTS = 'svc:some-other-service, ' + SUB;
  eq((await get('overview', sign({ sub: 'svc:some-other-service' }))).status, 403, 'and listing another beside it does not let that one in');
  process.env.BRICKDUEL_ADMIN_SUBJECTS = SUB;
  process.env.BRICKDUEL_ADMIN_ISSUER = 'https://elsewhere.example';
  eq((await get('overview', sign({ iss: 'https://elsewhere.example' }))).status, 503, 'another issuer without the test switch: off');
  process.env.BRICKDUEL_ADMIN_TEST_TRUST = '1'; process.env.VERCEL_ENV = 'production';
  eq((await get('overview', sign({ iss: 'https://elsewhere.example' }))).status, 503, 'and the test switch never works on production');
  delete process.env.BRICKDUEL_ADMIN_ISSUER; delete process.env.BRICKDUEL_ADMIN_TEST_TRUST; delete process.env.VERCEL_ENV;
  process.env.BRICKDUEL_ADMIN_JWKS_URL = 'https://identity.snowrealm.pet/.well-known/jwks.json';
  eq((await get('overview', sign())).status, 503, 'the players\' JWKS is not accepted as the admin key source');
  delete process.env.BRICKDUEL_ADMIN_JWKS_URL;

  // ---------- some data: three saves, matches, boxes ----------
  const P1 = await newPlayer(), P2 = await newPlayer(), P3 = await newPlayer();
  await rpc({ a: 'sync', ops: [op('fin', taped(match())), op('fin', taped(match({ mode: 'rank', ko: 3, koOpp: 1 })))] }, P1);
  await rpc({ a: 'sync', ops: [op('sub'), op('draw', [3])] }, P2);
  await rpc({ a: 'sync', ops: [op('fin', [match({ mode: 'net', room: 'AB23C', seats: 4, result: -1 })])] }, P3);
  await pg.query('UPDATE zz.players SET ban = true WHERE id = $1', [P3.id]);
  const secretsBefore = JSON.stringify(await pg.query('SELECT hash FROM zz.keys'));

  // ---------- who may call ----------
  r = await get('overview', sign());
  ok(r.status === 200 && fetchedUrl === 'https://identity.snowrealm.pet/.well-known/admin-jwks.json', 'a good machine token reads, keys from the admin JWKS', [r.status, fetchedUrl, r.json]);
  ok(!r.headers['access-control-allow-origin'] && r.headers['cache-control'] === 'no-store', 'no CORS, no-store');
  const ov = r.json;
  ok(ov.gameId === 'brickduel' && ov.apiVersion === '1' && ov.players === 3 && ov.bannedPlayers === 1 && ov.playersActive7d === 3 && typeof ov.coinsOutstanding === 'string' && ov.boxesOpened7d === 3 && ov.openRooms === 0 && ov.quickQueue === 0 && /Z$/.test(ov.generatedAt), 'overview numbers', ov);
  eq(ov.playerGamesTotal, 3, 'career games summed');
  const bad = [
    ['no token', null], ['not a JWT', 'abc'],
    ['wrong key', sign({}, { key: WRONG })], ['alg none', sign({}, { head: { alg: 'none' } })], ['alg HS256', sign({}, { head: { alg: 'HS256' } })],
    ['unknown kid', sign({}, { kid: 'nope' })], ['no kid', sign({}, { head: { kid: undefined } })],
    ['wrong issuer', sign({ iss: 'https://identity.snowrealm.pet/' })], ['player audience', sign({ aud: 'snowrealm:brickduel:api' })],
    ['expired', sign({ exp: Math.floor(now / 1000) - 61, iat: Math.floor(now / 1000) - 361, nbf: Math.floor(now / 1000) - 361 })],
    ['not yet', sign({ nbf: Math.floor(now / 1000) + 120 })], ['issued in the future', sign({ iat: Math.floor(now / 1000) + 120, exp: Math.floor(now / 1000) + 400 })],
    ['too long-lived', sign({ exp: Math.floor(now / 1000) + 601 })], ['no jti', sign({}, { drop: ['jti'] })], ['no nbf', sign({}, { drop: ['nbf'] })],
    ['seconds with a fraction', sign({ exp: Math.floor(now / 1000) + 300.5 })], ['player key and audience', sign({ aud: 'snowrealm:brickduel:api', sub: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', scope: 'brickduel:account:link' }, { key: PLAYER })]
  ];
  for (const [name, tok] of bad) { const x = await get('overview', tok); ok(x.status === 401 && x.json.error === 'unauthorized' && x.headers['www-authenticate'] === 'Bearer', '401: ' + name, x.json); }
  eq((await get('overview', sign({ sub: 'svc:someone-else' }))).status, 403, '403: a good token for a subject not on the list');
  eq((await get('overview', sign({ scope: 'brickduel:admin:readwrite' }))).status, 403, '403: the scope must be the whole word');
  eq((await get('overview', sign({ scope: 'brickduel:account:link' }))).status, 403, '403: a player scope');
  eq((await get('overview', sign({}, { drop: ['scope'] }))).status, 403, '403: no scope at all');
  eq((await get('overview', sign({ sub: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }))).status, 403, '403: a player UUID as subject');
  eq((await get('overview', sign({ aud: ['snowrealm:brickduel:api'] }))).status, 401, '401: player audience in a list');
  eq((await get('overview', sign({ scope: 'brickduel:admin:read brickduel:other' }))).status, 200, 'other scopes beside it are fine');
  const tok = sign();
  ok((await get('overview', tok)).status === 200 && (await get('players', tok)).status === 200, 'the same short-lived token can be used again (refresh, paging)');
  // key rotation: a new kid is fetched once; unknown kids do not fetch every time
  published = [jwk(K1, 'adm-1'), jwk(K2, 'adm-2')];
  now += 61000;      // the unknown kids above already used this minute's extra fetch
  const f0 = fetches;
  eq((await get('overview', sign({}, { kid: 'adm-2', key: K2 }))).status, 200, 'a new key in the JWKS is picked up for its kid');
  ok(fetches === f0 + 1, 'with one fetch', fetches - f0);
  await get('overview', sign({}, { kid: 'adm-9' })); await get('overview', sign({}, { kid: 'adm-9' }));
  ok(fetches === f0 + 1, 'unknown kids do not fetch again within a minute', fetches - f0);
  published = [jwk(K1, 'adm-1'), jwk(K2, 'adm-1')]; admin.clearCache();
  eq((await get('overview', sign())).status, 401, 'two keys under one kid: neither is believed');
  published = [jwk(K1, 'adm-1')]; admin.clearCache();
  jwksDown = true; admin.clearCache();
  r = await get('overview', sign());
  ok(r.status === 503 && r.json.error === 'unavailable', 'keys cannot be fetched: 503 unavailable (never zeros)', r.json);
  jwksDown = false; admin.clearCache();
  process.env.BRICKDUEL_ADMIN_JWKS = JSON.stringify({ keys: [jwk(K2, 'adm-2')] });
  ok((await get('overview', sign({}, { kid: 'adm-2', key: K2 }))).status === 200 && (await get('overview', sign())).status === 401, 'keys set inline replace the fetched ones (emergency swap)');
  delete process.env.BRICKDUEL_ADMIN_JWKS; admin.clearCache();

  // ---------- paths ----------
  eq((await get('nothing', sign())).status, 404, '404 for an unknown path');
  eq((await get('players/not-a-uuid', sign())).status, 404, '404 for a malformed player id');
  eq((await get('players/6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', sign())).status, 404, '404 for a player that is not there');
  eq((await get('overview', sign(), { method: 'POST' })).status, 405, '405 for POST with a good token');
  eq((await call('/api/admin?__ap=overview', { headers: { authorization: 'Bearer ' + sign() } })).status, 200, 'the rewritten form reaches the same handler');

  // ---------- players ----------
  r = await get('players?limit=2', sign());
  ok(r.status === 200 && r.json.items.length === 2 && typeof r.json.nextCursor === 'string', 'a page of two with a cursor', r.json);
  const it = r.json.items[0];
  eq(Object.keys(it).sort(), ['banned', 'coins', 'createdAt', 'gameUserId', 'games', 'lastSeenAt', 'level', 'nickname', 'publicTag', 'rankedGames', 'rating', 'season', 'snowrealmPlayerId'], 'exactly the agreed fields');
  ok(it.snowrealmPlayerId === null && typeof it.coins === 'string' && /Z$/.test(it.createdAt), 'not linked is null; coins a string; UTC times');
  const r2 = await get('players?limit=2&cursor=' + r.json.nextCursor, sign());
  ok(r2.json.items.length === 1 && r2.json.nextCursor === null, 'the last page ends with null', r2.json);
  const allIds = r.json.items.concat(r2.json.items).map(x => x.gameUserId).sort();
  eq(allIds, [P1.id, P2.id, P3.id].sort(), 'every save once across the pages');
  for (const q of ['limit=0', 'limit=101', 'limit=abc', 'cursor=!!', 'cursor=' + Buffer.from('[1]').toString('base64url'), 'cursor=' + Buffer.from('["x","y"]').toString('base64url')]) eq((await get('players?' + q, sign())).status, 400, '400 for ' + q);
  // a save waiting to be deleted is not listed
  await pg.query('UPDATE zz.players SET gone = $1 WHERE id = $2', [now, P3.id]);
  ok((await get('players', sign())).json.items.every(x => x.gameUserId !== P3.id) && (await get('overview', sign())).json.players === 2, 'a save waiting to be deleted is left out');
  eq((await get('players/' + P3.id, sign())).status, 404, 'and cannot be looked up');
  await pg.query('UPDATE zz.players SET gone = NULL WHERE id = $1', [P3.id]);

  // ---------- one player ----------
  r = await get('players/' + P2.id.toUpperCase(), sign());
  ok(r.status === 200 && r.json.gameUserId === P2.id && r.json.subscription.active === true && r.json.subscription.kind === 'trial' && /Z$/.test(r.json.subscription.until) && r.json.deviceCount === 1, 'one player: membership and devices', r.json);
  ok(r.json.recentDraws.length === 1 && r.json.recentDraws[0].boxes.length === 3 && Array.isArray(r.json.recentMatches) && r.json.recentMatches.length === 0, 'recent boxes and matches', r.json);
  ok(r.json.items && typeof r.json.items === 'object' && !('0' in r.json.items), 'items held, by item id');
  const text = JSON.stringify(r.json);
  ok(text.indexOf(P2.key) < 0 && !/"state"|"srv"|"hash"|"key"|203\.0\.113/.test(text), 'no key, hash, raw record or address', text.slice(0, 300));
  r = await get('players/' + P1.id, sign());
  ok(r.json.recentMatches.length === 2 && r.json.recentMatches[0].mode === 'rank' && r.json.recentMatches[0].proven === true && r.json.subscription.active === false && r.json.subscription.kind === null && r.json.subscription.until === null, 'matches newest first; no membership', r.json);

  // ---------- matches ----------
  r = await get('matches?limit=2', sign());
  ok(r.json.items.length === 2 && r.json.nextCursor && r.json.items[0].mode === 'net' && r.json.items[0].room === 'AB23C' && r.json.items[0].seats === 4 && r.json.items[0].proven === false, 'matches newest first, online seat unproven', r.json);
  eq(Object.keys(r.json.items[0]).sort(), ['at', 'durationMs', 'gameUserId', 'itemsUsed', 'ko', 'koOpp', 'level', 'lines', 'matchLogId', 'mode', 'pieces', 'proven', 'quick', 'result', 'room', 'score', 'seats', 'sent', 'spins', 'team'], 'match fields as agreed');
  eq((await get('matches?cursor=' + r.json.nextCursor, sign())).json.items.length, 1, 'next page');
  eq((await get('matches?player=' + P1.id, sign())).json.items.length, 2, 'by player');
  eq((await get('matches?room=AB23C', sign())).json.items.length, 1, 'by room');
  eq((await get('matches?player=nope', sign())).status, 400, 'a bad player filter is 400');

  // ---------- draws ----------
  r = await get('draws', sign());
  ok(r.json.items.length === 1 && r.json.items[0].gameUserId === P2.id && r.json.summary.boxes === 3 && r.json.summary.grades.length >= 1, 'boxes with a summary', r.json);
  const g = r.json.summary.grades;
  ok(g.every(x => typeof x.published === 'number' || x.published === null) && Math.abs(g.reduce((a, x) => a + (x.share || 0), 0) - 1) < 1e-9, 'shares add to one, beside the published odds', g);
  r = await get('draws?from=2026-11-22&to=2026-11-23', sign());
  ok(r.json.items.length === 0 && r.json.summary.boxes === 0 && r.json.summary.grades.every(x => x.share === null), 'an empty period: zero boxes, shares null', r.json.summary);
  eq((await get('draws?from=2026-11-23&to=2026-11-22', sign())).status, 400, 'from after to is 400');
  eq((await get('draws?from=yesterday', sign())).status, 400, 'a bad date is 400');

  // ---------- metrics ----------
  r = await get('metrics', sign());
  const M = r.json;
  ok(M.players.total === 3 && M.players.guest === 3 && M.players.linked === 0 && M.players.steam === null && M.players.minorDeclared === null && M.regions === null && M.players.banned === 1, 'players: unknowns are null, not 0', M.players);
  ok(M.devices.total === 3 && M.devices.perPlayer === 1 && M.devices.unsaved === null, 'devices', M.devices);
  ok(M.subs.active === 1 && M.subs.trial === 1 && M.subs.paid === 0, 'subs', M.subs);
  ok(M.active.d1 === 3 && M.matches.today.ai === 1 && M.matches.today.rank === 1 && M.matches.today.net === 1 && Object.values(M.boxes.today).reduce((a, b) => a + b, 0) === 3, 'today', M);
  ok(typeof M.economy.coinsOutstanding === 'string' && typeof M.economy.itemsOutstanding === 'object', 'economy', M.economy);

  // ---------- metrics/games ----------
  await pg.query("INSERT INTO zz.scores (pid, board, season, val, at) VALUES ($1, 'm_snake_0', '', 120, $3), ($2, 'm_snake_1', '', 90, $4), ($1, 'm_push', '', 7, $3)", [P1.id, P2.id, now, now - 10 * 86400000]);
  await pg.query("UPDATE zz.players SET state = jsonb_set(state, '{rpg}', '{\"best\": 3, \"wins\": 5, \"cls\": \"tank\"}'::jsonb) WHERE id = $1", [P1.id]);
  await pg.query("UPDATE zz.players SET state = jsonb_set(state, '{rpg}', '{\"best\": \"x\", \"wins\": \"-1\"}'::jsonb) WHERE id = $1", [P2.id]);
  r = await get('metrics/games', sign());
  const G = {}; (r.json.games || []).forEach(x => { G[x.id] = x; });
  ok(r.status === 200 && r.json.gameId === 'brickduel', 'metrics/games answers', r.json);
  ok(G['mode:rank'] && G['mode:rank'].kind === 'mode' && G['mode:rank'].name === '排位' && G['mode:rank'].matchesToday === 1 && G['mode:rank'].players7d === 1, 'a match mode: today, seven days, players', G['mode:rank']);
  ok(G['mode:ai'] && G['mode:ai'].name === '對電腦', 'the computer mode is named', G['mode:ai']);
  ok(G.snake.playersWithScore === 2 && G.snake.playersImproved7d === 1 && G.snake.name === '磚蛇', 'a brick game: players with a score, improved this week', G.snake);
  ok(G.push.playersWithScore === 1 && G.sweep && G.sweep.playersWithScore === 0, 'a level game counts too; a game nobody played is 0 (measured), not missing', [G.push, G.sweep]);
  ok(G.rpg.playersStarted === 1 && G.rpg.clearsTotal === '5' && G.rpg.stages === 10 && G.rpg.active7d === 0, '磚之冒險 from the saves; a malformed record counts as nothing (active7d from the play log)', G.rpg);
  ok(G.dungeon && G.dungeon.source === 'plays' && G.dungeon.plays7d === 0, '地城小隊 now counted from the play log', G.dungeon);
  ok(JSON.stringify(r.json).indexOf(P1.id) < 0 && JSON.stringify(r.json).indexOf(P1.key) < 0, 'no player ids or keys in the per-game view');

  // ---------- metrics/plays: who plays what, every kind of game ----------
  {
    // the three matches above are already in the play log; now a brick game (straight from its page, then again when
    // 轉磚 opens: one game), a dungeon run, a lost level and a weather practice run
    await rpc({ a: 'sync', ops: [op('mini', ['snake', 1, 320, 0, 60000, 'q1a2b3c4d5']), op('play', ['dungeon', 'party3', 600000, 1, 'dg1x2y3z4'])] }, P2);
    await rpc({ a: 'sync', ops: [op('mini', ['snake', 1, 320, 0, 60000, 'q1a2b3c4d5']), op('play', ['level', 'fail', 90000, -1]), op('play', ['nope', 'x', 1, 1])] }, P2);
    const pr = (await pg.query("SELECT game, mode, ms, result FROM zz.plays WHERE pid = $1 ORDER BY id", [P2.id]));
    ok(pr.length === 3 && pr[0].game === 'snake' && pr[0].mode === 'normal' && pr[1].game === 'dungeon' && pr[2].game === 'level' && pr[2].mode === 'fail' && pr[2].result === -1,
      'the play log: one brick game (sent twice), one dungeon run, one lost level; an unknown game is not a game', pr);
    r = await get('metrics/plays', sign());
    const Q = r.json, by = {}; (Q.games || []).forEach(x => { by[x.id] = x; });
    ok(r.status === 200 && Q.players.playedToday === 3 && Q.players.played7d === 3 && Q.plays.last7d === 6, 'players who played and games played, all kinds', [Q.players, Q.plays]);
    ok(by.main.last7d.plays === 3 && by.main.last7d.players === 2 && by.main.modes.some(m => m.mode === 'rank' && m.name === '排位' && m.last7d.plays === 1), '轉磚對戰 by mode', by.main);
    ok(by.snake.last7d.plays === 1 && by.snake.last7d.minutes === 1 && by.snake.name === '磚蛇' && by.dungeon.last7d.plays === 1 && by.dungeon.last7d.wins === 1 && by.level.modes[0].mode === 'fail', 'brick games, the dungeon and levels counted too', [by.snake, by.dungeon, by.level]);
    ok(by.sweep && by.sweep.last30d.plays === 0, 'a game nobody played is 0, not missing', by.sweep);
    const day = Q.daily.items[Q.daily.items.length - 1];
    ok(Q.daily.items.length === 14 && day.players === 3 && day.plays === 6 && day.playsByGame.main === 3 && day.playersByGame.main === 2, 'by day (last 14 days by default)', day);
    eq((await get('metrics/plays?from=2026-11-23&to=2026-11-01', sign())).status, 400, 'from after to is 400');
    const G2 = {}; (await get('metrics/games', sign())).json.games.forEach(x => { G2[x.id] = x; });
    ok(G2.dungeon.plays7d === 1 && G2.snake.plays7d === 1 && G2.level.plays7d === 1, 'metrics/games shows the play log too', [G2.dungeon, G2.snake, G2.level]);
    const text2 = JSON.stringify(Q);
    ok(text2.indexOf(P2.key) < 0 && text2.indexOf(P2.id) < 0, 'counts only: no player ids or keys');
  }

  // ---------- metrics/daily ----------
  r = await get('metrics/daily?from=2026-11-19&to=2026-11-21', sign());
  ok(r.status === 200 && r.json.items.length === 3 && r.json.items.map(x => x.date).join() === '2026-11-19,2026-11-20,2026-11-21', 'one line a day, both ends, in order', r.json);
  const d3 = r.json.items[2], d1 = r.json.items[0];
  ok(d3.newPlayers === 3 && d3.activePlayers === 2 && d3.rankedGames === 1 && d3.onlineMatches === 1 && d3.matches.ai === 1 && typeof d3.coinsEarned === 'string' && typeof d3.coinsSpent === 'string', 'today\'s line', d3);
  ok(d3.newSubs === null && d3.steamNewPlayers === null && d3.steamActivePlayers === null, 'no honest source: null', d3);
  ok(d1.newPlayers === 0 && d1.activePlayers === 0 && d1.coinsEarned === '0', 'an empty day is zeros (measured)', d1);
  ok(+d3.coinsEarned > 0, 'coins won in matches show as earned', d3);
  eq((await get('metrics/daily', sign())).json.items.length, 7, 'without dates: the last seven days');
  for (const q of ['from=2026-11-21&to=2026-11-19', 'from=2025-01-01&to=2026-11-21', 'from=2026-02-30', 'from=nov']) eq((await get('metrics/daily?' + q, sign())).status, 400, '400 for ' + q);

  // ---------- limits and the audit ----------
  const logBefore = (await pg.query('SELECT count(*)::int AS n FROM zz.admin_log'))[0].n;
  const t2 = sign();
  for (let i = 0; i < 70; i++) await get('overview', t2);
  r = await get('overview', t2);
  ok(r.status === 429 && r.json.error === 'slow' && +r.headers['retry-after'] > 0, 'more than 60 a minute for one subject: 429', r.json);
  now += 60000;
  eq((await get('overview', sign())).status, 200, 'the next minute is fine again');
  const logs = await pg.query('SELECT at, sub, jti, path, status FROM zz.admin_log ORDER BY id');
  ok(logs.length > logBefore && logs.every(l => !/eyJ/.test(JSON.stringify(l))), 'every checked call is in the audit, never the token');
  ok(logs.some(l => l.status === 403 && l.sub === 'svc:someone-else') && logs.some(l => l.status === 429) && logs.some(l => l.status === 404 && l.path === 'nothing'), 'with its subject, path and status', logs.slice(-3));
  ok(!logs.some(l => l.sub === null), 'unauthenticated calls are not written to the database (only counted in the log)');
  ok(logs.every(l => l.path.indexOf('?') < 0), 'no query strings in the audit');
  eq(JSON.stringify(await pg.query('SELECT hash FROM zz.keys')), secretsBefore, 'nothing about the saves changed (read only)');

  // ---------- the cube1 fixture: published key, signed token, its own clock ----------
  reset();
  Object.assign(process.env, { BRICKDUEL_ADMIN_SUBJECTS: FIX.subject, BRICKDUEL_ADMIN_ISSUER: FIX.issuer, BRICKDUEL_ADMIN_TEST_TRUST: '1', BRICKDUEL_ADMIN_JWKS: JSON.stringify(FIX.jwks) });
  now = Date.parse(FIX.verificationTime);
  eq((await get('overview', FIX.token)).status, 200, 'cube1 fixture token verifies at its clock');
  now = Date.parse('2025-01-01T00:06:01Z');
  eq((await get('overview', FIX.token)).status, 401, 'and is expired after its window');
  now = Date.parse(FIX.verificationTime);
  process.env.BRICKDUEL_ADMIN_SUBJECTS = 'svc:snowrealm-games-admin';
  eq((await get('overview', FIX.token)).status, 403, 'the fixture subject is not the production subject');
  delete process.env.BRICKDUEL_ADMIN_ISSUER; delete process.env.BRICKDUEL_ADMIN_TEST_TRUST;
  process.env.BRICKDUEL_ADMIN_SUBJECTS = FIX.subject;
  eq((await get('overview', FIX.token)).status, 503, 'outside tests the fixture subject cannot even be configured');
  process.env.BRICKDUEL_ADMIN_SUBJECTS = 'svc:snowrealm-games-admin';
  eq((await get('overview', FIX.token)).status, 401, 'and with the production settings the fixture token is refused (its issuer)');
  reset();

  console.log('admin api tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
