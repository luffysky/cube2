'use strict';
// Keeping the recovery code with the player's own email (server/mail.js): off without its settings, the address
// proven first, limits, the kept copy locked, mailed back only to the proven address. Mail is caught here, never sent.
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const mail = require('../server/mail.js');
const { make } = require('../tools/pglite-db.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
let now = Date.UTC(2026, 10, 22, 1, 0, 0);
app.setClock(() => now);
const pg = make(); dbm.use(pg);
const sent = []; let mailDown = false;
mail.setSend(async (url, o) => { if (mailDown) return { status: 500 }; sent.push({ url, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { status: 200 }; });
function call(name, o) {
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'POST'; req.url = '/api/' + name;
    req.headers = Object.assign({ host: 'game.test', 'x-real-ip': '203.0.113.' + (1 + Math.floor(Math.random() * 250)) }, o.headers || {});
    if (o.body !== undefined) { const t = JSON.stringify(o.body); req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(t)); req.push(t); }
    req.push(null);
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); }, end(t) { let json = null; try { json = JSON.parse(t); } catch (e) { /* none */ } resolve({ status: this.statusCode, json }); } };
    app.handle(name, req, res);
  });
}
const rpc = (body, c) => call('rpc', { body, headers: c ? { authorization: 'Bearer ' + c.id + '.' + c.key } : {} });
const CODE = 'ABCD-EFGH-JKLM-NPQR-STUV';
const pinOf = () => /(\d{6})/.exec(sent[sent.length - 1].body.text)[1];
(async () => {
  const P = { }, r0 = await rpc({ a: 'hello' }); P.id = r0.json.id; P.key = r0.json.key;
  const Q = {}, r1 = await rpc({ a: 'hello' }); Q.id = r1.json.id; Q.key = r1.json.key;
  // off
  ok((await rpc({ a: 'mailStatus' }, P)).json.ready === false, 'without settings: not ready');
  eq((await rpc({ a: 'mailStart', email: 'a@example.com', code: CODE }, P)).status, 503, 'and nothing is sent');
  eq((await call('health', { method: 'GET' })).json.mail, false, 'health says mail is off');
  Object.assign(process.env, { RESEND_API_KEY: 're_test_key', MAIL_FROM: '轉磚 <no-reply@snowrealm.pet>', ESCROW_KEY: 'escrow-test-key-'.padEnd(40, 'e') });
  eq((await call('health', { method: 'GET' })).json.mail, true, 'with all three settings: on');
  eq((await rpc({ a: 'mailStatus' })).status, 401, 'only for a save\'s own device');
  // start
  eq((await rpc({ a: 'mailStart', email: 'not-an-email', code: CODE }, P)).json.why, 'email', 'a bad address is refused');
  eq((await rpc({ a: 'mailStart', email: 'a@example.com', code: 'short' }, P)).json.why, 'code', 'a bad recovery code is refused');
  let r = await rpc({ a: 'mailStart', email: 'alice.wang@example.com', code: CODE }, P);
  ok(r.json.ok && r.json.to === 'a***@example.com', 'a code is mailed; the address is shown hidden', r.json);
  ok(sent.length === 1 && sent[0].url === 'https://api.resend.com/emails' && sent[0].auth === 'Bearer re_test_key' && sent[0].body.to[0] === 'alice.wang@example.com' && /\d{6}/.test(sent[0].body.text) && sent[0].body.text.indexOf('ABCD') < 0, 'the verification mail has a six-digit code and not the recovery code', sent[0] && sent[0].body);
  ok((await rpc({ a: 'mailStatus' }, P)).json.kept === false, 'not kept until the address is proven');
  eq((await rpc({ a: 'mailRemind' }, P)).status, 404, 'nothing to mail back yet');
  // verify
  eq((await rpc({ a: 'mailVerify', pin: '000000' === pinOf() ? '111111' : '000000' }, P)).json.why, 'pin', 'a wrong code is refused');
  eq((await rpc({ a: 'mailVerify', pin: pinOf() }, Q)).status, 410, 'another save cannot use it');
  r = await rpc({ a: 'mailVerify', pin: pinOf() }, P);
  ok(r.json.ok && r.json.kept, 'the right code proves the address', r.json);
  r = await rpc({ a: 'mailStatus' }, P);
  ok(r.json.kept === true && r.json.to === 'a***@example.com', 'now kept', r.json);
  const row = JSON.stringify(await pg.query('SELECT * FROM zz.mailbox'));
  ok(row.indexOf('ABCDEFGH') < 0 && row.indexOf('ABCD-EFGH') < 0 && !/"pin":"\d{6}"/.test(row), 'the recovery code is stored locked, the pin only as a hash');
  eq((await rpc({ a: 'mailVerify', pin: pinOf() }, P)).status, 410, 'the code cannot be used twice');
  // remind
  r = await rpc({ a: 'mailRemind' }, P);
  ok(r.json.ok && r.json.to === 'a***@example.com' && /ABCD-EFGH-JKLM-NPQR-STUV/.test(sent[sent.length - 1].body.text) && sent[sent.length - 1].body.to[0] === 'alice.wang@example.com', 'the recovery code goes to the proven address', sent[sent.length - 1].body);
  eq((await rpc({ a: 'mailRemind' }, Q)).status, 404, 'another save gets nothing');
  // a new recovery code follows
  ok((await rpc({ a: 'mailSwap', code: 'ZZZZ-YYYY-XXXX-WWWW-VVVV' }, P)).json.kept === true, 'a new recovery code replaces the kept one');
  now += 2 * 3600000;
  await rpc({ a: 'mailRemind' }, P);
  ok(/ZZZZ-YYYY-XXXX-WWWW-VVVV/.test(sent[sent.length - 1].body.text), 'and the new one is what is mailed');
  ok((await rpc({ a: 'mailSwap', code: 'ZZZZ-YYYY-XXXX-WWWW-VVVV' }, Q)).json.kept === false, 'a save without an address keeps nothing');
  // a new address replaces the old only once proven
  await rpc({ a: 'mailStart', email: 'bob@example.org', code: 'ZZZZ-YYYY-XXXX-WWWW-VVVV' }, P);
  ok((await rpc({ a: 'mailStatus' }, P)).json.to === 'a***@example.com', 'an unproven new address does not replace the old');
  // tries and limits
  for (let i = 0; i < 5; i++) await rpc({ a: 'mailVerify', pin: '999999' === pinOf() ? '888888' : '999999' }, P);
  eq((await rpc({ a: 'mailVerify', pin: pinOf() }, P)).status, 410, 'after five wrong tries even the right code is refused');
  now += 16 * 60000;
  await rpc({ a: 'mailStart', email: 'bob@example.org', code: CODE }, P);
  const pinNow = pinOf(); now += 16 * 60000;
  eq((await rpc({ a: 'mailVerify', pin: pinNow }, P)).status, 410, 'after 15 minutes the code has run out');
  now += 2 * 3600000;
  let last;
  for (let i = 0; i < 5; i++) last = await rpc({ a: 'mailStart', email: 'bob@example.org', code: CODE }, P);
  eq(last.json.why, 'slow', 'more than three mails in an hour: slow');
  mailDown = true; now += 2 * 86400000;
  eq((await rpc({ a: 'mailRemind' }, P)).json.why, 'mail', 'the mail service failing says so');
  mailDown = false;
  for (const k of ['RESEND_API_KEY', 'MAIL_FROM', 'ESCROW_KEY']) delete process.env[k];
  console.log('mail tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
