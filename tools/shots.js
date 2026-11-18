'use strict';
/* Takes the pictures the published page points at, from the game itself:
     icons/og.png          1200 x 630, the preview picture for links (search results, chat apps, social sites)
     icons/shot-phone.png  1080 x 2160, a match on a phone   (shown by "install this app")
     icons/shot-wide.png   1920 x 1080, a match on a desktop (same)
   Run `node build.js` first, then `node tools/shots.js`, then `node build.js` again so the manifest lists the pictures.

   Needs Playwright with Chrome (paths below), Pillow for the final squeeze, and the two web fonts the page uses,
   because this machine cannot reach Google Fonts:
     mkdir -p build_tmp/fonts && cd build_tmp/fonts && npm i @fontsource/chiron-goround-tc @fontsource/barlow-semi-condensed
   Requests to Google Fonts are answered from those files, so the pictures look the way players see the game. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'icons');
const FONTS = path.join(ROOT, 'build_tmp', 'fonts', 'node_modules', '@fontsource');
const PORT = 8776, BASE = 'http://127.0.0.1:' + PORT + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  });
});

function fontCss(pkg, sheets) {
  return sheets.map(s => fs.readFileSync(path.join(FONTS, pkg, s + '.css'), 'utf8')).join('\n')
    .replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg + '/');
}
async function withFonts(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', route => {
    const u = route.request().url();
    const css = /Chiron/.test(u) ? fontCss('chiron-goround-tc', ['400', '500', '700', '900'])
      : /Barlow/.test(u) ? fontCss('barlow-semi-condensed', ['600', '700', '700-italic', '800-italic']) : '';
    route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: css });
  });
  await ctx.route('https://fonts.gstatic.com/local/**', route => {
    const m = /\/local\/([^/]+)\/([^/?]+)/.exec(route.request().url());
    const f = m && path.join(FONTS, m[1], 'files', m[2]);
    if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: /woff2$/.test(f) ? 'font/woff2' : 'font/woff', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
}
// Lets the computer play the player's side too, so the picture shows a real, tidy game in progress.
const AUTOPLAY = `(function () {
  var p = ZZ.peek(), S = p.S, bot = new ZZ.Bot.BotPlayer(S.me, { pps: 1.5, depth: 2, hold: true, noise: 1, w: ZZ.Bot.LEVELS[3].w });
  window.__auto = setInterval(function () { var s = ZZ.peek().S; if (s && s.state === 'play' && !s.me.over) bot.update(50); }, 50);
})()`;
// Smaller files: the pictures are flat colours, so a 256-colour palette loses nothing the eye can see.
function squeeze(file) {
  execFileSync('python3', ['-I', '-c', [
    'import sys', 'from PIL import Image', 'f = sys.argv[1]', 'im = Image.open(f).convert("RGB")',
    'im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(f, optimize=True)'
  ].join('\n'), file]);
  return Math.round(fs.statSync(file).size / 1024) + ' KB';
}

(async () => {
  if (!fs.existsSync(path.join(FONTS, 'chiron-goround-tc'))) throw new Error('fonts missing: see the top of this file');
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (o, url) => {
    const ctx = await browser.newContext(Object.assign({ locale: 'zh-TW', colorScheme: 'light', serviceWorkers: 'block' }, o));
    await withFonts(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(url || BASE + '?sw=off&cloud=off');
    await page.evaluate(() => document.fonts.ready);
    await sleep(700);
    return page;
  };
  const match = async page => {
    await page.evaluate(() => { const g = ZZ.peek(); g.set.vol = 0; g.set.mvol = 0; ZZ.App.begin('battle', { mode: 'ai', level: 2, minutes: 2, items: false }); });
    await sleep(3600);
    await page.evaluate(AUTOPLAY);
    await sleep(21000);
  };

  // ---------- a match on a phone ----------
  let page = await open({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await match(page);
  await page.screenshot({ path: path.join(OUT, 'shot-phone.png') });
  console.log('shot-phone.png', squeeze(path.join(OUT, 'shot-phone.png')));
  await page.context().close();

  // ---------- a match on a desktop ----------
  page = await open({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await match(page);
  await page.screenshot({ path: path.join(OUT, 'shot-wide.png') });
  console.log('shot-wide.png', squeeze(path.join(OUT, 'shot-wide.png')));
  await page.context().close();

  // ---------- the link preview ----------
  page = await open({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.addStyleTag({ content: `
    #app { visibility: hidden; }
    #poster { position: fixed; inset: 0; z-index: 99; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 56px; padding: 0 84px 0 88px; visibility: visible; font-family: var(--display); color: #1B2530; }
    #poster .logo { font-size: 148px; gap: 22px; margin: 0 0 34px; }
    #poster .what { margin: 0 0 26px; font-size: 50px; font-weight: 900; line-height: 1.25; letter-spacing: 0.01em; }
    #poster .how { margin: 0; display: flex; flex-wrap: wrap; gap: 12px; }
    #poster .how span { padding: 9px 20px 10px; font-size: 26px; font-weight: 700; line-height: 1.3; background: #FAFBFC; border: 1px solid #BEC6CF; border-bottom: 4px solid #9AA5B2; border-radius: 14px; }
    #poster .how span.go { background: #222B36; border-color: #222B36; color: #E8EDF2; }
    #poster .hero-well { border-width: 6px; border-radius: 18px; box-shadow: 0 10px 0 rgba(27, 37, 48, 0.14); visibility: visible; }
  ` });
  await page.evaluate(() => {
    const p = document.createElement('div');
    p.id = 'poster';
    p.innerHTML = '<div><h1 class="logo"><span class="lt lt-t">轉</span><span class="lt lt-b">磚</span></h1>' +
      '<p class="what">兩分鐘一場的方塊對戰</p>' +
      '<p class="how"><span>打電腦</span><span>排位賽</span><span>朋友連線</span><span class="go">免費・打開就能玩</span></p></div><div class="well"></div>';
    document.body.appendChild(p);
    p.querySelector('.well').appendChild(document.querySelector('.hero-well'));
    const v = ZZ.peek().V.hero;
    v.resize(42);
  });
  // the little demo on the menu twists a T into its slot again and again; start it over and catch the gold T on its
  // way down, with the outline of where it will end up
  await page.evaluate(() => ZZ.peek().heroLoad());
  let seen = [];
  for (let i = 0; i < 40; i++) {
    await sleep(110);
    const s = await page.evaluate(() => { const h = ZZ.peek().hero, c = h.g && h.g.cur; return c ? { y: c.y, rot: c.rot, si: h.D.si, ai: h.D.ai } : null; });
    seen.push(s);
    if (s && s.ai >= 2) break;      // it has started to move: this is the moment
  }
  await sleep(60);
  await page.screenshot({ path: path.join(OUT, 'og.png') });
  console.log('og.png', squeeze(path.join(OUT, 'og.png')));
  await page.context().close();

  await browser.close();
  server.close();
  console.log(problems.length ? 'page errors: ' + problems.join('; ') : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });
