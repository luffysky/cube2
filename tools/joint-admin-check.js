#!/usr/bin/env node
'use strict';
/* Joint acceptance A1–A14 against cube2 staging (docs/JOINT_ACCEPTANCE.md), run by whoever holds the staging admin
   signer (cube1). Plain Node 18+, no packages. Nothing secret is printed or written: tokens, the bypass secret and the
   key stay in memory; the report shows case, time, path, HTTP status, the error word or the field names only.

   Everything comes from environment variables (not arguments, so nothing lands in shell history):
     STAGING_URL        default https://brickduel-staging.snowrealm.pet
     VERCEL_BYPASS      the Vercel "Protection Bypass for Automation" secret for cube2 (sent as x-vercel-protection-bypass)
   and either a signer (preferred: every case can be made)
     ADMIN_SIGNER_PEM   path to the staging admin Ed25519 PRIVATE key (PKCS#8 PEM). Never the production key.
     ADMIN_KID          its kid in the staging admin-jwks.json
     ADMIN_ISS          the staging issuer exactly as cube2 Preview is set to trust (BRICKDUEL_ADMIN_ISSUER)
     ADMIN_SUB          default svc:snowrealm-games-admin
   or one ready-made valid token (only the cases that need no other token run; the rest say BLOCKED)
     ADMIN_TOKEN

     node tools/joint-admin-check.js > a-results.json

   A7/A8 (key rotation) and A9 (JWKS down) need the signer side to change its JWKS, and A14 needs a look at
   zz.admin_log on the staging branch: they are listed as MANUAL with what to do. */
const crypto = require('crypto');
const fs = require('fs');

const BASE = (process.env.STAGING_URL || 'https://brickduel-staging.snowrealm.pet').replace(/\/+$/, '');
const BYPASS = process.env.VERCEL_BYPASS || '';
const ADM = '/internal/admin/v1/';
const results = [];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

let key = null;
if (process.env.ADMIN_SIGNER_PEM) key = crypto.createPrivateKey(fs.readFileSync(process.env.ADMIN_SIGNER_PEM));
const KID = process.env.ADMIN_KID || '', ISS = process.env.ADMIN_ISS || '', SUB = process.env.ADMIN_SUB || 'svc:snowrealm-games-admin';
function mint(claims, head) {
  if (!key) return null;
  const sec = Math.floor(Date.now() / 1000);
  const h = Object.assign({ alg: 'EdDSA', typ: 'JWT', kid: KID }, head || {});
  const body = Object.assign({ iss: ISS, aud: 'snowrealm:brickduel:admin', sub: SUB, scope: 'brickduel:admin:read', iat: sec, nbf: sec, exp: sec + 300, jti: crypto.randomUUID() }, claims || {});
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  const data = b64(h) + '.' + b64(body);
  return data + '.' + crypto.sign(null, Buffer.from(data), key).toString('base64url');
}
const valid = () => key ? mint() : process.env.ADMIN_TOKEN || null;

// the answer, without anything that could be a secret or player data: the error word, or the top-level field names
function shape(text) {
  try {
    const j = JSON.parse(text);
    if (j && j.error) return { error: j.error };
    if (j && Array.isArray(j.items)) return { fields: Object.keys(j), items: j.items.length, itemFields: j.items[0] ? Object.keys(j.items[0]) : [] };
    return { fields: Object.keys(j || {}) };
  } catch (e) { return { body: 'not json' }; }
}
async function hit(path, token, method) {
  const headers = {};
  if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS;
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method: method || 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  return { status: r.status, noStore: r.headers.get('cache-control') === 'no-store', cors: r.headers.get('access-control-allow-origin'), shape: shape(text), text };
}
function note(id, what, path, ok, r, extra) {
  results.push(Object.assign({ caseId: id, what, at: new Date().toISOString(), url: BASE + path, status: r ? r.status : null,
    result: ok === null ? 'BLOCKED' : ok ? 'PASS' : 'FAIL', response: r ? r.shape : null }, extra || {}));
}

(async () => {
  const health = await hit('/api/health');
  let build = null;
  try { const h = JSON.parse(health.text); build = { build: h.build || null, dbSource: h.dbSource || null, admin: h.admin }; } catch (e) { /* recorded below */ }
  const T = valid();
  if (!T) note('A1', 'valid token: seven GETs', ADM + '*', null, null, { why: 'no ADMIN_SIGNER_PEM or ADMIN_TOKEN given' });
  else {
    const paths = ['overview', 'players?limit=5', 'draws?limit=5', 'matches?limit=5', 'metrics', 'metrics/daily'];
    let all = true;
    for (const p of paths) {
      const r = await hit(ADM + p, T);
      const good = r.status === 200 && r.noStore && !r.cors;
      all = all && good;
      note('A1', 'valid token: ' + p.split('?')[0], ADM + p, good, r);
    }
    const list = await hit(ADM + 'players?limit=1', T);
    let id = null; try { const j = JSON.parse(list.text); id = j.items && j.items[0] && j.items[0].gameUserId; } catch (e) { /* none */ }
    if (id) { const r = await hit(ADM + 'players/' + id, T); note('A1', 'valid token: players/{id}', ADM + 'players/{id}', r.status === 200, r); }
    else note('A1', 'valid token: players/{id}', ADM + 'players/{id}', null, list, { why: 'no player in the staging database yet (play one match on staging first)' });
    const again = await hit(ADM + 'overview', T);
    note('A11', 'the same token again (refresh, paging)', ADM + 'overview', again.status === 200, again);
    const post = await hit(ADM + 'overview', T, 'POST');
    note('A13', 'POST', ADM + 'overview', post.status === 405, post);
  }
  const neg = [
    ['A2', 'wrong audience', { aud: 'snowrealm:brickduel:api' }, null, 401],
    ['A3', 'wrong issuer', { iss: 'https://not-the-issuer.invalid' }, null, 401],
    ['A4', 'wrong scope', { scope: 'brickduel:admin:write' }, null, 403],
    ['A4', 'no scope', { scope: undefined }, null, 403],
    ['A5', 'subject not listed', { sub: 'svc:someone-else' }, null, 403],
    ['A6', 'kid not in the JWKS', {}, { kid: 'kid-that-is-not-there' }, 401],
    ['A10', 'expired', { iat: Math.floor(Date.now() / 1000) - 1000, nbf: Math.floor(Date.now() / 1000) - 1000, exp: Math.floor(Date.now() / 1000) - 400 }, null, 401],
    ['A10', 'nbf in the future', { nbf: Math.floor(Date.now() / 1000) + 600 }, null, 401],
    ['A10', 'lives longer than 600 s', { exp: Math.floor(Date.now() / 1000) + 900 }, null, 401]
  ];
  for (const [id, what, claims, head, want] of neg) {
    if (!key) { note(id, what, ADM + 'overview', null, null, { why: 'needs ADMIN_SIGNER_PEM to make this token' }); continue; }
    const r = await hit(ADM + 'overview', mint(claims, head));
    note(id, what, ADM + 'overview', r.status === want && r.noStore, r, { want });
  }
  const none = await hit(ADM + 'overview', null);
  note('A2', 'no token at all', ADM + 'overview', none.status === 401, none, { want: 401 });
  if (T) {
    let last = null, n = 0;
    for (let i = 0; i < 70; i++) { last = await hit(ADM + 'overview', key ? mint() : T); n++; if (last.status === 429) break; }
    note('A12', 'more than 60 a minute', ADM + 'overview', last.status === 429, last, { calls: n });
  } else note('A12', 'more than 60 a minute', ADM + 'overview', null, null, { why: 'needs a valid token' });
  results.push({ caseId: 'A7', result: 'MANUAL', what: 'rotation: publish a second key in the staging admin JWKS, sign with its kid, expect 200 within a minute' });
  results.push({ caseId: 'A8', result: 'MANUAL', what: 'remove the old key from the JWKS, sign with the old kid, expect 401 after at most 10 minutes (cache)' });
  results.push({ caseId: 'A9', result: 'MANUAL', what: 'make the staging admin JWKS unreachable (or 500), expect 503 {"error":"unavailable"}' });
  results.push({ caseId: 'A14', result: 'MANUAL', what: 'Owner, in the Neon console on the staging branch: SELECT at, sub, jti, path, status FROM zz.admin_log ORDER BY id DESC LIMIT 50; expect the calls above, no token text' });
  process.stdout.write(JSON.stringify({ target: BASE, cube2: build, ranAt: new Date().toISOString(), signer: key ? 'staging signer' : T ? 'single token' : 'none', results }, null, 2) + '\n');
})().catch(e => { console.error('stopped: ' + (e && e.message ? e.message.replace(/Bearer \S+/g, 'Bearer [hidden]') : e)); process.exit(1); });
