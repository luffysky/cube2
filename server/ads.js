'use strict';
/* 轉磚: the rewarded-ad callback. The ad network calls this address after a player has watched a whole ad; only
   then are coins paid (Meta.runServer('adGrant'), once per transaction, within the daily limit).

   The callback is believed only if its signature checks out:
   - Format: Google's rewarded server-side verification (SSV). The query string carries ad_network, ad_unit,
     custom_data, key_id, reward_amount, reward_item, timestamp, transaction_id, user_id, then signature and key_id
     last. The signature is ECDSA P-256 / SHA-256 over every byte of the query string before "&signature=", in
     base64url DER form. The public keys are a JSON list ({ keys: [{ keyId, pem }] }) fetched from the network.
   - Switched on only by environment settings (names only, never values in the code or the logs):
       ADS_SSV_KEYS_URL   where the network publishes its public keys
       ADS_AD_UNITS       the ad unit ids allowed to pay out, comma separated
     With either missing the endpoint answers 503 and nothing is ever paid.
   - custom_data carries the player's public tag (set by the page when it asks for the ad). It is not a secret: a
     forged one cannot pass the signature, and watching an ad for someone else only helps them.
   This has not been tested against a real ad account yet; check the parameter names against the network's own
   documentation when the account is approved. */
const crypto = require('crypto');

const KEY_TTL = 12 * 3600000;        // keys rotate; Google asks for no more than 24 hours of caching
const MAX_AGE = 60 * 60000;          // a callback older than an hour is not paid
let cache = { at: 0, keys: null };
let fetcher = null;            // tests put their own here; otherwise the platform's fetch

function settings(env) {
  env = env || process.env;
  const url = env.ADS_SSV_KEYS_URL || '', units = (env.ADS_AD_UNITS || '').split(',').map(s => s.trim()).filter(Boolean);
  return url && units.length ? { url, units } : null;
}
function configured(env) { return !!settings(env); }

async function keys(url, fetchFn, now) {
  if (cache.keys && cache.url === url && now - cache.at < KEY_TTL) return cache.keys;
  const r = await (fetchFn || fetcher || fetch)(url);
  if (!r.ok) throw new Error('keys ' + r.status);
  const j = await r.json(), out = {};
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) if (k && k.keyId != null && typeof k.pem === 'string') out[String(k.keyId)] = k.pem;
  cache = { at: now, url, keys: out };
  return out;
}
function b64url(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

// rawQuery: the query string exactly as received (without "?"). Gives { ok, tx, tag } or { ok: false, why }.
async function verify(rawQuery, o) {
  o = o || {};
  const set = settings(o.env), now = o.now || Date.now();
  if (!set) return { ok: false, why: 'off' };
  const at = rawQuery.indexOf('&signature=');
  if (at < 0) return { ok: false, why: 'unsigned' };
  const signed = rawQuery.slice(0, at), q = new URLSearchParams(rawQuery);
  const sig = q.get('signature') || '', kid = q.get('key_id') || '', tx = q.get('transaction_id') || '', tag = q.get('custom_data') || '';
  const unit = q.get('ad_unit') || '', ts = +q.get('timestamp') || 0;
  if (!sig || !kid || !/^[A-Za-z0-9_.:-]{6,120}$/.test(tx) || !/^[a-z0-9]{8}$/.test(tag)) return { ok: false, why: 'fields' };
  if (set.units.indexOf(unit) < 0) return { ok: false, why: 'unit' };
  if (!ts || Math.abs(now - ts) > MAX_AGE) return { ok: false, why: 'old' };
  let pem;
  try { pem = (await keys(set.url, o.fetch, now))[kid]; } catch (e) { return { ok: false, why: 'keys' }; }
  if (!pem) return { ok: false, why: 'kid' };
  let good = false;
  try { good = crypto.verify('sha256', Buffer.from(signed, 'utf8'), { key: pem, dsaEncoding: 'der' }, b64url(sig)); } catch (e) { good = false; }
  return good ? { ok: true, tx, tag } : { ok: false, why: 'signature' };
}
function forget() { cache = { at: 0, keys: null }; }
function setFetch(f) { fetcher = f || null; forget(); }

module.exports = { verify, configured, forget, setFetch, MAX_AGE };
