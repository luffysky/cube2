'use strict';
/* 轉磚 × SnowRealm Identity: checks a SnowRealm platform token, the way docs/BRICKDUEL_IDENTITY_ADAPTER_SPEC.md says.

   SnowRealm Identity is not running yet. Until it is, and until the link has been tested end to end, this stays off:
   it is on only when every setting below is there (names only; values live in the hosting settings, never here):
     IDENTITY_ISSUER        the issuer, exactly (planned: https://identity.snowrealm.pet)
     IDENTITY_JWKS_URL      where its public keys are published (planned: …/.well-known/jwks.json)
     IDENTITY_AUDIENCE      this game's audience (planned: snowrealm:brickduel:api)
     IDENTITY_LINK_ENABLED  "1" to open linking and recovery; anything else keeps them closed
   With it off, the link endpoints answer 503 and nothing about the anonymous game changes.

   A token is believed only if all of this holds:
     header: alg EdDSA (nothing else, never "none"), a kid found in the published keys, an Ed25519 key
     iss and aud exactly as configured; sub a UUID; jti present; iat present and not more than 60 s ahead;
     exp present, not passed, and no more than 600 s after iat; nbf, if present, reached; the needed scope present
   The keys are kept for ten minutes; when they cannot be fetched, nothing is believed. */
const crypto = require('crypto');

const KEYS_TTL = 10 * 60000, SKEW = 60, MAX_LIFE = 600, FETCH_MS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_SCOPE = 'brickduel:account:link';
let cache = { url: '', at: 0, keys: null };
let fetcher = null;                  // tests put their own here

function settings(env) {
  env = env || process.env;
  const iss = env.IDENTITY_ISSUER || '', jwks = env.IDENTITY_JWKS_URL || '', aud = env.IDENTITY_AUDIENCE || '';
  if (!iss || !jwks || !aud) return null;
  if (!/^https:\/\//.test(jwks) && !env.IDENTITY_ALLOW_HTTP_FOR_TESTS) return null;
  return { iss, jwks, aud, on: env.IDENTITY_LINK_ENABLED === '1' };
}
function enabled(env) { const s = settings(env); return !!(s && s.on); }

async function keys(url, now) {
  if (cache.keys && cache.url === url && now - cache.at < KEYS_TTL) return cache.keys;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), FETCH_MS) : null;
  try {
    const r = await (fetcher || fetch)(url, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) throw new Error('jwks ' + r.status);
    const j = await r.json(), out = {};
    for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
      if (!k || k.kty !== 'OKP' || k.crv !== 'Ed25519' || typeof k.x !== 'string' || typeof k.kid !== 'string') continue;
      try { out[k.kid] = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' }); } catch (e) { /* a key that does not read is skipped */ }
    }
    cache = { url, at: now, keys: out };
    return out;
  } finally { if (timer) clearTimeout(timer); }
}
function part(s) { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); }

// Gives { ok: true, sub, jti, exp, scope } or { ok: false, why }. now in milliseconds. need: a scope that must be there.
async function verify(token, o) {
  o = o || {};
  const s = settings(o.env), now = o.now != null ? o.now : Date.now(), sec = Math.floor(now / 1000);
  if (!s) return { ok: false, why: 'off' };
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, why: 'token' };
  const bits = token.split('.');
  if (bits.length !== 3 || !bits.every(b => /^[A-Za-z0-9_-]+$/.test(b))) return { ok: false, why: 'token' };
  let head, body;
  try { head = part(bits[0]); body = part(bits[1]); } catch (e) { return { ok: false, why: 'token' }; }
  if (!head || head.alg !== 'EdDSA') return { ok: false, why: 'alg' };
  if (typeof head.kid !== 'string' || !head.kid) return { ok: false, why: 'kid' };
  let ks;
  try { ks = await keys(s.jwks, now); } catch (e) { return { ok: false, why: 'jwks' }; }
  const key = ks[head.kid];
  if (!key) return { ok: false, why: 'kid' };
  let good = false;
  try { good = crypto.verify(null, Buffer.from(bits[0] + '.' + bits[1]), key, Buffer.from(bits[2], 'base64url')); } catch (e) { good = false; }
  if (!good) return { ok: false, why: 'signature' };
  if (!body || typeof body !== 'object') return { ok: false, why: 'token' };
  if (body.iss !== s.iss) return { ok: false, why: 'iss' };
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (aud.indexOf(s.aud) < 0) return { ok: false, why: 'aud' };
  if (typeof body.sub !== 'string' || !UUID.test(body.sub)) return { ok: false, why: 'sub' };
  if (typeof body.jti !== 'string' || !body.jti || body.jti.length > 200) return { ok: false, why: 'jti' };
  if (typeof body.iat !== 'number' || body.iat > sec + SKEW) return { ok: false, why: 'iat' };
  if (typeof body.exp !== 'number' || body.exp <= sec - 0 || body.exp - body.iat > MAX_LIFE) return { ok: false, why: 'exp' };
  if (body.nbf != null && (typeof body.nbf !== 'number' || body.nbf > sec + SKEW)) return { ok: false, why: 'nbf' };
  const scope = typeof body.scope === 'string' ? body.scope.split(' ') : [];
  if (o.need && scope.indexOf(o.need) < 0) return { ok: false, why: 'scope' };
  return { ok: true, sub: body.sub.toLowerCase(), jti: body.jti, exp: body.exp, scope };
}

module.exports = { settings, enabled, verify, LINK_SCOPE, setFetch(fn) { fetcher = fn; cache = { url: '', at: 0, keys: null }; }, clearCache() { cache = { url: '', at: 0, keys: null }; } };
