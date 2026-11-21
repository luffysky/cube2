'use strict';
// A member's own music and pictures uploaded to the cloud (R2), in a real browser against tools/dev-server.js with
// stand-in R2 keys. The bucket itself is played by the test: requests to the signed addresses are caught and kept.
// Upload after adding a file, then (as if on another device) the local copies are gone and "get from the cloud"
// brings them back. Without the keys the cloud choice stays off.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8783, URL = 'http://127.0.0.1:' + PORT + '/index.html?sw=off&lang=zh-Hant';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
function wav() {
  const n = 8000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2);
  return b;
}
(async () => {
  const OUTBOX = path.join(require('os').tmpdir(), 'zz-r2-outbox-' + process.pid + '.jsonl');
  try { require('fs').unlinkSync(OUTBOX); } catch (e) { /* none yet */ }
  const env = Object.assign({}, process.env, { R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDTEST', R2_SECRET_ACCESS_KEY: 'SECRETTEST', R2_BUCKET: 'zzb',
    RESEND_API_KEY: 're_test', MAIL_FROM: 'test <t@example.com>', ESCROW_KEY: 'e'.repeat(40), MAIL_TEST_OUTBOX: OUTBOX });
  const mails = () => { try { return require('fs').readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'], env });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [], bucket = {};
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 420, height: 860 } });
    await ctx.route(/r2\.cloudflarestorage\.com/, async route => {
      const req = route.request(), key = new globalThis.URL(req.url()).pathname, okSig = /X-Amz-Signature=[0-9a-f]{64}/.test(req.url());
      if (!okSig) return route.fulfill({ status: 403, body: 'no' });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT', 'Access-Control-Allow-Headers': 'content-type' } });
      if (req.method() === 'PUT') { bucket[key] = { body: req.postDataBuffer(), type: req.headers()['content-type'] }; return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' }); }
      const f = bucket[key];
      return f ? route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': f.type }, body: f.body }) : route.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    await p.goto(URL); await sleep(500);
    for (let i = 0; i < 60 && !(await p.evaluate(() => ZZ.Cloud.on && ZZ.Cloud.files)); i++) await sleep(100);
    await p.evaluate(() => ZZ.Cloud.ensure()); await sleep(500);
    await p.evaluate(() => { ZZ.Meta.subscribe(); ZZ.Cloud.flush && ZZ.Cloud.flush(); }); await sleep(1200);
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(300);
    ok(await p.evaluate(() => { const c = document.querySelector('[data-dswhere="music:cloud"]'); return c && !c.disabled; }), 'with uploads on, a member can choose the cloud');
    await p.click('[data-dswhere="music:cloud"]'); await sleep(200);
    ok(await p.evaluate(() => !!document.querySelector('[data-do="muPull"]')), 'and gets "get from the cloud"');
    await p.setInputFiles('#muFile', [{ name: '雲端的歌.wav', mimeType: 'audio/wav', buffer: wav() }]);
    ok(await (async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []; return o.length === 1 && !!o[0].cid; })) return true; await sleep(150); } return false; })(), 'the song is kept here and uploaded (it has a cloud id)');
    ok(Object.keys(bucket).length === 1 && /\/zzb\/u\/[0-9a-f-]{36}\/music\//.test(Object.keys(bucket)[0]), 'it landed in the bucket under the player\'s own folder', Object.keys(bucket));
    const first = bucket[Object.keys(bucket)[0]].body;
    ok(first.slice(0, 4).toString() === 'ZZE1' && first[4] === 115 && first.indexOf(Buffer.from('RIFF')) < 0 && first.indexOf(Buffer.from('WAVEfmt')) < 0, 'what reached the bucket is locked (mode s): no WAV inside to read', first.slice(0, 8));
    // as if on another device: nothing here any more
    await p.evaluate(() => new Promise(res => { const st = JSON.parse(localStorage.getItem('zhuanzhuan.music.v1')); st.own = []; st.list = []; localStorage.setItem('zhuanzhuan.music.v1', JSON.stringify(st)); const r = indexedDB.deleteDatabase('zhuanzhuan-music'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
    await p.reload(); await sleep(800);
    for (let i = 0; i < 60 && !(await p.evaluate(() => ZZ.Cloud.on && ZZ.Cloud.files)); i++) await sleep(100);
    await sleep(800);
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(300);
    ok(await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 0), 'nothing on this "new device" yet');
    await p.click('[data-do="muPull"]');
    ok(await (async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 1 && /雲端的歌/.test(document.getElementById('sheetCard').textContent))) return true; await sleep(150); } return false; })(), 'get from the cloud brings the song back');
    // removing it: gone here, waiting 30 days in "recently removed", and it can be brought back
    p.once('dialog', d => { ok(/30/.test(d.message()), 'the question says the cloud copy waits 30 days', d.message()); d.accept(); });
    await p.click('[data-mudel]'); await sleep(800);
    ok(await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 0), 'removed from this device');
    await p.click('[data-dstrash="music"]');
    ok(await (async () => { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => { const r = document.querySelector('.ds-trash'); return r && /雲端的歌/.test(r.textContent) && /30/.test(r.textContent); })) return true; await sleep(150); } return false; })(), 'listed under recently removed with 30 days left');
    await p.click('[data-dsback^="music:"]');
    ok(await (async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 1)) return true; await sleep(150); } return false; })(), 'brought back, and onto this device again');
    // a song added while "this device only" was chosen can be uploaded afterwards
    await p.click('[data-dswhere="music:local"]'); await sleep(200);
    await p.setInputFiles('#muFile', [{ name: '本機的歌.wav', mimeType: 'audio/wav', buffer: wav() }]);
    ok(await (async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => (JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []).some(o => /本機/.test(o.name) && !o.cid))) return true; await sleep(150); } return false; })(), 'a song kept on this device only');
    const before = Object.keys(bucket).filter(k => /\/music\//.test(k)).length;
    await p.click('[data-dswhere="music:cloud"]'); await sleep(300);
    ok(await p.evaluate(() => document.querySelectorAll('[data-muup]').length === 1 && /1/.test((document.querySelector('[data-do="muUpAll"]') || {}).textContent || '')), 'switching to the cloud offers to upload the one already here', await p.evaluate(() => document.getElementById('sheetCard').textContent.slice(0, 300)));
    await p.click('[data-do="muUpAll"]');
    ok(await (async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => (JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []).every(o => !!o.cid))) return true; await sleep(150); } return false; })(), 'after "upload them too" every song has a cloud copy');
    const up = Object.keys(bucket).filter(k => /\/music\//.test(k));
    ok(up.length === before + 1 && bucket[up[up.length - 1]].type === 'audio/wav', 'it went to the bucket as a WAV', up.map(k => bucket[k].type));
    ok(await p.evaluate(() => !document.querySelector('[data-muup]') && !document.querySelector('[data-do="muUpAll"]')), 'and the upload buttons are gone');
    // ---------- my own password: set it, get a recovery code, lock with it ----------
    await p.click('[data-dslock="p"]');
    for (let i = 0; i < 40 && !(await p.evaluate(() => !!document.getElementById('vtPw2'))); i++) await sleep(100);
    await p.fill('#vtPw', 'short'); await p.fill('#vtPw2', 'short'); await p.click('[data-vt="ok"]'); await sleep(200);
    ok(await p.evaluate(() => /8/.test(document.getElementById('sheetCard').textContent)), 'too short a password is refused');
    await p.fill('#vtPw', 'brick-pass-1'); await p.fill('#vtPw2', 'brick-pass-1'); await p.click('[data-vt="ok"]');
    let code = null;
    for (let i = 0; i < 100 && !code; i++) { code = await p.evaluate(() => { const e = document.querySelector('.roomcode.xfer'); return e && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/.test(e.textContent) ? e.textContent : null; }); await sleep(100); }
    ok(!!code, 'a recovery code is shown once', code);
    // optional: keep it with an email address (explained first, proven with a mailed code)
    ok(await p.evaluate(() => /技術上轉磚也拿得到/.test(document.getElementById('sheetCard').textContent) && !!document.getElementById('vtMail')), 'the email option says what it means before anything is given');
    await p.fill('#vtMail', 'player@example.com'); await p.click('[data-vt="mailGo"]');
    for (let i = 0; i < 40 && !(await p.evaluate(() => !!document.getElementById('vtPin'))); i++) await sleep(100);
    const pin = (/(\d{6})/.exec((mails().pop() || {}).text || '') || [])[1];
    ok(!!pin && await p.evaluate(() => /p\*\*\*@example\.com/.test(document.getElementById('sheetCard').textContent)), 'a six-digit code went to the address (shown hidden)', pin);
    await p.fill('#vtPin', pin); await p.click('[data-vt="pinOk"]');
    for (let i = 0; i < 40 && !(await p.evaluate(() => /保管/.test(document.getElementById('mtoast').textContent))); i++) await sleep(100);
    ok(await p.evaluate(() => /保管/.test(document.getElementById('mtoast').textContent)), 'the address is kept');
    ok(await p.evaluate(() => document.querySelector('[data-dslock="p"]').getAttribute('aria-checked') === 'true'), 'back in the player, "my own password" is on');
    const nBefore = Object.keys(bucket).length;
    await p.setInputFiles('#muFile', [{ name: '密碼的歌.wav', mimeType: 'audio/wav', buffer: wav() }]);
    for (let i = 0; i < 80 && Object.keys(bucket).length === nBefore; i++) await sleep(150);
    const pk = Object.keys(bucket).find(k => bucket[k].body[4] === 112);
    ok(pk && bucket[pk].body.slice(0, 4).toString() === 'ZZE1', 'the new song is locked with the password (mode p)', Object.keys(bucket).map(k => bucket[k].body[4]));
    const dbText = await (await fetch('http://127.0.0.1:' + PORT + '/_dev/state')).text().catch(() => '');
    ok(dbText.indexOf('brick-pass-1') < 0 && code && dbText.indexOf(code) < 0, 'neither the password nor the recovery code is on the server');
    // another visit: the password is asked for to open it; a wrong one is refused
    await p.evaluate(() => new Promise(res => { const st = JSON.parse(localStorage.getItem('zhuanzhuan.music.v1')); st.own = []; st.list = []; localStorage.setItem('zhuanzhuan.music.v1', JSON.stringify(st)); const r = indexedDB.deleteDatabase('zhuanzhuan-music'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
    await p.reload(); await sleep(800);
    for (let i = 0; i < 60 && !(await p.evaluate(() => ZZ.Cloud.on && ZZ.Cloud.files)); i++) await sleep(100);
    await sleep(600);
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(300);
    await p.click('[data-do="muPull"]');
    for (let i = 0; i < 60 && !(await p.evaluate(() => !!document.getElementById('vtPw') && !document.getElementById('vtPw2'))); i++) await sleep(100);
    ok(await p.evaluate(() => !!document.getElementById('vtPw')), 'getting it back asks for the password');
    await p.fill('#vtPw', 'not-the-password'); await p.click('[data-vt="ok"]');
    await sleep(2500);
    ok(await p.evaluate(() => !(JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []).some(o => /密碼/.test(o.name))), 'a wrong password opens nothing');
    // forgot it, and lost the code too: it can be mailed to the kept address
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(200);
    await p.click('[data-dsvault="recover"]');
    for (let i = 0; i < 40 && !(await p.evaluate(() => !!document.querySelector('#sheetCard [data-dsvault="remind"]'))); i++) await sleep(100);
    const n0 = mails().length;
    await p.click('#sheetCard [data-dsvault="remind"]');
    for (let i = 0; i < 40 && mails().length === n0; i++) await sleep(100);
    const mailed = mails().pop();
    ok(mailed && mailed.to === 'player@example.com' && mailed.text.indexOf(code) >= 0, 'the recovery code is mailed to the kept address', mailed && mailed.text.slice(0, 80));
    // the recovery code sets a new one
    await p.fill('#vtCode', code.toLowerCase().replace(/-/g, ' ')); await p.fill('#vtPw', 'brick-pass-2'); await p.fill('#vtPw2', 'brick-pass-2'); await p.click('[data-vt="ok"]');
    for (let i = 0; i < 100 && !(await p.evaluate(() => /新密碼生效/.test((document.getElementById('mtoast') || {}).textContent || ''))); i++) await sleep(100);
    ok(await p.evaluate(() => /新密碼生效/.test(document.getElementById('mtoast').textContent)), 'the recovery code (typed loosely) resets the password', await p.evaluate(() => [document.getElementById('sheetCard').getAttribute('data-name'), document.getElementById('sheetCard').textContent.slice(0, 200), document.getElementById('mtoast').textContent]));
    await p.evaluate(() => ZZ.Cloud.forgetPass());
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(200);
    await p.click('[data-do="muPull"]');
    for (let i = 0; i < 60 && !(await p.evaluate(() => !!document.getElementById('vtPw'))); i++) await sleep(100);
    await p.fill('#vtPw', 'brick-pass-2'); await p.click('[data-vt="ok"]');
    ok(await (async () => { for (let i = 0; i < 100; i++) { if (await p.evaluate(() => (JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []).some(o => /密碼/.test(o.name)))) return true; await sleep(150); } return false; })(), 'with the new password the song comes back, and the server-locked ones too');
    ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('zhuanzhuan.music.v1') || '{}').own || []).length >= 3), 'all of them');
    // a new recovery code (while the password is known): the old one stops working, the kept copy follows
    const code2 = await p.evaluate(() => ZZ.Cloud.newRecovery());
    ok(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/.test(code2 || '') && code2 !== code, 'a new recovery code can be made', code2);
    ok(await p.evaluate(c => ZZ.Cloud.recoverVault(c, 'x-pass-old'), code) === false && await p.evaluate(c => ZZ.Cloud.recoverVault(c, 'brick-pass-2'), code2) === true, 'the old code no longer works, the new one does');
    const n1 = mails().length;
    await p.evaluate(() => ZZ.Cloud.mailAsk({ a: 'mailRemind' }));
    for (let i = 0; i < 40 && mails().length === n1; i++) await sleep(100);
    ok((mails().pop() || {}).text.indexOf(code2) >= 0, 'and the mailed one is the new code');
    ok(await p.evaluate(() => ZZ.Cloud.changePass('wrong-old-pass', 'brick-pass-3')) === false && await p.evaluate(() => ZZ.Cloud.changePass('brick-pass-2', 'brick-pass-3')) === true, 'changing the password needs the current one');
    await p.click('[data-dslock="s"]').catch(() => {}); await sleep(200);
    // a picture too
    await p.evaluate(() => { ZZ.App.closeSheet(); ZZ.App.openSheet('shop'); }); await sleep(200);
    await p.click('[data-tab="member"]'); await sleep(200);
    await p.click('[data-dswhere="pics:cloud"]'); await sleep(200);
    const PIC = path.join(__dirname, '..', 'shots', 'r2-pic.png'); await p.screenshot({ path: PIC });
    await p.click('[data-pick="bg"]').catch(() => {});
    await p.setInputFiles('#picFile', PIC); await sleep(1500);
    ok(Object.keys(bucket).some(k => /\/pics\//.test(k)), 'a wall picture is uploaded as well');
    await ctx.close();
    // no keys, no cloud
    const s2 = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT + 1)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise(r => s2.stdout.once('data', r));
    const q = await (await browser.newContext({ locale: 'zh-TW' })).newPage();
    await q.goto('http://127.0.0.1:' + (PORT + 1) + '/index.html?sw=off&lang=zh-Hant'); await sleep(1500);
    await q.evaluate(() => { ZZ.Meta.subscribe(); ZZ.App.openSheet('music'); }); await sleep(300);
    ok(await q.evaluate(() => document.querySelector('[data-dswhere="music:cloud"]').disabled), 'without the R2 keys the cloud choice stays off');
    s2.kill();
  } catch (e) { fail++; console.log('CRASH', e); }
  ok(problems.length === 0, 'no page errors', problems);
  await browser.close(); srv.kill();
  console.log('cloud files checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
