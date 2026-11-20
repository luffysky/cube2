/* 轉磚 consent: the first-visit screen (terms, privacy, age), the storage and font choices, and the notices some
   regions ask for.

   What is kept and why:
   - Game progress and settings in the browser's storage are needed for the game to work at all, so they are not
     asked about (they are explained). There are no cookies, no ads and no trackers.
   - Fonts come from Google Fonts, which means the browser contacts Google. That is optional: until the player
     allows it, the page uses the fonts already on the device.
   - Language first, then where the player lives and an age band, in the same order and with the same choices as
     SPINREALM (cube1), so the two games ask alike. Where the player lives is their own answer: the network address
     is never used to guess it. Neither answer is an identity check or a parent's consent; they only set notices and
     the protections below, and they stay on this device.
   - Under 13 plays without a public name and without online play (rooms, quick match), which are the only places
     strangers meet. 13 and over plays everything.
   - In Simplified Chinese the menu carries an age-suitability notice and the standard healthy-gaming advice. That is
     not the mainland's real-name system, which only a licensed operator there can connect to. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, esc = App.esc, btn = App.btn;
  var KEY = 'zhuanzhuan.consent.v1', VERSION = 2, AGE_MARK = '8+';
  // the same lists as SPINREALM (cube1 dist/region-policies.mjs), plus Hong Kong and Macau (asked for 2026-11-20)
  var REGIONS = ['tw', 'hk', 'mo', 'cn', 'jp', 'kr', 'my', 'sg', 'au', 'us', 'uk', 'other'];
  var AGES = ['u13', 'a13', 'a14', 'a16', 'adult'];
  var C = { v: 0, at: 0, fonts: false, age: '', region: '', ask: false }, noAsk = true;

  function load() {
    try {
      var d = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (d && typeof d === 'object') {
        C.v = +d.v || 0; C.at = +d.at || 0; C.fonts = !!d.fonts; C.ask = d.ask === true;
        C.region = REGIONS.indexOf(d.region) >= 0 ? d.region : '';
        // the first version had three bands: 18+ and under 13 carry over; 13 to 17 is asked again
        C.age = AGES.indexOf(d.age) >= 0 ? d.age : d.age === 'child' ? 'u13' : '';
      }
    } catch (e) { /* asked again */ }
  }
  function keep() { try { window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at: Date.now(), fonts: C.fonts, age: C.age, region: C.region, ask: C.ask })); } catch (e) { /* asked again next time */ } }
  var Consent = {
    done: function () { return C.v >= VERSION && !!C.age && !!C.region; },
    fonts: function () { return C.fonts; },
    age: function () { return C.age; },
    region: function () { return C.region; },
    child: function () { return C.age === 'u13'; },
    asks: function () { return C.ask; },
    minor: function () { return !!C.age && C.age !== 'adult'; },
    set: function (o) {
      if (o.fonts != null) C.fonts = !!o.fonts;
      if (o.age) C.age = o.age;
      if (o.region) C.region = o.region;
      if (o.ask != null) C.ask = !!o.ask;
      C.v = VERSION;
      keep();
      apply();
    }
  };
  ZZ.Consent = Consent;

  // ---------- fonts ----------
  var BASE = ['Barlow+Semi+Condensed:ital,wght@0,600;0,700;1,700;1,800', 'Chiron+GoRound+TC:wght@200..900'], based = false;
  function fontsIn() {
    if (!C.fonts || based) return;
    based = true;
    BASE.forEach(function (f) {
      var ln = document.createElement('link');
      ln.rel = 'stylesheet';
      ln.href = 'https://fonts.googleapis.com/css2?family=' + f + '&display=swap';
      document.head.appendChild(ln);
    });
    if (App.applyLang) App.applyLang();      // the language's own font, now that fonts may load
  }
  // ---------- age ----------
  function apply() {
    fontsIn();
    if (C.age === 'u13' && Meta.data.name) { Meta.setName(''); if (App.updateMenu) App.updateMenu(); }
    notice();
  }
  // In Simplified Chinese: the age-suitability mark and the healthy-gaming advice, under the menu.
  function notice() {
    var el = document.getElementById('cnNotice');
    if (!el) return;
    var on = L.lang === 'zh-Hans' || C.region === 'cn';
    el.hidden = !on;
    if (on) el.innerHTML = '<b>适龄提示：' + AGE_MARK + '</b>　' + esc('抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。');
  }

  L.add({
    'cs.title': ['開始之前', 'Before you start', 'はじめる前に', '시작하기 전에'],
    'cs.p1': ['轉磚不用註冊。遊戲進度存在你的裝置上；第一次打完一場之後，也會存一份匿名的雲端存檔，換裝置不會不見。不用 cookie、沒有廣告、沒有追蹤程式。', 'No sign-up. Your progress is kept on your device and, after your first match, in an anonymous cloud save so it survives a new device. No cookies, no ads, no trackers.', '登録は不要です。進行状況は端末に保存され、最初の対戦のあとは匿名のクラウドセーブにも保存されます。Cookie、広告、トラッカーは使いません。', '가입이 필요 없습니다. 진행 상황은 기기에 저장되고, 첫 대전 후에는 익명 클라우드 저장에도 보관됩니다. 쿠키, 광고, 추적기는 쓰지 않습니다.'],
    'cs.lang': ['語言', 'Language', '言語', '언어'],
    'cs.region': ['你住在哪裡？', 'Where do you live?', 'お住まいの地域', '거주 지역'],
    'rg.tw': ['臺灣', 'Taiwan', '台湾', '대만'],
    'rg.hk': ['香港', 'Hong Kong', '香港', '홍콩'],
    'rg.mo': ['澳門', 'Macau', 'マカオ', '마카오'],
    'rg.cn': ['中國大陸', 'Mainland China', '中国本土', '중국 본토'],
    'rg.jp': ['日本', 'Japan', '日本', '일본'],
    'rg.kr': ['韓國', 'South Korea', '韓国', '대한민국'],
    'rg.my': ['馬來西亞', 'Malaysia', 'マレーシア', '말레이시아'],
    'rg.sg': ['新加坡', 'Singapore', 'シンガポール', '싱가포르'],
    'rg.au': ['澳洲', 'Australia', 'オーストラリア', '호주'],
    'rg.us': ['美國', 'United States', 'アメリカ', '미국'],
    'rg.uk': ['英國', 'United Kingdom', 'イギリス', '영국'],
    'rg.other': ['其他', 'Somewhere else', 'その他', '기타'],
    'cs.age': ['你幾歲？', 'How old are you?', '年齢を教えてください', '나이를 알려 주세요'],
    'cs.u13': ['未滿 13 歲', 'Under 13', '13 歳未満', '13세 미만'],
    'cs.a13': ['13 歲', '13', '13 歳', '13세'],
    'cs.a14': ['14–15 歲', '14–15', '14〜15 歳', '14~15세'],
    'cs.a16': ['16–17 歲', '16–17', '16〜17 歳', '16~17세'],
    'cs.adult': ['18 歲以上', '18 or older', '18 歳以上', '18세 이상'],
    'cs.selfNote': ['地區和年齡是你自己選的，只存在這台裝置上，用來決定要顯示哪些提醒和保護。這不是身分驗證，也不代表家長已經同意。', 'Where you live and your age are your own answers, kept only on this device, to choose which notices and protections apply. This is not an identity check and does not stand for a parent\'s consent.', '地域と年齢はご自身の回答で、この端末だけに保存され、表示する注意事項と保護の判断に使います。本人確認や保護者の同意の代わりにはなりません。', '지역과 나이는 직접 고른 답으로 이 기기에만 저장되며, 어떤 안내와 보호를 적용할지 정하는 데 씁니다. 본인 확인이나 보호자 동의를 대신하지 않습니다.'],
    'cs.cnNote': ['本遊戲未在中國大陸取得網路遊戲出版許可，沒有接上實名認證與防沉迷系統。', 'This game holds no online game publishing licence in mainland China and is not connected to its real-name and anti-addiction system.', '本ゲームは中国本土のオンラインゲーム出版許可を取得しておらず、実名認証・依存防止システムに接続していません。', '이 게임은 중국 본토의 온라인 게임 출판 허가를 받지 않았으며 실명 인증·과몰입 방지 시스템과 연결되어 있지 않습니다.'],
    'cs.pick': ['先選地區和年齡。', 'Pick where you live and your age first.', '先に地域と年齢を選んでください。', '먼저 지역과 나이를 선택하세요.'],
    'cs.childNote': ['未滿 13 歲：不開放連線對戰和隨機配對，排行榜上不顯示名字。其他都能玩。', 'Under 13: no online play or quick match, and no name on the leaderboards. Everything else is open.', '13 歳未満：オンライン対戦とランダムマッチは使えず、ランキングに名前は表示されません。ほかはすべて遊べます。', '13세 미만: 온라인 대전과 빠른 매칭은 쓸 수 없고 순위표에 이름이 표시되지 않습니다. 나머지는 모두 즐길 수 있습니다.'],
    'cs.teenNote': ['未滿 18 歲的朋友，玩之前跟家長說一聲；每天玩一陣子就休息一下。', 'If you are under 18, let a parent know you play, and take breaks.', '18 歳未満の方は、遊ぶことを保護者に伝えて、適度に休憩してください。', '18세 미만이라면 보호자에게 알리고 틈틈이 쉬세요.'],
    'cs.fontsH': ['字型', 'Fonts', 'フォント', '글꼴'],
    'cs.fontsP': ['遊戲用的字型放在 Google Fonts。允許的話，你的瀏覽器會連到 Google 下載字型（Google 會看到你的網路位址）；不允許的話就用裝置內建的字型，遊戲一樣能玩。', 'The game\'s fonts are hosted by Google Fonts. If you allow it, your browser fetches them from Google (which sees your network address). If not, the fonts already on your device are used and everything still works.', 'ゲームのフォントは Google Fonts にあります。許可するとブラウザが Google からフォントを取得します（Google にネットワークアドレスが伝わります）。許可しない場合は端末のフォントで遊べます。', '게임 글꼴은 Google Fonts에 있습니다. 허용하면 브라우저가 Google에서 글꼴을 받아옵니다(Google이 네트워크 주소를 봅니다). 허용하지 않으면 기기 글꼴로 똑같이 즐길 수 있습니다.'],
    'cs.fontsOn': ['使用 Google 字型', 'Use Google Fonts', 'Google フォントを使う', 'Google 글꼴 사용'],
    'cs.agree': ['按下任一個「開始玩」表示你同意<a href="terms.html" target="_blank" rel="noopener">服務條款</a>，也看過<a href="privacy.html" target="_blank" rel="noopener">隱私政策</a>。', 'By pressing either “Start” you agree to the <a href="terms.html" target="_blank" rel="noopener">terms of service</a> and have read the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.', 'どちらかの「はじめる」を押すと<a href="terms.html" target="_blank" rel="noopener">利用規約</a>に同意し、<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>を確認したものとみなします。', '어느 「시작」이든 누르면 <a href="terms.html" target="_blank" rel="noopener">이용약관</a>에 동의하고 <a href="privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>을 읽은 것으로 봅니다.'],
    'cs.startAll': ['開始玩（用 Google 字型）', 'Start, with Google Fonts', 'はじめる（Google フォントを使う）', '시작(Google 글꼴 사용)'],
    'cs.startMin': ['開始玩（不用）', 'Start, without', 'はじめる（使わない）', '시작(사용 안 함)'],
    'cs.settingsH': ['隱私與資料', 'Privacy and data', 'プライバシーとデータ', '개인정보와 데이터'],
    'cs.ageNow': ['地區：{0}　年齡：{1}', 'Where you live: {0} · Age: {1}', '地域：{0}　年齢：{1}', '지역: {0} · 나이: {1}'],
    'cs.noAsk': ['下次不再顯示（之後可以到設定改）', 'Don\'t show this again (change it later in Settings)', '次回から表示しない（設定で変更できます）', '다음부터 표시 안 함 (설정에서 변경 가능)'],
    'cs.askEach': ['每次開始時顯示地區和年齡確認', 'Ask for region and age each time the game starts', '起動のたびに地域と年齢を確認', '시작할 때마다 지역과 나이 확인'],
    'cs.changeAge': ['改地區或年齡', 'Change region or age', '地域・年齢を変更', '지역·나이 변경'],
    'cs.export': ['下載我的資料', 'Download my data', '自分のデータをダウンロード', '내 데이터 다운로드'],
    'cs.links': ['<a href="privacy.html" target="_blank" rel="noopener">隱私政策</a>　<a href="terms.html" target="_blank" rel="noopener">服務條款</a>', '<a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>　<a href="terms.html" target="_blank" rel="noopener">Terms of service</a>', '<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>　<a href="terms.html" target="_blank" rel="noopener">利用規約</a>', '<a href="privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>　<a href="terms.html" target="_blank" rel="noopener">이용약관</a>'],
    'cs.childBlock': ['未滿 13 歲不開放連線對戰。可以打電腦、練功、排位和闖關。', 'Online play is not available under 13. You can play the computer, train, play ranked and the levels.', '13 歳未満はオンライン対戦を利用できません。コンピューター対戦、練習、ランク戦は遊べます。', '13세 미만은 온라인 대전을 이용할 수 없습니다. 컴퓨터 대전, 연습, 랭크전은 즐길 수 있습니다.'],
    'cs.nameChild': ['未滿 13 歲不能設定公開名字。', 'A public name cannot be set under 13.', '13 歳未満は公開する名前を設定できません。', '13세 미만은 공개 이름을 설정할 수 없습니다.']
  });

  // ---------- the first-visit screen ----------
  var pick = '', pickR = '', warn = false;
  function chips(name, label, list, on, text) {
    var h = '<h3>' + t(label) + '</h3><div class="picks" role="radiogroup" aria-label="' + esc(t(label)) + '">';
    list.forEach(function (k) { h += '<button type="button" role="radio" aria-checked="' + (on === k) + '" data-' + name + '="' + k + '">' + esc(text(k)) + '</button>'; });
    return h + '</div>';
  }
  App.sheets.consent = function () {
    var a = pick || C.age, r = pickR || C.region, h = '<h2>' + t('cs.title') + '</h2><p>' + t('cs.p1') + '</p>';
    // 1. language (the device's language is already chosen), 2. where you live, 3. age band
    h += chips('cslang', 'cs.lang', L.LANGS.map(function (x) { return x[0]; }), L.lang, function (k) { return L.LANGS.filter(function (x) { return x[0] === k; })[0][1]; });
    h += chips('region', 'cs.region', REGIONS, r, function (k) { return t('rg.' + k); });
    if (r === 'cn') h += '<p class="note">' + t('cs.cnNote') + '</p>';
    h += chips('age', 'cs.age', AGES, a, function (k) { return t('cs.' + k); });
    if (a === 'u13') h += '<p class="note">' + t('cs.childNote') + '</p>';
    else if (a && a !== 'adult') h += '<p class="note">' + t('cs.teenNote') + '</p>';
    h += '<p class="note">' + t('cs.selfNote') + '</p>' + App.toggle('csNoAsk', t('cs.noAsk'));
    if (warn && (!a || !r)) h += '<p class="warn" role="status">' + t('cs.pick') + '</p>';
    h += '<h3>' + t('cs.fontsH') + '</h3><p class="note">' + t('cs.fontsP') + '</p>';
    if (L.lang === 'zh-Hans') h += '<p class="note"><b>适龄提示：' + AGE_MARK + '</b></p>';
    // two equal buttons: nothing is ticked for the player, and saying no is as easy as saying yes
    return h + '<p class="note">' + t('cs.agree') + '</p><div class="row">' + btn('consentAll', 'cs.startAll') + btn('consentMin', 'cs.startMin') + '</div>';
  };
  function go(fonts) {
    var a = pick || C.age, r = pickR || C.region;
    if (!a || !r) { warn = true; return App.openSheet('consent'); }
    Consent.set({ age: a, region: r, fonts: fonts, ask: !noAsk });
    App.closeSheet();
  }
  App.acts.consentAll = function () { go(true); };
  App.acts.consentMin = function () { go(false); };
  App.inputs.push(function (el) {
    if (el.id === 'sFonts') { Consent.set({ fonts: el.checked }); return true; }
    if (el.id === 'csNoAsk') { noAsk = el.checked; return true; }
    if (el.id === 'sAskAge') { Consent.set({ ask: el.checked }); return true; }
    return false;
  });
  App.clicks.push(function (d) {
    if (d.age != null && AGES.indexOf(d.age) >= 0) pick = d.age;
    else if (d.region != null && REGIONS.indexOf(d.region) >= 0) pickR = d.region;
    else if (d.cslang != null && App.setLang) App.setLang(d.cslang);
    else return false;
    App.openSheet('consent');
    return true;
  });
  App.acts.changeAge = function () { pick = C.age; pickR = C.region; App.openSheet('consent'); };
  // everything the game keeps about this player, as a file
  App.acts.exportData = function () {
    var out = { exported: new Date().toISOString(), game: 'zhuanzhuan', record: Meta.data, cloud: ZZ.Cloud ? { tag: ZZ.Cloud.pub || '', linked: !!ZZ.Cloud.cred } : null, consent: { region: C.region, age: C.age, fonts: C.fonts, at: C.at } };
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zhuanzhuan-my-data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  // in Settings
  App.settingsExtra = function () {
    return '<h3>' + t('cs.settingsH') + '</h3>' + App.toggle('sFonts', t('cs.fontsOn')) + App.toggle('sAskAge', t('cs.askEach')) + '<p class="note">' + esc(t('cs.ageNow', C.region ? t('rg.' + C.region) : '—', C.age ? t('cs.' + C.age) : '—')) + '</p>' +
      '<div class="row">' + btn('changeAge', 'cs.changeAge') + btn('exportData', 'cs.export') + '</div><p class="note">' + t('cs.links') + '</p>';
  };
  // The privacy policy and terms are written per region (legal/<region>/, drafts for now): links to them go to the
  // version for the region the player chose. Taiwan, and no choice yet, keep the main pages.
  Consent.legal = function (doc) { return C.region && C.region !== 'tw' ? 'legal/' + C.region + '/' + doc + '.html' : doc + '.html'; };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null, m = a && /^(privacy|terms)\.html$/.exec(a.getAttribute('href'));
    if (m) a.setAttribute('href', Consent.legal(m[1]));
  }, true);
  App.settingsOpened = function () { var c = document.getElementById('sFonts'); if (c) c.checked = C.fonts; c = document.getElementById('sAskAge'); if (c) c.checked = C.ask; };
  App.opened.consent = function () { var c = document.getElementById('csNoAsk'); if (c) c.checked = noAsk; };

  // under 13: the places where strangers meet stay closed
  var goOnline = App.go.online, goQuick = App.go.quick;
  App.go.online = function () { if (Consent.child()) return App.toast(t('cs.childBlock'), 4200); goOnline(); };
  App.go.quick = function () { if (Consent.child()) return App.toast(t('cs.childBlock'), 4200); goQuick(); };
  // the same for a room link or anything else that reaches the network play directly
  ['open', 'join', 'quick'].forEach(function (k) {
    var f = ZZ.Net && ZZ.Net[k];
    if (typeof f === 'function') ZZ.Net[k] = function () { if (Consent.child()) { App.toast(t('cs.childBlock'), 4200); return; } return f.apply(ZZ.Net, arguments); };
  });
  var setName = Meta.setName;
  Meta.setName = function (v) { if (Consent.child() && v) { App.toast(t('cs.nameChild')); return false; } return setName(v); };

  load();
  App.boot.push(function () {
    apply();
    var room = /[?&]room=/.test(window.location.search);
    // automated browser tests skip the first-visit screen (all but the one that tests it, which sets this flag)
    var robot = navigator.webdriver === true && !window.__zzAskConsent;
    noAsk = !C.ask;
    if ((!Consent.done() || C.ask) && !robot) { pick = C.age; pickR = C.region; setTimeout(function () { if (!App.sheet() || room) App.openSheet('consent'); }, room ? 400 : 80); }
  });
  App.langChanged = App.langChanged || [];
  App.langChanged.push(notice);
})();
