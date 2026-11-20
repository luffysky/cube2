'use strict';
// The music player in a real browser: non-members see the members' button instead of the file picker; a member adds a
// real (tiny) WAV and a file that is not audio, only the WAV is kept, and it lives in this device's IndexedDB only;
// playlist mode plays from the list. Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
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
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    const uploads = []; p.on('request', r => { if (r.method() !== 'GET') uploads.push(r.url()); });
    await p.goto(BASE + 'index.html?sw=off&lang=zh-Hant'); await sleep(800);
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(300);
    ok(await p.evaluate(() => !document.getElementById('muFile') && !!document.querySelector('#sheetCard [data-tab="member"]') && document.querySelectorAll('[data-muplay]').length === 5), 'a non-member sees the five built-in tracks and the members button, no file picker');
    await p.evaluate(() => { ZZ.Meta.data.sub.until = ZZ.Meta.now() + 864e5; ZZ.App.openSheet('music'); }); await sleep(300);
    ok(await p.evaluate(() => !!document.getElementById('muFile')), 'a member gets the file picker');
    ok(await p.evaluate(() => { const c = document.querySelector('[data-dswhere="music:cloud"]'); return c && c.disabled && document.querySelector('[data-dswhere="music:local"]').getAttribute('aria-checked') === 'true' && /關掉瀏覽器、重開機都還在/.test(document.getElementById('sheetCard').textContent); }), 'the member sees where the music is kept: this device only for now, and what that means');
    await p.setInputFiles('#muFile', [{ name: '我的歌.wav', mimeType: 'audio/wav', buffer: wav() }, { name: 'notes.wav', mimeType: 'audio/wav', buffer: Buffer.from('this is not a sound') }]);
    ok(await (async () => { for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 1)) return true; await sleep(150); } return false; })(), 'only the real sound file is kept');
    ok(await p.evaluate(() => /我的歌/.test(document.getElementById('sheetCard').textContent)), 'it shows under its own name');
    const stored = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('zhuanzhuan-music'); r.onsuccess = () => { const db = r.result, names = Array.from(db.objectStoreNames); if (!names.length) return res(0); const tx = db.transaction(names[0]); const c = tx.objectStore(names[0]).count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); }));
    ok(stored === 1, 'the file is kept in this device\'s IndexedDB', stored);
    ok(uploads.filter(u => !/\/api\/(health|rpc)/.test(u)).length === 0 && !uploads.some(u => /music|upload/.test(u)), 'nothing was sent anywhere', uploads);
    await p.click('[data-mumode="list"]'); await sleep(300);
    const own = await p.evaluate(() => document.querySelector('[data-mudel]').dataset.mudel);
    await p.click('[data-muplay="' + own + '"]'); await sleep(600);
    ok(await p.evaluate(id => ZZ.App.sfx.mname === id, own), 'the member\'s own track plays from the list');
    await p.reload(); await sleep(900);
    await p.evaluate(() => ZZ.App.openSheet('music')); await sleep(300);
    ok(await p.evaluate(() => document.querySelectorAll('[data-mudel]').length === 1 && document.querySelector('[data-mumode="list"]').getAttribute('aria-checked') === 'true'), 'the track and the playlist mode are still there after a reload');
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e.message); }
  await browser.close();
  console.log('music player checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
