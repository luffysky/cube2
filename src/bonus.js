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
    'bn.kid': ['未滿 13 歲不提供廣告。', 'No ads under 13.', '13 歳未満には広告を表示しません。', '13세 미만에게는 광고를 보여 주지 않습니다.'],
    'wh.title': ['轉盤', 'Prize wheel', 'ルーレット', '룰렛'],
    'wh.p': ['每天免費轉 {0} 次（會員 {1} 次）。今天還能轉 {2} 次。', 'Free {0} a day ({1} for members). {2} left today.', '1 日 {0} 回無料（会員は {1} 回）。今日はあと {2} 回。', '하루 {0}번 무료(회원 {1}번). 오늘 {2}번 남음.'],
    'wh.spin': ['轉一次', 'Spin', '回す', '돌리기'],
    'sl.title': ['拉霸機', 'Slot machine', 'スロット', '슬롯머신'],
    'sl.p': ['一次 {0} 金幣，每天最多 {1} 次。今天還能拉 {2} 次。', '{0} coins a pull, {1} a day at most. {2} left today.', '1 回 {0} コイン、1 日 {1} 回まで。今日はあと {2} 回。', '한 번에 {0}코인, 하루 최대 {1}번. 오늘 {2}번 남음.'],
    'sl.pull': ['拉一次（{0} 金幣）', 'Pull ({0} coins)', '回す（{0} コイン）', '당기기({0}코인)'],
    'sl.lose': ['沒中，下次再來', 'No luck this time', 'はずれ', '꽝'],
    'lk.odds': ['看機率', 'See the odds', '確率を見る', '확률 보기'],
    'lk.oddsHide': ['收起機率', 'Hide the odds', '確率を閉じる', '확률 닫기'],
    'lk.got': ['拿到：', 'You got: ', '獲得：', '획득: '],
    'lk.wait': ['伺服器抽獎中…', 'Drawing on the server…', 'サーバーで抽選中…', '서버에서 추첨 중…'],
    'lk.kid': ['轉盤和拉霸機只開放 13 歲以上。', 'The wheel and the slot machine are for 13 and over.', 'ルーレットとスロットは 13 歳以上です。', '룰렛과 슬롯머신은 13세 이상만 이용할 수 있습니다.'],
    'lk.p': ['機率每次都一樣，由伺服器抽，每一次都有紀錄。', 'The odds are the same every time; the server draws and keeps a record of each one.', '確率は毎回同じで、サーバーが抽選し、すべて記録します。', '확률은 매번 같고, 서버가 추첨하며 모두 기록합니다.'],
    'wh.c20': ['20 金幣', '20 coins', '20 コイン', '20코인'], 'wh.c50': ['50 金幣', '50 coins', '50 コイン', '50코인'], 'wh.c100': ['100 金幣', '100 coins', '100 コイン', '100코인'],
    'wh.c300': ['300 金幣', '300 coins', '300 コイン', '300코인'], 'wh.c1000': ['1000 金幣', '1000 coins', '1000 コイン', '1000코인'],
    'wh.item1': ['道具 1 個', '1 item', 'アイテム 1 個', '아이템 1개'], 'wh.item3': ['道具 3 個', '3 items', 'アイテム 3 個', '아이템 3개'], 'wh.box1': ['寶箱 +1 次', '+1 box', '宝箱 +1 回', '보물상자 +1회'],
    'sl.lose.n': ['沒中', 'Nothing', 'はずれ', '꽝'], 'sl.pair': ['兩個一樣：60 金幣', 'Two alike: 60 coins', '2 つそろい：60 コイン', '2개 같음: 60코인'],
    'sl.gold1': ['一個金幣：道具 1 個', 'One gold: 1 item', '金 1 つ：アイテム 1 個', '금 1개: 아이템 1개'], 'sl.three': ['三個一樣：250 金幣', 'Three alike: 250 coins', '3 つそろい：250 コイン', '3개 같음: 250코인'],
    'sl.gold2': ['兩個金幣：150 金幣', 'Two gold: 150 coins', '金 2 つ：150 コイン', '금 2개: 150코인'], 'sl.gold3': ['三個金幣：1000 金幣', 'Three gold: 1000 coins', '金 3 つ：1000 コイン', '금 3개: 1000코인']
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

  // ---------- the wheel and the slot machine ----------
    var luck = { odds: false, busy: '', angle: 0 };
  var SEG_COL = ['#F5B82E', '#5DB7F5', '#37C29A', '#FF9DB5', '#F0704F', '#B49CFF', '#FFD866', '#E04F5F'];
  function wheelSvg() {
    var n = Meta.WHEEL.length, R = 110, h = '<svg viewBox="-120 -120 240 240" class="wheel-svg" aria-hidden="true"><g id="wheelRot" style="transform: rotate(' + luck.angle + 'deg)">';
    Meta.WHEEL.forEach(function (w, i) {
      var a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
      h += '<path d="M0 0 L' + (R * Math.cos(a0)).toFixed(1) + ' ' + (R * Math.sin(a0)).toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + (R * Math.cos(a1)).toFixed(1) + ' ' + (R * Math.sin(a1)).toFixed(1) + ' Z" fill="' + SEG_COL[i % SEG_COL.length] + '" stroke="#fff" stroke-width="2"/>';
      var tx = 70 * Math.cos(am), ty = 70 * Math.sin(am), deg = am * 180 / Math.PI + 90;
      h += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" transform="rotate(' + deg.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')" text-anchor="middle" dominant-baseline="middle">' + esc(t('wh.' + w.id)) + '</text>';
    });
    return h + '</g><circle r="16" fill="#1B2530"/><path d="M-10 -122 L10 -122 L0 -100 Z" fill="#1B2530"/></svg>';
  }
  var SYM = ['#FF9DB5', '#5DB7F5', '#37C29A', '#F0704F', '#B49CFF', '#F1EADB'], GOLD = 'gold';
  function symHtml(s) { return s === GOLD ? '<span class="sym gold"><i class="coin"></i></span>' : '<span class="sym" style="--c:' + s + '"></span>'; }
  function shuffle(list) { var a = list.slice(), i, j, x; for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  // what the three reels show for a result the server drew (the picture only; the prize is already decided)
  function reelsFor(out) {
    var c = shuffle(SYM);
    if (out === 'gold3') return [GOLD, GOLD, GOLD];
    if (out === 'gold2') return shuffle([GOLD, GOLD, c[0]]);
    if (out === 'gold1') return shuffle([GOLD, c[0], c[1]]);
    if (out === 'three') return [c[0], c[0], c[0]];
    if (out === 'pair') return shuffle([c[0], c[0], c[1]]);
    return [c[0], c[1], c[2]];
  }
  var shown = null;
  function luckOdds() {
    var pct = App.pct, h = '<h3>' + t('bx.oddsH') + '</h3><p class="note">' + t('lk.p') + '</p><table class="cmp odds"><thead><tr><th>' + t('wh.title') + '</th><th>' + t('bx.chance') + '</th></tr></thead><tbody>';
    Meta.WHEEL.forEach(function (w) { h += '<tr><td class="ow">' + esc(t('wh.' + w.id)) + '</td><td class="oc">' + pct(w.p) + '</td></tr>'; });
    h += '</tbody></table><table class="cmp odds"><thead><tr><th>' + t('sl.title') + '</th><th>' + t('bx.chance') + '</th></tr></thead><tbody>';
    Meta.SLOT.outs.forEach(function (o) { h += '<tr><td class="ow">' + esc(t(o.id === 'lose' ? 'sl.lose.n' : 'sl.' + o.id)) + '</td><td class="oc">' + pct(o.p) + '</td></tr>'; });
    return h + '</tbody></table>';
  }
  App.bonusExtra = function () {
    if (ZZ.Consent && ZZ.Consent.child()) return '<h3>' + t('wh.title') + '・' + t('sl.title') + '</h3><p class="note">' + t('lk.kid') + '</p>';
    var wl = Meta.wheelLeft(), sl = Meta.slotLeft(), S = Meta.SLOT, F = Meta.WHEEL_FREE, d = Meta.data, h = '';
    h += '<h3>' + t('wh.title') + '</h3><p>' + esc(t('wh.p', F.free, F.sub, wl)) + '</p><div class="wheel">' + wheelSvg() + '</div>';
    h += '<div class="row"><button class="btn main" type="button" data-do="wheelGo"' + (wl && !luck.busy ? '' : ' disabled') + '>' + t('wh.spin') + '</button></div>';
    if (luck.busy === 'wheel') h += '<p class="note" role="status" id="luckMsg">' + t('lk.wait') + '</p>';
    else if (d.wheel.last && luck.wheelSeen === d.wheel.last.n) h += '<p class="note" role="status">' + t('lk.got') + d.wheel.last.got.map(App.prizeText).join('　') + '</p>';
    h += '<h3>' + t('sl.title') + '</h3><p>' + esc(t('sl.p', S.cost, S.perDay, sl)) + '</p><div class="reels" id="reels">' + (shown || [SYM[0], SYM[1], SYM[2]]).map(symHtml).join('') + '</div>';
    h += '<div class="row"><button class="btn main" type="button" data-do="slotGo"' + (sl && d.coins >= S.cost && !luck.busy ? '' : ' disabled') + '>' + esc(t('sl.pull', S.cost)) + '</button></div>';
    if (luck.busy === 'slot') h += '<p class="note" role="status">' + t('lk.wait') + '</p>';
    else if (d.slot.last && luck.slotSeen === d.slot.last.n) h += '<p class="note" role="status">' + (d.slot.last.got.length ? t('lk.got') + d.slot.last.got.map(App.prizeText).join('　') : t('sl.lose')) + '</p>';
    h += '<p class="note"><button class="linkish" type="button" data-do="luckOdds">' + t(luck.odds ? 'lk.oddsHide' : 'lk.odds') + '</button></p>' + (luck.odds ? luckOdds() : '');
    return h;
  };
  App.acts.luckOdds = function () { luck.odds = !luck.odds; App.openSheet('bonus'); };
  // waits for the server's answer when there is a cloud save, then calls done(last)
  function settle(key, before, done) {
    if (Meta.data[key].n !== before) return done(Meta.data[key].last);
    if (ZZ.Cloud && ZZ.Cloud.flush) ZZ.Cloud.flush();
    var t0 = Date.now(), check = setInterval(function () {
      if (Meta.data[key].n !== before) { clearInterval(check); done(Meta.data[key].last); }
      else if (Date.now() - t0 > 9000) { clearInterval(check); luck.busy = ''; App.openSheet('bonus'); }
    }, 200);
  }
  App.acts.wheelGo = function () {
    var before = Meta.data.wheel.n, r = Meta.spinWheel();
    if (!r.ok) return App.toast(t('bn.none'));
    luck.busy = 'wheel';
    var btnEl = document.querySelector('[data-do="wheelGo"]'); if (btnEl) btnEl.disabled = true;
    settle('wheel', before, function (last) {
      var i = 0, n = Meta.WHEEL.length;
      Meta.WHEEL.forEach(function (w, k) { if (w.id === last.seg) i = k; });
      // land the middle of the drawn slice under the pointer at the top, after a few full turns
      var target = 360 * 5 + (360 - (i + 0.5) * 360 / n), now = ((luck.angle % 360) + 360) % 360;
      luck.angle = luck.angle - now + target;
      var g = document.getElementById('wheelRot');
      App.sfx.play('rot');
      if (g) { g.style.transition = 'transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)'; g.style.transform = 'rotate(' + luck.angle + 'deg)'; }
      setTimeout(function () {
        luck.busy = ''; luck.wheelSeen = last.n;
        App.sfx.play(last.seg === 'c1000' || last.seg === 'c300' ? 'cheer' : 'itemGet');
        App.updateMenu(); if (App.sheet() === 'bonus') App.openSheet('bonus');
      }, g ? 3300 : 0);
    });
  };
  App.acts.slotGo = function () {
    var before = Meta.data.slot.n, r = Meta.pullSlot();
    if (!r.ok) return App.toast(r.why === 'poor' ? t('e.poor', r.n) : t('bn.none'));
    luck.busy = 'slot';
    var btnEl = document.querySelector('[data-do="slotGo"]'); if (btnEl) btnEl.disabled = true;
    App.updateMenu();
    var box = document.getElementById('reels'), spinT = setInterval(function () {
      if (box) box.innerHTML = [0, 1, 2].map(function (k) { return symHtml(Math.random() < 0.12 ? GOLD : SYM[Math.floor(Math.random() * SYM.length)]); }).join('');
      App.sfx.play('move');
    }, 90);
    settle('slot', before, function (last) {
      var fin = reelsFor(last.out), stopped = 0;
      // the reels stop one after another
      [700, 1100, 1500].forEach(function (ms, k) {
        setTimeout(function () {
          stopped++;
          if (stopped === 3) clearInterval(spinT);
          var cur = box ? [].slice.call(box.children).map(function (el, j) { return j <= k ? fin[j] : null; }) : [];
          if (box) box.innerHTML = fin.map(function (s, j) { return j <= k ? symHtml(s) : symHtml(SYM[Math.floor(Math.random() * SYM.length)]); }).join('');
          App.sfx.play('lock');
          if (stopped === 3) {
            shown = fin; luck.busy = ''; luck.slotSeen = last.n;
            App.sfx.play(last.out === 'gold3' || last.out === 'three' ? 'cheer' : last.got.length ? 'itemGet' : 'fail');
            App.updateMenu();
            setTimeout(function () { if (App.sheet() === 'bonus') App.openSheet('bonus'); }, 300);
          }
          return cur;
        }, ms);
      });
    });
  };
})();
