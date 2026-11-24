/* 轉磚 levels mode: pick a numbered level (1 to 1000), the endless run, and the level editor whose levels are shared
   as a link (?lv=CODE). The levels themselves are made in levels.js. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, Lv = ZZ.Levels, esc = App.esc, btn = App.btn;
  var PAGE = 50;

  L.add({
    'lv.title': ['關卡', 'Levels', 'ステージ', '스테이지'],
    'lv.menuT': ['關卡挑戰', 'Levels', 'ステージ', '스테이지'],
    'lv.menuS': ['1000 關，每關的地形和目標都不一樣', '1000 levels, each with its own wall and goal', '1000 ステージ、地形も目標もそれぞれ違う', '1000 스테이지, 지형과 목표가 모두 달라요'],
    'lv.stars': ['已拿 {0} 顆星', '{0} stars so far', '星 {0} 個', '별 {0}개'],
    'lv.page': ['第 {0}–{1} 關', 'Levels {0}–{1}', '{0}–{1}', '{0}–{1}단계'],
    'lv.prev': ['上一頁', 'Previous', '前へ', '이전'],
    'lv.next': ['下一頁', 'Next', '次へ', '다음'],
    'lv.no': ['第 {0} 關', 'Level {0}', 'ステージ {0}', '{0}단계'],
    'lv.endless': ['無限挑戰', 'Endless run', 'エンドレス', '무한 도전'],
    'lv.endlessP': ['隨機地形一關接一關，越後面越難。最佳紀錄：第 {0} 關', 'Random walls one after another, harder as you go. Best: stage {0}', 'ランダムな地形が次々に。ベスト：{0}面', '랜덤 지형이 계속, 갈수록 어려워요. 최고: {0}단계'],
    'lv.endlessGo': ['開始', 'Start', 'スタート', '시작'],
    'lv.stage': ['無限挑戰 第 {0} 關', 'Endless · stage {0}', 'エンドレス {0}面', '무한 도전 {0}단계'],
    'lv.custom': ['自訂關卡', 'Custom levels', 'カスタムステージ', '커스텀 스테이지'],
    'lv.customP': ['自己畫地形、定目標，做成連結分享給朋友。', 'Draw your own wall, set the goal, and share it as a link.', '地形と目標を自分で作って、リンクで共有。', '지형과 목표를 직접 만들어 링크로 공유하세요.'],
    'lv.make': ['做一關', 'Make a level', 'ステージを作る', '스테이지 만들기'],
    'lv.codePh': ['貼上朋友給的代碼', 'Paste a level code', 'コードを貼り付け', '코드 붙여넣기'],
    'lv.playCode': ['玩這關', 'Play it', '遊ぶ', '플레이'],
    'lv.badCode': ['這個代碼看不懂，請再確認一次。', 'That code does not look right.', 'コードが正しくないようです。', '코드가 올바르지 않습니다.'],
    'lv.g.dig': ['把水泥全部挖掉', 'Dig out all the cement', 'セメントを全部掘る', '시멘트를 모두 파내기'],
    'lv.g.lines': ['消 {0} 行', 'Clear {0} lines', '{0}ライン消す', '{0}줄 지우기'],
    'lv.g.tspin': ['做出 {0} 次 T 轉', 'Make {0} T-spins', 'Tスピン{0}回', 'T스핀 {0}회'],
    'lv.pieces': ['用了', 'Used', '使用', '사용'],
    'lv.left': ['剩下', 'Left', '残り', '남음'],
    'lv.limitP': ['最多 {0} 塊，{1} 塊內完成拿 3 顆星。', 'Up to {0} pieces; within {1} for 3 stars.', '最大{0}個、{1}個以内で星3つ。', '최대 {0}개, {1}개 안에 끝내면 별 3개.'],
    'lv.cement': ['水泥還有 {0} 格', '{0} cement cells left', 'セメント残り{0}', '시멘트 {0}칸 남음'],
    'lv.done': ['過關！', 'Cleared!', 'クリア！', '클리어!'],
    'lv.doneP': ['用了 {0} 塊', '{0} pieces', '{0}個使用', '{0}개 사용'],
    'lv.coins': ['拿到 {0} 金幣', '{0} coins', '{0}コイン獲得', '{0}코인 획득'],
    'lv.better': ['再少用一點就能拿更多星。', 'Use fewer pieces for more stars.', 'もっと少ない数で星が増えます。', '더 적게 쓰면 별을 더 받아요.'],
    'lv.nextLv': ['下一關', 'Next level', '次のステージ', '다음 스테이지'],
    'lv.fail': ['沒過', 'Not this time', '失敗', '실패'],
    'lv.failTop': ['牆疊到頂了。', 'The wall reached the top.', '壁が上まで届きました。', '벽이 꼭대기에 닿았어요.'],
    'lv.failLimit': ['方塊用完了。', 'Out of pieces.', 'ブロックを使い切りました。', '블록을 다 썼어요.'],
    'lv.retry': ['再試一次', 'Try again', 'もう一度', '다시 하기'],
    'lv.toList': ['回關卡列表', 'Back to levels', 'ステージ一覧へ', '스테이지 목록'],
    'lv.endlessOver': ['無限挑戰結束', 'Endless run over', 'エンドレス終了', '무한 도전 종료'],
    'lv.endlessReach': ['過了 {0} 關', '{0} stages cleared', '{0}面クリア', '{0}단계 클리어'],
    'lv.newBest': ['新紀錄！', 'New best!', '自己ベスト！', '신기록!'],
    'lv.ed': ['做一關', 'Make a level', 'ステージを作る', '스테이지 만들기'],
    'lv.edP': ['點格子放水泥或拿掉，每一排至少要留一個空格。', 'Tap a cell to add or remove cement. Every row needs at least one gap.', 'マスをタップしてセメントを置く／消す。各段に最低1つ空きが必要。', '칸을 눌러 시멘트를 놓거나 지우세요. 줄마다 빈칸이 하나는 있어야 해요.'],
    'lv.edH': ['高度', 'Height', '高さ', '높이'],
    'lv.edGoal': ['目標', 'Goal', '目標', '목표'],
    'lv.edNeed': ['數量', 'How many', '数', '개수'],
    'lv.edLimit': ['最多幾塊', 'Piece limit', '最大個数', '최대 개수'],
    'lv.edTry': ['試玩', 'Try it', '試しに遊ぶ', '해보기'],
    'lv.edShare': ['複製分享連結', 'Copy the share link', '共有リンクをコピー', '공유 링크 복사'],
    'lv.edCopied': ['連結複製好了，貼給朋友就能玩。', 'Link copied. Send it to a friend.', 'リンクをコピーしました。', '링크를 복사했어요.'],
    'lv.edRandom': ['隨機一個', 'Random', 'ランダム', '랜덤'],
    'lv.edClear': ['清空', 'Clear', 'クリア', '비우기'],
    'lv.edBad': ['每一排至少要留一個空格，挖掉目標也至少要有一格水泥。', 'Every row needs a gap, and a dig goal needs some cement.', '各段に空きが必要で、掘る目標にはセメントが必要です。', '줄마다 빈칸이 필요하고, 파내기 목표에는 시멘트가 있어야 해요.'],
    'lv.invite': ['朋友給你一個關卡', 'A level from a friend', '友だちのステージ', '친구의 스테이지'],
    'lv.lock': ['先過前一關', 'Clear the one before first', '前のステージをクリアしてから', '이전 스테이지를 먼저 깨세요']
  });

  function goalText(lv) { return lv.goal === 'dig' ? t('lv.g.dig') : t('lv.g.' + lv.goal, lv.need); }
  function starStr(n, max) { var s = ''; for (var i = 0; i < (max || 3); i++) s += i < n ? '★' : '☆'; return s; }

  // ---------- the list ----------
  var view = { page: -1, code: '' };
  App.go.levels = function () { App.openSheet('levels'); };
  App.sheets.levels = function () {
    var d = Meta.data.lv, h, i, done = d.stars.replace(/0+$/, '').length;
    if (view.page < 0) view.page = Math.min(Math.floor(done / PAGE), Lv.COUNT / PAGE - 1);
    var from = view.page * PAGE + 1, to = Math.min(Lv.COUNT, from + PAGE - 1);
    h = '<div class="shop-top"><h2>' + t('lv.title') + '</h2><span class="note">' + esc(t('lv.stars', Meta.lvTotal())) + '</span></div>';
    h += '<div class="rep"><div class="rep-t"><b>' + t('lv.endless') + '</b><span>' + esc(t('lv.endlessP', d.endless)) + '</span></div>' + btn('endlessGo', 'lv.endlessGo', true) + '</div>';
    h += '<div class="pager"><button class="btn sm" type="button" data-lvpage="-1"' + (view.page ? '' : ' disabled') + '>' + t('lv.prev') + '</button><b>' + esc(t('lv.page', from, to)) + '</b>' +
      '<button class="btn sm" type="button" data-lvpage="1"' + (to < Lv.COUNT ? '' : ' disabled') + '>' + t('lv.next') + '</button></div><div class="lvgrid">';
    for (i = from; i <= to; i++) {
      var st = Meta.lvStars(i), open = Meta.lvOpen(i);
      h += '<button type="button" class="lvb' + (st ? ' done' : open ? ' open' : '') + '" data-lvn="' + i + '"' + (open ? '' : ' disabled aria-label="' + esc(t('lv.lock')) + '"') + '><b>' + i + '</b><span>' + (st ? starStr(st) : open ? '' : '🔒') + '</span></button>';
    }
    h += '</div><h3>' + t('lv.custom') + '</h3><p class="note">' + t('lv.customP') + '</p><div class="row">' + btn('lvEdit', 'lv.make') + '</div>' +
      '<div class="joinrow"><input id="lvCode" type="text" autocomplete="off" spellcheck="false" maxlength="64" placeholder="' + esc(t('lv.codePh')) + '" value="' + esc(view.code) + '">' + btn('lvCodeGo', 'lv.playCode') + '</div>';
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  App.clicks.push(function (d) {
    if (d.lvpage != null) { view.page = Math.max(0, Math.min(Lv.COUNT / PAGE - 1, view.page + (+d.lvpage))); App.openSheet('levels'); return true; }
    if (d.lvn != null) { var n = +d.lvn; if (Meta.lvOpen(n)) App.begin('level', { n: n }); return true; }
    return false;
  });
  App.acts.endlessGo = function () { App.begin('level', { endless: true, stage: 1, eseed: (Math.random() * 4294967296) >>> 0 }); };
  App.acts.lvCodeGo = function () {
    var el = document.getElementById('lvCode'), raw = el ? el.value.trim() : '', m = /[?&]lv=([A-Za-z0-9_-]+)/.exec(raw), code = m ? m[1] : raw, lv = Lv.decode(code);
    view.code = raw;
    if (!lv) return App.toast(t('lv.badCode'));
    App.begin('level', { custom: lv, code: code });
  };

  // ---------- playing a level ----------
  var K = App.kinds.level = {
    strip: true,
    begin: function (S, o) {
      var lv = o.custom ? o.custom : o.endless ? Lv.endless(o.stage, o.eseed) : Lv.level(o.n);
      S.lv = lv; S.pieces = 0; S.limit = Lv.limitOf(lv);
      S.me = new ZZ.Game({ board: lv.board, seed: lv.seed, gravity: lv.gravity, lockDelay: App.set.lock, garbage: false, sdf: App.sdfVal() });
      // a numbered level's clear goes to the server with its replay, which is what makes it count (and pay)
      S.tape = !o.custom && !o.endless && ZZ.Replay ? new ZZ.Replay.Tape(lv.seed, false) : null;
      S.state = 'play';
    },
    started: function () { var S = App.S(); S.me.start(); say(); },
    hud: function () {
      var S = App.S(), el = App.el, lv = S.lv;
      el.hudL.innerHTML = '<span class="who">' + esc(lv.custom ? t('lv.custom') : lv.endless ? t('lv.stage', lv.endless) : t('lv.no', lv.n)) + '</span>';
      el.hudC.innerHTML = '<div class="hud-title">' + esc(goalText(lv)) + '</div>';
      el.hudR.innerHTML = '<div class="stat"><b id="lvLeft">0</b><span>' + t('lv.left') + '</span></div>';
    },
    update: function () {
      var S = App.S();
      App.txt('lvLeft', String(Math.max(0, S.limit - S.pieces)));
    },
    tools: function () { return App.tool('restart', 'restart'); },
    lock: function () {
      var S = App.S();
      S.pieces++;
      if (Lv.met(S.lv, S.me)) return K.win();
      if (S.pieces >= S.limit) return K.lose('limit');
      say();
    },
    topout: function () { K.lose('top'); },
    empty: function () { /* the queue never runs out */ },
    restart: function () { var S = App.S(); App.begin('level', S.o); },
    win: function () {
      var S = App.S(), lv = S.lv, o = S.o;
      S.state = 'wait'; S.wait = 1300; S.target = null;
      App.sfx.play('win'); App.buzz([20, 40, 60]); App.banner(t('lv.done'), 'good', 1200);
      if (lv.endless) {
        // straight on to the next stage
        S.after = function () { App.begin('level', { endless: true, stage: o.stage + 1, eseed: o.eseed }); App.toast(t('lv.stage', o.stage + 1)); };
        return;
      }
      if (lv.custom) { Meta.customPlayed(); S.res = { custom: true, pieces: S.pieces }; }
      else S.res = Meta.levelClear(lv.n, S.pieces, S.tape ? S.tape.done() : null);
      S.res.pieces = S.pieces;
      S.after = function () { App.openSheet('levelDone'); };
    },
    lose: function (why) {
      var S = App.S(), lv = S.lv;
      if (S.state !== 'play') return;
      S.state = 'wait'; S.wait = 900; S.target = null; S.why = why;
      App.sfx.play('lose');
      if (lv.endless) { S.res = Meta.endlessDone(S.o.stage - 1); S.after = function () { App.openSheet('endlessOver'); }; return; }
      if (lv.custom) Meta.customPlayed();
      S.after = function () { App.openSheet('levelFail'); };
    }
  };
  function say() {
    var S = App.S(), lv = S.lv, line = '<b>' + esc(goalText(lv)) + '</b>';
    if (lv.goal === 'dig') { var n = 0; S.me.grid.forEach(function (r) { r.forEach(function (c) { if ((c & 15) === ZZ.GARBAGE) n++; }); }); line += '　' + esc(t('lv.cement', n)); }
    else if (lv.goal === 'lines') line += '　' + S.me.stats.lines + ' / ' + lv.need;
    else line += '　' + (S.me.stats.spins + S.me.stats.minis) + ' / ' + lv.need;
    if (!lv.custom && !lv.endless) line += '<br><span class="note">' + esc(t('lv.limitP', S.limit, lv.par + 2)) + '</span>';
    App.el.strip.innerHTML = line;
  }

  // ---------- after a level ----------
  App.sheets.levelDone = function () {
    var S = App.S(), r = S.res || {}, lv = S.lv, h = '<h2 class="verdict win">' + t('lv.done') + '</h2>';
    if (!r.custom) h += '<p class="stars-big">' + starStr(r.stars) + '</p>';
    h += '<p>' + esc(t('lv.doneP', r.pieces)) + (r.coins ? '　' + App.coin(r.coins) : '') + '</p>';
    if (!r.custom && r.stars < 3) h += '<p class="note">' + t('lv.better') + '</p>';
    var more = !lv.custom && lv.n < Lv.COUNT;
    return h + '<div class="row">' + (more ? btn('lvNext', 'lv.nextLv', true) : '') + btn('again', 'lv.retry', !more) + btn('lvList', 'lv.toList') + '</div>';
  };
  App.sheets.levelFail = function () {
    var S = App.S();
    return '<h2 class="verdict lose">' + t('lv.fail') + '</h2><p>' + t(S.why === 'limit' ? 'lv.failLimit' : 'lv.failTop') + '</p><div class="row">' + btn('again', 'lv.retry', true) + btn('lvList', 'lv.toList') + '</div>';
  };
  App.sheets.endlessOver = function () {
    var S = App.S(), r = S.res || {};
    return '<h2>' + t('lv.endlessOver') + '</h2><p><b>' + esc(t('lv.endlessReach', S.o.stage - 1)) + '</b>' + (r.best ? '　' + t('lv.newBest') : '') + '</p>' +
      '<div class="row">' + btn('endlessGo', 'lv.endlessGo', true) + btn('lvList', 'lv.toList') + '</div>';
  };
  App.acts.lvNext = function () { var S = App.S(); App.begin('level', { n: S.lv.n + 1 }); };
  App.acts.lvList = function () { App.toMenu(); view.page = -1; App.openSheet('levels'); };

  // ---------- the editor ----------
  var ed = { rows: ['XXXX.XXXXX', 'XXX.XXXXXX', 'XXXXX.XXXX', 'XX.XXXXXXX'], goal: 'dig', need: 8, limit: 40, copied: false };
  function edValid() { return ed.rows.every(function (r) { return r.indexOf('.') >= 0; }) && (ed.goal !== 'dig' || ed.rows.join('').indexOf('X') >= 0); }
  function edLevel() { return { goal: ed.goal, need: ed.goal === 'dig' ? 0 : ed.need, limit: ed.limit, board: ed.rows.slice() }; }
  App.sheets.lvEdit = function () {
    var h = '<h2>' + t('lv.ed') + '</h2><p class="note">' + t('lv.edP') + '</p><div class="edgrid">', r, c;
    for (r = 0; r < ed.rows.length; r++) for (c = 0; c < 10; c++) h += '<button type="button" class="edc' + (ed.rows[r].charAt(c) === 'X' ? ' on' : '') + '" data-edc="' + r + ',' + c + '" aria-pressed="' + (ed.rows[r].charAt(c) === 'X') + '"></button>';
    h += '</div>';
    h += '<div class="edrow"><span>' + t('lv.edH') + '</span><button class="btn sm" type="button" data-edh="-1">−</button><b>' + ed.rows.length + '</b><button class="btn sm" type="button" data-edh="1">+</button></div>';
    h += '<h3>' + t('lv.edGoal') + '</h3><div class="seg" role="radiogroup" aria-label="' + esc(t('lv.edGoal')) + '">';
    ['dig', 'lines', 'tspin'].forEach(function (g) { h += '<button type="button" role="radio" aria-checked="' + (ed.goal === g) + '" data-edg="' + g + '">' + esc(g === 'dig' ? t('lv.g.dig') : t('lv.g.' + g, '?')) + '</button>'; });
    h += '</div>';
    if (ed.goal !== 'dig') h += '<div class="edrow"><span>' + t('lv.edNeed') + '</span><button class="btn sm" type="button" data-edn="-1">−</button><b>' + ed.need + '</b><button class="btn sm" type="button" data-edn="1">+</button></div>';
    h += '<div class="edrow"><span>' + t('lv.edLimit') + '</span><button class="btn sm" type="button" data-edl="-5">−</button><b>' + ed.limit + '</b><button class="btn sm" type="button" data-edl="5">+</button></div>';
    if (!edValid()) h += '<p class="warn">' + t('lv.edBad') + '</p>';
    if (ed.copied) h += '<p class="note" role="status">' + t('lv.edCopied') + '</p>';
    return h + '<div class="row">' + btn('edRandom', 'lv.edRandom') + btn('edClear', 'lv.edClear') + '</div><div class="row">' + btn('edTry', 'lv.edTry', true) + btn('edShare', 'lv.edShare') + '</div><div class="row">' + btn('lvList', 'lv.toList') + '</div>';
  };
  App.acts.lvEdit = function () { ed.copied = false; App.openSheet('lvEdit'); };
  App.clicks.push(function (d) {
    if (d.edc != null) {
      var p = d.edc.split(','), r = +p[0], c = +p[1], s = ed.rows[r];
      if (s == null || !(c >= 0 && c < 10)) return true;
      ed.rows[r] = s.slice(0, c) + (s.charAt(c) === 'X' ? '.' : 'X') + s.slice(c + 1);
      ed.copied = false; App.openSheet('lvEdit'); return true;
    }
    if (d.edh != null) { if (+d.edh > 0 && ed.rows.length < 12) ed.rows.unshift('X.XXXXXXXX'); else if (+d.edh < 0 && ed.rows.length > 1) ed.rows.shift(); App.openSheet('lvEdit'); return true; }
    if (d.edg != null) { if (['dig', 'lines', 'tspin'].indexOf(d.edg) >= 0) ed.goal = d.edg; if (ed.goal === 'tspin') ed.need = Math.min(ed.need, 10); App.openSheet('lvEdit'); return true; }
    if (d.edn != null) { ed.need = Math.max(1, Math.min(ed.goal === 'tspin' ? 10 : 60, ed.need + (+d.edn))); App.openSheet('lvEdit'); return true; }
    if (d.edl != null) { ed.limit = Math.max(10, Math.min(200, ed.limit + (+d.edl))); App.openSheet('lvEdit'); return true; }
    return false;
  });
  App.acts.edRandom = function () { var lv = Lv.make(1 + Math.floor(Math.random() * Lv.COUNT), 0); ed.rows = lv.board.slice(-12); ed.copied = false; App.openSheet('lvEdit'); };
  App.acts.edClear = function () { ed.rows = ['X.XXXXXXXX']; ed.copied = false; App.openSheet('lvEdit'); };
  App.acts.edTry = function () {
    if (!edValid()) return App.toast(t('lv.edBad'));
    var code = Lv.encode(edLevel()), lv = Lv.decode(code);
    if (lv) App.begin('level', { custom: lv, code: code });
  };
  App.acts.edShare = function () {
    if (!edValid()) return App.toast(t('lv.edBad'));
    var url = window.location.href.split('#')[0].split('?')[0] + '?lv=' + Lv.encode(edLevel());
    var done = function () { ed.copied = true; App.openSheet('lvEdit'); };
    try { navigator.clipboard.writeText(url).then(done, function () { window.prompt('', url); }); } catch (e) { window.prompt('', url); }
  };

  // ---------- a link with a level in it ----------
  App.sheets.lvInvite = function () {
    var lv = view.invite;
    return '<h2>' + t('lv.invite') + '</h2><p><b>' + esc(goalText(lv)) + '</b></p><p class="note">' + esc(t('lv.limitP', lv.limit, lv.limit)) + '</p><div class="row">' + btn('lvInviteGo', 'lv.playCode', true) + btn('close', 'close') + '</div>';
  };
  App.acts.lvInviteGo = function () { App.begin('level', { custom: view.invite, code: view.inviteCode }); };
  App.boot.push(function () {
    var m = /[?&]lv=([A-Za-z0-9_-]{4,64})/.exec(window.location.search), lv = m && Lv.decode(m[1]);
    if (lv) { view.invite = lv; view.inviteCode = m[1]; setTimeout(function () { if (!App.sheet()) App.openSheet('lvInvite'); }, 500); }
  });
})();
