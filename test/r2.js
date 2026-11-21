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
  const env = Object.assign({}, process.env, { R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDTEST', R2_SECRET_ACCESS_KEY: 'SECRETTEST', R2_BUCKET: 'zzb' });
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
