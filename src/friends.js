/* 轉磚 friends: add a friend by their friend code (the public tag the leaderboards show), agree by adding back, see
   who has the game open, and invite friends into a room (轉磚 here, or 地城小隊 on its own page). The server keeps the
   friendships (server/core.js, friends*). The page looks in every 30 seconds while it is in front, which is also what
   "online" means to friends; invitations from friends then show as a small card. Under 13 there is none of this,
   the same as online play. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, esc = App.esc, btn = App.btn;
  var POLL = 30000, SEEN = 'zhuanzhuan.invites.v1';

  L.add({
    'fr.title': ['好友', 'Friends', 'フレンド', '친구'],
    'fr.kid': ['未滿 13 歲不能加好友（和連線對戰一樣，避免跟不認識的人接觸）。', 'Friends are not available under 13 (like online play, so you do not meet strangers).', '13歳未満はフレンド機能を使えません（オンライン対戦と同じく、知らない人と接しないため）。', '13세 미만은 친구 기능을 쓸 수 없어요(온라인 대전처럼 모르는 사람과 만나지 않도록).'],
    'fr.off': ['好友功能要連上轉磚的伺服器才能用。', 'Friends need 轉磚\'s server, which cannot be reached here.', 'フレンド機能は轉磚のサーバーにつながっているときだけ使えます。', '친구 기능은 轉磚 서버에 연결되어 있어야 써요.'],
    'fr.loading': ['載入中…', 'Loading…', '読み込み中…', '불러오는 중…'],
    'fr.myCode': ['我的好友碼', 'My friend code', '自分のフレンドコード', '내 친구 코드'],
    'fr.copyLink': ['複製加好友連結', 'Copy friend link', 'フレンドリンクをコピー', '친구 링크 복사'],
    'fr.copied': ['已複製', 'Copied', 'コピーしました', '복사됨'],
    'fr.add': ['加好友', 'Add friend', 'フレンド申請', '친구 추가'],
    'fr.codePh': ['朋友的好友碼（8 碼）', 'A friend\'s code (8 letters)', '友達のコード（8文字）', '친구 코드(8자)'],
    'fr.sent': ['已送出給 {0}，等對方同意', 'Sent to {0}; waiting for them to agree', '{0}に送りました。承認を待っています', '{0}에게 보냈어요. 수락을 기다리는 중'],
    'fr.now': ['你和 {0} 成為好友了！', 'You and {0} are friends now!', '{0}とフレンドになりました！', '{0}와(과) 친구가 됐어요!'],
    'fr.e.self': ['這是你自己的好友碼', 'That is your own code', '自分のコードです', '내 코드예요'],
    'fr.e.nobody': ['找不到這個好友碼', 'Nobody has that code', 'そのコードの人は見つかりません', '그 코드의 사람이 없어요'],
    'fr.e.code': ['好友碼是 8 個英文字母和數字', 'A friend code is 8 letters and digits', 'フレンドコードは英数字8文字です', '친구 코드는 영문과 숫자 8자예요'],
    'fr.e.wait': ['對方不久前結束了好友關係，一天後才能再送', 'They ended it not long ago; you can ask again in a day', '最近相手が解除しました。1日たってから申請できます', '상대가 최근에 끊었어요. 하루 뒤에 다시 보낼 수 있어요'],
    'fr.e.many': ['好友最多 100 位', 'Up to 100 friends', 'フレンドは100人まで', '친구는 100명까지'],
    'fr.e.slow': ['送太多次了，等一下再試', 'Too many tries; wait a little', '試行が多すぎます。少し待って', '시도가 너무 많아요. 잠시 기다려 주세요'],
    'fr.e.net': ['連不上伺服器，稍後再試', 'Cannot reach the server; try again later', 'サーバーにつながりません。あとでもう一度', '서버에 연결할 수 없어요. 나중에 다시'],
    'fr.in': ['想加你為好友', 'wants to be your friend', 'からフレンド申請', '님이 친구 신청'],
    'fr.inH': ['收到的申請', 'Requests', '届いた申請', '받은 신청'],
    'fr.accept': ['同意', 'Accept', '承認', '수락'],
    'fr.decline': ['拒絕', 'Decline', '断る', '거절'],
    'fr.list': ['好友（{0}）', 'Friends ({0})', 'フレンド（{0}）', '친구({0})'],
    'fr.none': ['還沒有好友。把你的好友碼傳給朋友，或輸入朋友的好友碼。', 'No friends yet. Send your code to a friend, or type in theirs.', 'まだフレンドがいません。自分のコードを送るか、友達のコードを入力しよう。', '아직 친구가 없어요. 내 코드를 보내거나 친구 코드를 입력하세요.'],
    'fr.outH': ['等對方同意', 'Waiting for them', '承認待ち', '수락 대기'],
    'fr.cancel': ['取消', 'Cancel', '取り消す', '취소'],
    'fr.remove': ['移除', 'Remove', '解除', '삭제'],
    'fr.removeSure': ['確定移除？', 'Remove for sure?', '本当に解除？', '정말 삭제?'],
    'fr.online': ['在線上', 'Online', 'オンライン', '온라인'],
    'fr.ago': ['{0} 分鐘前', '{0} min ago', '{0}分前', '{0}분 전'],
    'fr.agoH': ['{0} 小時前', '{0} h ago', '{0}時間前', '{0}시간 전'],
    'fr.agoD': ['{0} 天前', '{0} days ago', '{0}日前', '{0}일 전'],
    'fr.invite': ['邀請', 'Invite', '招待', '초대'],
    'fr.invited': ['已邀請 {0}', '{0} invited', '{0}を招待しました', '{0} 초대함'],
    'fr.inRoom': ['你在房間 {0}，按「邀請」叫好友進來。', 'You are in room {0}: press Invite to bring a friend in.', '部屋 {0} にいます。「招待」で友達を呼べます。', '방 {0}에 있어요. 「초대」로 친구를 불러요.'],
    'fr.inviteBtn': ['邀請好友', 'Invite friends', '友達を招待', '친구 초대'],
    'fr.banZZ': ['{0} 邀你一起玩轉磚', '{0} invites you to play 轉磚', '{0}から轉磚のお誘い', '{0}님이 轉磚에 초대했어요'],
    'fr.banDG': ['{0} 邀你一起玩地城小隊', '{0} invites you to Dungeon Party', '{0}からダンジョン小隊のお誘い', '{0}님이 던전 파티에 초대했어요'],
    'fr.join': ['加入', 'Join', '参加', '참가'],
    'fr.ignore': ['忽略', 'Ignore', '無視', '무시'],
    'fr.help': ['好友碼就是排行榜上顯示的那組代碼。對方也加你，就成為好友；之後開房間可以直接邀請。', 'Your friend code is the tag shown on the leaderboards. When they add you back you are friends, and you can invite each other into rooms.', 'フレンドコードはランキングに出るコードです。相手も申請すればフレンドになり、部屋に招待できます。', '친구 코드는 랭킹에 표시되는 코드예요. 상대도 추가하면 친구가 되고, 방에 초대할 수 있어요.']
  });

  var data = null, busy = false, msg = '', msgBad = false, sure = '', backTo = '', timer = 0, lastAt = 0;
  var hosted = function () { return ZZ.Cloud && ZZ.Cloud.hosted(); };
  var kid = function () { return ZZ.Consent && ZZ.Consent.child && ZZ.Consent.child(); };
  var codeOf = function (pub) { return String(pub || '').toUpperCase(); };
  var myName = function () { return Meta.data.name || t('player'); };
  function seen() { try { return JSON.parse(sessionStorage.getItem(SEEN) || '[]'); } catch (e) { return []; } }
  function markSeen(k) { var s = seen(); s.push(k); try { sessionStorage.setItem(SEEN, JSON.stringify(s.slice(-50))); } catch (e) { /* once more */ } }
  function room() { var N = ZZ.Net; return N && N.code && !N.matched && (N.state === 'waiting' || N.state === 'ready') ? N.code : ''; }

  // ---------- talking to the server ----------
  function refresh(draw) {
    if (busy || kid() || !hosted() || !ZZ.Cloud.cred) return Promise.resolve(null);
    busy = true;
    return ZZ.Cloud.rpc({ a: 'fr' }).then(function (r) {
      busy = false; lastAt = Date.now();
      if (r && r.status === 200 && r.body.ok) { data = r.body; badge(); banner(); }
      if (draw && App.sheet() === 'friends') App.openSheet('friends');
      return data;
    }, function () { busy = false; return null; });
  }
  function answer(r, ok) {
    if (!r) { msg = t('fr.e.net'); msgBad = true; }
    else if (r.status === 200 && r.body.ok) ok(r.body);
    else { msg = L.has('fr.e.' + r.body.why) ? t('fr.e.' + r.body.why) : t('fr.e.net'); msgBad = true; }
    refresh(true);
  }
  function add(code) {
    msg = ''; msgBad = false;
    var c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c.length !== 8) { msg = t('fr.e.code'); msgBad = true; return App.openSheet('friends'); }
    ZZ.Cloud.ensure().then(function (ok) {
      if (!ok) { msg = t('fr.e.net'); msgBad = true; return App.openSheet('friends'); }
      ZZ.Cloud.rpc({ a: 'frAdd', p: c }).then(function (r) { answer(r, function (b) { msg = t(b.st === 'ok' ? 'fr.now' : 'fr.sent', b.n || codeOf(b.p)); if (b.st === 'ok') App.sfx.play('chime'); }); });
    });
  }
  function drop(pub) { msg = ''; ZZ.Cloud.rpc({ a: 'frDrop', p: pub }).then(function (r) { sure = ''; answer(r, function () {}); }); }
  function invite(pub, name) {
    var code = room();
    if (!code) return;
    ZZ.Cloud.rpc({ a: 'frInv', p: pub, g: 'zz', code: code }).then(function (r) {
      if (r && r.status === 200 && r.body.ok) App.toast(t('fr.invited', name), 2000);
      else App.toast(r && L.has('fr.e.' + r.body.why) ? t('fr.e.' + r.body.why) : t('fr.e.net'), 2600);
    });
  }

  // ---------- the sheet ----------
  function ago(ms) {
    var m = Math.max(1, Math.round((Date.now() - ms) / 60000));
    return m < 60 ? t('fr.ago', m) : m < 1440 ? t('fr.agoH', Math.round(m / 60)) : t('fr.agoD', Math.round(m / 1440));
  }
  function row(f, buttons, sub) {
    return '<li class="fr-row' + (f.on ? ' on' : '') + '"><i class="fr-dot" aria-hidden="true"></i><span><b>' + esc(f.n || t('player')) + '</b><small>' + esc(sub) + '</small></span><span class="fr-btns">' + buttons + '</span></li>';
  }
  App.sheets.friends = function () {
    var h = '<h2>' + t('fr.title') + '</h2>';
    if (kid()) return h + '<p class="note">' + t('fr.kid') + '</p><div class="row">' + btn('close', 'close', true) + '</div>';
    if (!hosted()) return h + '<p class="note">' + t('fr.off') + '</p><div class="row">' + btn('close', 'close', true) + '</div>';
    var me = data && data.me || (ZZ.Cloud && ZZ.Cloud.pub) || '';
    h += '<div class="fr-me"><span>' + t('fr.myCode') + '</span><b id="frMine">' + esc(me ? codeOf(me) : '········') + '</b>' + (me ? '<button class="btn sm" type="button" data-do="frCopy">' + t('fr.copyLink') + '</button>' : '') + '</div>' +
      '<p class="note">' + t('fr.help') + '</p>' +
      '<form class="joinrow" id="frForm"><input id="frCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="' + esc(t('fr.codePh')) + '" value="' + esc(App.frWant || '') + '">' + btn('frAdd', 'fr.add', true) + '</form>';
    if (msg) h += '<p class="' + (msgBad ? 'warn' : 'note ok') + '" role="status">' + esc(msg) + '</p>';
    if (room()) h += '<p class="note"><b>' + esc(t('fr.inRoom', room())) + '</b></p>';
    if (!data) return h + '<p class="note">' + t('fr.loading') + '</p><div class="row">' + btn('close', 'close') + '</div>';
    var ins = data.list.filter(function (f) { return f.st === 'in'; }), oks = data.list.filter(function (f) { return f.st === 'ok'; }), outs = data.list.filter(function (f) { return f.st === 'out'; });
    oks.sort(function (a, b) { return (b.on ? 1 : 0) - (a.on ? 1 : 0) || (b.seen || 0) - (a.seen || 0); });
    if (ins.length) {
      h += '<h3>' + t('fr.inH') + '</h3><ul class="fr-list">';
      ins.forEach(function (f) { h += row(f, '<button class="btn sm main" type="button" data-fradd="' + f.p + '">' + t('fr.accept') + '</button><button class="btn sm" type="button" data-frdrop="' + f.p + '">' + t('fr.decline') + '</button>', t('fr.in') + ' · ' + t('xp.lv', f.lv)); });
      h += '</ul>';
    }
    h += '<h3>' + t('fr.list', oks.length) + '</h3>';
    if (!oks.length) h += '<p class="note">' + t('fr.none') + '</p>';
    else {
      h += '<ul class="fr-list">';
      oks.forEach(function (f) {
        var b = (room() ? '<button class="btn sm main" type="button" data-frinv="' + f.p + '">' + t('fr.invite') + '</button>' : '') +
          '<button class="btn sm" type="button" data-frdrop="' + f.p + '">' + t(sure === f.p ? 'fr.removeSure' : 'fr.remove') + '</button>';
        h += row(f, b, t('xp.lv', f.lv) + ' · ' + (f.on ? t('fr.online') : f.seen ? ago(f.seen) : ''));
      });
      h += '</ul>';
    }
    if (outs.length) {
      h += '<h3>' + t('fr.outH') + '</h3><ul class="fr-list">';
      outs.forEach(function (f) { h += row(f, '<button class="btn sm" type="button" data-frdrop="' + f.p + '">' + t('fr.cancel') + '</button>', codeOf(f.p)); });
      h += '</ul>';
    }
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  App.dismiss.friends = 1;
  App.acts.frAdd = function () { var e = document.getElementById('frCode'); App.frWant = e ? e.value : ''; add(App.frWant); };
  App.acts.frCopy = function (b) {
    var link = window.location.href.split('#')[0].split('?')[0] + '?friend=' + codeOf(data && data.me || ZZ.Cloud.pub);
    var done = function () { if (b) b.textContent = t('fr.copied'); };
    try { navigator.clipboard.writeText(link).then(done, done); } catch (e) { done(); }
  };
  App.acts.frOpen = function () { backTo = App.sheet() || ''; App.openSheet('friends'); };
  App.clicks.push(function (d) {
    if (d.fradd) { add(d.fradd); return true; }
    if (d.frdrop) {
      var f = data && data.list.filter(function (x) { return x.p === d.frdrop; })[0];
      if (f && f.st === 'ok' && sure !== f.p) { sure = f.p; App.openSheet('friends'); return true; }      // removing a friend asks once more
      drop(d.frdrop); return true;
    }
    if (d.frinv) { var g = data && data.list.filter(function (x) { return x.p === d.frinv; })[0]; invite(d.frinv, g ? g.n : ''); return true; }
    return false;
  });
  document.addEventListener('submit', function (e) { if (e.target && e.target.id === 'frForm') { e.preventDefault(); App.acts.frAdd(); } });
  App.inputs.push(function (el) { if (el.id === 'frCode') { App.frWant = el.value; return true; } return false; });
  var opened = App.openSheet;
  App.closed.friends = function () { msg = ''; sure = ''; if (backTo === 'online' && room()) { backTo = ''; setTimeout(function () { opened('online'); }, 0); } backTo = ''; };

  // ---------- the red dot, and the card for an invitation ----------
  function badge() {
    var n = data ? data.list.filter(function (f) { return f.st === 'in'; }).length : 0;
    ['frDot', 'frDotD'].forEach(function (id) { var e = document.getElementById(id); if (e) e.hidden = !n; });
  }
  var card = null, showing = '';
  function banner() {
    if (!data || !data.inv) return;
    var done = seen(), inv = data.inv.filter(function (i) { return done.indexOf(i.p + ':' + i.at) < 0; })[0];
    var peek = ZZ.peek && ZZ.peek(), busyNow = peek && peek.S && peek.S.state === 'play';
    if (!inv || busyNow || kid()) { if (card) card.hidden = true; showing = ''; return; }
    if (!card) {
      card = document.createElement('div'); card.className = 'frcard'; card.setAttribute('role', 'status'); card.hidden = true;
      document.body.appendChild(card);
      card.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (!b) return;
        var i = JSON.parse(card.getAttribute('data-inv') || 'null');
        if (!i) return;
        markSeen(i.p + ':' + i.at); card.hidden = true; showing = '';
        if (b.getAttribute('data-k') !== 'join') return banner();
        if (i.g === 'dg') { window.location.href = 'games/dungeon/?room=' + encodeURIComponent(i.code) + '&join=1'; return; }
        if (ZZ.Net && ZZ.Net.state !== 'idle' && ZZ.Net.state !== 'error') ZZ.Net.leave();
        if (App.toMenu && peek && peek.screen !== 'menu') App.toMenu();
        App.openSheet('online');
        ZZ.Net.join(i.code, myName());
      });
    }
    var key = inv.p + ':' + inv.at;
    if (showing === key) return;
    showing = key;
    card.setAttribute('data-inv', JSON.stringify(inv));
    card.innerHTML = '<p>' + esc(t(inv.g === 'dg' ? 'fr.banDG' : 'fr.banZZ', inv.n || t('player'))) + '</p><div><button class="btn sm main" type="button" data-k="join">' + t('fr.join') + '</button><button class="btn sm" type="button" data-k="no">' + t('fr.ignore') + '</button></div>';
    card.hidden = false;
    App.sfx.play('chime');
  }
  function tick() {
    if (document.hidden || kid() || !hosted() || !ZZ.Cloud.cred) return;
    if (Date.now() - lastAt >= POLL - 500) refresh(App.sheet() === 'friends');
  }
  App.boot.push(function () {
    // ?friend=CODE: someone's friend link; the sheet opens with the code filled in
    var m = /[?&]friend=([A-Za-z0-9-]{8,12})/.exec(window.location.search);
    if (m && !kid()) { App.frWant = m[1].toUpperCase(); setTimeout(function () { if (!App.sheet()) App.openSheet('friends'); }, 700); }
    if (ZZ.Cloud && ZZ.Cloud.whenKnown) ZZ.Cloud.whenKnown(function () { refresh(false); });
    else setTimeout(function () { refresh(false); }, 1500);
    timer = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  });
  // opening the sheet asks the server straight away
  App.opened = App.opened || {};
  var prevOpen = App.opened.friends;
  App.opened.friends = function () { if (prevOpen) prevOpen(); if (Date.now() - lastAt > 3000) refresh(true); };
  App.friendsRefresh = refresh;
})();
