'use strict';
/* An isolated test Identity for cube2's joint acceptance B4, B5, B9 and B10 (2026-11-23): its own issuer (this
   deployment's address), its own Ed25519 test key and client secret, synthetic accounts only. It answers like cube1
   Identity staging v4 (login page, consent page, 303 back with iss/state/code, POST /oauth/token with the six JSON
   fields, POST /v1/token/status) and has the four acceptance switches, chosen by TID_SWITCH:
     B4  the token carries no nonce          B5  the token carries another nonce
     B9  /v1/token/status says active:false  B10 /v1/token/status answers 503
   Nothing is kept between requests: the login and the consent are signed blobs, and the code is an HMAC of the
   grant (all with TID_HMAC), so the token request, which repeats the grant, finds the account again.
   Only an isolated cube2 deployment (branch accept-b) trusts this issuer; staging and production never do.
   Settings (Vercel environment, never in the repository): TID_KEY (PKCS8 PEM, Ed25519), TID_CLIENT_SECRET,
   TID_HMAC, TID_REDIRECT (the one callback), TID_ACCOUNTS (JSON {email: {sub}}; with pw only in local rehearsals),
   TID_SWITCH. */
const crypto = require('crypto');
const CLIENT = 'brickduel-bff-staging', KID = 'tidaccept01', AUD = 'snowrealm:brickduel:api';
const env = k => process.env[k] || '';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const mac = s => crypto.createHmac('sha256', env('TID_HMAC')).update(s).digest('base64url');
const seal = o => { const s = b64(o); return s + '.' + mac(s); };
function unseal(v) {
  if (typeof v !== 'string' || v.length > 4000) return null;
  const i = v.lastIndexOf('.'); if (i < 1) return null;
  const s = v.slice(0, i), m = v.slice(i + 1), want = mac(s);
  if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); return o && o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
// a code is the 43 characters cube2 expects (32 bytes): an HMAC of the grant, the account and the minute, so the token
// request (which repeats the grant) can find the account again without anything kept between requests
const minute = () => Math.floor(Date.now() / 60000);
const codeFor = (g, sub, m) => crypto.createHmac('sha256', env('TID_HMAC')).update(['code', g.clientId, g.redirectUri, g.state, g.nonce, g.codeChallenge, sub, m].join('|')).digest('base64url');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function page(res, status, title, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end('<!doctype html><meta charset="utf-8"><title>' + title + '</title><h1>' + title + '</h1><p>隔離測試 Identity（cube2 驗收用，非 cube1）</p>' + body);
}
function json(res, status, o) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }
const read = req => new Promise(r => { if (typeof req.body === 'string') return r(req.body); if (req.body && typeof req.body === 'object') return r(req.body); let s = ''; req.on('data', c => { s += c; }); req.on('end', () => r(s)); });
const cookie = (req, name) => { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]) : null; };
function grantOf(u) {
  const g = { clientId: u.searchParams.get('client_id'), redirectUri: u.searchParams.get('redirect_uri'), codeChallenge: u.searchParams.get('code_challenge'), state: u.searchParams.get('state'), nonce: u.searchParams.get('nonce') };
  if (u.searchParams.get('response_type') !== 'code' || u.searchParams.get('code_challenge_method') !== 'S256' || g.clientId !== CLIENT || g.redirectUri !== env('TID_REDIRECT') || !g.state || !g.nonce || !g.codeChallenge) return null;
  return g;
}
function keys() {
  const priv = crypto.createPrivateKey(env('TID_KEY'));
  const jwk = Object.assign(crypto.createPublicKey(priv).export({ format: 'jwk' }), { kid: KID, use: 'sig', alg: 'EdDSA' });
  return { priv, jwk };
}
const sw = () => (['B4', 'B5', 'B9', 'B10'].indexOf(env('TID_SWITCH')) >= 0 ? env('TID_SWITCH') : '');
function accounts() { try { return JSON.parse(env('TID_ACCOUNTS')) || {}; } catch (e) { return {}; } }
// accounts with a password get the usual form (local rehearsals with tools/joint-link-check.js); accounts without one
// (the deployed test Identity: synthetic accounts, nothing to protect) are picked with a button, so no password is typed
const loginPage = (res, u, failed) => {
  const list = Object.entries(accounts()), act = '/oauth/authorize' + esc(u.search);
  if (list.some(([, a]) => a.pw)) return page(res, failed ? 401 : 200, '登入（隔離測試 Identity）', (failed ? '<p>登入失敗。</p>' : '') +
    '<form method="post" action="' + act + '"><input name="email" type="email"><input name="password" type="password"><button type="submit">登入</button></form>');
  return page(res, failed ? 401 : 200, '選測試帳號（隔離測試 Identity）', '<form method="post" action="' + act + '">' +
    list.map(([email]) => '<button name="account" value="' + esc(email) + '">' + esc(email) + '</button>').join(' ') + '</form>');
};

module.exports = async (req, res) => {
  const iss = (process.env.TID_SCHEME === 'http' ? 'http://' : 'https://') + (req.headers['x-forwarded-host'] || req.headers.host);      // (http only in local rehearsals)
  const u = new URL(req.url, iss);
  try {
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/health')) return json(res, 200, { ok: true, iss, switch: sw() || 'none', test: true });
    if (req.method === 'GET' && u.pathname === '/.well-known/jwks.json') return json(res, 200, { keys: [keys().jwk] });
    if (u.pathname === '/oauth/authorize' && req.method === 'GET') {
      const g = grantOf(u);
      if (!g) return page(res, 400, '授權請求無效', '');
      const who = unseal(cookie(req, 'tidsess'));
      if (!who) return loginPage(res, u);
      const blob = seal({ g, sub: who.sub, exp: Date.now() + 10 * 60000 });
      return page(res, 200, '連結帳號（隔離測試 Identity）', '<form method="post" action="/oauth/authorize"><input type="hidden" name="c" value="' + esc(blob) + '"><button name="decision" value="allow">同意</button><button name="decision" value="deny">拒絕</button></form>');
    }
    if (u.pathname === '/oauth/authorize' && req.method === 'POST') {
      const raw = await read(req), form = new URLSearchParams(typeof raw === 'string' ? raw : Object.entries(raw).map(([k, v]) => [k, String(v)]));
      if (form.has('email') || form.has('account')) {
        const a = form.has('email') ? accounts()[form.get('email')] : accounts()[form.get('account')];
        if (!a || (a.pw ? a.pw !== form.get('password') : form.has('email'))) return loginPage(res, u, true);
        res.writeHead(303, { Location: '/oauth/authorize' + u.search, 'Set-Cookie': 'tidsess=' + encodeURIComponent(seal({ sub: a.sub, exp: Date.now() + 30 * 60000 })) + '; Path=/;' + (process.env.TID_SCHEME === 'http' ? '' : ' Secure;') + ' HttpOnly; SameSite=Lax' });
        return res.end();
      }
      const c = unseal(form.get('c'));
      if (!c) return page(res, 400, '授權請求無效', '');
      const to = new URL(c.g.redirectUri); to.searchParams.set('iss', iss); to.searchParams.set('state', c.g.state);
      if (form.get('decision') === 'allow') to.searchParams.set('code', codeFor(c.g, c.sub, minute()));
      else to.searchParams.set('error', 'access_denied');
      res.writeHead(303, { Location: to.href }); return res.end();
    }
    if (u.pathname === '/oauth/token' && req.method === 'POST') {
      if (req.headers['x-snowrealm-client-secret'] !== env('TID_CLIENT_SECRET')) return json(res, 401, { error: 'invalid_client' });
      const raw = await read(req);
      let b; try { b = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return json(res, 400, { error: 'invalid_request' }); }
      if (!b || typeof b.code !== 'string' || b.clientId !== CLIENT || b.redirectUri !== env('TID_REDIRECT') || typeof b.state !== 'string' || typeof b.nonce !== 'string' || typeof b.codeVerifier !== 'string') return json(res, 400, { error: 'invalid_grant' });
      const g = { clientId: b.clientId, redirectUri: b.redirectUri, state: b.state, nonce: b.nonce, codeChallenge: crypto.createHash('sha256').update(b.codeVerifier).digest('base64url') };
      let sub = null;
      // a code is good for the minute it was made and the next two
      for (const a of Object.values(accounts())) for (const m of [minute(), minute() - 1, minute() - 2]) {
        const want = codeFor(g, a.sub, m);
        if (want.length === b.code.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(b.code))) sub = a.sub;
      }
      if (!sub) return json(res, 400, { error: 'invalid_grant' });
      const c = { g, sub };
      const now = Math.floor(Date.now() / 1000), k = keys(), h = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID });
      const claims = { iss, sub: c.sub, aud: AUD, scope: 'brickduel:account:link', nonce: c.g.nonce, iat: now, nbf: now, exp: now + 300, jti: crypto.randomUUID() };
      if (sw() === 'B4') delete claims.nonce;
      if (sw() === 'B5') claims.nonce = crypto.randomBytes(24).toString('base64url');
      const p = b64(claims);
      return json(res, 200, { access_token: h + '.' + p + '.' + crypto.sign(null, Buffer.from(h + '.' + p), k.priv).toString('base64url'), token_type: 'Bearer', expires_in: 300 });
    }
    if (u.pathname === '/v1/token/status' && req.method === 'POST') {
      if (req.headers['x-snowrealm-client-secret'] !== env('TID_CLIENT_SECRET')) return json(res, 401, { active: false });
      if (sw() === 'B10') return json(res, 503, { error: 'unavailable' });
      return json(res, 200, { active: sw() !== 'B9' });
    }
    return json(res, 404, { error: 'not_found' });
  } catch (e) { return json(res, 500, { error: 'server' }); }
};
