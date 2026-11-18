/* 轉磚 app: screens, modes, input, items, HUD. */
(function () {
  'use strict';
  var ZZ = window.ZZ, Bot = ZZ.Bot, View = ZZ.View, env = View.env, ITEMS = ZZ.ITEMS;
  var COLS = ZZ.COLS, ROWS = ZZ.ROWS, VIS = ZZ.VIS, SHAPES = ZZ.SHAPES, DRILLS = ZZ.DRILLS;
  var SKY = 1.25;
  var $ = function (id) { return document.getElementById(id); };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- settings and saved progress ----------
  var DEF = {
    das: 140, arr: 20, sdf: 80, lock: 500, smooth: !env.reduce, ghost: true, radar: false, hint: true,
    vol: 60, mvol: 45, real: true, haptic: true, swap: false, half: false, pad: 1
  };
  var set = {}, save = { best: 0, dojo: 0, level: 1, minutes: 2, tip: 0, items: 1, itip: 0 };
  var STORE = 'zhuanzhuan.v2';
  function loadStore() {
    var k;
    for (k in DEF) set[k] = DEF[k];
    try {
      var raw = window.localStorage.getItem(STORE);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && d.set) for (k in DEF) if (typeof d.set[k] === typeof DEF[k]) set[k] = d.set[k];
      if (d && d.save) for (k in save) if (typeof d.save[k] === 'number') save[k] = d.save[k];
    } catch (e) { /* defaults are fine */ }
  }
  function saveStore() {
    try { window.localStorage.setItem(STORE, JSON.stringify({ set: set, save: save })); } catch (e) { /* not kept this time */ }
  }
  function sdfVal() { return set.sdf >= 125 ? Infinity : set.sdf; }

  var el = {}, V = { me: null, opp: null, hero: null };
  var S = null, screen = 'menu', sheetName = '', sheetBack = '', last = 0;
  var sfx = new View.Sound(function () { return set; });
  function buzz(p) {
    if (!set.haptic || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch (e) { /* no haptics here */ }
  }

  function fmtClock(ms) { var s = Math.ceil(Math.max(0, ms) / 1000); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function fmtTime(ms) {
    var cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  function itemsOn() { return !!S && S.kind === 'battle' && !!S.o.items; }

  // ---------- input: delayed auto shift ----------
  var input = {
    l: false, r: false, sd: false, dir: 0, das: 0, arr: 0,
    clear: function () { this.l = this.r = this.sd = false; this.dir = 0; this.das = this.arr = 0; if (S && S.me) S.me.soft = false; },
    can: function () { return !!S && S.state === 'play' && !!S.me.cur && !S.me.over && !(S.freeze && S.freeze.me > 0); },
    side: function (d, down) {
      if (d < 0) this.l = down; else this.r = down;
      if (down) {
        this.dir = d; this.das = 0; this.arr = 0;
        if (this.can()) S.me.move(d);
      } else if (this.dir === d) {
        this.dir = this.l ? -1 : this.r ? 1 : 0;
        this.das = 0; this.arr = 0;
      }
    },
    update: function (dt) {
      if (!this.can()) return;
      S.me.soft = this.sd;
      if (!this.dir) return;
      var before = this.das;
      this.das += dt;
      if (this.das < set.das) return;
      if (set.arr <= 0) { while (S.me.move(this.dir)) { /* slide to the wall */ } return; }
      this.arr += before >= set.das ? dt : this.das - set.das;
      while (this.arr >= set.arr) {
        this.arr -= set.arr;
        if (!S.me.move(this.dir)) { this.arr = set.arr; break; }
      }
    }
  };

  function act(k, down) {
    if (k === 'L') return input.side(-1, down);
    if (k === 'R') return input.side(1, down);
    if (k === 'D') { input.sd = down; return; }
    if (!down) return;
    if (k === 'ITEM') { useItem('me'); return; }
    if (!input.can()) return;
    var me = S.me;
    if (k === 'HD') { if (performance.now() >= (S.guard || 0)) me.hardDrop(); }
    else if (k === 'CW') me.rotate(1);
    else if (k === 'CCW') me.rotate(-1);
    else if (k === '180') me.rotate(2);
    else if (k === 'HOLD' && S.kind !== 'dojo') me.hold();
  }

  // Arrow keys and WASD both move; the turn keys sit under either hand.
  var KEYS = {
    ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'D', ArrowUp: 'CW', Space: 'HD',
    KeyA: 'L', KeyD: 'R', KeyS: 'D', KeyW: 'CW',
    KeyX: 'CW', KeyK: 'CW', KeyZ: 'CCW', KeyJ: 'CCW', ControlLeft: 'CCW', ControlRight: 'CCW',
    KeyQ: '180', KeyL: '180',
    KeyC: 'HOLD', KeyE: 'HOLD', ShiftLeft: 'HOLD', ShiftRight: 'HOLD',
    KeyF: 'ITEM', KeyV: 'ITEM', Enter: 'ITEM'
  };

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      sfx.wake();
      if (sheetName) {
        if (e.code === 'Escape') { e.preventDefault(); sheetDo(sheetName === 'pause' ? 'resume' : 'close'); }
        return;
      }
      if (screen !== 'play') return;
      var k = KEYS[e.code];
      if (k) { e.preventDefault(); if (!e.repeat) act(k, true); return; }
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') pause();
      else if (e.code === 'KeyR') restart();
      else if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
    });
    window.addEventListener('keyup', function (e) { var k = KEYS[e.code]; if (k) act(k, false); });
    window.addEventListener('blur', function () { input.clear(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { input.clear(); pause(); }
      sfx.hush(document.hidden);
    });

    // Touch keys. A thumb can slide between left and right without lifting; every other key needs its own tap,
    // and a key stays down until the finger lifts even if it drifts off the edge.
    var pad = el.pad, ptrs = {}, SLIDE = { L: 1, R: 1 };
    function keyAt(x, y) {
      var e = document.elementFromPoint(x, y);
      e = e && e.closest ? e.closest('.key') : null;
      return e && pad.contains(e) ? e : null;
    }
    function press(k) { k.classList.add('on'); act(k.dataset.k, true); buzz(7); }
    function lift(k) { k.classList.remove('on'); act(k.dataset.k, false); }
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      sfx.wake();
      var k = keyAt(e.clientX, e.clientY);
      if (!k) return;
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      ptrs[e.pointerId] = k;
      press(k);
    });
    pad.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in ptrs)) return;
      var cur = ptrs[e.pointerId], k = keyAt(e.clientX, e.clientY);
      if (!cur || !k || k === cur || !SLIDE[cur.dataset.k] || !SLIDE[k.dataset.k]) return;
      lift(cur);
      ptrs[e.pointerId] = k;
      press(k);
    });
    function end(e) {
      var cur = ptrs[e.pointerId];
      if (cur) lift(cur);
      delete ptrs[e.pointerId];
      sfx.wake();
    }
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    pad.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    el.play.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.holdBox.addEventListener('click', function () { sfx.wake(); act('HOLD', true); });
    el.itemBox.addEventListener('click', function () { sfx.wake(); act('ITEM', true); });
    el.pauseBtn.addEventListener('click', function () { sfx.wake(); sfx.play('ui'); pause(); });
    el.tools.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      sfx.wake();
      var a = b.dataset.act;
      if (a === 'undo') undo();
      else if (a === 'restart') { sfx.play('ui'); restart(); }
      else if (a === 'demo') { sfx.play('ui'); startDemo(); }
      else if (a === 'hint') { sfx.play('ui'); set.hint = !set.hint; saveStore(); setTools(); if (S && S.kind === 'dojo' && S.state === 'play') onSpawn({}); }
    });
  }

  // ---------- small UI helpers ----------
  function show(name) {
    screen = name;
    el.menu.hidden = name !== 'menu';
    el.play.hidden = name !== 'play';
    if (name === 'menu') { updateMenu(); heroLayout(); sfx.setDuck(1); sfx.music('menu'); }
  }
  var toastT = 0;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.toast.hidden = true; }, ms || 2200);
  }
  var bannerT = 0;
  function banner(text, cls, ms) {
    el.banner.className = cls || '';
    el.banner.innerHTML = text ? '<span>' + esc(text) + '</span>' : '';
    clearTimeout(bannerT);
    if (text && ms) bannerT = setTimeout(function () { el.banner.innerHTML = ''; }, ms);
  }
  function popRaw(main, tags, atk, gold) {
    var d = document.createElement('div');
    d.className = 'pop' + (gold ? ' gold' : '');
    var h = '';
    if (main) h += '<span class="m">' + esc(main) + '</span>';
    if (tags && tags.length) h += '<span class="s">' + esc(tags.join('　')) + '</span>';
    if (atk) h += '<span class="a">+' + atk + '</span>';
    d.innerHTML = h;
    while (el.pops.children.length > 1) el.pops.removeChild(el.pops.firstChild);
    el.pops.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 980);
  }
  var LINE_NAME = ['', '單消', '雙消', '三消', '四消'];
  function spinName(type, spin) { return type === 'T' ? (spin === 'mini' ? '迷你 T 轉' : 'T 轉') : type + ' 轉'; }
  function popup(e) {
    var main = '', gold = false, tags = [];
    if (e.tspin !== 'none') { main = spinName(e.piece, e.tspin) + (e.lines ? LINE_NAME[e.lines] : ''); gold = true; }
    else if (e.lines >= 2) main = LINE_NAME[e.lines];
    if (e.b2b) tags.push('連續重擊');
    if (e.combo > 0) tags.push(e.combo + ' 連擊');
    if (e.perfect) tags.push('全清');
    if (!main && !tags.length && !e.attack) return;
    popRaw(main, tags, e.attack, gold);
  }
  function txt(id, v) {
    var e = $(id);
    if (e && e._v !== v) { e._v = v; e.textContent = v; }
  }
  function stat(id, label) { return '<div class="stat"><b id="' + id + '">0</b><span>' + label + '</span></div>'; }

  // ---------- starting a mode ----------
  var TRACK = ['battle1', 'battle1', 'battle2', 'battle2', 'battle3'];
  function begin(kind, o) {
    o = o || {};
    closeSheet(true);
    input.clear();
    banner('');
    el.pops.innerHTML = '';
    var seed = (Math.random() * 4294967296) >>> 0;
    S = {
      kind: kind, o: o, state: 'count', countT: 0, shown: 9, time: 0, hist: [], target: null, wait: 0, after: null, prev: 'play',
      flip: false, freeze: { me: 0, opp: 0 }, botItemT: 0, botChk: 0, botHoles: 0
    };
    if (kind === 'battle') {
      var lv = Bot.LEVELS[o.level];
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, items: !!o.items });
      S.opp = new ZZ.Game({ seed: seed, manual: true, items: !!o.items });
      S.me.onAttack = function (n) { S.opp.receive(n); };
      S.opp.onAttack = function (n) { S.me.receive(n); };
      S.bot = new Bot.BotPlayer(S.opp, { pps: lv.pps, depth: lv.depth, hold: lv.hold, noise: lv.noise, w: lv.w });
      S.lv = lv; S.total = o.minutes * 60000; S.left = S.total;
      S.ko = { me: 0, opp: 0 }; S.down = { me: 0, opp: 0 };
    } else if (kind === 'sprint') {
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, garbage: false });
      S.goal = 40;
    } else if (kind === 'practice') {
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, garbage: false });
      S.state = 'play';
    } else {
      S.drill = clamp(o.drill || 0, 0, DRILLS.length - 1);
    }
    show('play');
    V.me.fx = []; V.me.parts = []; V.me.koT = 0; V.opp.fx = []; V.opp.parts = []; V.opp.koT = 0;
    setupHud();
    if (kind === 'dojo') loadDrill(S.drill);
    layout();
    if (kind === 'practice') S.me.start();
    sfx.setDuck(1);
    sfx.music(kind === 'battle' ? TRACK[o.level] : kind === 'sprint' ? 'battle1' : 'calm');
    if (!env.touch && !save.tip) {
      save.tip = 1; saveStore();
      toast('← → 或 A D 移動　↑ 或 W 順轉　Z 逆轉　↓ 軟降　空白鍵硬降　C 暫存', 6500);
    }
  }

  function restart() {
    if (!S || S.kind === 'battle') return;
    if (S.kind === 'dojo') { loadDrill(S.drill); return; }
    begin(S.kind, S.o);
  }

  function setupHud() {
    var k = S.kind;
    el.strip.hidden = k !== 'dojo';
    if (k === 'battle') {
      var name = '<span class="who">' + esc(S.lv.name) + '</span>';
      if (S.flip) {
        el.hudL.innerHTML = name + stat('koOpp', '擊倒') + stat('sentOpp', '送出');
        el.hudR.innerHTML = stat('sentMe', '送出') + stat('koMe', '擊倒') + '<span class="who">你</span>';
      } else {
        el.hudL.innerHTML = '<span class="who">你</span>' + stat('koMe', '擊倒') + stat('sentMe', '送出');
        el.hudR.innerHTML = stat('sentOpp', '送出') + stat('koOpp', '擊倒') + name;
      }
      el.hudC.innerHTML = '<div id="clock">' + fmtClock(S.left) + '</div>';
      el.oppName.textContent = S.lv.name;
      el.oppNameW.textContent = S.lv.name;
    } else if (k === 'sprint') {
      el.hudL.innerHTML = stat('linesLeft', '剩下幾行');
      el.hudC.innerHTML = '<div id="clock">0:00.00</div>';
      el.hudR.innerHTML = '<div class="stat"><b id="bestT">' + (save.best ? fmtTime(save.best) : '—') + '</b><span>最佳</span></div>';
    } else if (k === 'practice') {
      el.hudL.innerHTML = stat('pAtk', '攻擊') + stat('pSpin', '轉進去');
      el.hudC.innerHTML = '<div class="hud-title">自由練習</div>';
      el.hudR.innerHTML = stat('pPps', '每秒塊數');
    } else {
      el.hudL.innerHTML = '<span class="who" id="dNo"></span>';
      el.hudC.innerHTML = '<div class="hud-title" id="dName"></div>';
      el.hudR.innerHTML = '<div class="stat"><b id="dDone">0</b><span>已過關</span></div>';
    }
    el.play.classList.toggle('nohold', k === 'dojo');
    el.itemBox.hidden = !itemsOn();
    el.itemKey.hidden = !itemsOn();
    setTools();
    sideKey = ''; chipKey = '';
  }

  function setTools() {
    var k = S ? S.kind : '', h = '';
    if (k === 'practice') h = '<button class="tool" type="button" data-act="undo">悔棋</button><button class="tool" type="button" data-act="restart">清空</button>';
    else if (k === 'sprint') h = '<button class="tool" type="button" data-act="restart">重來</button>';
    else if (k === 'dojo') {
      h = '<button class="tool" type="button" data-act="demo">看示範</button><button class="tool" type="button" data-act="restart">重來</button>' +
        '<button class="tool" type="button" data-act="hint" aria-pressed="' + (set.hint ? 'true' : 'false') + '">提示</button>';
    }
    el.tools.innerHTML = h;
  }

  // ---------- spin dojo ----------
  var ACT_NAME = env.touch ? ['往左', '往右', '按「順轉」', '按「逆轉」', '按住「軟降」到底']
    : ['按 ← 往左', '按 → 往右', '按 ↑ 順時針轉', '按 Z 逆時針轉', '按住 ↓ 軟降到底'];
  function goalPiece(d) { return d.goal.piece || 'T'; }
  function goalText(d) { return spinName(goalPiece(d), d.goal.spin) + LINE_NAME[d.goal.lines]; }
  function loadDrill(i) {
    var d = DRILLS[i], want = goalPiece(d);
    S.drill = i; S.d = d;
    S.me = new ZZ.Game({ board: d.board, queue: d.queue, seed: 1, gravity: 1 / 1500, lockDelay: Math.max(1000, set.lock), garbage: false, sdf: sdfVal() });
    S.steps = Bot.solve(S.me.grid, d.queue, d.goal);
    S.tLeft = d.queue.filter(function (t) { return t === want; }).length;
    S.state = 'play'; S.demo = null; S.target = null;
    input.clear();
    banner('');
    V.me.fx = []; V.me.koT = 0;
    S.me.start();
    stripText('');
    txt('dNo', '第 ' + (i + 1) + ' 關');
    txt('dName', d.name);
    txt('dDone', save.dojo + '/' + DRILLS.length);
    sideKey = '';
  }
  function stripText(now) {
    var d = S.d;
    el.strip.innerHTML = now ? '<b>示範：' + goalText(d) + '</b><br><span class="now">' + esc(now) + '</span>'
      : '<b>目標：' + goalText(d) + '</b>　' + esc(d.tip) + (env.touch ? '' : '<br><span class="keys-note">順轉 ↑ 或 W　逆轉 Z 或 J　軟降 ↓ 或 S　放下 空白鍵</span>');
  }
  function stepCells(st) {
    var sh = SHAPES[st.type][st.rot], out = [];
    for (var i = 0; i < 4; i++) out.push([st.x + sh[i][0], st.y + sh[i][1]]);
    return out;
  }
  function drillLock(e) {
    var d = S.d, me = S.me, want = goalPiece(d);
    if (e.piece === want) {
      if (e.tspin === d.goal.spin && e.lines === d.goal.lines) {
        S.tLeft--;
        if (S.tLeft <= 0) return drillWin();
      } else {
        return drillFail(e.tspin === 'none' ? '最後一下要用轉的進去，直接放不算。' : '轉進去了，但消掉的行數不對。');
      }
    }
    if (!me.cur) return;
    S.steps = Bot.solve(me.grid, [me.cur.type].concat(me.queue), d.goal);
    if (!S.steps) drillFail('這樣擺，' + want + ' 就轉不進去了。');
  }
  function drillWin() {
    sfx.play('win');
    buzz([20, 40, 60]);
    banner('過關', 'good', 1400);
    if (S.drill + 1 > save.dojo) { save.dojo = S.drill + 1; saveStore(); }
    txt('dDone', save.dojo + '/' + DRILLS.length);
    S.state = 'wait'; S.wait = 1500; S.target = null;
    S.after = function () {
      if (S.drill + 1 < DRILLS.length) loadDrill(S.drill + 1);
      else openSheet('dojoDone');
    };
  }
  function drillFail(msg) {
    toast(msg);
    sfx.play('fail');
    S.state = 'wait'; S.wait = 1300; S.target = null;
    S.after = function () { loadDrill(S.drill); };
  }
  function startDemo() {
    if (!S || S.kind !== 'dojo') return;
    loadDrill(S.drill);
    if (!S.steps) return;
    S.state = 'demo';
    S.demo = { si: 0, ai: 0, t: -300, drop: false };
    stripText('示範開始');
  }
  function runAct(g, a) {
    if (a === Bot.L) return g.move(-1);
    if (a === Bot.R) return g.move(1);
    if (a === Bot.CW) return g.rotate(1);
    if (a === Bot.CCW) return g.rotate(-1);
    return g.sonicDrop();
  }
  // Plays solver steps on a game at a watchable pace. Returns true when the last piece has been placed.
  function stepDemo(D, g, steps, dt, gap, say) {
    if (D.drop) {
      D.t += dt;
      while (D.t >= 50) {
        D.t -= 50;
        if (!g.stepDown()) { D.drop = false; D.t = 0; break; }
      }
      return false;
    }
    D.t += dt;
    if (D.t < gap) return false;
    D.t = 0;
    var st = steps[D.si];
    if (!st || !g.cur) return true;
    if (D.ai < st.path.length) {
      var a = st.path[D.ai++];
      if (say) say(ACT_NAME[a] + (D.ai === st.path.length && st.spin !== 'none' ? '，轉進去' : ''));
      if (a === Bot.SD) D.drop = true; else runAct(g, a);
      return false;
    }
    if (say) say(env.touch ? '按「硬降」放下' : '按空白鍵放下');
    g.hardDrop();
    D.si++; D.ai = 0;
    return D.si >= steps.length;
  }

  // ---------- items ----------
  function useItem(k) {
    if (!itemsOn() || S.state !== 'play') return false;
    var g = S[k], other = k === 'me' ? 'opp' : 'me', og = S[other], mine = k === 'me', now = performance.now();
    if (g.over || S.freeze[k] > 0 || !g.inv.length) return false;
    var id = g.takeItem(), it = ITEMS[id], note = '';
    if (id === 1) g.chisel(3);
    else if (id === 2) { og.receive(3); note = og.shield > 0 ? '' : '+3 排水泥'; }
    else if (id === 3) { g.shield = 8000; g.pending = []; }
    else if (id === 4) g.queue.unshift('T', 'T');
    else if (id === 5) g.trowel();
    else if (id === 6) { if (!og.over) S.freeze[other] = 3000; if (other === 'me') input.clear(); }
    else if (id === 7) g.boost = 8000;
    if (!mine) S.bot.plan = null;
    sideKey = '';
    if (mine) {
      sfx.play('itemUse');
      buzz(16);
      popRaw(it.name, [it.tip], 0, id === 4);
      if (id === 2 || id === 6) V.opp.addWash(now, id === 6 ? '190,232,255' : '217,67,47', 420);
      if (id === 3) V.me.addWash(now, '88,170,255', 420);
      if (id === 4) V.me.addWash(now, '245,184,46', 420);
    } else {
      var hit = id === 2 || id === 6;
      if (hit) { sfx.play('itemHit'); buzz(30); V.me.addWash(now, id === 6 ? '190,232,255' : '217,67,47', 420); }
      toast('對手用了「' + it.name + '」' + (id === 2 ? (note ? '：' + note : '，被你的防水布擋掉') : id === 6 ? '：你 3 秒動不了' : ''), 2000);
    }
    return true;
  }
  // The computer holds an item until it is useful, then plays it.
  function botItems(dt) {
    var g = S.opp;
    if (!g.inv.length || g.over || S.freeze.opp > 0) { S.botItemT = 0; return; }
    S.botItemT += dt;
    S.botChk -= dt;
    if (S.botChk <= 0) { S.botChk = 300; S.botHoles = Bot.features(Bot.rowsOf(g.grid)).holes; }
    var id = g.inv[0], t = S.botItemT, wait = 700 + (4 - S.o.level) * 450, late = g.inv.length >= 3 ? wait : wait + 4000, go = false;
    if (id === 1) go = t > wait && (g.stackHeight() >= 9 || t > late);
    else if (id === 5) go = t > wait && (S.botHoles >= 3 || t > late);
    else if (id === 3) go = t > 400 && (g.pendingTotal() >= 2 || t > late);
    else go = t > wait;
    if (go) { S.botItemT = 0; useItem('opp'); }
  }

  // ---------- events from the games ----------
  var tickAt = 0;
  function pump(g, v, mine, now) {
    var ev = g.events;
    if (!ev.length) return;
    g.events = [];
    for (var i = 0; i < ev.length; i++) {
      if (!S || (g !== S.me && g !== S.opp)) return;
      handle(g, v, mine, ev[i], now);
    }
  }
  function handle(g, v, mine, e, now) {
    switch (e.type) {
      case 'spawn':
        v.vis.ox = v.vis.oy = v.vis.ang = 0;
        if (mine) onSpawn(e);
        break;
      case 'move':
        if (set.smooth) v.vis.ox -= e.dx;
        if (mine && now - tickAt > 24) { tickAt = now; sfx.play('move'); }
        break;
      case 'rotate':
        if (set.smooth) { v.vis.ox -= e.dx; v.vis.oy -= e.dy; v.vis.ang -= e.dir === 2 ? 180 : 90 * e.dir; }
        if (e.spin !== 'none') v.addSpark(g, now);
        if (mine) {
          if (e.spin !== 'none') { sfx.play('arm'); buzz(12); } else sfx.play('rot');
        }
        break;
      case 'harddrop':
        v.addStreak(e, now);
        if (mine) { sfx.play('hard'); S.dropped = true; }
        break;
      case 'lock':
        onLock(g, v, mine, e, now);
        break;
      case 'garbage':
        v.kick(0, -160);
        if (mine) { sfx.play('garbage'); buzz(28); }
        break;
      case 'incoming':
        if (mine) sfx.play('warn');
        break;
      case 'hold':
        if (mine) sfx.play('hold');
        break;
      case 'topout':
        onTopOut(g, v, mine, now);
        break;
      case 'empty':
        if (mine && S.kind === 'dojo' && S.state === 'play') drillFail('方塊用完了，再試一次。');
        break;
      case 'itemtile':
        if (mine) sfx.play('itemTile');
        break;
      case 'item':
        sideKey = '';
        if (mine) {
          sfx.play('itemGet');
          buzz(14);
          popRaw('拿到「' + ITEMS[e.id].ch + '」', [ITEMS[e.id].tip], 0, false);
          if (!save.itip) {
            save.itip = 1; saveStore();
            toast(env.touch ? '按下面中間的「道具」鍵就能用。' : '按 F 用道具。', 4200);
          }
        }
        break;
      case 'itemfull':
        if (mine) toast('道具滿了，這顆沒拿到。');
        break;
      case 'blocked':
        if (mine) popRaw('擋下 ' + e.n + ' 排', [], 0, false);
        break;
      case 'chisel':
        v.addCrumble(e.rows, now);
        v.kick(0, 120);
        break;
      case 'trowel':
        v.addWash(now, '55,194,154', 380);
        break;
    }
  }
  function radarOn() { return S.kind === 'practice' || ((S.kind === 'battle' || S.kind === 'sprint') && set.radar); }
  function radarTarget() {
    var me = S.me, t = me.cur.type, sp = t === 'O' ? null : Bot.findSpins(me, t, false)[0], strong = !!sp;
    if (!sp && t !== 'T') { sp = Bot.findSpins(me, 'T', false)[0]; strong = !!sp && me.holdType === 'T'; }
    if (!sp) return null;
    return { cells: stepCells(sp), strong: strong, label: spinName(sp.type, sp.spin) + LINE_NAME[sp.lines] };
  }
  function onSpawn(e) {
    var me = S.me;
    S.target = null;
    if (!me.cur) return;
    if (S.kind === 'practice' && !e.hold) {
      S.hist.push(me.snapshot());
      if (S.hist.length > 80) S.hist.shift();
    }
    if (S.kind === 'dojo') {
      var st = S.steps && S.steps[S.demo ? S.demo.si : 0];
      if (st && st.type === me.cur.type && (set.hint || S.demo)) S.target = { cells: stepCells(st), strong: true, label: '' };
    } else if (radarOn()) {
      S.target = radarTarget();
    }
  }
  function onLock(g, v, mine, e, now) {
    var spun = e.tspin !== 'none';
    if (e.lines) {
      v.addClear(e.rows, e.rowColors, now, spun || e.lines === 4);
      if (spun) { v.addShine(now); v.addDust(e.cells[0][0] + 0.5, e.cells[0][1], now); }
      v.kick(0, 70 + Math.min(e.attack, 8) * 24);
    } else {
      v.addFlash(e.cells, now);
      v.kick(0, 30);
    }
    if (!mine) return;
    var byDrop = !!S.dropped;
    if (!byDrop) S.guard = performance.now() + 130;
    S.dropped = false;
    if (e.lines) {
      sfx.play(spun ? 'tspin' : 'clear', e.lines, e.combo);
      buzz(spun ? [18, 30, 34] : 14);
    } else if (!byDrop) {
      sfx.play('lock');
    }
    popup(e);
    if (S.demo) return;
    if (S.kind === 'dojo') drillLock(e);
    else if (S.kind === 'sprint' && S.me.stats.lines >= S.goal) endSprint();
  }
  function onTopOut(g, v, mine, now) {
    if (S.kind === 'battle') {
      var k = mine ? 'me' : 'opp', other = mine ? 'opp' : 'me';
      S.ko[other]++;
      S.down[k] = 1150;
      S.freeze[k] = 0;
      v.knock(now);
      sfx.play('ko');
      buzz(mine ? [60, 40, 80] : 40);
      if (mine) { input.clear(); banner('被擊倒', 'bad', 1000); }
      else popRaw('擊倒對手', [], 0, true);
    } else if (S.kind === 'sprint') {
      S.state = 'over';
      sfx.play('lose');
      sfx.setDuck(0.4);
      openSheet('sprintFail');
    } else if (S.kind === 'practice') {
      toast('牆滿了，清空重來。');
      S.me.seed = (Math.random() * 4294967296) >>> 0;
      S.me.reset();
      S.me.start();
      S.hist = [];
    } else if (S.kind === 'dojo' && S.state === 'play') {
      drillFail('牆滿了，再試一次。');
    }
  }
  function undo() {
    if (!S || S.kind !== 'practice' || S.state !== 'play') return;
    if (S.hist.length < 2) { toast('已經是第一步了。'); return; }
    S.hist.pop();
    S.me.restore(S.hist[S.hist.length - 1]);
    V.me.fx = [];
    sfx.play('undo');
  }

  // ---------- finishing ----------
  function rate(n, ms) { return ms > 0 ? n / (ms / 60000) : 0; }
  function endBattle() {
    S.state = 'over';
    input.clear();
    var a = S.ko.me, b = S.ko.opp, r = a !== b ? (a > b ? 1 : -1) : S.me.stats.sent !== S.opp.stats.sent ? (S.me.stats.sent > S.opp.stats.sent ? 1 : -1) : 0;
    S.result = r;
    sfx.setDuck(0.4);
    sfx.play(r >= 0 ? 'win' : 'lose');
    banner('時間到', '', 900);
    setTimeout(function () { if (S && S.state === 'over' && S.kind === 'battle') openSheet('battleEnd'); }, 900);
  }
  function endSprint() {
    S.state = 'over';
    input.clear();
    S.newBest = !save.best || S.time < save.best;
    if (S.newBest) { save.best = Math.round(S.time); saveStore(); }
    sfx.setDuck(0.4);
    sfx.play('win');
    openSheet('sprintEnd');
  }
  function pause() {
    if (!S || screen !== 'play' || sheetName) return;
    if (S.state !== 'play' && S.state !== 'count' && S.state !== 'demo' && S.state !== 'wait') return;
    S.prev = S.state;
    S.state = 'pause';
    input.clear();
    sfx.setDuck(0.35);
    openSheet('pause');
  }
  function resume() {
    if (S && S.state === 'pause') { S.state = S.prev; sfx.setDuck(1); }
    last = performance.now();
  }
  function toMenu() {
    S = null;
    closeSheet(true);
    input.clear();
    show('menu');
  }

  // ---------- sheets ----------
  var LV_NOTE = ['剛學會擺，常常放歪', '疊得穩，不太會攻擊', '會留一排等長條四消', '四消一個接一個', 'T 轉連發，手下不留情'];
  var pick = { level: 1, minutes: 2, items: true };
  function itile(id) { return '<span class="itile" style="--c:' + ITEMS[id].color + '">' + ITEMS[id].ch + '</span>'; }
  function sheetHtml(name) {
    var h = '', i;
    if (name === 'battle') {
      h = '<h2>選對手</h2><div class="levels" role="radiogroup" aria-label="對手">';
      for (i = 0; i < Bot.LEVELS.length; i++) {
        h += '<button class="lvl" type="button" role="radio" aria-checked="' + (pick.level === i) + '" data-level="' + i + '"><b>' + Bot.LEVELS[i].name +
          '</b><span>' + LV_NOTE[i] + '</span><i>每秒 ' + Bot.LEVELS[i].pps + ' 塊</i></button>';
      }
      h += '</div><h3>對戰時間</h3><div class="seg" role="radiogroup" aria-label="對戰時間">';
      for (i = 1; i <= 3; i++) h += '<button type="button" role="radio" aria-checked="' + (pick.minutes === i) + '" data-min="' + i + '">' + i + ' 分鐘</button>';
      h += '</div><label class="toggle" for="bItems">道具戰：牆上會冒出道具磚，消掉那排就拿到<input type="checkbox" id="bItems"></label>' +
        '<div class="row"><button class="btn" type="button" data-do="close">取消</button><button class="btn main" type="button" data-do="fight">開始對戰</button></div>';
    } else if (name === 'pause') {
      h = '<h2>暫停</h2><div class="row"><button class="btn main" type="button" data-do="resume">繼續</button></div><div class="row">' +
        (S && S.kind !== 'battle' ? '<button class="btn" type="button" data-do="again">重來</button>' : '<button class="btn" type="button" data-do="again">重新對戰</button>') +
        '<button class="btn" type="button" data-do="settings">設定</button><button class="btn" type="button" data-do="help">操作與規則</button><button class="btn" type="button" data-do="menu">回主選單</button></div>';
    } else if (name === 'battleEnd') {
      var me = S.me.stats, op = S.opp.stats, t = S.total;
      var rows = [
        ['送出行數', me.sent, op.sent],
        ['每分鐘攻擊', rate(me.attack, t).toFixed(1), rate(op.attack, t).toFixed(1)],
        ['每秒塊數', (me.pieces / (t / 1000)).toFixed(2), (op.pieces / (t / 1000)).toFixed(2)],
        ['T 轉', me.spins + me.minis, op.spins + op.minis],
        ['其他方塊的轉', me.xspins, op.xspins],
        ['四消', me.quads, op.quads],
        ['最長連擊', me.maxCombo, op.maxCombo]
      ];
      if (S.o.items) rows.push(['拿到的道具', me.items, op.items]);
      h = '<h2>' + (S.result > 0 ? '你贏了' : S.result < 0 ? '這場輸了' : '平手') + '</h2>' +
        '<div class="score"><div><b>' + S.ko.me + '</b><span>你的擊倒</span></div><i>比</i><div><b>' + S.ko.opp + '</b><span>' + esc(S.lv.name) + '的擊倒</span></div></div>' +
        (S.ko.me === S.ko.opp && S.result !== 0 ? '<p>擊倒數一樣，改比送出的行數。</p>' : '') +
        '<table class="cmp"><thead><tr><th></th><th>你</th><th>' + esc(S.lv.name) + '</th></tr></thead><tbody>';
      for (i = 0; i < rows.length; i++) h += '<tr><td>' + rows[i][0] + '</td><td>' + rows[i][1] + '</td><td>' + rows[i][2] + '</td></tr>';
      h += '</tbody></table><div class="row"><button class="btn main" type="button" data-do="again">再來一場</button><button class="btn" type="button" data-do="battle">換對手</button><button class="btn" type="button" data-do="menu">回主選單</button></div>';
    } else if (name === 'sprintEnd') {
      var s = S.me.stats;
      h = '<h2>' + (S.newBest ? '新紀錄' : '40 行清完') + '</h2><div class="score"><div><b>' + fmtTime(S.time) + '</b><span>這次</span></div><i></i><div><b>' + fmtTime(save.best) + '</b><span>最佳</span></div></div>' +
        '<table class="cmp"><tbody><tr><td>每秒塊數</td><td>' + (s.pieces / (S.time / 1000)).toFixed(2) + '</td></tr><tr><td>用了幾塊</td><td>' + s.pieces + '</td></tr><tr><td>各種轉</td><td>' + (s.spins + s.minis + s.xspins) + '</td></tr><tr><td>四消</td><td>' + s.quads + '</td></tr></tbody></table>' +
        '<div class="row"><button class="btn main" type="button" data-do="again">再跑一次</button><button class="btn" type="button" data-do="menu">回主選單</button></div>';
    } else if (name === 'sprintFail') {
      h = '<h2>牆滿了</h2><p>還差 ' + Math.max(0, S.goal - S.me.stats.lines) + ' 行。</p><div class="row"><button class="btn main" type="button" data-do="again">再跑一次</button><button class="btn" type="button" data-do="menu">回主選單</button></div>';
    } else if (name === 'dojoDone') {
      h = '<h2>全部過關</h2><p>T 轉的雙消、三消、蓋屋簷，還有 Z、S、L、J 的轉法都會了。接下來去自由練習自己搭洞，雷達會告訴你哪裡轉得進去。</p>' +
        '<div class="row"><button class="btn main" type="button" data-do="practice">去自由練習</button><button class="btn" type="button" data-do="dojoFirst">從第一關再練</button><button class="btn" type="button" data-do="menu">回主選單</button></div>';
    } else if (name === 'dojo') {
      h = '<h2>旋轉道場</h2>';
      var open = false;
      for (i = 0; i < DRILLS.length; i++) {
        var other = goalPiece(DRILLS[i]) !== 'T';
        if (i === 0 || (other && goalPiece(DRILLS[i - 1]) === 'T')) {
          if (open) h += '</div>';
          h += '<h3>' + (other ? '其他方塊也能轉' : 'T 轉') + '</h3><div class="levels">';
          open = true;
        }
        h += '<button class="lvl" type="button" data-drill="' + i + '"><b>第 ' + (i + 1) + ' 關</b><span>' + esc(DRILLS[i].name) + '</span><i>' + (i < save.dojo ? '過關' : '') + '</i></button>';
      }
      h += '</div><div class="row"><button class="btn" type="button" data-do="close">取消</button></div>';
    } else if (name === 'settings') {
      h = '<h2>設定</h2><h3>操控手感</h3>' +
        field('sDas', '按住多久開始連續移動', 60, 300, 5, '數字越小，方塊越快滑出去。') +
        field('sArr', '連續移動的間隔', 0, 80, 5, '0 會直接貼到牆邊。') +
        field('sSdf', '軟降速度', 10, 125, 5, '拉到最右邊是瞬間到底。') +
        field('sLock', '落地後多久鎖定', 200, 1000, 50, '想多一點時間轉進洞裡，就調長。') +
        '<h3>畫面</h3>' + toggle('sSmooth', '移動和旋轉的滑順動畫') + toggle('sGhost', '顯示落點') + toggle('sRadar', '對戰和競速也開旋轉雷達') +
        '<h3>觸控按鍵</h3><div class="seg" role="radiogroup" aria-label="按鍵高度">' +
        ['矮', '中', '高'].map(function (n, j) { return '<button type="button" role="radio" aria-checked="' + (set.pad === j) + '" data-pad="' + j + '">' + n + '</button>'; }).join('') + '</div>' +
        toggle('sSwap', '移動鍵放右手邊') + toggle('sHalf', '多一顆「半圈」鍵（轉 180 度）') + toggle('sHaptic', '震動回饋') +
        '<h3>聲音</h3>' + field('sMvol', '音樂音量', 0, 100, 5, '') + field('sVol', '音效音量', 0, 100, 5, '') + toggle('sReal', '用實錄音效（關掉改用合成音）') +
        '<div class="row"><button class="btn" type="button" data-do="defaults">恢復預設</button><button class="btn main" type="button" data-do="close">完成</button></div>';
    } else if (name === 'help') {
      h = '<h2>操作與規則</h2><h3>鍵盤</h3><dl class="keys">' +
        '<dt><kbd>←</kbd> <kbd>→</kbd> 或 <kbd>A</kbd> <kbd>D</kbd></dt><dd>左右移動，按住會連續移動</dd>' +
        '<dt><kbd>↓</kbd> <kbd>S</kbd></dt><dd>軟降</dd><dt><kbd>空白鍵</kbd></dt><dd>硬降，直接放到底</dd>' +
        '<dt><kbd>↑</kbd> <kbd>W</kbd> <kbd>X</kbd> <kbd>K</kbd></dt><dd>順時針轉</dd><dt><kbd>Z</kbd> <kbd>J</kbd> <kbd>Ctrl</kbd></dt><dd>逆時針轉</dd><dt><kbd>Q</kbd> <kbd>L</kbd></dt><dd>轉半圈</dd>' +
        '<dt><kbd>C</kbd> <kbd>E</kbd> <kbd>Shift</kbd></dt><dd>暫存</dd><dt><kbd>F</kbd> <kbd>V</kbd> <kbd>Enter</kbd></dt><dd>用道具</dd>' +
        '<dt><kbd>Esc</kbd> <kbd>P</kbd></dt><dd>暫停</dd><dt><kbd>R</kbd></dt><dd>重來（對戰以外）</dd><dt><kbd>U</kbd></dt><dd>悔棋（自由練習）</dd></dl>' +
        '<h3>觸控</h3><p>拇指可以在左、右兩顆鍵之間直接滑過去，不用抬手。點一下「暫存」格或「道具」格也有用。</p>' +
        '<h3>轉進去怎麼算</h3><ul class="rules"><li>T 的最後一個動作是旋轉，而且四個斜角有三個被擋住，就是 T 轉。</li><li>Z、S、L、J、I 也能轉：最後一個動作是旋轉，轉完左右上下都動不了，就算。</li><li>轉成功的那一下，磚會閃一圈金光。</li><li>落地後有一小段時間可以調整，每次移動或旋轉會重新計時，最多 15 次。時間長短可以在設定裡調。</li></ul>' +
        '<h3>送多少行</h3><ul class="rules"><li>雙消 1、三消 2、四消 4。</li><li>T 轉單消 2、雙消 4、三消 6；迷你 T 轉單消 1、雙消 2。</li><li>其他方塊的轉：照消掉的行數算，再多送 1 行。</li><li>連續重擊：四消或任何一種轉接著打，每次多送 1 行。</li><li>連擊：連續幾塊都有消行，越後面加越多。</li><li>全清再加 6 行。</li></ul>' +
        '<h3>對戰</h3><ul class="rules"><li>你送出的行會先抵銷紅條裡排隊的水泥行，剩下的才送給對手。</li><li>放下一塊卻沒有消行，排隊的水泥行就會從底下頂上來。</li><li>牆頂到天花板算被擊倒一次，水泥行會掉光，然後繼續打。</li><li>時間到比擊倒次數，一樣多就比送出的行數。</li></ul>' +
        '<h3>道具</h3><p>道具戰裡，每放幾塊，牆上就有一格變成白色的道具磚。把那一排消掉就能拿到，最多帶 3 個，先拿到的先用。</p><dl class="keys">';
      for (i = 1; i < ITEMS.length; i++) h += '<dt>' + itile(i) + '</dt><dd><b>' + ITEMS[i].name + '</b>　' + ITEMS[i].tip + '</dd>';
      h += '</dl><h3>素材出處</h3><p>音樂：Juhani Junkala《5 Chiptunes (Action)》。音效：Kenney《Interface Sounds》《UI Audio》。全部是 CC0 授權，可以商用，不強制標示出處。</p>' +
        '<div class="row"><button class="btn main" type="button" data-do="close">知道了</button></div>';
    }
    return h;
  }
  function field(id, label, min, max, step, note) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><output id="' + id + 'O" for="' + id + '"></output>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '">' + (note ? '<small>' + note + '</small>' : '') + '</div>';
  }
  function toggle(id, label) { return '<label class="toggle" for="' + id + '">' + label + '<input type="checkbox" id="' + id + '"></label>'; }

  var FIELDS = { sDas: 'das', sArr: 'arr', sSdf: 'sdf', sLock: 'lock', sVol: 'vol', sMvol: 'mvol' };
  var TOGGLES = { sSmooth: 'smooth', sGhost: 'ghost', sRadar: 'radar', sSwap: 'swap', sHalf: 'half', sHaptic: 'haptic', sReal: 'real' };
  function fieldText(k) {
    if (k === 'sdf') return set.sdf >= 125 ? '瞬間' : '每秒 ' + set.sdf + ' 格';
    if (k === 'vol' || k === 'mvol') return set[k] ? String(set[k]) : '關';
    return set[k] + ' 毫秒';
  }
  function syncSettings() {
    var id;
    for (id in FIELDS) { $(id).value = set[FIELDS[id]]; $(id + 'O').textContent = fieldText(FIELDS[id]); }
    for (id in TOGGLES) $(id).checked = !!set[TOGGLES[id]];
  }
  function applySettings() {
    el.pad.classList.toggle('swap', set.swap);
    el.halfKey.hidden = !set.half;
    sfx.vol();
    if (S && S.me) {
      S.me.sdf = sdfVal();
      S.me.lockDelay = S.kind === 'dojo' ? Math.max(1000, set.lock) : set.lock;
    }
    if (screen === 'play') layout();
  }

  function openSheet(name) {
    if ((name === 'settings' || name === 'help') && sheetName !== name) sheetBack = sheetName === 'pause' ? 'pause' : '';
    sheetName = name;
    el.sheetCard.innerHTML = sheetHtml(name);
    el.sheet.hidden = false;
    el.sheetCard.scrollTop = 0;
    if (name === 'settings') syncSettings();
    if (name === 'battle') $('bItems').checked = pick.items;
    var b = el.sheetCard.querySelector('.btn.main');
    if (b && !env.touch) b.focus();
  }
  function closeSheet(quiet) {
    sheetName = '';
    el.sheet.hidden = true;
    el.sheetCard.innerHTML = '';
    if (!quiet && sheetBack) { var b = sheetBack; sheetBack = ''; openSheet(b); }
  }
  function openBattle() { pick.level = save.level; pick.minutes = save.minutes; pick.items = !!save.items; openSheet('battle'); }
  function sheetDo(a) {
    if (a === 'close') { closeSheet(); if (!sheetName && S && S.state === 'pause') resume(); }
    else if (a === 'resume') { sheetBack = ''; closeSheet(true); resume(); }
    else if (a === 'fight') {
      save.level = pick.level; save.minutes = pick.minutes; save.items = pick.items ? 1 : 0; saveStore();
      begin('battle', { level: pick.level, minutes: pick.minutes, items: pick.items });
    }
    else if (a === 'again') { sheetBack = ''; if (S.kind === 'dojo') { closeSheet(true); sfx.setDuck(1); loadDrill(S.drill); } else begin(S.kind, S.o); }
    else if (a === 'battle') { sheetBack = ''; openBattle(); }
    else if (a === 'menu') { sheetBack = ''; toMenu(); }
    else if (a === 'settings' || a === 'help') openSheet(a);
    else if (a === 'practice') begin('practice');
    else if (a === 'dojoFirst') begin('dojo', { drill: 0 });
    else if (a === 'defaults') { for (var k in DEF) set[k] = DEF[k]; saveStore(); openSheet('settings'); applySettings(); }
  }
  function bindSheets() {
    el.sheetCard.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      sfx.wake();
      sfx.play('ui');
      var d = t.dataset;
      if (d.do) return sheetDo(d.do);
      if (d.level) { pick.level = +d.level; openSheet('battle'); }
      else if (d.min) { pick.minutes = +d.min; openSheet('battle'); }
      else if (d.drill) begin('dojo', { drill: +d.drill });
      else if (d.pad) { set.pad = +d.pad; saveStore(); var keep = el.sheetCard.scrollTop; el.sheetCard.innerHTML = sheetHtml('settings'); syncSettings(); el.sheetCard.scrollTop = keep; applySettings(); }
    });
    el.sheetCard.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'bItems') { pick.items = e.target.checked; return; }
      if (FIELDS[id]) {
        set[FIELDS[id]] = +e.target.value;
        $(id + 'O').textContent = fieldText(FIELDS[id]);
        if (id === 'sVol' || id === 'sMvol') { sfx.wake(); sfx.vol(); if (id === 'sVol') sfx.play('tick'); }
      }
      else if (TOGGLES[id]) set[TOGGLES[id]] = e.target.checked;
      else return;
      saveStore();
      applySettings();
    });
    el.sheet.addEventListener('click', function (e) {
      if (e.target !== el.sheet) return;
      if (sheetName === 'battle' || sheetName === 'dojo' || sheetName === 'settings' || sheetName === 'help') sheetDo('close');
    });
    el.menu.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      sfx.wake();
      sfx.play('ui');
      if (t.dataset.sheet) return openSheet(t.dataset.sheet);
      var go = t.dataset.go;
      if (go === 'battle') openBattle();
      else if (go === 'dojo') { if (save.dojo > 0) openSheet('dojo'); else begin('dojo', { drill: 0 }); }
      else if (go) begin(go);
    });
  }
  function updateMenu() {
    $('mBattle').textContent = '';
    $('mDojo').textContent = save.dojo ? save.dojo + '/' + DRILLS.length : '';
    $('mSprint').textContent = save.best ? fmtTime(save.best) : '';
  }

  // ---------- layout ----------
  var side = 66, pc = 12, nextN = 5, itemH = 28, sideKey = '', chipKey = '';
  function layout() {
    if (screen !== 'play' || !S) return;
    var W = el.app.clientWidth, H = el.app.clientHeight, hasOpp = !!S.opp;
    var wide = W >= 820 && W > H * 1.05, flip = wide && hasOpp;
    if (S.flip !== flip) { S.flip = flip; setupHud(); }
    el.pad.hidden = !env.touch;
    el.stage.classList.toggle('wide', flip);
    var hudH = el.hud.offsetHeight || 48, stripH = el.strip.hidden ? 0 : el.strip.offsetHeight + 6;
    var padMin = env.touch ? [128, 152, 184][set.pad] : 0;
    el.pad.style.minHeight = padMin + 'px';
    var availH = H - hudH - stripH - padMin - 22, cell, oppCell = 0;
    var byH = Math.floor(availH / (VIS + SKY));
    if (wide) {
      side = 112;
      cell = clamp(Math.min(byH, Math.floor((W - 2 * side - 70 - (hasOpp ? W * 0.27 : 0)) / 10.3)), 12, 38);
      if (hasOpp) oppCell = Math.max(8, Math.round(cell * 0.7));
    } else {
      cell = clamp(Math.min(byH, Math.floor((W - 2 * 66 - 36) / 10.3)), 10, 34);
      side = clamp(Math.floor((W - cell * 10.3 - 40) / 2), 58, 124);
      if (hasOpp) oppCell = Math.max(4, Math.floor((side - 8) / 10));
    }
    el.stage.style.setProperty('--side', side + 'px');
    V.me.resize(cell);
    el.oppMini.hidden = !hasOpp || wide;
    el.oppWide.hidden = !flip;
    if (hasOpp) {
      var home = wide ? el.oppFrame : el.oppMini;
      if (el.oppCv.parentNode !== home) home.appendChild(el.oppCv);
      V.opp.plain = !wide;
      V.opp.sky = wide ? SKY : 0;
      V.opp.resize(oppCell);
    }
    pc = Math.max(7, Math.floor((side - 10) / 4.3));
    nextN = cell * (VIS + SKY) >= pc * 2.9 * 5 + 150 ? 5 : cell * (VIS + SKY) >= pc * 2.9 * 4 + 150 ? 4 : 3;
    if (S.kind === 'dojo') nextN = 2;
    itemH = Math.round(Math.min(pc * 2.4, (side - 8) * 0.56));
    View.sizeCanvas(el.holdCv, side - 8, Math.round(pc * 2.7));
    View.sizeCanvas(el.nextCv, side - 8, Math.round(pc * 2.9 * nextN));
    View.sizeCanvas(el.itemCv, side - 8, itemH);
    sideKey = '';
    if (wide) {
      var a = (flip ? el.oppWide : el.colL).getBoundingClientRect(), b = el.colR.getBoundingClientRect(), o = el.app.getBoundingClientRect();
      var ml = Math.max(0, a.left - o.left - 12), wd = Math.round(b.right - a.left + 24);
      el.hud.style.marginLeft = ml + 'px';
      el.hud.style.width = wd + 'px';
      el.strip.style.marginLeft = (ml + 12) + 'px';
      el.strip.style.width = (wd - 24) + 'px';
    } else {
      el.hud.style.marginLeft = el.hud.style.width = el.strip.style.marginLeft = el.strip.style.width = '';
    }
    var short = env.touch && H < 470 && W > H;
    el.rotate.hidden = !short;
    if (short && (S.state === 'play' || S.state === 'count')) { S.prev = S.state; S.state = 'pause'; input.clear(); openSheet('pause'); }
  }
  function drawSide() {
    var me = S.me, key = (me.holdType || '-') + (me.holdUsed ? '!' : '') + '|' + me.queue.slice(0, nextN).join('') + '|' + pc + '|' + nextN + '|' + me.inv.join('');
    if (key === sideKey) return;
    sideKey = key;
    var dpr = env.dpr, w = side - 8, x = el.holdCv.getContext('2d'), i;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, pc * 3);
    if (me.holdType) View.drawPiece(x, me.holdType, w / 2, pc * 1.35, pc);
    el.holdBox.classList.toggle('used', me.holdUsed);
    x = el.nextCv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, pc * 3 * nextN);
    for (i = 0; i < nextN && i < me.queue.length; i++) View.drawPiece(x, me.queue[i], w / 2, pc * 2.9 * (i + 0.5), pc);
    if (itemsOn()) {
      var inv = me.inv, big = itemH, sm = Math.floor((big - 2) / 2);
      x = el.itemCv.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, w, itemH + 2);
      if (inv[0]) View.drawItem(x, inv[0], 0, 0, big);
      if (inv[1]) View.drawItem(x, inv[1], big + 4, 0, sm);
      if (inv[2]) View.drawItem(x, inv[2], big + 4, sm + 2, sm);
      el.itemKey.innerHTML = inv[0] ? '<b>' + ITEMS[inv[0]].ch + '</b>道具' : '道具';
      el.itemKey.classList.toggle('empty', !inv[0]);
      el.itemBox.classList.toggle('empty', !inv[0]);
    }
  }
  function secs(ms) { return Math.ceil(ms / 1000); }
  function drawChips() {
    var me = S.me, fz = S.freeze.me, key = me.b2b + '|' + me.combo + '|' + secs(Math.max(0, me.shield)) + '|' + secs(Math.max(0, me.boost)) + '|' + secs(fz);
    if (key === chipKey) return;
    chipKey = key;
    var h = '';
    if (fz > 0) h += '<span class="chip ice">結冰 ' + secs(fz) + '</span>';
    if (me.shield > 0) h += '<span class="chip blue">防水布 ' + secs(me.shield) + '</span>';
    if (me.boost > 0) h += '<span class="chip gold">兩倍 ' + secs(me.boost) + '</span>';
    if (me.b2b >= 1) h += '<span class="chip gold">連續重擊 ×' + me.b2b + '</span>';
    if (me.combo >= 1) h += '<span class="chip">' + me.combo + ' 連擊</span>';
    el.chips.innerHTML = h;
  }
  function updateHud() {
    var me = S.me, st = me.stats;
    if (S.kind === 'battle') {
      txt('koMe', String(S.ko.me)); txt('koOpp', String(S.ko.opp));
      txt('sentMe', String(st.sent)); txt('sentOpp', String(S.opp.stats.sent));
      var c = $('clock');
      txt('clock', fmtClock(S.left));
      if (c) { var late = S.left <= 10000; if (c._late !== late) { c._late = late; c.className = late ? 'late' : ''; } }
    } else if (S.kind === 'sprint') {
      txt('linesLeft', String(Math.max(0, S.goal - st.lines)));
      txt('clock', fmtTime(S.time));
    } else if (S.kind === 'practice') {
      txt('pAtk', String(st.attack)); txt('pSpin', String(st.spins + st.minis + st.xspins));
      txt('pPps', S.time > 800 ? (st.pieces / (S.time / 1000)).toFixed(2) : '0.00');
    }
  }

  // ---------- menu hero: a T-spin played on loop ----------
  var hero = { g: null, steps: null, D: null, wait: 0 };
  var HERO_BOARD = ['.....JJ...', 'SSZ...JLLL', 'SZZO.IIIIL', 'LLLOOSSJJ.', 'ZZIOOLSSJ.'];
  function heroLoad() {
    hero.g = new ZZ.Game({ board: HERO_BOARD, queue: ['T'], manual: true, seed: 3 });
    hero.steps = Bot.solve(hero.g.grid, ['T'], { spin: 'full', lines: 2 });
    hero.g.start();
    if (hero.g.cur) hero.g.cur.y = ROWS - V.hero.rows;
    hero.D = { si: 0, ai: 0, t: -500, drop: false };
    hero.wait = 0;
    V.hero.vis.ox = V.hero.vis.oy = V.hero.vis.ang = 0;
  }
  function heroLayout() {
    var w = el.menu.clientWidth || 360, cell = clamp(Math.floor(Math.min(w, 560) * 0.4 / COLS), 10, 18);
    V.hero.resize(cell);
    if (!hero.g) heroLoad();
  }
  function heroTick(dt, now) {
    var g = hero.g, v = V.hero;
    if (!g) return;
    if (env.reduce) {
      v.draw(g, now, { dt: dt, ghost: false, target: hero.steps ? { cells: stepCells(hero.steps[0]), strong: true } : null });
      return;
    }
    if (hero.wait > 0) {
      hero.wait -= dt;
      if (hero.wait <= 0) heroLoad();
    } else if (!hero.steps || stepDemo(hero.D, g, hero.steps, dt, 470, null)) {
      hero.wait = 1900;
    }
    var ev = g.events;
    g.events = [];
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'move') v.vis.ox -= e.dx;
      else if (e.type === 'rotate') { v.vis.ox -= e.dx; v.vis.oy -= e.dy; v.vis.ang -= 90 * e.dir; if (e.spin !== 'none') v.addSpark(g, now); }
      else if (e.type === 'lock' && e.lines) { v.addClear(e.rows, e.rowColors, now, true); v.addShine(now); }
    }
    v.settle(dt);
    v.draw(g, now, { dt: dt, ghost: true });
  }

  // ---------- main loop ----------
  function countTick(dt) {
    S.countT += dt;
    var n = 3 - Math.floor(S.countT / 620);
    if (n === S.shown) return;
    S.shown = n;
    if (n > 0) { banner(String(n), 'num'); sfx.play('count'); }
    else {
      banner('開始', '', 520);
      sfx.play('go');
      S.state = 'play';
      S.me.start();
      if (S.opp) S.opp.start();
    }
  }
  function playTick(dt) {
    var fz = S.freeze;
    if (S.kind === 'battle') {
      S.left -= dt;
      if (S.left <= 0) { S.left = 0; endBattle(); return; }
      var sides = ['me', 'opp'];
      for (var i = 0; i < 2; i++) {
        var k = sides[i];
        if (S.down[k] > 0) {
          S.down[k] -= dt;
          if (S.down[k] <= 0) { S.down[k] = 0; V[k].koT = 0; S[k].revive(); }
        }
        if (fz[k] > 0) fz[k] = Math.max(0, fz[k] - dt);
      }
      if (fz.opp <= 0) {
        if (!S.opp.over) S.bot.update(dt);
        S.opp.update(dt);
        if (S.o.items) botItems(dt);
      }
    } else {
      S.time += dt;
    }
    if (fz.me > 0) return;
    input.update(dt);
    S.me.update(dt);
  }
  function frame(now) {
    window.requestAnimationFrame(frame);
    var dt = Math.min(50, Math.max(0, now - last));
    last = now;
    if (screen === 'menu') { if (!sheetName) heroTick(dt, now); return; }
    if (!S) return;
    if (S.state === 'count') countTick(dt);
    else if (S.state === 'play') playTick(dt);
    else if (S.state === 'demo') {
      if (stepDemo(S.demo, S.me, S.steps, dt, 560, stripText)) {
        S.state = 'wait'; S.wait = 1500;
        S.after = function () { loadDrill(S.drill); toast('換你試試看。'); };
      }
    } else if (S.state === 'wait') {
      S.wait -= dt;
      if (S.wait <= 0) { var f = S.after; S.after = null; if (f) f(); }
    }
    if (!S) return;
    pump(S.me, V.me, true, now);
    if (S && S.opp) pump(S.opp, V.opp, false, now);
    if (!S) return;
    var live = S.state !== 'pause';
    V.me.settle(live ? dt : 0.0001);
    V.me.draw(S.me, now, { dt: live ? dt : 0, ghost: set.ghost, lockWash: true, danger: true, target: S.target, frost: S.freeze.me > 0, shield: S.me.shield > 0 });
    if (S.opp) {
      V.opp.settle(live ? dt : 0.0001);
      V.opp.draw(S.opp, now, { dt: live ? dt : 0, ghost: false, frost: S.freeze.opp > 0, shield: S.opp.shield > 0 });
    }
    var s = V.me.sh;
    el.wellWrap.style.transform = Math.abs(s.x) + Math.abs(s.y) > 0.25 ? 'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)' : '';
    drawSide();
    drawChips();
    updateHud();
  }

  // ---------- boot ----------
  function start(data) {
    ['app', 'menu', 'play', 'hud', 'hudL', 'hudC', 'hudR', 'strip', 'stage', 'colL', 'colR', 'holdBox', 'holdCv', 'itemBox', 'itemCv', 'oppMini', 'oppName', 'oppCv',
      'chips', 'wellWrap', 'wellCv', 'pops', 'banner', 'nextCv', 'tools', 'pauseBtn', 'oppWide', 'oppNameW', 'oppFrame', 'pad', 'itemKey', 'halfKey', 'toast', 'rotate',
      'sheet', 'sheetCard', 'demoCv'].forEach(function (id) { el[id] = $(id); });
    loadStore();
    View.readTheme();
    View.terrazzo();
    V.me = new View.BoardView(el.wellCv, { meter: true });
    V.opp = new View.BoardView(el.oppCv, { plain: true, sky: 0 });
    V.hero = new View.BoardView(el.demoCv, { rows: 8, sky: 0 });
    bindInput();
    bindSheets();
    applySettings();
    show('menu');
    var retheme = function () {
      View.readTheme();
      View.terrazzo();
      V.me.bg = V.opp.bg = V.hero.bg = null;
    };
    if (window.matchMedia) {
      var m = window.matchMedia('(prefers-color-scheme: dark)');
      if (m.addEventListener) m.addEventListener('change', retheme); else if (m.addListener) m.addListener(retheme);
    }
    if (window.MutationObserver) new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', function () { if (screen === 'play') layout(); else heroLayout(); });
    document.addEventListener('pointerdown', function () { sfx.wake(); }, { passive: true });
    // Item tiles are drawn with the page font; redraw them once the web font has arrived.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { env.font = ''; View.clearItemSprites(); V.me.itiles = null; if (S) layout(); }).catch(function () { /* fallback font stays */ });
    }
    if (data && data.dojo && data.screen === 'dojo') begin('dojo', { drill: data.drill || 0 });
    last = performance.now();
    window.requestAnimationFrame(frame);
  }

  ZZ.peek = function () { return { S: S, V: V, set: set, save: save, screen: screen, sheet: sheetName, sfx: sfx, useItem: useItem }; };

  var hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(function () { return { screen: S ? S.kind : 'menu', dojo: !!(S && S.kind === 'dojo'), drill: S && S.kind === 'dojo' ? S.drill : 0 }; }); } catch (e) { /* viewer feature only */ }
  }
  function boot(data) { try { start(data || {}); } catch (e) { if (window.console) console.error(e); } }
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
})();
