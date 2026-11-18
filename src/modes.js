/* 轉磚 modes: the ranked ladder, ghost matches, opening lessons and the online lobby. Plugs into ZZ.App. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, Meta = ZZ.Meta, L = ZZ.L, t = L.t, Bot = ZZ.Bot, Net = ZZ.Net, Replay = ZZ.Replay, esc = App.esc, btn = App.btn;
  var $ = function (id) { return document.getElementById(id); };

  L.add({
    'tier0': ['陶土', 'Clay', '陶土', '점토'],
    'tier1': ['紅磚', 'Brick', '赤レンガ', '벽돌'],
    'tier2': ['青瓦', 'Slate', '瓦', '기와'],
    'tier3': ['白瓷', 'Porcelain', '白磁', '백자'],
    'tier4': ['琉璃', 'Glass', '瑠璃', '유리'],
    'tier5': ['鎏金', 'Gilt', '金箔', '금박'],
    'tier6': ['窯神', 'Kiln god', '窯神', '가마신'],
    'foes': ['阿土|磚頭伯|小釉|瓦片姐|泥作仔|阿窯|磨石嬸|水泥哥|砌牆王|青花妹', 'Clay|Old Brick|Glaze|Slate|Mortar|Kiln|Terra|Grout|Mason|Cobalt', 'ツチ|レンガ爺|ユウ|カワラ姐|サカン|カマ|ミガキ|セメント兄|ツミ王|アイ', '흙이|벽돌 할배|유약이|기와 언니|미장이|가마|돌이|시멘트 형|쌓기왕|청화'],
    'rk.toNext': ['再 {0} 分升段', '{0} to the next step', '昇格まであと{0}', '승급까지 {0}'],
    'rk.top': ['已經到頂了，分數繼續累積。', 'You are at the top. Points keep counting.', '最高ランクです。ポイントは積み上がります。', '최고 랭크입니다. 점수는 계속 쌓입니다.'],
    'rk.season': ['{0} 賽季', 'Season {0}', '{0} シーズン', '{0} 시즌'],
    'rk.record': ['這季打了 {0} 場', '{0} matches this season', '今季 {0} 戦', '이번 시즌 {0}판'],
    'rk.r1': ['每場 2 分鐘，沒有道具。', '2 minutes, no items.', '2分、アイテムなし。', '2분, 아이템 없음.'],
    'rk.r2': ['段位越高，電腦對手越快、越少失誤。', 'The higher your rank, the faster and cleaner the computer rival.', 'ランクが上がるほどCPUは速く、ミスが減ります。', '랭크가 오를수록 CPU가 빨라지고 실수가 줄어듭니다.'],
    'rk.r3': ['輸了會扣分，但不會掉出目前的大段位。', 'Losses cost points but never drop you out of your tier.', '負けると減点。ただし今の階級からは落ちません。', '지면 감점되지만 현재 티어 아래로는 떨어지지 않습니다.'],
    'rk.r4': ['每個月換一季：照最高段位發金幣，分數收回三成。', 'A new season each month: coins for your best rank, then ratings settle back 30%.', '毎月シーズン更新：最高ランクに応じてコイン、レートは3割戻ります。', '매월 새 시즌: 최고 랭크에 따라 코인을 주고 레이팅은 30% 내려갑니다.'],
    'rk.next': ['下一位對手：{0}（{1}）', 'Next rival: {0} ({1})', '次の相手：{0}（{1}）', '다음 상대: {0} ({1})'],
    'rk.start': ['開始排位', 'Start ranked match', 'ランクマッチ開始', '랭크전 시작'],
    'rk.seasonNote': ['上一季結算：{0}，+{1} 金幣', 'Last season: {0}, +{1} coins', '前シーズン結果：{0}、+{1}コイン', '지난 시즌 결과: {0}, +{1}코인'],
    // ghost
    'gh.intro': ['每場對戰都會自動錄下來。挑一場，跟那時候的自己打。', 'Every match is recorded. Pick one and play against yourself.', '対戦は自動で記録されます。1つ選んで、その時の自分と対戦。', '모든 대전은 자동으로 기록됩니다. 하나를 골라 그때의 나와 대결하세요.'],
    'gh.none': ['還沒有紀錄。先去打一場對戰。', 'No recordings yet. Play a match first.', '記録がまだありません。まず対戦してみましょう。', '기록이 없습니다. 먼저 대전을 해 보세요.'],
    'gh.keep': ['保留最近 {0} 場。', 'Keeps your last {0} matches.', '直近{0}戦を保存。', '최근 {0}판 보관.'],
    'gh.fight': ['對打', 'Play', '対戦', '대결'],
    'gh.del': ['刪除', 'Delete', '削除', '삭제'],
    'gh.vs': ['對 {0}', 'vs {0}', 'vs {0}', 'vs {0}'],
    'gh.name': ['你的分身', 'Your ghost', 'あなたのゴースト', '나의 고스트'],
    'gh.takeover': ['分身的牆跟錄影對不上了，改由電腦照你的速度接手。', "The ghost's wall no longer matches the recording. The computer takes over at your pace.", 'ゴーストの壁が記録とずれたため、CPUがあなたのペースで引き継ぎます。', '고스트의 벽이 기록과 달라져 CPU가 당신의 속도로 이어받습니다.'],
    'gh.sum': ['{0} 分・每秒 {1} 塊・每分鐘攻擊 {2}', '{0} pts · {1} pieces/s · {2} attack/min', '{0}点・{1}個/秒・火力{2}/分', '{0}점 · 초당 {1}개 · 분당 공격 {2}'],
    'gh.w': ['勝', 'W', '勝', '승'],
    'gh.l': ['敗', 'L', '負', '패'],
    'gh.d': ['平', 'D', '分', '무'],
    // openers
    'op.intro': ['開局照固定的順序擺，就能在前幾塊打出重擊。跟著金色框放，放錯會退回來。', 'Stack the opening in a set order and you hit hard within the first few pieces. Follow the gold outline. A wrong placement is taken back.', '決まった順に積めば、序盤から大きな火力が出せます。金色の枠に合わせて置こう。間違えるとやり直しになります。', '정해진 순서로 쌓으면 초반부터 큰 공격이 나옵니다. 금색 틀에 맞춰 놓으세요. 잘못 놓으면 되돌아갑니다.'],
    'o.tsd.n': ['開局 T 轉雙消', 'Opening T-spin double', '開幕Tスピンダブル', '오프닝 T스핀 더블'],
    'o.tsd.t': ['前六塊搭出一個洞，第七塊的 T 轉進去。', 'Six pieces build the slot. The seventh, a T, twists in.', '6個で穴を作り、7個目のTを回し入れる。', '6개로 틈을 만들고 7번째 T를 돌려 넣습니다.'],
    'o.pc.n': ['四消全清', 'Quad into a perfect clear', 'クアッドでパーフェクト', '쿼드로 퍼펙트 클리어'],
    'o.pc.t': ['九塊鋪滿四排只留一欄，長條插下去，整面清光。', 'Nine pieces fill four rows but one column. The long piece clears the lot.', '9個で4段を埋めて1列だけ空け、長い棒で全消し。', '9개로 4줄을 채우고 한 칸만 남긴 뒤 긴 막대로 전부 지웁니다.'],
    'o.dt.n': ['雙消接三消（DT 砲）', 'Double then triple (DT cannon)', 'ダブルからトリプル（DT砲）', '더블 뒤 트리플 (DT 캐논)'],
    'o.dt.t': ['兩顆 T 連續轉進同一個直井：先雙消，再三消。T 要貼著左牆立著下去，再連轉幾下。', 'Two T pieces go down the same shaft: a double, then a triple. Drop the T upright against the left wall, then keep rotating.', '2つのTを同じ縦穴へ：まずダブル、次にトリプル。Tを立てて左の壁沿いに落とし、続けて回す。', 'T 두 개를 같은 세로 틈에: 먼저 더블, 다음 트리플. T를 세워 왼쪽 벽에 붙여 내린 뒤 계속 돌립니다.'],
    'les.no': ['第 {0} 課', 'Lesson {0}', 'レッスン{0}', '{0}과'],
    'les.step': ['第 {0}／{1} 塊：放到金色框裡。', 'Piece {0} of {1}: place it in the gold outline.', '{0}／{1}個目：金色の枠に置こう。', '{0}/{1}번째: 금색 틀에 놓으세요.'],
    'les.spin': ['第 {0}／{1} 塊：這顆要用轉的進去（{2}）。', 'Piece {0} of {1}: this one has to twist in ({2}).', '{0}／{1}個目：回し入れよう（{2}）。', '{0}/{1}번째: 돌려 넣어야 합니다 ({2}).'],
    'les.wrong': ['位置不一樣，這塊重放。', 'Not the same spot. Try this piece again.', '位置が違います。このピースをもう一度。', '위치가 다릅니다. 이 블록을 다시 놓으세요.'],
    'les.wrongSpin': ['要用轉的進去才算，這塊重放。', 'It has to twist in. Try this piece again.', '回し入れが必要です。もう一度。', '돌려 넣어야 합니다. 다시 놓으세요.'],
    'les.noHold': ['這一課不用暫存，這塊重放。', 'No hold in this lesson. Try this piece again.', 'このレッスンではホールド不要。もう一度。', '이 과에서는 홀드를 쓰지 않습니다. 다시 놓으세요.'],
    'les.done': ['學會了', 'Learned', '習得', '습득 완료'],
    'les.doneP': ['這套起手學會了。到對戰裡，開局的方塊順序對得上就用。', 'You have this opener. Use it in a match whenever the first pieces line up.', 'この開幕を覚えました。対戦で最初のピースの並びが合えば使おう。', '이 오프너를 익혔습니다. 대전에서 첫 블록 순서가 맞으면 써 보세요.'],
    'les.next': ['下一課', 'Next lesson', '次のレッスン', '다음 과'],
    'les.prog': ['進度', 'Progress', '進み具合', '진행'],
    // online
    'net.open': ['開房間', 'Open a room', '部屋を作る', '방 만들기'],
    'net.join': ['加入', 'Join', '入る', '참가'],
    'net.codePh': ['朋友給的 5 碼代碼', "Your friend's 5-character code", '友だちの5文字コード', '친구의 5자리 코드'],
    'net.or': ['或是加入朋友的房間', "Or join a friend's room", 'または友だちの部屋に入る', '또는 친구의 방에 참가'],
    'net.opening': ['正在開房間…', 'Opening a room…', '部屋を作成中…', '방 만드는 중…'],
    'net.send': ['把代碼傳給朋友：', 'Send this code to your friend:', 'このコードを友だちに送ろう：', '이 코드를 친구에게 보내세요:'],
    'net.copy': ['複製邀請連結', 'Copy invite link', '招待リンクをコピー', '초대 링크 복사'],
    'net.copied': ['已複製', 'Copied', 'コピーしました', '복사됨'],
    'net.share': ['分享', 'Share', '共有', '공유'],
    'net.shareText': ['來轉磚跟我打一場，房間代碼 {0}', 'Play me at Zhuan Zhuan. Room code {0}', 'Zhuan Zhuan で対戦しよう。部屋コード {0}', 'Zhuan Zhuan에서 한 판 하자. 방 코드 {0}'],
    'net.waitFriend': ['等朋友進來…', 'Waiting for your friend…', '友だちを待っています…', '친구를 기다리는 중…'],
    'net.joining': ['正在連線…', 'Connecting…', '接続中…', '연결 중…'],
    'net.connected': ['已連上：{0}', 'Connected: {0}', '接続完了：{0}', '연결됨: {0}'],
    'net.waitHost': ['規則由房主決定。等房主按開始…', 'The host sets the rules. Waiting for the host to start…', 'ルールはホストが決めます。開始を待っています…', '규칙은 방장이 정합니다. 시작을 기다리는 중…'],
    'net.start': ['開始', 'Start', '開始', '시작'],
    'net.leaveRoom': ['離開房間', 'Leave room', '部屋を出る', '방 나가기'],
    'net.items': ['道具戰', 'Item match', 'アイテム戦', '아이템전'],
    'net.rules': ['{0}　{1}', '{0} · {1}', '{0}　{1}', '{0} · {1}'],
    'net.itemsOn': ['有道具', 'items on', 'アイテムあり', '아이템 있음'],
    'net.itemsOff': ['沒有道具', 'no items', 'アイテムなし', '아이템 없음'],
    'net.e.lib': ['連線元件載不進來。', 'The networking component failed to load.', '通信コンポーネントを読み込めません。', '통신 구성 요소를 불러오지 못했습니다.'],
    'net.e.server': ['連不上配對伺服器。如果這頁是在 Claude 的預覽裡開的，連線會被擋住，請改用 GitHub 上的版本。', 'Cannot reach the matchmaking server. Inside the Claude preview the connection is blocked; use the GitHub version instead.', 'マッチングサーバーに接続できません。Claudeのプレビュー内では接続がブロックされます。GitHub版をご利用ください。', '매칭 서버에 연결할 수 없습니다. Claude 미리보기에서는 연결이 차단됩니다. GitHub 버전을 이용하세요.'],
    'net.e.room': ['找不到這個房間。確認代碼，或請朋友重開。', 'Room not found. Check the code or ask your friend to reopen it.', '部屋が見つかりません。コードを確認するか、作り直してもらってください。', '방을 찾을 수 없습니다. 코드를 확인하거나 다시 만들어 달라고 하세요.'],
    'net.e.full': ['房間已經有人了。', 'That room is already full.', 'その部屋は満員です。', '방이 이미 찼습니다.'],
    'net.e.lost': ['連線斷了。', 'The connection was lost.', '接続が切れました。', '연결이 끊겼습니다.'],
    'net.foeLeft': ['對手離線，這場算你贏。', 'Your rival left. The match is yours.', '相手が切断しました。あなたの勝ちです。', '상대가 나갔습니다. 당신의 승리입니다.'],
    'net.waitAgain': ['等對方也按「再來一場」…', 'Waiting for your rival to press Play again…', '相手の「もう一戦」を待っています…', '상대의 「한 판 더」를 기다리는 중…'],
    'net.foeWants': ['對方想再來一場。', 'Your rival wants another match.', '相手がもう一戦を希望しています。', '상대가 한 판 더 원합니다.'],
    'net.note': ['連線是兩台裝置直接對連，只有找房間那一步會經過公用的配對伺服器。網路管得太嚴時可能連不上。', 'The two devices connect directly; only finding the room goes through a public matchmaking server. Strict networks may block it.', '2台の端末が直接つながります。部屋探しだけ公開のマッチングサーバーを使います。厳しいネットワークでは接続できない場合があります。', '두 기기가 직접 연결됩니다. 방 찾기만 공개 매칭 서버를 거칩니다. 엄격한 네트워크에서는 연결되지 않을 수 있습니다.'],
    'net.noPause': ['連線對戰不能暫停', 'Online matches cannot be paused', 'オンライン対戦は一時停止できません', '온라인 대전은 일시정지할 수 없습니다'],
    'net.leaveP': ['現在離開，這場就不算了，對方會直接獲勝。', 'Leave now and the match is forfeited. Your rival wins.', 'いま退出すると試合放棄になり、相手の勝ちになります。', '지금 나가면 기권 처리되어 상대가 승리합니다.'],
    'net.keep': ['繼續打', 'Keep playing', '続ける', '계속하기'],
    'net.leave': ['離開', 'Leave', '退出', '나가기']
  });

  // ---------- ranked ----------
  var nextFoe = null;
  function foe() {
    var d = Meta.data;
    if (!nextFoe || nextFoe.rp !== d.rp) nextFoe = { rp: d.rp, cfg: Meta.botFor(d.rp), who: Math.floor(Math.random() * 10) };
    return nextFoe;
  }
  function foeName(f) { return t('foes').split('|')[f.who] || t('foe'); }
  App.go.rank = function () { App.openSheet('rank'); };
  App.dismiss.rank = 1;
  App.sheets.rank = function () {
    var d = Meta.data, r = Meta.rankOf(d.rp), f = foe(), pct = r.top ? 100 : Math.round(r.into / r.need * 100), h, i;
    h = '<h2>' + t('m.rank') + '</h2><div class="rankbox big"><b>' + esc(App.rankName(r)) + '</b><span>' + (r.top ? t('rk.top') : t('rk.toNext', r.need - r.into)) + '</span>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div></div><div class="ladder">';
    for (i = 0; i < 7; i++) h += '<span' + (i === r.tier ? ' class="on"' : i < r.tier ? ' class="past"' : '') + '>' + t('tier' + i) + '</span>';
    h += '</div><p>' + t('rk.season', Meta.seasonId()) + '　' + t('rk.record', d.rgames) + '</p>' + App.ul(['rk.r1', 'rk.r2', 'rk.r3', 'rk.r4']) +
      '<p class="note">' + esc(t('rk.next', foeName(f), t('pps', f.cfg.pps))) + '</p><div class="row">' + btn('close', 'cancel') + btn('rankGo', 'rk.start', true) + '</div>';
    return h;
  };
  function startRank() {
    var f = foe();
    nextFoe = null;
    App.begin('battle', { mode: 'rank', minutes: 2, items: false, cfg: f.cfg, foe: foeName(f) });
  }
  App.acts.rankGo = startRank;
  App.again.rank = startRank;

  // ---------- ghost matches ----------
  App.go.ghost = function () { App.openSheet('ghost'); };
  App.dismiss.ghost = 1;
  function when(at) {
    try {
      var d = new Date(at);
      return d.toLocaleDateString(L.lang, { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString(L.lang, { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  App.sheets.ghost = function () {
    var list = Replay.list(), h = '<h2>' + t('m.ghost') + '</h2><p>' + t('gh.intro') + '</p>', i;
    if (!list.length) h += '<p class="note">' + t('gh.none') + '</p>';
    else {
      h += '<div class="levels">';
      for (i = 0; i < list.length; i++) {
        var r = list[i], s = r.sum || {};
        h += '<div class="rep"><div class="rep-t"><b>' + esc(when(r.at)) + '　' + esc(t('gh.vs', r.info.foe || t('foe'))) + '　' + t(s.result > 0 ? 'gh.w' : s.result < 0 ? 'gh.l' : 'gh.d') + '</b>' +
          '<span>' + esc(t('gh.sum', L.num(s.score || 0), (s.pps || 0).toFixed(2), s.apm || 0)) + '</span></div>' +
          '<button class="btn sm main" type="button" data-ghost="' + i + '">' + t('gh.fight') + '</button><button class="btn sm" type="button" data-ghostdel="' + i + '">' + t('gh.del') + '</button></div>';
      }
      h += '</div>';
    }
    return h + '<p class="note">' + t('gh.keep', Meta.isSub() ? 30 : 5) + '</p><div class="row">' + btn('close', 'close') + '</div>';
  };
  function startGhost(i) {
    var rep = Replay.list()[i];
    if (!rep) return;
    App.begin('battle', { mode: 'ghost', rep: rep, minutes: Math.max(1, Math.min(3, rep.info.minutes || 2)), items: !!rep.info.items, bring: Meta.takeBring() });
  }
  App.again.ghost = function (o) { o.bring = Meta.takeBring(); o.seed = null; App.begin('battle', o); };

  // ---------- opening lessons ----------
  var LES = ZZ.OPENERS || [];
  App.go.openers = function () { App.openSheet('openers'); };
  App.dismiss.openers = 1;
  App.sheets.openers = function () {
    var h = '<h2>' + t('m.open') + '</h2><p>' + t('op.intro') + '</p><div class="levels">', done = Meta.data.first.openers, i;
    for (i = 0; i < LES.length; i++) {
      h += '<button class="lvl tall" type="button" data-lesson="' + i + '"><b>' + t('les.no', i + 1) + '</b><span><strong>' + esc(t('o.' + LES[i].id + '.n')) + '</strong><br>' + esc(t('o.' + LES[i].id + '.t')) + '</span><i>' +
        (done.indexOf(LES[i].id) >= 0 ? t('doneMark') : '') + '</i></button>';
    }
    return h + '</div><div class="row">' + btn('close', 'cancel') + '</div>';
  };
  function stepOf(st) { return { type: st[0], x: st[1], y: st[2], rot: st[3] }; }
  function sameCells(a, b) {
    if (a.length !== b.length) return false;
    var key = function (c) { return c[0] + ',' + c[1]; }, set = {}, i;
    for (i = 0; i < a.length; i++) set[key(a[i])] = 1;
    for (i = 0; i < b.length; i++) if (!set[key(b[i])]) return false;
    return true;
  }
  // The lesson's placements with the inputs that reach each one, for the demo.
  function lessonSteps(les) {
    var g = new ZZ.Game({ queue: les.queue, manual: true, garbage: false, seed: 1 }), out = [], i, k;
    g.start();
    for (i = 0; i < les.steps.length; i++) {
      var st = les.steps[i], spin = st[4] && st[4] !== 'none' ? st[4] : 'none';
      var rows = Bot.rowsOf(g.grid), sp = Bot.spawnPos(rows, st[0]), ps = sp ? Bot.placements(rows, st[0], sp.x, sp.y, 0) : [], hit = null;
      for (k = 0; k < ps.length; k++) if (ps[k].x === st[1] && ps[k].y === st[2] && ps[k].rot === st[3]) hit = ps[k];
      if (!hit || !g.cur) return null;
      out.push({ type: st[0], x: st[1], y: st[2], rot: st[3], spin: spin, path: Bot.pathOf(hit.s, spin !== 'none') });
      g.cur.x = st[1]; g.cur.y = st[2]; g.cur.rot = st[3];
      g.lock(spin !== 'none' ? { tspin: spin } : null);
    }
    return out;
  }
  function say(now) {
    var S = App.S(), les = S.les, st = les.steps[Math.min(S.li, les.steps.length - 1)], n = les.steps.length, line;
    if (now) line = '<b>' + esc(t('demo', t('o.' + les.id + '.n'))) + '</b><br><span class="now">' + esc(now) + '</span>';
    else {
      var spin = st[4] && st[4] !== 'none';
      line = '<b>' + esc(spin ? t('les.spin', S.li + 1, n, App.clearName(st[0], st[4], st[5])) : t('les.step', S.li + 1, n)) + '</b><br>' + esc(t('o.' + les.id + '.t'));
    }
    App.el.strip.innerHTML = line;
  }
  var Lesson = App.kinds.lesson = {
    strip: true,
    begin: function (S, o) {
      S.lesNo = Math.max(0, Math.min(LES.length - 1, o.lesson || 0));
      S.les = LES[S.lesNo];
      S.me = new ZZ.Game({ queue: S.les.queue, seed: 1, gravity: 1 / 1500, lockDelay: Math.max(1000, App.set.lock), garbage: false, sdf: App.sdfVal() });
      S.li = 0; S.state = 'play'; S.demo = null; S.say = null; S.demoDone = null;
    },
    started: function () {
      var S = App.S();
      S.me.start();
      S.snap = S.me.snapshot();
      say('');
    },
    hud: function () {
      var S = App.S(), el = App.el;
      el.hudL.innerHTML = '<span class="who">' + t('les.no', S.lesNo + 1) + '</span>';
      el.hudC.innerHTML = '<div class="hud-title">' + esc(t('o.' + S.les.id + '.n')) + '</div>';
      el.hudR.innerHTML = '<div class="stat"><b id="lProg">0</b><span>' + t('les.prog') + '</span></div>';
    },
    update: function () { var S = App.S(); App.txt('lProg', Math.min(S.li, S.les.steps.length) + '/' + S.les.steps.length); },
    tools: function () { return App.tool('demo', 'tool.demo') + App.tool('restart', 'restart'); },
    spawn: function () {
      var S = App.S(), i = S.demo ? S.demo.si : S.li, st = S.les.steps[i];
      if (st && S.me.cur && S.me.cur.type === st[0]) S.target = { cells: App.stepCells(stepOf(st)), strong: true, label: '' };
    },
    retry: function (key) {
      var S = App.S();
      App.toast(t(key));
      App.sfx.play('fail');
      S.me.restore(S.snap);
      App.V.me.fx = [];
    },
    hold: function () { if (!App.S().demo) Lesson.retry('les.noHold'); },
    lock: function (e) {
      var S = App.S(), st = S.les.steps[S.li];
      if (!st) return;
      var pos = sameCells(e.cells, App.stepCells(stepOf(st))), spin = st[4] ? (e.tspin === st[4] && e.lines === st[5]) : true;
      if (!pos || !spin) return Lesson.retry(pos ? 'les.wrongSpin' : 'les.wrong');
      S.li++;
      if (S.li >= S.les.steps.length) return Lesson.win();
      S.snap = S.me.snapshot();
      say('');
    },
    win: function () {
      var S = App.S(), got = Meta.firstClear('openers', S.les.id, S.les.coin);
      App.sfx.play('win');
      App.buzz([20, 40, 60]);
      App.banner(t('b.pass'), 'good', 1400);
      if (got) App.toast(t('firstClear', got), 2600);
      S.state = 'wait'; S.wait = 1600; S.target = null;
      S.after = function () { App.openSheet('lessonDone'); };
    },
    topout: function () { Lesson.restart(); },
    empty: function () { /* the last piece ends the lesson; nothing to do */ },
    restart: function () {
      var S = App.S();
      App.begin('lesson', { lesson: S.lesNo });
    },
    demo: function () {
      var S = App.S(), steps = lessonSteps(S.les);
      if (!steps) return;
      App.begin('lesson', { lesson: S.lesNo });
      S = App.S();
      S.steps = steps;
      S.state = 'demo';
      S.demo = { si: 0, ai: 0, t: -300, drop: false };
      S.say = say;
      S.demoDone = function () { Lesson.restart(); App.toast(t('yourTurn')); };
      say(t('demoStart'));
      Lesson.spawn();
    }
  };
  App.tools.demo = function () { var S = App.S(); if (S && S.kind === 'lesson') Lesson.demo(); };
  App.sheets.lessonDone = function () {
    var S = App.S(), more = S.lesNo + 1 < LES.length;
    return '<h2>' + t('les.done') + '</h2><p>' + t('les.doneP') + '</p><div class="row">' + (more ? btn('lessonNext', 'les.next', true) : '') + btn('again', 'restart', !more) + btn('menu', 'toMenu') + '</div>';
  };
  App.acts.lessonNext = function () { var S = App.S(); App.begin('lesson', { lesson: S.lesNo + 1 }); };

  // ---------- online lobby ----------
  var joinCode = '', copied = false;
  App.go.online = function () { App.openSheet('online'); };
  function myName() { return Meta.data.name || t('player'); }
  function inviteUrl() { return window.location.href.split('#')[0].split('?')[0] + '?room=' + Net.code; }
  function rulesText() { return t('net.rules', t('minutes', Net.cfg.minutes), t(Net.cfg.items ? 'net.itemsOn' : 'net.itemsOff')); }
  App.sheets.online = function () {
    var st = Net.state, h = '<h2>' + t('m.online') + '</h2>', i;
    if (st === 'opening') h += '<p>' + t('net.opening') + '</p><div class="row">' + btn('netQuit', 'cancel') + '</div>';
    else if (st === 'joining') h += '<p>' + t('net.joining') + '</p><div class="row">' + btn('netQuit', 'cancel') + '</div>';
    else if (st === 'waiting') {
      h += '<p>' + t('net.send') + '</p><div class="roomcode" aria-label="' + esc(Net.code) + '">' + esc(Net.code) + '</div><div class="row">' +
        '<button class="btn" type="button" data-do="netCopy">' + t(copied ? 'net.copied' : 'net.copy') + '</button>' +
        (navigator.share ? btn('netShare', 'net.share') : '') + '</div><p class="note">' + t('net.waitFriend') + '</p><div class="row">' + btn('netQuit', 'net.leaveRoom') + '</div>';
    } else if (st === 'ready' || st === 'playing') {
      h += '<p><b>' + esc(t('net.connected', Net.foe || t('foe'))) + '</b></p>';
      if (Net.host) {
        h += '<h3>' + t('matchTime') + '</h3><div class="seg" role="radiogroup" aria-label="' + t('matchTime') + '">';
        for (i = 1; i <= 3; i++) h += '<button type="button" role="radio" aria-checked="' + (Net.cfg.minutes === i) + '" data-nmin="' + i + '">' + t('minutes', i) + '</button>';
        h += '</div>' + App.toggle('nItems', t('itemsMode')) + '<div class="row">' + btn('netQuit', 'net.leaveRoom') + btn('netStart', 'net.start', true) + '</div>';
      } else {
        h += '<p>' + esc(rulesText()) + '</p><p class="note">' + t('net.waitHost') + '</p><div class="row">' + btn('netQuit', 'net.leaveRoom') + '</div>';
      }
    } else {
      if (st === 'error') h += '<p class="warn">' + t('net.e.' + Net.err) + '</p>';
      h += '<div class="row">' + btn('netOpen', 'net.open', true) + '</div><h3>' + t('net.or') + '</h3>' +
        '<div class="joinrow"><input id="nCode" type="text" inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="5" placeholder="' + esc(t('net.codePh')) + '" value="' + esc(joinCode) + '">' +
        btn('netJoin', 'net.join') + '</div><p class="note">' + t('net.note') + '</p><div class="row">' + btn('close', 'close') + '</div>';
    }
    return h;
  };
  App.opened.online = function () { var c = $('nItems'); if (c) c.checked = Net.cfg.items; };
  App.acts.netOpen = function () { copied = false; Net.open(myName()); };
  App.acts.netJoin = function () { var e = $('nCode'); joinCode = e ? e.value : joinCode; Net.join(joinCode, myName()); };
  App.acts.netQuit = function () { Net.leave(); App.openSheet('online'); };
  App.acts.netStart = function () { Net.start(); };
  App.acts.netCopy = function () {
    var url = inviteUrl(), done = function () { copied = true; if (App.sheet() === 'online') App.openSheet('online'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(done, function () { App.toast(url, 6000); });
    } catch (e) { /* fall through to showing it */ }
    App.toast(url, 6000);
  };
  App.acts.netShare = function () {
    try { navigator.share({ title: t('title'), text: t('net.shareText', Net.code), url: inviteUrl() }).catch(function () { /* closed without sharing */ }); } catch (e) { /* not available */ }
  };
  App.inputs.push(function (el) {
    if (el.id === 'nItems') { Net.setCfg({ minutes: Net.cfg.minutes, items: el.checked }); return true; }
    if (el.id === 'nCode') { joinCode = el.value.toUpperCase(); return true; }
    return false;
  });
  Net.onChange = function () {
    var sh = App.sheet();
    if (sh === 'online' || (sh === 'battleEnd' && App.S() && App.S().mode === 'net')) App.openSheet(sh);
    else if (!sh && App.screen() === 'menu' && Net.state === 'ready') App.openSheet('online');
  };
  App.again.net = function () {
    if (!Net.link()) { App.toast(t('net.e.lost')); return; }
    Net.again();
  };
  App.endExtra = function () {
    var S = App.S();
    if (!S || S.mode !== 'net' || S.why) return '';
    if (Net.wantAgain && !Net.foeAgain) return '<p class="note">' + t('net.waitAgain') + '</p>';
    if (Net.foeAgain && !Net.wantAgain) return '<p class="note">' + t('net.foeWants') + '</p>';
    return '';
  };
  App.sheets.netLeave = function () {
    return '<h2>' + t('net.noPause') + '</h2><p>' + t('net.leaveP') + '</p><div class="row">' + btn('close', 'net.keep', true) + btn('menu', 'net.leave') + '</div>';
  };

  App.clicks.push(function (d) {
    if (d.ghost != null) { startGhost(+d.ghost); return true; }
    if (d.ghostdel != null) { Replay.remove(+d.ghostdel); App.openSheet('ghost'); return true; }
    if (d.lesson != null) { App.begin('lesson', { lesson: +d.lesson }); return true; }
    if (d.nmin != null) { Net.setCfg({ minutes: +d.nmin, items: Net.cfg.items }); return true; }
    return false;
  });

  App.boot.push(function () {
    var note = Meta.takeNote(), room = '';
    try { room = new URLSearchParams(window.location.search).get('room') || ''; } catch (e) { /* no query */ }
    if (note && note.kind === 'season') setTimeout(function () { App.toast(t('rk.seasonNote', App.rankName(note), note.coins), 5000); }, 600);
    if (room) { joinCode = room.toUpperCase().slice(0, 5); App.openSheet('online'); }
  });
})();
