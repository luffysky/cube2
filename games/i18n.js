/* The brick games' words. games/words.js (made by build.js from src/games-dict.js and the machine translations)
   holds every word as [繁體, 简体, English, 日本語, 한국어]. The language is the one picked in 轉磚 (or ?lang=, or
   the browser's). Pages mark their text with data-t (text), data-ta (aria-label), data-tp (placeholder); scripts
   call SRW.t('key', a, b) with {0} {1} blanks. Runs right after words.js, before the game's own script. */
(function (root) {
  'use strict';
  var COL = { 'zh-Hant': 0, 'zh-Hans': 1, en: 2, ja: 3, ko: 4 }, HTML_LANG = { 'zh-Hant': 'zh-Hant', 'zh-Hans': 'zh-Hans', en: 'en', ja: 'ja', ko: 'ko' };
  var D = root.SRW_WORDS || {};
  function pick(list) {
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase();
      if (!l) continue;
      if (l.indexOf('zh') === 0) return /hans|cn|sg|my/.test(l) ? 'zh-Hans' : (/hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans');
      if (l.indexOf('ja') === 0) return 'ja';
      if (l.indexOf('ko') === 0) return 'ko';
      if (l.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }
  function chosen() {
    try { var u = new URLSearchParams(root.location.search).get('lang'); if (u && COL[u] != null) return u; } catch (e) { /* none */ }
    try { var s = JSON.parse(root.localStorage.getItem('zhuanzhuan.v2') || 'null'); if (s && s.set && COL[s.set.lang] != null) return s.set.lang; } catch (e) { /* none */ }
    var nav = root.navigator || {};
    return pick(nav.languages && nav.languages.length ? nav.languages : [nav.language || 'zh-TW']);
  }
  var W = {
    lang: chosen(),
    t: function (key) {
      var e = D[key], s;
      if (!e) return key;
      s = e[COL[W.lang]] || e[0];
      for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
      return s;
    },
    num: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    // fills a page (or a part of one) in the chosen language
    apply: function (el) {
      el = el || document;
      var list = el.querySelectorAll('[data-t],[data-ta],[data-tp],[data-th],[data-tk]'), i, n, v;
      for (i = 0; i < list.length; i++) {
        n = list[i];
        if (n.hasAttribute('data-t')) n.textContent = W.t(n.getAttribute('data-t'));
        // data-th: our own words with markup in them; data-tk: words around a number the game keeps updating
        // (data-tv is the id of that number's <i>, which is kept)
        if (n.hasAttribute('data-th')) n.innerHTML = W.t(n.getAttribute('data-th'));
        if (n.hasAttribute('data-tk')) { v = n.querySelector('#' + n.getAttribute('data-tv')); n.innerHTML = W.t(n.getAttribute('data-tk'), '<i id="' + n.getAttribute('data-tv') + '">' + (v ? v.textContent : '') + '</i>'); }
        if (n.hasAttribute('data-ta')) n.setAttribute('aria-label', W.t(n.getAttribute('data-ta')));
        if (n.hasAttribute('data-tp')) n.setAttribute('placeholder', W.t(n.getAttribute('data-tp')));
      }
      if (el === document) {
        var h = document.documentElement, tk = h.getAttribute('data-title'), dk = h.getAttribute('data-desc');
        h.setAttribute('lang', HTML_LANG[W.lang]);
        if (tk) document.title = W.t(tk) + ' · ' + (tk === 'dir.title' ? 'SnowRealm' : W.t('g.site'));
        if (dk) { var m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute('content', W.t(dk)); }
      }
    }
  };
  root.SRW = W;
  // loaded at the end of <body>, before the game's own script: the page above is all there, so fill it now (the game
  // then sets its own changing text through SRW.t)
  if (typeof document !== 'undefined' && document.body) W.apply();
})(typeof window !== 'undefined' ? window : this);
