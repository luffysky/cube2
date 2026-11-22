/* 轉磚 磚之冒險 第一章：窯場 (adventure, chapter 1): one player against a monster. Lines you clear and cement you send
   hurt it; it sends cement on a clock. Three classes, three pieces of gear found along the way and made stronger with
   coins, a skill charged by cleared lines. Rules and rewards are in meta.js (Meta.RPG), the same on the server. Single
   player only: nothing here touches ranked play or online rooms. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, esc = App.esc, btn = App.btn, RPG = Meta.RPG;

  L.add({
    'rp.title': ['磚之冒險', 'Brick Quest', 'ブロック冒険', '블록 모험'],
    'rp.menuS': ['第一章：窯場。打倒 10 隻怪物，最後是窯爐之王', 'Chapter 1: the Kiln Yard. Ten monsters, then the Kiln King', '第1章：窯場。10体の魔物と窯の王', '1장: 가마터. 몬스터 10마리, 마지막은 가마의 왕'],
    'rp.ch1': ['第一章：窯場', 'Chapter 1: the Kiln Yard', '第1章：窯場', '1장: 가마터'],
    'rp.intro': ['消行和送出的攻擊都會打怪物的血；怪物也會定時送水泥給你。被擊倒就輸了。', 'Lines you clear and cement you send hurt the monster; it sends cement at you on a clock. Topping out loses.', 'ライン消しと攻撃で魔物にダメージ。魔物も定期的にセメントを送ってきます。トップアウトで負け。', '줄을 지우고 공격을 보내면 몬스터가 다쳐요. 몬스터도 주기적으로 시멘트를 보내요. 꼭대기에 닿으면 패배.'],
    'rp.cls': ['職業', 'Class', '職業', '직업'],
    'rp.c.tank': ['守窯人', 'Kiln Guard', '窯番', '가마지기'],
    'rp.c.tankP': ['怪物每次攻擊少 1 行。技能「窯牆」：8 秒內擋下所有攻擊。', 'Every monster attack lands one line fewer. Skill "Kiln Wall": block every attack for 8 seconds.', '魔物の攻撃が毎回1ライン減る。スキル「窯の壁」：8秒間すべての攻撃を防ぐ。', '몬스터 공격이 매번 1줄 줄어요. 스킬 「가마 벽」: 8초 동안 모든 공격 차단.'],
    'rp.c.rogue': ['刺客', 'Rogue', '刺客', '자객'],
    'rp.c.rogueP': ['T 轉造成的傷害加倍。技能「暗刃」：馬上造成 12 點傷害，下一次消行傷害也加倍。', 'T-spins do double damage. Skill "Hidden Blade": 12 damage at once, and your next clear does double.', 'Tスピンのダメージ2倍。スキル「暗刃」：即12ダメージ、次のライン消しも2倍。', 'T스핀 피해 2배. 스킬 「암인」: 즉시 12 피해, 다음 줄 지우기도 2배.'],
    'rp.c.mage': ['法師', 'Mage', '術師', '마법사'],
    'rp.c.mageP': ['技能充得比較快（6 行就滿）。技能「淨化」：清掉牆底 4 排。', 'The skill charges faster (6 lines). Skill "Cleanse": remove the bottom 4 rows of your wall.', 'スキルが早くたまる（6ライン）。スキル「浄化」：壁の下4段を消す。', '스킬이 빨리 차요(6줄). 스킬 「정화」: 벽 아래 4줄 제거.'],
    'rp.gear': ['裝備', 'Gear', '装備', '장비'],
    'rp.g.w': ['窯火錘', 'Kiln Hammer', '窯火の槌', '가마불 망치'],
    'rp.g.wP': ['傷害 +{0}%', 'Damage +{0}%', 'ダメージ +{0}%', '피해 +{0}%'],
    'rp.g.a': ['釉甲', 'Glaze Armor', '釉の鎧', '유약 갑옷'],
    'rp.g.aP': ['怪物攻擊少 {0} 行（2 級起 1 行、5 級 2 行）', '{0} fewer lines per attack (1 from level 2, 2 at level 5)', '攻撃が{0}ライン減る（Lv2で1、Lv5で2）', '공격이 {0}줄 줄어요(2레벨부터 1, 5레벨 2)'],
    'rp.g.c': ['窯變護符', 'Kiln Charm', '窯変の護符', '요변 부적'],
    'rp.g.cP': ['技能少 {0} 行就充滿', 'Skill charges {0} lines sooner', 'スキルが{0}ライン早くたまる', '스킬이 {0}줄 빨리 차요'],
    'rp.g.none': ['還沒找到（第 {0} 關掉落）', 'Not found yet (dropped by stage {0})', '未入手（ステージ{0}で入手）', '아직 없음({0}단계에서 획득)'],
    'rp.lv': ['{0} 級', 'Lv {0}', 'Lv{0}', '{0}레벨'],
    'rp.up': ['強化（{0} 金幣）', 'Upgrade ({0} coins)', '強化（{0}コイン）', '강화({0}코인)'],
    'rp.max': ['已滿級', 'Maxed', '最大', '최대'],
    'rp.upDone': ['{0} 強化到 {1} 級', '{0} is now level {1}', '{0} が Lv{1} に', '{0} {1}레벨 달성'],
    'rp.noCoins': ['金幣不夠', 'Not enough coins', 'コインが足りません', '코인이 부족해요'],
    'rp.stages': ['關卡', 'Stages', 'ステージ', '스테이지'],
    'rp.st': ['第 {0} 關', 'Stage {0}', 'ステージ{0}', '{0}단계'],
    'rp.hp': ['血量 {0}', 'HP {0}', 'HP {0}', 'HP {0}'],
    'rp.boss': ['首領', 'Boss', 'ボス', '보스'],
    'rp.locked': ['先打倒前一關', 'Beat the one before first', '前のステージを先に', '이전 단계를 먼저'],
    'rp.m.mud': ['泥巴怪', 'Mud Lump', '泥のかたまり', '진흙 덩어리'],
    'rp.m.shard': ['碎瓦蟲', 'Shard Worm', 'かわら虫', '기와 벌레'],
    'rp.m.smoke': ['窯煙精', 'Smoke Sprite', '窯煙の精', '가마 연기 정령'],
    'rp.m.bat': ['釉彩蝙蝠', 'Glaze Bat', '釉彩こうもり', '유약 박쥐'],
    'rp.m.golem': ['陶土巨人', 'Clay Golem', '陶土の巨人', '도토 거인'],
    'rp.m.fox': ['灰燼狐', 'Ash Fox', '灰燼ぎつね', '잿불 여우'],
    'rp.m.snake': ['裂紋蛇', 'Crackle Snake', '貫入へび', '빙렬 뱀'],
    'rp.m.flame': ['火舌守衛', 'Flame Warden', '炎の番人', '불꽃 파수꾼'],
    'rp.m.shade': ['窯變幽影', 'Kiln Shade', '窯変の影', '요변 그림자'],
    'rp.m.king': ['窯爐之王', 'Kiln King', '窯の王', '가마의 왕'],
    'rp.next': ['{0} 秒後送 {1} 行', '{1} lines in {0}s', '{0}秒後に{1}ライン', '{0}초 후 {1}줄'],
    'rp.skill': ['技能', 'Skill', 'スキル', '스킬'],
    'rp.skillGo': ['放技能（{0}）', 'Use skill ({0})', 'スキル（{0}）', '스킬 사용({0})'],
    'rp.skillWait': ['技能 {0}／{1} 行', 'Skill {0}/{1} lines', 'スキル {0}/{1}', '스킬 {0}/{1}줄'],
    'rp.s.tank': ['窯牆！8 秒內擋下攻擊', 'Kiln Wall! Attacks blocked for 8s', '窯の壁！8秒間防御', '가마 벽! 8초간 방어'],
    'rp.s.rogue': ['暗刃！', 'Hidden Blade!', '暗刃！', '암인!'],
    'rp.s.mage': ['淨化！', 'Cleanse!', '浄化！', '정화!'],
    'rp.rage': ['窯爐之王發怒了！攻擊變快變重', 'The Kiln King is enraged! Faster, heavier attacks', '窯の王が怒った！攻撃が速く重く', '가마의 왕이 분노! 공격이 빠르고 무거워져요'],
    'rp.hit': ['-{0}', '-{0}', '-{0}', '-{0}'],
    'rp.win': ['打倒了！', 'Defeated!', '撃破！', '처치!'],
    'rp.winP': ['用了 {0} 塊，拿到 {1} 金幣', '{0} pieces · {1} coins', '{0}個使用・{1}コイン', '{0}개 사용 · {1}코인'],
    'rp.drop': ['找到裝備：{0}！', 'Gear found: {0}!', '装備を入手：{0}！', '장비 획득: {0}!'],
    'rp.clear': ['第一章完成！窯爐之王倒下了。', 'Chapter 1 complete! The Kiln King has fallen.', '第1章クリア！窯の王を倒しました。', '1장 클리어! 가마의 왕을 쓰러뜨렸어요.'],
    'rp.lose': ['被打倒了', 'Knocked out', 'やられた', '쓰러졌어요'],
    'rp.loseP': ['怪物還剩 {0} 血。換個職業、強化裝備再來。', 'The monster has {0} HP left. Try another class or upgrade your gear.', '魔物の残りHP {0}。職業や装備を見直してもう一度。', '몬스터 HP {0} 남음. 직업을 바꾸거나 장비를 강화해 다시.'],
    'rp.again': ['再打一次', 'Fight again', 'もう一度', '다시 싸우기'],
    'rp.nextSt': ['下一關', 'Next stage', '次へ', '다음 단계'],
    'rp.map': ['回冒險地圖', 'Back to the map', '冒険マップへ', '모험 지도로'],
    'rp.fight': ['開打', 'Fight', '戦う', '싸우기'],
    'rp.repeat': ['打過的關再打只拿 {0} 金幣。', 'Stages already beaten pay {0} coins.', 'クリア済みは{0}コイン。', '클리어한 단계는 {0}코인.']
  });

  var GEAR = { w: 3, a: 6, c: 9 };     // which stage drops each piece
  function gearLine(slot) {
    var lv = Meta.data.rpg.gear[slot], name = t('rp.g.' + slot);
    if (!lv) return '<li><b>' + esc(name) + '</b><span>' + esc(t('rp.g.none', GEAR[slot])) + '</span></li>';
    var eff = slot === 'w' ? t('rp.g.wP', lv * 10) : slot === 'a' ? t('rp.g.aP', lv >= 5 ? 2 : lv >= 2 ? 1 : 0) : t('rp.g.cP', lv);
    var up = lv >= RPG.GEAR_MAX ? '<em>' + t('rp.max') + '</em>' : '<button type="button" class="btn sm" data-rpup="' + slot + '"' + (Meta.data.coins < RPG.upCost(lv) ? ' disabled' : '') + '>' + esc(t('rp.up', RPG.upCost(lv))) + '</button>';
    return '<li><b>' + esc(name) + ' · ' + esc(t('rp.lv', lv)) + '</b><span>' + esc(eff) + '</span>' + up + '</li>';
  }

  // ---------- the map ----------
  App.go.rpg = function () { App.openSheet('rpg'); };
  App.sheets.rpg = function () {
    var r = Meta.data.rpg, h = '<h2>' + t('rp.title') + '</h2><p class="lede">' + t('rp.ch1') + '</p><p class="note">' + t('rp.intro') + '</p>';
    h += '<h3>' + t('rp.cls') + '</h3><div class="rp-cls" role="radiogroup" aria-label="' + esc(t('rp.cls')) + '">';
    RPG.CLASSES.forEach(function (c) { h += '<button type="button" role="radio" aria-checked="' + (r.cls === c) + '" data-rpcls="' + c + '"><b>' + t('rp.c.' + c) + '</b><span>' + t('rp.c.' + c + 'P') + '</span></button>'; });
    h += '</div><h3>' + t('rp.gear') + '</h3><ul class="rp-gear">' + gearLine('w') + gearLine('a') + gearLine('c') + '</ul>';
    h += '<h3>' + t('rp.stages') + '</h3><ol class="rp-map">';
    RPG.STAGES.forEach(function (st, i) {
      var n = i + 1, open = n <= r.best + 1, done = n <= r.best;
      h += '<li><button type="button" data-rpgo="' + n + '"' + (open ? '' : ' disabled') + ' class="' + (done ? 'done' : '') + (st.boss ? ' boss' : '') + '"><i aria-hidden="true">' + st.e + '</i><b>' + esc(t('rp.st', n)) + ' · ' + esc(t('rp.m.' + st.id)) + (st.boss ? ' <small>' + t('rp.boss') + '</small>' : '') +
        '</b><span>' + esc(open ? t('rp.hp', st.hp) : t('rp.locked')) + (done ? ' ✓' : '') + '</span></button></li>';
    });
    return h + '</ol><p class="note">' + t('rp.repeat', RPG.reward(1, false)) + '</p><div class="row">' + btn('close', 'close', true) + '</div>';
  };
  App.clicks.push(function (d) {
    if (d.rpcls) { if (Meta.rpgClass(d.rpcls).ok) App.openSheet('rpg'); return true; }
    if (d.rpup) {
      var r = Meta.rpgUp(d.rpup);
      if (r.ok) { App.sfx.play('buy'); App.toast(t('rp.upDone', t('rp.g.' + d.rpup), r.lv)); } else if (r.why === 'coins') App.toast(t('rp.noCoins'));
      App.openSheet('rpg'); return true;
    }
    if (d.rpgo != null) { var n = +d.rpgo; if (n >= 1 && n <= Meta.data.rpg.best + 1 && n <= RPG.STAGES.length) App.begin('rpg', { stage: n }); return true; }
    return false;
  });

  // ---------- a fight ----------
  var K = App.kinds.rpg = {
    strip: true,
    begin: function (S, o) {
      var st = RPG.STAGES[o.stage - 1], r = Meta.data.rpg;
      S.rpg = { n: o.stage, st: st, hp: st.hp, max: st.hp, t: st.every, every: st.every, lines: st.lines, cls: r.cls, gear: { w: r.gear.w, a: r.gear.a, c: r.gear.c },
        charge: 0, need: RPG.gauge(r.cls, r.gear.c), boosted: false, rage: false, pieces: 0, last: 0, lastT: 0 };
      S.me = new ZZ.Game({ seed: S.seed, lockDelay: App.set.lock, sdf: App.sdfVal() });
      S.state = 'play';
    },
    started: function () { App.S().me.start(); draw(); },
    hud: function () {
      var S = App.S(), R = S.rpg, el = App.el;
      el.hudL.innerHTML = '<span class="who">' + esc(t('rp.c.' + R.cls)) + '</span>';
      el.hudC.innerHTML = '<div class="hud-title">' + esc(t('rp.st', R.n) + ' · ' + t('rp.m.' + R.st.id)) + '</div>';
      el.hudR.innerHTML = '<div class="stat"><b id="rpHp">' + R.hp + '</b><span>HP</span></div>';
    },
    update: function () { var S = App.S(); App.txt('rpHp', String(Math.max(0, S.rpg.hp))); draw(); },
    tools: function () { return App.tool('restart', 'restart'); },
    tick: function (dt) {
      var S = App.S(), R = S.rpg;
      if (S.state !== 'play') return;
      R.t -= dt;
      if (R.t <= 0) {
        R.t += R.every;
        var n = RPG.incoming(R.lines + (R.rage ? 1 : 0), R.cls, R.gear.a);
        if (n > 0) S.me.receive(n);
      }
    },
    lock: function (e) {
      var S = App.S(), R = S.rpg;
      if (S.state !== 'play') return;
      R.pieces++;
      var lines = Math.max(0, Math.min(4, e.lines | 0));
      if (!lines) return;
      R.charge = Math.min(R.need, R.charge + lines);
      var dmg = RPG.damage(e, R.cls, R.gear.w, R.boosted);
      if (R.boosted) R.boosted = false;
      hurt(dmg);
    },
    topout: function () { K.lose(); },
    empty: function () { /* the queue never runs out */ },
    restart: function () { var S = App.S(); App.begin('rpg', S.o); },
    item: function () { K.skill(); },
    skill: function () {
      var S = App.S(), R = S && S.rpg;
      if (!R || S.state !== 'play' || R.charge < R.need) return;
      R.charge = 0;
      App.sfx.play('itemUse');
      if (R.cls === 'tank') { S.me.shield = 8000; App.toast(t('rp.s.tank'), 1600); }
      else if (R.cls === 'rogue') { R.boosted = true; App.toast(t('rp.s.rogue'), 1200); hurt(12); }
      else { S.me.chisel(4); App.toast(t('rp.s.mage'), 1200); }
      draw();
    },
    win: function () {
      var S = App.S(), R = S.rpg;
      S.state = 'wait'; S.wait = 1300; S.target = null;
      App.sfx.play('win'); App.buzz([20, 40, 60]); App.banner(t('rp.win'), 'good', 1200);
      S.res = Meta.rpgClear(R.n, Math.max(3, R.pieces), R.cls);
      S.after = function () { App.openSheet('rpgWin'); };
    },
    lose: function () {
      var S = App.S();
      if (S.state !== 'play') return;
      S.state = 'wait'; S.wait = 900; S.target = null;
      App.sfx.play('lose');
      S.after = function () { App.openSheet('rpgLose'); };
    }
  };
  function hurt(dmg) {
    var S = App.S(), R = S.rpg;
    if (!dmg || S.state !== 'play') return;
    R.hp = Math.max(0, R.hp - dmg); R.last = dmg; R.lastT = Date.now();
    App.sfx.play('ko');
    // the boss at half its hit points: angrier
    if (R.st.boss && !R.rage && R.hp * 2 <= R.max) { R.rage = true; R.every = Math.round(R.every * 0.6); R.t = Math.min(R.t, R.every); App.banner(t('rp.rage'), 'bad', 1600); }
    if (R.hp <= 0) K.win();
    draw();
  }
  var stripKey = '';
  function draw() {
    var S = App.S(), R = S && S.rpg;
    if (!R) return;
    var sec = Math.ceil(Math.max(0, R.t) / 1000), n = RPG.incoming(R.lines + (R.rage ? 1 : 0), R.cls, R.gear.a), ready = R.charge >= R.need, fresh = Date.now() - R.lastT < 700;
    var key = [R.hp, sec, n, R.charge, R.need, fresh, R.rage, L.lang].join('|');
    if (key === stripKey) return;
    stripKey = key;
    App.el.strip.innerHTML = '<div class="rp-foe' + (R.rage ? ' rage' : '') + '"><i aria-hidden="true">' + R.st.e + '</i><div><b>' + esc(t('rp.m.' + R.st.id)) + (fresh ? ' <em class="rp-hit">' + esc(t('rp.hit', R.last)) + '</em>' : '') + '</b>' +
      '<span class="rp-bar"><i style="width:' + (R.hp / R.max * 100) + '%"></i></span><small>' + esc(t('rp.hp', R.hp + '／' + R.max)) + '　' + esc(t('rp.next', sec, n)) + '</small></div></div>' +
      '<div class="rp-skill"><span class="rp-bar sk"><i style="width:' + (R.charge / R.need * 100) + '%"></i></span><button type="button" class="btn sm" data-do="rpSkill"' + (ready ? '' : ' disabled') + '>' + esc(ready ? t('rp.skillGo', App.key1('ITEM')) : t('rp.skillWait', R.charge, R.need)) + '</button></div>';
  }
  App.acts.rpSkill = function () { K.skill(); };

  // ---------- after a fight ----------
  App.sheets.rpgWin = function () {
    var S = App.S(), r = S.res || {}, R = S.rpg, last = R.n >= RPG.STAGES.length;
    var h = '<h2 class="verdict win">' + t('rp.win') + '</h2><p>' + esc(t('rp.winP', R.pieces, r.coins || 0)) + '</p>';
    if (r.drop) h += '<p><b>' + esc(t('rp.drop', t('rp.g.' + r.drop))) + '</b></p>';
    if (last && r.first) h += '<p><b>' + t('rp.clear') + '</b></p>';
    return h + '<div class="row">' + (last ? '' : btn('rpNext', 'rp.nextSt', true)) + btn('again', 'rp.again', last) + btn('rpMap', 'rp.map') + '</div>';
  };
  App.sheets.rpgLose = function () {
    var S = App.S();
    return '<h2 class="verdict lose">' + t('rp.lose') + '</h2><p>' + esc(t('rp.loseP', S.rpg.hp)) + '</p><div class="row">' + btn('again', 'rp.again', true) + btn('rpMap', 'rp.map') + '</div>';
  };
  App.acts.rpNext = function () { var S = App.S(); App.begin('rpg', { stage: S.rpg.n + 1 }); };
  App.acts.rpMap = function () { App.toMenu(); App.openSheet('rpg'); };
})();
