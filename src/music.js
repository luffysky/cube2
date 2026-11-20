/* 轉磚 music player: the player picks the background music.
   - Auto (the default): each screen plays its own track, as before.
   - My playlist: the tracks the player ticked play one after another (in order or shuffled, or one on repeat) on every
     screen, without restarting when the screen changes.
   - Members can add their own music files. They are kept only on this device (IndexedDB "zhuanzhuan-music"): never
     sent to our server or anywhere else, and not part of the cloud save. If membership ends they stay on the device
     but do not play until it is back.
   Settings live in localStorage "zhuanzhuan.music.v1". */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta;
  var KEY = 'zhuanzhuan.music.v1', DB = 'zhuanzhuan-music';
  var MAX_FILE = 15 * 1024 * 1024, MAX_COUNT = 30, MAX_TOTAL = 200 * 1024 * 1024;
  L.add({
    'mu.title': ['音樂播放器', 'Music player', 'ミュージックプレイヤー', '음악 플레이어'],
    'mu.open': ['音樂', 'Music', 'ミュージック', '음악'],
    'mu.now': ['正在播放', 'Now playing', '再生中', '재생 중'],
    'mu.none': ['沒有播放', 'Nothing playing', '停止中', '재생 안 함'],
    'mu.off': ['背景音樂的音量是 0，到設定把「音樂」調大就聽得到。', 'Music volume is 0. Turn "Music" up in Settings to hear it.', '音楽の音量が 0 です。設定で「音楽」を上げてください。', '음악 볼륨이 0이에요. 설정에서 "음악"을 올려 주세요.'],
    'mu.play': ['播放', 'Play', '再生', '재생'],
    'mu.pause': ['暫停', 'Pause', '一時停止', '일시정지'],
    'mu.prev': ['上一首', 'Previous', '前の曲', '이전 곡'],
    'mu.next': ['下一首', 'Next', '次の曲', '다음 곡'],
    'mu.mode': ['播放方式', 'What plays', '再生のしかた', '재생 방식'],
    'mu.auto': ['自動（依畫面）', 'Auto (by screen)', '自動（画面ごと）', '자동(화면별)'],
    'mu.list': ['我的播放清單', 'My playlist', 'マイプレイリスト', '내 재생 목록'],
    'mu.listEmpty': ['先在下面勾選要放進清單的歌。', 'Tick the tracks below to put them on the list.', '下の曲にチェックを入れてリストに追加してください。', '아래에서 목록에 넣을 곡을 체크하세요.'],
    'mu.order': ['順序', 'Order', '順番', '순서'],
    'mu.inOrder': ['依序', 'In order', '順番どおり', '순서대로'],
    'mu.shuffle': ['隨機', 'Shuffle', 'シャッフル', '무작위'],
    'mu.one': ['單曲重複', 'Repeat one', '1 曲リピート', '한 곡 반복'],
    'mu.tracks': ['曲目', 'Tracks', '曲', '곡 목록'],
    'mu.inList': ['放進清單', 'On the list', 'リストに入れる', '목록에 넣기'],
    'mu.playNow': ['播這首', 'Play this', 'この曲を再生', '이 곡 재생'],
    'mu.b.menu': ['主選單', 'Main menu', 'メインメニュー', '메인 메뉴'],
    'mu.b.calm': ['練習', 'Practice', '練習', '연습'],
    'mu.b.battle1': ['對戰 1', 'Battle 1', 'バトル 1', '대전 1'],
    'mu.b.battle2': ['對戰 2', 'Battle 2', 'バトル 2', '대전 2'],
    'mu.b.battle3': ['對戰 3', 'Battle 3', 'バトル 3', '대전 3'],
    'mu.builtin': ['遊戲內建', 'Built in', 'ゲーム内蔵', '기본 제공'],
    'mu.own': ['我的音樂', 'My music', 'マイミュージック', '내 음악'],
    'mu.ownP': ['會員可以加入自己的音樂檔（每首最多 15 MB、最多 30 首、共 200 MB）。請只加自己有權使用的音樂。', 'Members can add their own music files (up to 15 MB each, 30 files, 200 MB in all). Only add music you have the right to use.', 'メンバーは自分の音楽ファイルを追加できます（1曲15MBまで、30曲・合計200MBまで）。使用する権利のある音楽だけを追加してください。', '멤버는 자기 음악 파일을 넣을 수 있어요(곡당 15MB, 최대 30곡, 합계 200MB). 사용할 권리가 있는 음악만 넣어 주세요.'],
    'mu.add': ['加入音樂檔', 'Add music files', '音楽ファイルを追加', '음악 파일 추가'],
    'mu.adding': ['正在讀取…', 'Reading…', '読み込み中…', '읽는 중…'],
    'mu.added': ['加入了 {0} 首', 'Added {0}', '{0} 曲追加しました', '{0}곡 추가했어요'],
    'mu.bad': ['「{0}」不是這個瀏覽器能播的音樂檔', '"{0}" is not a music file this browser can play', '「{0}」はこのブラウザで再生できない音楽ファイルです', '"{0}"은(는) 이 브라우저에서 재생할 수 없는 파일이에요'],
    'mu.big': ['「{0}」超過 15 MB', '"{0}" is over 15 MB', '「{0}」は 15 MB を超えています', '"{0}"이(가) 15MB를 넘어요'],
    'mu.full': ['已經滿了（最多 30 首、200 MB）', 'Full (30 tracks or 200 MB at most)', 'いっぱいです（30 曲・200 MB まで）', '가득 찼어요(최대 30곡, 200MB)'],
    'mu.del': ['刪除', 'Remove', '削除', '삭제'],
    'mu.delAsk': ['從這台裝置刪除「{0}」？', 'Remove "{0}" from this device?', '「{0}」をこの端末から削除しますか？', '"{0}"을(를) 이 기기에서 삭제할까요?'],
    'mu.member': ['加入自己的音樂是會員功能。', 'Adding your own music is for members.', '自分の音楽の追加はメンバー機能です。', '내 음악 추가는 멤버 기능이에요.'],
    'mu.lapsed': ['會員到期了，這些音樂留在裝置上，恢復會員就能再播。', 'Membership has ended: these stay on the device and play again once it is back.', 'メンバーの期限が切れました。音楽は端末に残り、再開すると再生できます。', '멤버십이 끝났어요. 음악은 기기에 남아 있고 다시 가입하면 재생돼요.'],
    'mu.noStore': ['這個瀏覽器不能存音樂檔（可能是無痕模式）。', 'This browser cannot keep music files (perhaps a private window).', 'このブラウザでは音楽ファイルを保存できません（シークレットモードかもしれません）。', '이 브라우저는 음악 파일을 저장할 수 없어요(시크릿 모드일 수 있어요).']
  });

  var BUILT = ['menu', 'calm', 'battle1', 'battle2', 'battle3'];
  var st = { mode: 'auto', list: [], order: 'seq', paused: false, own: [] }, cur = '', screenWant = 'menu', history = [];
  function load() {
    try {
      var v = JSON.parse(window.localStorage.getItem(KEY) || 'null') || {};
      st.mode = v.mode === 'list' ? 'list' : 'auto';
      st.order = ['seq', 'shuffle', 'one'].indexOf(v.order) >= 0 ? v.order : 'seq';
      st.paused = !!v.paused;
      st.own = Array.isArray(v.own) ? v.own.filter(function (o) { return o && /^[a-z0-9]{6,20}$/.test(o.id) && typeof o.name === 'string'; }).slice(0, MAX_COUNT) : [];
      st.list = Array.isArray(v.list) ? v.list.filter(function (id) { return exists(id); }) : [];
    } catch (e) { /* the defaults */ }
  }
  function keep() { try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* this visit only */ } }
  function exists(id) { return BUILT.indexOf(id) >= 0 || (/^own:/.test(id) && st.own.some(function (o) { return 'own:' + o.id === id; })); }
  function canOwn() { return Meta.isSub(); }
  function playable(id) { return BUILT.indexOf(id) >= 0 || (canOwn() && exists(id)); }
  function nameOf(id) {
    if (BUILT.indexOf(id) >= 0) return t('mu.b.' + id);
    var o = st.own.filter(function (x) { return 'own:' + x.id === id; })[0];
    return o ? o.name : id;
  }
  function queue() { return st.list.filter(playable); }

  // ---------- the files (IndexedDB) ----------
  var db = null;
  function openDb(cb) {
    if (db) return cb(db);
    try {
      var rq = window.indexedDB.open(DB, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('track'); };
      rq.onsuccess = function () { db = rq.result; cb(db); };
      rq.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function getFile(id, ok, bad) {
    openDb(function (d) {
      if (!d) return bad();
      try {
        var rq = d.transaction('track').objectStore('track').get(id);
        rq.onsuccess = function () { var v = rq.result; if (v && v.data) ok(v.data.slice(0)); else bad(); };
        rq.onerror = bad;
      } catch (e) { bad(); }
    });
  }
  function putFile(id, data, cb) {
    openDb(function (d) {
      if (!d) return cb(false);
      try {
        var tx = d.transaction('track', 'readwrite');
        tx.objectStore('track').put({ data: data }, id);
        tx.oncomplete = function () { cb(true); };
        tx.onerror = tx.onabort = function () { cb(false); };
      } catch (e) { cb(false); }
    });
  }
  function dropFile(id, cb) {
    openDb(function (d) {
      if (!d) return cb();
      try { var tx = d.transaction('track', 'readwrite'); tx.objectStore('track').delete(id); tx.oncomplete = tx.onerror = function () { cb(); }; } catch (e) { cb(); }
    });
  }

  // ---------- what plays ----------
  // the screen asked for its music (want); in playlist mode the playlist's own track plays instead, and keeps playing
  function pick(want) {
    screenWant = want;
    if (st.paused) return { id: '', loop: true };
    var q = queue();
    if (st.mode !== 'list' || !q.length) { cur = want; return { id: want, loop: true }; }
    if (q.indexOf(cur) < 0) cur = st.order === 'shuffle' ? q[Math.floor(Math.random() * q.length)] : q[0];
    return { id: cur, loop: st.order === 'one' || q.length === 1 };
  }
  function step(dir) {
    var q = queue();
    if (!q.length) return;
    if (dir < 0 && history.length) { cur = history.pop(); }
    else {
      if (cur) history.push(cur);
      if (history.length > 30) history.shift();
      var i = q.indexOf(cur);
      if (st.order === 'shuffle' && q.length > 1) { var n; do { n = q[Math.floor(Math.random() * q.length)]; } while (n === cur); cur = n; }
      else cur = q[(i + (dir < 0 ? q.length - 1 : 1)) % q.length] || q[0];
    }
    replay();
  }
  function replay() { var s = App.sfx; s.stopMusic(); s.music(screenWant); }
  function hook() {
    var s = App.sfx;
    s.pick = pick;
    s.own = getFile;
    // a playlist track ended (or could not be read): the next one
    s.onEnd = function (id, broken) {
      if (st.mode !== 'list' || st.paused) return;
      if (broken) { st.list = st.list.filter(function (x) { return x !== id; }); keep(); }
      step(1);
      if (App.sheet && App.sheet() === 'music') App.openSheet('music');
    };
  }

  // ---------- adding files ----------
  function addFiles(files) {
    if (!canOwn()) { App.toast(t('mu.member')); return; }
    if (ZZ.DevStore) ZZ.DevStore.persist();
    var list = Array.prototype.slice.call(files || []), added = 0, total = st.own.reduce(function (a, o) { return a + (o.size || 0); }, 0);
    App.toast(t('mu.adding'), 1500);
    (function next() {
      var f = list.shift();
      if (!f) { keep(); if (added) App.toast(t('mu.added', added)); App.openSheet('music'); return; }
      if (st.own.length >= MAX_COUNT || total + f.size > MAX_TOTAL) { App.toast(t('mu.full')); list = []; return next(); }
      if (f.size > MAX_FILE) { App.toast(t('mu.big', f.name)); return next(); }
      var rd = new FileReader();
      rd.onload = function () {
        var data = rd.result;
        App.sfx.wake();
        // only files the browser can really play are kept
        App.sfx.decode(data.slice(0), function () {
          var id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
          putFile(id, data, function (okk) {
            if (!okk) { App.toast(t('mu.noStore')); list = []; return next(); }
            var entry = { id: id, name: String(f.name).replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 60), size: f.size };
            st.own.push(entry);
            // chosen "also upload": a copy goes to the player's cloud space too (the local copy is already safe)
            if (ZZ.DevStore && ZZ.DevStore.choice('music') === 'cloud' && ZZ.Cloud && ZZ.Cloud.upload) {
              ZZ.Cloud.upload('music', f.name, data, f.type || 'audio/mpeg').then(function (cid) { if (cid) { entry.cid = cid; keep(); if (App.sheet() === 'music') App.openSheet('music'); } else App.toast(t('ds.upFail'), 3000); });
            }
            st.list.push('own:' + id);
            total += f.size; added++;
            next();
          });
        }, function () { App.toast(t('mu.bad', f.name)); next(); });
      };
      rd.onerror = function () { App.toast(t('mu.bad', f.name)); next(); };
      rd.readAsArrayBuffer(f);
    })();
  }

  function ownOf(id) { var k = String(id).replace(/^own:/, ''); for (var i = 0; i < st.own.length; i++) if (st.own[i].id === k) return st.own[i]; return null; }
  // ---------- the sheet ----------
  function trackRow(id) {
    var on = st.list.indexOf(id) >= 0, own = /^own:/.test(id), locked = own && !canOwn(), playing = App.sfx.mname === id;
    return '<div class="mu-row' + (playing ? ' on' : '') + '"><label class="mu-check"><input type="checkbox" data-mulist="' + App.esc(id) + '"' + (on ? ' checked' : '') + (locked ? ' disabled' : '') + '><span>' + App.esc(nameOf(id)) + '</span></label>' +
      (locked ? '<span class="tag lock">' + t('st.sub') + '</span>' : '<button class="btn sm" type="button" data-muplay="' + App.esc(id) + '">' + (playing ? '♪' : t('mu.playNow')) + '</button>') +
      (own && ownOf(id) && ownOf(id).cid ? '<span class="tag" title="' + App.esc(t('ds.cloud')) + '">☁</span>' : '') +
      (own ? '<button class="btn sm plain" type="button" data-mudel="' + App.esc(id) + '">' + t('mu.del') + '</button>' : '') + '</div>';
  }
  App.dismiss = App.dismiss || {};
  App.dismiss.music = 1;
  App.sheets.music = function () {
    var s = App.sfx, name = s.mname ? nameOf(s.mname) : '', h = '<h2>' + t('mu.title') + '</h2>';
    h += '<div class="mu-now"><small>' + t(name ? 'mu.now' : 'mu.none') + '</small><b>' + App.esc(name || '—') + '</b>' +
      '<div class="row"><button class="btn sm" type="button" data-do="muPrev" aria-label="' + t('mu.prev') + '">⏮</button>' +
      '<button class="btn sm main" type="button" data-do="muToggle">' + t(st.paused ? 'mu.play' : 'mu.pause') + '</button>' +
      '<button class="btn sm" type="button" data-do="muNext" aria-label="' + t('mu.next') + '">⏭</button></div></div>';
    if (App.set.mvol <= 0) h += '<p class="warn">' + t('mu.off') + '</p>';
    h += '<h3>' + t('mu.mode') + '</h3><div class="seg" role="radiogroup" aria-label="' + t('mu.mode') + '">' +
      ['auto', 'list'].map(function (m) { return '<button type="button" role="radio" aria-checked="' + (st.mode === m) + '" data-mumode="' + m + '">' + t('mu.' + m) + '</button>'; }).join('') + '</div>';
    if (st.mode === 'list') {
      h += '<div class="seg" role="radiogroup" aria-label="' + t('mu.order') + '">' + ['seq', 'shuffle', 'one'].map(function (o) { return '<button type="button" role="radio" aria-checked="' + (st.order === o) + '" data-muorder="' + o + '">' + t(o === 'seq' ? 'mu.inOrder' : o === 'shuffle' ? 'mu.shuffle' : 'mu.one') + '</button>'; }).join('') + '</div>';
      if (!queue().length) h += '<p class="note">' + t('mu.listEmpty') + '</p>';
    }
    h += '<h3>' + t('mu.builtin') + '</h3><div class="mu-list">' + BUILT.map(trackRow).join('') + '</div>';
    h += '<h3>' + t('mu.own') + '</h3><p class="note">' + t('mu.ownP') + '</p>' + (ZZ.DevStore && canOwn() ? ZZ.DevStore.html('music') : '');
    if (st.own.length) h += (canOwn() ? '' : '<p class="note">' + t('mu.lapsed') + '</p>') + '<div class="mu-list">' + st.own.map(function (o) { return trackRow('own:' + o.id); }).join('') + '</div>';
    h += canOwn() ? '<div class="row"><label class="btn" for="muFile">' + t('mu.add') + '</label><input id="muFile" type="file" accept="audio/*" multiple hidden>' + (ZZ.DevStore && ZZ.DevStore.choice('music') === 'cloud' ? '<button class="btn" type="button" data-do="muPull">' + t('ds.pull') + '</button>' : '') + '</div>'
      : '<p class="note">' + t('mu.member') + '</p><div class="row"><button class="btn" type="button" data-tab="member">' + t('k.member') + '</button></div>';
    return h + '<div class="row">' + App.btn('close', 'done', true) + '</div>';
  };
  App.opened = App.opened || {};
  var tick = 0;
  App.opened.music = function () {
    // what is playing changes by itself (a track ends, a file finishes reading): keep the top of the sheet current
    clearInterval(tick);
    tick = setInterval(function () {
      if (App.sheet() !== 'music') return clearInterval(tick);
      var el = document.querySelector('.mu-now b'), n = App.sfx.mname ? nameOf(App.sfx.mname) : '—';
      if (el && el.textContent !== n) App.openSheet('music');
    }, 800);
    var f = document.getElementById('muFile');
    if (f) f.onchange = function () { addFiles(f.files); f.value = ''; };
  };
  App.acts.muToggle = function () {
    st.paused = !st.paused; keep();
    App.sfx.wake();
    if (st.paused) App.sfx.stopMusic(); else replay();
    App.openSheet('music');
  };
  App.acts.muNext = function () { App.sfx.wake(); if (st.mode === 'list' && queue().length) step(1); App.openSheet('music'); };
  App.acts.muPrev = function () { App.sfx.wake(); if (st.mode === 'list' && queue().length) step(-1); App.openSheet('music'); };
  App.acts.musicOpen = function () { App.openSheet('music'); };
  // another device: what is in the cloud and not here yet comes down, is checked like any added file, and is kept here
  App.acts.muPull = function () {
    if (!canOwn() || !ZZ.Cloud || !ZZ.Cloud.file) return;
    App.toast(t('mu.adding'), 1500);
    ZZ.Cloud.file({ a: 'fileList', kind: 'music' }).then(function (b) {
      var want = (b && b.files || []).filter(function (f) { return !st.own.some(function (o) { return o.cid === f.id; }); }), got = 0;
      (function next() {
        var f = want.shift();
        if (!f || st.own.length >= MAX_COUNT) { keep(); App.toast(t('ds.pulled', got)); if (App.sheet() === 'music') App.openSheet('music'); return; }
        fetch(f.url).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (data) {
          if (!data) return next();
          App.sfx.wake();
          App.sfx.decode(data.slice(0), function () {
            var id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
            putFile(id, data, function (okk) {
              if (okk) { st.own.push({ id: id, name: String(f.name).replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 60), size: f.size, cid: f.id }); st.list.push('own:' + id); got++; }
              next();
            });
          }, next);
        }, next);
      })();
    });
  };
  App.clicks.push(function (d) {
    if (d.mumode) { st.mode = d.mumode === 'list' ? 'list' : 'auto'; keep(); App.sfx.wake(); replay(); App.openSheet('music'); return true; }
    if (d.muorder) { st.order = d.muorder; keep(); replay(); App.openSheet('music'); return true; }
    if (d.muplay) {
      var id = d.muplay;
      if (!playable(id)) return true;
      if (st.list.indexOf(id) < 0) st.list.push(id);
      st.mode = 'list'; st.paused = false; if (cur) history.push(cur); cur = id; keep();
      App.sfx.wake(); replay(); App.openSheet('music');
      return true;
    }
    if (d.mudel) {
      var did = d.mudel, nm = nameOf(did);
      if (!window.confirm(t('mu.delAsk', nm))) return true;
      st.own = st.own.filter(function (o) { return 'own:' + o.id !== did; });
      st.list = st.list.filter(function (x) { return x !== did; });
      if (cur === did) cur = '';
      keep();
      dropFile(did.slice(4), function () { if (App.sfx.mname === did) replay(); App.openSheet('music'); });
      return true;
    }
    return false;
  });
  App.inputs.push(function (el) {
    if (!el.getAttribute || !el.hasAttribute('data-mulist')) return false;
    var id = el.getAttribute('data-mulist');
    if (el.checked && st.list.indexOf(id) < 0) st.list.push(id);
    if (!el.checked) st.list = st.list.filter(function (x) { return x !== id; });
    keep();
    if (st.mode === 'list') { if (!queue().length || (!el.checked && cur === id)) replay(); }
    return true;
  });
  App.boot.push(function () { load(); hook(); });
  ZZ.Music = { state: function () { return st; }, pick: pick, step: step, BUILT: BUILT, MAX_FILE: MAX_FILE };
})();
