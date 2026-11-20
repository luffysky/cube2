/* 轉磚 weather mode (挑戰大自然): survive as long as you can while the weather changes. The weather itself is in
   weather.js; this file is the screen side: the setup sheet, the run, what the sky looks like over the board, and the
   result. A run on changing weather counts for coins and the leaderboard; a practice run on one kind of weather does not. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, W = ZZ.Weather, esc = App.esc, btn = App.btn;
  var COLS = ZZ.COLS, ROWS = ZZ.ROWS;

  L.add({
    'wx.menuT': ['挑戰大自然', 'Weather run', '大自然チャレンジ', '대자연 도전'],
    'wx.menuS': ['風、雨、雪、雷、霧，撐越久越好', 'Wind, rain, snow, storms and fog. Last as long as you can', '風・雨・雪・雷・霧の中で生き残れ', '바람, 비, 눈, 번개, 안개 속에서 버티기'],
    'wx.title': ['挑戰大自然', 'Weather run', '大自然チャレンジ', '대자연 도전'],
    'wx.p': ['天氣每 20–30 秒換一次，越後面越強。風會把方塊吹歪，下雨方塊掉得快、落地還會滑，下雪會在牆上積雪，雷雨會把方塊劈成水泥，起霧看不到下面幾排。', 'The weather changes every 20 to 30 seconds and gets stronger. Wind blows pieces sideways, rain makes them fall faster and slide, snow piles up on the stack, lightning turns blocks to cement, and fog hides the lower rows.', '天気は20〜30秒ごとに変わり、だんだん強くなります。風でブロックが流され、雨で速く落ちて滑り、雪が積もり、雷でブロックがセメントに、霧で下の段が見えなくなります。', '날씨는 20~30초마다 바뀌고 점점 강해져요. 바람은 블록을 밀고, 비는 빨리 떨어지고 미끄러지며, 눈은 쌓이고, 번개는 블록을 시멘트로, 안개는 아래 줄을 가려요.'],
    'wx.best': ['最佳：{0} 分，撐了 {1}', 'Best: {0} points, lasted {1}', 'ベスト：{0}点・{1}', '최고: {0}점, {1} 버팀'],
    'wx.mix': ['天氣輪替', 'Changing weather', '天気が変わる', '날씨 변화'],
    'wx.mixS': ['算金幣、上排行榜', 'Counts for coins and the leaderboard', 'コインとランキング対象', '코인과 랭킹에 반영'],
    'wx.only': ['只練一種天氣（不算獎勵）', 'Practise one kind (no rewards)', '1種類だけ練習（報酬なし）', '한 가지만 연습 (보상 없음)'],
    'wx.go': ['出發', 'Start', 'スタート', '시작'],
    'wx.k.clear': ['晴天', 'Clear', '晴れ', '맑음'],
    'wx.k.wind': ['強風', 'Wind', '強風', '강풍'],
    'wx.k.rain': ['大雨', 'Rain', '大雨', '폭우'],
    'wx.k.snow': ['下雪', 'Snow', '雪', '눈'],
    'wx.k.storm': ['雷雨', 'Thunderstorm', '雷雨', '뇌우'],
    'wx.k.fog': ['濃霧', 'Fog', '濃霧', '짙은 안개'],
    'wx.k.flood': ['洪水', 'Flood', '洪水', '홍수'],
    'wx.k.tornado': ['龍捲風', 'Tornado', '竜巻', '토네이도'],
    'wx.k.quake': ['地震', 'Earthquake', '地震', '지진'],
    'wx.warn': ['{0} 來了！', '{0} coming!', '{0}が来る！', '{0}이(가) 온다!'],
    'wx.dis': ['災害', 'Disasters', '災害', '재해'],
    'wx.disP': ['偶爾還會有災害，出現前會先警告：洪水把疊好的磚往下游沖、落下的方塊也會跟著上下漂；龍捲風把經過的磚捲起來，丟到別的地方；地震讓懸空的磚垮下來（補滿的行照樣消掉、計分），太高的柱子會倒。', 'Now and then a disaster strikes, always after a warning: a flood washes blocks downstream and makes the falling piece bob; a tornado lifts the blocks it passes and drops them somewhere else; an earthquake brings down every block with a gap under it (rows filled that way clear and score) and topples tall columns.', 'ときどき災害も起こります（必ず予告あり）：洪水は積んだブロックを下流へ流し、落下中のブロックも上下に揺れます。竜巻は通ったブロックを巻き上げて別の場所に落とします。地震は浮いたブロックを崩し（埋まった段は消えて得点）、高すぎる柱は倒れます。', '가끔 재해도 와요(항상 미리 경고): 홍수는 쌓은 블록을 하류로 쓸어 가고 떨어지는 블록도 위아래로 흔들려요. 토네이도는 지나간 블록을 감아올려 다른 곳에 떨어뜨려요. 지진은 떠 있는 블록을 무너뜨리고(채워진 줄은 지워지고 점수) 너무 높은 기둥은 쓰러져요.'],
    'wx.washed': ['被沖走 {0} 塊', '{0} washed away', '{0} 個流された', '{0}개 휩쓸림'],
    'wx.quakeLines': ['震垮消了 {0} 行！', 'The quake cleared {0}!', '地震で {0} ライン消えた！', '지진으로 {0}줄 지워짐!'],
    'wx.lvl': ['{0} 級', 'level {0}', 'レベル{0}', '{0}단계'],
    'wx.wind': ['風速', 'Wind', '風速', '풍속'],
    'wx.rain': ['雨量', 'Rain', '雨量', '강우량'],
    'wx.snow': ['積雪', 'Snow', '積雪', '적설'],
    'wx.fog': ['能見度', 'Visibility', '視界', '가시거리'],
    'wx.next': ['{0} 秒後變天', 'Changes in {0}s', '{0}秒後に変化', '{0}초 후 변화'],
    'wx.time': ['撐了', 'Time', '時間', '시간'],
    'wx.over': ['被大自然打敗了', 'Nature wins this one', '大自然に負けた', '대자연에 졌어요'],
    'wx.lasted': ['撐了 {0}', 'Lasted {0}', '{0} 耐えた', '{0} 버팀'],
    'wx.lines': ['消了 {0} 行', '{0} lines', '{0}ライン', '{0}줄'],
    'wx.score': ['{0} 分', '{0} points', '{0}点', '{0}점'],
    'wx.newBest': ['新紀錄！', 'New best!', '自己ベスト！', '신기록!'],
    'wx.practice': ['練習場，不算獎勵', 'Practice: no rewards', '練習：報酬なし', '연습: 보상 없음'],
    'wx.again': ['再挑戰', 'Go again', 'もう一度', '다시 도전'],
    'wx.vs': ['天氣對戰', 'Weather battles', '天気バトル', '날씨 대전'],
    'wx.vsP': ['兩個人頭上是同一片天。消 4 行或做出 T 轉雙消，就把一陣強烈天氣（或一場洪水、龍捲風、地震）丟到對手那邊。贏了加天氣排位分。', 'Both of you play under the same sky. Clear four lines or make a T-spin double to throw strong weather (or a flood, tornado or earthquake) at your rival. Wins raise your storm rank.', '同じ空の下で対戦。4ライン消しかTスピンダブルで、強い天気（または洪水・竜巻・地震）を相手に投げつけます。勝つと天気ランクが上がります。', '같은 하늘 아래에서 대전해요. 4줄을 지우거나 T스핀 더블로 강한 날씨(또는 홍수, 토네이도, 지진)를 상대에게 던져요. 이기면 날씨 랭크가 올라요.'],
    'wx.rank': ['天氣排位：{0} 分', 'Storm rank: {0}', '天気ランク：{0}', '날씨 랭크: {0}'],
    'wx.vsAi': ['對電腦', 'Against the computer', 'コンピューターと', '컴퓨터와'],
    'wx.vsQuick': ['隨機配對', 'Random match', 'ランダムマッチ', '랜덤 매칭'],
    'wx.vsRoom': ['跟朋友玩：開房間時打開「天氣對戰」。', 'With a friend: turn on "Weather battle" when you open a room.', '友だちと：ルームを開いて「天気バトル」をオン。', '친구와: 방을 열고 "날씨 대전"을 켜세요.'],
    'wx.netToggle': ['天氣對戰', 'Weather battle', '天気バトル', '날씨 대전'],
    'wx.netOn': ['天氣對戰', 'weather battle', '天気バトル', '날씨 대전'],
    'wx.threw': ['把 {0} 丟給對手！', 'Sent {0} to your rival!', '{0}を相手に！', '{0}을(를) 상대에게!'],
    'wx.gotHit': ['對手丟來 {0}！', 'Your rival sent {0}!', '相手から{0}！', '상대가 {0}을(를) 보냈어요!'],
    'wx.rankLine': ['天氣排位 {0}（{1}）', 'Storm rank {0} ({1})', '天気ランク {0}（{1}）', '날씨 랭크 {0} ({1})'],
    'wx.short': ['撐 20 秒以上才有金幣。', 'Last 20 seconds or more for coins.', '20秒以上でコイン獲得。', '20초 이상 버텨야 코인을 받아요.']
  });

  var KIND_ICON = { clear: '☀️', wind: '🌬️', rain: '🌧️', snow: '❄️', storm: '⛈️', fog: '🌫️', flood: '🌊', tornado: '🌪️', quake: '🌍' };
  var ALL = W.KINDS.concat(W.DISASTERS);
  function kindName(k) { return t('wx.k.' + k); }
  function clock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  // ---------- setup ----------
  var pick = { only: '' };
  App.go.weather = function () { App.openSheet('wxSetup'); };
  App.sheets.wxSetup = function () {
    var d = Meta.data.lv, h = '<h2>' + t('wx.title') + '</h2><p class="note">' + t('wx.p') + '</p><p class="note">' + t('wx.disP') + '</p>';
    if (d.wx) h += '<p><b>' + esc(t('wx.best', L.num(d.wx), clock(d.wxs * 1000))) + '</b></p>';
    h += '<div class="wxpick" role="radiogroup" aria-label="' + esc(t('wx.title')) + '">';
    h += '<button type="button" role="radio" class="wxp wide" aria-checked="' + (!pick.only) + '" data-wxonly=""><b>' + t('wx.mix') + '</b><span>' + t('wx.mixS') + '</span></button>';
    h += '</div><h3>' + t('wx.only') + '</h3><div class="wxpick" role="radiogroup" aria-label="' + esc(t('wx.only')) + '">';
    ALL.forEach(function (k) {
      h += '<button type="button" role="radio" class="wxp" aria-checked="' + (pick.only === k) + '" data-wxonly="' + k + '"><i aria-hidden="true">' + KIND_ICON[k] + '</i><b>' + esc(kindName(k)) + '</b></button>';
    });
    h += '</div><div class="row">' + btn('wxGo', 'wx.go', true) + '</div>';
    h += '<h3>' + t('wx.vs') + '</h3><p class="note">' + t('wx.vsP') + '</p><p><b>' + esc(t('wx.rank', L.num(d.wxr || 0))) + '</b></p><div class="row">' + btn('wxAi', 'wx.vsAi') +
      (ZZ.Cloud && ZZ.Cloud.hosted() ? btn('wxQuick', 'wx.vsQuick') : '') + '</div><p class="note">' + t('wx.vsRoom') + '</p>';
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  function newSky() { return (Math.random() * 4294967296) >>> 0 || 1; }
  App.acts.wxAi = function () {
    var f = Meta.botFor(Meta.data.rp), lv = f.level >= 0 ? f.level : 2;
    App.begin('battle', { mode: 'ai', level: lv, minutes: 2, items: false, wx: newSky() });
  };
  App.acts.wxQuick = function () { App.openSheet('online'); ZZ.Net.quick(Meta.data.name || t('player'), false, 'wx'); };
  App.clicks.push(function (d) {
    if (d.wxonly != null) { pick.only = ALL.indexOf(d.wxonly) >= 0 ? d.wxonly : ''; App.openSheet('wxSetup'); return true; }
    return false;
  });
  App.acts.wxGo = function () { App.begin('weather', { only: pick.only, seed: (Math.random() * 4294967296) >>> 0 }); };

  // ---------- the run ----------
  var K = App.kinds.weather = {
    begin: function (S, o) {
      S.wx = new W({ seed: o.seed, only: o.only });
      S.wx.baseLock = App.set.lock;
      S.me = new ZZ.Game({ seed: o.seed, gravity: W.gravAt(0), lockDelay: App.set.lock, garbage: false, sdf: App.sdfVal() });
      S.infoKey = '';
      sky.reset();
    },
    hud: function () {
      var el = App.el;
      el.hudL.innerHTML = '<span class="who">' + t('wx.title') + '</span>';
      el.hudC.innerHTML = '<div class="hud-title" id="wxNow"></div>';
      el.hudR.innerHTML = '<div class="stat"><b id="wxTime">0:00</b><span>' + t('wx.time') + '</span></div>';
    },
    tools: function () { return App.tool('restart', 'restart'); },
    tick: function (dt) {
      var S = App.S();
      S.wx.baseGrav = W.gravAt(S.time);
      App.wxStep(S.wx, S.me, dt, true);
    },
    update: function () { App.txt('wxTime', clock(App.S().time)); }
  };
  // The weather box goes beside the next pieces with a keyboard; on a touch screen that column holds the hold and
  // pause keys, so it sits under the hold slot instead.
  function placeInfo() {
    var box = document.getElementById('wxInfo'), el = App.el;
    if (!box) return;
    var phone = App.env.touch;
    if (phone && box.parentNode !== el.holdBox.parentNode) el.holdBox.parentNode.insertBefore(box, el.holdBox.nextSibling);
    else if (!phone && box.parentNode !== el.nextBox.parentNode) el.nextBox.parentNode.insertBefore(box, el.nextBox.nextSibling);
    box.hidden = false; box.innerHTML = '';
    var S = App.S(); if (S) S.infoKey = '';
  }
  // the weather beside the next pieces (the weather mode and weather battles alike)
  function showInfo(S) {
    var wx = S.wx, n = wx.info();
    var key = n.kind + n.lvl + '|' + n.wind + n.dir + '|' + n.rain + '|' + n.snow + '|' + n.fog + '|' + Math.ceil(n.left / 1000) + L.lang + (n.dis ? n.dis.kind + n.dis.phase : '');
    if (key === S.infoKey) return;
    S.infoKey = key;
    var now = document.getElementById('wxNow');
    if (now) now.textContent = KIND_ICON[n.kind] + ' ' + kindName(n.kind) + (n.lvl && n.kind !== 'clear' ? ' · ' + t('wx.lvl', n.lvl) : '');
    var box = document.getElementById('wxInfo');
    if (!box) return;
    var h = '<div><span>' + t('wx.wind') + '</span><b>' + (n.wind ? (n.dir < 0 ? '← ' : '→ ') + n.wind + ' m/s' : '0') + '</b></div>' +
      '<div><span>' + t('wx.rain') + '</span><b>' + n.rain + ' mm</b></div>';
    if (n.kind === 'snow') h += '<div><span>' + t('wx.snow') + '</span><b>' + (n.snow * 5) + ' cm</b></div>';
    if (n.kind === 'fog') h += '<div><span>' + t('wx.fog') + '</span><b>' + (60 - n.fog * 6) + ' m</b></div>';
    if (n.dis) h += '<p class="wxdis"><b>' + KIND_ICON[n.dis.kind] + ' ' + esc(n.dis.phase === 'warn' ? t('wx.warn', kindName(n.dis.kind)) : kindName(n.dis.kind)) + '</b></p>';
    if (n.hit) h += '<p>' + esc(t('wx.gotHit', kindName(n.kind))) + '</p>';
    else if (!wx.only) h += '<p>' + esc(t('wx.next', Math.ceil(n.left / 1000))) + '</p>';
    box.innerHTML = h;
  }
  K = App.kinds.weather;
  Object.assign(K, {
    topout: function () { K.end(); },
    empty: function () { /* the queue never runs out */ },
    restart: function () { var S = App.S(); App.begin('weather', { only: S.o.only, seed: (Math.random() * 4294967296) >>> 0 }); },
    end: function () {
      var S = App.S();
      if (S.state !== 'play') return;
      S.state = 'wait'; S.wait = 1100; S.target = null;
      App.sfx.play('lose');
      var sec = Math.floor(S.time / 1000), st = S.me.stats, score = W.scoreOf(S.me, S.time);
      S.res = Meta.wxDone(sec, st.lines, score, !!S.o.only);
      S.res.sec = sec; S.res.lines = st.lines; S.res.score = score;
      S.after = function () { App.openSheet('wxOver'); };
    }
  });

  App.sheets.wxOver = function () {
    var S = App.S(), r = S.res || {}, h = '<h2 class="verdict lose">' + t('wx.over') + '</h2>';
    h += '<p class="wxres"><b>' + esc(t('wx.score', L.num(r.score || 0))) + '</b>' + (r.best ? ' <em>' + t('wx.newBest') + '</em>' : '') + '</p>';
    h += '<p>' + esc(t('wx.lasted', clock((r.sec || 0) * 1000))) + '　' + esc(t('wx.lines', r.lines || 0)) + (r.coins ? '　' + App.coin(r.coins) : '') + '</p>';
    if (S.o.only) h += '<p class="note">' + t('wx.practice') + '</p>';
    else if ((r.sec || 0) < 20) h += '<p class="note">' + t('wx.short') + '</p>';
    return h + '<div class="row">' + btn('again', 'wx.again', true) + btn('wxSetupBack', 'wx.title') + btn('menu', 'toMenu') + '</div>';
  };
  App.acts.wxSetupBack = function () { App.toMenu(); App.openSheet('wxSetup'); };

  // One step of weather over one wall, with the sound and the picture for the player's own.
  App.wxStep = function (wx, g, dt, mine) {
    var S = App.S(), ev = wx.step(g, dt);
    if (!mine) return;
    if (!sky.on) sky.reset();
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'change') { if (!e.back || S.kind === 'weather') App.banner(KIND_ICON[e.kind] + ' ' + kindName(e.kind), '', 1100); sky.change(); }
      else if (e.type === 'gust') { if (wx.t - sky.gustAt > 900) { sky.gustAt = wx.t; App.sfx.play('gust'); } }
      else if (e.type === 'drift') App.sfx.play('drift');
      else if (e.type === 'bolt') { App.sfx.play('thunder'); App.buzz([30, 40, 60]); sky.bolt(e); App.V.me.kick(0, 5); }
      else if (e.type === 'disaster') {
        if (e.phase === 'warn') { App.banner('⚠️ ' + t('wx.warn', KIND_ICON[e.kind] + kindName(e.kind)), '', 1600); App.sfx.play('siren'); }
        else if (e.phase === 'hit') { App.sfx.play(e.kind === 'flood' ? 'wave' : e.kind === 'tornado' ? 'twister' : 'quake'); App.buzz(e.kind === 'quake' ? [80, 40, 120, 40, 160] : [40, 30, 40]); }
        else if (e.phase === 'end' && e.gone) App.popRaw(t('wx.washed', e.gone), [], 0, false);
      }
      else if (e.type === 'quake' && e.lines) App.popRaw(t('wx.quakeLines', e.lines), [], 0, false);
    }
  };
  // ---------- weather battles ----------
  // A four-line clear or a T-spin double or better throws strong weather at the rival for nine seconds.
  var HIT_MS = 9000;
  function throws(e) { return e.lines >= 4 || (e.tspin === 'full' && e.lines >= 2); }
  // weather or, three times in eight, a disaster
  function anyKind() { return ALL[Math.floor(Math.random() * ALL.length)]; }
  App.hooks.push(function (g, e, mine) {
    var S = App.S();
    if (!S || !S.sky || S.state !== 'play' || e.type !== 'lock' || !throws(e)) return;
    var k = anyKind();
    if (mine && g === S.me) {
      if (S.remote) { if (ZZ.Net) ZZ.Net.weather(k); }
      else if (S.sky.opp) S.sky.opp.hit(k, HIT_MS);
      App.popRaw(t('wx.threw', KIND_ICON[k] + kindName(k)), [], 0, false);
    } else if (!mine && g === S.opp && !S.remote) App.wxHit(k);      // the computer throws too
  });
  App.wxHit = function (k) {
    var S = App.S();
    if (!S || !S.sky || !S.sky.me.hit(k, HIT_MS)) return;
    if (W.DISASTERS.indexOf(k) >= 0) { App.popRaw(t('wx.gotHit', kindName(k)), [], 0, false); return; }    // its own warning follows
    App.banner(KIND_ICON[k] + ' ' + kindName(k), '', 1100);
    App.popRaw(t('wx.gotHit', kindName(k)), [], 0, false);
    App.sfx.play(k === 'storm' ? 'thunder' : 'gust');
    sky.change();
  };
  // the storm points for a weather battle (one shorter than 20 seconds counts for nothing)
  App.wxBattleEnd = function (r, played) {
    var S = App.S();
    if (played < 20000 || S.why === 'quit') return null;
    return Meta.wxBattle(r, S.mode === 'net');
  };
  var extra = App.endExtra;
  App.endExtra = function () {
    var S = App.S(), h = '', r = S && S.wxRes;
    if (r) h = '<p class="note"><b>' + esc(t('wx.rankLine', L.num(r.after), (r.delta >= 0 ? '+' : '') + r.delta)) + '</b></p>';
    return h + (extra ? extra() : '');
  };

  // ---------- the sky over the board ----------
  // A canvas laid over the board: rain, snow, wind streaks, lightning and fog. Purely for looks; the weather's effect on
  // the game is all in weather.js.
  var sky = {
    cv: null, x: null, w: 0, h: 0, parts: [], flash: 0, bolts: [], fade: 1, gustAt: -1e9, last: 0, on: false,
    reset: function () { this.parts = []; this.bolts = []; this.flash = 0; this.fade = 1; this.gustAt = -1e9; this.start(); placeInfo(); },
    change: function () { this.fade = 0; },
    bolt: function (e) {
      var v = App.V.me, cell = v.cell, x0 = v.mw + (e.x + 0.5) * cell, y1 = e.y >= 0 ? v.cellXY(e.x, e.y)[1] + cell * 0.5 : this.h * 0.6, pts = [[x0 + (Math.random() - 0.5) * cell * 3, 0]];
      for (var y = cell * 1.2; y < y1; y += cell * (0.8 + Math.random() * 0.8)) pts.push([x0 + (Math.random() - 0.5) * cell * 1.6, y]);
      pts.push([x0, y1]);
      this.bolts.push({ pts: pts, life: 380 });
      this.flash = App.env.reduce ? 0.25 : 0.7;
    },
    start: function () {
      if (!this.cv) {
        var wrap = App.el.wellWrap, c = document.createElement('canvas');
        c.className = 'wxcv'; c.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(c, App.el.pops);
        this.cv = c;
      }
      this.cv.hidden = false;
      if (!this.on) { this.on = true; this.last = 0; window.requestAnimationFrame(this.frame); }
    },
    stop: function () { this.on = false; if (App.el.wellWrap) App.el.wellWrap.style.transform = ''; var b = document.getElementById('wxInfo'); if (b) b.hidden = true; if (this.cv) { this.cv.hidden = true; this.parts = []; } },
    frame: function (now) {
      var s = sky, S = App.S();
      if (!S || !S.wx || App.screen() !== 'play') { s.stop(); return; }
      window.requestAnimationFrame(s.frame);
      var dt = s.last ? Math.min(50, now - s.last) : 16;
      s.last = now;
      if (S.state === 'pause') dt = 0;
      s.size();
      s.draw(S.wx, dt);
      showInfo(S);
    },
    size: function () {
      var wc = App.el.wellCv, w = wc.offsetWidth, h = wc.offsetHeight;
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      this.x = ZZ.View.sizeCanvas(this.cv, w, h);
    },
    draw: function (wx, dt) {
      var x = this.x, w = this.w, h = this.h, v = App.V.me, cell = v.cell || 20, reduce = App.env.reduce, i, p;
      if (!x) return;
      x.clearRect(0, 0, w, h);
      var n = wx.info(), k = n.kind, wet = k === 'rain' || k === 'storm', windX = n.wind * n.dir;
      this.fade = Math.min(1, this.fade + dt / 900);
      // how many of each there should be right now
      var wantRain = wet ? Math.round(n.rain * (reduce ? 0.6 : 1.6)) : 0, wantSnow = k === 'snow' ? (reduce ? 20 : 30 + n.lvl * 20) : 0, wantWind = n.wind && !wet ? Math.round(n.wind * (reduce ? 0.6 : 1.2)) : wet && n.wind > 6 ? 6 : 0;
      var counts = { r: 0, s: 0, w: 0 };
      for (i = 0; i < this.parts.length; i++) counts[this.parts[i].k]++;
      while (counts.r < wantRain) { this.parts.push(this.spawn('r', w, h, true)); counts.r++; }
      while (counts.s < wantSnow) { this.parts.push(this.spawn('s', w, h, true)); counts.s++; }
      while (counts.w < wantWind) { this.parts.push(this.spawn('w', w, h, true)); counts.w++; }
      var keep = [], drop = { r: counts.r - wantRain, s: counts.s - wantSnow, w: counts.w - wantWind }, f = dt / 1000;
      for (i = 0; i < this.parts.length; i++) {
        p = this.parts[i];
        p.x += (p.vx + (p.k === 'w' ? 0 : windX * (p.k === 's' ? 5 : 9))) * f;
        p.y += p.vy * f;
        if (p.k === 's') p.x += Math.sin((p.y + p.ph) / 23) * 12 * f;
        var out = p.y > h + 20 || p.x < -60 || p.x > w + 60;
        if (out) { if (drop[p.k] > 0) { drop[p.k]--; continue; } this.parts[i] = p = this.spawn(p.k, w, h, false, windX); }
        keep.push(p);
      }
      this.parts = keep;
      x.globalAlpha = this.fade;
      // rain: thin slanted streaks
      x.strokeStyle = 'rgba(190,215,240,0.55)'; x.lineWidth = Math.max(1, cell * 0.05); x.lineCap = 'round';
      x.beginPath();
      for (i = 0; i < this.parts.length; i++) { p = this.parts[i]; if (p.k !== 'r') continue; var sl = windX * 9 / p.vy; x.moveTo(p.x, p.y); x.lineTo(p.x - sl * p.len, p.y - p.len); }
      x.stroke();
      // snow: soft round flakes
      x.fillStyle = 'rgba(255,255,255,0.9)';
      for (i = 0; i < this.parts.length; i++) { p = this.parts[i]; if (p.k !== 's') continue; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); }
      // wind: long faint streaks
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = Math.max(1, cell * 0.06);
      x.beginPath();
      for (i = 0; i < this.parts.length; i++) { p = this.parts[i]; if (p.k !== 'w') continue; x.moveTo(p.x, p.y); x.quadraticCurveTo(p.x - p.len * 0.5 * Math.sign(p.vx || 1), p.y - cell * 0.2, p.x - p.len * Math.sign(p.vx || 1), p.y); }
      x.stroke();
      x.globalAlpha = 1;
      // fog: the lower rows behind a thick bank
      if (n.fog) {
        var fy = v.cellXY(0, ROWS - n.fog)[1], top = fy - cell * 1.5, g = x.createLinearGradient(0, top, 0, fy + cell);
        g.addColorStop(0, 'rgba(214,220,228,0)'); g.addColorStop(1, 'rgba(214,220,228,' + (0.94 * this.fade).toFixed(3) + ')');
        x.fillStyle = g; x.fillRect(v.mw, top, COLS * cell, cell * 2.5);
        x.fillStyle = 'rgba(214,220,228,' + (0.94 * this.fade).toFixed(3) + ')';
        x.fillRect(v.mw, fy + cell, COLS * cell, h);
      }
      // a dark sky for storms
      if (k === 'storm') { x.fillStyle = 'rgba(20,24,40,' + (0.18 * this.fade).toFixed(3) + ')'; x.fillRect(0, 0, w, h); }
      // lightning
      for (i = this.bolts.length - 1; i >= 0; i--) {
        var b = this.bolts[i];
        b.life -= dt;
        if (b.life <= 0) { this.bolts.splice(i, 1); continue; }
        x.strokeStyle = 'rgba(255,250,210,' + Math.min(1, b.life / 200).toFixed(3) + ')'; x.lineWidth = Math.max(2, cell * 0.14); x.lineJoin = 'round';
        x.shadowColor = '#FFF6B0'; x.shadowBlur = cell * 0.8;
        x.beginPath(); x.moveTo(b.pts[0][0], b.pts[0][1]);
        for (var j = 1; j < b.pts.length; j++) x.lineTo(b.pts[j][0], b.pts[j][1]);
        x.stroke(); x.shadowBlur = 0;
      }
      if (this.flash > 0) { x.fillStyle = 'rgba(255,255,255,' + this.flash.toFixed(3) + ')'; x.fillRect(0, 0, w, h); this.flash = Math.max(0, this.flash - dt / 260); }
      this.disaster(x, n.dis, v, cell, w, h, dt);
    },
    // the disasters: water, a funnel, a shaking wall
    disT: 0,
    disaster: function (x, d, v, cell, w, h, dt) {
      var wrap = App.el.wellWrap, reduce = App.env.reduce;
      this.disT += dt;
      if (!d) { if (wrap.style.transform) wrap.style.transform = ''; return; }
      var tt = this.disT / 1000, x0 = v.mw, bw = COLS * cell, i;
      if (d.kind === 'flood') {
        var lvl = d.phase === 'warn' ? d.p * cell * 1.2 : cell * (1.2 + d.lvl * 0.6);
        // water along the bottom, rising during the warning
        x.fillStyle = 'rgba(60,140,210,0.32)';
        x.beginPath(); x.moveTo(x0, h);
        for (i = 0; i <= 40; i++) { var px = x0 + bw * i / 40; x.lineTo(px, h - lvl - Math.sin(tt * 4 + i * 0.6) * cell * 0.15); }
        x.lineTo(x0 + bw, h); x.closePath(); x.fill();
        if (d.phase === 'hit' && d.col >= 0) {
          // the wave front: a tall curl of water at its column, white foam on top
          var cx = x0 + (d.col + 0.5) * cell, gw = cell * 2.4, gr = x.createLinearGradient(cx - gw * d.dir, 0, cx + gw * 0.4 * d.dir, 0);
          gr.addColorStop(0, 'rgba(40,120,200,0)'); gr.addColorStop(1, 'rgba(70,160,230,0.55)');
          x.fillStyle = gr; x.fillRect(Math.min(cx - gw * d.dir, cx + gw * 0.4 * d.dir), 0, gw * 1.4, h);
          x.fillStyle = 'rgba(255,255,255,0.7)';
          for (i = 0; i < 14; i++) { x.beginPath(); x.arc(cx + Math.sin(tt * 9 + i) * cell * 0.5, (i / 14) * h + Math.sin(tt * 5 + i * 2) * cell * 0.3, cell * 0.12, 0, 6.283); x.fill(); }
          // the whole wall rides the wave
          if (!reduce) wrap.style.transform = 'translateY(' + (Math.sin(tt * 12) * cell * 0.18).toFixed(1) + 'px)';
        }
      } else if (d.kind === 'tornado') {
        var col = d.col >= 0 ? d.col : (d.dir > 0 ? -1 : COLS), fx = x0 + (col + 0.5) * cell, a = d.phase === 'warn' ? 0.25 + d.p * 0.4 : 0.75;
        if (d.phase === 'warn') fx = d.dir > 0 ? x0 - cell * (1 - d.p) : x0 + bw + cell * (1 - d.p);
        // the funnel: rings, wide at the top and narrow at the ground, spinning
        for (i = 0; i < 18; i++) {
          var fy = h * (i / 18), r = cell * (0.4 + (1 - i / 18) * 2.2), sx = fx + Math.sin(tt * 3 + i * 0.5) * cell * 0.4;
          x.strokeStyle = 'rgba(120,128,140,' + (a * (0.5 + 0.5 * Math.sin(tt * 8 + i))).toFixed(3) + ')';
          x.lineWidth = Math.max(1.5, cell * 0.12);
          x.beginPath(); x.ellipse(sx, fy, r, r * 0.22, 0, 0, 6.283); x.stroke();
        }
        // what it has picked up, flying round
        x.fillStyle = 'rgba(200,180,140,0.9)';
        for (i = 0; i < d.air; i++) { var an = tt * 6 + i * 2.1, rr = cell * (0.8 + (i % 3) * 0.5); x.fillRect(fx + Math.cos(an) * rr - cell * 0.3, h * (0.2 + (i % 4) * 0.12) + Math.sin(an) * rr * 0.3, cell * 0.6, cell * 0.6); }
        x.fillStyle = 'rgba(90,96,110,' + (0.12 * a).toFixed(3) + ')'; x.fillRect(0, 0, w, h);
      } else if (d.kind === 'quake') {
        var amp = d.phase === 'warn' ? cell * 0.06 * d.p : cell * 0.3 * (1 - d.p * 0.6);
        if (!reduce) wrap.style.transform = 'translate(' + ((Math.random() - 0.5) * amp * 2).toFixed(1) + 'px,' + ((Math.random() - 0.5) * amp).toFixed(1) + 'px)';
        if (d.phase === 'hit') {
          // cracks in the ground and falling dust
          x.strokeStyle = 'rgba(60,40,30,0.5)'; x.lineWidth = Math.max(1, cell * 0.08);
          x.beginPath(); var cy = h - cell * 0.3; x.moveTo(x0, cy);
          for (i = 1; i <= 12; i++) x.lineTo(x0 + bw * i / 12, cy + (i % 2 ? -1 : 1) * cell * 0.25);
          x.stroke();
          x.fillStyle = 'rgba(150,130,110,0.5)';
          for (i = 0; i < 20; i++) { var dx = x0 + ((i * 53) % 100) / 100 * bw, dy = ((tt * 200 + i * 37) % h); x.fillRect(dx, dy, cell * 0.08, cell * 0.08); }
        }
      }
    },
    spawn: function (k, w, h, anywhere, windX) {
      var cell = App.V.me.cell || 20, from = windX > 0 ? -30 : windX < 0 ? w + 30 : 0, side = windX && Math.random() < 0.35;
      if (k === 'r') return { k: k, x: side ? from : Math.random() * w, y: anywhere ? Math.random() * h : side ? Math.random() * h * 0.5 : -20, vx: 0, vy: 700 + Math.random() * 300, len: cell * (0.5 + Math.random() * 0.5) };
      if (k === 's') return { k: k, x: side ? from : Math.random() * w, y: anywhere ? Math.random() * h : -10, vx: 0, vy: 40 + Math.random() * 50, r: Math.max(1.2, cell * (0.05 + Math.random() * 0.08)), ph: Math.random() * 300 };
      var dir = (App.S() && App.S().wx.dir) || 1;
      return { k: k, x: anywhere ? Math.random() * w : dir > 0 ? -60 : w + 60, y: Math.random() * h, vx: dir * (300 + Math.random() * 300), vy: 0, len: cell * (1.5 + Math.random() * 2) };
    }
  };
})();
