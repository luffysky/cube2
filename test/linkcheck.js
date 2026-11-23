'use strict';
// A local rehearsal of tools/joint-link-check.js: the real cube2 API (tools/dev-server.js, in-memory database) as a
// staging setup, against test/fixtures/mock-identity-v4.js standing in for cube1 Identity staging v4. This is not
// the staging acceptance; it shows the tool walks the whole flow and judges it right before cube1 runs it for real.
const { spawn } = require('child_process');
const path = require('path');
const MOCK = 8791, APP = 8792;
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 900) : ''); } }
const up = (args, env) => { const s = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], env: Object.assign({}, process.env, env || {}) }); return new Promise(r => s.stdout.once('data', () => r(s))); };
(async () => {
  const secret = 's'.repeat(48), redirect = 'http://127.0.0.1:' + APP + '/api/auth/callback';
  const mock = await up([path.join(__dirname, 'fixtures', 'mock-identity-v4.js'), String(MOCK)], { MOCK_CLIENT_SECRET: secret, MOCK_REDIRECT: redirect });
  const iss = 'http://127.0.0.1:' + MOCK;
  const app = await up([path.join(__dirname, '..', 'tools', 'dev-server.js'), String(APP)], {
    IDENTITY_ISSUER: iss, IDENTITY_JWKS_URL: iss + '/.well-known/jwks.json', IDENTITY_AUDIENCE: 'snowrealm:brickduel:api', IDENTITY_LINK_ENABLED: '1',
    IDENTITY_STAGING: '1', IDENTITY_STAGING_REDIRECT: redirect, IDENTITY_STAGING_CLIENT_SECRET: secret, IDENTITY_AUTHORIZE_URL: iss + '/oauth/authorize',
    IDENTITY_ALLOW_HTTP_FOR_TESTS: '1', BRICKDUEL_ADMIN_TEST_TRUST: '1'
  });
  const run = env => new Promise(r => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'joint-link-check.js')], { env: Object.assign({}, process.env, { CHROME_PATH: '/usr/bin/google-chrome' }, env), stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; p.stdout.on('data', c => { out += c; }); p.on('close', code => r({ code, out }));
  });
  const accounts = { ACCOUNT1_EMAIL: 'one@example.test', ACCOUNT1_PASSWORD: 'pw-one-local', ACCOUNT2_EMAIL: 'two@example.test', ACCOUNT2_PASSWORD: 'pw-two-local' };
  try {
    let r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP }, accounts));
    let rep = null; try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
    ok(rep, 'the tool prints a JSON report', r.out.slice(0, 400));
    const got = {}; (rep ? rep.cases : []).forEach(c => { got[c.id] = c; });
    // the local dev server answers dbSource 'test', so the preflight stops: run once more with that accepted below
    ok(got.B0 && got.B0.result === 'FAIL' && /dbSource is test/.test(got.B0.note) && r.code === 2, 'the preflight refuses anything but the staging database', got.B0);
    r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP, LINKCHECK_ALLOW_DBSOURCE: 'test' }, accounts));
    try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
    (rep ? rep.cases : []).forEach(c => { got[c.id] = c; });
    for (const id of ['B1', 'B2', 'B6', 'B3', 'B8', 'B11', 'B12']) ok(got[id] && got[id].result === 'PASS', id + ' passes against the stand-in', got[id] || (rep && (rep.error || rep.stopped)));
    for (const id of ['B4', 'B5', 'B9', 'B10', 'B7']) ok(got[id] && got[id].result === 'MANUAL', id + ' is listed for cube1 to do by hand', got[id]);
    ok(r.code === 0, 'exit 0 when nothing failed', r.code);
    ok(!/pw-one-local|pw-two-local|Bearer [A-Za-z0-9]|code=[A-Za-z0-9_-]{20}|"key":/.test(r.out) && !r.out.includes(secret), 'the report holds no password, token, code, key or secret');
    // a wrong password is a failure, not a pass
    r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP, LINKCHECK_ALLOW_DBSOURCE: 'test' }, accounts, { ACCOUNT1_PASSWORD: 'wrong' }));
    try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
    const b1 = rep && rep.cases.find(c => c.id === 'B1');
    ok(b1 && b1.result === 'FAIL' && b1.got === 'login-failed' && r.code === 1, 'a bad password shows as a failed login', b1);
    ok(!/wrong/.test(r.out), 'and is not printed');
    // one case at a time
    r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP, LINKCHECK_ALLOW_DBSOURCE: 'test', CASES: 'B8,b11' }, accounts));
    try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
    ok(rep && rep.cases.map(c => c.id).join() === 'B0,B8,B11' && rep.cases.every(c => c.result === 'PASS'), 'CASES runs only the cases named', rep && rep.cases.map(c => c.id + ' ' + c.result));
    // cube1's switches, done here by the stand-in: each gives its own refusal and links nothing
    for (const [id, want] of [['B4', 'token'], ['B5', 'token'], ['B9', 'revoked'], ['B10', 'unavailable']]) {
      await fetch('http://127.0.0.1:' + MOCK + '/__switch?c=' + id, { method: 'POST' });
      r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP, LINKCHECK_ALLOW_DBSOURCE: 'test', SWITCH: id, SWITCH_NOTE: 'on 12:00-12:05Z' }, accounts));
      try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
      const c = rep && rep.cases.find(x => x.id === id);
      ok(c && c.result === 'PASS' && c.got === want && /12:00-12:05Z/.test(c.note) && r.code === 0 && rep.cases.length === 2, id + ' with the switch on: ' + want + ', nothing linked', c || (rep && (rep.error || rep.stopped)));
    }
    await fetch('http://127.0.0.1:' + MOCK + '/__switch?c=', { method: 'POST' });
    r = await run(Object.assign({ STAGING_URL: 'http://127.0.0.1:' + APP, LINKCHECK_ALLOW_DBSOURCE: 'test', SWITCH: 'B4' }, accounts));
    try { rep = JSON.parse(r.out); } catch (e) { rep = null; }
    ok(rep && rep.cases.find(x => x.id === 'B4').result === 'FAIL' && r.code === 1, 'a switch that is not really on shows as a failure (the link went through)', rep && rep.cases);
    r = await run(Object.assign({ STAGING_URL: 'https://brickduel.snowrealm.pet' }, accounts));
    ok(r.code === 2 && /production host/.test(r.out), 'the production host is refused before anything runs');
  } catch (e) { fail++; console.log('CRASH', e); }
  mock.kill(); app.kill();
  console.log('link check rehearsal: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
