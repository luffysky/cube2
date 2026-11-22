#!/usr/bin/env node
'use strict';
/* Joint acceptance B1–B12 (account linking) against cube2 staging, in a real browser (Playwright Chromium), run where
   the cube1 staging test accounts and the cube2 Vercel bypass are both at hand (cube1's GitHub Actions "staging"
   Environment). Nothing secret is printed or written: passwords, the bypass, codes, tokens, cookies and device keys
   stay in memory. The report has the case, UTC time, HTTP status, the outcome word, the check results and public
   save ids (pub) only.

   Environment variables (not arguments, so nothing lands in shell history):
     STAGING_URL          default https://brickduel-staging.snowrealm.pet (refuses the production host)
     VERCEL_BYPASS        cube2's "Protection Bypass for Automation" (empty when the site has no protection)
     ACCOUNT1_EMAIL, ACCOUNT1_PASSWORD, ACCOUNT2_EMAIL, ACCOUNT2_PASSWORD   the two cube1 staging test accounts
     EXPECT_BUILD         the cube2 commit staging should run (7 characters; checked first)
     B7=1                 also run B7 (waits 10.5 minutes)
     CHROME_PATH          a Chrome to use instead of Playwright's own Chromium (optional)

     node tools/joint-link-check.js > b-results.json

   Order: B1 → B2 → B6 → B3 → B8 → B11 → (B7) → B12. B4, B5, B9, B10 need cube1's own switches (a token without or
   with another nonce; a revoked token; a status endpoint that is down) and are listed as MANUAL. B13 was run on
   2026-11-22 and is not repeated. Account 2 is never linked to anything (it only meets conflict, the other browser
   and the cancel button), so a run can be repeated: each run makes new synthetic saves named staging-bN-xxxx. */
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/npm-tools/node_modules/playwright'); }

const BASE = (process.env.STAGING_URL || 'https://brickduel-staging.snowrealm.pet').replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const BYPASS = process.env.VERCEL_BYPASS || '';
const ACC = [1, 2].map(n => ({ n, email: process.env['ACCOUNT' + n + '_EMAIL'] || '', password: process.env['ACCOUNT' + n + '_PASSWORD'] || '' }));
const LONG = process.env.B7 === '1';
const report = { tool: 'joint-link-check', base: BASE, started: new Date().toISOString(), build: null, cases: [] };
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hide = s => String(s == null ? '' : s).replace(/Bearer \S+/g, 'Bearer [hidden]').replace(/[A-Za-z0-9_-]{40,}/g, '[hidden]')
  .replace(/(code|state|nonce|code_challenge|x-vercel-protection-bypass)=[^&\s"]+/g, '$1=[hidden]');
function record(id, want, got, checks, note) {
  const pass = got === want && checks.every(c => c[1]);
  report.cases.push({ id, at: now(), want, got, result: pass ? 'PASS' : 'FAIL', checks: checks.map(c => ({ check: c[0], ok: !!c[1] })), note: note ? hide(note) : undefined });
}
function manual(id, what) { report.cases.push({ id, at: now(), result: 'MANUAL', note: what }); }
function stop(why) { report.stopped = hide(why); finish(2); }
function finish(code) { report.finished = new Date().toISOString(); process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exit(code); }

(async () => {
  if (/^https:\/\/brickduel\.snowrealm\.pet$/.test(ORIGIN)) return stop('refused: the production host');
  if (ACC.some(a => !a.email || !a.password)) return stop('ACCOUNT1_EMAIL/PASSWORD and ACCOUNT2_EMAIL/PASSWORD are needed');
  const browser = await playwright.chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
  const devices = [];
  // one "device" = one browser profile: its own cookies (the BFF session, the identity session, the bypass)
  async function device() {
    const ctx = await browser.newContext({ locale: 'zh-TW' });
    const page = await ctx.newPage();
    const d = { ctx, page, callbacks: [], words: [], next: null };
    // The consent POST answers 303 to the cube2 callback. A redirect is not routable, so that POST is fetched here
    // without following, and the callback address is then opened as a navigation of its own (which is routable).
    await ctx.route('**/oauth/authorize**', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const resp = await route.fetch({ maxRedirects: 0 });
      const loc = resp.headers().location || '';
      if (loc.indexOf(ORIGIN + '/api/auth/callback') !== 0) return route.fulfill({ response: resp });
      d.next = loc;
      const headers = Object.assign({}, resp.headers()); delete headers.location; delete headers['content-length'];
      headers['content-type'] = 'text/html; charset=utf-8';
      await route.fulfill({ status: 200, headers, body: '<!doctype html><title>consent sent</title>' });
    });
    // The BFF callback answers 303 to /?auth=<outcome>. The callback is fetched here without following that redirect
    // (Playwright does not route a redirected navigation), its outcome word is read from Location, and the browser is
    // shown an empty page instead of the game, so the game does not read the one-time result before this tool does.
    // Set-Cookie from the callback still reaches the browser.
    await ctx.route(ORIGIN + '/api/auth/callback?**', async route => {
      d.callbacks.push(route.request().url());
      const resp = await route.fetch({ maxRedirects: 0 });
      const loc = resp.headers().location || '';
      const m = /[?&]auth=([a-z]+)/.exec(loc);
      d.words.push(m ? m[1] : 'http-' + resp.status());
      const headers = Object.assign({}, resp.headers()); delete headers.location; delete headers['content-length'];
      headers['content-type'] = 'text/html; charset=utf-8';
      await route.fulfill({ status: 200, headers, body: '<!doctype html><title>auth</title>' });
    });
    const first = BASE + '/api/health' + (BYPASS ? '?x-vercel-protection-bypass=' + encodeURIComponent(BYPASS) + '&x-vercel-set-bypass-cookie=true' : '');
    const res = await page.goto(first);
    if (!res || res.status() !== 200) throw new Error('staging did not answer 200 (' + (res && res.status()) + '); check VERCEL_BYPASS');
    devices.push(d);
    return d;
  }
  // a same-origin request from the device's page, so its cookies go along
  const api = (d, path, body, key, method) => d.page.evaluate(async ([path, body, key, method]) => {
    const h = { 'Content-Type': 'application/json' };
    if (key) h.Authorization = 'Bearer ' + key.id + '.' + key.key;
    const r = await fetch(path, { method: method || 'POST', headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}), credentials: 'same-origin', cache: 'no-store' });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, json: j };
  }, [path, body, key, method]);
  async function save(d, tag) {
    const r = await api(d, '/api/rpc', { a: 'hello', st: { name: ('staging-' + tag + '-' + Math.random().toString(36).slice(2, 6)).slice(0, 12) } });
    if (r.status !== 200 || !r.json || !r.json.ok) throw new Error('could not make a synthetic save (' + r.status + ')');
    return { id: r.json.id, key: r.json.key, pub: r.json.pub };
  }
  const linkedOf = async (d, key) => { const r = await api(d, '/api/rpc', { a: 'idStatus' }, key); return { status: r.status, linked: !!(r.json && r.json.linked) }; };
  // start → (identity) login → consent → callback → /?auth=<word>; then the one-time result. opts: { decision, onAuthorize }
  async function flow(d, intent, key, acc, opts) {
    opts = opts || {};
    const s = await api(d, '/api/auth/start', { intent }, intent === 'link' ? key : null);
    if (s.status !== 200 || !s.json || !s.json.url) return { start: s.status, outcome: 'start-' + s.status };
    const at = opts.other || d;      // B8: the authorize page is opened in another profile
    if (opts.wait) await sleep(opts.wait);
    await at.page.goto(s.json.url);
    if (await at.page.$('input[name="password"]')) {
      await at.page.fill('input[name="email"]', acc.email);
      await at.page.fill('input[name="password"]', acc.password);
      await Promise.all([at.page.waitForLoadState('load'), at.page.click('form button[type="submit"]')]);
      if (await at.page.$('input[name="password"]')) return { start: 200, outcome: 'login-failed' };
    }
    const btn = await at.page.$('button[name="decision"][value="' + (opts.decision || 'allow') + '"]');
    if (!btn) return { start: 200, outcome: 'no-consent-page', note: (await at.page.title()) };
    at.next = null;
    await btn.click();
    for (let i = 0; i < 150 && !at.next; i++) await sleep(100);
    if (!at.next) return { start: 200, outcome: 'no-redirect-to-callback', note: await at.page.title() };
    const before = at.words.length;
    await at.page.goto(at.next);
    const word = at.words.length > before ? at.words[at.words.length - 1] : 'no-callback';
    if (opts.noResult) return { start: 200, outcome: word, callback: at.callbacks[at.callbacks.length - 1] };
    const res = await api(at, '/api/auth/result', {});
    return { start: 200, outcome: word, result: res.json || {}, resultStatus: res.status, callback: at.callbacks[at.callbacks.length - 1] };
  }

  try {
    // ---------- preflight ----------
    const X = await device();
    const h = await api(X, '/api/health?deep=1', null, null, 'GET');
    report.build = h.json && h.json.build;
    const bad = [];
    if (!h.json || h.json.link !== true) bad.push('link is not true');
    // (the local rehearsal, test/linkcheck.js, runs on an in-memory database: only on 127.0.0.1 may it say so)
    const okDb = ORIGIN.startsWith('http://127.0.0.1:') && process.env.LINKCHECK_ALLOW_DBSOURCE ? process.env.LINKCHECK_ALLOW_DBSOURCE : 'staging';
    if (!h.json || h.json.dbSource !== okDb) bad.push('dbSource is ' + (h.json && h.json.dbSource));
    if (process.env.EXPECT_BUILD && report.build !== process.env.EXPECT_BUILD) bad.push('build is ' + report.build + ', expected ' + process.env.EXPECT_BUILD);
    report.cases.push({ id: 'B0', at: now(), result: bad.length ? 'FAIL' : 'PASS', note: bad.join('; ') || 'link true, dbSource staging, build ' + report.build });
    if (bad.length) return stop('preflight failed: ' + bad.join('; '));

    // ---------- B1: account 1 links the save on device X ----------
    const p = await save(X, 'b1');
    let f = await flow(X, 'link', p, ACC[0]);
    const newKey = f.result && f.result.key ? { id: f.result.id, key: f.result.key } : null;
    const nowLinked = newKey ? await linkedOf(X, newKey) : { status: 0, linked: false };
    const oldKey = await linkedOf(X, p);
    record('B1', 'linked', f.outcome, [['result read once with a new device key', !!newKey && newKey.key !== p.key], ['the new key sees the save linked', nowLinked.linked], ['the old key no longer opens the save', oldKey.status === 401]], 'save ' + p.pub);
    const keyX = newKey || p;

    // ---------- B2: account 1 recovers it on device Y ----------
    const Y = await device();
    f = await flow(Y, 'recover', null, ACC[0]);
    const pubY = f.result && f.result.pub;
    record('B2', 'recovered', f.outcome, [['the same save (pub)', pubY === p.pub], ['a device key for Y', !!(f.result && f.result.key)]], 'got ' + (pubY || '-') + ', result HTTP ' + f.resultStatus + (f.result && f.result.why ? ' ' + f.result.why : ''));

    // ---------- B6: the same callback address opened again (before the page has read the result) ----------
    const Y6 = await device();
    f = await flow(Y6, 'recover', null, ACC[0], { noResult: true });
    if (f.outcome === 'recovered' && f.callback) {
      const before = Y6.words.length;
      await Y6.page.goto(f.callback);
      const word = Y6.words.length > before ? Y6.words[Y6.words.length - 1] : 'no-callback';
      const first = await api(Y6, '/api/auth/result', {});
      record('B6', 'replay', word, [['the first visit had recovered the save', f.outcome === 'recovered'], ['the result of the first visit is still the one read', first.status === 200 && first.json && first.json.pub === p.pub]]);
    } else record('B6', 'replay', 'first-visit-' + f.outcome, []);

    // ---------- B3: account 2 tries to link the save already linked to account 1 ----------
    const Z = await device();
    f = await flow(Z, 'link', keyX, ACC[1]);
    const stillX = await linkedOf(Z, keyX);
    const Z2 = await device();
    const none2 = await flow(Z2, 'recover', null, ACC[1]);
    record('B3', 'conflict', f.outcome, [['the save stays linked (to account 1)', stillX.linked], ['account 2 has no save (recover says none)', none2.outcome === 'none']]);

    // ---------- B8: started on one browser, finished on another ----------
    const X2 = await device(), Y2 = await device();
    const q = await save(X2, 'b8');
    f = await flow(X2, 'link', q, ACC[1], { other: Y2 });
    const qLinked = await linkedOf(X2, q);
    record('B8', 'session', f.outcome === 'state' ? 'session' : f.outcome, [['nothing was linked', !qLinked.linked]], 'outcome ' + f.outcome + ' (session or state both pass)');

    // ---------- B11: the player presses 拒絕 ----------
    const D11 = await device();
    const r = await save(D11, 'b11');
    f = await flow(D11, 'link', r, ACC[1], { decision: 'deny' });
    const rLinked = await linkedOf(D11, r);
    record('B11', 'denied', f.outcome, [['nothing was linked', !rLinked.linked]]);

    // ---------- B7: back after more than ten minutes ----------
    if (LONG) {
      const D7 = await device();
      const s7 = await save(D7, 'b7');
      f = await flow(D7, 'link', s7, ACC[1], { wait: 10.5 * 60000 });
      const s7Linked = await linkedOf(D7, s7);
      record('B7', 'expired', f.outcome, [['nothing was linked', !s7Linked.linked]]);
    } else manual('B7', 'run again with B7=1 (waits 10.5 minutes between start and consent)');

    // ---------- B12: account 1's save deleted, then restored within 30 days ----------
    const del = await api(X, '/api/rpc', { a: 'delete' }, keyX);
    const W = await device();
    f = await flow(W, 'restore', null, ACC[0]);
    const back = f.result && f.result.key ? await linkedOf(W, { id: f.result.id, key: f.result.key }) : { status: 0, linked: false };
    record('B12', 'recovered', f.outcome, [['the delete was accepted first', del.status === 200], ['the same save (pub)', f.result && f.result.pub === p.pub], ['usable and still linked after restoring', back.status === 200 && back.linked]]);

    manual('B4', 'cube1: have /oauth/token return a validly signed token with no nonce once; expect auth=token and the cube2 log "[zz] auth token (nonce)"');
    manual('B5', 'cube1: the same with a different nonce; expect auth=token, log "(nonce)"');
    manual('B9', 'cube1: revoke the token between exchange and status; expect auth=revoked, log "(status 200)" or "(status 401)"');
    manual('B10', 'cube1: make /v1/token/status answer 503 or time out; expect auth=unavailable, log "(status 503)" or "(status fetch failed)"');
  } catch (e) {
    report.error = hide(e && e.message ? e.message : e);
  } finally {
    for (const d of devices) await d.ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  finish(report.error || report.cases.some(c => c.result === 'FAIL') ? 1 : 0);
})();
