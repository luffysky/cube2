'use strict';
// Friends in real browsers through tools/dev-server.js: a request by code, agreeing, the red dot, who is online, an
// invitation into a 轉磚 room that the friend joins from the card, removing a friend (asked twice), the friend link,
// nothing under 13, and the same invitations for 地城小隊 from its lobby.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8804, BASE = 'http://127.0.0.1:' + PORT + '/';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };
  const open = async (name, q, store) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'zh-TW' });
    if (store) await ctx.addInitScript(s => { if (!window.__seed) { for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); window.__seed = 1; } }, store);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(name + ': ' + e.message));
    await page.goto(BASE + 'index.html?sw=off&lang=zh-Hant' + (q || '')); await sleep(400);
    for (let i = 0; i < 60 && !(await page.evaluate(() => ZZ.Cloud.on)); i++) await sleep(100);
    await page.evaluate(n => { ZZ.Meta.setName(n); return ZZ.Cloud.ensure(); }, name);
    await until(() => page.evaluate(() => !!ZZ.Cloud.cred && !!ZZ.Cloud.pub), 8000);
    await page.evaluate(() => ZZ.Cloud.flush());
    return page;
  };
  const card = p => p.evaluate(() => document.getElementById('sheetCard').textContent);
  try {
    const A = await open('阿明'), B = await open('小華');
    const codeA = await A.evaluate(() => ZZ.Cloud.pub.toUpperCase());
    // ---------- A's code; B asks ----------
    await A.click('.menu-foot [data-sheet="friends"]');
    ok(await until(() => A.evaluate(c => ZZ.peek().sheet === 'friends' && document.getElementById('frMine').textContent === c, codeA), 6000), 'the friends sheet shows my friend code', codeA);
    await B.evaluate(() => ZZ.App.openSheet('friends'));
    await B.fill('#frCode', codeA.slice(0, 4).toLowerCase() + ' ' + codeA.slice(4));
    await B.click('[data-do="frAdd"]');
    ok(await until(async () => /已送出給 阿明/.test(await card(B)), 6000), 'B sends a request by code (lower case and a space are fine)', await card(B));
    ok(await until(async () => /等對方同意/.test(await card(B)), 4000), 'B sees it waiting');
    // ---------- A sees it, with a red dot, and agrees ----------
    await A.evaluate(() => ZZ.App.closeSheet());
    await A.evaluate(() => ZZ.App.friendsRefresh(false));
    ok(await until(() => A.evaluate(() => !document.getElementById('frDot').hidden), 6000), 'a red dot by 好友 for the request');
    await A.click('.menu-foot [data-sheet="friends"]');
    ok(await until(async () => /想加你為好友/.test(await card(A)) && /小華/.test(await card(A)), 6000), 'A sees who asked');
    await A.click('[data-fradd]');
    ok(await until(async () => /你和 小華 成為好友了/.test(await card(A)), 6000), 'agreeing makes them friends');
    ok(await A.evaluate(() => document.getElementById('frDot').hidden), 'the red dot goes');
    await B.evaluate(() => ZZ.App.friendsRefresh(true));
    ok(await until(async () => /好友（1）/.test(await card(B)) && /在線上/.test(await card(B)) && /阿明/.test(await card(B)), 6000), 'B has A as a friend, online', await card(B));
    await A.screenshot({ path: path.join(OUT, 'friends.png') });
    // ---------- A opens a room and invites B; B joins from the card ----------
    await A.evaluate(() => { ZZ.App.closeSheet(); ZZ.App.openSheet('online'); ZZ.Net.open('阿明'); });
    ok(await until(() => A.evaluate(() => ZZ.Net.state === 'waiting' && !!document.querySelector('[data-do="frOpen"]')), 8000), 'a room waiting for players has 邀請好友');
    await A.click('[data-do="frOpen"]');
    ok(await until(async () => /你在房間/.test(await card(A)) && !!(await A.$('[data-frinv]')), 6000), 'the friends sheet offers to invite into the room');
    await A.click('[data-frinv]');
    ok(await until(() => A.evaluate(() => /已邀請 小華/.test(document.getElementById('toast').textContent + document.getElementById('mtoast').textContent)), 4000), 'the invitation is sent');
    await B.evaluate(() => { ZZ.App.closeSheet(); return ZZ.App.friendsRefresh(false); });
    ok(await until(() => B.evaluate(() => { const c = document.querySelector('.frcard'); return c && !c.hidden && /阿明 邀你一起玩轉磚/.test(c.textContent); }), 6000), 'B gets a card: 阿明 invites you');
    await B.screenshot({ path: path.join(OUT, 'friends-invite.png') });
    await B.click('.frcard [data-k="join"]');
    ok(await until(() => A.evaluate(() => ZZ.Net.count() === 2), 12000), 'one tap and B is in A\'s room');
    ok(await B.evaluate(() => document.querySelector('.frcard').hidden), 'the card goes away');
    await A.evaluate(() => ZZ.Net.leave()); await B.evaluate(() => ZZ.Net.leave());
    // ---------- removing a friend asks once more ----------
    await A.evaluate(() => { ZZ.App.closeSheet(); ZZ.App.openSheet('friends'); });
    await until(async () => !!(await A.$('[data-frdrop]')), 4000);
    await A.click('[data-frdrop]');
    ok(await until(async () => /確定移除？/.test(await card(A)), 3000), 'remove asks to be sure');
    await A.click('[data-frdrop]');
    ok(await until(async () => /好友（0）/.test(await card(A)), 6000), 'then the friend is gone');
    await B.evaluate(() => { ZZ.App.closeSheet(); ZZ.App.openSheet('friends'); return ZZ.App.friendsRefresh(true); });
    ok(await until(async () => /好友（0）/.test(await card(B)), 6000), 'from both lists', await card(B));
    // ---------- a friend link fills in the code ----------
    const C = await open('阿土', '&friend=' + codeA);
    ok(await until(() => C.evaluate(c => ZZ.peek().sheet === 'friends' && document.getElementById('frCode').value === c, codeA), 6000), 'a friend link opens the sheet with the code filled in');
    // ---------- under 13: none of it ----------
    const K = await open('小小', '', { 'zhuanzhuan.consent.v1': { v: 2, at: 1, fonts: false, age: 'u13', region: 'tw', ask: false } });
    await K.evaluate(() => ZZ.App.openSheet('friends'));
    ok(/未滿 13 歲不能加好友/.test(await card(K)) && !(await K.$('#frCode')), 'under 13 the sheet only says why');
    // ---------- 地城小隊: invite a friend from the lobby; the friend joins from the card ----------
    const D = await open('勇者'), E = await open('法法');
    const codeD = await D.evaluate(() => ZZ.Cloud.pub);
    await E.evaluate(c => ZZ.Cloud.rpc({ a: 'frAdd', p: c }), codeD);
    await D.evaluate(c => ZZ.Cloud.rpc({ a: 'frAdd', p: c }), await E.evaluate(() => ZZ.Cloud.pub));
    await D.goto(BASE + 'games/dungeon/index.html?lang=zh-Hant'); await E.goto(BASE + 'games/dungeon/index.html?lang=zh-Hant'); await sleep(600);
    await D.click('#open');
    ok(await until(() => D.evaluate(() => { const b = document.getElementById('frBox'); return DGPage.screen() === 'lobby' && !b.hidden && /法法/.test(b.textContent); }), 8000), 'the 地城小隊 lobby lists friends to invite');
    await D.click('#frList [data-frinv]');
    ok(await until(() => D.evaluate(() => /已邀請/.test(document.getElementById('frList').textContent)), 6000), 'the invitation is sent from the lobby');
    await E.evaluate(() => DGPage.friends());
    ok(await until(() => E.evaluate(() => { const c = document.getElementById('invCard'); return !c.hidden && /勇者 邀你一起玩地城小隊/.test(c.textContent); }), 6000), 'the friend on the 地城小隊 page sees the invitation');
    await E.click('#invCard [data-invjoin]');
    ok(await until(() => D.evaluate(() => DGPage.lobby().length === 2), 10000), 'and joins with one tap');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  srv.kill();
  console.log('friends checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
