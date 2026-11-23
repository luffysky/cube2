'use strict';
// "Connect to SnowRealm Games" on the page: hidden while the server has it off; when on, the buttons start the BFF
// (the page is sent to the portal address the server gives, with a session cookie), and coming back with ?auth=…
// cleans the address and says what happened. The portal and Identity are not called (none exist in the test).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8785;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
function server(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'], env: Object.assign({}, process.env, env || {}) });
  return new Promise(r => s.stdout.once('data', () => r(s)));
}
(async () => {
  const on = { IDENTITY_ISSUER: 'https://identity.test.example', IDENTITY_JWKS_URL: 'https://identity.test.example/.well-known/jwks.json', IDENTITY_AUDIENCE: 'snowrealm:brickduel:api', IDENTITY_LINK_ENABLED: '1', IDENTITY_BRICKDUEL_CLIENT_SECRET: 'x'.repeat(48),
    // the page is served from 127.0.0.1 here, so this runs as a staging setup pointed at it (tests only)
    IDENTITY_STAGING: '1', IDENTITY_STAGING_REDIRECT: 'http://127.0.0.1:' + (PORT + 1) + '/api/auth/callback', IDENTITY_STAGING_CLIENT_SECRET: 'y'.repeat(48), IDENTITY_AUTHORIZE_URL: 'https://games-staging.test.example/', IDENTITY_ALLOW_HTTP_FOR_TESTS: '1' };
  const s1 = await server(PORT), s2 = await server(PORT + 1, on);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    // off: nothing to press
    let p = await (await browser.newContext({ locale: 'zh-TW' })).newPage(); p.on('pageerror', e => problems.push(e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant'); await sleep(1200);
    await p.evaluate(() => ZZ.App.openSheet('srAccount')); await sleep(200);
    ok(await p.evaluate(() => !document.querySelector('[data-do="srLogin"],[data-do="srRecover"]') && /統一登入/.test(document.getElementById('sheetCard').textContent)), 'off: no sign-in button, the "coming" note instead');
    // on
    const ctx = await browser.newContext({ locale: 'zh-TW' });
    p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    const base = 'http://127.0.0.1:' + (PORT + 1) + '/index.html?sw=off&lang=zh-Hant';
    await p.goto(base); await sleep(1200);
    for (let i = 0; i < 40 && !(await p.evaluate(() => ZZ.Cloud.link)); i++) await sleep(100);
    ok(await p.evaluate(() => ZZ.Cloud.link === true), 'health says linking is on');
    await p.evaluate(() => ZZ.Cloud.ensure()); await sleep(600);
    await p.evaluate(() => { window.__went = null; ZZ.Cloud.go = u => { window.__went = u; }; ZZ.App.openSheet('srAccount'); }); await sleep(200);
    // a guest: one main "sign in" button; the plain link to the site comes later and says it signs nothing in
    ok(await p.evaluate(() => {
      const card = document.getElementById('sheetCard'), all = [...card.querySelectorAll('.btn')];
      const login = card.querySelector('[data-do="srLogin"]'), site = card.querySelector('a[data-sr="signup"]');
      return login && login.classList.contains('main') && /SnowRealm Games 帳號登入/.test(login.textContent) && site && !site.classList.contains('main') && all.indexOf(login) < all.indexOf(site)
        && /不會連結存檔/.test(card.textContent) && /繼續前往授權/.test(card.textContent) && /訪客/.test(card.textContent) && !card.querySelector('[data-do="srRecover"]');
    }), 'guest: "sign in with SnowRealm Games" is the main button; the site link comes later and says it does not link');
    ok(await p.evaluate(() => /登入/.test(document.querySelector('#menu [data-sheet="srAccount"]').textContent)), 'the menu says "sign in" for a guest');
    // signed in: says "linked to SnowRealm Games" in the sheet, the menu and the side panel, and offers to sign out
    await p.evaluate(() => { ZZ.Cloud.id = { linked: true, at: Date.UTC(2026, 10, 24) }; ZZ.App.srLabels(); ZZ.App.openSheet('srAccount'); }); await sleep(200);
    ok(await p.evaluate(() => {
      const card = document.getElementById('sheetCard'), h = card.querySelector('[data-sr="linked"]');
      return h && /已連結 SnowRealm Games/.test(h.textContent) && !card.querySelector('[data-do="srLogin"]') && !!card.querySelector('[data-do="srOutAsk"]') && /雲端/.test(card.textContent);
    }), 'linked: "已連結 SnowRealm Games", no sign-in button, a sign-out button');
    ok(await p.evaluate(() => [...document.querySelectorAll('[data-sheet="srAccount"]')].every(b => /已連結 SnowRealm Games/.test(b.textContent))), 'the menu and the side panel say "已連結 SnowRealm Games"');
    await p.click('[data-do="srOutAsk"]'); await sleep(200);
    ok(await p.evaluate(() => !!document.querySelector('#sheetCard [data-do="srOut"]') && /訪客/.test(document.getElementById('sheetCard').textContent)), 'signing out asks first and says the progress stays on the account');
    await p.evaluate(() => { ZZ.Cloud.id = null; ZZ.App.srLabels(); ZZ.App.openSheet('srAccount'); }); await sleep(200);
    ok(await p.evaluate(() => [...document.querySelectorAll('[data-sheet="srAccount"]')].every(b => /登入/.test(b.textContent) && !/已連結/.test(b.textContent))), 'and back to "sign in" when not linked');
    await p.click('[data-do="srLogin"]');
    let went = null;
    for (let i = 0; i < 40 && !went; i++) { went = await p.evaluate(() => window.__went); await sleep(100); }
    ok(went && /^https:\/\/games-staging\.test\.example\/\?sso=brickduel&client_id=brickduel-bff-staging&redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Fapi%2Fauth%2Fcallback/.test(went) && /code_challenge_method=S256/.test(went), 'link goes to the portal with the exact callback', went);
    const cookies = await ctx.cookies();
    const c = cookies.find(x => x.name === '__Host-zzauth');
    ok(c && c.httpOnly && c.secure && c.sameSite === 'Lax', 'a HttpOnly, Secure, Lax session cookie', cookies);
    ok(await p.evaluate(() => !/zzauth|verifier/.test(JSON.stringify(localStorage)) && document.cookie.indexOf('zzauth') < 0), 'nothing of it in localStorage or readable by the page');
    // coming back (here with an outcome that needs no Identity)
    await p.goto(base + '&auth=conflict'); await sleep(1500);
    ok(await p.evaluate(() => !/auth=/.test(location.search)), 'the address is cleaned at once');
    ok(await p.evaluate(() => /沒有合併|連結/.test((document.getElementById('mtoast').textContent + document.getElementById('toast').textContent))), 'and the page says what happened');
    await ctx.close();
  } catch (e) { fail++; console.log('CRASH', e); }
  ok(problems.length === 0, 'no page errors', problems);
  await browser.close(); s1.kill(); s2.kill();
  console.log('auth ui checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
