'use strict';
// The game as an installable, findable page: head tags for search engines and link previews, the app manifest and
// its icons, the service worker (offline play, never in the way of a new version or of the API), ?lang= and ?go=.
// Runs against tools/dev-server.js, which it starts itself.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const PORT = 8775, BASE = 'http://127.0.0.1:' + PORT + '/';
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(100); } return false; };
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (ctx, url) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(m.text())) problems.push('console: ' + m.text()); });
    await page.goto(url || BASE); await sleep(500);
    return page;
  };

  // ---------- what a crawler that does not run scripts gets ----------
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), head = raw.slice(0, raw.indexOf('</head>'));
  const meta = n => { const m = new RegExp('<meta (?:name|property)="' + n + '" content="([^"]*)"').exec(head); return m ? m[1] : null; };
  const site = (/<link rel="canonical" href="([^"]+)"/.exec(head) || [])[1] || '';
  ok(/^https:\/\/[^/]+\/$/.test(site), 'a canonical address', site);
  ok((/<title>([^<]+)<\/title>/.exec(head) || [])[1].length >= 12 && meta('description').length >= 60 && meta('description').length <= 170, 'a title and a description of a useful length', [meta('description').length]);
  ok(meta('og:title') && meta('og:description') && meta('og:url') === site && meta('og:image') === site + 'icons/og.png' && meta('og:type') === 'website', 'Open Graph tags', [meta('og:url'), meta('og:image')]);
  ok(meta('twitter:card') === 'summary_large_image' && meta('twitter:image') === site + 'icons/og.png', 'a large preview card');
  ok((head.match(/rel="alternate" hreflang="/g) || []).length === 6 && head.indexOf('hreflang="x-default"') > 0, 'the five languages and a default are announced');
  let ld = null; try { ld = JSON.parse((/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(head) || [])[1]); } catch (e) { /* stays null */ }
  ok(ld && ld['@type'].indexOf('VideoGame') >= 0 && ld.url === site && ld.offers.price === '0' && ld.inLanguage.length === 5, 'structured data says: a free game, in five languages', ld && ld['@type']);
  ok(!/Tetris|俄羅斯方塊|テトリス|테트리스/i.test(head + raw.slice(raw.indexOf('<body'), raw.indexOf('<script>'))), 'no borrowed brand name in the page text');
  const body = raw.slice(raw.indexOf('<body'), raw.indexOf('<script>', raw.indexOf('<body')));
  ok(/<b data-t="m\.rank">排位賽<\/b>/.test(body) && /class="about"[^>]*>轉磚對戰是免費的/.test(body) && /class="lede"[^>]*>[^<]{10,}/.test(body), 'the page carries its words before any script runs', body.slice(body.indexOf('class="about"'), body.indexOf('class="about"') + 80));
  ok(raw.indexOf('data-t="k.cw">順轉') < 0 || raw.indexOf('data-t="k.cw">順轉') < raw.indexOf('<script>', raw.indexOf('<body')), 'and the scripts themselves were left as written');
  const icoSize = fs.statSync(path.join(ROOT, 'favicon.ico')).size;
  ok(icoSize > 1000 && /rel="icon" href="favicon\.ico"/.test(head) && /rel="icon" href="icons\/favicon\.svg"/.test(head) && /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/.test(head), 'favicon, in three kinds');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), smap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  ok(/Disallow: \/api\//.test(robots) && robots.indexOf('Sitemap: ' + site + 'sitemap.xml') > 0, 'robots.txt keeps crawlers out of the API and points at the sitemap');
  ok((smap.match(/<loc>/g) || []).length === 10 && smap.indexOf(site + 'games/push/') > 0 && smap.indexOf('<loc>' + site + '</loc>') > 0 && smap.indexOf(site + '?lang=ja') > 0, 'the sitemap lists the page in each language, and the brick games');

  // ---------- in a browser ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-TW' });
  const page = await open(ctx);
  ok(await page.evaluate(() => document.title) === '轉磚對戰｜免費線上方塊對戰遊戲，手機電腦都能玩', 'the title in the reader\'s language', await page.evaluate(() => document.title));
  ok(await page.evaluate(() => { const a = document.querySelector('.about'); return a && a.offsetHeight > 10 && /免費的網頁方塊對戰遊戲/.test(a.textContent); }), 'the short description is on the menu');
  // manifest and icons
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); const r = await fetch(l.href); return { type: r.headers.get('content-type'), json: await r.json() }; });
  ok(/manifest\+json/.test(man.type) && man.json.name === '轉磚對戰' && man.json.short_name === '轉磚' && man.json.display === 'standalone' && man.json.start_url === './?source=pwa' && man.json.scope === './', 'the manifest', [man.type, man.json.start_url]);
  const sizes = await page.evaluate(async list => {
    const out = [];
    for (const i of list) {
      const im = new Image(); im.src = i.src;
      try { await im.decode(); out.push(i.sizes === 'any' || i.sizes === im.naturalWidth + 'x' + im.naturalHeight ? 'ok' : i.src + ' is ' + im.naturalWidth + 'x' + im.naturalHeight); } catch (e) { out.push(i.src + ' missing'); }
    }
    return out;
  }, man.json.icons.concat(man.json.screenshots));
  ok(sizes.length >= 5 && sizes.every(s => s === 'ok'), 'every icon and screenshot in the manifest is there, in the size it claims', sizes);
  ok(man.json.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512') && man.json.icons.some(i => i.purpose === 'any' && i.sizes === '192x192'), 'icons for the home screen, plain and maskable');
  ok(man.json.screenshots.some(s => s.form_factor === 'narrow') && man.json.screenshots.some(s => s.form_factor === 'wide'), 'screenshots for the install sheet, phone and desktop', man.json.screenshots.map(s => s.src));
  ok(man.json.shortcuts.length === 4 && man.json.shortcuts.every(s => /^\.\/\?go=\w+$/.test(s.url)), 'shortcuts into four modes');
  // the service worker
  ok(await until(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))), 8000), 'the service worker is running');
  ok(await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), 4000), 'and looks after this page');
  const kept = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname); return out; });
  const pageKey = Object.keys(kept).filter(k => /^zz-page-/.test(k));
  ok(pageKey.length === 1 && kept[pageKey[0]].join() === '/' && (kept['zz-files-v1'] || []).indexOf('/manifest.webmanifest') >= 0, 'a copy of the page and the first files are kept', kept);
  ok(await page.evaluate(() => ZZ.Cloud.on), 'the API is still reached through it');
  ok(!Object.keys(kept).some(k => kept[k].some(p => /^\/api\//.test(p))), 'and nothing from the API is ever kept');
  // offline
  await ctx.setOffline(true);
  await page.reload(); await sleep(700);
  ok(await page.evaluate(() => typeof ZZ === 'object' && !document.getElementById('menu').hidden && document.getElementById('mName').textContent.length > 0), 'with no connection the game still opens');
  await page.evaluate(() => document.querySelector('[data-go="battle"]').click()); await sleep(250);
  await page.evaluate(() => document.querySelector('[data-do="fight"]').click()); await sleep(4300);
  ok(await page.evaluate(() => { const S = ZZ.peek().S; return S && S.kind === 'battle' && S.state === 'play'; }), 'and a match against the computer runs');
  ok(await page.evaluate(() => ZZ.Cloud.status() !== 'none'), 'it has not forgotten that a server exists', await page.evaluate(() => ZZ.Cloud.status()));
  await ctx.setOffline(false);
  await page.goto(BASE + '?room=ABCDE'); await sleep(600);
  ok(await page.evaluate(() => ZZ.peek().sheet === 'online' && document.getElementById('nCode').value === 'ABCDE'), 'an invite link still opens the lobby with the service worker in between');

  // ---------- a new version is never held back ----------
  const index = path.join(ROOT, 'index.html'), before = fs.readFileSync(index, 'utf8');
  try {
    fs.writeFileSync(index, before.replace('<body>', '<body data-fresh="yes">'));
    await page.goto(BASE); await sleep(500);
    ok(await page.evaluate(() => document.body.getAttribute('data-fresh')) === 'yes', 'online, the page comes from the network even though a copy is kept');
  } finally { fs.writeFileSync(index, before); }
  await page.goto(BASE); await sleep(400);
  ok(await page.evaluate(() => document.body.getAttribute('data-fresh')) === null, '(and back)');

  // ---------- installing ----------
  ok(await page.evaluate(() => document.getElementById('mInstall').hidden), 'no install link while the browser has not offered');
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__asked = (window.__asked || 0) + 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  ok(await page.evaluate(() => { const b = document.getElementById('mInstall'); return !b.hidden && b.textContent === '安裝成 App'; }), 'the browser offers: the menu shows "install"');
  await page.tap('#mInstall'); await sleep(200);
  ok(await page.evaluate(() => window.__asked === 1 && document.getElementById('mInstall').hidden), 'tapping it shows the browser\'s own prompt, once');
  await ctx.close();
  // an iPhone has no such prompt: explain the Share menu instead
  const ios = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-TW', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });
  const ip = await open(ios);
  await ip.waitForFunction(() => !document.getElementById('mInstall').hidden, null, { timeout: 5000 }).catch(() => {});
  ok(await ip.evaluate(() => !document.getElementById('mInstall').hidden), 'on an iPhone the link is there');
  await ip.tap('#mInstall'); await sleep(250);
  ok(await ip.evaluate(() => ZZ.peek().sheet === 'install' && /分享/.test(document.getElementById('sheetCard').textContent) && /加入主畫面/.test(document.getElementById('sheetCard').textContent)), 'and explains "Add to Home Screen"');
  // …but not on a copy of the page that has no service worker beside it (a preview, a saved file): nothing to install there
  const bare = await open(ios, BASE + '?sw=off'); await sleep(700);
  ok(await bare.evaluate(() => document.getElementById('mInstall').hidden), 'no link on an iPhone where the page has no service worker');
  await ios.close();
  // a page shown inside another iPhone app is not Safari, and has no Share menu to add it with
  const web = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-TW', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  const wp = await open(web); await sleep(700);
  ok(await wp.evaluate(() => document.getElementById('mInstall').hidden), 'nor inside another iPhone app');
  await web.close();
  const line = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-TW', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Line/14.3.0' });
  const lp = await open(line);
  ok(await lp.evaluate(() => document.getElementById('mInstall').hidden), 'inside a chat app\'s browser nothing can be installed, so nothing is offered');
  await line.close();

  // ---------- addresses ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' });
  const en = await open(desk, BASE + '?lang=en');
  ok(await en.evaluate(() => document.documentElement.lang === 'en' && /^Zhuan Zhuan Battle \| Free online/.test(document.title) && /free falling-block battle game/.test(document.querySelector('meta[name="description"]').content)), '?lang=en shows English, title and description included', await en.evaluate(() => document.title));
  ok(await en.evaluate(() => /\?lang=en$/.test(document.querySelector('link[rel="canonical"]').href) && document.querySelector('[data-go="rank"] b').textContent === 'Ranked'), 'and is its own canonical address');
  await en.evaluate(() => document.querySelector('[data-sheet="settings"]').click()); await sleep(200);
  await en.selectOption('#sLang', 'ja'); await sleep(300);
  ok(await en.evaluate(() => document.documentElement.lang === 'ja' && !/lang=/.test(document.querySelector('link[rel="canonical"]').href.split('/').pop().replace('?lang=ja', ''))), 'choosing a language in the settings takes over from the address');
  const desk2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' });
  const zh = await open(desk2, BASE + '?lang=xx');
  ok(await zh.evaluate(() => document.documentElement.lang === 'zh-Hant' && !/\?/.test(document.querySelector('link[rel="canonical"]').href)), 'an unknown ?lang= is ignored');
  const sp = await open(desk, BASE + '?go=sprint'); await sleep(300);
  ok(await sp.evaluate(() => { const S = ZZ.peek().S; return S && S.kind === 'sprint'; }), '?go=sprint starts a sprint');
  const bt = await open(desk, BASE + '?go=battle'); await sleep(300);
  ok(await bt.evaluate(() => ZZ.peek().sheet === 'battle'), '?go=battle opens the rival picker');
  const no = await open(desk, BASE + '?go=__proto__'); await sleep(300);
  ok(await no.evaluate(() => ZZ.peek().screen === 'menu' && !ZZ.peek().sheet), 'anything else is ignored');
  const off = await open(desk, BASE + '?sw=off'); await sleep(600);
  ok(await off.evaluate(() => typeof ZZ === 'object'), '?sw=off still loads');
  await desk.close(); await desk2.close();

  ok(!problems.length, 'no page errors', problems);
  await browser.close();
  srv.kill();
  console.log('pwa checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
