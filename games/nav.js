/* The side menu of the brick games (the same idea as 轉磚's): every game, the way back to 轉磚, and the player's
   corner (轉磚 coins, profile, SnowRealm sign-in). Put on every brick-game page with <script src="…/nav.js">;
   it adds its own button to the page's top bar (or the page header on the directory). */
(function () {
  'use strict';
  var here = location.pathname, inGame = /\/games\/[a-z]+\/?(index\.html)?$/.test(here), up = inGame ? '../../' : '../', g = inGame ? '../' : '';
  var GAMES = [['snake', '磚蛇', 'snake'], ['breakout', '打磚塊', 'ball'], ['stack', '疊磚塔', 'layers'], ['push', '推磚倉庫', 'box'], ['merge', '磚塊合成', 'merge'], ['sort', '分磚', 'sort'], ['picross', '磚畫謎', 'pixel'], ['pipes', '磚道', 'pipe'], ['sweep', '掃磚', 'mine']];
  var M = window.SnowRealmMini, I = window.SnowRealmIcons, rec = null;
  try { rec = JSON.parse(localStorage.getItem('zhuanzhuan.meta.v1') || 'null'); } catch (e) { /* none */ }
  var name = rec && rec.name || '玩家', coins = M && M.balance() != null ? M.balance() : '—', waiting = M ? M.waiting() : 0;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ic = function (n, cls) { return '<i class="ic' + (cls ? ' ' + cls : '') + '">' + (I ? I.svg(n) : '') + '</i>'; };
  var row = function (href, icon, label, more) { more = more || {}; return '<a href="' + href + '"' + (more.cur ? ' aria-current="page"' : '') + (more.ext ? ' target="_blank" rel="noopener"' : '') + '>' + ic(icon) + '<span>' + label + '</span>' + (more.badge ? '<b class="badge">' + more.badge + '</b>' : '') + ic(more.ext ? 'out' : 'chev', 'go') + '</a>'; };
  var grp = function (tone, title, rows) { return '<section class="dr-grp" data-tone="' + tone + '"><h3>' + title + '</h3><div class="dr-list">' + rows.join('') + '</div></section>'; };
  var cur = (here.match(/\/games\/([a-z]+)/) || [])[1] || '';
  var h = '<div class="dr-head"><button class="dr-close" type="button" aria-label="關閉">✕</button>' +
    '<a class="dr-me" href="' + up + '?go=profile"><i class="dr-av">' + esc(Array.from(name)[0] || '磚') + '</i><span><b>' + esc(name) + '</b><small>個人資料（在轉磚）</small></span></a>' +
    '<div class="dr-row"><span class="dr-coins"><i class="dr-coin"></i><b>' + coins + '</b></span><span class="dr-acct">' + (waiting ? '+' + waiting + ' 待入帳' : '轉磚金幣') + '</span></div></div><nav class="dr-body">' +
    '<a class="dr-sr" href="https://games.snowrealm.pet/" target="_blank" rel="noopener">' + ic('snow') + '<span><b>SnowRealm Games</b><small>平台主頁・所有遊戲</small></span>' + ic('out', 'go') + '</a>';
  var acct = [row(up + '?go=profile', 'user', '個人資料'), row(up + '?go=signin', 'key', '登入／註冊')];
  if (waiting) acct.push(row(up + '?from=games', 'gift', '回轉磚領金幣', { badge: '+' + waiting }));
  h += grp('acct', '我的帳號', acct);
  var games = [row(up, 'brick', '轉磚'), row(g, 'grid', '全部遊戲', { cur: !inGame })];
  GAMES.forEach(function (x) { games.push(row(g + x[0] + '/', x[2], x[1], { cur: x[0] === cur })); });
  h += grp('games', '磚塊遊戲', games);
  h += grp('more', '其他', [row(up + 'privacy.html', 'shield', '隱私政策'), row(up + 'terms.html', 'doc', '使用條款')]) + '</nav>';
  var dr = document.createElement('aside'), sc = document.createElement('div'), btn = document.createElement('button');
  dr.className = 'drawer'; dr.id = 'drawer'; dr.setAttribute('aria-hidden', 'true'); dr.setAttribute('aria-label', '選單'); dr.innerHTML = h;
  sc.className = 'scrim'; sc.hidden = true;
  btn.className = 'burger'; btn.type = 'button'; btn.setAttribute('aria-label', '打開選單'); btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = '<i></i><i></i><i></i>';
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
    if (p && !p.disabled && p.textContent.trim() === '暫停') p.click();
    show(true);
  });
  sc.addEventListener('click', function () { show(false); });
  dr.querySelector('.dr-close').addEventListener('click', function () { show(false); });
  document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { show(false); e.stopPropagation(); } }, true);
  var sx = null;
  dr.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  dr.addEventListener('touchend', function (e) { if (sx != null && sx - e.changedTouches[0].clientX > 60) show(false); sx = null; }, { passive: true });
})();
