/* 轉磚 and the brick games (games/): when 轉磚 opens, it pays the results the brick games left in this browser's
   queue (games/rewards.js) through Meta, so they reach the player's record, and the server with a cloud save. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, MINI = window.SnowRealmMini;
  L.add({
    'mg.paid': ['磚塊小遊戲：+{0} 金幣入帳', 'Brick games: +{0} coins', 'ブロックゲーム：+{0}コイン', '블록 게임: +{0} 코인'],
    'mg.cap': ['磚塊小遊戲今天的金幣已經拿滿了（每天最多 {0}）', 'Brick games have paid their most for today ({0})', 'ブロックゲームの今日のコインは上限です（{0}）', '오늘 블록 게임 코인을 다 받았어요 ({0})']
  });
  function settle() {
    if (!MINI) return;
    var q = MINI.take(), got = 0, capped = false;
    q.forEach(function (r) {
      var res = Meta.miniDone({ game: r.game, lv: r.lv, value: r.value, stars: r.stars, ms: r.ms });
      if (res && res.ok) { got += res.coins; if (!res.coins && r.est) capped = true; }
    });
    if (got) App.toast(t('mg.paid', got), 3600);
    else if (capped && Meta.data.daily.mini >= MINI.DAY_CAP) App.toast(t('mg.cap', MINI.DAY_CAP), 3600);
    if (q.length && App.refreshMenu) App.refreshMenu();
  }
  App.settleMinis = settle;
  // a moment after opening, so a cloud save has been looked for first; and again when the tab comes back
  App.boot.push(function () { setTimeout(settle, 1500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) settle(); });
})();
