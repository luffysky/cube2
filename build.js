'use strict';
/* Puts the game together.
     node build.js
   Writes, in the project root:
     index.html            the whole game in one page (src/index.template.html with every script and the stylesheet inlined)
     manifest.webmanifest  what "install this app" needs to know
     sw.js                 the service worker (from src/sw.template.js), stamped with this build
     robots.txt, sitemap.xml
   The page is written to the root so a plain static host can serve the repository as it is. Music sits beside it in
   audio/, icons in icons/ (drawn by tools/make_icons.py and tools/shots.js).

   SITE is the address the game is published at. Search engines and link previews need full addresses, so it is
   written into the page (canonical link, preview picture) and into robots.txt and sitemap.xml. When the game moves to
   its own domain, change it here (or set ZZ_SITE) and build again. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = (process.env.ZZ_SITE || 'https://cube2-xi.vercel.app').replace(/\/+$/, '');
const root = __dirname;
const src = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let html = src('index.template.html');

// ---------- words: the game's own dictionary, read the way the page reads it ----------
const ZZ = require('./src/engine.js');
require('./src/hans-map.js'); require('./src/i18n.js');
const L = ZZ.L;
for (const f of ['modes.js', 'shop.js', 'cloud.js']) {      // the dictionaries of the browser-only files, without running their screens
  const s = src(f), a = s.indexOf('L.add({'), b = s.indexOf('});', a);
  if (a >= 0) new Function('L', s.slice(a, b + 3))(L);
}
L.set('zh-Hant');
const t = k => L.t(k);
const LANGS = L.LANGS.map(x => x[0]);

// Search engines that do not run scripts, and the first moment before the page's own script has run, see the
// Traditional Chinese text instead of an empty frame. The page fills in the reader's language right after.
html = html.replace(/(<(\w+)\b[^>]*\bdata-t="([^"]+)"[^>]*>)(<\/\2>)/g, (all, open, tag, key, close) => (L.has(key) ? open + esc(t(key)) + close : all));

const jsonld = {
  '@context': 'https://schema.org',
  '@type': ['VideoGame', 'WebApplication'],
  name: t('title'), alternateName: ['轉磚', 'Zhuan Zhuan Battle'],
  url: SITE + '/', image: SITE + '/icons/og.png', screenshot: SITE + '/icons/shot-wide.png',
  description: t('seo.desc'),
  applicationCategory: 'GameApplication', genre: ['Puzzle', 'Versus'],
  gamePlatform: ['Web browser', 'Android', 'iOS', 'Windows', 'macOS'], operatingSystem: 'Any',
  browserRequirements: 'A current browser with JavaScript',
  playMode: ['SinglePlayer', 'MultiPlayer'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2 },
  inLanguage: LANGS, isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD', availability: 'https://schema.org/InStock' }
};
const words = {
  SITE, NAME: t('title'), SHORT: '轉磚', TITLE: t('seo.title'), DESC: t('seo.desc'),
  OG_TITLE: '轉磚對戰｜兩分鐘一場的方塊對戰', OG_DESC: '把方塊轉進洞裡，送對手一面水泥牆。打電腦、爬排位、開房間和朋友連線，手機電腦打開就能玩。',
  OG_ALT: '轉磚對戰的遊戲畫面：一面磁磚牆，金色的 T 正要轉進洞裡'
};
html = html.replace(/\{\{(\w+)\}\}/g, (all, k) => {
  if (k === 'JSONLD') return JSON.stringify(jsonld).replace(/</g, '\\u003c');
  if (!(k in words)) throw new Error('unknown word {{' + k + '}} in the template');
  return esc(words[k]);
});
// ---------- the page: scripts and stylesheet go in last, so nothing above can touch their text ----------
const parts = { CSS: 'style.css', ENGINE: 'engine.js', HANS: 'hans-map.js', I18N: 'i18n.js', BOT: 'bot.js', DRILLS: 'drills.js', OPENERS: 'openers.js', META: 'meta.js',
  SFX: 'sfxdata.js', VIEW: 'view.js', REPLAY: 'replay.js', UI: 'ui.js', NET: 'net.js', MODES: 'modes.js', PWA: 'pwa.js', SHOP: 'shop.js', CLOUD: 'cloud.js' };
for (const [k, f] of Object.entries(parts)) {
  const body = src(f);
  if (body.includes('</script')) throw new Error(f + ' contains a closing script tag');
  const mark = '/*__' + k + '__*/';
  if (!html.includes(mark)) throw new Error('missing marker ' + mark);
  html = html.split(mark).join(body.trim());
}
fs.writeFileSync(path.join(root, 'index.html'), html);

// ---------- which scripts the page may run ----------
// The page's own scripts are written into it, so the browser is told exactly which ones they are (by their hashes)
// and runs nothing else: text that somehow got into the page as a script, or one from another address, stays dead.
// The list goes out as a header from vercel.json, and the local dev server sends the same header.
const hashes = [];
html.replace(/<script>([\s\S]*?)<\/script>/g, (all, body) => { hashes.push("'sha256-" + crypto.createHash('sha256').update(body).digest('base64') + "'"); return all; });
const CSP = [
  "default-src 'self'",
  "script-src 'self' " + hashes.join(' '),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",      // the page sizes things with style attributes
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"
].join('; ');
const vfile = path.join(root, 'vercel.json'), vj = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const all = vj.headers.find(h => h.source === '/(.*)');
all.headers = all.headers.filter(h => h.key !== 'Content-Security-Policy').concat([{ key: 'Content-Security-Policy', value: CSP }]);
fs.writeFileSync(vfile, JSON.stringify(vj, null, 2) + '\n');
const build = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);

// ---------- the app manifest ----------
const manifest = {
  id: './', name: t('title'), short_name: '轉磚', description: t('seo.about'),
  lang: 'zh-Hant', dir: 'ltr', start_url: './?source=pwa', scope: './',
  display: 'standalone', display_override: ['standalone', 'minimal-ui'], orientation: 'any',
  background_color: '#E4E7EA', theme_color: '#E4E7EA', categories: ['games', 'entertainment'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
  ],
  screenshots: [
    { src: 'icons/shot-phone.png', sizes: '1080x2160', type: 'image/png', form_factor: 'narrow', label: '手機上的對戰畫面' },
    { src: 'icons/shot-wide.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: '電腦上的對戰畫面' }
  ].filter(s => fs.existsSync(path.join(root, s.src))),
  shortcuts: [['quick', 'net.quick'], ['rank', 'm.rank'], ['online', 'm.online'], ['sprint', 'm.sprint']].map(([go, key]) => ({
    name: t(key), url: './?go=' + go, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  }))
};
fs.writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

// ---------- the service worker ----------
fs.writeFileSync(path.join(root, 'sw.js'), src('sw.template.js').split('__BUILD__').join(build));

// ---------- for search engines ----------
fs.writeFileSync(path.join(root, 'robots.txt'), [
  'User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /src/', 'Disallow: /server/', 'Disallow: /test/', 'Disallow: /tools/', 'Disallow: /docs/', 'Disallow: /vendor/',
  '', 'Sitemap: ' + SITE + '/sitemap.xml', ''
].join('\n'));
const alt = l => '    <xhtml:link rel="alternate" hreflang="' + l + '" href="' + SITE + '/' + (l === 'zh-Hant' ? '' : '?lang=' + l) + '"/>';
const now = new Date(), two = n => String(n).padStart(2, '0');
const day = now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate());   // (the day here, not the day in UTC)
fs.writeFileSync(path.join(root, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...LANGS.map(l => ['  <url>', '    <loc>' + SITE + '/' + (l === 'zh-Hant' ? '' : '?lang=' + l) + '</loc>', '    <lastmod>' + day + '</lastmod>',
    ...LANGS.map(alt), '    <xhtml:link rel="alternate" hreflang="x-default" href="' + SITE + '/"/>', '  </url>'].join('\n')),
  '</urlset>', ''
].join('\n'));

console.log('built index.html', (html.length / 1024).toFixed(1) + ' KB', '· build', build, '· site', SITE);
