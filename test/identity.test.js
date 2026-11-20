'use strict';
// SnowRealm Identity in 轉磚 (docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md): the token checks, the switch that keeps it all
// off, linking a save to a platform player (one to one, never merged), and getting it back on another device.
// Keys are made here for the test; no real token, issuer or service is involved.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const idn = require('../server/identity.js');
const { make } = require('../tools/pglite-db.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
let now = Date.UTC(2026, 10, 20, 8, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);
const ISS = 'https://identity.test.example', AUD = 'snowrealm:brickduel:api';
const A = crypto.generateKeyPairSync('ed25519'), B = crypto.generateKeyPairSync('ed25519'), WRONG = crypto.generateKeyPairSync('ed25519');
const jwk = (k, kid) => Object.assign({ kid, use: 'sig', alg: 'EdDSA' }, k.publicKey.export({ format: 'jwk' }));
let published = [jwk(A, 'k1')], jwksDown = false, fetches = 0;
idn.setFetch(async () => { fetches++; if (jwksDown) return { ok: false, status: 503, json: async () => ({}) }; return { ok: true, json: async () => ({ keys: published }) }; });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims, o) {
  o = o || {};
  const sec = Math.floor(now / 1000), head = Object.assign({ alg: 'EdDSA', typ: 'JWT', kid: o.kid || 'k1' }, o.head || {});
  if (o.noKid) delete head.kid;
  const body = Object.assign({ iss: ISS, aud: AUD, sub: o.sub || '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', jti: crypto.randomUUID(), iat: sec, exp: sec + 300, scope: 'brickduel:account:link' }, claims || {});
  for (const k of o.drop || []) delete body[k];
  const data = b64(head) + '.' + b64(body);
  return data + '.' + crypto.sign(null, Buffer.from(data), (o.key || A).privateKey).toString('base64url');
}
const env = { IDENTITY_ISSUER: ISS, IDENTITY_JWKS_URL: 'https://identity.test.example/.well-known/jwks.json', IDENTITY_AUDIENCE: AUD, IDENTITY_LINK_ENABLED: '1' };
const v = (t, o) => idn.verify(t, Object.assign({ env, now, need: idn.LINK_SCOPE }, o || {}));
function call(name, o) {
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = 'POST'; req.url = '/api/' + name;
    req.headers = Object.assign({ host: 'game.test', 'x-real-ip': o.ip || '203.0.113.' + (1 + Math.floor(Math.random() * 200)), 'content-type': 'application/json' }, o.headers || {});
    const text = JSON.stringify(o.body); req.headers['content-length'] = String(Buffer.byteLength(text)); req.push(text); req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, val) { this.headers[k.toLowerCase()] = String(val); }, end(t) { let json = null; try { json = JSON.parse(t); } catch (e) { /* no */ } resolve({ status: this.statusCode, json }); } };
    app.handle(name, req, res);
  });
}
const rpc = (body, cred) => call('rpc', { body, headers: cred ? { authorization: 'Bearer ' + cred.id + '.' + cred.key } : {} });
async function newPlayer() { const r = await rpc({ a: 'hello' }); return { id: r.json.id, key: r.json.key }; }

(async () => {
  // ---------- the switch ----------
  ok(!idn.enabled({}) && !idn.settings({}), 'with nothing set it is off');
  ok(!idn.enabled(Object.assign({}, env, { IDENTITY_LINK_ENABLED: '' })), 'settings without the enable flag: still off');
  ok(!idn.settings(Object.assign({}, env, { IDENTITY_JWKS_URL: 'http://identity.test.example/jwks' })), 'keys over plain http are not accepted');
  ok((await idn.verify(sign(), { env: {}, now })).why === 'off', 'off: no token is believed');

  // ---------- the token checks ----------
  let r = await v(sign());
  ok(r.ok && r.sub === '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'a good token passes', r);
  const bad = async (t, why, o) => { const x = await v(t, o); ok(!x.ok && x.why === why, 'refused (' + why + ')', x); };
  const sec = Math.floor(now / 1000);
  await bad(sign({ exp: sec - 1, iat: sec - 100 }), 'exp');
  await bad(sign({ iat: sec + 120, exp: sec + 300 }), 'iat');
  await bad(sign({ iat: sec, exp: sec + 601 }), 'exp');
  await bad(sign({ aud: 'snowrealm:spinrealm:api' }), 'aud');
  await bad(sign({ iss: 'https://evil.example' }), 'iss');
  await bad(sign({}, { key: WRONG }), 'signature');
  await bad(sign({}, { head: { alg: 'HS256' } }), 'alg');
  await bad(sign({}, { head: { alg: 'none' } }), 'alg');
  await bad(sign({}, { noKid: true }), 'kid');
  await bad(sign({}, { kid: 'nope' }), 'kid');
  await bad(sign({}, { drop: ['jti'] }), 'jti');
  await bad(sign({}, { drop: ['sub'] }), 'sub');
  await bad(sign({ sub: '76561198000000000' }), 'sub');
  await bad(sign({ nbf: sec + 200 }), 'nbf');
  await bad(sign({ scope: 'brickduel:play' }), 'scope');
  await bad(sign({ aud: 'snowrealm:brickduel:admin' }), 'aud');
  await bad('not.a.token', 'token');
  ok((await v(sign({ iat: sec + 30, exp: sec + 300 }))).ok, 'a clock a little ahead (under 60 s) is allowed');
  // key rotation: a new key is published before it signs; the old one keeps working until it is withdrawn
  published = [jwk(A, 'k1'), jwk(B, 'k2')]; idn.clearCache();
  ok((await v(sign({}, { key: B, kid: 'k2' }))).ok && (await v(sign())).ok, 'during a rotation both keys work');
  published = [jwk(B, 'k2')]; idn.clearCache();
  await bad(sign(), 'kid');
  // the keys cannot be fetched: nothing is believed
  jwksDown = true; idn.clearCache();
  await bad(sign({}, { key: B, kid: 'k2' }), 'jwks');
  jwksDown = false; idn.clearCache();
  const f0 = fetches; await v(sign({}, { key: B, kid: 'k2' })); await v(sign({}, { key: B, kid: 'k2' }));
  ok(fetches - f0 === 1, 'the keys are kept for a while, not fetched each time');
  published = [jwk(A, 'k1')]; idn.clearCache();

  // ---------- the endpoints while it is off ----------
  const P1 = await newPlayer();
  r = await rpc({ a: 'idLink', idt: sign() }, P1);
  ok(r.status === 503 && r.json.why === 'off', 'linking answers 503 while it is off', r);
  r = await rpc({ a: 'idRecover', idt: sign() });
  ok(r.status === 503, 'and so does recovery');
  r = await rpc({ a: 'idStatus' }, P1);
  ok(r.status === 200 && r.json.enabled === false && r.json.linked === false, 'the status says it is not open yet', r.json);

  // ---------- switched on (test settings only) ----------
  Object.assign(process.env, env);
  const U1 = '11111111-2222-4333-8444-555555555555', U2 = '99999999-8888-4777-8666-555555555555';
  r = await rpc({ a: 'idLink', idt: sign({}, { sub: U1 }) });
  ok(r.status === 401, 'linking needs this device\'s own key too');
  r = await rpc({ a: 'idLink', idt: sign({ aud: 'wrong' }, { sub: U1 }) }, P1);
  ok(r.status === 401 && r.json.why === 'identity' && r.json.detail === 'aud', 'a bad platform token is refused', r.json);
  const t1 = sign({}, { sub: U1 });
  r = await rpc({ a: 'idLink', idt: t1 }, P1);
  ok(r.status === 200 && r.json.linked && r.json.key && r.json.id === P1.id, 'a save links to a platform player', r.json);
  const P1b = { id: P1.id, key: r.json.key };
  r = await rpc({ a: 'sync' }, P1);
  ok(r.status === 401, 'the old device key stops working after linking');
  r = await rpc({ a: 'sync' }, P1b);
  ok(r.status === 200, 'the new one works');
  r = await rpc({ a: 'idLink', idt: t1 }, P1b);
  ok(r.status === 409 && r.json.why === 'replay', 'the same token cannot be used twice', r.json);
  r = await rpc({ a: 'idLink', idt: sign({}, { sub: U1 }) }, P1b);
  ok(r.status === 200 && r.json.same, 'linking again to the same player is fine');
  // a second save: the platform player is taken; never merged
  const P2 = await newPlayer();
  r = await rpc({ a: 'idLink', idt: sign({}, { sub: U1 }) }, P2);
  ok(r.status === 409 && r.json.why === 'taken' && r.json.other && typeof r.json.other.coins === 'number', 'a platform player already linked to another save: 409, both saves kept', r.json);
  r = await rpc({ a: 'idLink', idt: sign({}, { sub: U2 }) }, P1b);
  ok(r.status === 409 && r.json.why === 'linked', 'a save already linked cannot be linked to someone else');
  const rows = await pg.query('SELECT count(*)::int AS n FROM zz.players'); ok(rows[0].n === 2, 'no save was removed or merged', rows);
  // two devices linking two saves to one platform player at once: only one wins
  const P3 = await newPlayer(), P4 = await newPlayer(), U3 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const both = await Promise.all([rpc({ a: 'idLink', idt: sign({}, { sub: U3 }) }, P3), rpc({ a: 'idLink', idt: sign({}, { sub: U3 }) }, P4)]);
  ok(both.filter(x => x.status === 200).length === 1 && both.filter(x => x.status === 409).length === 1, 'a race: exactly one link', both.map(x => [x.status, x.json.why]));
  const links = await pg.query("SELECT count(*)::int AS n FROM zz.identity WHERE platform_id = $1", [U3]); ok(links[0].n === 1, 'one row for that platform player');
  // another device gets the linked save back
  r = await rpc({ a: 'idRecover', idt: sign({}, { sub: U1 }) });
  ok(r.status === 200 && r.json.id === P1.id && r.json.key && r.json.st && typeof r.json.st.coins === 'number', 'another device gets the same save back', r.json && r.json.id);
  const P1c = { id: r.json.id, key: r.json.key };
  ok((await rpc({ a: 'sync' }, P1c)).status === 200 && (await rpc({ a: 'sync' }, P1b)).status === 200, 'both devices now work on it');
  r = await rpc({ a: 'idRecover', idt: sign({}, { sub: '12345678-1234-4234-8234-123456789012' }) });
  ok(r.status === 404 && r.json.why === 'none', 'a platform player with no save gets nothing');
  r = await rpc({ a: 'idStatus' }, P1b);
  ok(r.json.enabled && r.json.linked, 'the status shows it linked');
  // a linked save waiting to be deleted (C-022): the link stays for the 30 days, signing in finds it and can take it back
  r = await rpc({ a: 'delete' }, P1b);
  ok(r.json.ok && r.json.until > 0, 'the linked save is put up for deletion');
  ok((await pg.query('SELECT count(*)::int AS n FROM zz.identity WHERE platform_id = $1', [U1]))[0].n === 1, 'its link is not removed that day');
  r = await rpc({ a: 'idRecover', idt: sign({}, { sub: U1 }) });
  ok(r.status === 409 && r.json.why === 'pending' && r.json.until > 0, 'signing in again says it is waiting to be deleted, and until when', r.json);
  const P9 = await newPlayer();
  r = await rpc({ a: 'idLink', idt: sign({}, { sub: U1 }) }, P9);
  ok(r.status === 409 && r.json.why === 'pending', 'another save cannot take the link while the old one waits', r.json);
  r = await rpc({ a: 'idRecover', idt: sign({}, { sub: U1 }), back: true });
  ok(r.status === 200 && r.json.id === P1.id && r.json.key, 'signing in and choosing to keep it takes the deletion back', r.json && r.json.why);
  ok((await rpc({ a: 'sync' }, P1b)).status === 200, 'and its devices work again');
  // the identity service is down: linking refused, the game itself untouched
  jwksDown = true; idn.clearCache();
  r = await rpc({ a: 'idRecover', idt: sign({}, { sub: U1 }) });
  ok(r.status === 503 && r.json.detail === 'jwks', 'identity down: refused with 503');
  ok((await rpc({ a: 'sync' }, P2)).status === 200, 'and the anonymous game goes on');
  // no long-term secrets leave in answers
  ok(!JSON.stringify(r.json).includes('privateKey'), 'answers carry no key material');
  for (const k of Object.keys(env)) delete process.env[k];
  console.log('identity: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
