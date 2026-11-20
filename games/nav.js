/* The side menu of the brick games (the same idea as 轉磚's): every game, the way back to 轉磚, and the player's
   corner (轉磚 coins, profile, SnowRealm sign-in). Put on every brick-game page with <script src="…/nav.js">;
   it adds its own button to the page's top bar (or the page header on the directory). */
(function () {
  'use strict';
  var here = location.pathname, inGame = /\/games\/[a-z]+\/?(index\.html)?$/.test(here), up = inGame ? '../../' : '../', g = inGame ? '../' : '';
  var GAMES = [['snake', '磚蛇'], ['breakout', '打磚塊'], ['stack', '疊磚塔'], ['push', '推磚倉庫'], ['merge', '磚塊合成'], ['sort', '分磚'], ['picross', '磚畫謎'], ['pipes', '磚道'], ['sweep', '掃磚']];
  var M = window.SnowRealmMini, rec = null;
  try { rec = JSON.parse(localStorage.getItem('zhuanzhuan.meta.v1') || 'null'); } catch (e) { /* none */ }
  var name = rec && rec.name || '玩家', coins = M && M.balance() != null ? M.balance() : '—', waiting = M ? M.waiting() : 0;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var cur = (here.match(/\/games\/([a-z]+)/) || [])[1] || '';
  var h = '<div class="dr-head"><button class="dr-close" type="button" aria-label="關閉">✕</button>' +
    '<a class="dr-me" href="' + up + '?go=profile"><i class="dr-av">' + esc(Array.from(name)[0] || '磚') + '</i><span><b>' + esc(name) + '</b><small>個人資料（在轉磚）</small></span></a>' +
    '<div class="dr-row"><span class="dr-coins"><i class="dr-coin"></i><b>' + coins + '</b></span><span class="dr-acct">' + (waiting ? '+' + waiting + ' 待入帳' : '轉磚金幣') + '</span></div></div><nav class="dr-body">' +
    '<h3>我的帳號</h3><a href="' + up + '?go=profile">個人資料</a><a href="' + up + '?go=signin">登入／註冊</a>' + (waiting ? '<a href="' + up + '?from=games">回轉磚領 ' + waiting + ' 金幣</a>' : '') +
    '<h3>磚塊遊戲</h3><a href="' + up + '">轉磚</a><a href="' + g + '"' + (inGame ? '' : ' aria-current="page"') + '>全部遊戲</a>';
  GAMES.forEach(function (x) { h += '<a href="' + g + x[0] + '/"' + (x[0] === cur ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; });
  h += '<h3>其他</h3><a href="' + up + 'privacy.html">隱私政策</a><a href="' + up + 'terms.html">使用條款</a><a href="https://games.snowrealm.pet/" target="_blank" rel="noopener">SnowRealm Games ↗</a></nav>';
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
