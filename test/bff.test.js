'use strict';
// "Connect to SnowRealm Games" (server/bff.js) end to end against an in-process Postgres and a stand-in Identity:
// the portal, POST /oauth/token and POST /v1/token/status are played by this test with keys it makes itself.
// Nothing real is called and no real secret, token or player is used.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const idn = require('../server/identity.js');
const bff = require('../server/bff.js');
const { make } = require('../tools/pglite-db.js');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 21, 3, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);

const ISS = 'https://identity.test.example', AUD = 'snowrealm:brickduel:api', SECRET = 'test-client-secret-'.padEnd(48, 'x');
const ENV = { IDENTITY_ISSUER: ISS, IDENTITY_JWKS_URL: ISS + '/.well-known/jwks.json', IDENTITY_AUDIENCE: AUD, IDENTITY_LINK_ENABLED: '1', IDENTITY_BRICKDUEL_CLIENT_SECRET: SECRET };
const K = crypto.generateKeyPairSync('ed25519');
const jwk = Object.assign({ kid: 'p1', use: 'sig', alg: 'EdDSA' }, K.publicKey.export({ format: 'jwk' }));
let jwksDown = false;
idn.setFetch(async () => jwksDown ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => ({ keys: [jwk] }) });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims) {
  const sec = Math.floor(now / 1000), head = { alg: 'EdDSA', typ: 'JWT', kid: 'p1' };
  const body = Object.assign({ iss: ISS, aud: AUD, sub: U1, jti: crypto.randomUUID(), iat: sec, nbf: sec, exp: sec + 300, scope: 'brickduel:account:link' }, claims || {});
  const data = b64(head) + '.' + b64(body);
  return data + '.' + crypto.sign(null, Buffer.from(data), K.privateKey).toString('base64url');
}
const U1 = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', U2 = '0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e';

// ---------- the stand-in Identity ----------
const codes = {}, seenBodies = [];
let tokenMode = 'ok', statusMode = 'ok', claimsExtra = {};
const want = { client: 'brickduel-bff', redirect: 'https://brickduel.snowrealm.pet/api/auth/callback' };
function portal(url, sub) {
  const u = new URL(url), code = crypto.randomBytes(32).toString('base64url');
  codes[code] = { sub, state: u.searchParams.get('state'), nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge'), used: false };
  return { code, state: u.searchParams.get('state') };
}
const lastFetch = async (url, o) => {
  const body = JSON.parse(o.body || '{}'), h = o.headers;
  seenBodies.push({ url, headers: Object.assign({}, h), body });
  const reply = (status, j) => ({ status, json: async () => j });
  if (url === ISS + '/oauth/token') {
    if (tokenMode === 'down') throw new Error('timeout');
    if (tokenMode === '503') return reply(503, { error: 'authorization_unavailable' });
    if (h['x-snowrealm-client-secret'] !== SECRET) return reply(401, { error: 'invalid_client' });
    const c = codes[body.code];
    if (!c || c.used || body.clientId !== want.client || body.redirectUri !== want.redirect ||
      crypto.createHash('sha256').update(body.codeVerifier, 'ascii').digest('base64url') !== c.challenge || body.state !== c.state || body.nonce !== c.nonce) return reply(400, { error: 'invalid_grant' });
    c.used = true;
    return reply(200, { access_token: sign(Object.assign({ sub: c.sub, nonce: c.nonce }, claimsExtra)), token_type: 'Bearer', expires_in: 300, scope: 'brickduel:account:link' });
  }
  if (url === ISS + '/v1/token/status') {
    if (statusMode === 'timeout') throw new Error('timeout');
    if (h['x-snowrealm-client-secret'] !== SECRET || !/^Bearer /.test(h.Authorization)) return reply(401, { active: false });
    if (statusMode === 'revoked') return reply(200, { active: false });
    if (statusMode === '403') return reply(403, { active: false });
    if (statusMode === '503') return reply(503, { active: false });
    if (statusMode === 'weird') return reply(200, { active: 'true' });
    return reply(200, { active: true });
  }
  return reply(404, {});
};
bff.setFetch(lastFetch);

// ---------- requests ----------
// every request comes from an address of its own (in order, never repeated), so the start limit, which counts per
// address, is reached only where a test means to reach it. (They used to be random, and now and then one landed on the
// address the limit test had used up, making a later start answer 429: CI run 45020952901.)
let ipN = 0;
const nextIp = () => { ipN++; return '10.' + ((ipN >> 16) & 255) + '.' + ((ipN >> 8) & 255) + '.' + (ipN & 255); };
const LIMIT_IP = '192.0.2.1';      // used by the limit test only
function call(name, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'POST'; req.url = o.url || '/api/' + name;
    req.headers = Object.assign({ host: 'brickduel.snowrealm.pet', 'x-real-ip': o.ip || nextIp() }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* none */ } resolve({ status: this.statusCode, headers: this.headers, json, text }); } };
    app.handle(name, req, res);
  });
}
const auth = c => c ? { authorization: 'Bearer ' + c.id + '.' + c.key } : {};
const rpc = (body, cred) => call('rpc', { body, headers: auth(cred) });
async function newPlayer() { const r = await rpc({ a: 'hello' }); return { id: r.json.id, key: r.json.key }; }
const cookieFrom = r => { const m = /__Host-zzauth=([A-Za-z0-9_-]*)/.exec(r.headers['set-cookie'] || ''); return m ? m[1] : null; };
let HOST = 'brickduel.snowrealm.pet';
const startIt = (intent, cred, o) => call('authStart', Object.assign({ body: { intent }, headers: Object.assign({ host: HOST }, auth(cred)) }, o || {}));
const back = (q, cookie, host) => call('authCallback', { method: 'GET', url: '/api/auth/callback?' + q, headers: Object.assign({ host: host || HOST }, cookie ? { cookie: '__Host-zzauth=' + cookie } : {}) });
const resultOf = cookie => call('authResult', { body: {}, headers: Object.assign({ host: HOST }, cookie ? { cookie: 'other=1; __Host-zzauth=' + cookie } : {}) });
const where = r => r.headers.location;
// a whole round: start, the portal, the callback; gives the cookie and the callback's answer
async function round(intent, cred, sub, tweak) {
  const s = await startIt(intent, cred);
  // a start that did not work is a failure of its own, with its answer, not something to read past
  if (s.status !== 200) { ok(false, 'start for a round (' + intent + ') answered ' + s.status, s.json); return { s, cb: { headers: { location: '(start failed: ' + s.status + ')' } } }; }
  const cookie = cookieFrom(s), p = portal(s.json.url, sub || U1);
  const q = tweak ? tweak(p) : 'code=' + p.code + '&state=' + p.state;
  return { s, cookie, p, cb: await back(q, cookie) };
}
const coinsOf = async id => +(await pg.query("SELECT (state->>'coins') AS c FROM zz.players WHERE id = $1", [id]))[0].c;

(async () => {
  // ---------- off ----------
  let r = await startIt('recover');
  ok(r.status === 503 && r.json.why === 'off', 'nothing set: start is 503', r.json);
  r = await back('code=x&state=y');
  ok(r.status === 303 && where(r) === '/?auth=off', 'callback while off goes home saying off', where(r));
  eq((await resultOf('x'.repeat(43))).status, 503, 'result while off: 503');
  Object.assign(process.env, ENV, { IDENTITY_LINK_ENABLED: '' });
  eq((await startIt('recover')).status, 503, 'everything set but the enable flag: still 503');
  Object.assign(process.env, ENV, { IDENTITY_BRICKDUEL_CLIENT_SECRET: 'short' });
  eq((await startIt('recover')).status, 503, 'no proper client secret: still 503');
  Object.assign(process.env, ENV);
  eq((await call('health', { method: 'GET' })).json.link, true, 'health says linking is on only when all of it is set');

  // ---------- start ----------
  const P1 = await newPlayer(), P2 = await newPlayer();
  eq((await startIt('link')).status, 401, 'linking needs the device\'s own key');
  eq((await startIt('link', { id: P1.id, key: 'x'.repeat(43) })).status, 401, 'and the right one');
  eq((await startIt('wipe', P1)).status, 400, 'only the known intents');
  eq((await startIt('link', P1, { headers: Object.assign({ origin: 'https://evil.example' }, auth(P1)) })).status, 403, 'another site cannot start it');
  eq((await call('authStart', { method: 'GET' })).status, 405, 'start is POST only');
  r = await startIt('link', P1);
  const sc = r.headers['set-cookie'];
  ok(r.status === 200 && /^__Host-zzauth=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax$/.test(sc), 'a __Host- cookie: Secure, HttpOnly, Lax, thirty minutes (the session inside it lasts ten)', sc);
  const u = new URL(r.json.url);
  ok(u.origin === 'https://games.snowrealm.pet' && u.searchParams.get('sso') === 'brickduel' && u.searchParams.get('client_id') === 'brickduel-bff' && u.searchParams.get('redirect_uri') === 'https://brickduel.snowrealm.pet/api/auth/callback' && u.searchParams.get('code_challenge_method') === 'S256' && /^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('code_challenge')), 'to the portal with the fixed callback and an S256 challenge', r.json.url);
  ok(!/verifier|secret/i.test(r.json.url) && r.json.url.indexOf(cookieFrom(r)) < 0, 'no verifier, secret or session id in the address');
  const rowsNow = JSON.stringify(await pg.query('SELECT * FROM zz.authsess'));
  ok(rowsNow.indexOf(cookieFrom(r)) < 0 && rowsNow.indexOf(u.searchParams.get('state')) < 0 && rowsNow.indexOf(u.searchParams.get('nonce')) < 0, 'the database has neither the session id nor the state or nonce in the clear');

  // ---------- the normal link ----------
  const coins1 = await coinsOf(P1.id);
  let x = await round('link', P1);
  ok(x.cb.status === 303 && where(x.cb) === '/?auth=linked', 'linked', where(x.cb));
  const tok = seenBodies.filter(b => /oauth\/token/.test(b.url)).pop();
  ok(tok.headers['x-snowrealm-client-secret'] === SECRET && tok.body.codeVerifier && tok.body.state === x.p.state && tok.body.nonce, 'the code went to the token endpoint with the secret, verifier, state and nonce');
  const stat = seenBodies.filter(b => /token\/status/.test(b.url)).pop();
  ok(stat && /^Bearer ey/.test(stat.headers.Authorization) && stat.headers['x-snowrealm-client-secret'] === SECRET, 'and the token was checked for revocation');
  ok(where(x.cb).indexOf('ey') < 0 && where(x.cb).indexOf(x.p.code) < 0, 'no token or code in the address home');
  r = await resultOf(x.cookie);
  ok(r.status === 200 && r.json.outcome === 'linked' && r.json.id === P1.id && /^[A-Za-z0-9_-]{43}$/.test(r.json.key) && r.json.key !== P1.key, 'result gives this device its new key', r.json);
  ok(/Max-Age=0/.test(r.headers['set-cookie']), 'and clears the cookie');
  const P1b = { id: P1.id, key: r.json.key };
  eq((await resultOf(x.cookie)).status, 404, 'the result can be read once only');
  eq((await rpc({ a: 'sync', ops: [] }, P1)).status, 401, 'the old device key no longer works');
  eq((await rpc({ a: 'sync', ops: [] }, P1b)).status, 200, 'the new one does');
  eq(await coinsOf(P1.id), coins1, 'coins untouched by linking');
  eq((await pg.query('SELECT pid FROM zz.identity WHERE platform_id = $1', [U1]))[0].pid, P1.id, 'one platform player, one save');
  const all = JSON.stringify(await pg.query('SELECT * FROM zz.authsess'));
  ok(!/eyJ[A-Za-z0-9_-]*\.eyJ/.test(all) && all.indexOf(P1b.key) < 0, 'no token or key left in the sessions');      // (a JWT is eyJ….eyJ…; three letters alone turn up in random ciphertext now and then)

  // ---------- replays and wrong values ----------
  x = await round('link', P1b);
  // (already linked to U1 by this same save: same platform again is fine)
  ok(where(x.cb) === '/?auth=linked', 'linking again to the same account is a plain success', where(x.cb));
  r = await back('code=' + x.p.code + '&state=' + x.p.state, x.cookie);
  eq(where(r), '/?auth=replay', 'the same callback twice: replay');
  x = await round('recover', null, U1, p => 'code=' + p.code + '&state=' + 'w'.repeat(43));
  eq(where(x.cb), '/?auth=state', 'wrong state');
  r = await back('code=' + x.p.code + '&state=' + x.p.state, x.cookie);
  eq(where(r), '/?auth=replay', 'and that session is used up even after a wrong state');
  x = await round('recover', null, U1, p => { codes[p.code].nonce = 'n'.repeat(43); return 'code=' + p.code + '&state=' + p.state; });
  eq(where(x.cb), '/?auth=token', 'wrong nonce (the token endpoint refuses)');
  // the nonce claim is required (cube1 contract 2026-11-21): the stand-in signer puts the stored nonce in by default
  claimsExtra = { nonce: 'not-the-nonce-at-all-xxxxxxxx' };
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=token', 'nonce inside the token is different: refused');
  claimsExtra = { nonce: undefined };
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=token', 'no nonce in the token: refused');
  claimsExtra = { nonce: '' };
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=token', 'an empty nonce: refused');
  claimsExtra = { nonce: 12345 };
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=token', 'a nonce that is not a string: refused');
  claimsExtra = {};
  // a good token with the right nonce, replayed through a new session: the code is spent and the jti used
  const good = await round('recover', null, U1);
  ok(where(good.cb) === '/?auth=recovered', 'the right nonce: accepted', where(good.cb));
  eq(where(await back('code=' + good.p.code + '&state=' + good.p.state, good.cookie)), '/?auth=replay', 'and the same callback again: replay');
  // an expired token that does carry the right nonce
  claimsExtra = { iat: Math.floor(now / 1000) - 700, nbf: Math.floor(now / 1000) - 700, exp: Math.floor(now / 1000) - 400 };
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=token', 'an expired token with the right nonce: refused');
  claimsExtra = {};
  const used = await round('recover', null, U1);
  const s2 = await startIt('recover');
  r = await back('code=' + used.p.code + '&state=' + new URL(s2.json.url).searchParams.get('state'), cookieFrom(s2));
  eq(where(r), '/?auth=token', 'a code that was already exchanged is refused');
  x = await round('recover', null, U1, p => 'code=short&state=' + p.state);
  eq(where(x.cb), '/?auth=code', 'a malformed code');
  x = await round('recover', null, U1, p => 'error=access_denied&state=' + p.state);
  eq(where(x.cb), '/?auth=denied', 'the player said no at the portal');
  x = await round('recover', null, U1, p => 'code=' + p.code + '&state=' + p.state + '&iss=' + encodeURIComponent('https://evil.example'));
  eq(where(x.cb), '/?auth=state', 'a different issuer in the answer');
  // expired
  const s3 = await startIt('recover'), p3 = portal(s3.json.url, U1);
  now += 11 * 60000;
  eq(where(await back('code=' + p3.code + '&state=' + p3.state, cookieFrom(s3))), '/?auth=expired', 'after ten minutes: expired');
  // and a real browser still has the cookie then (one that lived only ten minutes would be gone: B7 said "session")
  const age = +((/Max-Age=(\d+)/.exec(s3.headers['set-cookie']) || [])[1] || 0);
  ok(age * 1000 > 11 * 60000 && age * 1000 <= 30 * 60000, 'the cookie is still in the browser eleven minutes on, and gone within half an hour', age);
  // another browser (換機): no cookie, or someone else's
  const s4 = await startIt('recover'), p4 = portal(s4.json.url, U1);
  eq(where(await back('code=' + p4.code + '&state=' + p4.state)), '/?auth=session', 'the callback in another browser (no cookie): refused');
  const other = await startIt('recover');
  eq(where(await back('code=' + p4.code + '&state=' + p4.state, cookieFrom(other))), '/?auth=state', 'with another browser\'s session: the state does not match');
  eq(where(await back('code=' + p4.code + '&state=' + p4.state, 'y'.repeat(43))), '/?auth=session', 'with a made-up session id: refused');

  // ---------- revocation and outages: all fail closed ----------
  const keyCount = async () => (await pg.query('SELECT count(*)::int AS n FROM zz.keys WHERE pid = $1', [P1.id]))[0].n;
  const keysAtStart = await keyCount();
  for (const [mode, want] of [['revoked', 'revoked'], ['403', 'revoked'], ['503', 'unavailable'], ['timeout', 'unavailable'], ['weird', 'revoked']]) {
    statusMode = mode;
    x = await round('recover', null, U1);
    eq(where(x.cb), '/?auth=' + want, 'token status ' + mode);
  }
  statusMode = 'ok';
  const warnWas = console.warn, warned = []; console.warn = (...m) => warned.push(m.join(' '));
  tokenMode = '503'; x = await round('recover', null, U1); eq(where(x.cb), '/?auth=unavailable', 'token endpoint 503 (not live yet)');
  console.warn = warnWas;
  ok(warned.some(w => w === '[zz] auth unavailable (token 503)'), 'the server log says where it stopped (the upstream status)', warned);
  ok(!warned.some(w => /secret|Bearer|eyJ|[A-Za-z0-9_-]{40,}/.test(w)), 'and nothing secret', warned);
  tokenMode = 'down'; x = await round('recover', null, U1); eq(where(x.cb), '/?auth=unavailable', 'token endpoint timeout');
  tokenMode = 'ok';
  jwksDown = true; idn.clearCache();
  x = await round('recover', null, U1); eq(where(x.cb), '/?auth=unavailable', 'JWKS cannot be fetched');
  jwksDown = false; idn.clearCache();
  eq(await keyCount(), keysAtStart, 'none of the refusals gave out a device key');

  // ---------- another device gets the linked save back ----------
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=recovered', 'recovered on another device');
  r = await resultOf(x.cookie);
  ok(r.json.outcome === 'recovered' && r.json.id === P1.id && r.json.key && r.json.st && typeof r.json.ver === 'number', 'with the same save and a key of its own', r.json);
  eq((await rpc({ a: 'sync', ops: [] }, { id: r.json.id, key: r.json.key })).status, 200, 'that key works');
  x = await round('recover', null, U2);
  eq(where(x.cb), '/?auth=none', 'a platform player with no save here: none');

  // ---------- 409: never merged ----------
  const coins2 = await coinsOf(P2.id);
  x = await round('link', P2, U1);
  eq(where(x.cb), '/?auth=conflict', 'a second save cannot take an account that is linked');
  r = await resultOf(x.cookie);
  ok(r.json.outcome === 'conflict' && r.json.why === 'taken' && r.json.other && !r.json.key, 'the result says why, without a key', r.json);
  ok(await coinsOf(P2.id) === coins2 && await coinsOf(P1.id) === coins1, 'both saves as they were');
  eq((await rpc({ a: 'sync', ops: [] }, P2)).status, 200, 'and the second save\'s device key still works');
  x = await round('link', P1b, U2);
  eq(where(x.cb), '/?auth=conflict', 'a linked save cannot be linked to a second account');
  eq((await pg.query('SELECT platform_id FROM zz.identity WHERE pid = $1', [P1.id]))[0].platform_id, U1, 'it stays with the first');

  // ---------- a save waiting to be deleted ----------
  const P3 = await newPlayer();
  x = await round('link', P3, U2); eq(where(x.cb), '/?auth=linked', 'a third save linked to the second account');
  const P3b = { id: P3.id, key: (await resultOf(x.cookie)).json.key };
  eq((await rpc({ a: 'delete' }, P3b)).status, 200, 'its player deletes it');
  x = await round('recover', null, U2); eq(where(x.cb), '/?auth=pending', 'recover finds it waiting to be deleted');
  x = await round('restore', null, U2); eq(where(x.cb), '/?auth=recovered', 'restore takes the deletion back (the 30 days still hold)');
  ok((await pg.query('SELECT gone FROM zz.players WHERE id = $1', [P3.id]))[0].gone === null, 'and the save is back');

  // ---------- limits ----------
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await startIt('recover', null, { ip: LIMIT_IP })).status;
  eq(last, 429, 'starting too often from one place: 429');

  // ---------- the host: start and callback only where the callback lives ----------
  eq((await startIt('recover', null, { headers: { host: 'cube2-xi.vercel.app' } })).json.why, 'host', 'start on another host (the cookie would land in the wrong place): refused');
  x = await round('recover', null, U1, p => 'code=' + p.code + '&state=' + p.state);
  ok(where(x.cb) === '/?auth=recovered', 'on the right host it works', where(x.cb));
  const s5 = await startIt('recover'), p5 = portal(s5.json.url, U1);
  eq(where(await back('code=' + p5.code + '&state=' + p5.state, cookieFrom(s5), 'cube2-xi.vercel.app')), '/?auth=session', 'a callback that arrives on another host: refused');

  // ---------- staging (a Vercel Preview only) ----------
  const STG = 'https://brickduel-staging.snowrealm.pet/api/auth/callback';
  const stg = { IDENTITY_STAGING: '1', IDENTITY_STAGING_REDIRECT: STG, IDENTITY_STAGING_CLIENT_SECRET: 'staging-secret-'.padEnd(48, 's'), IDENTITY_AUTHORIZE_URL: 'https://games-staging.test.example/', VERCEL_ENV: 'preview' };
  const cfg = extra => bff.settings(Object.assign({}, ENV, stg, extra || {}));
  const st = cfg();
  ok(st && st.staging && st.clientId === 'brickduel-bff-staging' && st.redirect === STG && st.host === 'brickduel-staging.snowrealm.pet' && st.secret !== SECRET, 'a Preview with the staging settings: its own client, callback, secret', st && { c: st.clientId, r: st.redirect });
  const pr = cfg({ VERCEL_ENV: 'production' });
  ok(pr && !pr.staging && pr.clientId === 'brickduel-bff' && pr.redirect === 'https://brickduel.snowrealm.pet/api/auth/callback' && pr.secret === SECRET, 'on production every staging setting is ignored', pr && { c: pr.clientId, r: pr.redirect });
  for (const [name, extra] of [
    ['a wildcard', { IDENTITY_STAGING_REDIRECT: 'https://*.vercel.app/api/auth/callback' }],
    ['plain http', { IDENTITY_STAGING_REDIRECT: 'http://brickduel-staging.snowrealm.pet/api/auth/callback' }],
    ['a port', { IDENTITY_STAGING_REDIRECT: 'https://brickduel-staging.snowrealm.pet:8443/api/auth/callback' }],
    ['a query', { IDENTITY_STAGING_REDIRECT: STG + '?x=1' }],
    ['another path', { IDENTITY_STAGING_REDIRECT: 'https://brickduel-staging.snowrealm.pet/callback' }],
    ['the production host', { IDENTITY_STAGING_REDIRECT: 'https://brickduel.snowrealm.pet/api/auth/callback' }],
    ['no callback', { IDENTITY_STAGING_REDIRECT: '' }],
    ['the production client id', { IDENTITY_STAGING_CLIENT_ID: 'brickduel-bff' }],
    ['the production secret', { IDENTITY_STAGING_CLIENT_SECRET: SECRET }],
    ['no staging secret', { IDENTITY_STAGING_CLIENT_SECRET: '' }],
    ['the production issuer', { IDENTITY_ISSUER: 'https://identity.snowrealm.pet' }],
    ['the production portal', { IDENTITY_AUTHORIZE_URL: 'https://games.snowrealm.pet/' }],
    ['no portal given', { IDENTITY_AUTHORIZE_URL: '' }],
    ['the production token endpoint', { IDENTITY_TOKEN_URL: 'https://identity.snowrealm.pet/oauth/token' }],
    ['local http outside tests', { IDENTITY_STAGING_REDIRECT: 'http://127.0.0.1:8786/api/auth/callback' }]
  ]) ok(!cfg(extra), 'staging refused with ' + name);
  // a whole staging round, on the staging host
  Object.assign(process.env, stg); HOST = 'brickduel-staging.snowrealm.pet';
  want.client = 'brickduel-bff-staging'; want.redirect = STG;
  const sSecret = stg.IDENTITY_STAGING_CLIENT_SECRET;
  const origSecret = SECRET;
  // the stand-in Identity checks the staging secret now
  bff.setFetch((f => async (url, o) => { if (o.headers['x-snowrealm-client-secret'] === sSecret) o.headers['x-snowrealm-client-secret'] = origSecret; else o.headers['x-snowrealm-client-secret'] = 'wrong'; return f(url, o); })(lastFetch));
  r = await startIt('recover');
  const su = new URL(r.json.url);
  ok(r.status === 200 && su.origin === 'https://games-staging.test.example' && su.searchParams.get('client_id') === 'brickduel-bff-staging' && su.searchParams.get('redirect_uri') === STG, 'staging start: staging portal, client and callback', r.json.url);
  ok(/^__Host-zzauth=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax$/.test(r.headers['set-cookie']), 'the same __Host- cookie (Secure, HttpOnly, Lax, host only, 30 minutes)', r.headers['set-cookie']);
  eq((await startIt('recover', null, { headers: { host: 'brickduel.snowrealm.pet' } })).json.why, 'host', 'a staging start on the production host: refused');
  x = await round('recover', null, U1);
  eq(where(x.cb), '/?auth=recovered', 'a whole staging round');
  const sentTok = seenBodies.filter(b => /oauth\/token/.test(b.url)).pop();
  ok(sentTok.body.clientId === 'brickduel-bff-staging' && sentTok.body.redirectUri === STG, 'the token request names the staging client and callback');
  eq(where(await back('code=' + x.p.code + '&state=' + x.p.state, x.cookie)), '/?auth=replay', 'staging: replay refused');
  const s6 = await startIt('recover'), p6 = portal(s6.json.url, U1);
  eq(where(await back('code=' + p6.code + '&state=' + p6.state)), '/?auth=session', 'staging: another browser refused');
  for (const k of Object.keys(stg)) delete process.env[k];
  HOST = 'brickduel.snowrealm.pet';

  // ---------- production acceptance before linking opens (IDENTITY_LINK_ACCEPT_PUBS) ----------
  bff.setFetch(lastFetch); want.client = 'brickduel-bff'; want.redirect = 'https://brickduel.snowrealm.pet/api/auth/callback';
  const U3 = '3a3a3a3a-1111-4222-8333-444455556666', U4 = '4b4b4b4b-1111-4222-8333-444455556666';
  const pubOf = async c => (await pg.query('SELECT pub FROM zz.players WHERE id = $1', [c.id]))[0].pub;
  const A = await newPlayer(), B = await newPlayer(), Y = await newPlayer(), Z = await newPlayer();
  const list = [await pubOf(A), await pubOf(B), await pubOf(Y)].join(',');
  const coinsA0 = await coinsOf(A.id), coinsB0 = await coinsOf(B.id);
  Object.assign(process.env, { IDENTITY_LINK_ENABLED: '', IDENTITY_LINK_ACCEPT_PUBS: list });
  eq((await call('health', { method: 'GET' })).json.link, false, 'acceptance: health still says link false (no button for anyone)');
  eq((await startIt('recover')).json.why, 'off', 'acceptance: a start without a device key is off');
  eq((await startIt('link', Z)).json.why, 'off', 'acceptance: a save that is not listed is off');
  eq((await startIt('recover', Z)).status, 503, 'acceptance: not listed, recover: 503');
  eq((await rpc({ a: 'idLink', idt: sign({ sub: U3 }) }, A)).status, 503, 'acceptance: the direct token route stays closed');
  eq((await rpc({ a: 'idStatus' }, Z)).json.enabled, false, 'acceptance: idStatus for others says off');
  for (const bad of [list + ',ABCDEFGH', list + ',', 'a,b', Array(9).fill(await pubOf(A)).join(',')]) {
    process.env.IDENTITY_LINK_ACCEPT_PUBS = bad;
    if (bad === list + ',') { eq((await startIt('link', A)).status, 200, 'acceptance: a trailing comma is ignored'); continue; }
    eq((await startIt('link', A)).status, 503, 'acceptance: a malformed list (' + bad.length + ' chars) turns it all off');
  }
  process.env.IDENTITY_LINK_ACCEPT_PUBS = list;
  // first link
  x = await round('link', A, U3);
  eq(where(x.cb), '/?auth=linked', 'acceptance: a listed save links');
  r = await resultOf(x.cookie);
  ok(r.status === 200 && r.json.outcome === 'linked' && r.json.key, 'acceptance: the result is read once with a new key');
  const A2 = { id: A.id, key: r.json.key };
  r = await rpc({ a: 'idStatus' }, A2);
  ok(r.json.enabled === true && r.json.linked === true, 'acceptance: the listed save sees itself linked', r.json);
  eq((await rpc({ a: 'idStatus' }, A)).status, 401, 'acceptance: the old key no longer works');
  // another device: the ticket is a listed save of its own
  eq((await startIt('recover')).status, 503, 'acceptance: recover with no ticket is off');
  x = await round('recover', Y, U3);
  eq(where(x.cb), '/?auth=recovered', 'acceptance: recover on another device (ticket Y)');
  r = await resultOf(x.cookie);
  ok(r.status === 200 && r.json.id === A.id && r.json.pub === await pubOf(A) && r.json.key, 'acceptance: the recovered save is A, with a key for the new device', { id: r.json.id });
  // conflicts: the other account on A, and the first account on B
  x = await round('link', A2, U4);
  eq(where(x.cb), '/?auth=conflict', 'acceptance: account 2 on a save already linked: conflict');
  x = await round('link', B, U3);
  eq(where(x.cb), '/?auth=conflict', 'acceptance: account 1 on a second save: conflict');
  x = await round('recover', Y, U4);
  eq(where(x.cb), '/?auth=none', 'acceptance: account 2 recover finds nothing');
  eq(await coinsOf(A.id), coinsA0, 'acceptance: A keeps its coins');
  eq(await coinsOf(B.id), coinsB0, 'acceptance: B keeps its coins');
  eq((await pg.query('SELECT count(*)::int AS n FROM zz.identity WHERE pid = $1', [B.id]))[0].n, 0, 'acceptance: B is not linked');
  // a platform player who already holds a save that is not listed: nothing happens and nothing is said about it
  const heldU1 = await pg.query('SELECT p.pub FROM zz.identity i JOIN zz.players p ON p.id = i.pid WHERE i.platform_id = $1', [U1]);
  ok(heldU1[0] && list.split(',').indexOf(heldU1[0].pub) < 0, 'acceptance: (U1 holds a save that is not listed)');
  x = await round('recover', Y, U1);
  eq(where(x.cb), '/?auth=off', 'acceptance: recovering an unlisted save is refused');
  r = await resultOf(x.cookie);
  ok(!r.json.key && !r.json.other, 'acceptance: and no key or save details come back', r.json);
  x = await round('link', B, U1);
  eq(where(x.cb), '/?auth=off', 'acceptance: linking to a player who holds an unlisted save is refused without naming it');
  // opening it to everyone: the list no longer matters
  process.env.IDENTITY_LINK_ENABLED = '1';
  eq((await call('health', { method: 'GET' })).json.link, true, 'open to everyone: health link true');
  eq((await startIt('link', Z)).status, 200, 'open to everyone: any save may start');
  delete process.env.IDENTITY_LINK_ACCEPT_PUBS;

  console.log('bff tests: ' + pass + ' passed, ' + fail + ' failed');
  for (const k of Object.keys(ENV)) delete process.env[k];
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
