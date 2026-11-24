'use strict';
/* 轉磚 × SnowRealm's central payment and membership service (cube1): what a player has paid for reaches the game
   here, never from the page. Proposal for the contract: docs/handoff/BRICKDUEL_ENTITLEMENTS.md.

     POST /internal/entitlements/v1/events      (rewritten from /internal/entitlements/v1/events to /api/entitle)

   Server to server only. Who may call: a short-lived Ed25519 JWT from SnowRealm's commerce service, checked against
   its own JWKS, with iss https://identity.snowrealm.pet, aud snowrealm:brickduel:entitlements, scope
   entitlements:write, sub listed in ENTITLE_SUBJECTS; kid, iat, exp, jti all there; 0 < exp - iat <= 300.

   Events (JSON): { schema: 'snowrealm.entitlement.v1', eventId (UUID), platformId (UUID), game: 'brickduel',
   kind: 'membership' | 'order', version (a positive whole number, higher for each newer state of that membership or
   order), at (RFC 3339), and
     membership: { tier: 'free' | 'plus' | 'pro', status: 'active' | 'canceled' | 'expired' | 'refunded' | 'revoked',
                   periodEnd: RFC 3339 or null }
     order:      { orderId, sku, status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'revoked',
                   platform: 'web' | 'steam' | 'android' | 'ios' } }
   Answers: 200 { result: 'applied' | 'duplicate' | 'stale' }, 400 bad event, 401/403 the token, 503 off.
   The same event twice, or an older version after a newer one, changes nothing (no second delivery, no undoing).

   What it does:
     membership  kept per account (zz.entitle). A member is one with status active, or canceled but still inside the
                 period paid for, and a periodEnd still ahead; expired, refunded and revoked end it at once. The
                 linked save is told by the server itself (state.sub: until, tier, not a trial), so every member
                 benefit the game already checks on the server follows it, and looks only members may wear go back to
                 the stock look when it ends. An account that is not linked yet gets it when it links.
     order       kept per order (zz.orders) with its whole history of states. A one-time product is granted once on
                 succeeded and taken back on refunded or revoked; pending and failed grant nothing. No product of 轉磚
                 is sold for money yet (Meta.PAID is empty): orders are recorded and answered, nothing is granted.
   The game's own coins and items keep their own ledger (zz.ledger); nothing here touches them.

   Settings (names only): ENTITLE_ENABLED "1"; ENTITLE_SUBJECTS (default svc:snowrealm-commerce);
   ENTITLE_JWKS_URL (default https://identity.snowrealm.pet/.well-known/commerce-jwks.json) or ENTITLE_JWKS (inline
   JWKS); ENTITLE_TEST_ISSUER only outside production. */
const crypto = require('crypto');

const ISSUER = 'https://identity.snowrealm.pet', JWKS_URL = ISSUER + '/.well-known/commerce-jwks.json';
const AUD = 'snowrealm:brickduel:entitlements', SCOPE = 'entitlements:write', SERVICE = 'svc:snowrealm-commerce', SCHEMA = 'snowrealm.entitlement.v1';
const MAX_LIFE = 300, SKEW = 60, KEYS_TTL = 10 * 60000, FETCH_MS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, SUBJ = /^svc:[a-z0-9][a-z0-9-]{0,79}$/;
const TIERS = ['free', 'plus', 'pro'], MSTAT = ['active', 'canceled', 'expired', 'refunded', 'revoked'];
const OSTAT = ['pending', 'succeeded', 'failed', 'refunded', 'revoked'], PLATFORMS = ['web', 'steam', 'android', 'ios'];
let cache = { url: '', at: 0, keys: null };
let fetcher = null;

function settings(env) {
  env = env || process.env;
  if (env.ENTITLE_ENABLED !== '1') return null;
  const test = env.VERCEL_ENV !== 'production';
  const subs = String(env.ENTITLE_SUBJECTS || SERVICE).split(',').map(s => s.trim()).filter(s => SUBJ.test(s));
  if (!subs.length) return null;
  const iss = test && env.ENTITLE_TEST_ISSUER ? env.ENTITLE_TEST_ISSUER : ISSUER;
  let inline = null;
  if (env.ENTITLE_JWKS) { try { inline = JSON.parse(env.ENTITLE_JWKS); } catch (e) { return null; } }
  const url = env.ENTITLE_JWKS_URL || JWKS_URL;
  if (!inline && !/^https:\/\//.test(url)) return null;
  return { iss, subs, inline, url };
}
const enabled = env => !!settings(env);

function readKeys(j) {
  const out = {};
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
    if (!k || k.kty !== 'OKP' || k.crv !== 'Ed25519' || typeof k.x !== 'string' || typeof k.kid !== 'string' || 'd' in k) continue;
    if ((k.use && k.use !== 'sig') || (k.alg && k.alg !== 'EdDSA')) continue;
    if (out[k.kid]) { out[k.kid] = 'twice'; continue; }
    try { out[k.kid] = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' }); } catch (e) { /* skipped */ }
  }
  return out;
}
async function keyFor(s, kid, now) {
  let keys;
  if (s.inline) keys = readKeys(s.inline);
  else if (cache.keys && cache.url === s.url && now - cache.at < KEYS_TTL) keys = cache.keys;
  else {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), FETCH_MS);
    try {
      const r = await (fetcher || fetch)(s.url, { signal: ctl.signal });
      if (!r.ok) return 'down';
      keys = readKeys(await r.json());
      cache = { url: s.url, at: now, keys };
    } catch (e) { return 'down'; } finally { clearTimeout(timer); }
  }
  const k = keys[kid];
  return k && k !== 'twice' ? k : null;
}
const part = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
// { ok: true, sub } or { ok: false, status, why } (401 for any bad token, 403 a good one without the right to write)
async function verify(header, s, now) {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(header || ''));
  if (!m || header.length > 4096) return { ok: false, status: 401, why: 'token' };
  let head, body;
  try { head = part(m[1]); body = part(m[2]); } catch (e) { return { ok: false, status: 401, why: 'token' }; }
  if (!head || head.alg !== 'EdDSA' || typeof head.kid !== 'string' || !body) return { ok: false, status: 401, why: 'token' };
  const key = await keyFor(s, head.kid, now);
  if (key === 'down') return { ok: false, status: 503, why: 'keys' };
  if (!key || !crypto.verify(null, Buffer.from(m[1] + '.' + m[2]), key, Buffer.from(m[3], 'base64url'))) return { ok: false, status: 401, why: 'token' };
  const sec = Math.floor(now / 1000), aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (body.iss !== s.iss || aud.indexOf(AUD) < 0 || typeof body.jti !== 'string' || !body.jti || !Number.isSafeInteger(body.iat) || !Number.isSafeInteger(body.exp)
    || body.exp <= body.iat || body.exp - body.iat > MAX_LIFE || body.exp + SKEW < sec || body.iat - SKEW > sec || (body.nbf != null && body.nbf - SKEW > sec)) return { ok: false, status: 401, why: 'token' };
  if (s.subs.indexOf(body.sub) < 0 || String(body.scope || '').split(' ').indexOf(SCOPE) < 0) return { ok: false, status: 403, why: 'scope' };
  return { ok: true, sub: body.sub, jti: body.jti, exp: body.exp };
}

const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && isFinite(Date.parse(v));
function read(b) {
  if (!b || typeof b !== 'object' || b.schema !== SCHEMA || !UUID.test(b.eventId || '') || !UUID.test(b.platformId || '') || b.game !== 'brickduel'
    || !Number.isSafeInteger(b.version) || b.version < 1 || !iso(b.at)) return null;
  if (b.kind === 'membership') {
    const m = b.membership;
    if (!m || TIERS.indexOf(m.tier) < 0 || MSTAT.indexOf(m.status) < 0 || !(m.periodEnd === null || iso(m.periodEnd))) return null;
    return { kind: 'membership', eventId: b.eventId.toLowerCase(), platformId: b.platformId.toLowerCase(), version: b.version, tier: m.tier, status: m.status, end: m.periodEnd ? Date.parse(m.periodEnd) : 0 };
  }
  if (b.kind === 'order') {
    const o = b.order;
    if (!o || typeof o.orderId !== 'string' || !/^[A-Za-z0-9_.:-]{6,80}$/.test(o.orderId) || typeof o.sku !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(o.sku)
      || OSTAT.indexOf(o.status) < 0 || PLATFORMS.indexOf(o.platform) < 0) return null;
    return { kind: 'order', eventId: b.eventId.toLowerCase(), platformId: b.platformId.toLowerCase(), version: b.version, orderId: o.orderId, sku: o.sku, status: o.status, platform: o.platform };
  }
  return null;
}

// what the account is entitled to right now: { until, tier } (until 0 when not a member)
function effective(row, now) {
  if (!row || row.tier === 'free' || ['active', 'canceled'].indexOf(row.status) < 0 || !(row.period_end > now)) return { until: 0, tier: '' };
  return { until: row.period_end, tier: row.tier };
}
// tells the linked save, if there is one (the server's own change, saved like any other)
async function applyMembership(db, platformId, now) {
  const core = require('./core.js');
  const e = (await db.query('SELECT tier, status, period_end, version FROM zz.entitle WHERE platform_id = $1', [platformId]))[0];
  if (!e) return false;
  const link = (await db.query('SELECT pid FROM zz.identity WHERE platform_id = $1', [platformId]))[0];
  if (!link) return false;
  const v = effective(e, now);
  return core.serverOp(db, link.pid, 'ent:' + e.version + ':' + v.until, 'ent', [v.until, v.tier], now);
}

async function handle(db, body, now) {
  const ev = read(body);
  if (!ev) return { status: 400, body: { ok: false, why: 'event' } };
  const seen = await db.query('INSERT INTO zz.entevents (event_id, at) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING 1', [ev.eventId, now]);
  if (!seen[0]) return { status: 200, body: { ok: true, result: 'duplicate' } };
  if (ev.kind === 'membership') {
    const up = await db.query(`INSERT INTO zz.entitle (platform_id, tier, status, period_end, version, at) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (platform_id) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status, period_end = EXCLUDED.period_end, version = EXCLUDED.version, at = EXCLUDED.at
      WHERE zz.entitle.version < EXCLUDED.version RETURNING 1`, [ev.platformId, ev.tier, ev.status, ev.end, ev.version, now]);
    if (!up[0]) return { status: 200, body: { ok: true, result: 'stale' } };
    await applyMembership(db, ev.platformId, now);
    return { status: 200, body: { ok: true, result: 'applied' } };
  }
  const up = await db.query(`INSERT INTO zz.orders (order_id, platform_id, sku, status, platform, version, at, updated) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, version = EXCLUDED.version, updated = EXCLUDED.updated
    WHERE zz.orders.version < EXCLUDED.version AND zz.orders.platform_id = EXCLUDED.platform_id AND zz.orders.sku = EXCLUDED.sku RETURNING granted`,
  [ev.orderId, ev.platformId, ev.sku, ev.status, ev.platform, ev.version, now]);
  if (!up[0]) {
    // an order id that comes back for another account or product is not one this game will change
    const o = (await db.query('SELECT platform_id, sku FROM zz.orders WHERE order_id = $1', [ev.orderId]))[0];
    if (o && (o.platform_id !== ev.platformId || o.sku !== ev.sku)) return { status: 409, body: { ok: false, why: 'order' } };
    return { status: 200, body: { ok: true, result: 'stale' } };
  }
  await settleOrder(db, ev.orderId, now);
  return { status: 200, body: { ok: true, result: 'applied' } };
}
// a one-time product: granted once on succeeded, taken back on refunded or revoked (nothing is for sale yet)
async function settleOrder(db, orderId, now) {
  const { Meta } = require('./rules.js'), core = require('./core.js');
  const o = (await db.query('SELECT order_id, platform_id, sku, status, granted FROM zz.orders WHERE order_id = $1', [orderId]))[0];
  if (!o || !(Meta.PAID || {})[o.sku]) return false;
  const link = (await db.query('SELECT pid FROM zz.identity WHERE platform_id = $1', [o.platform_id]))[0];
  if (!link) return false;
  const want = o.status === 'succeeded';
  if (want === o.granted) return true;
  const done = await core.serverOp(db, link.pid, (want ? 'paid:' : 'unpaid:') + o.order_id, want ? 'paid' : 'unpaid', [o.sku], now);
  if (done) await db.query('UPDATE zz.orders SET granted = $2, updated = $3 WHERE order_id = $1', [o.order_id, want, now]);
  return done;
}
// a save has just been linked (or come to a new device): what its account already has comes with it
async function linked(db, pid, now) {
  const r = (await db.query('SELECT platform_id FROM zz.identity WHERE pid = $1', [pid]))[0];
  if (!r) return;
  await applyMembership(db, r.platform_id, now);
  for (const o of await db.query('SELECT order_id FROM zz.orders WHERE platform_id = $1', [r.platform_id])) await settleOrder(db, o.order_id, now);
}

module.exports = { settings, enabled, verify, handle, linked, effective, read, SCHEMA, AUD, SCOPE, SERVICE, ISSUER, JWKS_URL,
  setFetch(fn) { fetcher = fn; cache = { url: '', at: 0, keys: null }; } };
