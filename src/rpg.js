/* 轉磚 磚之冒險 第一章：迷霧森林 (adventure, chapter 1): one player against a monster. Lines you clear and cement you send
   hurt it; it sends cement on a clock. Three classes, each with its own three pieces of gear
   (opened by stages 3, 6 and 9, made stronger with coins), and a skill charged by cleared lines. Rules and rewards are in meta.js (Meta.RPG), the same on the server. Single
   player only: nothing here touches ranked play or online rooms. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t, Meta = ZZ.Meta, esc = App.esc, btn = App.btn, RPG = Meta.RPG;

  L.add({
    'rp.title': ['磚之冒險', 'Brick Quest', 'ブロック冒険', '블록 모험'],
    'rp.menuS': ['第一章：迷霧森林。打倒 10 隻怪物，最後是黑龍', 'Chapter 1: the Misty Forest. Ten monsters, then the Black Dragon', '第1章：霧の森。10体の魔物と黒竜', '1장: 안개 숲. 몬스터 10마리, 마지막은 흑룡'],
    'rp.ch1': ['第一章：迷霧森林', 'Chapter 1: the Misty Forest', '第1章：霧の森', '1장: 안개 숲'],
    'rp.intro': ['消行和送出的攻擊都會打怪物的血；怪物也會定時送水泥給你。被擊倒就輸了。', 'Lines you clear and cement you send hurt the monster; it sends cement at you on a clock. Topping out loses.', 'ライン消しと攻撃で魔物にダメージ。魔物も定期的にセメントを送ってきます。トップアウトで負け。', '줄을 지우고 공격을 보내면 몬스터가 다쳐요. 몬스터도 주기적으로 시멘트를 보내요. 꼭대기에 닿으면 패배.'],
    'rp.cls': ['職業', 'Class', '職業', '직업'],
    'rp.c.tank': ['騎士', 'Knight', '騎士', '기사'],
    'rp.c.tankP': ['怪物每次攻擊少 1 行。技能「鐵壁」：一段時間內擋下所有攻擊。消 10 行充滿。', 'Every monster attack lands one line fewer. Skill "Iron Wall": block every attack for a while. Fills after 10 lines.', '魔物の攻撃が毎回1ライン減る。スキル「鉄壁」：しばらく全攻撃を防ぐ。10ラインでたまる。', '몬스터 공격이 매번 1줄 줄어요. 스킬 「철벽」: 잠시 모든 공격 차단. 10줄이면 충전.'],
    'rp.c.rogue': ['刺客', 'Rogue', '暗殺者', '자객'],
    'rp.c.rogueP': ['T 轉造成的傷害加倍。技能「暗殺」：馬上造成傷害，下一次消行傷害也加倍。消 8 行充滿。', 'T-spins do double damage. Skill "Assassinate": damage at once, and your next clear does double. Fills after 8 lines.', 'Tスピンのダメージ2倍。スキル「暗殺」：即ダメージ、次のライン消しも2倍。8ラインでたまる。', 'T스핀 피해 2배. 스킬 「암살」: 즉시 피해, 다음 줄 지우기도 2배. 8줄이면 충전.'],
    'rp.c.mage': ['法師', 'Mage', '魔法使い', '마법사'],
    'rp.c.mageP': ['技能充得最快（6 行就滿）。技能「淨化」：清掉牆底 4 排。', 'The skill fills fastest (6 lines). Skill "Purify": remove the bottom 4 rows of your wall.', 'スキルが一番早くたまる（6ライン）。スキル「浄化」：壁の下4段を消す。', '스킬이 가장 빨리 차요(6줄). 스킬 「정화」: 벽 아래 4줄 제거.'],
    'rp.gear': ['{0}的裝備', '{0} gear', '{0}の装備', '{0} 장비'],
    'rp.gearP': ['每個職業有自己的裝備。第 3、6、9 關第一次打倒時，三個職業的那一格會一起解鎖；強化各自算。', 'Each class has its own gear. Beating stage 3, 6 or 9 for the first time opens that slot for all three classes; upgrades are per class.', '職業ごとに装備があります。ステージ3・6・9の初クリアで3職業の同じ枠が開き、強化は職業ごと。', '직업마다 장비가 따로 있어요. 3·6·9단계 첫 클리어 때 세 직업의 그 칸이 함께 열리고, 강화는 직업별로.'],
    'rp.g.sword': ['騎士長劍', 'Knight\'s Sword', '騎士の剣', '기사의 장검'],
    'rp.g.swordP': ['所有傷害 +{0}%', 'All damage +{0}%', '全ダメージ +{0}%', '모든 피해 +{0}%'],
    'rp.g.shield': ['鐵盾', 'Iron Shield', '鉄の盾', '철 방패'],
    'rp.g.amulet': ['守護項鍊', 'Guardian Amulet', '守護の首飾り', '수호 목걸이'],
    'rp.g.amuletP': ['「鐵壁」撐 {0} 秒', '"Iron Wall" lasts {0}s', '「鉄壁」が{0}秒', '「철벽」 {0}초'],
    'rp.g.daggers': ['雙匕首', 'Twin Daggers', '双短剣', '쌍단검'],
    'rp.g.daggersP': ['T 轉傷害 +{0}%，其他 +{1}%', 'T-spin damage +{0}%, other clears +{1}%', 'Tスピン +{0}%、その他 +{1}%', 'T스핀 피해 +{0}%, 그 외 +{1}%'],
    'rp.g.leather': ['皮甲', 'Leather Armour', '革鎧', '가죽 갑옷'],
    'rp.g.cloak': ['影之斗篷', 'Shadow Cloak', '影の外套', '그림자 망토'],
    'rp.g.cloakP': ['「暗殺」造成 {0} 點傷害', '"Assassinate" does {0} damage', '「暗殺」{0}ダメージ', '「암살」 {0} 피해'],
    'rp.g.staff': ['法杖', 'Staff', '魔法の杖', '지팡이'],
    'rp.g.staffP': ['四行消傷害 +{0}%，其他 +{1}%', 'Four-line clears +{0}%, other clears +{1}%', '4ライン消し +{0}%、その他 +{1}%', '4줄 지우기 +{0}%, 그 외 +{1}%'],
    'rp.g.robe': ['法袍', 'Robe', 'ローブ', '로브'],
    'rp.g.orb': ['魔力寶珠', 'Mana Orb', '魔力の宝珠', '마력 구슬'],
    'rp.g.orbP': ['技能 {0} 行就充滿', 'Skill fills after {0} lines', 'スキルが{0}ラインでたまる', '스킬이 {0}줄이면 충전'],
    'rp.g.armorP': ['怪物每次攻擊少 {0} 行', 'Monster attacks land {0} fewer lines', '魔物の攻撃が{0}ライン減る', '몬스터 공격이 {0}줄 줄어요'],
    'rp.g.none': ['還沒解鎖（打倒第 {0} 關）', 'Locked (beat stage {0})', '未解放（ステージ{0}をクリア）', '잠김({0}단계 클리어)'],
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
    'rp.m.slime': ['史萊姆', 'Slime', 'スライム', '슬라임'],
    'rp.m.goblin': ['哥布林', 'Goblin', 'ゴブリン', '고블린'],
    'rp.m.shroom': ['毒菇怪', 'Toadstool', '毒キノコ', '독버섯'],
    'rp.m.bat': ['吸血蝙蝠', 'Vampire Bat', '吸血コウモリ', '흡혈 박쥐'],
    'rp.m.wolf': ['灰狼', 'Grey Wolf', '灰色オオカミ', '회색 늑대'],
    'rp.m.treant': ['樹人', 'Treant', 'トレント', '트렌트'],
    'rp.m.snake': ['毒蛇', 'Viper', '毒ヘビ', '독사'],
    'rp.m.flower': ['食人花', 'Man-eating Flower', '人食い花', '식인화'],
    'rp.m.ghost': ['森林幽靈', 'Forest Ghost', '森の亡霊', '숲의 유령'],
    'rp.m.dragon': ['黑龍', 'Black Dragon', '黒竜', '흑룡'],
    'rp.next': ['{0} 秒後送 {1} 行', '{1} lines in {0}s', '{0}秒後に{1}ライン', '{0}초 후 {1}줄'],
    'rp.skillGo': ['放技能（{0}）', 'Use skill ({0})', 'スキル（{0}）', '스킬 사용({0})'],
    'rp.skillWait': ['技能 {0}／{1} 行', 'Skill {0}/{1} lines', 'スキル {0}/{1}', '스킬 {0}/{1}줄'],
    'rp.s.tank': ['鐵壁！{0} 秒內擋下攻擊', 'Iron Wall! Attacks blocked for {0}s', '鉄壁！{0}秒間防御', '철벽! {0}초간 방어'],
    'rp.s.rogue': ['暗殺！', 'Assassinate!', '暗殺！', '암살!'],
    'rp.s.mage': ['淨化！', 'Purify!', '浄化！', '정화!'],
    'rp.rage': ['黑龍發怒了！攻擊變快變重', 'The Black Dragon is enraged! Faster, heavier attacks', '黒竜が怒った！攻撃が速く重く', '흑룡이 분노! 공격이 빠르고 무거워져요'],
    'rp.hit': ['-{0}', '-{0}', '-{0}', '-{0}'],
    'rp.win': ['打倒了！', 'Defeated!', '撃破！', '처치!'],
    'rp.winP': ['用了 {0} 塊，拿到 {1} 金幣', '{0} pieces · {1} coins', '{0}個使用・{1}コイン', '{0}개 사용 · {1}코인'],
    'rp.winNoPay': ['用了 {0} 塊。冒險關卡目前沒辦法驗證，所以不發金幣；進度和裝備照算。', '{0} pieces. Adventure stages cannot be checked yet, so they pay no coins; progress and gear still count.', '{0}個使用。冒険ステージはまだ検証できないため、コインは付きません。進行と装備は記録されます。', '{0}개 사용. 모험 스테이지는 아직 확인할 수 없어서 코인은 없어요. 진행과 장비는 그대로예요.'],
    'rp.drop': ['解鎖新裝備：{0}！三個職業都拿到了這一格。', 'New gear unlocked: {0}! All three classes get this slot.', '新装備を解放：{0}！3職業とも使えます。', '새 장비 해제: {0}! 세 직업 모두 이 칸을 얻었어요.'],
    'rp.clear': ['第一章完成！黑龍倒下了。', 'Chapter 1 complete! The Black Dragon has fallen.', '第1章クリア！黒竜を倒しました。', '1장 클리어! 흑룡을 쓰러뜨렸어요.'],
    'rp.lose': ['被打倒了', 'Knocked out', 'やられた', '쓰러졌어요'],
    'rp.loseP': ['怪物還剩 {0} 血。換個職業、強化裝備再來。', 'The monster has {0} HP left. Try another class or upgrade your gear.', '魔物の残りHP {0}。職業や装備を見直してもう一度。', '몬스터 HP {0} 남음. 직업을 바꾸거나 장비를 강화해 다시.'],
    'rp.again': ['再打一次', 'Fight again', 'もう一度', '다시 싸우기'],
    'rp.nextSt': ['下一關', 'Next stage', '次へ', '다음 단계'],
    'rp.map': ['回冒險地圖', 'Back to the map', '冒険マップへ', '모험 지도로'],
    'rp.repeat': ['打過的關再打只拿 {0} 金幣。', 'Stages already beaten pay {0} coins.', 'クリア済みは{0}コイン。', '클리어한 단계는 {0}코인.']
  });


  var OPENS = { w: 3, a: 6, c: 9 };     // which stage opens each slot
  function gearEffect(cls, slot, lv, g) {
    var id = RPG.GEAR[cls][slot];
    if (slot === 'a') return t('rp.g.armorP', RPG.ARMOR[cls][lv] + (cls === 'tank' ? 1 : 0));
    if (id === 'sword') return t('rp.g.swordP', lv * 10);
    if (id === 'daggers') return t('rp.g.daggersP', lv * 25, lv * 5);
    if (id === 'staff') return t('rp.g.staffP', lv * 25, lv * 5);
    if (id === 'amulet') return t('rp.g.amuletP', RPG.shieldMs({ c: lv }) / 1000);
    if (id === 'cloak') return t('rp.g.cloakP', RPG.bladeDmg({ c: lv }));
    return t('rp.g.orbP', RPG.gauge('mage', { c: lv }));
  }
  function gearLine(cls, slot) {
    var lv = Meta.rpgGear(cls)[slot], name = t('rp.g.' + RPG.GEAR[cls][slot]);
    if (!lv) return '<li class="off"><b>' + esc(name) + '</b><span>' + esc(t('rp.g.none', OPENS[slot])) + '</span></li>';
    var up = lv >= RPG.GEAR_MAX ? '<em>' + t('rp.max') + '</em>' : '<button type="button" class="btn sm" data-rpup="' + slot + '"' + (Meta.data.coins < RPG.upCost(lv) ? ' disabled' : '') + '>' + esc(t('rp.up', RPG.upCost(lv))) + '</button>';
    return '<li><b>' + esc(name) + ' · ' + esc(t('rp.lv', lv)) + '</b><span>' + esc(gearEffect(cls, slot, lv)) + '</span>' + up + '</li>';
  }

  // ---------- the map ----------
  App.go.rpg = function () { App.openSheet('rpg'); };
  App.sheets.rpg = function () {
    var r = Meta.data.rpg, h = '<h2>' + t('rp.title') + '</h2><p class="lede">' + t('rp.ch1') + '</p><p class="note">' + t('rp.intro') + '</p>';
    h += '<h3>' + t('rp.cls') + '</h3><div class="rp-cls" role="radiogroup" aria-label="' + esc(t('rp.cls')) + '">';
    RPG.CLASSES.forEach(function (c) { h += '<button type="button" role="radio" aria-checked="' + (r.cls === c) + '" data-rpcls="' + c + '"><b>' + t('rp.c.' + c) + '</b><span>' + t('rp.c.' + c + 'P') + '</span></button>'; });
    h += '</div><h3>' + esc(t('rp.gear', t('rp.c.' + r.cls))) + '</h3><p class="note">' + t('rp.gearP') + '</p><ul class="rp-gear">' + gearLine(r.cls, 'w') + gearLine(r.cls, 'a') + gearLine(r.cls, 'c') + '</ul>';
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
      var cls = Meta.data.rpg.cls, r = Meta.rpgUp(cls, d.rpup);
      if (r.ok) { App.sfx.play('buy'); App.toast(t('rp.upDone', t('rp.g.' + RPG.GEAR[cls][d.rpup]), r.lv)); } else if (r.why === 'coins') App.toast(t('rp.noCoins'));
      App.openSheet('rpg'); return true;
    }
    if (d.rpgo != null) { var n = +d.rpgo; if (n >= 1 && n <= Meta.data.rpg.best + 1 && n <= RPG.STAGES.length) App.begin('rpg', { stage: n }); return true; }
    return false;
  });

  // ---------- a fight ----------
  var K = App.kinds.rpg = {
    strip: true,
    begin: function (S, o) {
      var st = RPG.STAGES[o.stage - 1], r = Meta.data.rpg, g = Meta.rpgGear(r.cls);
      S.rpg = { n: o.stage, st: st, hp: st.hp, max: st.hp, t: st.every, every: st.every, lines: st.lines, cls: r.cls, gear: { w: g.w, a: g.a, c: g.c },
        charge: 0, need: RPG.gauge(r.cls, g), boosted: false, rage: false, pieces: 0, last: 0, lastT: 0 };
      S.me = new ZZ.Game({ seed: S.seed, lockDelay: App.set.lock, sdf: App.sdfVal() });
      S.state = 'play';
    },
    started: function () { var S = App.S(); S.at0 = Date.now(); S.me.start(); draw(); },
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
      var dmg = RPG.damage(e, R.cls, R.gear, R.boosted);
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
      if (R.cls === 'tank') { S.me.shield = RPG.shieldMs(R.gear); App.toast(t('rp.s.tank', S.me.shield / 1000), 1600); }
      else if (R.cls === 'rogue') { R.boosted = true; App.toast(t('rp.s.rogue'), 1200); hurt(RPG.bladeDmg(R.gear)); }
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
      // a stage lost: nothing changes, but it is a game played (the console's play counts)
      if (Meta.played) Meta.played('rpg', 'lose', S.at0 ? Date.now() - S.at0 : 0, -1);
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
    var h = '<h2 class="verdict win">' + t('rp.win') + '</h2><p>' + esc(r.coins ? t('rp.winP', R.pieces, r.coins) : t('rp.winNoPay', R.pieces)) + '</p>';
    if (r.drop) h += '<p><b>' + esc(t('rp.drop', t('rp.g.' + RPG.GEAR[R.cls][r.drop]))) + '</b></p>';
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
