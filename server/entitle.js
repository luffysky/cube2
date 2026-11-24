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
  // drills: only outside production, and only for tokens of the test issuer (never the real payment service)
  const drills = test && !!env.ENTITLE_TEST_ISSUER && iss === env.ENTITLE_TEST_ISSUER;
  return { iss, subs, inline, url, drills };
}
const enabled = env => !!settings(env);
// staging drills only: which public keys (kids) the receiver trusts right now, so a drill can wait for its own key
function kids(env) {
  const s = settings(env);
  return s && s.drills && s.inline && Array.isArray(s.inline.keys) ? s.inline.keys.map(k => k && k.kid).filter(k => typeof k === 'string') : null;
}

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
  // a staging drill (see settings): the token asks for one step to fail, to show it is made good afterwards
  const fault = s.drills && FAULTS.indexOf(body.zzFault) >= 0 ? body.zzFault : null;
  return { ok: true, sub: body.sub, jti: body.jti, exp: body.exp, fault };
}
const FAULTS = ['after-record', 'deliver'];

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
// ---------- delivering what is recorded to the save (every step can be done again without harm) ----------
// the linked save gets the membership as recorded; then the record notes which version it has
async function pushMembership(db, platformId, now) {
  const core = require('./core.js');
  const e = (await db.query('SELECT tier, status, period_end, version FROM zz.entitle WHERE platform_id = $1', [platformId]))[0];
  if (!e) return 'none';
  const link = (await db.query('SELECT pid FROM zz.identity WHERE platform_id = $1', [platformId]))[0];
  if (!link) return 'unlinked';
  const v = effective(e, now);
  // (the change sets the membership outright, so doing it again is harmless; each time has an id of its own)
  const done = await core.serverOp(db, link.pid, 'ent:' + e.version + ':' + crypto.randomBytes(6).toString('hex'), 'ent', [v.until, v.tier], now);
  if (!done) throw Object.assign(new Error('save not written'), { code: 'save' });
  await db.query('UPDATE zz.entitle SET pushed = $2, checked = $3 WHERE platform_id = $1 AND version = $2', [platformId, e.version, now]);
  return 'pushed';
}
// a one-time product: granted once on succeeded, taken back on refunded or revoked (nothing is for sale yet)
async function settleOrder(db, orderId, now) {
  const { Meta } = require('./rules.js'), core = require('./core.js');
  const o = (await db.query('SELECT order_id, platform_id, sku, status, granted FROM zz.orders WHERE order_id = $1', [orderId]))[0];
  if (!o || !(Meta.PAID || {})[o.sku]) return 'none';
  const link = (await db.query('SELECT pid FROM zz.identity WHERE platform_id = $1', [o.platform_id]))[0];
  if (!link) return 'unlinked';
  const want = o.status === 'succeeded';
  if (want === o.granted) return 'same';
  const done = await core.serverOp(db, link.pid, (want ? 'paid:' : 'unpaid:') + o.order_id, want ? 'paid' : 'unpaid', [o.sku], now);
  if (!done) throw Object.assign(new Error('save not written'), { code: 'save' });
  await db.query('UPDATE zz.orders SET granted = $2, updated = $3 WHERE order_id = $1', [o.order_id, want, now]);
  return 'settled';
}
// after a notice is recorded: the save is told; a failure here is logged and left to the next pass (reconcile)
// Says where the save stands: 'written' (it has it), 'link' (no save linked yet: it gets it on linking),
// 'nothing' (nothing to hand over, e.g. a product not sold here) or 'retry' (failed; the next pass does it again)
async function deliver(db, ev, now, fault) {
  try {
    if (fault === 'deliver') throw Object.assign(new Error('drill'), { code: 'drill' });
    const r = ev.kind === 'membership' ? await pushMembership(db, ev.platformId, now) : await settleOrder(db, ev.orderId, now);
    return r === 'unlinked' ? 'link' : r === 'none' ? 'nothing' : 'written';
  } catch (e) { console.warn('[zz] entitle deliver failed (' + ev.kind + ', ' + ((e && e.code) || (e && e.name) || 'error') + ')'); return 'retry'; }
}

// ---------- the notice ----------
// 1) record: the token is used up and the notice put in the inbox in one step (both, or neither)
async function record(db, ev, raw, jti, exp, now) {
  try {
    await db.batch([
      ['INSERT INTO zz.idjti (jti, exp) VALUES ($1, $2)', ['ent:' + String(jti).slice(0, 120), exp * 1000]],
      ['INSERT INTO zz.entevents (event_id, at, platform_id, kind, version, body) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING',
        [ev.eventId, now, ev.platformId, ev.kind, ev.version, JSON.stringify(ev)]]
    ]);
  } catch (e) { if (e && e.code === '23505') return { status: 401, body: { ok: false, why: 'token' } }; throw e; }
  // the same event id with other content is not the same notice
  const got = (await db.query('SELECT body FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0];
  const was = got && (typeof got.body === 'string' ? JSON.parse(got.body) : got.body);
  if (!was || JSON.stringify(sorted(was)) !== JSON.stringify(sorted(ev))) return { status: 409, body: { ok: false, why: 'event' } };
  return null;
}
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sorted(v[k]); return o; }, {}) : v;
// 2) apply: the change and the notice marked done, in one step. Versions only move forward; a refunded or revoked
// order is final. Gives 'applied' | 'stale' | 'conflict' (an order id seen for another account or product)
async function apply(db, ev, now) {
  let res;
  // one statement: the change, and the notice marked with whether that change really happened (found on staging,
  // 2026-11-24: a new notice with the same version as the record's was reported applied though nothing changed)
  if (ev.kind === 'membership') {
    res = await db.batch([
      [`WITH up AS (
          INSERT INTO zz.entitle (platform_id, tier, status, period_end, version, at) VALUES ($3, $5, $6, $7, $4, $2)
          ON CONFLICT (platform_id) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status, period_end = EXCLUDED.period_end, version = EXCLUDED.version, at = EXCLUDED.at
          WHERE zz.entitle.version < EXCLUDED.version RETURNING 1)
        UPDATE zz.entevents SET applied = $2, result = CASE WHEN EXISTS (SELECT 1 FROM up) THEN 'applied' ELSE 'stale' END
        WHERE event_id = $1 AND applied IS NULL RETURNING result`, [ev.eventId, now, ev.platformId, ev.version, ev.tier, ev.status, ev.end]]
    ]);
  } else {
    res = await db.batch([
      [`WITH up AS (
          INSERT INTO zz.orders (order_id, platform_id, sku, status, platform, version, at, updated) VALUES ($3, $4, $5, $7, $8, $6, $2, $2)
          ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, version = EXCLUDED.version, updated = EXCLUDED.updated
          WHERE zz.orders.version < EXCLUDED.version AND zz.orders.platform_id = EXCLUDED.platform_id AND zz.orders.sku = EXCLUDED.sku
            AND zz.orders.status NOT IN ('refunded', 'revoked') RETURNING 1)
        UPDATE zz.entevents SET applied = $2, result = CASE
          WHEN EXISTS (SELECT 1 FROM zz.orders WHERE order_id = $3 AND (platform_id <> $4 OR sku <> $5)) THEN 'conflict'
          WHEN EXISTS (SELECT 1 FROM up) THEN 'applied' ELSE 'stale' END
        WHERE event_id = $1 AND applied IS NULL RETURNING result`, [ev.eventId, now, ev.orderId, ev.platformId, ev.sku, ev.version, ev.status, ev.platform]]
    ]);
  }
  const mark = res[0] && res[0][0];
  if (mark) return mark.result;
  // already applied (by a notice sent twice at once): its first answer stands
  const was = (await db.query('SELECT result FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0];
  return was && was.result ? 'duplicate:' + was.result : 'stale';
}
// a recorded notice, applied if it is not yet, then delivered (both steps safe to repeat)
async function processOne(db, ev, now, fault) {
  const e = (await db.query('SELECT applied, result FROM zz.entevents WHERE event_id = $1', [ev.eventId]))[0];
  let result = e && e.applied ? 'duplicate' : await apply(db, ev, now);
  if (result.indexOf('duplicate') === 0) result = 'duplicate';
  else if (result === 'conflict') return { status: 409, body: { ok: false, why: 'order' } };
  const out = { ok: true, result };
  // a stale notice changes nothing, so there is nothing to hand over; a duplicate is handed over again (harmless)
  if (result !== 'stale') out.save = await deliver(db, ev, now, fault);
  return { status: 200, body: out };
}
async function handle(db, body, now, jti, exp, fault) {
  const ev = read(body);
  if (!ev) return { status: 400, body: { ok: false, why: 'event' } };
  const bad = await record(db, ev, body, jti || crypto.randomUUID(), exp || Math.floor(now / 1000) + 300, now);
  if (bad) return bad;
  // staging drill: as if the database stopped answering right after the notice was recorded
  if (fault === 'after-record') throw Object.assign(new Error('drill'), { name: 'TimeoutError' });
  return processOne(db, ev, now, fault);
}

// ---------- the pass that puts things right (the daily job, and after each notice) ----------
// notices recorded but never applied (the step after recording failed); memberships the save has not been told;
// orders whose grant does not match their state; and memberships checked against the save, oldest check first.
// Nothing here can grant twice: every step is the same as the first time.
async function reconcile(db, now, max) {
  max = max || 50;
  const out = { applied: 0, pushed: 0, settled: 0, fixed: 0, left: 0 };
  for (const r of await db.query('SELECT body FROM zz.entevents WHERE applied IS NULL AND at < $1 ORDER BY at LIMIT $2', [now - 30000, max])) {
    const ev = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
    try { await processOne(db, ev, now); out.applied++; } catch (e) { out.left++; }
  }
  for (const r of await db.query('SELECT e.platform_id FROM zz.entitle e JOIN zz.identity i ON i.platform_id = e.platform_id WHERE e.pushed < e.version ORDER BY e.at LIMIT $1', [max])) {
    try { if (await pushMembership(db, r.platform_id, now) === 'pushed') out.pushed++; } catch (e) { out.left++; }
  }
  const { Meta } = require('./rules.js'), skus = Object.keys(Meta.PAID || {});
  if (skus.length) for (const r of await db.query(`SELECT o.order_id FROM zz.orders o JOIN zz.identity i ON i.platform_id = o.platform_id
      WHERE (o.status = 'succeeded') <> o.granted AND o.sku = ANY($1) ORDER BY o.updated LIMIT $2`, [skus, max])) {
    try { if (await settleOrder(db, r.order_id, now) === 'settled') out.settled++; } catch (e) { out.left++; }
  }
  // the save against the record (someone or something may have written the save since): told again where they differ
  for (const r of await db.query(`SELECT e.platform_id, e.tier, e.status, e.period_end, e.version, p.state->'sub' AS sub FROM zz.entitle e
      JOIN zz.identity i ON i.platform_id = e.platform_id JOIN zz.players p ON p.id = i.pid WHERE e.pushed = e.version ORDER BY e.checked LIMIT $1`, [max])) {
    const want = effective(r, now), sub = (typeof r.sub === 'string' ? JSON.parse(r.sub) : r.sub) || {};
    const has = sub.demo === false && +sub.until > now ? { until: +sub.until, tier: sub.tier || '' } : { until: 0, tier: '' };
    const wantNow = want.until > now ? want : { until: 0, tier: '' };
    if (has.until !== wantNow.until || has.tier !== wantNow.tier) {
      await db.query('UPDATE zz.entitle SET pushed = 0 WHERE platform_id = $1 AND version = $2', [r.platform_id, r.version]);
      try { await pushMembership(db, r.platform_id, now); out.fixed++; } catch (e) { out.left++; }
    } else await db.query('UPDATE zz.entitle SET checked = $2 WHERE platform_id = $1', [r.platform_id, now]);
  }
  const backlog = (await db.query(`SELECT (SELECT count(*)::int FROM zz.entevents WHERE applied IS NULL AND at < $1) AS ev,
      (SELECT count(*)::int FROM zz.entitle e JOIN zz.identity i ON i.platform_id = e.platform_id WHERE e.pushed < e.version) AS push`, [now - 300000]))[0];
  if (out.left || backlog.ev || backlog.push) console.warn('[zz] entitle backlog ' + JSON.stringify({ failed: out.left, unapplied: backlog.ev, unpushed: backlog.push }));
  return Object.assign(out, { backlog });
}
// a save has just been linked (or come to a new device): what its account already has comes with it
async function linked(db, pid, now) {
  const r = (await db.query('SELECT platform_id FROM zz.identity WHERE pid = $1', [pid]))[0];
  if (!r) return;
  try { await pushMembership(db, r.platform_id, now); } catch (e) { console.warn('[zz] entitle link push failed'); }
  for (const o of await db.query('SELECT order_id FROM zz.orders WHERE platform_id = $1', [r.platform_id])) {
    try { await settleOrder(db, o.order_id, now); } catch (e) { console.warn('[zz] entitle link settle failed'); }
  }
}

module.exports = { settings, enabled, kids, verify, handle, linked, reconcile, record, apply, processOne, effective, read, SCHEMA, AUD, SCOPE, SERVICE, ISSUER, JWKS_URL,
  setFetch(fn) { fetcher = fn; cache = { url: '', at: 0, keys: null }; } };
