/* 轉磚 app core: screens, input, the match loop, the HUD and the built-in sheets.
   Feature files (shop.js, modes.js) plug in through ZZ.App. Every visible string goes through ZZ.L.t(). */
(function () {
  'use strict';
  var ZZ = window.ZZ, Bot = ZZ.Bot, View = ZZ.View, env = View.env, ITEMS = ZZ.ITEMS, Meta = ZZ.Meta, L = ZZ.L, t = L.t;
  var COLS = ZZ.COLS, ROWS = ZZ.ROWS, VIS = ZZ.VIS, SHAPES = ZZ.SHAPES, DRILLS = ZZ.DRILLS;
  var SKY = 1.25;
  var $ = function (id) { return document.getElementById(id); };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- settings and saved progress ----------
  var ACTIONS = ['L', 'R', 'D', 'HD', 'CW', 'CCW', '180', 'HOLD', 'ITEM', 'PAUSE', 'RESTART', 'UNDO'];
  var KEYDEF = {
    L: ['ArrowLeft', 'KeyA'], R: ['ArrowRight', 'KeyD'], D: ['ArrowDown', 'KeyS'], HD: ['Space'],
    CW: ['ArrowUp', 'KeyW', 'KeyX', 'KeyK'], CCW: ['KeyZ', 'KeyJ', 'ControlLeft', 'ControlRight'], '180': ['KeyQ', 'KeyL'],
    HOLD: ['KeyC', 'KeyE', 'ShiftLeft', 'ShiftRight'], ITEM: ['KeyF', 'KeyV', 'Enter'], PAUSE: ['KeyP'], RESTART: ['KeyR'], UNDO: ['KeyU', 'Backspace']
  };
  var KEY_MAX = 4;
  var DEF = {
    das: 140, arr: 20, sdf: 80, lock: 500, smooth: !env.reduce, ghost: true, radar: false, hint: true,
    vol: 60, mvol: 45, real: true, haptic: true, swap: false, half: false, pad: 1, lang: '', ai: 0
  };
  // (level: which computer rival was picked last. Someone new starts against the gentlest one.)
  var set = {}, save = { best: 0, dojo: 0, level: 5, minutes: 2, tip: 0, items: 1, itip: 0 };
  var STORE = 'zhuanzhuan.v2';
  function keyCopy(src) { var o = {}; ACTIONS.forEach(function (a) { o[a] = (src && Array.isArray(src[a]) ? src[a] : KEYDEF[a]).filter(function (c) { return typeof c === 'string'; }).slice(0, KEY_MAX); }); return o; }
  function loadStore() {
    var k;
    for (k in DEF) set[k] = DEF[k];
    set.keys = keyCopy(null);
    try {
      var raw = window.localStorage.getItem(STORE);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && d.set) {
        for (k in DEF) if (typeof d.set[k] === typeof DEF[k]) set[k] = d.set[k];
        if (d.set.keys && typeof d.set.keys === 'object') set.keys = keyCopy(d.set.keys);
      }
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
  function itemsOn() { return !!S && S.kind === 'battle' && (!!S.o.items || !!(S.o.bring && S.o.bring.length)); }
  function kindOf() { return S ? App.kinds[S.kind] : null; }
  function rankName(r) { return t('tier' + r.tier) + (r.top ? '' : ' ' + ['III', 'II', 'I'][r.div]); }

  // ---------- plug-in surface ----------
  // sheets[name]() returns html, opened[name]() runs after it is shown, closed[name]() after it goes away,
  // acts[name](button) handles data-do, clicks/inputs are tried for anything else, go[name]() handles menu buttons,
  // kinds[name] adds a play mode, taps see every event of the player's own game.
  var App = ZZ.App = {
    sheets: {}, opened: {}, closed: {}, acts: {}, clicks: [], inputs: [], go: {}, kinds: {}, taps: [], again: {}, tools: {},
    dismiss: { battle: 1, dojo: 1, settings: 1, help: 1, keys: 1 }, capture: null
  };

  // ---------- keys ----------
  var KEYS = {};
  function rebuildKeys() {
    KEYS = {};
    ACTIONS.forEach(function (a) { set.keys[a].forEach(function (c) { if (!KEYS[c]) KEYS[c] = a; }); });
  }
  var KEYNAME = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Esc', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`'
  };
  function keyName(c) {
    if (!c) return '';
    if (c === 'Space') return t('kb.space');
    if (KEYNAME[c]) return KEYNAME[c];
    if (c.indexOf('Key') === 0) return c.slice(3);
    if (c.indexOf('Digit') === 0) return c.slice(5);
    if (c.indexOf('Numpad') === 0) return 'Num ' + c.slice(6);
    return c;
  }
  function key1(a) { return keyName(set.keys[a][0]) || '?'; }
  function padName(k) { return '「' + t(k) + '」'; }

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
    if (k === 'PAUSE') return pause();
    if (k === 'RESTART') return restart();
    if (k === 'UNDO') return undo();
    if (k === 'ITEM') { useItem('me'); return; }
    if (!input.can()) return;
    var me = S.me;
    if (k === 'HD') { if (performance.now() >= (S.guard || 0)) me.hardDrop(); }
    else if (k === 'CW') me.rotate(1);
    else if (k === 'CCW') me.rotate(-1);
    else if (k === '180') me.rotate(2);
    else if (k === 'HOLD' && S.kind !== 'dojo') me.hold();
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      sfx.wake();
      if (App.capture) { e.preventDefault(); App.capture(e); return; }
      if (sheetName) {
        if (e.code === 'Escape') { e.preventDefault(); sheetDo(sheetName === 'pause' ? 'resume' : 'close'); }
        return;
      }
      if (screen !== 'play') return;
      if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) pause(); return; }
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      var k = KEYS[e.code];
      if (k) { e.preventDefault(); if (!e.repeat) act(k, true); }
    });
    window.addEventListener('keyup', function (e) { var k = KEYS[e.code]; if (k) act(k, false); });
    window.addEventListener('blur', function () { input.clear(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { input.clear(); if (!(S && S.mode === 'net')) pause(); }
      sfx.hush(document.hidden);
    });

    // Touch keys. A thumb can slide between left and right without lifting; every other key needs its own tap,
    // and a key stays down until the finger lifts even if it drifts off the edge.
    // The keys live in three places: the pad under the wall and the two side strips beside it (hold, item, half turn).
    var ptrs = {}, SLIDE = { L: 1, R: 1 };
    function keyAt(root, x, y) {
      var e = document.elementFromPoint(x, y);
      e = e && e.closest ? e.closest('.key') : null;
      return e && root.contains(e) ? e : null;
    }
    function press(k) { k.classList.add('on'); act(k.dataset.k, true); buzz(7); }
    function lift(k) { k.classList.remove('on'); act(k.dataset.k, false); }
    function end(e) {
      var cur = ptrs[e.pointerId];
      if (cur) lift(cur);
      delete ptrs[e.pointerId];
      sfx.wake();
    }
    function bindKeys(root) {
      root.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        sfx.wake();
        var k = keyAt(root, e.clientX, e.clientY);
        if (!k) return;
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
        ptrs[e.pointerId] = k;
        press(k);
      });
      root.addEventListener('pointermove', function (e) {
        if (!(e.pointerId in ptrs)) return;
        var cur = ptrs[e.pointerId], k = keyAt(root, e.clientX, e.clientY);
        if (!cur || !k || k === cur || !SLIDE[cur.dataset.k] || !SLIDE[k.dataset.k]) return;
        lift(cur);
        ptrs[e.pointerId] = k;
        press(k);
      });
      root.addEventListener('pointerup', end);
      root.addEventListener('pointercancel', end);
      root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      root.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    }
    bindKeys(el.pad); bindKeys(el.sideL); bindKeys(el.sideR);
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
      if (App.tools[a] && kindOf()) { sfx.play('ui'); App.tools[a](); }
      else if (a === 'undo') undo();
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
    var box = screen === 'play' && !sheetName ? el.toast : el.mtoast;
    el.toast.hidden = true; el.mtoast.hidden = true;
    box.textContent = msg;
    box.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.toast.hidden = true; el.mtoast.hidden = true; }, ms || 2200);
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
  function spinName(type, spin) { return type === 'T' ? t(spin === 'mini' ? 'p.mini' : 'p.tspin') : type === 'I' ? t('p.ispin') : t('p.xspin', type); }
  function clearName(type, spin, lines) { return spinName(type, spin) + (lines ? t('sep') + t('ln' + lines) : ''); }
  function popup(e) {
    var main = '', gold = false, tags = [];
    if (e.tspin !== 'none') { main = clearName(e.piece, e.tspin, e.lines); gold = true; }
    else if (e.lines >= 2) main = t('ln' + e.lines);
    if (e.b2b) tags.push(t('p.b2b'));
    if (e.combo > 0) tags.push(t('chip.combo', e.combo));
    if (e.perfect) tags.push(t('p.perfect'));
    if (!main && !tags.length && !e.attack) return;
    popRaw(main, tags, e.attack, gold);
  }
  function txt(id, v) {
    var e = $(id);
    if (e && e._v !== v) { e._v = v; e.textContent = v; }
  }
  function stat(id, label) { return '<div class="stat"><b id="' + id + '">0</b><span>' + label + '</span></div>'; }
  function coin(n) { return '<span class="coinv"><i class="coin"></i>' + L.num(n) + '</span>'; }
  function itile(id) { return '<span class="itile" style="--c:' + ITEMS[id].color + '">' + View.itemSvg(id) + '</span>'; }

  // ---------- starting a mode ----------
  var TRACK = ['battle1', 'battle1', 'battle2', 'battle2', 'battle3', 'battle1', 'battle1'];   // by level number
  function aiStep() { return clamp(Math.round(+set.ai || 0), -2, 2); }
  function begin(kind, o) {
    o = o || {};
    closeSheet(true);
    input.clear();
    banner('');
    el.pops.innerHTML = '';
    var seed = o.seed != null ? o.seed >>> 0 : (Math.random() * 4294967296) >>> 0, K = App.kinds[kind];
    S = {
      kind: kind, o: o, state: 'count', countT: 0, shown: 9, time: 0, hist: [], target: null, wait: 0, after: null, prev: 'play',
      flip: false, freeze: { me: 0, opp: 0 }, botItemT: 0, botChk: 0, botHoles: 0, mode: '', used: 0
    };
    if (kind === 'battle') {
      var mode = o.mode || 'ai';
      S.mode = mode;
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, items: !!o.items, bring: o.bring || [] });
      S.total = o.minutes * 60000; S.left = S.total;
      S.ko = { me: 0, opp: 0 }; S.down = { me: 0, opp: 0 };
      if (mode === 'net' && o.multi) {
        // three or four players: a mirror wall for each of the others; the one picked as the target is on show
        var M = o.multi, foes = {}, order = [], myTeam = M.teams ? M.teams[M.me] : -1;
        M.roster.forEach(function (st) {
          if (st === M.me) return;
          foes[st] = { seat: st, name: M.names[st] || t('foe'), team: M.teams ? M.teams[st] : -1, g: new ZZ.Game({ seed: seed, manual: true, garbage: false }), downs: 0, sent: 0, gone: false };
          order.push(st);
        });
        S.multi = { me: M.me, teams: M.teams, myTeam: myTeam, foes: foes, order: order, target: null };
        S.remote = true; S.bot = null;
        var first = order.filter(enemy)[0];
        S.multi.target = first; S.opp = foes[first].g; S.oppName = foes[first].name;
        S.me.onAttack = function (n) { ZZ.Net.attack(n); };
      } else if (mode === 'net') {
        S.opp = new ZZ.Game({ seed: seed, manual: true, garbage: false });   // a mirror of the other player's wall
        S.remote = true; S.bot = null;
        S.oppName = o.oppName || t('foe');
        S.me.onAttack = function (n) { ZZ.Net.attack(n); };
      } else if (mode === 'ghost') {
        S.opp = new ZZ.Game({ seed: seed, manual: true, queue: ZZ.Replay.queueOf(o.rep) });
        S.bot = new ZZ.Replay.Ghost(S.opp, o.rep, { onItem: foeItem, onTakeOver: function () { toast(t('gh.takeover'), 3800); } });
        S.oppName = t('gh.name');
      } else {
        var cfg = mode === 'rank' ? o.cfg : Bot.eased(Bot.LEVELS[o.level], aiStep());   // ranked is the same for everyone
        S.opp = new ZZ.Game({ seed: seed, manual: true, items: !!o.items });
        S.bot = new Bot.BotPlayer(S.opp, { pps: cfg.pps, depth: cfg.depth, hold: cfg.hold, noise: cfg.noise, w: cfg.w });
        S.oppName = mode === 'rank' ? o.foe : t('lv' + o.level);
        if (o.quickCpu) S.oppName = t('net.cpuTag', S.oppName);      // from random matchmaking: say plainly that it is the computer
      }
      if (mode !== 'net') {
        S.me.onAttack = function (n) { S.opp.receive(n); };
        S.opp.onAttack = function (n) { S.me.receive(n); };
      }
      S.level = mode === 'rank' ? o.cfg.level : mode === 'ai' ? o.level : 2;
      S.rec = ZZ.Replay ? new ZZ.Replay.Recorder({ seed: seed, minutes: o.minutes, items: !!o.items, mode: mode, foe: S.oppName }) : null;
      S.tape = ZZ.Replay ? new ZZ.Replay.Tape(seed, !!o.items || (o.bring && o.bring.length)) : null;
    } else if (kind === 'sprint') {
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, garbage: false });
      S.goal = 40;
      S.tape = ZZ.Replay ? new ZZ.Replay.Tape(seed, false) : null;
    } else if (kind === 'practice') {
      S.me = new ZZ.Game({ seed: seed, sdf: sdfVal(), lockDelay: set.lock, garbage: false });
      S.state = 'play';
    } else if (kind === 'dojo') {
      S.drill = clamp(o.drill || 0, 0, DRILLS.length - 1);
    } else if (K) {
      K.begin(S, o);
    }
    show('play');
    V.me.fx = []; V.me.parts = []; V.me.koT = 0; V.opp.fx = []; V.opp.parts = []; V.opp.koT = 0;
    setupHud();
    if (kind === 'dojo') loadDrill(S.drill);
    layout();
    if (kind === 'practice') S.me.start();
    if (K && K.started) K.started();
    sfx.setDuck(1);
    sfx.music(kind === 'battle' ? TRACK[S.level] : kind === 'sprint' ? 'battle1' : 'calm');
    if (!env.touch && !save.tip) {
      save.tip = 1; saveStore();
      toast(t('tip.keys', key1('L'), key1('R'), key1('CW'), key1('CCW'), key1('D'), key1('HD'), key1('HOLD')), 6500);
    }
  }

  // ---------- three or four players ----------
  function enemy(seat) { var M = S && S.multi; return !!M && !!M.foes[seat] && (!M.teams || M.teams[seat] !== M.myTeam); }
  function setTarget(seat) {
    var M = S && S.multi, f = M && M.foes[seat];
    if (!f || f.gone || !enemy(seat) || M.target === seat) return;
    M.target = seat; S.opp = f.g; S.oppName = f.name;
    V.opp.fx = []; V.opp.parts = []; V.opp.koT = 0;
    setupHud(); foeKey = '';
    sfx.play('move');
  }
  function foeGone(seat) {
    var M = S && S.multi, f = M && M.foes[seat];
    if (!f || f.gone) return;
    f.gone = true; foeKey = '';
    toast(t('mp.left', f.name), 3000);
    if (S.state === 'over') return;
    var live = M.order.filter(function (s) { return enemy(s) && !M.foes[s].gone; });
    if (!live.length) return endBattle('left');
    if (M.target === seat) { M.target = null; setTarget(live[0]); }
  }
  var foeKey = '';
  function drawFoes() {
    var M = S.multi;
    if (!M) return;
    var key = M.target + '|' + L.lang + '|' + M.order.map(function (s) { var f = M.foes[s]; return s + ':' + f.downs + ':' + f.sent + ':' + (f.gone ? 1 : 0) + ':' + stackOf(f.g); }).join(',');
    if (key === foeKey) return;
    foeKey = key;
    var h = '';
    M.order.forEach(function (s) {
      var f = M.foes[s], foe = enemy(s), on = M.target === s, hi = stackOf(f.g);
      h += '<button type="button" class="foe' + (on ? ' on' : '') + (f.gone ? ' gone' : '') + (foe ? '' : ' mate') + (M.teams ? ' t' + f.team : '') + '" data-foe="' + s + '"' +
        (foe && !f.gone ? ' aria-pressed="' + on + '"' : ' disabled') + '><b>' + esc(f.name) + '</b><span>' + (f.gone ? t('mp.gone') : foe ? t('mp.downs', f.downs) : t('mp.mate')) +
        '</span><i style="--h:' + Math.round(hi / VIS * 100) + '%"></i></button>';
    });
    el.strip.innerHTML = '<div class="foes">' + h + '</div>';
  }
  function stackOf(g) {
    for (var r = 0; r < g.grid.length; r++) for (var x = 0; x < g.grid[r].length; x++) if (g.grid[r][x]) return g.grid.length - r;
    return 0;
  }
  // where everybody finished, best first: fewest knockouts, then most lines sent; players who left come last
  function standings(why) {
    var M = S.multi, Net = ZZ.Net, list = [{ seat: M.me, name: t('you'), me: true, team: M.myTeam, downs: S.ko.opp, sent: S.me.stats.sent, score: S.me.stats.score, gone: false }];
    M.order.forEach(function (s) {
      var f = M.foes[s], p = Net.peers[s], e = p && p.end;
      list.push({ seat: s, name: f.name, team: f.team, downs: e ? e.downs : f.downs, sent: e ? e.sent : f.sent, score: e ? e.score : f.g.stats.score, gone: f.gone });
    });
    var better = function (a, b) { return (a.gone - b.gone) || (a.downs - b.downs) || (b.sent - a.sent); };
    list.sort(better);
    list.forEach(function (p, i) { p.place = i && !better(list[i - 1], p) ? list[i - 1].place : i + 1; });
    var out = { list: list, teams: null, r: 0 };
    if (M.teams) {
      var tm = [0, 1].map(function (k) {
        var mine = list.filter(function (p) { return p.team === k; });
        return { downs: mine.reduce(function (a, p) { return a + p.downs; }, 0), sent: mine.reduce(function (a, p) { return a + p.sent; }, 0), out: mine.every(function (p) { return p.gone; }) };
      });
      out.teams = tm;
      var us = tm[M.myTeam], them = tm[1 - M.myTeam];
      out.r = why === 'left' || (them.out && !us.out) ? 1 : us.downs !== them.downs ? (us.downs < them.downs ? 1 : -1) : us.sent !== them.sent ? (us.sent > them.sent ? 1 : -1) : 0;
    } else {
      var me = list.filter(function (p) { return p.me; })[0], tops = list.filter(function (p) { return p.place === 1; }).length;
      out.r = why === 'left' ? 1 : me.place === 1 ? (tops > 1 ? 0 : 1) : -1;
    }
    out.foeDowns = list.filter(function (p) { return !p.me && (!M.teams || p.team !== M.myTeam); }).reduce(function (a, p) { return a + p.downs; }, 0);
    return out;
  }

  function restart() {
    if (!S || S.kind === 'battle') return;
    var K = kindOf();
    if (K && K.restart) return K.restart();
    if (S.kind === 'dojo') { loadDrill(S.drill); return; }
    begin(S.kind, S.o);
  }

  function setupHud() {
    var k = S.kind, K = kindOf();
    el.strip.hidden = !(k === 'dojo' || (K && K.strip));
    if (k === 'battle' && S.multi) {
      el.strip.hidden = false;
      foeKey = '';
      var nameM = '<span class="who">' + esc(S.oppName) + '</span>', youM = '<span class="who">' + t('you') + '</span>';
      el.hudL.innerHTML = youM + stat('koOpp', t('mp.down')) + stat('sentMe', t('sent'));
      el.hudR.innerHTML = stat('sentOpp', t('sent')) + stat('downT', t('mp.down')) + nameM;
      el.hudC.innerHTML = '<div id="clock">' + fmtClock(S.left) + '</div><div id="ptsMe" class="pts"></div>';
      el.oppName.textContent = t('mp.target', S.oppName);
      el.oppNameW.textContent = t('mp.target', S.oppName);
    } else if (k === 'battle') {
      var name = '<span class="who">' + esc(S.oppName) + '</span>', you = '<span class="who">' + t('you') + '</span>';
      if (S.flip) {
        el.hudL.innerHTML = name + stat('koOpp', t('ko')) + stat('sentOpp', t('sent'));
        el.hudR.innerHTML = stat('sentMe', t('sent')) + stat('koMe', t('ko')) + you;
      } else {
        el.hudL.innerHTML = you + stat('koMe', t('ko')) + stat('sentMe', t('sent'));
        el.hudR.innerHTML = stat('sentOpp', t('sent')) + stat('koOpp', t('ko')) + name;
      }
      el.hudC.innerHTML = '<div id="clock">' + fmtClock(S.left) + '</div><div id="ptsMe" class="pts"></div>';
      el.oppName.textContent = S.oppName;
      el.oppNameW.textContent = S.oppName;
    } else if (k === 'sprint') {
      el.hudL.innerHTML = stat('linesLeft', t('linesLeft'));
      el.hudC.innerHTML = '<div id="clock">0:00.00</div><div id="ptsMe" class="pts"></div>';
      el.hudR.innerHTML = '<div class="stat"><b id="bestT">' + (Meta.data.tot.sprint ? fmtTime(Meta.data.tot.sprint) : '—') + '</b><span>' + t('best') + '</span></div>';
    } else if (k === 'practice') {
      el.hudL.innerHTML = stat('pAtk', t('pAtk')) + stat('pSpin', t('pSpin'));
      el.hudC.innerHTML = '<div class="hud-title">' + t('m.practice') + '</div><div id="ptsMe" class="pts"></div>';
      el.hudR.innerHTML = stat('pPps', t('pPps'));
    } else if (k === 'dojo') {
      el.hudL.innerHTML = '<span class="who" id="dNo"></span>';
      el.hudC.innerHTML = '<div class="hud-title" id="dName"></div>';
      el.hudR.innerHTML = '<div class="stat"><b id="dDone">0</b><span>' + t('clearedN') + '</span></div>';
    } else if (K) {
      K.hud();
    }
    el.play.classList.toggle('nohold', k === 'dojo');
    sideKeys();
    setTools();
    sideKey = ''; chipKey = '';
  }
  // The keys beside the wall. Hold and the half turn sit above the rotate keys, the item key above the move keys;
  // on a touch screen the item key also shows what is in the bag, so the item box at the top is not needed there.
  function sideKeys() {
    var items = itemsOn(), k = S ? S.kind : '';
    var spin = set.swap ? el.sideL : el.sideR, move = set.swap ? el.sideR : el.sideL;
    if (el.holdKey.parentNode !== spin) { spin.appendChild(el.halfKey); spin.appendChild(el.holdKey); }
    if (el.itemKey.parentNode !== move) move.appendChild(el.itemKey);
    el.itemBox.hidden = !items || env.touch;
    el.itemKey.hidden = !items;
    el.halfKey.hidden = !set.half;
    el.holdKey.hidden = k === 'dojo' || k === 'lesson';   // nothing to hold in a drill or a lesson
    spin.hidden = !env.touch || (el.holdKey.hidden && el.halfKey.hidden);
    move.hidden = !env.touch || el.itemKey.hidden;
  }

  function tool(a, key, pressed) { return '<button class="tool" type="button" data-act="' + a + '"' + (pressed != null ? ' aria-pressed="' + pressed + '"' : '') + '>' + t(key) + '</button>'; }
  function setTools() {
    var k = S ? S.kind : '', h = '', K = kindOf();
    if (k === 'practice') h = tool('undo', 'tool.undo') + tool('restart', 'tool.clear');
    else if (k === 'sprint') h = tool('restart', 'restart');
    else if (k === 'dojo') h = tool('demo', 'tool.demo') + tool('restart', 'restart') + tool('hint', 'tool.hint', set.hint ? 'true' : 'false');
    else if (K && K.tools) h = K.tools();
    el.tools.innerHTML = h;
    el.tools.hidden = !h;
  }

  // ---------- spin dojo ----------
  // What to press for each solver move, named after the player's own keys.
  function actName(a) {
    if (a === 'hold') return t('act.hold', env.touch ? padName('hold') : key1('HOLD'));
    if (a === 'hd') return t('act.hd', env.touch ? padName('k.hard') : key1('HD'));
    var keys = ['act.l', 'act.r', 'act.cw', 'act.ccw', 'act.sd'], who = ['L', 'R', 'CW', 'CCW', 'D'], pads = ['', '', 'k.cw', 'k.ccw', 'k.soft'];
    return t(keys[a], env.touch ? (pads[a] ? padName(pads[a]) : (a === 0 ? '←' : '→')) : key1(who[a])).trim();
  }
  function goalPiece(d) { return d.goal.piece || 'T'; }
  function goalText(d) { return clearName(goalPiece(d), d.goal.spin, d.goal.lines); }
  function loadDrill(i) {
    var d = DRILLS[i], want = goalPiece(d);
    S.drill = i; S.d = d;
    S.me = new ZZ.Game({ board: d.board, queue: d.queue, seed: 1, gravity: 1 / 1500, lockDelay: Math.max(1000, set.lock), garbage: false, sdf: sdfVal() });
    S.steps = Bot.solve(S.me.grid, d.queue, d.goal);
    S.tLeft = d.queue.filter(function (q) { return q === want; }).length;
    S.state = 'play'; S.demo = null; S.target = null; S.say = null; S.demoDone = null;
    input.clear();
    banner('');
    V.me.fx = []; V.me.koT = 0;
    S.me.start();
    stripText('');
    txt('dNo', t('drillNo', i + 1));
    txt('dName', t('d.' + d.id + '.n'));
    txt('dDone', save.dojo + '/' + DRILLS.length);
    sideKey = '';
  }
  function keysNote() { return env.touch ? '' : '<br><span class="keys-note">' + esc(t('keysNote', key1('CW'), key1('CCW'), key1('D'), key1('HD'))) + '</span>'; }
  function stripText(now) {
    var d = S.d;
    el.strip.innerHTML = now ? '<b>' + esc(t('demo', goalText(d))) + '</b><br><span class="now">' + esc(now) + '</span>'
      : '<b>' + esc(t('goal', goalText(d))) + '</b>　' + esc(t('d.' + d.id + '.t')) + keysNote();
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
        return drillFail(t(e.tspin === 'none' ? 'f.noSpin' : 'f.lines'));
      }
    }
    if (!me.cur) return;
    S.steps = Bot.solve(me.grid, [me.cur.type].concat(me.queue), d.goal);
    if (!S.steps) drillFail(t('f.stuck', want));
  }
  function drillWin() {
    sfx.play('win');
    buzz([20, 40, 60]);
    banner(t('b.pass'), 'good', 1400);
    if (S.drill + 1 > save.dojo) { save.dojo = S.drill + 1; saveStore(); }
    var got = Meta.firstClear('drills', S.drill);
    if (got) toast(t('firstClear', got), 2600);
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
    stripText(t('demoStart'));
  }
  function runAct(g, a) {
    if (a === Bot.L) return g.move(-1);
    if (a === Bot.R) return g.move(1);
    if (a === Bot.CW) return g.rotate(1);
    if (a === Bot.CCW) return g.rotate(-1);
    return g.sonicDrop();
  }
  // Plays solver steps on a game at a watchable pace. Returns true when the last piece has been placed.
  // A step may be { hold: true }: press hold and move on.
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
    if (st.hold) {
      if (say) say(actName('hold'));
      g.hold();
      D.si++; D.ai = 0;
      return D.si >= steps.length;
    }
    if (D.ai < st.path.length) {
      var a = st.path[D.ai++];
      if (say) say(actName(a) + (D.ai === st.path.length && st.spin && st.spin !== 'none' ? t('act.spin') : ''));
      if (a === Bot.SD) D.drop = true; else runAct(g, a);
      return false;
    }
    if (say) say(actName('hd'));
    g.hardDrop();
    D.si++; D.ai = 0;
    return D.si >= steps.length;
  }

  // ---------- items ----------
  function itemFx(id, mine, note) {
    var now = performance.now();
    if (mine) {
      sfx.play('itemUse');
      buzz(16);
      popRaw(t('i' + id), [t('i' + id + 't')], 0, id === 4);
      if (id === 2 || id === 6) V.opp.addWash(now, id === 6 ? '190,232,255' : '217,67,47', 420);
      if (id === 3) V.me.addWash(now, '88,170,255', 420);
      if (id === 4) V.me.addWash(now, '245,184,46', 420);
    } else {
      var hit = id === 2 || id === 6;
      if (hit) { sfx.play('itemHit'); buzz(30); V.me.addWash(now, id === 6 ? '190,232,255' : '217,67,47', 420); }
      toast(t('foeUsed', t('i' + id)) + (id === 2 ? t(note ? 'foeUsed.grout' : 'foeUsed.tarp') : id === 6 ? t('foeUsed.ice') : ''), 2000);
    }
  }
  function useItem(k) {
    if (!itemsOn() || S.state !== 'play') return false;
    var g = S[k], other = k === 'me' ? 'opp' : 'me', og = S[other], mine = k === 'me';
    if (g.over || S.freeze[k] > 0 || !g.inv.length) return false;
    var id = g.takeItem(), note = true;
    if (id === 1) g.chisel(3);
    else if (id === 2) { if (!S.remote) { note = !(og.shield > 0); og.receive(3); } }
    else if (id === 3) { g.shield = 8000; g.pending = []; }
    else if (id === 4) g.queue.unshift('T', 'T');
    else if (id === 5) g.trowel();
    else if (id === 6) { if (!og.over) S.freeze[other] = 3000; if (other === 'me') input.clear(); }
    else if (id === 7) g.boost = 8000;
    if (!mine && S.bot) S.bot.plan = null;
    sideKey = '';
    if (mine) {
      S.used++;
      if (S.rec) S.rec.item(id);
      if (S.remote) ZZ.Net.item(id);
    }
    itemFx(id, mine, note);
    return true;
  }
  // The other side is a remote player or a recording: its item arrives as a bare id and lands on us here.
  function foeItem(id) {
    if (!S || S.kind !== 'battle' || S.state !== 'play') return;
    var note = true;
    if (id === 2) { note = !(S.me.shield > 0); S.me.receive(3); }
    else if (id === 6) { if (!S.me.over) { S.freeze.me = 3000; input.clear(); } }
    else if (id === 3 && !S.remote) { S.opp.shield = 8000; S.opp.pending = []; }
    else if (id === 7 && !S.remote) S.opp.boost = 8000;
    itemFx(id, false, note);
  }
  // The computer holds an item until it is useful, then plays it.
  function botItems(dt) {
    var g = S.opp;
    if (!g.inv.length || g.over || S.freeze.opp > 0) { S.botItemT = 0; return; }
    S.botItemT += dt;
    S.botChk -= dt;
    if (S.botChk <= 0) { S.botChk = 300; S.botHoles = Bot.features(Bot.rowsOf(g.grid)).holes; }
    var id = g.inv[0], tm = S.botItemT, wait = 700 + (6 - Bot.LEVELS[S.level].tier) * 450, late = g.inv.length >= 3 ? wait : wait + 4000, go = false;
    if (id === 1) go = tm > wait && (g.stackHeight() >= 9 || tm > late);
    else if (id === 5) go = tm > wait && (S.botHoles >= 3 || tm > late);
    else if (id === 3) go = tm > 400 && (g.pendingTotal() >= 2 || tm > late);
    else go = tm > wait;
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
    var K = kindOf(), i;
    if (mine) {
      if (S.rec) S.rec.on(g, e);
      if (S.tape && g === S.me) S.tape.on(g, e);
      for (i = 0; i < App.taps.length; i++) App.taps[i](g, e);
    }
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
        if (mine) { sfx.play('hold'); if (K && K.hold) K.hold(); }
        break;
      case 'topout':
        onTopOut(g, v, mine, now);
        break;
      case 'empty':
        if (mine && S.kind === 'dojo' && S.state === 'play') drillFail(t('f.empty'));
        else if (mine && K && K.empty) K.empty();
        break;
      case 'itemtile':
        if (mine) sfx.play('itemTile');
        break;
      case 'item':
        sideKey = '';
        if (mine) {
          sfx.play('itemGet');
          buzz(14);
          popRaw(t('p.got', t('i' + e.id)), [t('i' + e.id + 't')], 0, false);
          if (!save.itip) {
            save.itip = 1; saveStore();
            toast(env.touch ? t('tip.itemTouch') : t('tip.itemKey', key1('ITEM')), 4200);
          }
        }
        break;
      case 'itemfull':
        if (mine) toast(t('itemFull'));
        break;
      case 'blocked':
        if (mine) popRaw(t('p.blocked', e.n), [], 0, false);
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
    var me = S.me, ty = me.cur.type, sp = ty === 'O' ? null : Bot.findSpins(me, ty, false)[0], strong = !!sp;
    if (!sp && ty !== 'T') { sp = Bot.findSpins(me, 'T', false)[0]; strong = !!sp && me.holdType === 'T'; }
    if (!sp) return null;
    return { cells: stepCells(sp), strong: strong, label: clearName(sp.type, sp.spin, sp.lines) };
  }
  function onSpawn(e) {
    var me = S.me, K = kindOf();
    S.target = null;
    if (!me.cur) return;
    if (K && K.spawn) return K.spawn(e);
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
    var spun = e.tspin !== 'none', K = kindOf();
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
    if (K && K.lock) K.lock(e);
    else if (S.kind === 'dojo') drillLock(e);
    else if (S.kind === 'sprint' && S.me.stats.lines >= S.goal) endSprint();
  }
  function onTopOut(g, v, mine, now) {
    var K = kindOf();
    if (S.kind === 'battle' && S.multi && !mine) {
      v.knock(now); sfx.play('ko');      // the target went down: counted from its own report, not here
    } else if (S.kind === 'battle') {
      var k = mine ? 'me' : 'opp', other = mine ? 'opp' : 'me';
      S.ko[other]++;
      S[other].stats.score += 1500;
      S.down[k] = 1150;
      S.freeze[k] = 0;
      v.knock(now);
      sfx.play('ko');
      buzz(mine ? [60, 40, 80] : 40);
      if (mine) { input.clear(); banner(t('b.koed'), 'bad', 1000); }
      else popRaw(t('b.koFoe'), [], 0, true);
    } else if (S.kind === 'sprint') {
      S.state = 'over';
      sfx.play('lose');
      sfx.setDuck(0.4);
      openSheet('sprintFail');
    } else if (S.kind === 'practice') {
      toast(t('wallFull'));
      S.me.seed = (Math.random() * 4294967296) >>> 0;
      S.me.reset();
      S.me.start();
      S.hist = [];
    } else if (S.kind === 'dojo' && S.state === 'play') {
      drillFail(t('f.full'));
    } else if (K && K.topout) {
      K.topout();
    }
  }
  function undo() {
    if (!S || S.kind !== 'practice' || S.state !== 'play') return;
    if (S.hist.length < 2) { toast(t('undoFirst')); return; }
    S.hist.pop();
    S.me.restore(S.hist[S.hist.length - 1]);
    V.me.fx = [];
    sfx.play('undo');
  }

  // ---------- finishing ----------
  function rate(n, ms) { return ms > 0 ? n / (ms / 60000) : 0; }
  // why: '' time ran out, 'left' the other player went away, 'quit' we walked out of an online match
  function endBattle(why) {
    if (!S || S.state === 'over') return;
    S.state = 'over';
    input.clear();
    var st = S;
    var settle = function () {
      if (S !== st) return;
      var a = S.ko.me, b = S.ko.opp, ms = S.me.stats, os = S.opp.stats, played = S.total - S.left;
      var r = why === 'left' ? 1 : why === 'quit' ? -1 : a !== b ? (a > b ? 1 : -1) : ms.sent !== os.sent ? (ms.sent > os.sent ? 1 : -1) : 0;
      if (S.multi) { S.stand = standings(why); r = why === 'quit' ? -1 : S.stand.r; a = S.ko.me = Math.min(60, S.stand.foeDowns); }
      S.result = r; S.why = why || '';
      S.reward = Meta.finish({ mode: S.mode, result: r, level: S.level, stats: ms, ko: a, koOpp: b, itemsUsed: S.used, ms: played }, S.tape && !S.used ? S.tape.done() : null);
      S.saved = false;
      if (S.rec && ZZ.Replay && played > 20000) {
        S.saved = ZZ.Replay.save(S.rec.done({
          result: r, score: ms.score, sent: ms.sent, ko: a, pieces: ms.pieces, ms: played,
          pps: Math.round(ms.pieces / (played / 1000) * 100) / 100, apm: Math.round(rate(ms.attack, played) * 10) / 10, name: Meta.data.name
        }), Meta.isSub() ? 30 : 5);
      }
      sfx.setDuck(0.4);
      sfx.play(r > 0 ? 'cheer' : r === 0 ? 'win' : 'lose');
      if (!why) banner(t('b.time'), '', 900);
      setTimeout(function () { if (S === st && S.state === 'over') openSheet('battleEnd'); }, why ? 300 : 900);
    };
    if (S.remote && !why) ZZ.Net.finish(settle); else settle();
  }
  function endSprint() {
    S.state = 'over';
    input.clear();
    S.reward = Meta.finish({ mode: 'sprint', result: 1, ms: S.time, stats: S.me.stats }, S.tape ? S.tape.done() : null);
    S.newBest = S.reward.best;
    sfx.setDuck(0.4);
    sfx.play(S.newBest ? 'cheer' : 'win');
    openSheet('sprintEnd');
  }
  function pause() {
    if (!S || screen !== 'play' || sheetName) return;
    if (S.mode === 'net') { if (S.state === 'play' || S.state === 'count') openSheet('netLeave'); return; }
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
    if (S && S.mode === 'net' && ZZ.Net) ZZ.Net.leave();
    S = null;
    closeSheet(true);
    input.clear();
    show('menu');
  }

  // ---------- sheets ----------
  var pick = { level: 1, minutes: 2, items: true };
  function btn(act, key, main) { return '<button class="btn' + (main ? ' main' : '') + '" type="button" data-do="' + act + '">' + t(key) + '</button>'; }
  function rewardHtml(rw) {
    if (!rw) return '';
    var h = '', i;
    if (rw.rank) {
      var rk = rw.rank, to = rk.to, pct = to.top ? 100 : Math.round(to.into / to.need * 100);
      h += '<div class="rankbox' + (rk.up ? ' up' : '') + '"><b>' + esc(rankName(to)) + '</b><span>' + t('rateLine', (rk.delta >= 0 ? '+' : '') + rk.delta) + '</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }
    if (rw.coins) {
      h += '<div class="earn"><div class="earn-top"><span>' + t('earned') + '</span>' + coin(rw.coins) + '</div><ul>';
      for (i = 0; i < rw.parts.length; i++) h += '<li><span>' + esc(t('w.' + rw.parts[i].key, rw.parts[i].arg ? rankName(rw.parts[i].arg) : '')) + '</span><b>+' + rw.parts[i].n + '</b></li>';
      h += '</ul></div>';
    }
    for (i = 0; i < rw.jobs.length; i++) h += '<p class="note">' + esc(t('jobDone', t('j.' + rw.jobs[i]))) + '</p>';
    return h;
  }
  function keyRows() {
    var h = '<dl class="keys">', i;
    for (i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i], ks = set.keys[a].map(function (c) { return '<kbd>' + esc(keyName(c)) + '</kbd>'; });
      if (a === 'PAUSE') ks.unshift('<kbd>Esc</kbd>');
      h += '<dt>' + ks.join(' ') + '</dt><dd>' + t('a.' + a) + '</dd>';
    }
    return h + '</dl>';
  }
  function sheetHtml(name) {
    var h = '', i;
    if (App.sheets[name]) return App.sheets[name]();
    if (name === 'battle') {
      h = '<h2>' + t('pickFoe') + '</h2><div class="levels" role="radiogroup" aria-label="' + t('pickFoe') + '">';
      for (var oi = 0; oi < Bot.ORDER.length; oi++) {
        i = Bot.ORDER[oi];
        h += '<button class="lvl" type="button" role="radio" aria-checked="' + (pick.level === i) + '" data-level="' + i + '"><b>' + t('lv' + i) +
          '</b><span>' + t('lvn' + i) + '</span><i>' + t('pps', Bot.eased(Bot.LEVELS[i], aiStep()).pps) + '</i></button>';
      }
      h += '</div>' + (aiStep() ? '<p class="note">' + t('aiNow', t('s.ai' + aiKey(aiStep()))) + '</p>' : '') + '<h3>' + t('matchTime') + '</h3><div class="seg" role="radiogroup" aria-label="' + t('matchTime') + '">';
      for (i = 1; i <= 3; i++) h += '<button type="button" role="radio" aria-checked="' + (pick.minutes === i) + '" data-min="' + i + '">' + t('minutes', i) + '</button>';
      h += '</div><label class="toggle" for="bItems">' + t('itemsMode') + '<input type="checkbox" id="bItems"></label>' + bringHtml() +
        '<div class="row">' + btn('close', 'cancel') + btn('fight', 'fight', true) + '</div>';
    } else if (name === 'pause') {
      h = '<h2>' + t('pause') + '</h2><div class="row">' + btn('resume', 'resume', true) + '</div><div class="row">' +
        btn('again', S && S.kind === 'battle' ? 'rematch' : 'restart') + btn('settings', 'm.settings') + btn('help', 'm.help') + btn('menu', 'toMenu') + '</div>';
    } else if (name === 'battleEnd' && S.multi && S.stand) {
      var sd = S.stand, M = S.multi;
      h = '<h2>' + t(S.result > 0 ? 'r.win' : S.result < 0 ? 'r.lose' : 'r.draw') + '</h2>';
      if (sd.teams) h += '<div class="score"><div><b>' + sd.teams[M.myTeam].downs + '</b><span>' + t('mp.usDown') + '</span></div><i>' + t('r.vs') + '</i><div><b>' + sd.teams[1 - M.myTeam].downs + '</b><span>' + t('mp.themDown') + '</span></div></div>';
      h += '<p class="note">' + t(sd.teams ? 'mp.ruleTeam' : 'mp.rule') + '</p>' + rewardHtml(S.reward) +
        '<table class="cmp"><thead><tr><th></th><th>' + t('mp.player') + '</th><th>' + t('mp.down') + '</th><th>' + t('sent') + '</th><th>' + t('score') + '</th></tr></thead><tbody>';
      sd.list.forEach(function (p) {
        h += '<tr' + (p.me ? ' class="mine"' : '') + '><td>' + (p.gone ? '—' : t('mp.place', p.place)) + '</td><td>' + esc(p.name) + (sd.teams && !p.me ? ' <small>' + t(p.team === M.myTeam ? 'mp.mate' : 'mp.enemy') + '</small>' : '') +
          '</td><td>' + p.downs + '</td><td>' + p.sent + '</td><td>' + L.num(p.score) + '</td></tr>';
      });
      h += '</tbody></table>' + (App.endExtra ? App.endExtra() : '') + '<div class="row">' + btn('again', 'again', true) + btn('menu', 'toMenu') + '</div>';
    } else if (name === 'battleEnd') {
      var me = S.me.stats, op = S.opp.stats, tt = Math.max(1, S.total - S.left), foe = esc(S.oppName);
      var rows = [
        [t('score'), L.num(me.score), L.num(op.score)],
        [t('st.sent'), me.sent, op.sent],
        [t('st.apm'), rate(me.attack, tt).toFixed(1), S.remote ? '—' : rate(op.attack, tt).toFixed(1)],
        [t('st.pps'), (me.pieces / (tt / 1000)).toFixed(2), (op.pieces / (tt / 1000)).toFixed(2)],
        [t('st.tspin'), me.spins + me.minis, S.remote ? '—' : op.spins + op.minis],
        [t('st.xspin'), me.xspins, S.remote ? '—' : op.xspins],
        [t('st.quad'), me.quads, S.remote ? '—' : op.quads],
        [t('st.combo'), me.maxCombo, S.remote ? '—' : op.maxCombo]
      ];
      h = '<h2>' + t(S.result > 0 ? 'r.win' : S.result < 0 ? 'r.lose' : 'r.draw') + '</h2>' +
        (S.why === 'left' ? '<p>' + t('net.foeLeft') + '</p>' : '') +
        '<div class="score"><div><b>' + S.ko.me + '</b><span>' + t('r.yourKo') + '</span></div><i>' + t('r.vs') + '</i><div><b>' + S.ko.opp + '</b><span>' + t('r.foeKo', foe) + '</span></div></div>' +
        (S.ko.me === S.ko.opp && S.result !== 0 && !S.why ? '<p>' + t('r.tie') + '</p>' : '') + rewardHtml(S.reward) +
        '<table class="cmp"><thead><tr><th></th><th>' + t('you') + '</th><th>' + foe + '</th></tr></thead><tbody>';
      for (i = 0; i < rows.length; i++) h += '<tr><td>' + rows[i][0] + '</td><td>' + rows[i][1] + '</td><td>' + rows[i][2] + '</td></tr>';
      h += '</tbody></table>' + (S.saved ? '<p class="note">' + t('recSaved') + '</p>' : '') + (App.endExtra ? App.endExtra() : '') + '<div class="row">' +
        (S.why === 'left' ? '' : btn('again', 'again', true)) + (S.mode === 'ai' ? btn('battle', 'changeFoe') : '') + btn('menu', 'toMenu', S.why === 'left') + '</div>';
    } else if (name === 'sprintEnd') {
      var s = S.me.stats;
      h = '<h2>' + t(S.newBest ? 'sp.new' : 'sp.done') + '</h2><div class="score"><div><b>' + fmtTime(S.time) + '</b><span>' + t('sp.this') + '</span></div><i></i><div><b>' + fmtTime(Meta.data.tot.sprint) + '</b><span>' + t('best') + '</span></div></div>' +
        rewardHtml(S.reward) + '<table class="cmp"><tbody><tr><td>' + t('score') + '</td><td>' + L.num(s.score) + '</td></tr><tr><td>' + t('st.pps') + '</td><td>' + (s.pieces / (S.time / 1000)).toFixed(2) +
        '</td></tr><tr><td>' + t('sp.used') + '</td><td>' + s.pieces + '</td></tr><tr><td>' + t('sp.spins') + '</td><td>' + (s.spins + s.minis + s.xspins) + '</td></tr><tr><td>' + t('st.quad') + '</td><td>' + s.quads + '</td></tr></tbody></table>' +
        '<div class="row">' + btn('again', 'sp.again', true) + btn('menu', 'toMenu') + '</div>';
    } else if (name === 'sprintFail') {
      h = '<h2>' + t('sp.fail') + '</h2><p>' + t('sp.left', Math.max(0, S.goal - S.me.stats.lines)) + '</p><div class="row">' + btn('again', 'sp.again', true) + btn('menu', 'toMenu') + '</div>';
    } else if (name === 'dojoDone') {
      h = '<h2>' + t('dojo.all') + '</h2><p>' + t('dojo.allP') + '</p><div class="row">' + btn('practice', 'dojo.toPractice', true) + btn('dojoFirst', 'dojo.first') + btn('menu', 'toMenu') + '</div>';
    } else if (name === 'dojo') {
      h = '<h2>' + t('m.dojo') + '</h2>';
      var open = false;
      for (i = 0; i < DRILLS.length; i++) {
        var other = goalPiece(DRILLS[i]) !== 'T';
        if (i === 0 || (other && goalPiece(DRILLS[i - 1]) === 'T')) {
          if (open) h += '</div>';
          h += '<h3>' + t(other ? 'dojo.g2' : 'dojo.g1') + '</h3><div class="levels">';
          open = true;
        }
        h += '<button class="lvl" type="button" data-drill="' + i + '"><b>' + t('drillNo', i + 1) + '</b><span>' + esc(t('d.' + DRILLS[i].id + '.n')) + '</span><i>' + (i < save.dojo ? t('doneMark') : '') + '</i></button>';
      }
      h += '</div><div class="row">' + btn('close', 'cancel') + '</div>';
    } else if (name === 'settings') {
      var langs = '<option value="">' + t('s.auto') + '</option>';
      for (i = 0; i < L.LANGS.length; i++) langs += '<option value="' + L.LANGS[i][0] + '">' + L.LANGS[i][1] + '</option>';
      var ais = '';
      for (i = -2; i <= 2; i++) ais += '<option value="' + i + '">' + t('s.ai' + aiKey(i)) + '</option>';
      h = '<h2>' + t('m.settings') + '</h2><div class="field line"><label for="sLang">' + t('s.lang') + '</label><select id="sLang">' + langs + '</select></div>' +
        '<h3>' + t('s.foe') + '</h3><div class="field line"><label for="sAi">' + t('s.ai') + '</label><select id="sAi">' + ais + '</select><small>' + t('s.aiN') + '</small></div>' +
        '<h3>' + t('s.feel') + '</h3>' +
        field('sDas', t('s.das'), 60, 300, 5, t('s.dasN')) + field('sArr', t('s.arr'), 0, 80, 5, t('s.arrN')) +
        field('sSdf', t('s.sdf'), 10, 125, 5, t('s.sdfN')) + field('sLock', t('s.lock'), 200, 1000, 50, t('s.lockN')) +
        '<h3>' + t('s.screen') + '</h3>' + toggle('sSmooth', t('s.smooth')) + toggle('sGhost', t('s.ghost')) + toggle('sRadar', t('s.radar')) +
        (env.touch ? '' : '<h3>' + t('s.kb') + '</h3><div class="row">' + btn('keys', 's.keys') + '</div>') +
        '<h3>' + t('s.touch') + '</h3><div class="seg" role="radiogroup" aria-label="' + t('s.padH') + '">' +
        [0, 1, 2].map(function (j) { return '<button type="button" role="radio" aria-checked="' + (set.pad === j) + '" data-pad="' + j + '">' + t('s.pad' + j) + '</button>'; }).join('') + '</div>' +
        toggle('sSwap', t('s.swap')) + toggle('sHalf', t('s.half')) + toggle('sHaptic', t('s.haptic')) +
        (env.touch ? '<h3>' + t('s.kb') + '</h3><div class="row">' + btn('keys', 's.keys') + '</div>' : '') +
        '<h3>' + t('s.sound') + '</h3>' + field('sMvol', t('s.mvol'), 0, 100, 5, '') + field('sVol', t('s.vol'), 0, 100, 5, '') + toggle('sReal', t('s.real')) +
        '<div class="row">' + btn('defaults', 's.defaults') + btn('close', 'done', true) + '</div>';
    } else if (name === 'keys') {
      h = '<h2>' + t('kb.title') + '</h2><p>' + t('kb.hint') + '</p><div class="binds">';
      for (i = 0; i < ACTIONS.length; i++) {
        var a = ACTIONS[i], ks = set.keys[a];
        h += '<div class="bind"><span>' + t('a.' + a) + '</span><div class="bind-keys">' + (a === 'PAUSE' ? '<kbd>Esc</kbd>' : '') +
          ks.map(function (c) { return '<button type="button" class="kbtn" data-unbind="' + a + '|' + c + '">' + esc(keyName(c)) + '</button>'; }).join('') +
          (capAct === a ? '<span class="kwait">' + t('kb.press') + '</span>' : '<button type="button" class="kbtn add" data-bind="' + a + '" aria-label="+">＋</button>') + '</div></div>';
      }
      h += '</div><div class="row">' + btn('keyDefaults', 's.defaults') + btn('close', 'done', true) + '</div>';
    } else if (name === 'help') {
      h = '<h2>' + t('m.help') + '</h2><h3>' + t('s.kb') + '</h3>' + keyRows() +
        '<h3>' + t('h.touch') + '</h3><p>' + t('h.touchP') + '</p>' +
        '<h3>' + t('h.spin') + '</h3>' + ul(['h.spin1', 'h.spin2', 'h.spin3', 'h.spin4']) +
        '<h3>' + t('h.atk') + '</h3>' + ul(['h.atk1', 'h.atk2', 'h.atk3', 'h.atk4', 'h.atk5', 'h.atk6']) +
        '<h3>' + t('h.bt') + '</h3>' + ul(['h.bt1', 'h.bt2', 'h.bt3', 'h.bt4']) +
        '<h3>' + t('h.sc') + '</h3>' + ul(['h.sc1', 'h.sc2', 'h.sc3']) +
        '<h3>' + t('h.items') + '</h3><p>' + t('h.itemsP') + '</p><dl class="keys">';
      for (i = 1; i < ITEMS.length; i++) h += '<dt>' + itile(i) + '</dt><dd><b>' + t('i' + i) + '</b>　' + t('i' + i + 't') + '</dd>';
      h += '</dl><h3>' + t('h.credits') + '</h3><p>' + t('h.creditsP') + '</p><div class="row">' + btn('close', 'ok', true) + '</div>';
    }
    return h;
  }
  function ul(keys) { return '<ul class="rules">' + keys.map(function (k) { return '<li>' + t(k) + '</li>'; }).join('') + '</ul>'; }
  function bringHtml() {
    var d = Meta.data, h = '<h3>' + t('bring', Meta.BRING_MAX) + '</h3>', any = false, i;
    var cells = '';
    for (i = 1; i < ITEMS.length; i++) {
      if (!(d.items[i] > 0)) continue;
      any = true;
      cells += '<button type="button" class="bringb" data-bring="' + i + '" aria-pressed="' + (d.bring.indexOf(i) >= 0) + '" title="' + esc(t('i' + i)) + '">' + itile(i) + '<span>×' + d.items[i] + '</span></button>';
    }
    return h + (any ? '<div class="bringrow">' + cells + '</div>' : '<p>' + t('bringNone') + '</p>');
  }
  function field(id, label, min, max, step, note) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><output id="' + id + 'O" for="' + id + '"></output>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '">' + (note ? '<small>' + note + '</small>' : '') + '</div>';
  }
  function toggle(id, label) { return '<label class="toggle" for="' + id + '">' + label + '<input type="checkbox" id="' + id + '"></label>'; }

  var FIELDS = { sDas: 'das', sArr: 'arr', sSdf: 'sdf', sLock: 'lock', sVol: 'vol', sMvol: 'mvol' };
  var TOGGLES = { sSmooth: 'smooth', sGhost: 'ghost', sRadar: 'radar', sSwap: 'swap', sHalf: 'half', sHaptic: 'haptic', sReal: 'real' };
  function fieldText(k) {
    if (k === 'sdf') return set.sdf >= 125 ? t('u.instant') : t('u.cps', set.sdf);
    if (k === 'vol' || k === 'mvol') return set[k] ? String(set[k]) : t('u.off');
    return t('u.ms', set[k]);
  }
  function syncSettings() {
    var id;
    for (id in FIELDS) { $(id).value = set[FIELDS[id]]; $(id + 'O').textContent = fieldText(FIELDS[id]); }
    for (id in TOGGLES) $(id).checked = !!set[TOGGLES[id]];
    $('sLang').value = set.lang;
    $('sAi').value = String(aiStep());
  }
  function aiKey(n) { return n < 0 ? 'M' + (-n) : n > 0 ? 'P' + n : '0'; }
  function applySettings() {
    el.pad.classList.toggle('swap', set.swap);
    sideKeys();
    sfx.vol();
    if (S && S.me) {
      S.me.sdf = sdfVal();
      S.me.lockDelay = S.kind === 'dojo' || kindOf() ? Math.max(1000, set.lock) : set.lock;
    }
    if (screen === 'play') layout();
  }

  // ---------- language ----------
  var FONT = { 'zh-Hans': 'Noto+Sans+SC:wght@400..900', ja: 'Zen+Maru+Gothic:wght@500;700;900', ko: 'Noto+Sans+KR:wght@400..900' }, fontDone = {};
  // ?lang=en in the address shows that language for this visit (search engines and shared links use it);
  // choosing a language in the settings takes over again.
  var urlLang = (function () {
    try { var v = new URLSearchParams(window.location.search).get('lang') || ''; return L.LANGS.some(function (x) { return x[0] === v; }) ? v : ''; } catch (e) { return ''; }
  })();
  function applyLang() {
    L.set(urlLang || set.lang || '');
    var root = document.documentElement, list, i;
    root.lang = L.lang;
    document.title = t('seo.title');
    var md = document.querySelector('meta[name="description"]'), can = document.querySelector('link[rel="canonical"]');
    if (md) md.setAttribute('content', t('seo.desc'));
    // each language's own address is the one to index for that language
    if (can) can.setAttribute('href', can.getAttribute('href').split('?')[0] + (urlLang && urlLang !== 'zh-Hant' ? '?lang=' + urlLang : ''));
    var f = FONT[L.lang];
    if (f && !fontDone[L.lang]) {
      fontDone[L.lang] = 1;
      var ln = document.createElement('link');
      ln.rel = 'stylesheet';
      ln.href = 'https://fonts.googleapis.com/css2?family=' + f + '&display=swap';
      document.head.appendChild(ln);
    }
    list = document.querySelectorAll('[data-t]');
    for (i = 0; i < list.length; i++) list[i].textContent = t(list[i].getAttribute('data-t'));
    list = document.querySelectorAll('[data-ta]');
    for (i = 0; i < list.length; i++) list[i].setAttribute('aria-label', t(list[i].getAttribute('data-ta')));
    $('logoA').textContent = L.lang === 'zh-Hans' ? '转' : '轉';
    $('logoB').textContent = L.lang === 'zh-Hans' ? '砖' : '磚';
    env.font = '';
    if (S) { setupHud(); if (S.kind === 'dojo' && S.d) loadDrill(S.drill); layout(); }
    updateMenu();
  }

  // ---------- key binding sheet ----------
  var capAct = '';
  function stopCapture() { capAct = ''; App.capture = null; }
  function startCapture(a) {
    if (set.keys[a].length >= KEY_MAX) { toast(t('kb.max')); return; }
    capAct = a;
    App.capture = function (e) {
      if (e.repeat) return;
      var code = e.code;
      if (!code || code === 'Escape') { stopCapture(); openSheet('keys'); return; }
      var was = KEYS[code];
      ACTIONS.forEach(function (x) { set.keys[x] = set.keys[x].filter(function (c) { return c !== code; }); });
      set.keys[a].push(code);
      if (was && was !== a) toast(t('kb.moved', keyName(code), t('a.' + was)), 2600);
      rebuildKeys();
      saveStore();
      stopCapture();
      openSheet('keys');
    };
    openSheet('keys');
  }

  function openSheet(name) {
    if ((name === 'settings' || name === 'help') && sheetName !== name && sheetName !== 'keys') sheetBack = sheetName === 'pause' ? 'pause' : '';
    var keep = sheetName === name ? el.sheetCard.scrollTop : 0;
    sheetName = name;
    el.sheetCard.setAttribute('data-name', name);      // (the stylesheet gives a few sheets more room on big screens)
    el.sheetCard.innerHTML = sheetHtml(name);
    el.sheet.hidden = false;
    el.sheetCard.scrollTop = keep;
    if (name === 'settings') syncSettings();
    if (name === 'battle') $('bItems').checked = pick.items;
    if (App.opened[name]) App.opened[name]();
    var b = el.sheetCard.querySelector('.btn.main');
    if (b && !env.touch && !keep) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } el.sheetCard.scrollTop = 0; }   // (a long sheet opens at its top, not at its button)
  }
  function closeSheet(quiet) {
    var was = sheetName;
    sheetName = '';
    el.sheet.hidden = true;
    el.sheetCard.innerHTML = '';
    stopCapture();
    if (was && App.closed[was]) App.closed[was]();
    if (!quiet && sheetBack) { var b = sheetBack; sheetBack = ''; openSheet(b); }
    if (screen === 'menu') updateMenu();
  }
  function openBattle() { pick.level = save.level; pick.minutes = save.minutes; pick.items = !!save.items; openSheet('battle'); }
  function againBattle() {
    var o = {}, k;
    for (k in S.o) o[k] = S.o[k];
    if (App.again[S.mode]) return App.again[S.mode](o);
    o.bring = Meta.takeBring();
    o.seed = null;
    begin('battle', o);
  }
  function sheetDo(a, target) {
    if (App.acts[a]) return App.acts[a](target);
    if (a === 'close') {
      if (sheetName === 'keys') { stopCapture(); return openSheet('settings'); }
      closeSheet();
      if (!sheetName && S && S.state === 'pause') resume();
    }
    else if (a === 'resume') { sheetBack = ''; closeSheet(true); resume(); }
    else if (a === 'fight') {
      save.level = pick.level; save.minutes = pick.minutes; save.items = pick.items ? 1 : 0; saveStore();
      begin('battle', { mode: 'ai', level: pick.level, minutes: pick.minutes, items: pick.items, bring: Meta.takeBring() });
    }
    else if (a === 'again') {
      sheetBack = '';
      var K = kindOf();
      if (S.kind === 'battle') againBattle();
      else if (K && K.restart) { closeSheet(true); sfx.setDuck(1); K.restart(); }
      else if (S.kind === 'dojo') { closeSheet(true); sfx.setDuck(1); loadDrill(S.drill); }
      else begin(S.kind, S.o);
    }
    else if (a === 'battle') { sheetBack = ''; openBattle(); }
    else if (a === 'menu') { sheetBack = ''; toMenu(); }
    else if (a === 'settings' || a === 'help' || a === 'keys') openSheet(a);
    else if (a === 'practice') begin('practice');
    else if (a === 'dojoFirst') begin('dojo', { drill: 0 });
    else if (a === 'defaults') {
      var lang = set.lang, keys = set.keys;
      for (var k in DEF) set[k] = DEF[k];
      set.lang = lang; set.keys = keys;
      saveStore(); openSheet('settings'); applySettings();
    }
    else if (a === 'keyDefaults') { set.keys = keyCopy(null); rebuildKeys(); saveStore(); stopCapture(); openSheet('keys'); }
  }
  function bindSheets() {
    el.sheetCard.addEventListener('click', function (e) {
      var tg = e.target.closest ? e.target.closest('button') : null;
      if (!tg) return;
      sfx.wake();
      sfx.play('ui');
      var d = tg.dataset, i;
      if (d.do) return sheetDo(d.do, tg);
      if (d.level) { pick.level = +d.level; openSheet('battle'); }
      else if (d.min) { pick.minutes = +d.min; openSheet('battle'); }
      else if (d.bring) { Meta.toggleBring(+d.bring); openSheet('battle'); }
      else if (d.drill) begin('dojo', { drill: +d.drill });
      else if (d.pad) { set.pad = +d.pad; saveStore(); openSheet('settings'); applySettings(); }
      else if (d.bind) startCapture(d.bind);
      else if (d.unbind) {
        var p = d.unbind.split('|');
        set.keys[p[0]] = set.keys[p[0]].filter(function (c) { return c !== p[1]; });
        rebuildKeys(); saveStore(); openSheet('keys');
      }
      else for (i = 0; i < App.clicks.length; i++) if (App.clicks[i](d, tg)) return;
    });
    var onInput = function (e) {
      var id = e.target.id, i;
      if (id === 'bItems') { pick.items = e.target.checked; return; }
      if (id === 'sLang') { if (e.type !== 'change') return; set.lang = e.target.value; urlLang = ''; saveStore(); applyLang(); openSheet('settings'); return; }
      if (id === 'sAi') { set.ai = clamp(Math.round(+e.target.value || 0), -2, 2); saveStore(); return; }
      if (FIELDS[id]) {
        set[FIELDS[id]] = +e.target.value;
        $(id + 'O').textContent = fieldText(FIELDS[id]);
        if (id === 'sVol' || id === 'sMvol') { sfx.wake(); sfx.vol(); if (id === 'sVol') sfx.play('tick'); }
      }
      else if (TOGGLES[id]) set[TOGGLES[id]] = e.target.checked;
      else { for (i = 0; i < App.inputs.length; i++) if (App.inputs[i](e.target, e)) return; return; }
      saveStore();
      applySettings();
    };
    el.sheetCard.addEventListener('input', onInput);
    el.sheetCard.addEventListener('change', onInput);
    el.sheet.addEventListener('click', function (e) {
      if (e.target !== el.sheet) return;
      if (App.dismiss[sheetName]) sheetDo('close');
    });
    el.menu.addEventListener('click', function (e) {
      var tg = e.target.closest ? e.target.closest('button') : null;
      if (!tg) return;
      sfx.wake();
      sfx.play('ui');
      if (tg.dataset.sheet) return openSheet(tg.dataset.sheet);
      goTo(tg.dataset.go);
    });
  }
  // One of the menu's entries, by name (also used by links that open the game straight into a mode).
  var MODES = { rank: 1, battle: 1, online: 1, quick: 1, ghost: 1, dojo: 1, openers: 1, practice: 1, sprint: 1 };
  function goTo(go) {
    if (typeof go !== 'string' || !MODES.hasOwnProperty(go)) return false;
    if (typeof App.go[go] === 'function') App.go[go]();
    else if (go === 'battle') openBattle();
    else if (go === 'dojo') { if (save.dojo > 0) openSheet('dojo'); else begin('dojo', { drill: 0 }); }
    else begin(go);
    return true;
  }
  function updateMenu() {
    var d = Meta.data, r = Meta.rankOf(d.rp);
    txt('mName', d.name || t('player'));
    txt('mRank', rankName(r));
    txt('mCoins', L.num(d.coins));
    txt('mRankPts', r.top ? String(r.rp) : r.into + ' / ' + r.need);
    txt('mDojo', save.dojo ? save.dojo + '/' + DRILLS.length : '');
    txt('mSprint', d.tot.sprint ? fmtTime(d.tot.sprint) : '');
    var n = ZZ.Replay ? ZZ.Replay.list().length : 0, o = ZZ.OPENERS || [];
    txt('mGhost', n ? String(n) : '');
    txt('mOpen', d.first.openers.length ? d.first.openers.length + '/' + o.length : '');
    $('mJobsDot').hidden = !(Meta.loginDue() || Meta.jobsReady() > 0);
  }

  // ---------- layout ----------
  var side = 66, pc = 12, pn = 12, nextN = 5, itemH = 28, sideKey = '', chipKey = '';
  function layout() {
    if (screen !== 'play' || !S) return;
    var W = el.app.clientWidth, H = el.app.clientHeight, hasOpp = !!S.opp;
    var wide = W >= 820 && W > H * 1.05, flip = wide && hasOpp;
    if (S.flip !== flip) { S.flip = flip; setupHud(); }
    el.pad.hidden = !env.touch;
    sideKeys();
    el.stage.classList.toggle('wide', flip);
    var hudH = el.hud.offsetHeight || 48, stripH = el.strip.hidden ? 0 : el.strip.offsetHeight + 6;
    // a tablet held upright has room for bigger keys
    var padMin = env.touch ? (W >= 600 && H >= 900 ? [160, 190, 226] : [128, 152, 184])[set.pad] : 0;
    el.pad.style.minHeight = padMin + 'px';
    // on a tall screen the wall does not run edge to edge
    var availH = H - hudH - stripH - padMin - 22 - (H >= 1000 ? 26 : 0), cell, oppCell = 0;
    var byH = Math.floor(availH / (VIS + SKY));
    if (wide) {
      // Tiles grow with the screen (up to 64 px on a 4K monitor) and the side columns grow with the tiles.
      var fit = function (sd) { return Math.min(byH, Math.floor((W - 2 * sd - 70 - (hasOpp ? W * 0.27 : 0)) / 10.3)); };
      cell = clamp(fit(112), 12, 64);
      side = clamp(Math.round(cell * 2.95), 112, 200);
      if (side > 112) { cell = clamp(fit(side), 12, 64); side = clamp(Math.round(cell * 2.95), 112, 200); }
      if (hasOpp) oppCell = Math.max(8, Math.round(cell * 0.7));
    } else {
      // phones stop at 34 px tiles, as before; tablets and tall windows go on to 56
      cell = clamp(Math.min(byH, Math.floor((W - 2 * 66 - 36) / 10.3)), 10, W >= 600 ? 56 : 34);
      side = clamp(Math.floor((W - cell * 10.3 - 40) / 2), 58, Math.max(124, Math.round(cell * 3.3)));
      if (hasOpp) oppCell = Math.max(4, Math.floor((side - 8) / 10));
    }
    el.stage.style.setProperty('--side', side + 'px');
    V.me.resize(cell);
    // Both side columns are as tall as the wall. What must be there takes its room first (hold, the side keys, tools);
    // the other player's little wall and the queue of coming pieces then share what is left.
    var wellH = el.wellWrap.offsetHeight;
    el.colL.style.height = el.colR.style.height = wellH + 'px';
    var kh = clamp(Math.round(wellH * 0.13), 44, 72);
    el.stage.style.setProperty('--kh', kh + 'px');
    el.oppMini.hidden = !hasOpp || wide;
    el.oppWide.hidden = !flip;
    pc = Math.max(7, Math.floor((side - 10) / 4.3));
    itemH = Math.round(Math.min(pc * 2.4, (side - 8) * 0.56));
    View.sizeCanvas(el.holdCv, side - 8, Math.round(pc * 2.7));
    View.sizeCanvas(el.itemCv, side - 8, itemH);
    if (hasOpp) {
      var home = wide ? el.oppFrame : el.oppMini;
      if (el.oppCv.parentNode !== home) home.appendChild(el.oppCv);
      V.opp.plain = !wide;
      V.opp.sky = wide ? SKY : 0;
      if (!wide) {
        var kids = el.colL.children, used = 0, shown = 0, c;
        for (var ci = 0; ci < kids.length; ci++) {
          c = kids[ci];
          if (c.hidden) continue;
          shown++;
          if (c !== el.oppMini && c !== el.chips) used += c.offsetHeight;
        }
        // leave room for one status chip under it
        var oppRoom = wellH - used - (shown - 1) * 8 - 30 - (el.oppName.offsetHeight + 9);
        oppCell = clamp(Math.floor(oppRoom / VIS), 3, oppCell);
      }
      V.opp.resize(oppCell);
    }
    var maxN = S.kind === 'dojo' ? 2 : 5, minN = S.kind === 'dojo' ? 1 : 3, small = Math.max(8, Math.round(pc * 0.62)), n, q;
    var nextRoom = function () {
      el.nextBox.style.flex = '1 1 0';
      var r = el.nextBox.clientHeight - el.nextBox.firstElementChild.offsetHeight - 9;
      el.nextBox.style.flex = '';
      return r;
    };
    var room = nextRoom(), least = Math.ceil(minN * 2.9 * 7), keysR = el.sideR.hidden ? 0 : el.sideR.querySelectorAll('.key:not([hidden])').length;
    if (room < least && keysR) {
      // a very short wall: the side keys give up some height so the queue still fits
      el.stage.style.setProperty('--kh', Math.max(34, kh - Math.ceil((least - room) / keysR)) + 'px');
      room = nextRoom();
    }
    // as many coming pieces as fit; they are drawn a little smaller before one is dropped
    for (n = maxN; n >= minN; n--) {
      q = Math.min(pc, Math.floor(room / (2.9 * n)));
      if (q >= small || n === minN) { nextN = n; pn = Math.max(6, q); break; }
    }
    View.sizeCanvas(el.nextCv, side - 8, Math.round(pn * 2.9 * nextN));
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
    if (short && S.mode !== 'net' && (S.state === 'play' || S.state === 'count')) { S.prev = S.state; S.state = 'pause'; input.clear(); openSheet('pause'); }
  }
  var lookKey = '';
  function drawSide() {
    var me = S.me, key = (me.holdType || '-') + (me.holdUsed ? '!' : '') + '|' + me.queue.slice(0, nextN).join('') + '|' + pc + '|' + pn + '|' + nextN + '|' + me.inv.join('') + '|' + lookKey + L.lang;
    if (key === sideKey) return;
    sideKey = key;
    var dpr = env.dpr, w = side - 8, x = el.holdCv.getContext('2d'), i;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, pc * 3);
    if (me.holdType) View.drawPiece(x, me.holdType, w / 2, pc * 1.35, pc);
    el.holdBox.classList.toggle('used', me.holdUsed);
    x = el.nextCv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, pn * 3 * nextN);
    for (i = 0; i < nextN && i < me.queue.length; i++) View.drawPiece(x, me.queue[i], w / 2, pn * 2.9 * (i + 0.5), pn);
    if (itemsOn()) {
      var inv = me.inv, big = itemH, sm = Math.floor((big - 2) / 2);
      x = el.itemCv.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, w, itemH + 2);
      if (inv[0]) View.drawItem(x, inv[0], 0, 0, big);
      if (inv[1]) View.drawItem(x, inv[1], big + 4, 0, sm);
      if (inv[2]) View.drawItem(x, inv[2], big + 4, sm + 2, sm);
      var bag = '', more = '';
      for (i = 0; i < inv.length && i < 3; i++) {
        var tile = '<i class="itile" style="--c:' + ITEMS[inv[i]].color + '">' + View.itemSvg(inv[i]) + '</i>';
        if (i) more += tile; else bag = tile;
      }
      el.itemKey.innerHTML = bag ? bag + (more ? '<b>' + more + '</b>' : '') : esc(t('item'));
      el.itemKey.classList.toggle('empty', !inv[0]);
      el.itemBox.classList.toggle('empty', !inv[0]);
    }
  }
  function secs(ms) { return Math.ceil(ms / 1000); }
  function drawChips() {
    var me = S.me, fz = S.freeze.me, key = me.b2b + '|' + me.combo + '|' + secs(Math.max(0, me.shield)) + '|' + secs(Math.max(0, me.boost)) + '|' + secs(fz) + L.lang;
    if (key === chipKey) return;
    chipKey = key;
    var h = '';
    if (fz > 0) h += '<span class="chip ice">' + t('chip.ice', secs(fz)) + '</span>';
    if (me.shield > 0) h += '<span class="chip blue">' + t('chip.tarp', secs(me.shield)) + '</span>';
    if (me.boost > 0) h += '<span class="chip gold">' + t('chip.x2', secs(me.boost)) + '</span>';
    if (me.b2b >= 1) h += '<span class="chip gold">' + t('chip.b2b', me.b2b) + '</span>';
    if (me.combo >= 1) h += '<span class="chip">' + t('chip.combo', me.combo) + '</span>';
    el.chips.innerHTML = h;
  }
  function updateHud() {
    var me = S.me, st = me.stats, K = kindOf();
    if (S.kind === 'battle') {
      txt('koMe', String(S.ko.me)); txt('koOpp', String(S.ko.opp));
      if (S.multi) txt('downT', String(S.multi.foes[S.multi.target].downs));
      txt('sentMe', String(st.sent)); txt('sentOpp', String(S.opp.stats.sent));
      txt('ptsMe', t('pts', L.num(st.score)));
      var c = $('clock');
      txt('clock', fmtClock(S.left));
      if (c) { var late = S.left <= 10000; if (c._late !== late) { c._late = late; c.className = late ? 'late' : ''; } }
    } else if (S.kind === 'sprint') {
      txt('linesLeft', String(Math.max(0, S.goal - st.lines)));
      txt('clock', fmtTime(S.time));
      txt('ptsMe', t('pts', L.num(st.score)));
    } else if (S.kind === 'practice') {
      txt('pAtk', String(st.attack)); txt('pSpin', String(st.spins + st.minis + st.xspins));
      txt('pPps', S.time > 800 ? (st.pieces / (S.time / 1000)).toFixed(2) : '0.00');
      txt('ptsMe', t('pts', L.num(st.score)));
    } else if (K && K.update) {
      K.update();
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
  // The little wall on the menu. Beside the name on a phone; on wide screens the menu has two columns (see "各種螢幕"
  // in the stylesheet) and the wall stands above the name, as big as the left column allows.
  function heroLayout() {
    var w = el.menu.clientWidth || 360, h = el.menu.clientHeight || 640, cell;
    var box = el.demoCv.parentNode.parentNode, stacked = false;
    try { stacked = window.getComputedStyle(box).gridTemplateColumns.split(' ').length === 1; } catch (e) { stacked = false; }
    if (stacked) cell = clamp(Math.min(Math.floor((box.clientWidth || 300) * 0.7 / COLS), Math.floor(h * 0.3 / 8)), 9, 52);
    else cell = clamp(Math.floor(Math.min(w, 720) * 0.34 / COLS), 9, 22);
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
      banner(t('b.go'), '', 520);
      sfx.play('go');
      S.state = 'play';
      S.me.start();
      if (S.opp && !S.remote) S.opp.start();
    }
  }
  function playTick(dt) {
    var fz = S.freeze, K = kindOf();
    if (S.tape) S.tape.tick(dt);
    if (S.kind === 'battle') {
      S.left -= dt;
      if (S.left <= 0) { S.left = 0; endBattle(''); return; }
      if (S.rec) S.rec.tick(dt);
      var sides = ['me', 'opp'];
      for (var i = 0; i < 2; i++) {
        var k = sides[i];
        if (S.down[k] > 0) {
          S.down[k] -= dt;
          if (S.down[k] <= 0) {
            S.down[k] = 0; V[k].koT = 0;
            if (!(k === 'opp' && S.remote)) {
              S[k].revive();
              if (k === 'opp' && S.bot && S.bot.onRevive) S.bot.onRevive();
            }
          }
        }
        if (fz[k] > 0) fz[k] = Math.max(0, fz[k] - dt);
      }
      if (S.remote) ZZ.Net.tick(dt);
      else if (fz.opp <= 0) {
        if (!S.opp.over) S.bot.update(dt);
        S.opp.update(dt);
        if (S.o.items && S.mode !== 'ghost') botItems(dt);
      }
    } else {
      S.time += dt;
      if (K && K.tick) K.tick(dt);
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
      if (stepDemo(S.demo, S.me, S.steps, dt, 560, S.say || stripText)) {
        S.state = 'wait'; S.wait = 1500;
        S.after = S.demoDone || function () { loadDrill(S.drill); toast(t('yourTurn')); };
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
    if (S.multi) drawFoes();
    updateHud();
  }

  // ---------- looks ----------
  // Puts the equipped tile style, wall, effect and colour theme on screen. Called at start and whenever the shop changes something.
  function applyLook() {
    var e = Meta.data.equip, root = document.documentElement;
    if (e.theme && e.theme !== 'auto') root.setAttribute('data-skin', e.theme); else root.removeAttribute('data-skin');
    View.readTheme();
    View.terrazzo();
    View.setLook({ tile: e.tile, bg: e.bg, fx: e.fx, dim: Meta.data.custom.dim });
    lookKey = e.tile + e.bg + e.theme + Date.now();
    sideKey = '';
    if (V.me) V.me.bg = V.opp.bg = V.hero.bg = null;
  }

  // ---------- boot ----------
  function start(data) {
    ['app', 'menu', 'play', 'hud', 'hudL', 'hudC', 'hudR', 'strip', 'stage', 'colL', 'colR', 'holdBox', 'holdCv', 'itemBox', 'itemCv', 'oppMini', 'oppName', 'oppCv',
      'chips', 'wellWrap', 'wellCv', 'pops', 'banner', 'nextBox', 'nextCv', 'tools', 'pauseBtn', 'oppWide', 'oppNameW', 'oppFrame', 'pad', 'sideL', 'sideR', 'itemKey', 'halfKey', 'holdKey',
      'toast', 'mtoast', 'rotate',
      'sheet', 'sheetCard', 'demoCv'].forEach(function (id) { el[id] = $(id); });
    // a name tag above the wall in a match of three or four: that player becomes the target
    el.strip.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-foe]'); if (b && S && S.multi) { setTarget(+b.getAttribute('data-foe')); b.blur(); } });
    loadStore();
    rebuildKeys();
    Meta.load();
    // the sprint record used to live with the settings; it belongs with the rest of the player's record
    if (save.best && !Meta.data.tot.sprint) { Meta.data.tot.sprint = Math.round(save.best); Meta.save(); }
    L.set(urlLang || set.lang || '');
    View.readTheme();
    V.me = new View.BoardView(el.wellCv, { meter: true });
    V.opp = new View.BoardView(el.oppCv, { plain: true, sky: 0 });
    V.hero = new View.BoardView(el.demoCv, { rows: 8, sky: 0 });
    applyLook();
    bindInput();
    bindSheets();
    applySettings();
    applyLang();
    Meta.onChange = function () { if (screen === 'menu') updateMenu(); };
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
    // Item marks and labels are drawn with the page fonts; redraw them once the web fonts have arrived.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { env.font = ''; View.clearItemSprites(); V.me.itiles = null; if (S) layout(); }).catch(function () { /* fallback font stays */ });
    }
    for (var i = 0; i < App.boot.length; i++) App.boot[i](data);
    if (data && data.dojo && data.screen === 'dojo') begin('dojo', { drill: data.drill || 0 });
    last = performance.now();
    window.requestAnimationFrame(frame);
  }

  App.boot = [];
  App.set = set; App.save = save; App.el = el; App.V = V; App.sfx = sfx; App.env = env; App.input = input; App.goTo = goTo;
  App.S = function () { return S; };
  App.screen = function () { return screen; };
  App.sheet = function () { return sheetName; };
  App.begin = begin; App.foeGone = function (s) { if (S && S.multi) foeGone(s); }; App.setTarget = function (s) { if (S && S.multi) setTarget(s); }; App.openSheet = openSheet; App.closeSheet = closeSheet; App.sheetDo = sheetDo; App.toast = toast; App.banner = banner; App.popRaw = popRaw;
  App.txt = txt; App.stat = stat; App.esc = esc; App.btn = btn; App.coin = coin; App.itile = itile; App.ul = ul; App.field = field; App.toggle = toggle;
  App.fmtClock = fmtClock; App.fmtTime = fmtTime; App.saveStore = saveStore; App.applySettings = applySettings; App.applyLook = applyLook; App.applyLang = applyLang;
  App.toMenu = toMenu; App.layout = layout; App.updateMenu = updateMenu; App.rankName = rankName; App.stepCells = stepCells; App.stepDemo = stepDemo;
  App.actName = actName; App.clearName = clearName; App.key1 = key1; App.sdfVal = sdfVal; App.foeItem = foeItem; App.endBattle = endBattle; App.setTools = setTools;
  App.tool = tool; App.buzz = buzz; App.resume = resume; App.openBattle = openBattle; App.rewardHtml = rewardHtml;

  ZZ.peek = function () { return { S: S, V: V, set: set, save: save, screen: screen, sheet: sheetName, sfx: sfx, useItem: useItem, meta: Meta.data, lang: L.lang, hero: hero, heroLoad: heroLoad }; };

  var hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    try { hot.snapshot(function () { return { screen: S ? S.kind : 'menu', dojo: !!(S && S.kind === 'dojo'), drill: S && S.kind === 'dojo' ? S.drill : 0 }; }); } catch (e) { /* viewer feature only */ }
  }
  function boot(data) { try { start(data || {}); } catch (e) { if (window.console) console.error(e); } }
  // Feature files load after this one; start once they have all registered.
  ZZ.start = function () { if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {}); };
})();
