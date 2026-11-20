'use strict';
// The brick games in every language: each page (and the directory, and the side menu) in English and Korean shows
// no Chinese except the names 轉磚 / 斯諾瑞姆工作室; every data-t key exists; the language follows 轉磚's setting.
// Needs the static server on 8790.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.ZZ_BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const PAGES = ['games/', 'games/snake/', 'games/breakout/', 'games/stack/', 'games/push/', 'games/merge/', 'games/sort/', 'games/picross/', 'games/pipes/', 'games/sweep/'];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  try {
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage(); p.on('pageerror', e => problems.push(e.message));
    for (const lang of ['en', 'ko', 'ja', 'zh-Hans']) {
      for (const u of PAGES) {
        await p.goto(BASE + u + '?lang=' + lang); await p.waitForTimeout(250);
        const r = await p.evaluate(() => {
          document.querySelectorAll('[hidden]').forEach(e => e.removeAttribute('hidden'));       // every overlay too
          const txt = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).join(' ') + ' ' + document.title;
          const missing = [...document.querySelectorAll('[data-t],[data-ta],[data-th],[data-tk]')].map(e => e.getAttribute('data-t') || e.getAttribute('data-ta') || e.getAttribute('data-th') || e.getAttribute('data-tk')).filter(k => !window.SRW_WORDS[k]);
          return { txt, missing, lang: document.documentElement.lang };
        });
        ok(!r.missing.length, lang + ' ' + u + ': every key exists', r.missing);
        ok(r.lang === lang, lang + ' ' + u + ': the page says its language', r.lang);
        if (lang === 'en' || lang === 'ko') {
          const han = r.txt.replace(/轉磚|斯諾瑞姆工作室/g, '').match(/[一-鿿]+/g);
          ok(!han, lang + ' ' + u + ': no Chinese left', han);
        }
        if (lang === 'zh-Hans') ok(!/[遊戲關磚轉]/.test(r.txt.replace(/轉磚|斯諾瑞姆工作室/g, '')), 'zh-Hans ' + u + ': simplified', (r.txt.match(/[遊戲關磚轉]/g) || []).slice(0, 5));
      }
    }
    // the side menu and a game's end card, in English, while playing
    await p.goto(BASE + 'games/snake/?lang=en'); await p.waitForTimeout(250);
    await p.click('.burger'); await p.waitForTimeout(300);
    const menu = await p.evaluate(() => document.getElementById('drawer').innerText);
    ok(/All games/.test(menu) && /Brick Snake/.test(menu) && !/[一-鿿]/.test(menu.replace(/轉磚/g, '')), 'the side menu speaks English', menu.slice(0, 200));
    // 轉磚's own language setting carries over
    await p.evaluate(() => localStorage.setItem('zhuanzhuan.v2', JSON.stringify({ set: { lang: 'ja' }, save: {} })));
    await p.goto(BASE + 'games/stack/'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.documentElement.lang === 'ja' && /スタート/.test(document.body.innerText)), 'the language picked in 轉磚 is used');
  } catch (e) { fail++; console.log('FAIL crashed', e.message); }
  ok(!problems.length, 'no page errors', problems);
  await browser.close();
  console.log('brick games language checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
