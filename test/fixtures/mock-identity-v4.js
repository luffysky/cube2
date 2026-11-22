'use strict';
// A stand-in for cube1 Identity staging v4 (identity/neon/browser-authorization.mjs and the trusted app), for
// rehearsing tools/joint-link-check.js locally: the same login page, consent page with a CSRF token, the same
// redirects (iss, state, code or error=access_denied), POST /oauth/token with x-snowrealm-client-secret and the six
// JSON fields, Ed25519 tokens carrying the nonce, POST /v1/token/status. Plain http on 127.0.0.1; test use only.
const http = require('http'), crypto = require('crypto');
const PORT = +process.argv[2] || 8790;
const ISS = 'http://127.0.0.1:' + PORT, SECRET = process.env.MOCK_CLIENT_SECRET || 'm'.repeat(48);
const REDIRECT = process.env.MOCK_REDIRECT, CLIENT = 'brickduel-bff-staging';
const ACCOUNTS = { 'one@example.test': { pw: 'pw-one-local', sub: crypto.randomUUID() }, 'two@example.test': { pw: 'pw-two-local', sub: crypto.randomUUID() } };
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const KID = 'mockplayer01';
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: KID, use: 'sig', alg: 'EdDSA' });
const sessions = new Map(), consents = new Map(), codes = new Map();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const cookie = (req, name) => { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie || ''); return m ? m[1] : null; };
const page = (res, status, title, body, extra) => { res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {})); res.end('<!doctype html><title>' + title + '</title><h1>' + title + '</h1>' + body); };
const json = (res, status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const read = req => new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => r(s)); });
function grantOf(u) {
  const g = { clientId: u.searchParams.get('client_id'), redirectUri: u.searchParams.get('redirect_uri'), codeChallenge: u.searchParams.get('code_challenge'), state: u.searchParams.get('state'), nonce: u.searchParams.get('nonce') };
  if (u.searchParams.get('response_type') !== 'code' || u.searchParams.get('code_challenge_method') !== 'S256' || g.clientId !== CLIENT || g.redirectUri !== REDIRECT) return null;
  return g;
}
const loginPage = (res, u, failed) => page(res, failed ? 401 : 200, '登入 SnowRealm Games 測試站', (failed ? '<p>登入失敗。</p>' : '') +
  '<form method="post" action="/oauth/authorize' + u.search.replace(/&/g, '&amp;') + '"><input name="email" type="email"><input name="password" type="password"><button type="submit">登入</button></form>');
http.createServer(async (req, res) => {
  const u = new URL(req.url, ISS);
  if (req.method === 'GET' && u.pathname === '/.well-known/jwks.json') return json(res, 200, { keys: [jwk] });
  if (u.pathname === '/oauth/authorize' && req.method === 'GET') {
    const g = grantOf(u);
    if (!g) return page(res, 400, '授權請求無效', '');
    const who = sessions.get(cookie(req, 'mocksess'));
    if (!who) return loginPage(res, u);
    const csrf = crypto.randomBytes(16).toString('hex'), cid = crypto.randomBytes(16).toString('hex');
    consents.set(cid, { g, sub: who, csrf });
    return page(res, 200, '連結 SnowRealm Games 帳號', '<form method="post" action="/oauth/authorize"><input type="hidden" name="csrf" value="' + csrf + '"><button name="decision" value="allow">同意</button><button name="decision" value="deny">拒絕</button></form>', { 'Set-Cookie': 'mockconsent=' + cid + '; Path=/; HttpOnly' });
  }
  if (u.pathname === '/oauth/authorize' && req.method === 'POST') {
    const form = new URLSearchParams(await read(req));
    if (form.has('email')) {
      const a = ACCOUNTS[form.get('email')];
      if (!a || a.pw !== form.get('password')) return loginPage(res, u, true);
      const sid = crypto.randomBytes(16).toString('hex'); sessions.set(sid, a.sub);
      res.writeHead(303, { Location: '/oauth/authorize' + u.search, 'Set-Cookie': 'mocksess=' + sid + '; Path=/; HttpOnly' }); return res.end();
    }
    const c = consents.get(cookie(req, 'mockconsent'));
    if (!c || form.get('csrf') !== c.csrf) return page(res, 400, '授權請求無效', '');
    consents.delete(cookie(req, 'mockconsent'));
    const to = new URL(c.g.redirectUri); to.searchParams.set('iss', ISS); to.searchParams.set('state', c.g.state);
    if (form.get('decision') === 'allow') { const code = crypto.randomBytes(32).toString('base64url'); codes.set(code, Object.assign({ sub: c.sub }, c.g)); to.searchParams.set('code', code); }
    else to.searchParams.set('error', 'access_denied');
    res.writeHead(303, { Location: to.href }); return res.end();
  }
  if (u.pathname === '/oauth/token' && req.method === 'POST') {
    if (req.headers['x-snowrealm-client-secret'] !== SECRET) return json(res, 401, { error: 'invalid_client' });
    let b; try { b = JSON.parse(await read(req)); } catch (e) { return json(res, 400, { error: 'invalid_request' }); }
    const c = codes.get(b.code); codes.delete(b.code);
    const ok = c && b.clientId === c.clientId && b.redirectUri === c.redirectUri && b.state === c.state && b.nonce === c.nonce &&
      crypto.createHash('sha256').update(b.codeVerifier || '').digest('base64url') === c.codeChallenge;
    if (!ok) return json(res, 400, { error: 'invalid_grant' });
    const iat = Math.floor(Date.now() / 1000), h = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID });
    const p = b64({ iss: ISS, sub: c.sub, aud: 'snowrealm:brickduel:api', scope: 'brickduel:account:link', nonce: c.nonce, iat, nbf: iat, exp: iat + 300, jti: crypto.randomUUID() });
    return json(res, 200, { access_token: h + '.' + p + '.' + crypto.sign(null, Buffer.from(h + '.' + p), privateKey).toString('base64url'), token_type: 'Bearer', expires_in: 300 });
  }
  if (u.pathname === '/v1/token/status' && req.method === 'POST') return json(res, req.headers['x-snowrealm-client-secret'] === SECRET ? 200 : 401, { active: req.headers['x-snowrealm-client-secret'] === SECRET });
  json(res, 404, { error: 'not_found' });
}).listen(PORT, '127.0.0.1', () => process.stdout.write('mock identity ' + ISS + '\n'));
