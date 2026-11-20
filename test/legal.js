'use strict';
// The regional privacy policies and terms (drafts): every region has both pages, in its language, marked as a draft,
// with working links; the game sends the legal links to the player's chosen region. Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
const REGIONS = require('../legal/src/regions.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [], bad = [];
  try {
    const ctx = await browser.newContext({ locale: 'zh-TW' });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    p.on('response', r => { if (r.status() >= 400 && !/\/api\//.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
    for (const r of REGIONS) for (const doc of ['privacy', 'terms']) {
      const f = path.join(__dirname, '..', 'legal', r.code, doc + '.html');
      ok(fs.existsSync(f), r.code + '/' + doc + ' exists');
      await p.goto(BASE + 'legal/' + r.code + '/' + doc + '.html');
      const s = await p.evaluate(() => ({ lang: document.documentElement.lang, draft: !!document.querySelector('.draft'), noindex: !!document.querySelector('meta[name="robots"][content="noindex"]'), regions: document.querySelectorAll('.regions a').length, here: (document.querySelector('.regions [aria-current]') || {}).textContent, links: [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(location.origin)) }));
      ok(s.lang === r.lang && s.draft && s.noindex && s.regions === REGIONS.length && (s.here === r.name || r.lang === 'zh-Hans'), r.code + '/' + doc + ': language, draft notice, not indexed, region list', s);
      for (const l of [...new Set(s.links)]) { const res = await p.request.get(l.split('#')[0]); ok(res.ok(), r.code + '/' + doc + ' links to ' + l, res.status()); }
    }
    ok(/中國大陆|中国大陆/.test(fs.readFileSync(path.join(__dirname, '..', 'legal', 'cn', 'privacy.html'), 'utf8')) && !/隱私政策/.test(fs.readFileSync(path.join(__dirname, '..', 'legal', 'cn', 'privacy.html'), 'utf8')), 'the mainland version is in Simplified Chinese');
    // the main pages list the regions
    await p.goto(BASE + 'privacy.html');
    ok(await p.evaluate(() => document.querySelectorAll('.regions a').length) === REGIONS.length - 1, 'the main privacy page lists the other regions');
    // the game sends the links to the chosen region
    await p.goto(BASE + 'index.html?sw=off');
    await p.evaluate(() => { localStorage.setItem('zhuanzhuan.consent.v1', JSON.stringify({ v: 2, region: 'jp', age: 'adult', fonts: false, ask: false })); });
    await p.reload(); await p.waitForTimeout(600);
    const href = await p.evaluate(() => { const a = document.querySelector('.about.legal a[href="privacy.html"]'); a.addEventListener('click', e => e.preventDefault()); a.click(); return a.getAttribute('href'); });
    ok(href === 'legal/jp/privacy.html', 'a player who chose Japan gets the Japanese privacy policy', href);
  } catch (e) { fail++; console.log('FAIL crashed', e.message); }
  ok(!problems.length, 'no page errors', problems);
  ok(!bad.length, 'nothing missing', bad.slice(0, 5));
  await browser.close();
  console.log('legal page checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
