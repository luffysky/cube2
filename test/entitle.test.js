'use strict';
// SnowRealm's payment service telling 轉磚 about memberships and orders (server/entitle.js), through the real API and
// an in-process Postgres, with a stand-in commerce key made here. Nothing real is called.
const crypto = require('crypto');
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const core = require('../server/core.js');
const rules = require('../server/rules.js');
const { make } = require('../tools/pglite-db.js');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 24, 4, 0, 0);
const DAY = 86400000;
app.setClock(() => now);
const pg = make(); dbm.use(pg);
delete process.env.MEMBER_TRIAL;

const K = crypto.generateKeyPairSync('ed25519'), KID = 'commerce-test-1';
const JWKS = JSON.stringify({ keys: [Object.assign({ kid: KID, use: 'sig', alg: 'EdDSA' }, K.publicKey.export({ format: 'jwk' }))] });
const ISS = 'https://identity.snowrealm.pet';
Object.assign(process.env, { ENTITLE_ENABLED: '1', ENTITLE_JWKS: JWKS });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(over, key) {
  const sec = Math.floor(now / 1000);
  const data = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID }) + '.' + b64(Object.assign({ iss: ISS, aud: 'snowrealm:brickduel:entitlements', sub: 'svc:snowrealm-commerce', scope: 'entitlements:write', iat: sec, exp: sec + 300, jti: crypto.randomUUID() }, over || {}));
  return data + '.' + crypto.sign(null, Buffer.from(data), (key || K).privateKey).toString('base64url');
}
let ipN = 0;
function call(name, o) {
  o = o || {};
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'POST'; req.url = o.url || '/api/' + name;
    req.headers = Object.assign({ host: 'brickduel.snowrealm.pet', 'x-real-ip': '10.8.' + (++ipN >> 8 & 255) + '.' + (ipN & 255) }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(text) { let json = null; try { json = JSON.parse(text); } catch (e) { /* none */ } resolve({ status: this.statusCode, json }); } };
    app.handle(name, req, res);
  });
}
const send = (body, tok, headers) => call('entitle', { body, headers: Object.assign({ authorization: 'Bearer ' + (tok === undefined ? token() : tok) }, headers || {}) });
const rpc = (body, c) => call('rpc', { body, headers: c ? { authorization: 'Bearer ' + c.id + '.' + c.key } : {} });
let opN = 0;
const op = (k, a) => ({ i: 'ent' + String(++opN).padStart(6, '0'), k, a: a || [] });
const subOf = async id => (await pg.query('SELECT state FROM zz.players WHERE id = $1', [id]))[0].state.sub;
const isoAt = ms => new Date(ms).toISOString();
let v = 0;
const mem = (platformId, tier, status, end, o) => Object.assign({ schema: 'snowrealm.entitlement.v1', eventId: crypto.randomUUID(), platformId, game: 'brickduel', kind: 'membership', version: ++v, at: isoAt(now), membership: { tier, status, periodEnd: end ? isoAt(end) : null } }, o || {});
const ord = (platformId, orderId, sku, status, o) => Object.assign({ schema: 'snowrealm.entitlement.v1', eventId: crypto.randomUUID(), platformId, game: 'brickduel', kind: 'order', version: ++v, at: isoAt(now), order: { orderId, sku, status, platform: 'web' } }, o || {});
const P1 = '1a1a1a1a-1111-4222-8333-444455556666', P2 = '2b2b2b2b-1111-4222-8333-444455556666', P3 = '3c3c3c3c-1111-4222-8333-444455556666';
const link = (platformId, pid) => pg.query("INSERT INTO zz.identity (platform_id, pid, linked_at, provider_hint) VALUES ($1, $2, $3, 'snowrealm')", [platformId, pid, now]);

(async () => {
  // ---------- who may call ----------
  delete process.env.ENTITLE_ENABLED;
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY))).status, 503, 'off until it is switched on');
  process.env.ENTITLE_ENABLED = '1';
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), '')).status, 401, 'no token: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({}, crypto.generateKeyPairSync('ed25519')))).status, 401, 'signed with another key: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ aud: 'snowrealm:brickduel:admin' }))).status, 401, 'another audience: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ iss: 'https://evil.example' }))).status, 401, 'another issuer: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ exp: Math.floor(now / 1000) + 3600 }))).status, 401, 'a token living longer than five minutes: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ exp: Math.floor(now / 1000) - 600, iat: Math.floor(now / 1000) - 800 }))).status, 401, 'an expired token: 401');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ sub: 'svc:someone-else' }))).status, 403, 'another service: 403');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), token({ scope: 'entitlements:read' }))).status, 403, 'without the write scope: 403');
  eq((await send(mem(P1, 'plus', 'active', now + 30 * DAY), undefined, { origin: 'https://evil.example' })).status, 403, 'not from a page (an Origin header): 403');
  const once = token();
  eq((await send(mem(P1, 'free', 'active', null), once)).status, 200, 'a good token: taken');
  eq((await send(mem(P1, 'free', 'active', null), once)).status, 401, 'the same token again (replayed): 401');
  eq((await send({ schema: 'snowrealm.entitlement.v1', kind: 'membership' })).status, 400, 'a malformed event: 400');
  eq((await send(mem(P1, 'gold', 'active', now + DAY))).status, 400, 'an unknown tier: 400');
  eq((await send(Object.assign(mem(P1, 'plus', 'active', now + DAY), { game: 'spinrealm' }))).status, 400, 'another game\'s event: 400');

  // ---------- membership on a linked save ----------
  const A = (await rpc({ a: 'hello' })).json;
  await link(P1, A.id);
  let r = await send(mem(P1, 'plus', 'active', now + 30 * DAY));
  eq(r.json, { ok: true, result: 'applied' }, 'a Plus membership: applied');
  let s = await subOf(A.id);
  ok(s.until === now + 30 * DAY && s.tier === 'plus' && s.demo === false, 'the linked save is a member until the end of the paid period', s);
  r = await rpc({ a: 'sync', ops: [op('draw', [9])] }, A);
  ok(r.json.res[0].ok && r.json.st.daily.draws === 9, 'member benefits on the server: nine boxes at once (non-members get five a day)', r.json.res);
  r = await rpc({ a: 'sync', ops: [op('wear', ['ghost', 'rainbow'])] }, A);
  ok(r.json.res[0].ok && r.json.st.equip.ghost === 'rainbow', 'and member-only looks can be worn', r.json.st && r.json.st.equip);
  r = await rpc({ a: 'sync', ops: [op('unsub')] }, A);
  ok(r.json.res[0].ok === false && r.json.res[0].why === 'pay' && (await subOf(A.id)).until > now, 'the page cannot end a paid membership (that is done at the payment service)', r.json.res);
  const dup = mem(P1, 'pro', 'active', now + 60 * DAY);
  eq((await send(dup)).json.result, 'applied', 'an upgrade to Pro: applied');
  eq((await send(dup)).json.result, 'duplicate', 'the same event again: duplicate, nothing done twice');
  ok((await subOf(A.id)).tier === 'pro', 'now Pro');
  r = await send(mem(P1, 'plus', 'active', now + 30 * DAY, { version: 1 }));
  ok(r.json.result === 'stale' && (await subOf(A.id)).tier === 'pro', 'an older version arriving late changes nothing', r.json);
  eq((await send(mem(P1, 'pro', 'canceled', now + 60 * DAY))).json.result, 'applied', 'cancelled (renewal off)');
  ok((await subOf(A.id)).until === now + 60 * DAY, 'still a member to the end of the period paid for');
  eq((await send(mem(P1, 'pro', 'refunded', now + 60 * DAY))).json.result, 'applied', 'refunded');
  s = await subOf(A.id);
  ok(!(s.until > now) && s.tier === '', 'a refund ends it at once', s);
  r = await rpc({ a: 'sync', ops: [] }, A);
  ok(r.json.st.equip.ghost !== 'rainbow', 'and the member-only look goes back to the stock one', r.json.st.equip);
  eq((await send(mem(P1, 'plus', 'active', now + 10 * DAY))).json.result, 'applied', 'bought again');
  now += 11 * DAY;
  r = await rpc({ a: 'sync', ops: [op('draw', [9])] }, A);
  ok(r.json.res[0].ok === false, 'the period over and not renewed: no member benefits any more', r.json.res);
  eq((await send(mem(P1, 'plus', 'expired', now - DAY))).json.result, 'applied', 'expired');
  ok(!((await subOf(A.id)).until > now), 'not a member');

  // ---------- an account not linked yet: it comes with the link ----------
  eq((await send(mem(P2, 'plus', 'active', now + 30 * DAY))).json.result, 'applied', 'membership for an account with no 轉磚 save yet: kept');
  const B = (await rpc({ a: 'hello' })).json;
  ok(!((await subOf(B.id)).until > now), 'nothing on a save that is not linked');
  await link(P2, B.id);
  await core.hooks.linked(dbm.get(), B.id, now);
  s = await subOf(B.id);
  ok(s.until === now + 30 * DAY && s.tier === 'plus', 'linking brings it to the save', s);

  // ---------- orders: recorded with every state; nothing is for sale yet ----------
  r = await send(ord(P1, 'order_0001', 'brickduel.look.test', 'pending'));
  eq(r.json.result, 'applied', 'an order, pending: recorded');
  eq((await send(ord(P1, 'order_0001', 'brickduel.look.test', 'succeeded'))).json.result, 'applied', 'succeeded');
  let o = (await pg.query("SELECT status, granted FROM zz.orders WHERE order_id = 'order_0001'"))[0];
  ok(o.status === 'succeeded' && o.granted === false, 'a product 轉磚 does not sell: kept as succeeded, nothing granted', o);
  eq((await send(ord(P2, 'order_0001', 'brickduel.look.test', 'refunded'))).status, 409, 'the same order id for another account: refused');
  eq((await send(ord(P1, 'order_0001', 'brickduel.other', 'refunded'))).status, 409, 'or for another product: refused');
  // with a product on sale (set up here only): granted once, taken back on refund
  rules.Meta.PAID['brickduel.look.pixel'] = { kind: 'tile', id: 'pixel' };
  eq((await send(ord(P1, 'order_0002', 'brickduel.look.pixel', 'pending'))).json.result, 'applied', 'a look sold for money: pending');
  ok((await pg.query('SELECT state FROM zz.players WHERE id = $1', [A.id]))[0].state.owned.tile.indexOf('pixel') < 0, 'pending grants nothing');
  const paidEv = ord(P1, 'order_0002', 'brickduel.look.pixel', 'succeeded');
  eq((await send(paidEv)).json.result, 'applied', 'paid');
  eq((await send(paidEv)).json.result, 'duplicate', 'the payment notice sent twice: once');
  let st = (await pg.query('SELECT state FROM zz.players WHERE id = $1', [A.id]))[0].state;
  ok(st.owned.tile.filter(x => x === 'pixel').length === 1, 'granted once', st.owned.tile);
  r = await rpc({ a: 'sync', ops: [op('wear', ['tile', 'pixel'])] }, A);
  ok(r.json.st.equip.tile === 'pixel', 'and worn');
  eq((await send(ord(P1, 'order_0002', 'brickduel.look.pixel', 'refunded'))).json.result, 'applied', 'refunded');
  st = (await pg.query('SELECT state FROM zz.players WHERE id = $1', [A.id]))[0].state;
  ok(st.owned.tile.indexOf('pixel') < 0 && st.equip.tile !== 'pixel', 'taken back and no longer worn', [st.owned.tile, st.equip.tile]);
  eq((await send(ord(P1, 'order_0002', 'brickduel.look.pixel', 'succeeded', { version: 1 }))).json.result, 'stale', 'a late "succeeded" after the refund does not grant it again');
  ok((await pg.query("SELECT granted FROM zz.orders WHERE order_id = 'order_0002'"))[0].granted === false, 'the order stays refunded');
  eq((await send(ord(P1, 'order_0003', 'brickduel.look.pixel', 'failed'))).json.result, 'applied', 'a failed payment');
  ok((await pg.query('SELECT state FROM zz.players WHERE id = $1', [A.id]))[0].state.owned.tile.indexOf('pixel') < 0, 'grants nothing');
  // bought before the account had a 轉磚 save: granted when it links
  eq((await send(ord(P3, 'order_0004', 'brickduel.look.pixel', 'succeeded'))).json.result, 'applied', 'paid by an account not linked yet');
  const C = (await rpc({ a: 'hello' })).json;
  await link(P3, C.id);
  await core.hooks.linked(dbm.get(), C.id, now);
  ok((await pg.query('SELECT state FROM zz.players WHERE id = $1', [C.id]))[0].state.owned.tile.indexOf('pixel') >= 0, 'granted when it links');
  delete rules.Meta.PAID['brickduel.look.pixel'];

  // ---------- test settings do nothing in production ----------
  const E = require('../server/entitle.js');
  ok(E.settings({ ENTITLE_ENABLED: '1', ENTITLE_TEST_ISSUER: 'https://evil.example', VERCEL_ENV: 'production' }).iss === ISS, 'in production the issuer is always SnowRealm\'s');

  await pg.close();
  console.log('entitlement tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
