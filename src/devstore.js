/* 轉磚 where a member's own files live: their pictures (shop.js) and music (music.js).

   For now everything stays on this device (IndexedDB). The player picks, per kind, whether to keep it only here or
   also upload it to their cloud space; the upload choice is shown but switched off until the file storage (R2) is
   connected, so nothing is ever sent today. Whatever they pick, the sheet says plainly what "only on this device"
   means: it survives closing the browser, but not clearing the site's data, a private window, another device, or
   (on iPhone Safari) a week without opening the game. We also ask the browser to keep the data for good. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t;
  var KEY = 'zhuanzhuan.upload.v1';
  // on once the server says uploads work (R2 keys set) and this device has a cloud save to keep them with
  function ready() { var C = ZZ.Cloud; return !!(C && C.files && C.hosted && C.hosted()); }

  L.add({
    'ds.where': ['存在哪裡', 'Where they are kept', '保存場所', '저장 위치'],
    'ds.local': ['只存這台裝置', 'This device only', 'この端末だけ', '이 기기에만'],
    'ds.cloud': ['也上傳到雲端', 'Also upload to the cloud', 'クラウドにも保存', '클라우드에도 업로드'],
    'ds.soon': ['雲端上傳準備中，現在全部只存在這台裝置。', 'Cloud upload is on its way; for now everything stays on this device.', 'クラウド保存は準備中です。今はすべてこの端末にだけ保存されます。', '클라우드 업로드는 준비 중이에요. 지금은 모두 이 기기에만 저장돼요.'],
    'ds.localP': ['只存在這台裝置：關掉瀏覽器、重開機都還在；但清除網站資料、用無痕視窗、換手機或電腦就不會有。iPhone 的 Safari 超過 7 天沒打開遊戲，也可能被系統清掉。', 'On this device only: they stay after closing the browser or restarting, but not after clearing the site\'s data, in a private window, or on another phone or computer. On iPhone Safari, a week without opening the game can also clear them.', 'この端末だけに保存：ブラウザを閉じても再起動しても残りますが、サイトデータの削除、プライベートウィンドウ、別の端末では使えません。iPhone の Safari では7日間ゲームを開かないと消えることもあります。', '이 기기에만 저장: 브라우저를 닫거나 재부팅해도 남지만, 사이트 데이터를 지우거나 시크릿 창, 다른 기기에서는 없어요. iPhone Safari에서는 7일 동안 게임을 열지 않으면 지워질 수도 있어요.'],
    'ds.cloudP': ['新加入的檔案會另外上傳到你的雲端空間；這台裝置上原本就有的，可以按「上傳到雲端」補傳。換裝置後在這裡按「從雲端取回」。只有你自己看得到。', 'New files are also uploaded to your cloud space; the ones already on this device can be sent with "Upload to the cloud". On another device, use "Get from the cloud" here. Only you can see them.', '新しく追加したファイルはクラウドにも保存されます。この端末に前からあるものは「クラウドに保存」で送れます。別の端末ではここで「クラウドから取得」を押してください。見られるのはあなただけです。', '새로 넣은 파일은 클라우드에도 올라가요. 이 기기에 원래 있던 파일은 "클라우드에 업로드"로 올릴 수 있어요. 다른 기기에서는 여기서 "클라우드에서 가져오기"를 누르세요. 나만 볼 수 있어요.'],
    'ds.pull': ['從雲端取回', 'Get from the cloud', 'クラウドから取得', '클라우드에서 가져오기'],
    'ds.pulled': ['從雲端取回 {0} 個檔案', 'Got {0} files from the cloud', 'クラウドから {0} 件取得', '클라우드에서 {0}개 가져옴'],
    'ds.upFail': ['上傳到雲端沒有成功，檔案還在這台裝置上。', 'The upload did not go through; the file is still on this device.', 'アップロードできませんでした。ファイルはこの端末に残っています。', '업로드하지 못했어요. 파일은 이 기기에 남아 있어요.'],
    'ds.kept': ['瀏覽器已同意長期保存這些檔案。', 'The browser has agreed to keep these for good.', 'ブラウザがこれらを長期保存することに同意しました。', '브라우저가 이 파일들을 오래 보관하기로 했어요.'],
    'ds.trash': ['最近移除', 'Recently removed', '最近削除した項目', '최근 삭제'],
    'ds.trashP': ['從雲端移除的檔案會在這裡留 30 天，期間可以復原；之後就真的刪除了。', 'Files taken off the cloud wait here for 30 days and can be brought back; after that they are deleted.', 'クラウドから外したファイルはここに30日間残り、元に戻せます。その後は削除されます。', '클라우드에서 뺀 파일은 여기 30일 동안 남아 되돌릴 수 있어요. 그 뒤에는 삭제돼요.'],
    'ds.trashNone': ['30 天內沒有移除過的檔案。', 'Nothing removed in the last 30 days.', '30日以内に削除したファイルはありません。', '30일 안에 삭제한 파일이 없어요.'],
    'ds.left': ['還剩 {0} 天', '{0} days left', '残り{0}日', '{0}일 남음'],
    'ds.back': ['復原', 'Bring back', '元に戻す', '되돌리기'],
    'ds.backOk': ['已復原，正在取回這台裝置。', 'Brought back; getting it onto this device.', '元に戻しました。この端末に取得しています。', '되돌렸어요. 이 기기로 가져오는 중이에요.'],
    'ds.backFull': ['雲端空間滿了，先移除別的檔案再復原。', 'Your cloud space is full; remove something else first.', 'クラウドの容量がいっぱいです。先に別のファイルを削除してください。', '클라우드 공간이 꽉 찼어요. 다른 파일을 먼저 지워 주세요.'],
    'ds.backFail': ['復原沒有成功，稍後再試一次。', 'That did not work; try again in a moment.', '元に戻せませんでした。少ししてからもう一度お試しください。', '되돌리지 못했어요. 잠시 후 다시 해 보세요.'],
    'ds.notKept': ['瀏覽器沒有答應長期保存，空間不夠時可能先被清掉。', 'The browser did not promise to keep them; it may clear them when space runs low.', 'ブラウザは長期保存を約束していません。空き容量が少ないと消えることがあります。', '브라우저가 오래 보관하겠다고 하지 않았어요. 공간이 부족하면 지워질 수 있어요.']
  });

  var st = { pics: 'local', music: 'local' }, kept = null;
  try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { if (v.pics === 'cloud') st.pics = 'cloud'; if (v.music === 'cloud') st.music = 'cloud'; } } catch (e) { /* first visit */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage off */ } }

  // ask once to keep the files; the answer is shown in the note
  function persist() {
    var s = navigator.storage;
    if (!s || !s.persist) return;
    (s.persisted ? s.persisted() : Promise.resolve(false)).then(function (yes) {
      if (yes) { kept = true; return; }
      return s.persist().then(function (ok) { kept = !!ok; });
    }).then(null, function () { kept = false; });
  }
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (yes) { kept = yes; }, function () {});

  // the choice and the note, for a sheet; kind: 'pics' or 'music'
  function html(kind) {
    var cur = ready() ? st[kind] : 'local', h = '<h3>' + t('ds.where') + '</h3><div class="seg" role="radiogroup" aria-label="' + App.esc(t('ds.where')) + '">';
    ['local', 'cloud'].forEach(function (w) {
      h += '<button type="button" role="radio" aria-checked="' + (cur === w) + '" data-dswhere="' + kind + ':' + w + '"' + (w === 'cloud' && !ready() ? ' disabled' : '') + '>' + t('ds.' + w) + '</button>';
    });
    h += '</div>';
    if (!ready()) h += '<p class="note">' + t('ds.soon') + '</p>';
    if (cur === 'cloud') {
      h += '<p class="note">' + t('ds.cloudP') + '</p>';
      var tr = trash[kind];
      if (!tr) h += '<div class="row"><button class="btn sm plain" type="button" data-dstrash="' + kind + '">' + t('ds.trash') + '</button></div>';
      else {
        h += '<h3>' + t('ds.trash') + '</h3><p class="note">' + t('ds.trashP') + '</p>';
        h += tr.length ? '<div class="mu-list ds-trash">' + tr.map(function (f) {
          return '<div class="mu-row"><span>' + App.esc(kind === 'pics' ? t(f.name === 'tile' ? 'mb.tile' : 'mb.wall') : f.name) + ' <small>' + t('ds.left', f.left) + '</small></span><button class="btn sm" type="button" data-dsback="' + kind + ':' + App.esc(f.id) + '">' + t('ds.back') + '</button></div>';
        }).join('') + '</div>' : '<p class="note">' + t('ds.trashNone') + '</p>';
      }
    }
    if (cur === 'local') h += '<p class="note ds-local">' + t('ds.localP') + (kept === true ? ' ' + t('ds.kept') : kept === false ? ' ' + t('ds.notKept') : '') + '</p>';
    return h;
  }
  // "recently removed": fetched when asked for, cleared when the sheet is opened afresh
  var trash = {};
  function reopen() { if (App.sheet()) App.openSheet(App.sheet()); }
  App.clicks.push(function (d) {
    if (d.dstrash && (d.dstrash === 'pics' || d.dstrash === 'music') && ZZ.Cloud && ZZ.Cloud.file) {
      var k = d.dstrash;
      ZZ.Cloud.file({ a: 'fileList', kind: k, trash: true }).then(function (b) { trash[k] = b && b.files || []; reopen(); });
      return true;
    }
    if (d.dsback && ZZ.Cloud && ZZ.Cloud.file) {
      var q = String(d.dsback).split(':'), kind = q[0], id = q.slice(1).join(':');
      ZZ.Cloud.file({ a: 'fileBack', id: id }).then(function (b) {
        if (!b) {
          // the page only gets the body of a good answer; ask the list again to tell "full" from a failure
          return ZZ.Cloud.file({ a: 'fileList', kind: kind, trash: true }).then(function (l) { trash[kind] = l && l.files || trash[kind]; App.toast(t('ds.backFail'), 3000); reopen(); });
        }
        trash[kind] = (trash[kind] || []).filter(function (f) { return f.id !== id; });
        App.toast(t('ds.backOk'), 2500);
        var pull = App.acts[kind === 'pics' ? 'picPull' : 'muPull'];
        if (pull) pull(); else reopen();
      });
      return true;
    }
    if (!d.dswhere) return false;
    var p = String(d.dswhere).split(':');
    if ((p[0] === 'pics' || p[0] === 'music') && (p[1] === 'local' || (p[1] === 'cloud' && ready()))) { st[p[0]] = p[1]; save(); }
    if (App.sheet()) App.openSheet(App.sheet());
    return true;
  });

  ZZ.DevStore = { html: html, persist: persist, choice: function (kind) { return ready() ? st[kind] : 'local'; }, cloudReady: ready };
})();
