/* 轉磚 side menu: everything the menu page offers, gathered in one panel that slides in from the left, with the
   player's own corner on top (profile, SnowRealm sign-in, cloud save, sign out). The page keeps all its own buttons;
   the panel's buttons use the same data-go / data-sheet names, so the menu's own click handler runs them. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta;
  L.add({
    'dr.open': ['打開選單', 'Open the menu', 'メニューを開く', '메뉴 열기'],
    'dr.title': ['選單', 'Menu', 'メニュー', '메뉴'],
    'dr.account': ['我的帳號', 'My account', 'アカウント', '내 계정'],
    'dr.profile': ['個人資料', 'Profile', 'プロフィール', '프로필'],
    'dr.logout': ['登出', 'Sign out', 'ログアウト', '로그아웃'],
    'dr.rewards': ['金幣與獎勵', 'Coins and rewards', 'コインと報酬', '코인과 보상'],
    'dr.games': ['磚塊遊戲', 'Brick games', 'ブロックゲーム', '블록 게임'],
    'dr.allGames': ['全部遊戲', 'All games', 'すべてのゲーム', '모든 게임'],
    'dr.more': ['其他', 'More', 'その他', '기타'],
    'dr.srHome': ['平台主頁・所有遊戲', 'Platform home · every SnowRealm game', 'プラットフォーム・全ゲーム', '플랫폼 홈 · 모든 게임'],
    'dr.guest': ['訪客・存在這台裝置', 'Guest · saved on this device', 'ゲスト・この端末に保存', '게스트 · 이 기기에 저장'],
    'dr.cloud': ['訪客・雲端存檔', 'Guest · cloud save', 'ゲスト・クラウド保存', '게스트 · 클라우드 저장'],
    'dr.linked': ['已連結 SnowRealm Games', 'Linked to SnowRealm Games', 'SnowRealm Games 連携済み', 'SnowRealm Games 연결됨'],
    'dr.logoutT': ['登出', 'Sign out', 'ログアウト', '로그아웃'],
    'dr.logoutP': ['轉磚現在不用帳號密碼，你的存檔是跟著這台裝置走的。這時候登出，這台就找不回存檔了，所以要等存檔綁好 SnowRealm 帳號以後才能登出（登出後用帳號登入就能找回來）。', '轉磚 has no password today: your save goes with this device. Signing out now would leave this device unable to find it again, so signing out opens once the save is linked to a SnowRealm account (sign back in to get it back).', '現在の轉磚にはパスワードがなく、セーブはこの端末に紐づいています。今ログアウトすると見つけられなくなるため、SnowRealm アカウント連携後に利用できます。', '지금 轉磚는 비밀번호 없이 이 기기에 저장돼요. 지금 로그아웃하면 다시 찾을 수 없어서, SnowRealm 계정 연결 후에 로그아웃할 수 있어요.'],
    'dr.logoutMove': ['想換裝置的話，用「雲端存檔」裡的引繼碼。', 'To move to another device, use a transfer code in "Cloud save".', '端末を移すにはクラウドセーブの引き継ぎコードを使ってください。', '기기를 옮기려면 클라우드 저장의 이전 코드를 쓰세요.']
  });
  var $ = function (id) { return document.getElementById(id); };
  var open = false, lastFocus = null;
  function fill() {
    var d = Meta.data, r = Meta.rankOf(d.rp), name = d.name || t('player');
    App.txt('drName', name);
    App.txt('drRank', t('xp.lv', Meta.level().lv) + ' · ' + App.rankName(r));
    App.txt('drCoins', L.num(d.coins));
    $('drAv').textContent = Array.from(name)[0] || '磚';
    var C = ZZ.Cloud, st = C && C.status ? C.status() : 'none';
    App.txt('drAcct', t(App.srLinked && App.srLinked() ? 'dr.linked' : st === 'ok' || st === 'busy' || st === 'wait' ? 'dr.cloud' : 'dr.guest'));
    $('drJobsDot').hidden = !(Meta.jobsReady() > 0);
    if ($('drSignDot')) $('drSignDot').hidden = !Meta.loginDue();
    $('drBoxDot').hidden = !(Meta.drawsLeft && Meta.drawsLeft() > 0);
    $('drBoard').hidden = $('mBoard') ? $('mBoard').hidden : true;
  }
  function show(on) {
    var dr = $('drawer'), sc = $('drawerScrim'), btn = $('mDrawer');
    if (on === open) return;
    open = on;
    if (on) { fill(); lastFocus = document.activeElement; }
    dr.classList.toggle('open', on);
    dr.setAttribute('aria-hidden', String(!on));
    sc.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    // the rest of the page cannot be tabbed into while the panel is open
    var inert = document.querySelector('#menu .menu-in');
    if (inert) { if (on) inert.setAttribute('inert', ''); else inert.removeAttribute('inert'); }
    if (on) setTimeout(function () { $('drClose').focus(); }, 30);
    else if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  App.drawer = show;
  App.sheets.drLogout = function () {
    if (App.srLinked && App.srLinked()) return '<h2>' + t('sr.outT') + '</h2><p>' + t('sr.outP') + '</p><div class="row">' + App.btn('srOut', 'dr.logout', true) + App.btn('close', 'close') + '</div>';
    return '<h2>' + t('dr.logoutT') + '</h2><p>' + t('dr.logoutP') + '</p><p class="note">' + t('dr.logoutMove') + '</p>' +
      '<div class="row">' + App.btn('cloud', 'cl.title') + App.btn('close', 'close', true) + '</div>';
  };
  App.boot.push(function () {
    if (window.SnowRealmIcons) window.SnowRealmIcons.fill($('drawer'));
    $('mDrawer').addEventListener('click', function () { show(true); });
    $('drClose').addEventListener('click', function () { show(false); });
    $('drawerScrim').addEventListener('click', function () { show(false); });
    // any entry closes the panel; the menu's own handler then does what the entry says
    $('drawer').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-sheet], button[data-go], a'); if (b) show(false); });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { show(false); e.stopPropagation(); } }, true);
    // swipe the panel back to the left to close it
    var sx = null;
    $('drawer').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    $('drawer').addEventListener('touchend', function (e) { if (sx != null && sx - e.changedTouches[0].clientX > 60) show(false); sx = null; }, { passive: true });
    if (Meta.onChange) { var was = Meta.onChange; Meta.onChange = function () { was.apply(this, arguments); if (open) fill(); }; }
    // links from the brick games: ?go=profile, ?go=signin
    try {
      var go = new URLSearchParams(window.location.search).get('go');
      if (go === 'profile' || go === 'signin') setTimeout(function () { if (!App.sheet()) App.openSheet(go === 'profile' ? 'profile' : 'srAccount'); }, 300);
    } catch (e) { /* no query */ }
  });
})();
