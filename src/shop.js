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
    'k.site': ['網站主題', 'Site theme', 'サイトテーマ', '사이트 테마'],
    'st.p': ['整個網站的顏色：選單、側邊欄、視窗和磚塊小遊戲的頁面都會換。遊戲畫面的牆面還是跟著上面的「主題」。', 'The colours of the whole site: menus, the side menu, windows and the brick games\' pages. The game wall still follows "Theme".', 'サイト全体の色：メニュー、サイドメニュー、ウィンドウ、ブロックゲームのページ。ゲームの壁は「テーマ」のままです。', '사이트 전체 색상: 메뉴, 사이드 메뉴, 창, 블록 게임 페이지. 게임 벽은 "테마"를 따릅니다.'],
    'st.base': ['基本', 'Basic', '基本', '기본'],
    'st.free': ['免費', 'Free', '無料', '무료'],
    'st.coin': ['金幣購買', 'With coins', 'コインで購入', '코인 구매'],
    'st.sub': ['會員限定', 'Members only', 'メンバー限定', '멤버 전용'],
    'st.steam': ['Steam 限定', 'Steam only', 'Steam 限定', 'Steam 전용'],
    'st.steamNote': ['Steam 版推出後，用 Steam 玩的玩家可以用。', 'For players on the Steam version, once it is out.', 'Steam 版リリース後、Steam のプレイヤーが使えます。', 'Steam 버전 출시 후 Steam 플레이어가 쓸 수 있어요.'],
    'st.default': ['跟著遊戲主題和裝置的深淺色', 'Follows the game theme and the device\'s light or dark', 'ゲームテーマと端末の明暗に合わせる', '게임 테마와 기기 밝기를 따름'],
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
    'e.locked': ['這個節日活動還沒開放。', 'This holiday event has not opened yet.', 'このイベントはまだ始まっていません。', '이 시즌 이벤트는 아직 열리지 않았습니다.'],
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
    'p.badName': ['這個暱稱不能用，換一個吧。', 'That name cannot be used. Try another.', 'その名前は使えません。別の名前にしてください。', '이 닉네임은 쓸 수 없어요. 다른 걸로 해 주세요.'],
    'bag.title': ['背包', 'Backpack', 'バッグ', '가방'],
    'bag.items': ['道具', 'Items', 'アイテム', '아이템'],
    'bag.looks': ['外觀', 'Looks', '見た目', '꾸미기'],
    'bag.boxes': ['開箱紀錄', 'Box finds', '開封記録', '상자 기록'],
    'bag.itemsP': ['點一下道具就帶進下一場對戰（最多 {0} 個，已選 {1} 個）。帶進去的道具開打時才扣掉。', 'Tap an item to take it into your next battle (up to {0}; {1} picked). It is used up when the match starts.', 'タップで次のバトルに持ち込み（最大{0}個、選択中{1}個）。試合開始時に消費されます。', '탭하면 다음 대전에 가져가요(최대 {0}개, {1}개 선택). 경기가 시작될 때 사용돼요.'],
    'bag.noItems': ['還沒有道具。開寶箱、做每日任務，或到商店買。', 'No items yet. Open boxes, do daily jobs, or buy some in the shop.', 'まだアイテムがありません。宝箱、デイリー、ショップで手に入ります。', '아직 아이템이 없어요. 상자, 일일 임무, 상점에서 얻을 수 있어요.'],
    'bag.kinds': ['{0} 種，共 {1} 個', '{0} kinds, {1} in all', '{0}種類・計{1}個', '{0}종, 총 {1}개'],
    'bag.lookN': ['{0}：{1} 款可用', '{0}: {1} to wear', '{0}：{1}種', '{0}: {1}개'],
    'bag.noBox': ['還沒開過寶箱。', 'No boxes opened yet.', 'まだ宝箱を開けていません。', '아직 상자를 연 적이 없어요.'],
    'bag.lastBox': ['最近一次開箱', 'Last time', '前回の開封', '최근 개봉'],
    'bag.toBoxes': ['去開寶箱', 'Open boxes', '宝箱へ', '상자 열기'],
    'bag.toShop': ['去商店', 'Shop', 'ショップへ', '상점'],
    'sg.title': ['簽到表', 'Sign-in sheet', 'ログインカレンダー', '출석부'],
    'sg.month': ['{0} 年 {1} 月', '{1}/{0}', '{0}年{1}月', '{0}년 {1}월'],
    'sg.wd': ['日,一,二,三,四,五,六', 'S,M,T,W,T,F,S', '日,月,火,水,木,金,土', '일,월,화,수,목,금,토'],
    'sg.sign': ['簽到', 'Sign in', 'ログイン', '출석'],
    'sg.done': ['今天已簽到', 'Signed in today', '本日ログイン済み', '오늘 출석 완료'],
    'sg.count': ['這個月簽了 {0} / {1} 天', '{0} of {1} days this month', '今月 {0} / {1} 日', '이번 달 {0} / {1}일'],
    'sg.streak': ['連續 {0} 天', '{0} days in a row', '{0}日連続', '{0}일 연속'],
    'sg.today': ['今天簽到拿 {0}', 'Today: {0}', '今日の報酬 {0}', '오늘 보상 {0}'],
    'sg.goals': ['累積獎勵', 'Monthly goals', '累計ボーナス', '누적 보상'],
    'sg.goalN': ['{0} 天', '{0} days', '{0}日', '{0}일'],
    'sg.full': ['全勤', 'Every day', '皆勤', '개근'],
    'sg.got': ['簽到成功，拿到 {0} 金幣', 'Signed in: {0} coins', 'ログイン完了、{0} コイン', '출석 완료, {0}코인'],
    'sg.p': ['每天打開遊戲按一下就能簽到，連續越多天拿越多（第 7 天最多，之後重新算）。這個月累積 7、14、21 天和全勤各有一份獎勵，每個月 1 日重新開始。會員每天的簽到金幣加倍。', 'Sign in once a day: the longer the run, the bigger the coins (most on day 7, then it starts over). Reaching 7, 14 and 21 days this month, and every day of it, pays extra; the sheet starts over on the 1st. Members get double the daily coins.', '1日1回ログインするだけ。連続日数が長いほどコインが増えます（7日目が最大、その後は最初から）。今月7・14・21日と皆勤でボーナス、毎月1日にリセット。会員は毎日のコインが2倍。', '하루 한 번 출석하면 돼요. 연속일수가 길수록 코인이 늘어요(7일째가 최대, 그다음엔 처음부터). 이번 달 7·14·21일과 개근에 보너스가 있고, 매달 1일에 새로 시작해요. 회원은 매일 코인 두 배.'],
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
    'j.win5': ['贏 5 場對戰', 'Win 5 matches', '対戦で5勝', '대전 5승'],
    'j.play10': ['打 10 場對戰', 'Play 10 matches', '対戦を10回', '대전 10판'],
    'j.tst': ['做出 1 次 T 轉三消', 'Make a T-spin triple', 'Tスピントリプルを1回', 'T스핀 트리플 1회'],
    'j.lines': ['消掉 100 行', 'Clear 100 lines', '100ライン消す', '100줄 지우기'],
    'j.pieces': ['放下 300 塊', 'Place 300 pieces', 'ブロックを300個置く', '블록 300개 놓기'],
    'j.combo8': ['一場裡連擊到 8', 'Reach an 8 combo in a match', '1試合で8コンボ', '한 판에서 8콤보'],
    'j.score50': ['一場拿到 50,000 分', 'Score 50,000 in one match', '1試合で50,000点', '한 판에 50,000점'],
    'j.ko3': ['一場擊倒對手 3 次', 'Knock out 3 times in one match', '1試合で3回KO', '한 판에 3번 KO'],
    'j.clean': ['不倒地贏一場', 'Win without going down', 'ダウンなしで勝つ', '한 번도 안 쓰러지고 승리'],
    'j.hard': ['打贏第 5 位以上的電腦師傅', 'Beat a computer rival from the 5th up', '5人目以上のCPUに勝つ', '5번째 이상 컴퓨터 상대 이기기'],
    'j.ghost': ['打 1 場分身對戰', 'Play a ghost match', '分身対戦を1回', '분신 대전 1판'],
    'j.online': ['打 1 場連線對戰', 'Play an online match', 'オンライン対戦を1回', '온라인 대전 1판'],
    'j.bigsend': ['一場送出 20 行', 'Send 20 lines in one match', '1試合で20ライン送る', '한 판에 20줄 보내기'],
    'j.sprint90': ['40 行競速 90 秒內完成', 'Finish 40 lines in under 90 s', '40ラインを90秒以内', '40줄을 90초 안에'],
    'j.box': ['開 3 個寶箱', 'Open 3 boxes', '宝箱を3個開ける', '보물상자 3개 열기'],
    'j.wheel': ['轉 1 次轉盤', 'Spin the wheel once', 'ルーレットを1回', '룰렛 1번 돌리기'],
    'j.mini': ['玩 3 場磚塊小遊戲', 'Play 3 brick games', 'ブロックゲームを3回', '블록 게임 3판'],
    'j.wx': ['玩 2 場挑戰大自然', 'Play 2 weather runs', '大自然チャレンジを2回', '대자연 도전 2판'],
    'j.lv3': ['過 3 個關卡', 'Clear 3 levels', 'ステージを3つクリア', '스테이지 3개 클리어'],
    'j.lvNew': ['過一個沒過過的關卡', 'Clear a level you have not cleared yet', '未クリアのステージをクリア', '처음 깨는 스테이지 클리어'],
    'j.lvStar': ['在一個關卡拿 3 顆星', 'Get 3 stars on a level', 'ステージで星3つ', '스테이지에서 별 3개'],
    'j.lvStars': ['多拿 5 顆星', 'Earn 5 more stars', '星を5つ増やす', '별 5개 더 얻기'],
    'j.lvEndless': ['無限挑戰撐到第 5 關', 'Reach stage 5 in the endless run', 'エンドレスで5面まで', '무한 도전 5단계 도달'],
    'j.lvCustom': ['玩 1 個自訂關卡', 'Play a custom level', 'カスタムステージを1回', '커스텀 스테이지 1번'],
    'jb.wave': ['第 {0}／{1} 波', 'Wave {0} of {1}', '第{0}／{1}波', '{0}/{1}차'],
    'jb.next': ['接下一波', 'Next wave', '次の波へ', '다음 차례'],
    'jb.wait': ['第 {0} 波 {1} 開放', 'Wave {0} opens at {1}', '第{0}波は{1}に開放', '{0}차는 {1}에 열림'],
    'jb.allDone': ['今天的 3 波都完成了，明天再來。', "All three waves done for today. See you tomorrow.", '今日の3波はすべて完了。また明日。', '오늘 3차 모두 완료. 내일 또 만나요.'],
    'jb.waveP': ['一波 5 個任務，全部領完可以接下一波；第 2 波完成後要等 12 小時才有第 3 波。每天最多 3 波。', 'Five jobs a wave. Claim them all to draw the next; after the second, the third opens 12 hours later. Three waves a day at most.', '1波5つ。全部受け取ると次の波へ。2波目のあと3波目は12時間後。1日3波まで。', '한 차례에 5개. 모두 받으면 다음 차례로; 2차 이후 3차는 12시간 뒤. 하루 최대 3차.'],
    'jb.gen': ['一般任務', 'Everyday jobs', '通常任務', '일반 임무'],
    'jb.lvl': ['關卡任務', 'Level jobs', 'ステージ任務', '스테이지 임무'],
    'jb.ads': ['看廣告領獎勵', 'Coins for ads', '広告でボーナス', '광고 보상'],
    // profile
    'bx.title': ['寶箱', 'Treasure boxes', '宝箱', '보물상자'],
    'it.filter': ['道具分類', 'Item kinds', 'アイテムの種類', '아이템 종류'],
    'sh.festF': ['一般或節日', 'Regular or holiday', '通常・季節', '일반·시즌'],
    'sh.f.all': ['全部', 'All', 'すべて', '전체'], 'sh.f.plain': ['一般', 'Regular', '通常', '일반'], 'sh.f.fest': ['節日', 'Holidays', 'イベント', '시즌'],
    'sh.fest': ['節日', 'Holiday', 'イベント', '시즌'],
    'sh.locked': ['活動未開放', 'Not open yet', 'イベント未開催', '이벤트 미개최'],
    'it.all': ['全部', 'All', 'すべて', '전체'], 'it.self': ['自己用', 'For you', '自分用', '내게 쓰기'], 'it.foe': ['打對手', 'Against rival', '相手に', '상대에게'],
    'it.combo': ['組合', 'Combos', 'コンボ', '조합'], 'it.owned': ['我有的', 'Mine', '持っている', '보유'],
    'it.count': ['共 {0} 種', '{0} kinds', '{0} 種類', '{0}종'],
    'it.more': ['再顯示（還有 {0} 種）', 'Show more ({0} left)', 'もっと見る（あと {0} 種類）', '더 보기({0}종 남음)'],
    'bx.more': ['寶箱 +{0} 次', '+{0} box today', '宝箱 +{0} 回', '보물상자 +{0}회'],
    'bx.left': ['今天還能開 {0} 次（每天 {1} 次，半夜十二點重算）', '{0} left today ({1} a day, back at midnight)', '今日はあと {0} 回（1 日 {1} 回、0 時にリセット）', '오늘 {0}회 남음(하루 {1}회, 자정에 초기화)'],
    'bx.member': ['會員每天 {0} 次。', 'Members get {0} a day.', 'メンバーは 1 日 {0} 回。', '멤버는 하루 {0}회.'],
    'bx.draw1': ['開一個', 'Open one', '1 回開ける', '1개 열기'],
    'bx.drawAll': ['全部開（{0} 個）', 'Open all ({0})', '全部開ける（{0} 個）', '모두 열기({0}개)'],
    'bx.opening': ['開箱中⋯', 'Opening…', '開けています…', '여는 중…'],
    'bx.slow': ['在等伺服器回應，連上網路就會開。', 'Waiting for the server. The boxes open once you are back online.', 'サーバーの応答を待っています。オンラインに戻ると開きます。', '서버 응답을 기다리는 중입니다. 온라인이 되면 열립니다.'],
    'bx.none': ['今天的次數用完了，明天再來。', 'No more today. Come back tomorrow.', '今日の分は終わりです。また明日。', '오늘 횟수를 다 썼습니다. 내일 다시 오세요.'],
    'bx.wood': ['木箱', 'Wooden box', '木箱', '나무 상자'],
    'bx.iron': ['鐵箱', 'Iron box', '鉄箱', '철 상자'],
    'bx.gold': ['金箱', 'Gold box', '金箱', '금 상자'],
    'bx.gem': ['寶石箱', 'Gem box', '宝石箱', '보석 상자'],
    'bx.look': ['新外觀：{0}', 'New look: {0}', '新しい見た目：{0}', '새 외형: {0}'],
    'bx.oddsShow': ['看機率', 'See the odds', '確率を見る', '확률 보기'],
    'bx.oddsHide': ['收起機率', 'Hide the odds', '確率を閉じる', '확률 닫기'],
    'bx.oddsH': ['每一種結果的機率', 'The odds of every result', 'すべての結果の確率', '모든 결과의 확률'],
    'bx.oddsP': ['先抽箱子的等級，再抽箱子裡的東西。右邊是兩個相乘的結果，每次開箱都一樣。', 'The grade of the box is drawn first, then what is inside. The right column is the two together, and it is the same every time.', 'まず箱の等級、次に中身を抽選します。右の列は両方をかけ合わせた確率で、毎回同じです。', '먼저 상자 등급을, 다음에 내용물을 뽑습니다. 오른쪽은 두 확률을 곱한 값이며 매번 같습니다.'],
    'bx.oddsN': ['道具是七種裡隨機一種，機率相同。外觀從你還沒有、而且價格在範圍內的外觀裡隨機挑；全部都有了就改給金幣。每次開箱的結果都記錄在伺服器上。', 'Each item is one of the seven at equal odds. A look is picked at random from those you do not own within the price range; if you own them all you get coins instead. Every box opened is recorded on the server.', 'アイテムは 7 種類から同じ確率で 1 つ。見た目はまだ持っていない、価格が範囲内のものからランダムに選ばれ、すべて持っている場合はコインになります。開けた結果はすべてサーバーに記録されます。', '아이템은 7종 중 하나가 같은 확률로 나옵니다. 외형은 아직 없는 것 중 가격 범위 안에서 무작위로 고르며, 모두 가지고 있으면 코인을 드립니다. 상자를 연 결과는 모두 서버에 기록됩니다.'],
    'bx.grade': ['箱子', 'Box', '箱', '상자'],
    'bx.inside': ['裡面', 'Inside', '中身', '내용물'],
    'bx.chance': ['機率', 'Chance', '確率', '확률'],
    'bx.items': ['道具 ×{0}', '{0} item(s)', 'アイテム ×{0}', '아이템 ×{0}'],
    'bx.coins': ['金幣 {0}', '{0} coins', 'コイン {0}', '코인 {0}'],
    'bx.lookUpTo': ['一件還沒有的外觀（{0} 金幣以內）', 'A look you do not have (up to {0} coins)', '持っていない見た目 1 つ（{0} コイン以内）', '없는 외형 1개({0}코인 이하)'],
    'bx.anyLook': ['一件還沒有的外觀（不限價格）', 'A look you do not have (any price)', '持っていない見た目 1 つ（価格制限なし）', '없는 외형 1개(가격 제한 없음)'],
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
    'c.set.candy': ['糖果屋', 'Candy house', 'お菓子の家', '과자 집'],
    'c.tile.sakura': ['櫻花磚', 'Sakura', '桜タイル', '벚꽃 타일'],
    'c.tile.heart': ['愛心糖', 'Heart candy', 'ハートキャンディ', '하트 사탕'],
    'c.tile.pearl': ['珍珠奶霜', 'Pearl cream', 'パールクリーム', '진주 크림'],
    'c.tile.ribbon': ['蝴蝶結', 'Ribbon', 'リボン', '리본'],
    'c.tile.macaron': ['馬卡龍', 'Macaron', 'マカロン', '마카롱'],
    'c.tile.jade': ['玉石', 'Jade', '翡翠', '비취'],
    'c.tile.gold': ['金箔', 'Gold leaf', '金箔', '금박'],
    'c.tile.ice': ['冰塊', 'Ice', '氷', '얼음'],
    'c.tile.lava': ['熔岩', 'Lava', '溶岩', '용암'],
    'c.tile.star': ['星星', 'Star', '星', '별'],
    'c.tile.dot': ['圓點', 'Polka dot', '水玉', '물방울'],
    'c.tile.stripe': ['條紋糖', 'Candy stripe', 'ストライプ', '줄무늬'],
    'c.tile.check': ['格紋', 'Gingham', 'ギンガム', '깅엄'],
    'c.tile.cloud': ['雲朵', 'Cloud', '雲', '구름'],
    'c.tile.leaf': ['葉子', 'Leaf', '葉っぱ', '나뭇잎'],
    'c.tile.paper': ['和紙', 'Washi', '和紙', '한지'],
    'c.tile.metal': ['鐵板', 'Steel plate', '鉄板', '철판'],
    'c.tile.cookie': ['餅乾', 'Cookie', 'クッキー', '쿠키'],
    'c.tile.galaxy': ['銀河', 'Galaxy', '銀河', '은하'],
    'c.tile.mono': ['黑白', 'Mono', 'モノクロ', '흑백'],
    'c.bg.sakurasky': ['櫻花雨', 'Sakura shower', '桜吹雪', '벚꽃비'],
    'c.bg.heartpink': ['粉紅愛心', 'Pink hearts', 'ピンクハート', '핑크 하트'],
    'c.bg.lace': ['蕾絲', 'Lace', 'レース', '레이스'],
    'c.bg.peach': ['蜜桃漸層', 'Peach fade', 'ピーチグラデ', '복숭아 그라데이션'],
    'c.bg.ocean': ['深海', 'Deep sea', '深海', '심해'],
    'c.bg.forest': ['森林', 'Forest', '森', '숲'],
    'c.bg.snow': ['雪夜', 'Snowy night', '雪の夜', '눈 내리는 밤'],
    'c.bg.sunset': ['夕陽', 'Sunset', '夕焼け', '노을'],
    'c.bg.aurora': ['極光', 'Aurora', 'オーロラ', '오로라'],
    'c.bg.desert': ['沙丘', 'Dunes', '砂丘', '사구'],
    'c.bg.brickwall': ['紅磚牆', 'Brick wall', 'レンガ壁', '벽돌 벽'],
    'c.bg.wood': ['木地板', 'Wood floor', '木の床', '나무 바닥'],
    'c.bg.checker': ['棋盤', 'Checkerboard', 'チェッカー', '체커보드'],
    'c.bg.stripes': ['斜紋', 'Diagonal stripes', 'ストライプ', '사선 줄무늬'],
    'c.bg.circuit': ['電路板', 'Circuit board', '回路基板', '회로 기판'],
    'c.bg.graph': ['方格紙', 'Graph paper', '方眼紙', '모눈종이'],
    'c.bg.galaxy': ['星雲', 'Nebula', '星雲', '성운'],
    'c.bg.rain': ['雨夜', 'Rainy night', '雨の夜', '비 오는 밤'],
    'c.bg.lavender': ['薰衣草', 'Lavender', 'ラベンダー', '라벤더'],
    'c.bg.mint': ['薄荷', 'Mint', 'ミント', '민트'],
    'c.fx.heart': ['愛心', 'Hearts', 'ハート', '하트'],
    'c.fx.blossom': ['櫻花', 'Blossoms', '桜', '벚꽃'],
    'c.fx.snow': ['雪花', 'Snowflakes', '雪', '눈송이'],
    'c.fx.coin': ['金幣雨', 'Coin shower', 'コインの雨', '코인 비'],
    'c.fx.note': ['音符', 'Notes', '音符', '음표'],
    'c.fx.confetti': ['彩帶', 'Confetti', '紙吹雪', '색종이'],
    'c.fx.diamond': ['鑽石', 'Diamonds', 'ダイヤ', '다이아몬드'],
    'c.fx.ring': ['光圈', 'Rings', '光の輪', '빛의 고리'],
    'c.fx.leaf': ['落葉', 'Leaves', '落ち葉', '낙엽'],
    'c.fx.spark': ['火花', 'Sparks', '火花', '불꽃'],
    'c.fx.smoke': ['輕煙', 'Smoke', 'けむり', '연기'],
    'c.theme.peach': ['蜜桃', 'Peach', 'ピーチ', '피치'],
    'c.theme.rose': ['玫瑰', 'Rose', 'ローズ', '장미'],
    'c.theme.lilac': ['紫丁香', 'Lilac', 'ライラック', '라일락'],
    'c.theme.cotton': ['棉花糖', 'Cotton candy', 'わたあめ', '솜사탕'],
    'c.theme.ocean': ['深海', 'Deep sea', '深海', '심해'],
    'c.theme.forest': ['森林', 'Forest', '森', '숲'],
    'c.theme.snow': ['雪國', 'Snow country', '雪国', '설국'],
    'c.theme.sunset': ['夕陽', 'Sunset', '夕焼け', '노을'],
    'c.theme.lavender': ['薰衣草', 'Lavender', 'ラベンダー', '라벤더'],
    'c.theme.mint': ['薄荷', 'Mint', 'ミント', '민트'],
    'c.theme.coffee': ['咖啡', 'Coffee', 'コーヒー', '커피'],
    'c.theme.lemon': ['檸檬', 'Lemon', 'レモン', '레몬'],
    'c.theme.ruby': ['紅寶石', 'Ruby', 'ルビー', '루비'],
    'c.theme.sky': ['晴空', 'Clear sky', '青空', '맑은 하늘'],
    'c.theme.sand': ['沙灘', 'Beach', '砂浜', '모래사장'],
    'c.theme.graphite': ['石墨', 'Graphite', 'グラファイト', '흑연'],
    'c.theme.midnight': ['午夜', 'Midnight', '真夜中', '한밤'],
    'c.theme.aurora': ['極光', 'Aurora', 'オーロラ', '오로라'],
    'c.theme.candyland': ['糖果樂園', 'Candyland', 'キャンディランド', '캔디랜드'],
    'c.theme.jade': ['玉石', 'Jade', '翡翠', '비취'],
    'c.theme.gold': ['黃金', 'Gold', 'ゴールド', '황금'],
    'c.theme.cocoa': ['可可', 'Cocoa', 'ココア', '코코아'],
    'c.theme.berry': ['莓果', 'Berry', 'ベリー', '베리'],
    'c.set.sakuragirl': ['櫻花少女', 'Sakura girl', '桜の少女', '벚꽃 소녀'],
    'c.set.sweetheart': ['甜心少女', 'Sweetheart', 'スイートハート', '스위트하트'],
    'c.set.princess': ['粉紅公主', 'Pink princess', 'ピンクのお姫さま', '핑크 공주'],
    'c.set.deepsea': ['深海探險', 'Deep-sea dive', '深海探検', '심해 탐험'],
    'c.set.forest': ['森林小屋', 'Forest cabin', '森の小屋', '숲속 오두막'],
    'c.set.snow': ['雪國', 'Snow country', '雪国', '설국'],
    'c.set.sunset': ['夕陽海岸', 'Sunset coast', '夕焼けの海岸', '노을 해변'],
    'c.set.aurora': ['極光之夜', 'Aurora night', 'オーロラの夜', '오로라의 밤'],
    'c.set.palace': ['黃金宮殿', 'Golden palace', '黄金の宮殿', '황금 궁전'],
    'c.set.cafe': ['巷口咖啡', 'Corner café', '街角カフェ', '골목 카페'],
    'c.set.lab': ['電路實驗室', 'Circuit lab', '回路ラボ', '회로 실험실'],
    'c.set.stationery': ['文具店', 'Stationery shop', '文房具屋', '문구점'],
    'c.set.soda': ['薄荷汽水', 'Mint soda', 'ミントソーダ', '민트 소다'],
    'c.set.lavender': ['薰衣草田', 'Lavender field', 'ラベンダー畑', '라벤더 밭'],
    'c.set.volcano': ['火山口', 'Volcano', '火口', '화산 분화구']
  });

  // Four colours that stand for each theme on its card: floor, panel, wall, accent.
  var SWATCH = {
    auto: ['#E4E7EA', '#FAFBFC', '#222B36', '#F5B82E'], ink: ['#111214', '#1E2024', '#000000', '#F5B82E'], kiln: ['#2A1A14', '#3B261D', '#160D0A', '#FFC766'],
    qinghua: ['#EEF2F8', '#FFFFFF', '#12306F', '#F5B82E'], matcha: ['#E6EBD9', '#F8FAF0', '#2C3A22', '#F5B82E'], sakura: ['#F8E6EA', '#FFF8F9', '#4A2533', '#F5B82E'],
    market: ['#140C24', '#22163A', '#0A0514', '#FFD23E'],
    peach: ['#FCE6DC', '#FEF8F4', '#5A2E26', '#F5B82E'], rose: ['#F9E0E6', '#FDF6F8', '#5B1F33', '#F5B82E'], lilac: ['#EEE6F7', '#FAF8FD', '#3E2A5C', '#F5B82E'], cotton: ['#FDEBF4', '#FEF9FC', '#5A3A6E', '#F5B82E'], ocean: ['#0B2236', '#1A2F42', '#020A12', '#F5B82E'], forest: ['#E4EDDF', '#F7FAF5', '#22361F', '#F5B82E'], snow: ['#EEF3F8', '#FAFBFD', '#1F3048', '#F5B82E'], sunset: ['#2A1630', '#37243C', '#120812', '#F5B82E'], lavender: ['#ECE6F5', '#F9F8FC', '#38285A', '#F5B82E'], mint: ['#E0F4EC', '#F6FCF9', '#18413A', '#F5B82E'], coffee: ['#EFE6DC', '#FAF8F4', '#3A2618', '#F5B82E'], lemon: ['#FBF6DC', '#FEFCF4', '#3F3A12', '#F5B82E'], ruby: ['#26090F', '#33181D', '#0F0306', '#F5B82E'], sky: ['#E3F1FB', '#F7FBFE', '#14385A', '#F5B82E'], sand: ['#F5EBDA', '#FCF9F4', '#4A3820', '#F5B82E'], graphite: ['#1B1E22', '#292C2F', '#08090B', '#F5B82E'], midnight: ['#0D1430', '#1C223C', '#03060F', '#F5B82E'], aurora: ['#0A1F24', '#192C31', '#020A0C', '#F5B82E'], candyland: ['#FFF0F6', '#FFFAFC', '#5C2347', '#F5B82E'], jade: ['#E2F0E8', '#F6FAF8', '#173A2A', '#F5B82E'], gold: ['#1E1708', '#2C2517', '#0B0803', '#F5B82E'], cocoa: ['#2A1C14', '#372A22', '#120B07', '#F5B82E'], berry: ['#F6E3EE', '#FCF7FA', '#4A1838', '#F5B82E']
  };
  // the holiday themes' card colours (their names come from meta.js)
  Meta.FESTIVE.forEach(function (f) { SWATCH[f.id] = [f.th[0], f.th[2] ? View.mix(f.th[0], '#FFFFFF', 0.06) : View.mix(f.th[0], '#FFFFFF', 0.7), f.th[1], f.pal[1]]; });
  var TABS = ['set', 'tile', 'bg', 'theme', 'fx', 'site', 'items', 'member'], tab = 'set';
  // site themes: a little picture of the page in the theme's own colours (read from the stylesheet itself)
  var SITE_VARS = ['--floor', '--panel', '--ink', '--gold-ink', '--edge'];
  function siteSwatch(id) {
    var probe = document.documentElement, was = probe.getAttribute('data-site'), out = [];
    if (id === 'default') probe.removeAttribute('data-site'); else probe.setAttribute('data-site', id);
    var cs = getComputedStyle(probe);
    SITE_VARS.forEach(function (v) { out.push(cs.getPropertyValue(v).trim()); });
    if (was) probe.setAttribute('data-site', was); else probe.removeAttribute('data-site');
    return '<div class="pv sw site" style="background:' + out[0] + ';border-color:' + out[4] + '"><span style="background:' + out[1] + ';border-color:' + out[4] + '"><i style="background:' + out[2] + '"></i><i style="background:' + out[3] + '"></i></span></div>';
  }
  function siteHtml() {
    var h = '<p class="note">' + t('st.p') + '</p>', tiers = ['base', 'free', 'coin', 'sub', 'steam'];
    tiers.forEach(function (tier) {
      h += '<h3>' + t('st.' + tier) + '</h3>' + (tier === 'steam' ? '<p class="note">' + t('st.steamNote') + '</p>' : '') + '<div class="cards">';
      Meta.SITE.filter(function (it) { return it.tier === tier; }).forEach(function (it) {
        var st = Meta.siteState(it.id), on = Meta.data.equip.site === it.id, act;
        if (on) act = '<span class="tag on">' + t('sh.using') + '</span>';
        else if (st === 'ok') act = '<button class="btn sm" type="button" data-swear="' + it.id + '">' + t('sh.wear') + '</button>';
        else if (st === 'buy') act = '<button class="btn sm buy" type="button" data-sbuy="' + it.id + '">' + coin(it.price) + '</button>';
        else act = '<span class="tag lock">' + t(st === 'steam' ? 'st.steam' : 'st.sub') + '</span>';
        h += '<div class="card' + (on ? ' on' : '') + '">' + siteSwatch(it.id) + '<b>' + esc(it.name) + (tier === 'steam' ? ' <small class="festtag steamtag">' + t('st.steam') + '</small>' : '') + '</b>' + (it.id === 'default' ? '<small class="parts">' + t('st.default') + '</small>' : '') + act + '</div>';
      });
      h += '</div>';
    });
    return h;
  }
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
    if (st === 'locked') return '<span class="tag lock">' + t('sh.locked') + '</span>';
    return '<span class="tag">' + t('sh.rank', t('tier' + it.rank)) + '</span>';
  }
  // regular looks or holiday ones, per tab
  var lookCat = 'all';
  function festSeg() {
    var h = '<div class="seg" role="radiogroup" aria-label="' + esc(t('sh.festF')) + '">';
    ['all', 'plain', 'fest'].forEach(function (c) { h += '<button type="button" role="radio" aria-checked="' + (lookCat === c) + '" data-lcat="' + c + '">' + t('sh.f.' + c) + '</button>'; });
    return h + '</div>';
  }
  // holidays of the player's own region (and of everywhere); the rest are not listed
  // a holiday on sale now comes before the ones still to open
  function openFirst(list) { var rank = function (it) { return !it.fest ? 0 : Meta.FEST_OPEN.indexOf(it.id) >= 0 ? 1 : 2; }; return list.map(function (it, i) { return [rank(it), i, it]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return x[2]; }); }
  function festOk(it) {
    if (it.fest && !Meta.festShown(it.id, ZZ.Consent ? ZZ.Consent.region() : '')) return false;
    return lookCat === 'all' || (lookCat === 'fest') === !!it.fest;
  }
  App.clicks.push(function (d) {
    if (d.lcat == null || ['all', 'plain', 'fest'].indexOf(d.lcat) < 0) return false;
    lookCat = d.lcat; App.openSheet('shop'); return true;
  });
  function cardsHtml(kind) {
    var list = openFirst(Meta.CATALOG[kind].filter(festOk)), h = festSeg() + '<div class="cards">', i;
    for (i = 0; i < list.length; i++) {
      var it = list[i], on = Meta.data.equip[kind] === it.id, pv;
      if (kind === 'theme') {
        var sw = SWATCH[it.id] || SWATCH.auto;
        pv = '<div class="pv sw" style="background:' + sw[0] + '"><i style="background:' + sw[2] + '"></i><i style="background:' + sw[1] + '"></i><i style="background:' + sw[3] + '"></i></div>';
      } else pv = '<canvas class="pv" data-pv="' + kind + '|' + it.id + '"></canvas>';
      h += '<div class="card' + (on ? ' on' : '') + '">' + pv + '<b>' + esc(t('c.' + kind + '.' + it.id)) + (it.fest ? ' <small class="festtag">' + t('sh.fest') + '</small>' : '') + '</b>' + stateBtn(kind, it) + '</div>';
    }
    return h + '</div>';
  }
  function setsHtml() {
    var list = openFirst(Meta.CATALOG.set.filter(festOk)), h = festSeg() + '<div class="cards wide">', i;
    for (i = 0; i < list.length; i++) {
      var st = list[i], p = Meta.setPrice(st.id), usable = Meta.setUsable(st.id), e = Meta.data.equip;
      var on = Meta.KINDS.every(function (k) { return e[k] === st.parts[k]; }), names = Meta.KINDS.map(function (k) { return t('c.' + k + '.' + st.parts[k]); }).join('・'), act;
      if (st.fest && Meta.FEST_OPEN.indexOf(st.id) < 0 && !usable) act = '<span class="tag lock">' + t('sh.locked') + '</span>';
      else if (usable) act = on ? '<span class="tag on">' + t('sh.using') + '</span>' : '<button class="btn sm" type="button" data-wearset="' + st.id + '">' + t('sh.wear') + '</button>';
      else act = '<button class="btn sm buy" type="button" data-buyset="' + st.id + '">' + coin(p.price) + '</button><small>' + t('sh.setWas', L.num(p.miss)) + '</small>';
      h += '<div class="card' + (on ? ' on' : '') + '"><canvas class="pv" data-pv="set|' + st.id + '"></canvas><b>' + esc(t('c.set.' + st.id)) + '</b><span class="parts">' + esc(names) + '</span>' + act + '</div>';
    }
    return h + '</div>';
  }
  // 200 items: filter by what they do, twenty at a time
  var itemView = { cat: 'all', shown: 20 };
  var ITEM_CATS = ['all', 'self', 'foe', 'combo', 'owned'];
  function itemCat(d) { var sides = d.fx.map(function (f) { return ZZ.FX_KIND[f[0]].side; }); return d.fx.length > 1 ? 'combo' : sides[0]; }
  function itemsHtml() {
    var h = '<p>' + t('sh.itemsP', Meta.BRING_MAX) + '</p><div class="seg" role="radiogroup" aria-label="' + esc(t('it.filter')) + '">', i, list = [];
    ITEM_CATS.forEach(function (c) { h += '<button type="button" role="radio" aria-checked="' + (itemView.cat === c) + '" data-icat="' + c + '">' + t('it.' + c) + '</button>'; });
    h += '</div>';
    for (i = 1; i < ITEMS.length; i++) {
      var d = ITEMS[i], c = itemView.cat;
      if (c === 'owned' ? (Meta.data.items[i] || 0) > 0 : c === 'all' || itemCat(d) === c) list.push(d);
    }
    h += '<p class="note">' + t('it.count', list.length) + '</p><div class="levels">';
    list.slice(0, itemView.shown).forEach(function (d) {
      var id = d.id;
      h += '<div class="rep"><div class="rep-t item">' + App.itile(id) + '<div><b>' + esc(t('i' + id)) + ' <small class="tier t' + d.tier + '">' + '★'.repeat(d.tier) + '</small></b><span>' + esc(t('i' + id + 't')) + '　' + t('sh.stock', Meta.data.items[id] || 0) + '</span></div></div>' +
        '<button class="btn sm buy" type="button" data-buyitem="' + id + '">' + coin(Meta.ITEM_PRICE[id]) + '</button></div>';
    });
    h += '</div>';
    if (list.length > itemView.shown) h += '<div class="row"><button class="btn" type="button" data-do="itemsMore">' + t('it.more', list.length - itemView.shown) + '</button></div>';
    return h;
  }
  App.acts.itemsMore = function () { itemView.shown += 40; App.openSheet('shop'); };
  App.clicks.push(function (d) {
    if (d.icat == null || ITEM_CATS.indexOf(d.icat) < 0) return false;
    itemView.cat = d.icat; itemView.shown = 20;
    App.openSheet('shop');
    return true;
  });
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
      (ZZ.DevStore ? ZZ.DevStore.html('pics') : '<p class="note">' + t('mb.picNote') + '</p>') + '<input type="file" id="picFile" accept="image/*" hidden>';
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
    else if (tab === 'site') h += siteHtml();
    else h += cardsHtml(tab);
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  var pickKey = '';
  App.opened.shop = function () {
    var on = App.el.sheetCard.querySelector('[role="tab"][aria-selected="true"]'), bar = on && on.parentNode;
    if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.offsetLeft - bar.offsetLeft - 16);   // the picked tab in sight
    var list = App.el.sheetCard.querySelectorAll('canvas[data-pv]'), i;
    for (i = 0; i < list.length; i++) {
      var p = list[i].getAttribute('data-pv').split('|'), w = list[i].clientWidth || 120, look = {};
      if (p[0] === 'set') { var st = Meta.find('set', p[1]); look = { tile: st.parts.tile, bg: st.parts.bg, fx: st.parts.fx }; }
      else look[p[0]] = p[1];
      View.preview(list[i], look, w, p[0] === 'set' ? 84 : 72);
    }
    var dim = $('cDim'), file = $('picFile');
    if (dim) { dim.value = Meta.data.custom.dim; $('cDimO').textContent = Meta.data.custom.dim + '%'; }
    if (file) file.onchange = function () { if (file.files && file.files[0] && pickKey && ZZ.DevStore) ZZ.DevStore.persist();
      if (file.files && file.files[0] && pickKey) takeFile(pickKey, file.files[0]); file.value = ''; };
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
    if (el.id === 'pName') {
      var want = String(el.value || '').trim();
      Meta.setName(el.value);
      // a refused name is cleared, and the player is told why
      if (want && !Meta.data.name) { el.value = ''; App.toast(t('p.badName'), 3000); }
      return true;
    }
    return false;
  });
  // the side menu's 網站主題 opens the shop on that tab (the menu's own handler opens the shop)
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-sitepick]'); if (b) tab = 'site'; }, true);
  App.clicks.push(function (d) {
    var p, r;
    if (d.tab) { tab = d.tab; App.openSheet('shop'); App.el.sheetCard.scrollTop = 0; return true; }
    if (d.wear) { p = d.wear.split('|'); if (Meta.equip(p[0], p[1])) { App.applyLook(); App.openSheet(App.sheet() === 'bag' ? 'bag' : 'shop'); } return true; }
    if (d.buy) {
      p = d.buy.split('|'); r = Meta.buy(p[0], p[1]);
      if (!r.ok) { fail(r); return true; }
      Meta.equip(p[0], p[1]); App.applyLook(); App.sfx.play('itemGet'); App.toast(t('sh.bought')); App.openSheet('shop');
      return true;
    }
    if (d.swear) { if (Meta.wearSite(d.swear)) { App.applyLook(); App.openSheet('shop'); } return true; }
    if (d.sbuy) {
      r = Meta.buySite(d.sbuy);
      if (!r.ok) { fail(r); return true; }
      Meta.wearSite(d.sbuy); App.applyLook(); App.sfx.play('itemGet'); App.toast(t('sh.bought')); App.openSheet('shop');
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

  // ---------- the backpack: everything the player has, in one place ----------
  var bagTab = 'items', BAG_TABS = ['items', 'looks', 'boxes'];
  App.dismiss.bag = 1;
  App.sheets.bag = function () {
    var d = Meta.data, h = '<div class="shop-top"><h2>' + t('bag.title') + '</h2>' + coin(d.coins) + '</div><div class="tabs" role="tablist">';
    BAG_TABS.forEach(function (k) { h += '<button type="button" role="tab" aria-selected="' + (bagTab === k) + '" data-bagtab="' + k + '">' + t('bag.' + k) + '</button>'; });
    h += '</div>';
    if (bagTab === 'items') {
      var have = [], total = 0;
      for (var i = 1; i < ITEMS.length; i++) if ((d.items[i] || 0) > 0) { have.push(i); total += d.items[i]; }
      if (!have.length) h += '<p>' + t('bag.noItems') + '</p><div class="row"><button class="btn" type="button" data-do="bagShop">' + t('bag.toShop') + '</button></div>';
      else {
        h += '<p class="note">' + esc(t('bag.kinds', have.length, total)) + '　' + t('bag.itemsP', Meta.BRING_MAX, d.bring.length) + '</p><div class="bag-items">';
        have.forEach(function (id) {
          var on = d.bring.indexOf(id) >= 0, it = ITEMS[id];
          h += '<button type="button" class="bag-it' + (on ? ' on' : '') + '" data-bagbring="' + id + '" aria-pressed="' + on + '">' + App.itile(id) + '<span class="bag-n">×' + d.items[id] + '</span><b>' + esc(t('i' + id)) + ' <small class="tier t' + it.tier + '">' + '★'.repeat(it.tier) + '</small></b><small>' + esc(t('i' + id + 't')) + '</small></button>';
        });
        h += '</div>';
      }
    } else if (bagTab === 'looks') {
      Meta.KINDS.forEach(function (kind) {
        var list = Meta.CATALOG[kind].filter(function (it) { return Meta.state(kind, it.id) === 'ok' && (it.id !== 'custom' || d.custom[kind]); });
        if (!list.length) return;
        h += '<h3>' + esc(t('bag.lookN', t('k.' + kind), list.length)) + '</h3><div class="cards">';
        list.forEach(function (it) {
          var on = d.equip[kind] === it.id, pv;
          if (kind === 'theme') { var sw = SWATCH[it.id] || SWATCH.auto; pv = '<div class="pv sw" style="background:' + sw[0] + '"><i style="background:' + sw[2] + '"></i><i style="background:' + sw[1] + '"></i><i style="background:' + sw[3] + '"></i></div>'; }
          else pv = '<canvas class="pv" data-pv="' + kind + '|' + it.id + '"></canvas>';
          h += '<div class="card' + (on ? ' on' : '') + '">' + pv + '<b>' + esc(t('c.' + kind + '.' + it.id)) + '</b>' + (on ? '<span class="tag on">' + t('sh.using') + '</span>' : '<button class="btn sm" type="button" data-wear="' + kind + '|' + it.id + '">' + t('sh.wear') + '</button>') + '</div>';
        });
        h += '</div>';
      });
      var sites = Meta.SITE.filter(function (s) { return Meta.siteState ? Meta.siteState(s.id) === 'ok' : true; });
      if (sites.length && Meta.siteState) h += '<p class="note">' + esc(t('bag.lookN', t('k.site'), sites.length)) + '　<button class="linkish" type="button" data-do="bagSites">' + t('k.site') + '</button></p>';
    } else {
      var last = d.box.last;
      if (!last || !last.boxes) h += '<p>' + t('bag.noBox') + '</p>';
      else {
        h += '<h3>' + t('bag.lastBox') + '</h3><div class="opened">';
        last.boxes.forEach(function (b) { h += '<div class="bx g-' + b.grade + '"><b>' + t('bx.' + b.grade) + '</b><span>' + b.got.map(prizeText).join('　') + '</span></div>'; });
        h += '</div>';
      }
      h += '<p>' + t('bx.left', Meta.drawsLeft(), Meta.isSub() ? Meta.DRAWS.sub : Meta.DRAWS.free) + '</p><div class="row"><button class="btn primary" type="button" data-sheet="boxes">' + t('bag.toBoxes') + '</button></div>';
    }
    return h + '<div class="row">' + btn('close', 'close') + '</div>';
  };
  App.opened.bag = function () {
    var list = App.el.sheetCard.querySelectorAll('canvas[data-pv]');
    for (var i = 0; i < list.length; i++) { var p = list[i].getAttribute('data-pv').split('|'), look = {}; look[p[0]] = p[1]; View.preview(list[i], look, list[i].clientWidth || 120, 72); }
  };
  App.acts.bagShop = function () { tab = 'items'; App.openSheet('shop'); };
  App.acts.bagSites = function () { tab = 'site'; App.openSheet('shop'); };
  App.clicks.push(function (d) {
    if (d.bagtab && BAG_TABS.indexOf(d.bagtab) >= 0) { bagTab = d.bagtab; App.openSheet('bag'); return true; }
    if (d.bagbring) { if (!Meta.toggleBring(+d.bagbring)) App.toast(t('bag.itemsP', Meta.BRING_MAX, Meta.data.bring.length)); else App.sfx.play('ui'); App.openSheet('bag'); return true; }
    return false;
  });

  // ---------- the sign-in sheet ----------
  App.sheets.sign = function () {
    var D = Meta.data.daily, due = Meta.loginDue(), today = Meta.dayNo(), mo = Meta.monthOf(today), s = Meta.signMonth();
    var run = due ? (D.login === today - 1 ? D.streak + 1 : 1) : D.streak, pay = Meta.LOGIN[(Math.max(1, run) - 1) % Meta.LOGIN.length] * (Meta.isSub() ? 2 : 1);
    var h = '<div class="shop-top"><h2>' + t('sg.title') + '</h2>' + coin(Meta.data.coins) + '</div>';
    h += '<div class="sg-head"><b>' + esc(t('sg.month', mo.y, mo.mo)) + '</b><span>' + esc(t('sg.count', s.days.length, mo.len)) + (run ? ' · ' + esc(t('sg.streak', run - (due ? 1 : 0) || 0)) : '') + '</span></div>';
    // the month as a calendar: ticks on the days signed, today ringed
    h += '<div class="sg-cal" role="grid" aria-label="' + esc(t('sg.month', mo.y, mo.mo)) + '">';
    t('sg.wd').split(',').forEach(function (w) { h += '<span class="sg-wd" role="columnheader">' + esc(w) + '</span>'; });
    for (var i = 0; i < mo.first; i++) h += '<span class="sg-d none"></span>';
    for (var d = 1; d <= mo.len; d++) {
      var on = s.days.indexOf(d) >= 0, now = d === mo.d, past = d < mo.d;
      h += '<span role="gridcell" class="sg-d' + (on ? ' on' : past ? ' miss' : '') + (now ? ' now' : '') + '"' + (on ? ' aria-label="' + d + ' ✓"' : '') + '><b>' + d + '</b>' + (on ? '<i aria-hidden="true">✓</i>' : '') + '</span>';
    }
    h += '</div>';
    h += '<div class="row">' + (due ? '<button class="btn main" type="button" data-do="signIn">' + t('sg.sign') + ' ' + coin(pay) + '</button>' : '<span class="tag on">' + t('sg.done') + '</span>') + '</div>';
    // the month's goals
    h += '<h3>' + t('sg.goals') + '</h3><div class="sg-goals">';
    Meta.SIGN_GOALS.forEach(function (g, gi) {
      var need = g.n || mo.len, got = s.paid.indexOf(gi) >= 0, pct = Math.min(100, Math.round(s.days.length / need * 100));
      h += '<div class="sg-goal' + (got ? ' got' : '') + '"><b>' + esc(g.n ? t('sg.goalN', g.n) : t('sg.full')) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div>' + (got ? '<span class="tag on">' + t('jb.claimed') + '</span>' : coin(g.coins)) + '</div>';
    });
    return h + '</div><p class="note">' + t('sg.p') + '</p><div class="row">' + btn('close', 'close') + '</div>';
  };
  App.acts.signIn = function () {
    var n = Meta.claimLogin();
    if (n) { App.sfx.play('itemGet'); App.toast(t('sg.got', n)); App.updateMenu(); }
    App.openSheet('sign');
  };

  // ---------- daily jobs ----------
  App.sheets.jobs = function () {
    var d = Meta.data.daily, due = Meta.loginDue(), jobs = Meta.jobs(), day = due ? (d.login === Meta.dayNo() - 1 ? d.streak + 1 : 1) : d.streak, i;
    var pay = Meta.LOGIN[(day - 1) % Meta.LOGIN.length] * (Meta.isSub() ? 2 : 1);
    var h = '<div class="shop-top"><h2>' + t('m.jobs') + '</h2>' + coin(Meta.data.coins) + '</div><div class="rep"><div class="rep-t"><b>' + t('jb.login') + '</b><span>' + t('jb.day', day) + '</span></div>' +
      (due ? '<button class="btn sm buy main" type="button" data-do="login">' + t('jb.claim') + ' ' + coin(pay) + '</button>' : '<span class="tag on">' + t('jb.claimed') + '</span>') + '<button class="btn sm" type="button" data-sheet="sign">' + t('sg.title') + '</button></div><h3>' + t('jb.gen') + ' · ' + esc(t('jb.wave', Meta.waveInfo().wave, Meta.WAVE.max)) + '</h3><div class="levels">';
    function jobRow(j) {
      var pct = Math.round(j.n / j.need * 100);
      return '<div class="rep"><div class="rep-t"><b>' + esc(t('j.' + j.id)) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div><span>' + j.n + ' / ' + j.need + '</span></div>' +
        (j.paid ? '<span class="tag on">' + t('jb.claimed') + '</span>' : j.done ? '<button class="btn sm buy main" type="button" data-job="' + j.i + '">' + t('jb.claim') + ' ' + coin(j.coin) + '</button>' : '<span class="tag">' + coin(j.coin) + '</span>') + '</div>';
    }
    jobs.filter(function (j) { return j.cat !== 'lvl'; }).forEach(function (j) { h += jobRow(j); });
    var lvJobs = jobs.filter(function (j) { return j.cat === 'lvl'; });
    if (lvJobs.length) { h += '</div><h3>' + t('jb.lvl') + '</h3><div class="levels">'; lvJobs.forEach(function (j) { h += jobRow(j); }); }
    h += '</div>';
    // the next wave
    var wi = Meta.waveInfo();
    if (wi.done) {
      if (wi.can) h += '<div class="row"><button class="btn main" type="button" data-do="nextWave">' + t('jb.next') + '</button></div>';
      else if (wi.last) h += '<p class="note">' + t('jb.allDone') + '</p>';
      else if (wi.at) h += '<p class="note">' + esc(t('jb.wait', wi.wave + 1, new Date(wi.at).toLocaleTimeString(L.lang, { hour: '2-digit', minute: '2-digit' }))) + '</p>';
    }
    h += '<p class="note">' + t('jb.waveP') + '</p>';
    // the ad reward, counted here too
    h += '<h3>' + t('jb.ads') + '</h3><div class="rep"><div class="rep-t"><b>' + t('jb.ads') + '</b><div class="bar"><i style="width:' + Math.round((Meta.ADS.perDay - Meta.adsLeft()) / Meta.ADS.perDay * 100) + '%"></i></div><span>' + (Meta.ADS.perDay - Meta.adsLeft()) + ' / ' + Meta.ADS.perDay + '</span></div>' +
      '<button class="btn sm" type="button" data-do="openBonus">' + t('bn.title') + '</button></div>';
    return h + '<p class="note">' + t('jb.resets') + '</p><div class="row">' + btn('close', 'close') + '</div>';
  };
  App.acts.openBonus = function () { App.openSheet('bonus'); };
  App.acts.nextWave = function () {
    var r = Meta.nextWave();
    if (r.ok) { App.sfx.play('itemGet'); App.updateMenu(); }
    App.openSheet('jobs');
  };
  App.acts.login = function () {
    var n = Meta.claimLogin();
    if (n) { App.sfx.play('itemGet'); App.toast(t('jb.got', n)); }
    App.openSheet('jobs');
  };

  // ---------- treasure boxes ----------
  var box = { wait: 0, seen: -1, odds: false, slow: 0 };
  function prizeText(g) {
    if (g.kind === 'item') return App.itile(g.id) + ' ' + esc(t('i' + g.id));
    if (g.kind === 'coins') return App.coin(g.n);
    if (g.kind === 'look') return '<b>' + esc(t('bx.look', t('c.' + g.k + '.' + g.id))) + '</b>';
    if (g.kind === 'box') return '<b>' + esc(t('bx.more', g.n)) + '</b>';
    return '';
  }
  App.prizeText = prizeText; App.pct = pct;
  function pct(v) { return (Math.round(v * 100) / 100) + '%'; }
  function oddsHtml() {
    var h = '<h3>' + t('bx.oddsH') + '</h3><p class="note">' + t('bx.oddsP') + '</p><table class="cmp odds"><thead><tr><th>' + t('bx.grade') + '</th><th>' + t('bx.inside') + '</th><th>' + t('bx.chance') + '</th></tr></thead><tbody>';
    Meta.BOX.forEach(function (b) {
      b.prizes.forEach(function (p, i) {
        var what = p.kind === 'items' ? t('bx.items', p.n) + (p.coins ? ' + ' + t('bx.coins', p.coins) : '') : p.kind === 'coins' ? t('bx.coins', p.n) : p.max >= 99999 ? t('bx.anyLook') : t('bx.lookUpTo', p.max);
        h += '<tr>' + (i ? '' : '<td class="og" rowspan="' + b.prizes.length + '"><b>' + t('bx.' + b.id) + '</b><br><small>' + pct(b.p) + '</small></td>') + '<td class="ow">' + esc(what) + '</td><td class="oc">' + pct(b.p * p.p / 100) + '</td></tr>';
      });
    });
    return h + '</tbody></table><p class="note">' + t('bx.oddsN') + '</p>';
  }
  App.sheets.boxes = function () {
    var left = Meta.drawsLeft(), d = Meta.data, h = '<h2>' + t('bx.title') + '</h2>';
    h += '<p>' + t('bx.left', left, Meta.isSub() ? Meta.DRAWS.sub : Meta.DRAWS.free) + '</p>' + (Meta.isSub() ? '' : '<p class="note">' + t('bx.member', Meta.DRAWS.sub) + '</p>');
    if (box.wait) h += '<p class="note" role="status">' + t(Date.now() - box.wait > 6000 ? 'bx.slow' : 'bx.opening') + '</p>';
    else if (d.box.last && d.box.last.n !== box.seen && box.seen >= 0) {
      h += '<div class="opened">';
      d.box.last.boxes.forEach(function (b) { h += '<div class="bx g-' + b.grade + '"><b>' + t('bx.' + b.grade) + '</b><span>' + b.got.map(prizeText).join('　') + '</span></div>'; });
      h += '</div>';
    }
    h += '<div class="row">' + (left > 1 ? '<button class="btn" type="button" data-draw="' + left + '"' + (box.wait ? ' disabled' : '') + '>' + t('bx.drawAll', left) + '</button>' : '') +
      '<button class="btn primary" type="button" data-draw="1"' + (left && !box.wait ? '' : ' disabled') + '>' + t('bx.draw1') + '</button></div>';
    h += '<p class="note"><button class="linkish" type="button" data-do="boxOdds">' + t(box.odds ? 'bx.oddsHide' : 'bx.oddsShow') + '</button></p>' + (box.odds ? oddsHtml() : '');
    return h + '<div class="row">' + btn('close', 'done') + '</div>';
  };
  App.opened.boxes = function () { if (box.seen < 0) box.seen = Meta.data.box.last ? Meta.data.box.last.n : 0; };
  App.closed.boxes = function () { box.seen = Meta.data.box.last ? Meta.data.box.last.n : 0; };
  App.acts.boxOdds = function () { box.odds = !box.odds; App.openSheet('boxes'); };
  function drawn() {
    var last = Meta.data.box.last;
    if (!box.wait || !last || last.n === box.before) return false;
    box.wait = 0;
    var best = last.boxes.some(function (b) { return b.grade === 'gem' || b.grade === 'gold'; });
    App.sfx.play(best ? 'cheer' : 'itemGet');
    App.buzz(best ? [30, 40, 60] : 18);
    return true;
  }
  App.clicks.push(function (d) {
    if (d.draw == null) return false;
    var n = +d.draw;
    box.before = Meta.data.box.last ? Meta.data.box.last.n : 0;
    box.seen = box.before;
    var r = Meta.draw(n);
    if (!r.ok) { App.toast(t('bx.none')); return true; }
    box.wait = Date.now();
    if (!r.pending) drawn();
    else {
      // the server opens them; its answer comes with the next sync (asked for at once)
      if (ZZ.Cloud && ZZ.Cloud.flush) ZZ.Cloud.flush();
      var check = setInterval(function () {
        if (drawn() || !box.wait) { clearInterval(check); if (App.sheet() === 'boxes') App.openSheet('boxes'); App.updateMenu(); return; }
        if (App.sheet() === 'boxes' && Date.now() - box.wait > 6000 && !box.slow) { box.slow = 1; App.openSheet('boxes'); }
      }, 250);
    }
    App.openSheet('boxes');
    App.updateMenu();
    return true;
  });

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
