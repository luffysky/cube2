'use strict';
// The first-visit screen, the font choice, the under-13 limits, the settings section and the data download.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8790/index.html?sw=off';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [], fonts = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true, locale: 'zh-TW' });
    await ctx.addInitScript(() => { window.__zzAskConsent = true; });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(e.message));
    page.on('request', r => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) fonts.push(r.url()); });
    await page.goto(URL); await sleep(900);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'consent'), 'the first visit opens the consent screen');
    ok(fonts.length === 0, 'nothing is fetched from Google before the player says so', fonts);
    ok(await page.evaluate(() => [...document.querySelectorAll('#sheetCard a')].map(a => a.getAttribute('href')).join() === 'terms.html,privacy.html'), 'it links the terms and the privacy policy');
    await page.screenshot({ path: path.join(OUT, 'consent.png') });
    ok(await page.evaluate(() => !document.querySelector('#sheetCard input[type=checkbox]') && !!document.querySelector('[data-do="consentAll"]') && !!document.querySelector('[data-do="consentMin"]')), 'nothing is ticked in advance: two equal buttons');
    await page.click('[data-do="consentMin"]'); await sleep(200);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'consent' && /先選地區和年齡/.test(document.getElementById('sheetCard').textContent)), 'it asks for region and age before going on');
    ok(await page.evaluate(() => document.querySelectorAll('[data-region]').length === 10 && document.querySelectorAll('[data-age]').length === 5 && document.querySelectorAll('[data-cslang]').length === 5), 'ten regions, five age bands, five languages, as in SPINREALM');
    ok(await page.evaluate(() => !document.querySelector('[data-region][aria-checked="true"]')), 'no region is picked for the player');
    await page.click('[data-cslang="en"]'); await sleep(200);
    ok(await page.evaluate(() => ZZ.peek().lang === 'en' && /Where do you live/.test(document.getElementById('sheetCard').textContent)), 'the language can be changed right there');
    await page.click('[data-cslang="zh-Hant"]'); await sleep(200);
    await page.click('[data-region="tw"]'); await sleep(100);
    await page.click('[data-do="consentMin"]'); await sleep(200);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'consent' && !ZZ.Consent.done()), 'a region alone is not enough');
    await page.click('[data-age="u13"]'); await sleep(150);
    ok(await page.evaluate(() => /不開放連線對戰/.test(document.getElementById('sheetCard').textContent)), 'under 13 is told what is closed');
    await page.click('[data-do="consentMin"]'); await sleep(400);      // without Google Fonts
    ok(await page.evaluate(() => !ZZ.peek().sheet && ZZ.Consent.done() && ZZ.Consent.child() && ZZ.Consent.region() === 'tw' && !ZZ.Consent.fonts()), 'the answers are kept');
    ok(fonts.length === 0, 'fonts declined: still nothing from Google', fonts);
    // under 13
    await page.evaluate(() => ZZ.App.go.online()); await sleep(200);
    ok(await page.evaluate(() => ZZ.peek().sheet !== 'online' && ZZ.Net.state === 'idle'), 'no online play under 13');
    await page.evaluate(() => ZZ.Net.quick('x')); await sleep(200);
    ok(await page.evaluate(() => ZZ.Net.state === 'idle'), 'not even through the network code directly');
    ok(await page.evaluate(() => ZZ.Meta.setName('小明') === false && ZZ.Meta.data.name === ''), 'and no public name');
    // a reload does not ask again
    await page.reload(); await sleep(800);
    ok(await page.evaluate(() => ZZ.peek().sheet !== 'consent'), 'asked once');
    // settings: change age, allow fonts, download data
    await page.evaluate(() => ZZ.App.openSheet('settings')); await sleep(300);
    ok(await page.evaluate(() => !!document.getElementById('sFonts') && /未滿 13 歲/.test(document.getElementById('sheetCard').textContent)), 'settings show the choices');
    await page.click('label[for="sFonts"]'); await sleep(1200);
    ok(fonts.length > 0, 'allowing fonts loads them', fonts.length);
    const dl = page.waitForEvent('download');
    await page.click('[data-do="exportData"]');
    const file = await dl;
    ok(file.suggestedFilename() === 'zhuanzhuan-my-data.json', 'the data download is a file of its own');
    await page.click('[data-do="changeAge"]'); await sleep(200);
    await page.click('[data-age="adult"]'); await sleep(100);
    await page.click('[data-do="consentAll"]'); await sleep(300);
    ok(await page.evaluate(() => ZZ.Consent.age() === 'adult' && !ZZ.Consent.minor()), 'the age band changes');
    await page.evaluate(() => ZZ.App.go.online()); await sleep(300);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'online'), 'as an adult online play opens');
    // the mainland notice in Simplified Chinese only
    await page.goto(URL + '&lang=zh-Hans'); await sleep(700);
    ok(await page.evaluate(() => !document.getElementById('cnNotice').hidden && /适龄提示/.test(document.getElementById('cnNotice').textContent) && /健康生活/.test(document.getElementById('cnNotice').textContent)), 'Simplified Chinese shows the age mark and the healthy-gaming advice');
    await page.goto(URL + '&lang=en'); await sleep(700);
    ok(await page.evaluate(() => document.getElementById('cnNotice').hidden), 'other languages do not');
    await page.evaluate(() => ZZ.Consent.set({ region: 'cn' })); await sleep(100);
    ok(await page.evaluate(() => !document.getElementById('cnNotice').hidden), 'nor unless the player says they live in mainland China');
    // the first version's answers: 18+ carries over, 13 to 17 is asked again (it is now three bands)
    await page.evaluate(() => localStorage.setItem('zhuanzhuan.consent.v1', JSON.stringify({ v: 1, at: 1, fonts: false, age: 'teen' })));
    await page.goto(URL); await sleep(900);
    ok(await page.evaluate(() => ZZ.peek().sheet === 'consent' && !document.querySelector('[data-age][aria-checked="true"]')), 'an old 13-to-17 answer is asked again');
    // the pages
    for (const f of ['privacy.html', 'terms.html']) {
      const r = await page.goto(URL.replace(/index\.html.*$/, f));
      ok(r.status() === 200 && (await page.evaluate(() => document.body.innerText.length)) > 2000, f + ' is there and has content');
    }
    ok(problems.length === 0, 'no page errors', problems);
  } catch (e) { fail++; console.log('CRASH', e); }
  await browser.close();
  console.log('consent checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
