/* The side menu of the brick games (the same idea as 轉磚's): every game, the way back to 轉磚, and the player's
   corner (轉磚 coins, profile, SnowRealm sign-in). Put on every brick-game page with <script src="…/nav.js">;
   it adds its own button to the page's top bar (or the page header on the directory). */
(function () {
  'use strict';
  var here = location.pathname, inGame = /\/games\/[a-z]+\/?(index\.html)?$/.test(here), up = inGame ? '../../' : '../', g = inGame ? '../' : '';
  var T = function () { return window.SRW ? window.SRW.t.apply(null, arguments) : arguments[0]; };
  var GAMES = [['snake', 'snake'], ['breakout', 'ball'], ['stack', 'layers'], ['push', 'box'], ['merge', 'merge'], ['sort', 'sort'], ['picross', 'pixel'], ['pipes', 'pipe'], ['sweep', 'mine']];
  var M = window.SnowRealmMini, I = window.SnowRealmIcons, rec = null;
  try { rec = JSON.parse(localStorage.getItem('zhuanzhuan.meta.v1') || 'null'); } catch (e) { /* none */ }
  var name = rec && rec.name || T('nav.player'), coins = M && M.balance() != null ? M.balance() : '—', waiting = M ? M.waiting() : 0;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ic = function (n, cls) { return '<i class="ic' + (cls ? ' ' + cls : '') + '">' + (I ? I.svg(n) : '') + '</i>'; };
  var row = function (href, icon, label, more) { more = more || {}; return '<a href="' + href + '"' + (more.cur ? ' aria-current="page"' : '') + (more.ext ? ' target="_blank" rel="noopener"' : '') + '>' + ic(icon) + '<span>' + label + '</span>' + (more.badge ? '<b class="badge">' + more.badge + '</b>' : '') + ic(more.ext ? 'out' : 'chev', 'go') + '</a>'; };
  var grp = function (tone, title, rows) { return '<section class="dr-grp" data-tone="' + tone + '"><h3>' + title + '</h3><div class="dr-list">' + rows.join('') + '</div></section>'; };
  // the privacy policy and terms for the region chosen in 轉磚 (legal/<region>/)
  var region = '';
  try { region = (JSON.parse(localStorage.getItem('zhuanzhuan.consent.v1') || 'null') || {}).region || ''; } catch (e) { /* none */ }
  var legal = function (doc) { return /^[a-z]{2,5}$/.test(region) && region !== 'tw' ? up + 'legal/' + region + '/' + doc + '.html' : up + doc + '.html'; };
  var cur = (here.match(/\/games\/([a-z]+)/) || [])[1] || '';
  var h = '<div class="dr-head"><button class="dr-close" type="button" aria-label="' + T('nav.close') + '">✕</button>' +
    '<a class="dr-me" href="' + up + '?go=profile"><i class="dr-av">' + esc(Array.from(name)[0] || '磚') + '</i><span><b>' + esc(name) + '</b><small>' + T('nav.profileIn') + '</small></span></a>' +
    '<div class="dr-row"><span class="dr-coins"><i class="dr-coin"></i><b>' + coins + '</b></span><span class="dr-acct">' + (waiting ? T('nav.waiting', waiting) : T('nav.coins')) + '</span></div></div><nav class="dr-body">' +
    '<a class="dr-sr" href="https://games.snowrealm.pet/" target="_blank" rel="noopener">' + ic('snow') + '<span><b>SnowRealm Games</b><small>' + T('nav.srHome') + '</small></span>' + ic('out', 'go') + '</a>';
  var acct = [row(up + '?go=profile', 'user', T('nav.profile')), row(up + '?go=signin', 'key', T('nav.signin'))];
  if (waiting) acct.push(row(up + '?from=games', 'gift', T('nav.collect'), { badge: '+' + waiting }));
  h += grp('acct', T('nav.account'), acct);
  var games = [row(up, 'brick', T('nav.zz')), row(g, 'grid', T('nav.all'), { cur: !inGame })];
  GAMES.forEach(function (x) { games.push(row(g + x[0] + '/', x[1], T('n.' + x[0]), { cur: x[0] === cur })); });
  h += grp('games', T('nav.games'), games);
  h += grp('more', T('nav.more'), [row(legal('privacy'), 'shield', T('nav.privacy')), row(legal('terms'), 'doc', T('nav.terms'))]) + '</nav>';
  var dr = document.createElement('aside'), sc = document.createElement('div'), btn = document.createElement('button');
  dr.className = 'drawer'; dr.id = 'drawer'; dr.setAttribute('aria-hidden', 'true'); dr.setAttribute('aria-label', T('nav.menu')); dr.innerHTML = h;
  sc.className = 'scrim'; sc.hidden = true;
  btn.className = 'burger'; btn.type = 'button'; btn.setAttribute('aria-label', T('nav.open')); btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = '<i></i><i></i><i></i>';
  var bar = document.querySelector('.bar') || document.querySelector('.dir header');
  if (!bar) return;
  bar.insertBefore(btn, bar.firstChild);
  document.body.appendChild(sc); document.body.appendChild(dr);
  var open = false;
  function show(on) {
    open = on;
    dr.classList.toggle('open', on); dr.setAttribute('aria-hidden', String(!on)); sc.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) dr.querySelector('.dr-close').focus(); else btn.focus();
  }
  btn.addEventListener('click', function () {
    // a game in progress pauses while the menu is open
    var p = document.getElementById('pause');
    if (p && !p.disabled && p.textContent.trim() === T('g.pause')) p.click();
    show(true);
  });
  sc.addEventListener('click', function () { show(false); });
  dr.querySelector('.dr-close').addEventListener('click', function () { show(false); });
  document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { show(false); e.stopPropagation(); } }, true);
  var sx = null;
  dr.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  dr.addEventListener('touchend', function (e) { if (sx != null && sx - e.changedTouches[0].clientX > 60) show(false); sx = null; }, { passive: true });
})();

// the loading screen goes once the page has everything (a short moment at least, so it does not just flicker)
(function () {
  var b = document.getElementById('gboot');
  if (!b) return;
  var t0 = (window.performance && performance.timing && performance.timing.navigationStart) || Date.now();
  function done() { setTimeout(function () { b.classList.add('done'); setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 350); }, Math.max(0, 450 - (Date.now() - t0))); }
  if (document.readyState === 'complete') done(); else window.addEventListener('load', done);
})();
