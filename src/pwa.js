/* 轉磚 as an installable app: registers the service worker (sw.js, which keeps a copy of the game for offline play),
   offers "install" in the menu where the browser can do that, and opens the game straight into a mode when the
   address asks for one (?go=sprint; the app's shortcuts use it). */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, t = ZZ.L.t, btn = App.btn;
  var $ = function (id) { return document.getElementById(id); };
  var nav = window.navigator, ask = null;      // ask: the browser's own install prompt, kept until the player wants it
  var kept = false;                            // the service worker is in place: this is the game on its own site, not a copy of the page somewhere else
  function param(k) { try { return new URLSearchParams(window.location.search).get(k) || ''; } catch (e) { return ''; } }
  function standalone() {
    try { return nav.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches); } catch (e) { return false; }
  }
  function ios() { return /iphone|ipad|ipod/i.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1); }
  // chat apps' built-in browsers cannot install anything; neither can a page shown inside another iPhone app (those do not call themselves Safari)
  function inApp() { var ua = nav.userAgent || ''; return /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(ua) || (ios() && !/Safari/i.test(ua)); }
  function showLink() {
    var e = $('mInstall');
    if (e) e.hidden = standalone() || !(ask || (kept && ios() && !inApp()));      // (an iPhone never offers by itself: explain the Share menu, but only where there is something to install)
  }

  App.dismiss.install = 1;
  App.sheets.install = function () {
    var h = '<h2>' + t('pwa.iosT') + '</h2>';
    if (ios() && !inApp()) h += App.ul(['pwa.ios1', 'pwa.ios2', 'pwa.ios3']);
    else h += '<p>' + t('pwa.other') + '</p>';
    return h + '<p class="note">' + t('pwa.offline') + '</p><div class="row">' + btn('close', 'ok', true) + '</div>';
  };
  App.acts.install = function () {
    if (!ask) return App.openSheet('install');
    var p = ask;
    ask = null;
    try {
      p.prompt();
      if (p.userChoice && p.userChoice.then) p.userChoice.then(function () { showLink(); }, function () { showLink(); });
    } catch (e) { App.openSheet('install'); }
    showLink();
  };

  App.boot.push(function () {
    var link = $('mInstall');
    if (link) link.addEventListener('click', function () { App.acts.install(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ask = e; showLink(); });
    window.addEventListener('appinstalled', function () { ask = null; showLink(); App.toast(t('pwa.done'), 3600); });
    showLink();
    // a copy for offline play. Not inside previews and other places that cannot run one.
    var ok = false;
    try { ok = 'serviceWorker' in nav && /^https?:$/.test(window.location.protocol) && param('sw') !== 'off'; } catch (e) { ok = false; }
    if (ok) {
      var reg = function () { try { nav.serviceWorker.register('sw.js').then(function () { kept = true; showLink(); }, function () { /* the game works without it */ }); } catch (e) { /* same */ } };
      if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
    }
    // ?go=sprint opens that mode. An invite to a room (?room=) comes first.
    var go = param('go');
    if (go && !param('room') && App.goTo) setTimeout(function () { if (App.screen() === 'menu' && !App.sheet()) App.goTo(go); }, 60);
  });
  ZZ.PWA = { standalone: standalone };
})();
