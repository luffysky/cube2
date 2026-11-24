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
// the scheduled job carries Vercel's secret, as it does on the real site (without one each kind of run is held to once a window)
process.env.CRON_SECRET = 'cron-test-secret';
function call(name, o) {
  o = o || {};
  if (name === 'cron') o = Object.assign({}, o, { headers: Object.assign({ authorization: 'Bearer cron-test-secret' }, o.headers || {}) });
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
const E0 = require('../server/entitle.js');
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
  eq(r.json, { ok: true, result: 'applied', save: 'written' }, 'a Plus membership: applied, and the save has it');
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
  // found on staging (2026-11-24): another notice with the very same version as the record's was answered "applied"
  r = await send(mem(P1, 'plus', 'expired', now + DAY, { version: dup.version }));
  ok(r.json.result === 'stale' && (await subOf(A.id)).tier === 'pro', 'a new notice with the same version as the record: stale, nothing changed', r.json);
  r = await send(ord(P2, 'order_same_v', 'brickduel.look.test', 'succeeded', { version: 4 }));
  const rs = await send(ord(P2, 'order_same_v', 'brickduel.look.test', 'refunded', { version: 4 }));
  ok(r.json.result === 'applied' && rs.json.result === 'stale' && (await pg.query("SELECT status FROM zz.orders WHERE order_id = 'order_same_v'"))[0].status === 'succeeded', 'and the same for an order', [r.json, rs.json]);
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

  // ---------- P1-A: never "marked done but not received", and every failure can be retried ----------
  {
    const P9 = '9f9f9f9f-1111-4222-8333-444455556666';
    const G = (await rpc({ a: 'hello' })).json;
    await link(P9, G.id);
    const ledger0 = (await rpc({ a: 'ledger' }, G)).json;
    // the save cannot be written right after the notice is recorded (delivery fails)
    const realOp = core.serverOp;
    core.serverOp = async () => false;
    const warn = console.warn, lines = []; console.warn = x => lines.push(String(x));
    let ev = mem(P9, 'plus', 'active', now + 30 * DAY);
    r = await send(ev);
    console.warn = warn;
    ok(r.status === 200 && r.json.result === 'applied' && r.json.save === 'retry' && !((await subOf(G.id)).until > now), 'recorded and applied, the save not reached yet (delivery failed; the answer says so)', [r.json, await subOf(G.id)]);
    ok(lines.some(l => /^\[zz\] entitle deliver failed \(membership, save\)$/.test(l)), 'and the failure is in the log', lines);
    let row = (await pg.query('SELECT version, pushed FROM zz.entitle WHERE platform_id = $1', [P9]))[0];
    ok(Number(row.pushed) < Number(row.version), 'the record says the save is still behind');
    core.serverOp = realOp;
    // the sender resends the same notice with a new token: it is a duplicate, and the save is told now
    r = await send(ev);
    s = await subOf(G.id);
    ok(r.json.result === 'duplicate' && s.until === now + 30 * DAY && s.tier === 'plus', 'resending the same notice (new token) delivers it, once', [r.json, s]);
    // or, without a resend, the hourly pass catches up (Vercel tells the hourly call apart by its schedule header)
    core.serverOp = async () => false;
    ev = mem(P9, 'pro', 'active', now + 40 * DAY);
    console.warn = () => {}; await send(ev); console.warn = warn;
    core.serverOp = realOp;
    let rc = await call('cron', { method: 'GET', headers: { 'x-vercel-cron-schedule': '23 * * * *' } });
    s = await subOf(G.id);
    ok(rc.json.quick === true && rc.json.watch === null && rc.json.friends === null && rc.json.entitlements && rc.json.entitlements.pushed === 1 && s.tier === 'pro', 'the hourly pass (catch-up jobs only) delivers what was left behind', [rc.json, s]);
    // the database fails between recording the notice and applying it: the request fails, nothing half done
    const realBatch = pg.batch; let n = 0;
    pg.batch = async list => { if (++n === 2) { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; } return realBatch(list); };
    ev = mem(P9, 'pro', 'canceled', now + 40 * DAY);
    r = await send(ev);
    pg.batch = realBatch;
    let rec = (await pg.query('SELECT applied FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0];
    ok(r.status === 503 && rec && rec.applied === null, 'a timeout after recording: the sender is told to retry; the notice waits, not marked done', [r.status, rec]);
    r = await send(ev);
    ok(r.json.result === 'applied' && (await pg.query('SELECT status FROM zz.entitle WHERE platform_id = $1', [P9]))[0].status === 'canceled', 'the retry (new token) applies it');
    // the step after recording never ran at all (the server stopped): the daily pass applies it
    ev = mem(P9, 'pro', 'active', now + 50 * DAY);
    const E = require('../server/entitle.js');
    await E.record(dbm.get(), E.read(ev), ev, crypto.randomUUID(), Math.floor(now / 1000) + 300, now);
    ok((await pg.query('SELECT applied FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0].applied === null, 'recorded, not applied (as if the server stopped)');
    now += 60000;
    rc = await call('cron', { method: 'GET' });
    ok(rc.json.entitlements.applied === 1 && (await subOf(G.id)).until === now - 60000 + 50 * DAY, 'the daily pass applies and delivers it', rc.json.entitlements);
    // a notice id reused with other content
    r = await send(Object.assign({}, ev, { membership: { tier: 'plus', status: 'active', periodEnd: isoAt(now + 99 * DAY) } }));
    ok(r.status === 409, 'the same notice id with other content: refused', r.json);
    // a refund and a payment notice of one order racing each other, both orders
    rules.Meta.PAID['brickduel.look.pixel'] = { kind: 'tile', id: 'pixel' };
    for (const flip of [false, true]) {
      const id = 'order_race_' + (flip ? 'b' : 'a');
      const paidE = ord(P9, id, 'brickduel.look.pixel', 'succeeded'), refE = ord(P9, id, 'brickduel.look.pixel', 'refunded');
      await Promise.all(flip ? [send(refE), send(paidE)] : [send(paidE), send(refE)]);
      const o = (await pg.query('SELECT status, granted FROM zz.orders WHERE order_id = $1', [id]))[0];
      ok(o.status === 'refunded' && o.granted === false, 'payment and refund arriving together (' + (flip ? 'refund first' : 'payment first') + '): refunded, not granted', o);
    }
    r = await send(ord(P9, 'order_race_a', 'brickduel.look.pixel', 'succeeded'));
    const o2 = (await pg.query("SELECT status, granted FROM zz.orders WHERE order_id = 'order_race_a'"))[0];
    ok(r.json.result === 'stale' && o2.status === 'refunded' && !o2.granted, 'a refund is final: even a newer "succeeded" does not undo it', [r.json, o2]);
    ok((await pg.query('SELECT state FROM zz.players WHERE id = $1', [G.id]))[0].state.owned.tile.indexOf('pixel') < 0, 'and the look is not in the save');
    delete rules.Meta.PAID['brickduel.look.pixel'];
    // the save changed behind the record's back: the daily pass puts it right
    await pg.query("UPDATE zz.players SET state = jsonb_set(state, '{sub}', '{\"until\": 0, \"demo\": false, \"tier\": \"\"}'::jsonb), ver = ver + 1 WHERE id = $1", [G.id]);
    await pg.query('UPDATE zz.entitle SET checked = 0 WHERE platform_id = $1', [P9]);
    rc = await call('cron', { method: 'GET' });
    ok(rc.json.entitlements.fixed >= 1 && (await subOf(G.id)).until > now, 'a save that differs from the record is told again', rc.json.entitlements);
    // wallets apart: none of this touched the game's coins or its coin ledger
    const ledger1 = (await rpc({ a: 'ledger' }, G)).json;
    ok(ledger1.coins === ledger0.coins && ledger1.n === ledger0.n && ledger1.sum === ledger1.coins, 'memberships and orders never touch 轉磚 coins or the coin ledger', [ledger0.coins, ledger1.coins, ledger0.n, ledger1.n]);
  }

  // ---------- staging drills: a token of the test issuer can ask for one step to fail (never in production) ----------
  {
    const TEST_ISS = 'https://commerce-drill.test', P8 = '8e8e8e8e-1111-4222-8333-444455556666';
    process.env.ENTITLE_TEST_ISSUER = TEST_ISS;            // (VERCEL_ENV is not production here)
    let ev = mem(P8, 'plus', 'active', now + 10 * DAY);
    r = await send(ev, token({ iss: TEST_ISS, zzFault: 'after-record' }));
    let rec = (await pg.query('SELECT applied FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0];
    ok(r.status === 503 && rec && rec.applied === null, 'drill "after-record": the sender is told to retry; the notice is kept, not marked done', [r.status, rec]);
    r = await send(ev, token({ iss: TEST_ISS }));
    ok(r.json.result === 'applied' && r.json.save === 'link', 'the resend applies it; with no save linked yet the answer says it waits for the link', r.json);
    const G8 = (await rpc({ a: 'hello' })).json;
    await link(P8, G8.id); await E0.linked(dbm.get(), G8.id, now);   // what the link step calls (core.hooks.linked)
    ok((await subOf(G8.id)).tier === 'plus', 'linking a save hands it over');
    ev = mem(P8, 'pro', 'active', now + 20 * DAY);
    r = await send(ev, token({ iss: TEST_ISS, zzFault: 'deliver' }));
    ok(r.json.result === 'applied' && r.json.save === 'retry' && (await subOf(G8.id)).tier === 'plus', 'drill "deliver": applied, the save not reached, the answer says retry', r.json);
    now += 61000;
    const rc = await call('cron', { method: 'GET', url: '/api/cron?only=sync' });
    ok(rc.json.quick && rc.json.entitlements.pushed >= 1 && (await subOf(G8.id)).tier === 'pro', 'the catch-up pass hands it over', [rc.status, rc.json, await subOf(G8.id)]);
    r = await send(mem(P8, 'pro', 'active', now + 30 * DAY), token({ iss: TEST_ISS, zzFault: 'nonsense' }));
    ok(r.json.save === 'written', 'an unknown drill does nothing', r.json);
    // in production the test issuer is never trusted, so no token can ask for a drill
    const prod = E0.settings({ ENTITLE_ENABLED: '1', ENTITLE_JWKS: JWKS, ENTITLE_TEST_ISSUER: TEST_ISS, VERCEL_ENV: 'production' });
    const vp = await E0.verify('Bearer ' + token({ zzFault: 'deliver' }), prod, now);
    ok(prod.drills === false && vp.ok && vp.fault === null, 'production: no drills, even with the test issuer set (a real token asking for one is just a token)', [prod.drills, vp]);
    const vt = await E0.verify('Bearer ' + token({ iss: TEST_ISS, zzFault: 'deliver' }), prod, now);
    ok(!vt.ok, 'and a test-issuer token is refused outright', vt);
    ok(JSON.stringify(E0.kids()) === JSON.stringify([KID]) && E0.kids({ ENTITLE_ENABLED: '1', ENTITLE_JWKS: JWKS, ENTITLE_TEST_ISSUER: TEST_ISS, VERCEL_ENV: 'production' }) === null, 'the drill key ids are shown on staging only', E0.kids());
    delete process.env.ENTITLE_TEST_ISSUER;
    ok(E0.kids() === null, 'and not without the drill issuer');
  }

  // ---------- test settings do nothing in production ----------
  const E = require('../server/entitle.js');
  ok(E.settings({ ENTITLE_ENABLED: '1', ENTITLE_TEST_ISSUER: 'https://evil.example', VERCEL_ENV: 'production' }).iss === ISS, 'in production the issuer is always SnowRealm\'s');

  await pg.close();
  console.log('entitlement tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
