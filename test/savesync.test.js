'use strict';
// Linked saves copied to SnowRealm Games (server/savesync.js), against an in-process Postgres and a stand-in Games
// endpoint. Keys are made here; nothing real is called and no real player is used.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const sync = require('../server/savesync.js');
const { make } = require('../tools/pglite-db.js');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 24, 3, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);

const K = crypto.generateKeyPairSync('ed25519');
const JWK = JSON.stringify(K.privateKey.export({ format: 'jwk' }));
const URL_T = 'https://games.test.example/v1/games/brickduel/saves/{platformId}', ISS = 'https://brickduel.snowrealm.pet';
const ON = { SAVE_SYNC_ENABLED: '1', SAVE_SYNC_URL: URL_T, SAVE_SYNC_PRIVATE_JWK: JWK, SAVE_SYNC_ISSUER: ISS };
const NAMES = ['SAVE_SYNC_ENABLED', 'SAVE_SYNC_URL', 'SAVE_SYNC_PRIVATE_JWK', 'SAVE_SYNC_ISSUER', 'SAVE_SYNC_KEY'];
const setEnv = o => { for (const k of NAMES) delete process.env[k]; Object.assign(process.env, o || {}); };

// ---------- the stand-in Games endpoint (the receiver's rules from cube1 docs/BRICKDUEL_SAVE_SYNC.md) ----------
const STATE = ['v', 'steam', 'note', 'coins', 'rp', 'peak', 'rgames', 'streak', 'xp', 'name', 'season', 'title', 'owned', 'equip', 'sub', 'custom', 'sign', 'pvp', 'daily', 'mini', 'box', 'wheel', 'slot', 'lv', 'tot', 'first', 'rpg', 'titles', 'items', 'bring'];
const same = (a, b) => a.length === b.length && a.every(k => b.indexOf(k) >= 0);
function valid(platformId, b) {
  const base = ['schema', 'platformId', 'gameUserId', 'generation', 'ver', 'at', 'event'];
  const keys = b.event === 'upsert' ? base.concat(['publicTag', 'state']) : base;
  if (!same(Object.keys(b), keys)) return 'keys';
  if (b.schema !== 'brickduel.save.v1' || b.platformId !== platformId || !Number.isSafeInteger(b.generation) || b.generation < 1 || !Number.isSafeInteger(b.ver) || b.ver < 1
    || ['upsert', 'hide', 'purge'].indexOf(b.event) < 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(b.at)) return 'snapshot';
  if (b.event === 'upsert') {
    if (!/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/.test(b.publicTag) || !same(Object.keys(b.state), STATE) || b.state.v !== 1 || typeof b.state.steam !== 'boolean') return 'state';
    if (/"(srv|secret|token|authorization|email|password|cookie|deviceKey|transferCode|ip|fileContent)"\s*:/i.test(JSON.stringify(b.state))) return 'forbidden';
  }
  return '';
}
const got = [];
let mode = 200, slow = false;
sync.setFetch(async (url, o) => {
  const body = JSON.parse(o.body), pid = decodeURIComponent(url.split('/').pop());
  got.push({ url, method: o.method, headers: o.headers, body, bad: valid(pid, body) });
  if (slow) await new Promise((r, j) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; j(e); }));
  if (mode === 'down') throw new TypeError('fetch failed');
  const status = typeof mode === 'number' ? mode : 200;
  return { status, json: async () => status === 200 ? { result: 'applied' } : status === 409 ? { error: 'binding_conflict' } : { error: 'save_sync_retry' } };
});

let ipN = 0;
function call(name, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'POST'; req.url = o.url || '/api/' + name;
    req.headers = Object.assign({ host: 'brickduel.snowrealm.pet', 'x-real-ip': '10.9.' + (++ipN >> 8 & 255) + '.' + (ipN & 255) }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* none */ } resolve({ status: this.statusCode, headers: this.headers, json }); } };
    app.handle(name, req, res);
  });
}
const auth = c => ({ authorization: 'Bearer ' + c.id + '.' + c.key });
const rpc = (body, cred) => call('rpc', { body, headers: cred ? auth(cred) : {} });
let opN = 0;
const op = () => ({ i: 'op' + (++opN) + 'x'.repeat(12), k: 'name', a: ['N' + opN] });
const rowOf = async pid => (await pg.query('SELECT gen, sver, due, tries, err, ended FROM zz.syncs WHERE pid = $1', [pid]))[0] || null;
const link = (pid, sub) => pg.query("INSERT INTO zz.identity (platform_id, pid, linked_at, provider_hint) VALUES ($1, $2, $3, 'snowrealm')", [sub, pid, now]);
function check(token) {
  const [h, b, s] = token.split('.');
  const head = JSON.parse(Buffer.from(h, 'base64url')), body = JSON.parse(Buffer.from(b, 'base64url'));
  return { head, body, good: crypto.verify(null, Buffer.from(h + '.' + b), K.publicKey, Buffer.from(s, 'base64url')) };
}
const quiet = async fn => { const w = console.warn, lines = []; console.warn = x => lines.push(String(x)); try { await fn(); } finally { console.warn = w; } return lines; };
const SUB = '8f8f8f8f-1111-4222-8333-444455556666', SUB2 = '9e9e9e9e-1111-4222-8333-444455556666';

(async () => {
  // ---------- off: nothing is queued or sent ----------
  setEnv({});
  const A = (await rpc({ a: 'hello' })).json, B = (await rpc({ a: 'hello' })).json;
  await link(A.id, SUB);
  eq((await rpc({ a: 'sync', ops: [op()] }, A)).status, 200, 'off: a linked save still saves');
  eq(got.length, 0, 'off: nothing is sent');
  eq((await call('syncJwks', { method: 'GET' })).json, { keys: [] }, 'no key: the published key list is empty');
  setEnv(Object.assign({}, ON, { SAVE_SYNC_PRIVATE_JWK: '' }));
  ok(!sync.enabled(), 'on without a key: still off');
  setEnv(Object.assign({}, ON, { SAVE_SYNC_URL: 'http://games.test.example/{platformId}' }));
  ok(!sync.enabled(), 'on with a plain-http address: still off');
  setEnv(Object.assign({}, ON, { SAVE_SYNC_ISSUER: '' }));
  ok(!sync.enabled(), 'outside production, no issuer set: still off');
  setEnv(Object.assign({}, ON, { SAVE_SYNC_ENABLED: '' }));
  ok(!sync.enabled(), 'key and address without the switch: off');
  const pubList = (await call('syncJwks', { method: 'GET' })).json;
  ok(pubList.keys.length === 1 && pubList.keys[0].kty === 'OKP' && pubList.keys[0].crv === 'Ed25519' && pubList.keys[0].alg === 'EdDSA' && !('d' in pubList.keys[0]) && pubList.keys[0].x === K.publicKey.export({ format: 'jwk' }).x,
    'with a key set, its public half is published (and never the private part)', pubList);

  // ---------- on ----------
  setEnv(ON);
  ok(sync.enabled(), 'switch, address, issuer and key: on');
  got.length = 0;
  eq((await rpc({ a: 'sync', ops: [op()] }, B)).status, 200, 'an unlinked save saves');
  ok(got.length === 0 && !(await rowOf(B.id)), 'and is never queued or sent');
  let r = await rpc({ a: 'sync', ops: [op()] }, A);
  eq(r.status, 200, 'a linked save saves');
  ok(got.length === 1, 'and goes to Games right away', got.length);
  const g = got[0], t = check(g.headers.Authorization.replace(/^Bearer /, ''));
  eq([g.method, g.url], ['PUT', 'https://games.test.example/v1/games/brickduel/saves/' + SUB], 'PUT to the address with the platform id');
  ok(t.good && t.head.alg === 'EdDSA' && t.head.kid === pubList.keys[0].kid, 'a token signed with this environment\'s key, its kid published', t.head);
  ok(t.body.iss === ISS && t.body.aud === 'snowrealm:games:save-sync' && t.body.sub === 'svc:brickduel' && t.body.scope === 'save:write' && t.body.exp - t.body.iat === 300 && /^[\w.-]{8,128}$/.test(t.body.jti), 'iss, aud, sub, scope, five minutes, a jti', t.body);
  eq(g.bad, '', 'the event passes the receiver\'s checks');
  ok(g.body.event === 'upsert' && g.body.generation === 1 && g.body.ver === 1 && g.body.gameUserId === A.id && g.body.publicTag === A.pub && g.body.at === new Date(now).toISOString(), 'upsert, first generation, version 1', Object.assign({}, g.body, { state: '…' }));
  const raw = JSON.stringify(g.body);
  ok(raw.indexOf(A.key) < 0 && !/"srv"|"hash"|"key"|"email"|"mail"/.test(raw), 'no device key, server notes or e-mail in it');
  ok((await rowOf(A.id)).due === null, 'sent: nothing waiting');
  got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, A);
  ok(got.length === 1 && got[0].body.ver === 2 && got[0].body.generation === 1, 'the next change: a higher version, same generation');

  // ---------- Games is down: the save still saves, the copy waits and is tried again later ----------
  mode = 503; got.length = 0;
  eq((await rpc({ a: 'sync', ops: [op()] }, A)).status, 200, 'Games answering 503 does not fail the save');
  let q = await rowOf(A.id);
  ok(got.length === 1 && q.tries === 1 && q.due > now && q.err === 'http 503', 'it waits, to be tried again later', q);
  mode = 'down'; now += 31000;
  r = await call('cron', { method: 'GET' });
  q = await rowOf(A.id);
  ok(r.json.saveSync && r.json.saveSync.later === 1 && q.tries === 2 && q.err === 'fetch' && q.due - now === 60000, 'the daily job tries it again; still down, the next try is further away', [r.json.saveSync, q]);
  mode = 200; slow = true; now += 61000;
  const t0 = Date.now();
  await call('cron', { method: 'GET' });
  ok(Date.now() - t0 < 6000 && (await rowOf(A.id)).err === 'timeout', 'a Games that does not answer is cut off after a few seconds', Date.now() - t0);
  slow = false; now += 3 * 60000; got.length = 0;
  r = await call('cron', { method: 'GET' });
  ok(r.json.saveSync.sent === 1 && got.length === 1 && got[0].body.event === 'upsert' && (await rowOf(A.id)).due === null, 'back up: it goes and nothing waits', r.json.saveSync);
  const vers = (await pg.query('SELECT sver FROM zz.syncs WHERE pid = $1', [A.id]))[0].sver;
  ok(Number(vers) === got[0].body.ver && got[0].body.ver === 6, 'every attempt took a version of its own (none is ever sent twice with other content)', [vers, got[0].body.ver]);

  // ---------- refused: put aside, said in the log, tried again with the next change ----------
  mode = 409; got.length = 0;
  let lines = await quiet(() => rpc({ a: 'sync', ops: [op()] }, A));
  q = await rowOf(A.id);
  ok(got.length === 1 && q.due === null && q.err === 'upsert conflict binding_conflict' && lines.some(l => l === '[zz] savesync upsert conflict binding_conflict'), '409: put aside for a person, with the reason in the log', [q, lines]);
  now += 3600000;
  r = await call('cron', { method: 'GET' });
  ok(r.json.saveSync.sent + r.json.saveSync.later + r.json.saveSync.aside === 0, 'the daily job leaves it aside');
  mode = 400; got.length = 0;
  lines = await quiet(() => rpc({ a: 'sync', ops: [op()] }, A));
  ok(got.length === 1 && (await rowOf(A.id)).err === 'upsert refused http 400 save_sync_retry' && lines.length === 1, 'any other refusal: likewise', lines);
  mode = 200; got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, A);
  ok(got.length === 1 && (await rowOf(A.id)).err === null && (await rowOf(A.id)).due === null, 'the next change tries again and goes');

  // ---------- deleted (hidden), then taken back ----------
  got.length = 0;
  eq((await rpc({ a: 'delete' }, A)).status, 200, 'its player deletes the save');
  ok(got.length === 1 && got[0].body.event === 'hide' && got[0].bad === '' && !('state' in got[0].body) && !('publicTag' in got[0].body), 'Games is told: hide, no content', got[0] && got[0].body);
  const hideVer = got[0].body.ver;
  got.length = 0;
  eq((await rpc({ a: 'restore' }, A)).status, 200, 'and takes it back');
  ok(got.length === 1 && got[0].body.event === 'upsert' && got[0].body.ver > hideVer && got[0].bad === '', 'Games gets the whole save again, at a higher version');

  // ---------- an update that cannot go is put aside after a day ----------
  mode = 503; got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, A);
  now += 25 * 3600000;
  lines = await quiet(async () => { r = await call('cron', { method: 'GET' }); });
  ok(r.json.saveSync.aside === 1 && (await rowOf(A.id)).due === null && lines.some(l => /^\[zz\] savesync upsert gave up \(http 503, 2 tries\)$/.test(l)), 'after a day it is put aside, said in the log', [r.json.saveSync, lines]);
  ok(!lines.join(' ').match(/eyJ|coins|8f8f8f8f/), 'the log line has no token, save content or account id');
  mode = 200; got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, A);
  ok(got.length === 1 && (await rowOf(A.id)).due === null, 'and the next change sends it again');

  // ---------- gone for good: a purge, which keeps trying until it is heard, after the save itself is gone ----------
  await rpc({ a: 'delete' }, A);
  await pg.query('DELETE FROM zz.players WHERE id = $1', [A.id]);          // what the 30-day purge does
  ok(!!(await rowOf(A.id)), 'the sync row outlives the save');
  mode = 503; got.length = 0; now += 60000;
  await call('cron', { method: 'GET' });
  ok(got.length === 1 && got[0].body.event === 'purge' && got[0].bad === '' && got[0].body.platformId === SUB && got[0].body.gameUserId === A.id, 'the daily job finds it and sends a purge (no content)', got[0] && got[0].body);
  now += 30 * 3600000;
  await call('cron', { method: 'GET' });
  ok((await rowOf(A.id)).due !== null && !(await rowOf(A.id)).ended, 'a purge is not given up after a day');
  // a new save on the same account waits for that purge, then goes as the next generation
  const C2 = (await rpc({ a: 'hello' })).json;
  await link(C2.id, SUB);
  got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, C2);
  ok(got.length === 0 && (await rowOf(C2.id)).gen === 2 && (await rowOf(C2.id)).err === 'waiting for the earlier save', 'a second save on the account: generation 2, waiting for the first one\'s purge', await rowOf(C2.id));
  mode = 200; got.length = 0; now += 7 * 3600000;
  r = await call('cron', { method: 'GET' });
  const ev = got.map(x => x.body.event + ':' + x.body.generation);
  ok(ev.indexOf('purge:1') >= 0 && (await rowOf(A.id)).ended && (await rowOf(A.id)).due === null, 'the purge is heard: that save is done for good', ev);
  got.length = 0; now += 7 * 3600000;
  await call('cron', { method: 'GET' });
  ok(got.length === 1 && got[0].body.event === 'upsert' && got[0].body.generation === 2 && got[0].body.ver === 1 && got[0].body.gameUserId === C2.id, 'then the new save goes, generation 2 from version 1', got.map(x => x.body.event + ':' + x.body.generation));
  got.length = 0; now += 86400000;
  await call('cron', { method: 'GET' });
  ok(got.length === 0, 'nothing more is ever sent for the purged save');

  // ---------- a save no longer linked: put aside, nothing sent ----------
  const D = (await rpc({ a: 'hello' })).json;
  await link(D.id, SUB2);
  await rpc({ a: 'sync', ops: [op()] }, D);
  await pg.query('DELETE FROM zz.identity WHERE pid = $1', [D.id]);
  await pg.query('UPDATE zz.syncs SET due = $2 WHERE pid = $1', [D.id, now]);
  got.length = 0;
  r = await call('cron', { method: 'GET' });
  ok(got.length === 0 && (await rowOf(D.id)).err === 'unlinked', 'a save no longer linked is put aside without sending', await rowOf(D.id));
  await rpc({ a: 'sync', ops: [op()] }, D);
  ok(got.length === 0 && (await rowOf(D.id)).due === null, 'and its next changes are not sent');

  // ---------- staging: a key the server makes for itself (nobody handles the private half) ----------
  setEnv({ SAVE_SYNC_ENABLED: '1', SAVE_SYNC_URL: URL_T, SAVE_SYNC_ISSUER: 'https://brickduel-staging.snowrealm.pet', SAVE_SYNC_KEY: 'self' });
  ok(sync.enabled(), 'self-made key: on');
  const own1 = (await call('syncJwks', { method: 'GET' })).json;
  sync._forgetOwnKey();
  const own2 = (await call('syncJwks', { method: 'GET' })).json;
  ok(own1.keys.length === 1 && JSON.stringify(own1) === JSON.stringify(own2) && own1.keys[0].x !== pubList.keys[0].x && !('d' in own1.keys[0]), 'it is made once, kept, and only its public half is published', own1);
  ok((await pg.query('SELECT count(*)::int AS n FROM zz.synckey'))[0].n === 1, 'one key in the database');
  const E = (await rpc({ a: 'hello' })).json;
  await link(E.id, '7a7a7a7a-1111-4222-8333-444455556666');
  got.length = 0;
  await rpc({ a: 'sync', ops: [op()] }, E);
  const tk = got[0] && got[0].headers.Authorization.replace(/^Bearer /, '').split('.');
  const goodOwn = tk && crypto.verify(null, Buffer.from(tk[0] + '.' + tk[1]), crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: own1.keys[0].x }, format: 'jwk' }), Buffer.from(tk[2], 'base64url'));
  const claims = tk && JSON.parse(Buffer.from(tk[1], 'base64url'));
  ok(goodOwn && claims.iss === 'https://brickduel-staging.snowrealm.pet' && JSON.parse(Buffer.from(tk[0], 'base64url')).kid === own1.keys[0].kid, 'events are signed with it, iss the staging origin', claims);
  setEnv({ SAVE_SYNC_ENABLED: '1', SAVE_SYNC_URL: URL_T, SAVE_SYNC_KEY: 'self', VERCEL_ENV: 'production' });
  ok(!sync.enabled(), 'never in production: there the key must come from the hosting settings');
  delete process.env.VERCEL_ENV;

  // ---------- switched off again: the daily job leaves Games alone ----------
  setEnv({});
  r = await call('cron', { method: 'GET' });
  ok(r.json.saveSync === null, 'off: the daily job does not send', r.json);

  await pg.close();
  console.log('savesync tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
