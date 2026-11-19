/* 轉磚 bonus corner (福利): free coins for a watched ad, and the member's way to take the same without an ad.

   Ads pay only through the server: the ad network's signed callback (server/ads.js) credits the player whose public
   tag the ad carried. Until an ad account is approved and the callback is set up, /api/health says ads: false and
   the button stays off. A member takes the reward without an ad, from the same daily count. No ads under 13. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, esc = App.esc, btn = App.btn;
  var adsOn = false, asked = false;

  L.add({
    'bn.title': ['福利', 'Freebies', 'ボーナス', '보너스'],
    'bn.adH': ['看廣告領金幣', 'Coins for an ad', '広告を見てコイン', '광고 보고 코인 받기'],
    'bn.adP': ['自己想看才看，一次 {0} 金幣。今天還能領 {1} 次（每天 {2} 次）。', 'Only if you want to: {0} coins each. {1} left today ({2} a day).', '見たいときだけ。1 回 {0} コイン。今日はあと {1} 回（1 日 {2} 回）。', '원할 때만 보세요. 한 번에 {0}코인. 오늘 {1}번 남음(하루 {2}번).'],
    'bn.watch': ['看廣告領 {0} 金幣', 'Watch an ad for {0} coins', '広告を見て {0} コイン', '광고 보고 {0}코인'],
    'bn.off': ['廣告還沒開通，開通後就能領。', 'Ads are not switched on yet.', '広告はまだ準備中です。', '광고는 아직 준비 중입니다.'],
    'bn.member': ['會員直接領 {0} 金幣', 'Member: take {0} coins', '会員はそのまま {0} コイン', '회원 바로 {0}코인'],
    'bn.memberP': ['會員不用看廣告，直接領，跟看廣告共用每天的次數。', 'Members take it without an ad, from the same daily count.', '会員は広告なしで受け取れます（1 日の回数は共通）。', '회원은 광고 없이 받을 수 있습니다(하루 횟수 공유).'],
    'bn.got': ['拿到 {0} 金幣', 'Got {0} coins', '{0} コイン獲得', '{0}코인 획득'],
    'bn.wait': ['領取中…', 'Collecting…', '受け取り中…', '받는 중…'],
    'bn.none': ['今天的次數用完了，明天再來。', 'None left today. Come back tomorrow.', '今日の回数は終わりです。また明日。', '오늘 횟수를 다 썼어요. 내일 다시 오세요.'],
    'bn.kid': ['未滿 13 歲不提供廣告。', 'No ads under 13.', '13 歳未満には広告を表示しません。', '13세 미만에게는 광고를 보여 주지 않습니다.']
  });

  function ask() {
    if (asked) return;
    asked = true;
    try {
      fetch('/api/health', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        adsOn = !!(j && j.ads);
        if (App.sheet() === 'bonus') App.openSheet('bonus');
      }, function () { /* no server here: ads stay off */ });
    } catch (e) { /* no fetch */ }
  }

  var waiting = 0;
  App.sheets.bonus = function () {
    var left = Meta.adsLeft(), A = Meta.ADS, kid = ZZ.Consent && ZZ.Consent.child(), h = '<h2>' + t('bn.title') + '</h2>';
    h += '<h3>' + t('bn.adH') + '</h3><p>' + esc(t('bn.adP', A.coins, left, A.perDay)) + '</p>';
    if (kid) h += '<p class="note">' + t('bn.kid') + '</p>';
    else {
      // the ad itself is shown by the network's own script once an account is approved; until then this stays off
      h += '<div class="row"><button class="btn" type="button" data-do="adWatch" disabled>' + esc(t('bn.watch', A.coins)) + '</button></div>';
      if (!adsOn) h += '<p class="note">' + t('bn.off') + '</p>';
    }
    if (Meta.isSub()) {
      h += '<p class="note">' + t('bn.memberP') + '</p><div class="row"><button class="btn main" type="button" data-do="adFree"' + (left && !waiting ? '' : ' disabled') + '>' +
        esc(waiting ? t('bn.wait') : t('bn.member', A.coins)) + '</button></div>';
    }
    if (!left) h += '<p class="note">' + t('bn.none') + '</p>';
    if (App.bonusExtra) h += App.bonusExtra();
    return h + '<div class="row">' + btn('close', 'done') + '</div>';
  };
  App.opened.bonus = ask;
  App.acts.adFree = function () {
    var before = Meta.data.coins, r = Meta.adFree();
    if (!r.ok) { App.toast(t(r.why === 'none' ? 'bn.none' : 'sh.member')); return; }
    if (!r.pending) { App.sfx.play('itemGet'); App.toast(t('bn.got', r.n)); App.updateMenu(); App.openSheet('bonus'); return; }
    // with a cloud save the server pays; the coins arrive with the next sync
    waiting = Date.now();
    App.openSheet('bonus');
    if (ZZ.Cloud && ZZ.Cloud.flush) ZZ.Cloud.flush();
    var check = setInterval(function () {
      if (Meta.data.coins !== before || Date.now() - waiting > 8000) {
        clearInterval(check);
        if (Meta.data.coins > before) { App.sfx.play('itemGet'); App.toast(t('bn.got', Meta.data.coins - before)); }
        waiting = 0;
        App.updateMenu();
        if (App.sheet() === 'bonus') App.openSheet('bonus');
      }
    }, 250);
  };
})();
