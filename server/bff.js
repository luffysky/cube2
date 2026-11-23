'use strict';
/* 轉磚's OAuth BFF for "connect to SnowRealm Games" (authorization code + PKCE S256, all secrets on the server).

     POST /api/auth/start      { intent: 'link' | 'recover' | 'restore' }   → { url } and a session cookie
     GET  /api/auth/callback   ?code=&state=  (from the Games portal)        → 303 to /?auth=<outcome>
     POST /api/auth/result     (same browser, the cookie)                    → the outcome once, then nothing

   The one registered callback is https://brickduel.snowrealm.pet/api/auth/callback, client brickduel-bff.

   How a link goes:
   1. The player presses the button. start makes a random session id (only its hash is stored), a state, a nonce and
      a PKCE verifier. The verifier, state and nonce are kept in zz.authsess encrypted with a key derived from the
      session id, so the database alone cannot read them. The browser gets the session id in a __Host- cookie
      (Secure, HttpOnly, SameSite=Lax, ten minutes): nothing goes to localStorage or into an address except the
      state, nonce and S256 challenge the portal needs. For 'link' the device's own key must be shown (Bearer), so
      only the device holding the save can start linking it.
   2. The portal (games.snowrealm.pet) has the player sign in and confirm, and its trusted back end issues the code.
      Whether consent was given is the portal's job; nothing here takes the browser's word for it.
   3. callback: the cookie must be there and match a session that is unused and not expired; it is used up at once,
      in one statement, whatever happens next. The state must match. The code goes to POST /oauth/token with the
      client secret (a server setting; never in the page, a log or the repository) along with the verifier and the
      original state and nonce. The token must pass server/identity.js (EdDSA, kid, iss, aud, scope
      brickduel:account:link, sub, iat/nbf/exp, jti) and carry a nonce claim equal to the stored one (required: cube1
      puts it in every link token, contract 2026-11-21; missing or different is refused), and then
      POST /v1/token/status must answer 200 with active: true. Anything else (403, 503, a timeout, a JWKS that cannot
      be fetched) is a refusal.
   4. Then the existing core.idLink / core.idRecover run: one platform player to one save, each jti once, 409 when
      either side is already linked; two saves are never merged, overwritten or have coins moved between them.
   5. The browser is sent to /?auth=<outcome> (a word, never a token). The page asks /api/auth/result once, with
      the cookie, for the new device key if there is one; it is wiped from the session as it is read.

   Off unless server/identity.js is fully set up and IDENTITY_LINK_ENABLED=1 and the client secret is set
   (IDENTITY_BRICKDUEL_CLIENT_SECRET, at least 32 characters). Until then every route answers 503 and the anonymous
   game is untouched. Expired sessions are not removed by anything yet: clearing them is a deletion and waits for the
   Owner. Used ones keep no secrets (the encrypted parts are cleared when used). */
const crypto = require('crypto');
const identity = require('./identity.js');
const core = require('./core.js');

const CLIENT_ID = 'brickduel-bff', REDIRECT = 'https://brickduel.snowrealm.pet/api/auth/callback';
const PORTAL = 'https://games.snowrealm.pet/', PROD_ISS = 'https://identity.snowrealm.pet';
const PROD_HOST = 'brickduel.snowrealm.pet', CLIENT_RE = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const COOKIE = '__Host-zzauth', LIFE = 10 * 60000, RESULT_LIFE = 5 * 60000, TOKEN_MS = 5000, STATUS_MS = 4000;
// The cookie outlives the session it names by twenty minutes. The session itself still ends after LIFE; the cookie only
// lets a player who comes back late be told "expired" (start again) rather than "no session". A cookie that lived
// exactly LIFE was already gone from the browser by then (joint acceptance B7, cube1 Actions run 45167007292).
const COOKIE_LIFE = LIFE + 20 * 60000;
const INTENTS = ['link', 'recover', 'restore'];
const OUTCOMES = ['linked', 'recovered', 'conflict', 'pending', 'none', 'ban', 'purged', 'session', 'expired', 'replay', 'state', 'denied', 'code', 'token', 'revoked', 'unavailable', 'off'];
let fetcher = null;

// Production: client brickduel-bff, callback https://brickduel.snowrealm.pet/api/auth/callback, secret
// IDENTITY_BRICKDUEL_CLIENT_SECRET. Nothing else is ever used when VERCEL_ENV is production.
// Staging (a Vercel Preview, never production) only with IDENTITY_STAGING=1, and then everything is its own:
//   IDENTITY_STAGING_REDIRECT       the one exact https callback that was deployed and checked, e.g. the proposed
//                                   https://brickduel-staging.snowrealm.pet/api/auth/callback (no wildcard, no port,
//                                   no query; not the production host)
//   IDENTITY_STAGING_CLIENT_ID      default brickduel-bff-staging (never brickduel-bff)
//   IDENTITY_STAGING_CLIENT_SECRET  its own secret (never the production one)
//   IDENTITY_ISSUER / _JWKS_URL / _AUDIENCE, IDENTITY_AUTHORIZE_URL, _TOKEN_URL, _STATUS_URL: the staging service
//                                   (the production issuer is refused; the portal address must be given)
// A start or callback on any other host than the callback's own is refused, so the cookie is always on that host.
function settings(env) {
  env = env || process.env;
  const id = identity.settings(env);
  if (!id || !id.on) return null;
  const http = !!env.IDENTITY_ALLOW_HTTP_FOR_TESTS, base = id.iss.replace(/\/+$/, '');
  const staging = env.VERCEL_ENV !== 'production' && env.IDENTITY_STAGING === '1';
  let clientId = CLIENT_ID, redirect = REDIRECT, secret = env.IDENTITY_BRICKDUEL_CLIENT_SECRET || '', authorize = env.IDENTITY_AUTHORIZE_URL || PORTAL;
  if (staging) {
    clientId = env.IDENTITY_STAGING_CLIENT_ID || 'brickduel-bff-staging';
    if (!CLIENT_RE.test(clientId) || clientId === CLIENT_ID) return null;
    redirect = env.IDENTITY_STAGING_REDIRECT || '';
    let u;
    try { u = new URL(redirect); } catch (e) { return null; }
    // (the local browser test may point it at its own http://127.0.0.1:port; never outside tests)
    const local = http && u.protocol === 'http:' && u.hostname === '127.0.0.1';
    if ((u.protocol !== 'https:' && !local) || u.href !== redirect || (u.port && !local) || u.username || u.password || u.search || u.hash ||
      u.pathname !== '/api/auth/callback' || u.hostname === PROD_HOST || /\*/.test(redirect)) return null;
    secret = env.IDENTITY_STAGING_CLIENT_SECRET || '';
    if (env.IDENTITY_BRICKDUEL_CLIENT_SECRET && secret === env.IDENTITY_BRICKDUEL_CLIENT_SECRET) return null;
    if (base === PROD_ISS || !env.IDENTITY_AUTHORIZE_URL || authorize === PORTAL) return null;
  }
  if (secret.length < 32) return null;
  const token = env.IDENTITY_TOKEN_URL || base + '/oauth/token', status = env.IDENTITY_STATUS_URL || base + '/v1/token/status';
  if (staging && [token, status].some(x => x.indexOf(PROD_ISS) === 0)) return null;
  if (!http && ![authorize, token, status].every(x => /^https:\/\//.test(x))) return null;
  return { iss: id.iss, secret, authorize, token, status, env, clientId, redirect, host: new URL(redirect).host, staging };
}
const enabled = env => !!settings(env);

// ---------- small pieces ----------
const rand = n => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const keyOf = sid => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(sid), Buffer.from('zz-bff-v1'), Buffer.from('session'), 32));
function seal(sid, obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(sid), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function open(sid, text) {
  try {
    const b = Buffer.from(String(text), 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', keyOf(sid), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
function cookieOf(header) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-]/g, '\\-') + '=([A-Za-z0-9_-]{43})(?:;|$)').exec(String(header || ''));
  return m ? m[1] : null;
}
const setCookie = (sid, ms) => COOKIE + '=' + (sid || '') + '; Path=/; Max-Age=' + Math.max(0, Math.floor(ms / 1000)) + '; Secure; HttpOnly; SameSite=Lax';
async function post(url, headers, body, ms) {
  const r = await (fetcher || fetch)(url, { method: 'POST', redirect: 'error', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, headers), body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, body: j };
}
function claimsOf(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch (e) { return null; } }

// ---------- start ----------
// who: { id, hash } from the device's own key (needed for 'link'); tag: a keyed hash of the network address, for the limit
async function start(db, body, who, tag, now, env, host) {
  const s = settings(env);
  if (!s) return { status: 503, body: { ok: false, why: 'off' } };
  if (host !== s.host) return { status: 400, body: { ok: false, why: 'host' } };
  const intent = body && body.intent;
  if (INTENTS.indexOf(intent) < 0) return { status: 400, body: { ok: false, why: 'intent' } };
  let pid = null, cred = null;
  if (intent === 'link') {
    if (!who) return { status: 401, body: { ok: false, why: 'auth' } };
    const p = await core.findPlayer(db, who);
    if (!p) return { status: 401, body: { ok: false, why: 'auth' } };
    if (p.pending) return { status: 409, body: { ok: false, why: 'pending' } };
    pid = p.id; cred = who.hash;
  }
  const slot = Math.floor(now / LIFE), k = 'bff:' + (pid || tag) + ':' + slot;
  const [n] = await db.query('INSERT INTO zz.rate (k, n, exp) VALUES ($1, 1, $2) ON CONFLICT (k) DO UPDATE SET n = zz.rate.n + 1 RETURNING n', [k, (slot + 2) * LIFE]);
  if (n.n > 10) return { status: 429, body: { ok: false, why: 'slow' } };
  const sid = rand(32), state = rand(32), nonce = rand(32), verifier = rand(48);
  const challenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
  await db.query('INSERT INTO zz.authsess (id, intent, pid, cred, box, made, exp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [sha(sid), intent, pid, cred, seal(sid, { state, nonce, verifier }), now, now + LIFE]);
  const u = new URL(s.authorize);
  u.searchParams.set('sso', 'brickduel');
  u.searchParams.set('client_id', s.clientId);
  u.searchParams.set('redirect_uri', s.redirect);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  return { status: 200, body: { ok: true, url: u.href }, cookie: setCookie(sid, COOKIE_LIFE) };
}

// ---------- callback ----------
// gives { outcome } (and writes it into the session for result to read). Never throws a token anywhere.
async function finish(db, q, cookie, now, env, host) {
  const s = settings(env);
  if (!s) return { outcome: 'off' };
  if (host !== s.host) return { outcome: 'session' };
  const sid = cookieOf(cookie);
  if (!sid) return { outcome: 'session' };
  // used up right here, whatever follows: a second visit with the same session finds nothing
  const rows = await db.query(`WITH old AS (SELECT id, box FROM zz.authsess WHERE id = $1 AND used IS NULL FOR UPDATE)
    UPDATE zz.authsess s SET used = $2, box = NULL FROM old WHERE s.id = old.id AND s.used IS NULL RETURNING s.intent, s.pid, s.cred, old.box AS box0, s.exp`, [sha(sid), now]);
  const row = rows[0];
  if (!row) {
    const seen = await db.query('SELECT 1 FROM zz.authsess WHERE id = $1', [sha(sid)]);
    return { outcome: seen[0] ? 'replay' : 'session' };
  }
  // note: where it stopped, for the server log only (an upstream HTTP status or a check's name; never a token or secret)
  const done = async (outcome, res, note) => {
    await db.query('UPDATE zz.authsess SET outcome = $2, res = $3, res_exp = $4 WHERE id = $1', [sha(sid), outcome, res ? seal(sid, res) : null, now + RESULT_LIFE]);
    return { outcome, sid, note: note || '' };
  };
  if (row.exp <= now) return done('expired');
  const box = row.box0 ? open(sid, row.box0) : null;
  if (!box) return done('session');
  if (q.get('error')) return done('denied');
  if (q.get('iss') != null && q.get('iss') !== s.iss) return done('state');
  const state = q.get('state') || '';
  if (!/^[A-Za-z0-9._~-]{22,256}$/.test(state) || !same(state, box.state)) return done('state');
  const code = q.get('code') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return done('code');
  // the code for a token, from the server, with the client secret and the original state and nonce
  let t;
  try {
    t = await post(s.token, { 'x-snowrealm-client-secret': s.secret }, { clientId: s.clientId, redirectUri: s.redirect, code, codeVerifier: box.verifier, state: box.state, nonce: box.nonce }, TOKEN_MS);
  } catch (e) { return done('unavailable', null, 'token fetch ' + (e && e.name === 'TimeoutError' ? 'timeout' : 'failed')); }
  if (t.status >= 500) return done('unavailable', null, 'token ' + t.status);
  const token = t.body && t.body.access_token;
  if (t.status !== 200 || typeof token !== 'string' || token.length > 4096 || (t.body.token_type && String(t.body.token_type).toLowerCase() !== 'bearer')) return done('token', null, 'token ' + t.status);
  const v = await identity.verify(token, { now, need: identity.LINK_SCOPE, env: s.env });
  if (!v.ok) return done(v.why === 'jwks' ? 'unavailable' : 'token', null, 'verify ' + v.why);
  const c = claimsOf(token);
  // the nonce must be in the token and be ours: missing or different is a refusal
  if (!c || typeof c.nonce !== 'string' || !c.nonce || !same(c.nonce, box.nonce)) return done('token', null, 'nonce');
  // revoked since it was signed? Only an explicit active: true lets it through.
  let st;
  try { st = await post(s.status, { Authorization: 'Bearer ' + token, 'x-snowrealm-client-secret': s.secret }, {}, STATUS_MS); } catch (e) { return done('unavailable', null, 'status fetch failed'); }
  if (st.status !== 200 || !st.body || st.body.active !== true) return done(st.status === 200 || st.status === 401 || st.status === 403 ? 'revoked' : 'unavailable', null, 'status ' + st.status);
  let out;
  if (row.intent === 'link') out = await core.idLink(db, { id: row.pid, hash: row.cred }, v, now);
  else out = await core.idRecover(db, v, now, row.intent === 'restore');
  const b = out.body || {};
  if (out.status === 200) return done(row.intent === 'link' ? 'linked' : 'recovered', b);
  const why = b.why;
  const outcome = why === 'pending' ? 'pending' : why === 'none' ? 'none' : why === 'ban' ? 'ban' : why === 'purged' ? 'purged' : why === 'auth' ? 'session'
    : why === 'replay' ? 'replay' : out.status === 409 ? 'conflict' : 'unavailable';
  return done(outcome, { why, other: b.other || null, until: b.until || null });
}

// ---------- result ----------
async function result(db, cookie, now, env) {
  if (!settings(env)) return { status: 503, body: { ok: false, why: 'off' } };
  const sid = cookieOf(cookie);
  if (!sid) return { status: 401, body: { ok: false, why: 'session' } };
  const r = await db.query(`WITH old AS (SELECT id, res FROM zz.authsess WHERE id = $1 AND outcome IS NOT NULL AND res_exp > $2 FOR UPDATE)
    UPDATE zz.authsess s SET res = NULL, res_exp = 0 FROM old WHERE s.id = old.id AND s.res_exp > $2 RETURNING s.outcome, old.res AS res0`, [sha(sid), now]);
  if (!r[0]) return { status: 404, body: { ok: false, why: 'none' }, cookie: setCookie('', 0) };
  return { status: 200, body: Object.assign({ ok: true, outcome: r[0].outcome }, r[0].res0 ? open(sid, r[0].res0) || {} : {}), cookie: setCookie('', 0) };
}

module.exports = { settings, enabled, start, finish, result, cookieOf, CLIENT_ID, REDIRECT, COOKIE, OUTCOMES,
  setFetch(fn) { fetcher = fn; } };
