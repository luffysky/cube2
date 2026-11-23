'use strict';
// The isolated test Identity (tools/test-identity) used for B4, B5, B9 and B10: its flow and its four switches.
const http = require('http'), crypto = require('crypto'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const REDIRECT = 'https://acc.example/api/auth/callback', SECRET = crypto.randomBytes(36).toString('base64url');
const SUB1 = crypto.randomUUID(), SUB2 = crypto.randomUUID();
Object.assign(process.env, {
  TID_SCHEME: 'http', TID_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), TID_CLIENT_SECRET: SECRET,
  TID_HMAC: crypto.randomBytes(32).toString('hex'), TID_REDIRECT: REDIRECT,
  TID_ACCOUNTS: JSON.stringify({ 'one@test.invalid': { sub: SUB1 }, 'two@test.invalid': { sub: SUB2 } }), TID_SWITCH: 'off'
});
const handler = require(path.join(__dirname, '..', 'tools', 'test-identity', 'api', 'index.js'));

(async () => {
  const srv = http.createServer(handler);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const form = (p, body, cookie) => fetch(base + p, { method: 'POST', redirect: 'manual', body, headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, cookie ? { cookie } : {}) });
  const post = (p, o, secret) => fetch(base + p, { method: 'POST', body: JSON.stringify(o), headers: Object.assign({ 'content-type': 'application/json' }, secret === null ? {} : { 'x-snowrealm-client-secret': secret || SECRET }) });

  // one grant through login and consent; returns what the token request needs
  async function grant(account, decision) {
    const verifier = crypto.randomBytes(32).toString('base64url'), state = crypto.randomBytes(24).toString('base64url'), nonce = crypto.randomBytes(24).toString('base64url');
    const q = new URLSearchParams({ client_id: 'brickduel-bff-staging', redirect_uri: REDIRECT, response_type: 'code', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state, nonce });
    let r = await fetch(base + '/oauth/authorize?' + q);
    const login = await r.text();
    r = await form('/oauth/authorize?' + q, 'account=' + encodeURIComponent(account));
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    r = await fetch(base + '/oauth/authorize?' + q, { headers: { cookie } });
    const consent = await r.text(), c = /name="c" value="([^"]+)"/.exec(consent);
    r = await form('/oauth/authorize', 'c=' + encodeURIComponent(c ? c[1] : '') + '&decision=' + decision, cookie);
    const back = new URL(r.headers.get('location') || 'http://x/');
    return { login, cookie, consent, status: r.status, back, verifier, state, nonce, code: back.searchParams.get('code') };
  }
  const body = g => ({ code: g.code, clientId: 'brickduel-bff-staging', redirectUri: REDIRECT, state: g.state, nonce: g.nonce, codeVerifier: g.verifier });
  const claims = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
  const signed = t => { const [h, p, s] = t.split('.'); return crypto.verify(null, Buffer.from(h + '.' + p), publicKey, Buffer.from(s, 'base64url')); };
  const swap = v => { process.env.TID_SWITCH = v; };

  // health and keys
  let r = await fetch(base + '/health'), j = await r.json();
  ok(r.status === 200 && j.test === true && j.switch === 'none' && j.iss === base, 'health shows a test issuer and no switch');
  r = await fetch(base + '/.well-known/jwks.json'); j = await r.json();
  ok(j.keys.length === 1 && j.keys[0].kid === 'tidaccept01' && j.keys[0].crv === 'Ed25519' && !('d' in j.keys[0]), 'JWKS has the one public key and no private part');

  // a bad authorize request is refused
  r = await fetch(base + '/oauth/authorize?client_id=brickduel-bff&redirect_uri=' + encodeURIComponent(REDIRECT) + '&response_type=code&code_challenge=x&code_challenge_method=S256&state=s&nonce=n');
  ok(r.status === 400, 'another client id is refused');
  r = await fetch(base + '/oauth/authorize?client_id=brickduel-bff-staging&redirect_uri=' + encodeURIComponent('https://evil.example/api/auth/callback') + '&response_type=code&code_challenge=x&code_challenge_method=S256&state=s&nonce=n');
  ok(r.status === 400, 'another callback is refused');

  // the normal flow: buttons (no password), consent, back with iss/state/code, a token with the right claims
  let g = await grant('one@test.invalid', 'allow');
  ok(/name="account" value="one@test.invalid"/.test(g.login) && !/type="password"/.test(g.login), 'deployed accounts are picked with a button, no password field');
  ok(/name="decision" value="allow"/.test(g.consent) && /name="decision" value="deny"/.test(g.consent), 'consent page has allow and deny');
  ok(g.status === 303 && g.back.origin + g.back.pathname === REDIRECT && g.back.searchParams.get('iss') === base && g.back.searchParams.get('state') === g.state, '303 back to the one callback with iss and state');
  ok(/^[A-Za-z0-9_-]{43}$/.test(g.code || ''), 'the code is 43 characters (what cube2 expects)');
  r = await post('/oauth/token', body(g)); j = await r.json();
  const c1 = claims(j.access_token);
  ok(r.status === 200 && signed(j.access_token) && c1.sub === SUB1 && c1.nonce === g.nonce && c1.aud === 'snowrealm:brickduel:api' && c1.iss === base && c1.exp - c1.iat === 300, 'token is signed and carries sub, nonce, aud, iss, 5 minutes');
  r = await post('/v1/token/status', { token: j.access_token }); j = await r.json();
  ok(r.status === 200 && j.active === true, 'status: active with the switch off');

  // refusals
  r = await post('/oauth/token', body(g), 'wrong-secret-wrong-secret-wrong-secret'); ok(r.status === 401, 'token: wrong client secret 401');
  r = await post('/oauth/token', body(g), null); ok(r.status === 401, 'token: no client secret 401');
  r = await post('/oauth/token', Object.assign(body(g), { codeVerifier: crypto.randomBytes(32).toString('base64url') })); ok(r.status === 400, 'token: wrong PKCE verifier 400');
  r = await post('/oauth/token', Object.assign(body(g), { nonce: 'other' })); ok(r.status === 400, 'token: a nonce that is not the grant\'s 400');
  r = await post('/oauth/token', Object.assign(body(g), { code: 'A'.repeat(43) })); ok(r.status === 400, 'token: a made-up code 400');
  r = await post('/v1/token/status', {}, 'wrong-secret-wrong-secret-wrong-secret'); ok(r.status === 401, 'status: wrong client secret 401');
  r = await form('/oauth/authorize?x=1', 'email=one%40test.invalid'); ok(r.status === 401, 'an email without a password is not a login');
  r = await form('/oauth/authorize?x=1', 'account=nobody%40test.invalid'); ok(r.status === 401, 'an unknown account is not a login');
  r = await form('/oauth/authorize', 'c=forged.value&decision=allow'); ok(r.status === 400, 'a forged consent blob is refused');
  g = await grant('two@test.invalid', 'deny');
  ok(g.back.searchParams.get('error') === 'access_denied' && !g.back.searchParams.get('code'), 'deny returns access_denied and no code');

  // B4: no nonce
  swap('B4'); g = await grant('two@test.invalid', 'allow');
  r = await fetch(base + '/health'); ok((await r.json()).switch === 'B4', 'health shows B4');
  r = await post('/oauth/token', body(g)); j = await r.json();
  ok(r.status === 200 && signed(j.access_token) && !('nonce' in claims(j.access_token)) && claims(j.access_token).sub === SUB2, 'B4: a validly signed token with no nonce');
  // B5: another nonce
  swap('B5'); g = await grant('two@test.invalid', 'allow');
  r = await post('/oauth/token', body(g)); j = await r.json();
  ok(r.status === 200 && signed(j.access_token) && typeof claims(j.access_token).nonce === 'string' && claims(j.access_token).nonce !== g.nonce, 'B5: a validly signed token with another nonce');
  // B9: revoked
  swap('B9'); g = await grant('two@test.invalid', 'allow');
  r = await post('/oauth/token', body(g)); j = await r.json();
  ok(claims(j.access_token).nonce === g.nonce, 'B9: the token itself is normal');
  r = await post('/v1/token/status', { token: j.access_token }); j = await r.json();
  ok(r.status === 200 && j.active === false, 'B9: status says active:false');
  // B10: unavailable
  swap('B10'); r = await post('/v1/token/status', {}); ok(r.status === 503, 'B10: status answers 503');
  // anything else is off
  swap('B11'); r = await fetch(base + '/health'); ok((await r.json()).switch === 'none', 'an unknown switch value is off');
  r = await post('/v1/token/status', {}); j = await r.json(); ok(r.status === 200 && j.active === true, 'with no switch status is active again');

  srv.close();
  console.log((fail ? 'FAIL ' : '') + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
