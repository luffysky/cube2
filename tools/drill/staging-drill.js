'use strict';
/* The staging drill over real HTTP (GitHub Actions, .github/workflows/staging-drill.yml).

   It talks to https://brickduel-staging.snowrealm.pet only, with Vercel's protection bypass from the repository
   secret STAGING_BYPASS (GitHub hides it in the log; this script never prints it, nor any device key or token).
   It stops at once unless /api/health says the staging database is in use, so it can never touch players' data.

   Part 1, P0-A: only results the server can replay pay coins (forged wins, blown-up scores, the same recording twice,
   another account's recording, two devices at once, levels), and every coin ledger adds up to its balance.
   Part 2, P1-A: the payment-notice receiver. It needs a signing key the receiver trusts, so it makes a throwaway one,
   prints the public half (DRILL_PUBLIC_JWKS) and waits until staging lists that key (health entitleKids, which only
   staging drills show); the private half stays in this job and is gone when it ends. */
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const BASE = 'https://brickduel-staging.snowrealm.pet';
const BYPASS = process.env.STAGING_BYPASS || '';
const PART = process.env.DRILL_PART || 'all';
const WAIT_MS = +(process.env.DRILL_WAIT_MS || 25 * 60000);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(id, pass, detail) { results.push({ id, result: pass ? 'PASS' : 'FAIL', detail }); console.log((pass ? 'PASS ' : 'FAIL ') + id + '  ' + JSON.stringify(detail).slice(0, 600)); }
async function call(p, o) {
  o = o || {};
  const headers = Object.assign({ 'x-vercel-protection-bypass': BYPASS }, o.headers || {});
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + p, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 80) }; }
  return { status: r.status, json };
}
const rpc = (body, c) => call('/api/rpc', { body, headers: c ? { authorization: 'Bearer ' + c.id + '.' + c.key } : {} });
let n = 0; const run = Date.now().toString(36);
const op = (k, a) => ({ i: 'd' + run + (++n), k, a: a || [] });
const sync = (c, ops) => rpc({ a: 'sync', ops }, c);
const coins = async c => (await sync(c, [])).json.st.coins;
const ledger = async c => (await rpc({ a: 'ledger' }, c)).json;
async function hello() { const r = await rpc({ a: 'hello' }); if (!r.json || !r.json.ok) throw new Error('hello ' + r.status); return { id: r.json.id, key: r.json.key }; }

// ---------- part 1: coins only for what the server can replay ----------
async function p0a() {
  const TAPE = require(path.join(__dirname, '..', '..', 'test', 'tape.js'));
  const base = 700000 + crypto.randomInt(200000);
  const real = TAPE.fin('ai', { seed: base + 1, ms: 30000 }), twin = TAPE.fin('ai', { seed: base + 4, ms: 30000 });
  const lost = TAPE.fin('ai', { seed: base + 3, ms: 30000, garbage: 6, level: 0 });
  const score = TAPE.fin('ai', { seed: base + 5, ms: 30000 }), lines = TAPE.fin('ai', { seed: base + 6, ms: 30000 });
  const L1 = TAPE.level(1, { step: 250 + crypto.randomInt(60) }), par1 = TAPE.ZZ.Levels.level(1).par;
  const lostAsWin = [Object.assign({}, lost[0], { result: 1, ko: 0 }), lost[1]];
  const scoreUp = [Object.assign({}, score[0], { stats: Object.assign({}, score[0].stats, { score: score[0].stats.score * 50 + 99999 }) }), score[1]];
  const linesUp = [Object.assign({}, lines[0], { stats: Object.assign({}, lines[0].stats, { lines: lines[0].stats.lines + 25 }) }), lines[1]];
  const untaped = { mode: 'ai', result: 1, level: 9, ko: 9, ms: 120000, stats: { score: 999999 } };
  const A = await hello(), B = await hello(), C = await hello(), D = await hello();
  let c0 = await coins(A); const st0 = (await sync(A, [])).json.st;
  let r = await sync(A, [op('fin', [untaped])]), st = r.json.st;
  check('P0A-01 untaped casual win: recorded, 0 coins, 0 xp', r.status === 200 && r.json.res[0].ok && st.coins === c0 && (st.xp | 0) === (st0.xp | 0) && st.tot.games === st0.tot.games + 1, { status: r.status, res: r.json.res, dCoins: st.coins - c0 });
  r = await sync(A, [op('fin', [untaped, true]), op('lvl', [1, par1, null, true])]);
  check('P0A-02 page claims "proven": ignored', r.json.st.coins === c0 && !(r.json.st.lv && r.json.st.lv.stars), { res: r.json.res, dCoins: r.json.st.coins - c0 });
  r = await sync(A, [op('fin', [{ mode: 'rank', result: 1, level: 9, ko: 9, ms: 120000, stats: { score: 999999 } }])]);
  check('P0A-03 ranked win with no recording: refused', r.json.res[0].ok === false && r.json.res[0].why === 'proof', r.json.res);
  r = await sync(A, [op('fin', real)]);
  const paid = r.json.st.coins - c0;
  check('P0A-04 real recording: pays', r.json.res[0].ok && paid > 0, { res: r.json.res, paid });
  c0 = r.json.st.coins;
  r = await sync(A, [op('fin', real)]);
  check('P0A-05 same recording again (new op id): nothing', r.json.st.coins === c0, { res: r.json.res, d: r.json.st.coins - c0 });
  const b0 = await coins(B);
  r = await sync(B, [op('fin', real)]);
  check('P0A-06 another account, same recording: nothing', r.json.res[0].ok && r.json.st.coins === b0, { res: r.json.res, d: r.json.st.coins - b0 });
  const k0 = await coins(C);
  r = await sync(C, [op('fin', lostAsWin)]);
  check('P0A-07 lost match reported as a win: nothing', r.json.st.coins === k0 && lost[0].koOpp > 0, { res: r.json.res, d: r.json.st.coins - k0, kos: lost[0].koOpp });
  r = await sync(C, [op('fin', scoreUp)]);
  check('P0A-08 score blown up: nothing', r.json.st.coins === k0, { res: r.json.res, d: r.json.st.coins - k0 });
  r = await sync(C, [op('fin', linesUp)]);
  check('P0A-09 line count forged: nothing', r.json.st.coins === k0, { res: r.json.res, d: r.json.st.coins - k0 });
  const code = await rpc({ a: 'code' }, D), red = await rpc({ a: 'redeem', code: code.json.code, go: true });
  const D2 = { id: red.json.id, key: red.json.key };
  const d0 = await coins(D), l0 = await ledger(D);
  const both = await Promise.all([sync(D, [op('fin', twin)]), sync(D2, [op('fin', twin)])]);
  const d1 = await coins(D), l1 = await ledger(D);
  const finRows = l1.rows.filter(x => x.kind === 'fin').length - l0.rows.filter(x => x.kind === 'fin').length;
  check('P0A-10 two devices, one match, same moment: paid once', red.json.id === D.id && both.every(x => x.status === 200) && d1 > d0 && finRows === 1, { statuses: both.map(x => x.status), d: d1 - d0, newFinLedgerRows: finRows });
  const v0 = await coins(B);
  r = await sync(B, [op('lvl', [1, par1])]);
  check('P0A-11 level clear with no recording: refused', r.json.res[0].ok === false && r.json.res[0].why === 'proof', r.json.res);
  r = await sync(B, [op('lvl', [1, L1.pieces + 3, L1.tape])]);
  check('P0A-12 level recording with other piece count: refused', r.json.res[0].why === 'proof', r.json.res);
  r = await sync(B, [op('lvl', [1, L1.pieces, L1.tape])]);
  const lvPaid = r.json.st.coins - v0;
  check('P0A-13 level 1 with its real recording: first clear + stars', r.json.res[0].ok && lvPaid >= 20 && r.json.st.lv.stars.length === 1, { res: r.json.res, paid: lvPaid });
  r = await sync(B, [op('lvl', [1, L1.pieces, L1.tape])]);
  check('P0A-14 same level recording again: nothing', r.json.st.coins === v0 + lvPaid, { res: r.json.res });
  const a1 = await coins(A);
  r = await sync(A, [op('lvl', [1, L1.pieces, L1.tape])]);
  check('P0A-15 level recording from another account: nothing', r.json.res[0].ok === false && r.json.st.coins === a1, { res: r.json.res, d: r.json.st.coins - a1 });
  // the play log (2026-11-24): a brick game sent twice under two change ids, one dungeon run
  r = await sync(A, [op('mini', ['snake', 1, 300, 0, 60000, 'dr' + run]), op('play', ['dungeon', 'party2', 300000, 1, 'dg' + run])]);
  const r2 = await sync(A, [op('mini', ['snake', 1, 300, 0, 60000, 'dr' + run])]);
  check('P0A-16 the same brick game twice: done once', r.json.res.every(x => x.ok) && r2.json.res[0].dup === true, { first: r.json.res, again: r2.json.res });
  for (const [name, c] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
    const lg = await ledger(c);
    check('P0A-17 ledger sum == balance (' + name + ')', lg.ok && lg.sum === lg.coins, { coins: lg.coins, sum: lg.sum, entries: lg.n });
  }
}

// ---------- part 2: payment notices ----------
async function ent() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }), KID = 'drill-' + crypto.createHash('sha256').update(jwk.x).digest('base64url').slice(0, 12);
  console.log('DRILL_PUBLIC_JWKS ' + JSON.stringify({ keys: [{ kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid: KID, use: 'sig', alg: 'EdDSA' }] }));
  const t0 = Date.now();
  for (;;) {
    const h = await call('/api/health?drill=' + Date.now());
    if (h.json && Array.isArray(h.json.entitleKids) && h.json.entitleKids.indexOf(KID) >= 0) { console.log('staging trusts the drill key (build ' + h.json.build + ')'); break; }
    if (Date.now() - t0 > WAIT_MS) { check('ENT-00 staging trusts the drill key', false, 'timed out waiting'); return; }
    await sleep(20000);
  }
  const ISS = 'https://commerce-drill.brickduel-staging.test';
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (over, key) => {
    const sec = Math.floor(Date.now() / 1000);
    const data = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID }) + '.' + b64(Object.assign({ iss: ISS, aud: 'snowrealm:brickduel:entitlements', sub: 'svc:snowrealm-commerce', scope: 'entitlements:write', iat: sec, exp: sec + 300, jti: crypto.randomUUID() }, over || {}));
    return data + '.' + crypto.sign(null, Buffer.from(data), key || privateKey).toString('base64url');
  };
  const send = (body, tok, extra) => call('/internal/entitlements/v1/events', { body, headers: Object.assign({ authorization: 'Bearer ' + (tok === undefined ? token() : tok) }, extra || {}) });
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'), DAY = 86400000;
  const mem = (pid, tier, status, end, version) => ({ schema: 'snowrealm.entitlement.v1', eventId: crypto.randomUUID(), platformId: pid, game: 'brickduel', kind: 'membership', version, at: iso(Date.now()), membership: { tier, status, periodEnd: end ? iso(end) : null } });
  const ord = (pid, orderId, sku, status, version) => ({ schema: 'snowrealm.entitlement.v1', eventId: crypto.randomUUID(), platformId: pid, game: 'brickduel', kind: 'order', version, at: iso(Date.now()), order: { orderId, sku, status, platform: 'web' } });
  const P = crypto.randomUUID(), Q = crypto.randomUUID(), now = Date.now();
  const W = await hello(), w0 = await ledger(W);
  let e = mem(P, 'plus', 'active', now + 30 * DAY, 1);
  let r = await send(e, '');
  check('ENT-01 no token: 401', r.status === 401, r.status);
  r = await send(e, token({}, crypto.generateKeyPairSync('ed25519').privateKey));
  check('ENT-02 signed with another key: 401', r.status === 401, r.status);
  r = await send(e, token({ aud: 'snowrealm:games:save-sync' }));
  check('ENT-03 wrong audience: 401', r.status === 401, r.status);
  r = await send(e, token({ scope: 'save:write' }));
  check('ENT-04 wrong scope: 403', r.status === 403, r.status);
  r = await send(e, token({ iss: 'https://identity.snowrealm.pet' }));
  check('ENT-05 another issuer: 401', r.status === 401, r.status);
  r = await send(e, token(), { origin: 'https://evil.example' });
  check('ENT-06 with a browser Origin: 403', r.status === 403, r.status);
  const tk = token();
  r = await send(e, tk);
  check('ENT-07 Plus active v1: applied, waits for the link', r.status === 200 && r.json.result === 'applied' && r.json.save === 'link', r.json);
  r = await send(e, tk);
  check('ENT-08 the same token again: 401', r.status === 401, r.status);
  r = await send(e);
  check('ENT-09 same eventId, new token: duplicate', r.status === 200 && r.json.result === 'duplicate', r.json);
  r = await send(Object.assign({}, e, { membership: { tier: 'pro', status: 'active', periodEnd: iso(now + 99 * DAY) } }));
  check('ENT-10 same eventId, other content: 409', r.status === 409, r.status);
  r = await send(mem(P, 'plus', 'active', now + 30 * DAY, 1));
  check('ENT-11 another notice with an old version: stale', r.json.result === 'stale', r.json);
  e = mem(P, 'pro', 'active', now + 40 * DAY, 3);
  r = await send(e, token({ zzFault: 'after-record' }));
  check('ENT-12 drill after-record: 503', r.status === 503, r.status);
  r = await send(e);
  check('ENT-13 resend with a new token: applied', r.json.result === 'applied', r.json);
  const e4 = mem(P, 'pro', 'canceled', now + 40 * DAY, 4);
  r = await send(e4, token({ zzFault: 'after-record' }));
  check('ENT-14 drill after-record (no resend): 503', r.status === 503, r.status);
  await sleep(62000);   // past the 30 s wait, and into a new minute for the catch-up call
  const c = await call('/api/cron?only=sync');
  check('ENT-15 catch-up pass applies what was left', c.status === 200 && c.json.quick && c.json.entitlements && c.json.entitlements.applied >= 1, { status: c.status, entitlements: c.json.entitlements });
  r = await send(e4);
  check('ENT-16 a later resend finds it done: duplicate', r.json.result === 'duplicate', r.json);
  const c2 = await call('/api/cron?only=sync');
  check('ENT-17 catch-up again within the minute: 429', c2.status === 429, c2.status);
  r = await send(mem(P, 'pro', 'active', now + 50 * DAY, 5), token({ zzFault: 'deliver' }));
  check('ENT-18 drill deliver: applied, answer says retry', r.json.result === 'applied' && r.json.save === 'retry', r.json);
  e = mem(P, 'pro', 'active', now + 60 * DAY, 6);
  const five = (await Promise.all([0, 1, 2, 3, 4].map(() => send(e)))).map(x => x.json.result);
  check('ENT-19 five copies at once: one applied, four duplicate', five.filter(x => x === 'applied').length === 1 && five.filter(x => x === 'duplicate').length === 4, five);
  const pair = await Promise.all([send(mem(P, 'pro', 'active', now + 70 * DAY, 10)), send(mem(P, 'pro', 'active', now + 80 * DAY, 11))]);
  r = await send(mem(P, 'pro', 'active', now + 80 * DAY, 11));
  const r12 = await send(mem(P, 'pro', 'active', now + 90 * DAY, 12));
  check('ENT-20 v10 and v11 at once: ends at v11', pair.every(x => x.status === 200) && r.json.result === 'stale' && r12.json.result === 'applied', { pair: pair.map(x => x.json.result), v11again: r.json.result, v12: r12.json.result });
  const O = 'ord_drill_' + crypto.randomBytes(4).toString('hex');
  r = await send(ord(Q, O, 'brickduel.look.drill', 'succeeded', 1));
  check('ENT-21 order succeeded (nothing on sale): applied, nothing to hand over', r.json.result === 'applied' && r.json.save === 'nothing', r.json);
  r = await send(ord(Q, O, 'brickduel.look.drill', 'refunded', 2));
  check('ENT-22 refunded: applied', r.json.result === 'applied', r.json);
  r = await send(ord(Q, O, 'brickduel.look.drill', 'succeeded', 3));
  check('ENT-23 a later "succeeded" after the refund: stale', r.json.result === 'stale', r.json);
  const O2 = 'ord_drill_' + crypto.randomBytes(4).toString('hex');
  const race = await Promise.all([send(ord(Q, O2, 'brickduel.look.drill', 'refunded', 2)), send(ord(Q, O2, 'brickduel.look.drill', 'succeeded', 1))]);
  r = await send(ord(Q, O2, 'brickduel.look.drill', 'succeeded', 9));
  check('ENT-24 payment and refund racing, then newer "succeeded": stays refunded', race.every(x => x.status === 200) && r.json.result === 'stale', { race: race.map(x => x.json.result), after: r.json.result });
  r = await send(ord(P, O, 'brickduel.look.drill', 'refunded', 5));
  check('ENT-25 same order id for another account: 409', r.status === 409, r.status);
  const w1 = await ledger(W);
  check('ENT-26 wallet untouched; ledger sum == balance', w1.coins === w0.coins && w1.n === w0.n && w1.sum === w1.coins, { coins: [w0.coins, w1.coins], entries: [w0.n, w1.n] });
}

(async () => {
  if (!BYPASS) { console.log('STAGING_BYPASS is not set: nothing run'); process.exit(2); }
  // staging builds the same commit this job runs (pushed to main and to staging together): wait for it
  const want = String(process.env.GITHUB_SHA || '').slice(0, 7), t0 = Date.now();
  let h = await call('/api/health?drill=' + Date.now());
  while (want && process.env.DRILL_ANY_BUILD !== '1' && !(h.json && h.json.build === want) && Date.now() - t0 < 12 * 60000) {
    console.log('waiting for staging to run ' + want + ' (now ' + (h.json && h.json.build) + ', http ' + h.status + ')');
    await sleep(20000); h = await call('/api/health?drill=' + Date.now());
  }
  console.log('staging ' + JSON.stringify({ status: h.status, build: h.json && h.json.build, dbSource: h.json && h.json.dbSource, entitle: h.json && h.json.entitle, link: h.json && h.json.link }));
  if (h.status !== 200 || !h.json || h.json.dbSource !== 'staging') { console.log('not the staging database: stopped'); process.exit(3); }
  if (PART === 'all' || PART === 'p0a') await p0a();
  if (PART === 'all' || PART === 'ent') await ent();
  const pass = results.filter(x => x.result === 'PASS').length, failed = results.length - pass;
  console.log('staging drill (' + (h.json.build || '?') + '): ' + pass + ' PASS, ' + failed + ' FAIL');
  const sum = process.env.GITHUB_STEP_SUMMARY;
  if (sum) fs.appendFileSync(sum, '## staging drill ' + (h.json.build || '') + '\n\n| id | result |\n|---|---|\n' + results.map(x => '| ' + x.id + ' | ' + x.result + ' |').join('\n') + '\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', String(e && e.message || e).slice(0, 200)); process.exit(1); });
