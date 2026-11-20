/* 轉磚 service worker: keeps a copy of the game so it opens without a connection and can be installed as an app.
   (This file is src/sw.template.js; build.js stamps it with the build and writes it to sw.js beside the page.)

   What it does, and on purpose does not do:
   - The page itself is always fetched from the network first. Only when that fails, or takes too long, is the kept
     copy used. So a new version is never held back by an old copy, and a player who is online always has the latest.
   - Music, icons and the like are answered from the copy at once (they are big and rarely change) and kept after the
     first time they are fetched.
   - Anything under api/ is left completely alone: rooms, saves and leaderboards always talk to the server.
   - Requests to other sites (fonts) and anything that is not a plain GET are not touched. */
'use strict';
const BUILD = 'e6f0cedb130e';
const PAGE = 'zz-page-' + BUILD, FILES = 'zz-files-v1';
const HOME = new URL('./', self.location).href;                 // where the game lives (the folder of this file)
const FIRST = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/favicon.svg', 'favicon.ico'];
const PAGE_WAIT = 4000;                                           // how long the network gets before the kept copy is shown

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const page = await caches.open(PAGE);
    const res = await fetch(new Request(HOME, { cache: 'reload' }));
    if (!res.ok || res.redirected || res.type !== 'basic') throw new Error('the page could not be fetched');   // (a sign-in wall, for one): do not install over it
    await page.put(HOME, res);
    const files = await caches.open(FILES);
    await Promise.all(FIRST.map(u => files.add(new Request(new URL(u, HOME).href, { cache: 'reload' })).catch(() => { /* fetched later, when asked for */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.indexOf('zz-') === 0 && k !== PAGE && k !== FILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function keepable(res) { return !!res && res.status === 200 && res.type === 'basic' && !res.redirected; }

// The page: network first, the kept copy when there is no answer in time.
async function page(event) {
  const cache = await caches.open(PAGE);
  const fresh = fetch(event.request).then(res => {
    if (keepable(res)) event.waitUntil(cache.put(HOME, res.clone()));
    return res;
  });
  const kept = await cache.match(HOME);
  if (!kept) return fresh;
  let timer = 0;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), PAGE_WAIT); });
  try {
    const res = await Promise.race([fresh, late]);
    if (res && res.status < 500) return res;   // (whatever the server said: a newer page, a redirect, "sign in first")
    if (!res) event.waitUntil(fresh.catch(() => {}));   // too slow: show the copy now, and let the answer refresh it when it comes
    return kept;                               // …or the server is having a bad moment
  } catch (e) {
    return kept;                               // no connection
  } finally {
    clearTimeout(timer);
  }
}

// Music and pictures: the copy if there is one, otherwise the network, keeping what comes back.
async function file(event, refresh) {
  const cache = await caches.open(FILES), req = event.request;
  const kept = await cache.match(req, { ignoreSearch: true });
  const get = () => fetch(req).then(res => {
    if (keepable(res)) event.waitUntil(cache.put(req, res.clone()));
    return res;
  });
  if (!kept) return get();
  if (refresh) event.waitUntil(get().catch(() => {}));   // small files are looked at again in the background
  return kept;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.url.indexOf(HOME) !== 0 || req.headers.has('range')) return;
  const path = req.url.slice(HOME.length).split(/[?#]/)[0];
  if (path.indexOf('api/') === 0) return;
  if (path === '' || path === 'index.html') return event.respondWith(page(event));      // (other documents in this folder are not the game)
  if (/^audio\//.test(path)) return event.respondWith(file(event, false));
  if (/^(icons|vendor)\//.test(path) || path === 'manifest.webmanifest' || path === 'favicon.ico') return event.respondWith(file(event, true));
});
