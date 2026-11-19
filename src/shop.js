/* 轉磚 shop: looks to buy and wear, items to stock, membership (a trial in this build), the player's own pictures,
   daily jobs and the profile. Plugs into ZZ.App. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, Meta = ZZ.Meta, L = ZZ.L, t = L.t, View = ZZ.View, ITEMS = ZZ.ITEMS, esc = App.esc, btn = App.btn, coin = App.coin;
  var $ = function (id) { return document.getElementById(id); };

  L.add({
    'k.set': ['整套風格', 'Style sets', 'スタイルセット', '스타일 세트'],
    'k.tile': ['方塊', 'Tiles', 'タイル', '타일'],
    'k.bg': ['牆面', 'Wall', '壁', '벽'],
    'k.theme': ['主題', 'Theme', 'テーマ', '테마'],
    'k.fx': ['消行特效', 'Clear effects', '消去エフェクト', '줄 삭제 효과'],
    'k.items': ['道具', 'Items', 'アイテム', '아이템'],
    'k.member': ['會員', 'Member', 'メンバー', '멤버십'],
    'sh.using': ['使用中', 'In use', '使用中', '사용 중'],
    'sh.wear': ['換上', 'Use', '使う', '사용'],
    'sh.buy': ['購買', 'Buy', '購入', '구입'],
    'sh.member': ['會員限定', 'Members only', 'メンバー限定', '멤버 전용'],
    'sh.rank': ['升到「{0}」就送', 'Free at {0}', '「{0}」到達で解放', '「{0}」 달성 시 해금'],
    'sh.bought': ['買好了，已經換上。', 'Bought and applied.', '購入して適用しました。', '구입 후 적용했습니다.'],
    'sh.gotItem': ['買了 1 個「{0}」。', 'Bought 1 {0}.', '「{0}」を1個購入。', '「{0}」 1개 구입.'],
    'sh.setWas': ['原價 {0}', 'was {0}', '通常 {0}', '정가 {0}'],
    'sh.itemsP': ['買來的道具可以帶進一般對戰和分身對戰，每場最多 {0} 個。排位和連線不能帶。', 'Bought items can be brought into casual and ghost matches, up to {0} per match. Not allowed in ranked or online.', '購入アイテムは通常対戦とゴースト対戦に持ち込めます（1戦{0}個まで）。ランクとオンラインは不可。', '구입한 아이템은 일반 대전과 고스트 대전에 가져갈 수 있습니다 (판당 {0}개). 랭크·온라인은 불가.'],
    'sh.stock': ['庫存 {0}', 'In stock: {0}', '所持 {0}', '보유 {0}'],
    'e.poor': ['金幣不夠，還差 {0}。', 'Not enough coins. {0} short.', 'コインが足りません。あと{0}。', '코인이 부족합니다. {0} 모자랍니다.'],
    'e.have': ['已經有了。', 'You already own it.', 'すでに持っています。', '이미 보유 중입니다.'],
    'e.no': ['這個不能用金幣買。', 'This cannot be bought with coins.', 'これはコインでは買えません。', '코인으로 살 수 없습니다.'],
    'e.max': ['最多放 99 個。', 'You can hold up to 99.', '最大99個までです。', '최대 99개까지입니다.'],
    'e.setHave': ['這套你都有了。', 'You own every part of this set.', 'このセットはすべて所持済みです。', '이 세트는 모두 보유 중입니다.'],
    // membership
    'mb.name': ['轉磚會員', 'Zhuan Zhuan Member', 'Zhuan Zhuan メンバー', 'Zhuan Zhuan 멤버십'],
    'mb.p1': ['用自己的圖片當牆面和磚面', 'Use your own pictures for the wall and the tiles', '自分の画像を壁とタイルに使える', '내 사진을 벽과 타일에 사용'],
    'mb.p2': ['商店裡所有外觀隨便換', 'Every look in the shop, free to use', 'ショップの見た目が全部使い放題', '상점의 모든 외형 무제한 사용'],
    'mb.p3': ['金幣多拿 50%，每日簽到雙倍', '50% more coins, double daily check-in', 'コイン+50%、デイリーボーナス2倍', '코인 +50%, 출석 보상 2배'],
    'mb.p4': ['對戰錄影保留 30 場（一般 5 場）', 'Keeps 30 recorded matches (5 without)', '対戦記録を30戦保存（通常5戦）', '대전 기록 30판 보관 (일반 5판)'],
    'mb.price': ['預計月費 NT${0}、年費 NT${1}', 'Planned price: NT${0} a month, NT${1} a year', '予定価格：月額NT${0}、年額NT${1}', '예정 가격: 월 NT${0}, 연 NT${1}'],
    'mb.demo': ['現在是體驗模式：金流還沒接上，按下去不會收費，會直接開通 30 天。', 'Trial mode: payments are not connected yet. Nothing is charged; this starts 30 days of membership.', '体験モード：決済は未接続です。課金はなく、30日間のメンバーが始まります。', '체험 모드: 결제가 아직 연결되지 않았습니다. 요금 없이 30일 멤버십이 시작됩니다.'],
    'mb.start': ['開通體驗', 'Start trial', '体験を始める', '체험 시작'],
    'mb.active': ['會員到期還有 {0} 天', '{0} days of membership left', 'メンバー期間は残り{0}日', '멤버십 {0}일 남음'],
    'mb.end': ['結束體驗', 'End trial', '体験を終了', '체험 종료'],
    'mb.pics': ['自己的圖片', 'Your pictures', '自分の画像', '내 사진'],
    'mb.wall': ['牆面圖片', 'Wall picture', '壁の画像', '벽 사진'],
    'mb.tile': ['磚面圖片', 'Tile picture', 'タイルの画像', '타일 사진'],
    'mb.choose': ['選圖片', 'Choose picture', '画像を選ぶ', '사진 선택'],
    'mb.remove': ['移除', 'Remove', '削除', '삭제'],
    'mb.dim': ['牆面暗度', 'Wall dimming', '壁の暗さ', '벽 어둡게'],
    'mb.picNote': ['圖片只存在這台裝置上，不會上傳。', 'Pictures stay on this device. Nothing is uploaded.', '画像はこの端末にだけ保存され、アップロードされません。', '사진은 이 기기에만 저장되며 업로드되지 않습니다.'],
    'mb.picFail': ['這張圖讀不進來，換一張試試。', 'That picture could not be read. Try another.', 'この画像は読み込めません。別の画像でお試しください。', '이 사진을 읽을 수 없습니다. 다른 사진으로 시도하세요.'],
    'mb.need': ['開通會員後就能用自己的圖片。', 'Become a member to use your own pictures.', 'メンバーになると自分の画像が使えます。', '멤버가 되면 내 사진을 쓸 수 있습니다.'],
    'mb.none': ['還沒選', 'None yet', '未選択', '선택 안 함'],
    'mb.set': ['已選好', 'Set', '設定済み', '설정됨'],
    // jobs
    'jb.login': ['每日簽到', 'Daily check-in', 'デイリーボーナス', '출석 보상'],
    'jb.day': ['連續第 {0} 天', 'Day {0} in a row', '{0}日連続', '{0}일 연속'],
    'jb.claim': ['領取', 'Claim', '受け取る', '받기'],
    'jb.claimed': ['已領', 'Claimed', '受取済み', '수령 완료'],
    'jb.today': ['今天的任務', "Today's jobs", '今日の任務', '오늘의 임무'],
    'jb.resets': ['每天午夜換新（台灣時間）。', 'New jobs every day at 00:00 Taiwan time (UTC+8).', '毎日0時（台湾時間・UTC+8）に更新。', '매일 자정(대만 시간, UTC+8)에 갱신.'],
    'jb.got': ['+{0} 金幣', '+{0} coins', '+{0}コイン', '+{0}코인'],
    'j.win': ['贏 2 場對戰', 'Win 2 matches', '対戦で2勝', '대전 2승'],
    'j.play': ['打完 3 場對戰', 'Play 3 matches', '対戦を3回', '대전 3판'],
    'j.tspin': ['做出 5 次 T 轉', 'Land 5 T-spins', 'Tスピン5回', 'T스핀 5회'],
    'j.send': ['送出 40 行', 'Send 40 lines', '40ライン送る', '40줄 보내기'],
    'j.quad': ['四消 3 次', '3 quads', 'クアッド3回', '쿼드 3회'],
    'j.ko': ['擊倒對手 4 次', '4 KOs', 'KO 4回', 'KO 4회'],
    'j.rank': ['打 2 場排位賽', 'Play 2 ranked matches', 'ランクマッチ2回', '랭크전 2판'],
    'j.combo': ['打出 5 連擊', 'Reach a 5 combo', '5コンボ達成', '5콤보 달성'],
    'j.xspin': ['用 T 以外的方塊轉進去 2 次', '2 spins with a piece other than T', 'T以外のスピン2回', 'T 외 스핀 2회'],
    'j.sprint': ['跑完一次 40 行競速', 'Finish a 40-line sprint', '40ラインスプリント完走', '40줄 스프린트 완주'],
    'j.score': ['單場拿到 20000 分', 'Score 20,000 in one match', '1戦で20000点', '한 판에 20000점'],
    'j.item': ['用掉 3 個道具', 'Use 3 items', 'アイテム3個使用', '아이템 3개 사용'],
    // profile
    'pf.title': ['個人檔案', 'Profile', 'プロフィール', '프로필'],
    'pf.name': ['名字', 'Name', '名前', '이름'],
    'pf.namePh': ['最多 12 個字', 'Up to 12 characters', '12文字まで', '최대 12자'],
    'pf.games': ['對戰場數', 'Matches', '対戦数', '대전 수'],
    'pf.wins': ['勝場', 'Wins', '勝利', '승리'],
    'pf.best': ['最高分', 'Best score', '最高スコア', '최고 점수'],
    'pf.sprint': ['40 行最快', 'Fastest 40 lines', '40ライン最速', '40줄 최고 기록'],
    'pf.tspins': ['T 轉總數', 'T-spins', 'Tスピン合計', 'T스핀 합계'],
    'pf.sent': ['送出總行數', 'Lines sent', '送ったライン合計', '보낸 줄 합계'],
    'pf.kos': ['擊倒總數', 'KOs', 'KO合計', 'KO 합계'],
    'pf.coins': ['累積金幣', 'Coins earned', '獲得コイン累計', '누적 코인'],
    // catalogue
    'c.tile.glaze': ['釉面磚', 'Glazed', '釉薬タイル', '유약 타일'],
    'c.tile.pixel': ['像素', 'Pixel', 'ピクセル', '픽셀'],
    'c.tile.mosaic': ['馬賽克', 'Mosaic', 'モザイク', '모자이크'],
    'c.tile.brick': ['紅磚', 'Brick', 'レンガ', '벽돌'],
    'c.tile.candy': ['軟糖', 'Gummy', 'グミ', '젤리'],
    'c.tile.glass': ['玻璃磚', 'Glass', 'ガラス', '유리'],
    'c.tile.wood': ['積木', 'Wood block', '積み木', '나무 블록'],
    'c.tile.neon': ['霓虹燈管', 'Neon', 'ネオン', '네온'],
    'c.tile.gem': ['寶石', 'Gem', '宝石', '보석'],
    'c.tile.custom': ['自己的圖', 'Your picture', '自分の画像', '내 사진'],
    'c.bg.wall': ['水泥牆', 'Cement', 'セメント壁', '시멘트 벽'],
    'c.bg.blueprint': ['藍圖', 'Blueprint', '設計図', '설계도'],
    'c.bg.board': ['黑板', 'Chalkboard', '黒板', '칠판'],
    'c.bg.stone': ['磨石子', 'Terrazzo', 'テラゾー', '테라초'],
    'c.bg.night': ['夜空', 'Night sky', '夜空', '밤하늘'],
    'c.bg.tatami': ['榻榻米', 'Tatami', '畳', '다다미'],
    'c.bg.dusk': ['暮色', 'Dusk', '夕暮れ', '해질녘'],
    'c.bg.neongrid': ['霓虹格線', 'Neon grid', 'ネオングリッド', '네온 그리드'],
    'c.bg.ember': ['窯火', 'Kiln fire', '窯の火', '가마 불'],
    'c.bg.custom': ['自己的圖', 'Your picture', '自分の画像', '내 사진'],
    'c.theme.auto': ['磨石子', 'Terrazzo', 'テラゾー', '테라초'],
    'c.theme.ink': ['墨', 'Ink', '墨', '먹'],
    'c.theme.kiln': ['窯燒', 'Kiln', '窯焼き', '가마'],
    'c.theme.qinghua': ['青花', 'Blue & white', '染付', '청화'],
    'c.theme.matcha': ['抹茶', 'Matcha', '抹茶', '말차'],
    'c.theme.sakura': ['櫻花', 'Sakura', '桜', '벚꽃'],
    'c.theme.market': ['夜市', 'Night market', '夜市', '야시장'],
    'c.fx.shard': ['碎磚', 'Shards', 'かけら', '파편'],
    'c.fx.star': ['星屑', 'Stardust', '星くず', '별가루'],
    'c.fx.bubble': ['泡泡', 'Bubbles', '泡', '방울'],
    'c.fx.petal': ['花瓣', 'Petals', '花びら', '꽃잎'],
    'c.set.market': ['霓虹夜市', 'Neon night market', 'ネオン夜市', '네온 야시장'],
    'c.set.qinghua': ['青花瓷', 'Blue & white porcelain', '染付磁器', '청화백자'],
    'c.set.kiln': ['窯邊紅磚', 'Kilnside brick', '窯ばたのレンガ', '가마 옆 벽돌'],
    'c.set.washitsu': ['和室', 'Tatami room', '和室', '다다미방'],
    'c.set.candy': ['糖果屋', 'Candy house', 'お菓子の家', '과자 집']
  });

  // Four colours that stand for each theme on its card: floor, panel, wall, accent.
  var SWATCH = {
    auto: ['#E4E7EA', '#FAFBFC', '#222B36', '#F5B82E'], ink: ['#111214', '#1E2024', '#000000', '#F5B82E'], kiln: ['#2A1A14', '#3B261D', '#160D0A', '#FFC766'],
    qinghua: ['#EEF2F8', '#FFFFFF', '#12306F', '#F5B82E'], matcha: ['#E6EBD9', '#F8FAF0', '#2C3A22', '#F5B82E'], sakura: ['#F8E6EA', '#FFF8F9', '#4A2533', '#F5B82E'],
    market: ['#140C24', '#22163A', '#0A0514', '#FFD23E']
  };
  var TABS = ['set', 'tile', 'bg', 'theme', 'fx', 'items', 'member'], tab = 'set';
  function fail(r) { App.toast(t('e.' + r.why, r.n != null ? r.n : '')); App.sfx.play('fail'); }

  // ---------- the player's own pictures (kept on this device in IndexedDB) ----------
  var Pics = {
    db: null, mem: {},
    open: function (cb) {
      if (Pics.db) return cb(Pics.db);
      try {
        var rq = window.indexedDB.open('zhuanzhuan-pics', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('pic'); };
        rq.onsuccess = function () { Pics.db = rq.result; cb(Pics.db); };
        rq.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    },
    get: function (key, cb) {
      if (Pics.mem[key]) return cb(Pics.mem[key]);
      Pics.open(function (db) {
        if (!db) return cb(null);
        try {
          var rq = db.transaction('pic').objectStore('pic').get(key);
          rq.onsuccess = function () { cb(rq.result || null); };
          rq.onerror = function () { cb(null); };
        } catch (e) { cb(null); }
      });
    },
    put: function (key, url) {
      Pics.mem[key] = url;
      Pics.open(function (db) { try { if (db) db.transaction('pic', 'readwrite').objectStore('pic').put(url, key); } catch (e) { /* stays for this visit only */ } });
    },
    del: function (key) {
      delete Pics.mem[key];
      Pics.open(function (db) { try { if (db) db.transaction('pic', 'readwrite').objectStore('pic').delete(key); } catch (e) { /* nothing stored */ } });
    }
  };
  function useUrl(key, url, cb) {
    var im = new Image();
    im.onload = function () { var o = {}; o[key] = im; View.setLook({ img: o }); App.applyLook(); if (cb) cb(true); };
    im.onerror = function () { if (cb) cb(false); };
    im.src = url;
  }
  // Shrinks a chosen file to what the game needs and keeps it as a JPEG data URL.
  function takeFile(key, file) {
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { return App.toast(t('mb.picFail')); }
    var im = new Image();
    im.onerror = function () { URL.revokeObjectURL(url); App.toast(t('mb.picFail')); };
    im.onload = function () {
      URL.revokeObjectURL(url);
      var c = document.createElement('canvas'), x, w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) return App.toast(t('mb.picFail'));
      if (key === 'tile') {
        var s = Math.min(w, h);
        c.width = c.height = 160;
        x = c.getContext('2d');
        x.drawImage(im, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 160, 160);
      } else {
        var k = Math.min(1, 1100 / Math.max(w, h));
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        x = c.getContext('2d');
        x.drawImage(im, 0, 0, c.width, c.height);
      }
      var data;
      try { data = c.toDataURL('image/jpeg', 0.86); } catch (e) { return App.toast(t('mb.picFail')); }
      Pics.put(key, data);
      Meta.data.custom[key] = true;
      Meta.equip(key, 'custom');
      Meta.save();
      useUrl(key, data, function () { if (App.sheet() === 'shop') App.openSheet('shop'); });
    };
    im.src = url;
  }
  function dropPic(key) {
    Pics.del(key);
    Meta.data.custom[key] = false;
    if (Meta.data.equip[key] === 'custom') Meta.equip(key, key === 'tile' ? 'glaze' : 'wall');
    Meta.save();
    var o = {}; o[key] = null;
    View.setLook({ img: o });
    App.applyLook();
  }

  // ---------- shop ----------
  function stateBtn(kind, it) {
    var st = Meta.state(kind, it.id), on = Meta.data.equip[kind] === it.id, key = kind + '|' + it.id;
    if (it.id === 'custom' && st === 'ok' && !Meta.data.custom[kind]) return '<button class="btn sm" type="button" data-tab="member">' + t('mb.choose') + '</button>';
    if (st === 'ok') return on ? '<span class="tag on">' + t('sh.using') + '</span>' : '<button class="btn sm" type="button" data-wear="' + key + '">' + t('sh.wear') + '</button>';
    if (st === 'buy') return '<button class="btn sm buy" type="button" data-buy="' + key + '">' + coin(it.price) + '</button>';
    if (st === 'sub') return '<button class="btn sm" type="button" data-tab="member">' + t('sh.member') + '</button>';
    return '<span class="tag">' + t('sh.rank', t('tier' + it.rank)) + '</span>';
  }
  function cardsHtml(kind) {
    var list = Meta.CATALOG[kind], h = '<div class="cards">', i;
    for (i = 0; i < list.length; i++) {
      var it = list[i], on = Meta.data.equip[kind] === it.id, pv;
      if (kind === 'theme') {
        var sw = SWATCH[it.id] || SWATCH.auto;
        pv = '<div class="pv sw" style="background:' + sw[0] + '"><i style="background:' + sw[2] + '"></i><i style="background:' + sw[1] + '"></i><i style="background:' + sw[3] + '"></i></div>';
      } else pv = '<canvas class="pv" data-pv="' + kind + '|' + it.id + '"></canvas>';
      h += '<div class="card' + (on ? ' on' : '') + '">' + pv + '<b>' + esc(t('c.' + kind + '.' + it.id)) + '</b>' + stateBtn(kind, it) + '</div>';
    }
    return h + '</div>';
  }
  function setsHtml() {
    var list = Meta.CATALOG.set, h = '<div class="cards wide">', i;
    for (i = 0; i < list.length; i++) {
      var st = list[i], p = Meta.setPrice(st.id), usable = Meta.setUsable(st.id), e = Meta.data.equip;
      var on = Meta.KINDS.every(function (k) { return e[k] === st.parts[k]; }), names = Meta.KINDS.map(function (k) { return t('c.' + k + '.' + st.parts[k]); }).join('・'), act;
      if (usable) act = on ? '<span class="tag on">' + t('sh.using') + '</span>' : '<button class="btn sm" type="button" data-wearset="' + st.id + '">' + t('sh.wear') + '</button>';
      else act = '<button class="btn sm buy" type="button" data-buyset="' + st.id + '">' + coin(p.price) + '</button><small>' + t('sh.setWas', L.num(p.miss)) + '</small>';
      h += '<div class="card' + (on ? ' on' : '') + '"><canvas class="pv" data-pv="set|' + st.id + '"></canvas><b>' + esc(t('c.set.' + st.id)) + '</b><span class="parts">' + esc(names) + '</span>' + act + '</div>';
    }
    return h + '</div>';
  }
  function itemsHtml() {
    var h = '<p>' + t('sh.itemsP', Meta.BRING_MAX) + '</p><div class="levels">', i;
    for (i = 1; i < ITEMS.length; i++) {
      h += '<div class="rep"><div class="rep-t item">' + App.itile(i) + '<div><b>' + t('i' + i) + '</b><span>' + t('i' + i + 't') + '　' + t('sh.stock', Meta.data.items[i] || 0) + '</span></div></div>' +
        '<button class="btn sm buy" type="button" data-buyitem="' + i + '">' + coin(Meta.ITEM_PRICE[i]) + '</button></div>';
    }
    return h + '</div>';
  }
  function picRow(key, label) {
    var has = !!Meta.data.custom[key];
    return '<div class="rep"><div class="rep-t"><b>' + t(label) + '</b><span>' + t(has ? 'mb.set' : 'mb.none') + '</span></div>' +
      '<button class="btn sm" type="button" data-pick="' + key + '">' + t('mb.choose') + '</button>' + (has ? '<button class="btn sm" type="button" data-droppic="' + key + '">' + t('mb.remove') + '</button>' : '') + '</div>';
  }
  function memberHtml() {
    var sub = Meta.isSub(), P = Meta.PLAN, h;
    h = '<div class="plan"><b>' + t('mb.name') + '</b>' + App.ul(['mb.p1', 'mb.p2', 'mb.p3', 'mb.p4']) + '<p>' + t('mb.price', P.month, P.year) + '</p></div><p class="warn">' + t('mb.demo') + '</p>';
    if (sub) h += '<p class="note"><b>' + t('mb.active', Meta.subDaysLeft()) + '</b></p>';
    h += '<div class="row">' + (sub ? btn('subEnd', 'mb.end') : btn('subStart', 'mb.start', true)) + '</div><h3>' + t('mb.pics') + '</h3>';
    if (!sub) return h + '<p>' + t('mb.need') + '</p>';
    h += '<div class="levels">' + picRow('bg', 'mb.wall') + picRow('tile', 'mb.tile') + '</div>' +
      '<div class="field"><label for="cDim">' + t('mb.dim') + '</label><output id="cDimO" for="cDim"></output><input type="range" id="cDim" min="0" max="85" step="5"></div>' +
      '<p class="note">' + t('mb.picNote') + '</p><input type="file" id="picFile" accept="image/*" hidden>';
    return h;
  }
  App.dismiss.shop = 1; App.dismiss.jobs = 1; App.dismiss.profile = 1;
  App.sheets.shop = function () {
    var h = '<div class="shop-top"><h2>' + t('m.shop') + '</h2>' + coin(Meta.data.coins) + '</div><div class="tabs" role="tablist">', i;
    for (i = 0; i < TABS.length; i++) h += '<button type="button" role="tab" aria-selected="' + (tab === TABS[i]) + '" data-tab="' + TABS[i] + '">' + t('k.' + TABS[i]) + '</button>';
    h += '</div>';
    if (tab === 'set') h += setsHtml();
    else if (tab === 'items') h += itemsHtml();
    else if (tab === 'member') h += memberHtml();
    else h += cardsHtml(tab);
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  var pickKey = '';
  App.opened.shop = function () {
    var list = App.el.sheetCard.querySelectorAll('canvas[data-pv]'), i;
    for (i = 0; i < list.length; i++) {
      var p = list[i].getAttribute('data-pv').split('|'), w = list[i].clientWidth || 120, look = {};
      if (p[0] === 'set') { var st = Meta.find('set', p[1]); look = { tile: st.parts.tile, bg: st.parts.bg, fx: st.parts.fx }; }
      else look[p[0]] = p[1];
      View.preview(list[i], look, w, p[0] === 'set' ? 84 : 72);
    }
    var dim = $('cDim'), file = $('picFile');
    if (dim) { dim.value = Meta.data.custom.dim; $('cDimO').textContent = Meta.data.custom.dim + '%'; }
    if (file) file.onchange = function () { if (file.files && file.files[0] && pickKey) takeFile(pickKey, file.files[0]); file.value = ''; };
  };
  App.acts.subStart = function () { Meta.subscribe(); App.applyLook(); App.sfx.play('win'); App.openSheet('shop'); };
  App.acts.subEnd = function () { Meta.cancelSub(); if (ZZ.Replay) ZZ.Replay.trim(5); App.applyLook(); App.openSheet('shop'); };
  App.acts.shopItems = function () { tab = 'items'; App.openSheet('shop'); };
  App.inputs.push(function (el) {
    if (el.id === 'cDim') {
      Meta.data.custom.dim = +el.value;
      $('cDimO').textContent = el.value + '%';
      Meta.save();
      View.setLook({ dim: +el.value });
      return true;
    }
    if (el.id === 'pName') { Meta.setName(el.value); return true; }
    return false;
  });
  App.clicks.push(function (d) {
    var p, r;
    if (d.tab) { tab = d.tab; App.openSheet('shop'); App.el.sheetCard.scrollTop = 0; return true; }
    if (d.wear) { p = d.wear.split('|'); if (Meta.equip(p[0], p[1])) { App.applyLook(); App.openSheet('shop'); } return true; }
    if (d.buy) {
      p = d.buy.split('|'); r = Meta.buy(p[0], p[1]);
      if (!r.ok) { fail(r); return true; }
      Meta.equip(p[0], p[1]); App.applyLook(); App.sfx.play('itemGet'); App.toast(t('sh.bought')); App.openSheet('shop');
      return true;
    }
    if (d.wearset) { if (Meta.equipSet(d.wearset)) { App.applyLook(); App.openSheet('shop'); } return true; }
    if (d.buyset) {
      r = Meta.buySet(d.buyset);
      if (!r.ok) { fail(r); return true; }
      Meta.equipSet(d.buyset); App.applyLook(); App.sfx.play('itemGet'); App.toast(t('sh.bought')); App.openSheet('shop');
      return true;
    }
    if (d.buyitem) {
      r = Meta.buyItem(+d.buyitem);
      if (!r.ok) { fail(r); return true; }
      App.sfx.play('itemGet'); App.toast(t('sh.gotItem', t('i' + d.buyitem))); App.openSheet('shop');
      return true;
    }
    if (d.pick) { pickKey = d.pick; var f = $('picFile'); if (f) f.click(); return true; }
    if (d.droppic) { dropPic(d.droppic); App.openSheet('shop'); return true; }
    if (d.job != null) { r = Meta.claimJob(+d.job); if (r) { App.sfx.play('itemGet'); App.toast(t('jb.got', r)); } App.openSheet('jobs'); return true; }
    return false;
  });

  // ---------- daily jobs ----------
  App.sheets.jobs = function () {
    var d = Meta.data.daily, due = Meta.loginDue(), jobs = Meta.jobs(), day = due ? (d.login === Meta.dayNo() - 1 ? d.streak + 1 : 1) : d.streak, i;
    var pay = Meta.LOGIN[(day - 1) % Meta.LOGIN.length] * (Meta.isSub() ? 2 : 1);
    var h = '<div class="shop-top"><h2>' + t('m.jobs') + '</h2>' + coin(Meta.data.coins) + '</div><div class="rep"><div class="rep-t"><b>' + t('jb.login') + '</b><span>' + t('jb.day', day) + '</span></div>' +
      (due ? '<button class="btn sm buy main" type="button" data-do="login">' + t('jb.claim') + ' ' + coin(pay) + '</button>' : '<span class="tag on">' + t('jb.claimed') + '</span>') + '</div><h3>' + t('jb.today') + '</h3><div class="levels">';
    for (i = 0; i < jobs.length; i++) {
      var j = jobs[i], pct = Math.round(j.n / j.need * 100);
      h += '<div class="rep"><div class="rep-t"><b>' + esc(t('j.' + j.id)) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div><span>' + j.n + ' / ' + j.need + '</span></div>' +
        (j.paid ? '<span class="tag on">' + t('jb.claimed') + '</span>' : j.done ? '<button class="btn sm buy main" type="button" data-job="' + j.i + '">' + t('jb.claim') + ' ' + coin(j.coin) + '</button>' : '<span class="tag">' + coin(j.coin) + '</span>') + '</div>';
    }
    return h + '</div><p class="note">' + t('jb.resets') + '</p><div class="row">' + btn('close', 'close') + '</div>';
  };
  App.acts.login = function () {
    var n = Meta.claimLogin();
    if (n) { App.sfx.play('itemGet'); App.toast(t('jb.got', n)); }
    App.openSheet('jobs');
  };

  // ---------- profile ----------
  App.sheets.profile = function () {
    var d = Meta.data, r = Meta.rankOf(d.rp), pct = r.top ? 100 : Math.round(r.into / r.need * 100), tt = d.tot;
    var rows = [['pf.games', tt.games], ['pf.wins', tt.wins], ['pf.best', L.num(tt.best)], ['pf.sprint', tt.sprint ? App.fmtTime(tt.sprint) : '—'], ['pf.tspins', tt.tspins], ['pf.sent', L.num(tt.sent)], ['pf.kos', tt.kos], ['pf.coins', L.num(tt.coins)]];
    var h = '<h2>' + t('pf.title') + '</h2><div class="field line"><label for="pName">' + t('pf.name') + '</label><input type="text" id="pName" maxlength="12" autocomplete="off" placeholder="' + esc(t('pf.namePh')) + '" value="' + esc(d.name) + '"></div>' +
      '<div class="rankbox"><b>' + esc(App.rankName(r)) + '</b><span>' + (r.top ? String(r.rp) : r.into + ' / ' + r.need) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    var lv = Meta.level(), lp = lv.top ? 100 : Math.round(lv.into / lv.need * 100), now = Meta.titleNow();
    h += '<div class="rankbox lvbox"><b>' + t('xp.lv', lv.lv) + ' · ' + esc(t('tt.' + now)) + '</b><span>' + (lv.top ? t('xp.max') : lv.into + ' / ' + lv.need) + '</span><div class="bar"><i style="width:' + lp + '%"></i></div></div>' +
      '<h3>' + t('tt.head') + '</h3><p class="note">' + t('tt.pick') + '</p><div class="titles">';
    Meta.TITLES.forEach(function (tt) {
      var have = Meta.hasTitle(tt.id), on = now === tt.id;
      h += '<button type="button" class="ttl' + (on ? ' on' : '') + '" data-title="' + tt.id + '"' + (have ? ' aria-pressed="' + on + '"' : ' disabled') + '><b>' + esc(t('tt.' + tt.id)) + '</b><span>' + esc(have ? (on ? t('tt.on') : t('tt.' + tt.id + '.d')) : t('tt.lock') + '：' + t('tt.' + tt.id + '.d')) + '</span></button>';
    });
    h += '</div><table class="cmp"><tbody>';
    rows.forEach(function (x) { h += '<tr><td>' + t(x[0]) + '</td><td>' + x[1] + '</td></tr>'; });
    return h + '</tbody></table>' + (App.profileExtra ? App.profileExtra() : '') + '<div class="row">' + btn('close', 'done', true) + '</div>';
  };

  App.clicks.push(function (d) {
    if (d.title != null) { if (Meta.wearTitle(d.title)) { App.sfx.play('move'); App.openSheet('profile'); App.updateMenu(); } return true; }
    return false;
  });

  // Bring the saved pictures back when the page opens.
  App.boot.push(function () {
    ['bg', 'tile'].forEach(function (key) {
      if (!Meta.data.custom[key]) return;
      Pics.get(key, function (url) {
        if (url) useUrl(key, url);
        else { Meta.data.custom[key] = false; if (Meta.data.equip[key] === 'custom') Meta.equip(key, key === 'tile' ? 'glaze' : 'wall'); Meta.save(); App.applyLook(); }
      });
    });
  });
  ZZ.Pics = Pics;
})();
