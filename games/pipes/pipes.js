/* 磚道 (pipes), one of the SnowRealm brick games.

   Every tile is a piece of pipe. Tap a tile to turn it a quarter round. The water starts at the gold tile in the
   middle; get it into every tile, with no pipe left open, and the level is done. The pipes are a single tree (one way
   to every tile and no loops), made fresh for each game from a seed, and then each tile is given a random turn, so a
   solution always exists. Sizes by difficulty; the best time for each is kept.

   The rules (Pipes) are kept apart from the screen so they can be tested without a browser.
   A tile is four bits of openings: 1 up, 2 right, 4 down, 8 left. */
(function (root) {
  'use strict';
  var UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
  var DIRS = [[0, -1, UP, DOWN], [1, 0, RIGHT, LEFT], [0, 1, DOWN, UP], [-1, 0, LEFT, RIGHT]];
  var LEVELS = { easy: { n: 5 }, normal: { n: 7 }, hard: { n: 9 } };

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function turn(m, k) { k = ((k % 4) + 4) % 4; for (var i = 0; i < k; i++) m = ((m << 1) | (m >> 3)) & 15; return m; }

  function Pipes(seed, level) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.level = LEVELS[level] ? level : 'normal';
    this.N = LEVELS[this.level].n;
    this.taps = 0;
    this.build();
  }
  Pipes.LEVELS = LEVELS; Pipes.turn = turn; Pipes.UP = UP; Pipes.RIGHT = RIGHT; Pipes.DOWN = DOWN; Pipes.LEFT = LEFT;
  // a random tree from the middle (growing from a random tile already in it), then every tile turned at random
  Pipes.prototype.build = function () {
    var N = this.N, r = this.rng, i;
    this.sol = []; for (i = 0; i < N * N; i++) this.sol.push(0);
    this.src = (N >> 1) * N + (N >> 1);
    var inTree = {}, edge = [];
    inTree[this.src] = 1;
    var add = function (c) { for (var d = 0; d < 4; d++) edge.push([c, d]); };
    add(this.src);
    var count = 1, defer = 0;
    while (count < N * N) {
      var k = Math.floor(r.next() * edge.length), e = edge[k];
      edge[k] = edge[edge.length - 1]; edge.pop();
      var c = e[0], D = DIRS[e[1]], x = c % N + D[0], y = Math.floor(c / N) + D[1];
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      var nc = y * N + x;
      if (inTree[nc]) continue;
      // keep the tiles from having all four openings too often: crossings make it too easy to see
      if (this.bits(this.sol[c]) >= 3 && r.next() < 0.6 && defer++ < 4000) { edge.push(e); continue; }
      this.sol[c] |= D[2]; this.sol[nc] |= D[3];
      inTree[nc] = 1; count++;
      add(nc);
    }
    this.tiles = this.sol.map(function (m) { return turn(m, Math.floor(r.next() * 4)); });
    if (this.solved()) this.tiles[this.src] = turn(this.tiles[this.src], 1) === this.tiles[this.src] ? this.tiles[this.src] : turn(this.tiles[this.src], 1);
  };
  Pipes.prototype.bits = function (m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); };
  Pipes.prototype.rotate = function (c, dir) {
    if (c < 0 || c >= this.tiles.length || this.solved()) return false;
    var before = this.tiles[c];
    this.tiles[c] = turn(before, dir || 1);
    this.taps++;
    return true;
  };
  // which tiles the water reaches (through pipes that meet), and whether any reached pipe is open at its end
  Pipes.prototype.flow = function () {
    var N = this.N, lit = {}, stack = [this.src], open = false;
    lit[this.src] = 1;
    while (stack.length) {
      var c = stack.pop(), m = this.tiles[c], x = c % N, y = Math.floor(c / N);
      for (var d = 0; d < 4; d++) {
        var D = DIRS[d];
        if (!(m & D[2])) continue;
        var nx = x + D[0], ny = y + D[1];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) { open = true; continue; }
        var nc = ny * N + nx;
        if (!(this.tiles[nc] & D[3])) { open = true; continue; }
        if (!lit[nc]) { lit[nc] = 1; stack.push(nc); }
      }
    }
    return { lit: lit, open: open, count: Object.keys(lit).length };
  };
  Pipes.prototype.solved = function () { var f = this.flow(); return !f.open && f.count === this.tiles.length; };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Pipes; return; }
  root.Pipes = Pipes;

  // ---------- the screen ----------
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.pipes.bests', LVKEY = 'snowrealm.pipes.level';
  var g = null, state = 'intro', last = 0, cell = 48, dpr = 1, ac = null, t0 = 0, time = 0, spin = {}, lit = {};
  var level = 'normal', bests = {};
  try { level = window.localStorage.getItem(LVKEY) || 'normal'; bests = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  if (!LEVELS[level]) level = 'normal';
  var T = function () { return window.SRW ? window.SRW.t.apply(null, arguments) : arguments[0]; }, SEP = window.SRW ? window.SRW.t('g.sep') : '・';
  var LV_NAME = { easy: T('g.easy'), normal: T('g.normal'), hard: T('g.hard') };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  function size() {
    var N = g ? g.N : LEVELS[level].n;
    var room = Math.min(window.innerWidth - 28, 540), tall = window.innerHeight - board.getBoundingClientRect().top - 50;
    cell = Math.max(30, Math.min(72, Math.floor(Math.min(room, tall) / N)));
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cell * N * dpr); cv.height = Math.round(cell * N * dpr);
    cv.style.width = cv.style.height = cell * N + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function draw(dt) {
    var N = g ? g.N : LEVELS[level].n, W = cell * N, c;
    x.fillStyle = '#222B36'; x.fillRect(0, 0, W, W);
    if (!g) return;
    var done = state === 'won';
    for (c = 0; c < g.tiles.length; c++) {
      var X = c % N, Y = Math.floor(c / N), px = X * cell, py = Y * cell, on = !!lit[c];
      rr(px + 2, py + 2, cell - 4, cell - 4, cell * 0.16); x.fillStyle = on ? '#26364A' : '#2C3745'; x.fill();
      var a = spin[c] || 0;
      if (a) { spin[c] = Math.max(0, a - dt / 120 * (Math.PI / 2)); }
      x.save(); x.translate(px + cell / 2, py + cell / 2); x.rotate(-(spin[c] || 0));
      var m = g.tiles[c], w = cell * 0.24, col = done ? '#F5B82E' : on ? '#5DB7F5' : '#6B7787';
      x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round';
      x.beginPath();
      if (m & UP) { x.moveTo(0, 0); x.lineTo(0, -cell / 2); }
      if (m & RIGHT) { x.moveTo(0, 0); x.lineTo(cell / 2, 0); }
      if (m & DOWN) { x.moveTo(0, 0); x.lineTo(0, cell / 2); }
      if (m & LEFT) { x.moveTo(0, 0); x.lineTo(-cell / 2, 0); }
      x.stroke();
      if (c === g.src) { x.fillStyle = '#F5B82E'; x.beginPath(); x.arc(0, 0, cell * 0.24, 0, 6.283); x.fill(); x.fillStyle = '#7E5900'; x.beginPath(); x.arc(0, 0, cell * 0.09, 0, 6.283); x.fill(); }
      else if (g.bits(m) === 1) { x.fillStyle = on ? '#BFE3FB' : '#8C939B'; x.beginPath(); x.arc(0, 0, cell * 0.17, 0, 6.283); x.fill(); }
      x.restore();
    }
  }
  function tone(f, dur, type, vol, f2) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), gn = ac.createGain(), t1 = ac.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t1);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t1 + dur);
      gn.gain.setValueAtTime(vol || 0.08, t1); gn.gain.exponentialRampToValueAtTime(0.0001, t1 + dur);
      o.connect(gn); gn.connect(ac.destination); o.start(t1); o.stop(t1 + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  function show(id, on) { $(id).hidden = !on; }
  function hud() {
    $('time').textContent = fmt(time);
    $('taps').textContent = g ? g.taps : 0;
    $('best').textContent = bests[level] ? fmt(bests[level]) : '—';
  }
  function pickLevel(lv) {
    if (!LEVELS[lv]) return;
    level = lv;
    try { window.localStorage.setItem(LVKEY, lv); } catch (e) { /* no storage */ }
    [].forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-lv') === lv)); });
    hud();
    if (!g) { size(); draw(0); }
  }
  function start() {
    g = new Pipes(null, level); state = 'play'; time = 0; t0 = 0; spin = {};
    lit = g.flow().lit;
    show('intro', false); show('end', false);
    size(); hud();
  }
  function tap(c, dir) {
    if (state !== 'play' || !g) return;
    var before = g.flow().count;
    g.rotate(c, dir);
    if (!reduce) spin[c] = (dir === 3 ? -1 : 1) * Math.PI / 2;
    var f = g.flow(); lit = f.lit;
    tone(f.count > before ? 660 + f.count * 6 : 360, 0.05, 'sine', 0.05);
    hud();
    if (g.solved()) {
      state = 'won';
      var nb = !bests[level] || time < bests[level];
      if (nb) { bests[level] = time; try { window.localStorage.setItem(KEY, JSON.stringify(bests)); } catch (e) { /* no storage */ } }
      $('endScore').textContent = fmt(time);
      $('endNote').textContent = [LV_NAME[level], T('pp.end', g.taps), nb ? T('g.newBest') : T('g.fastest', fmt(bests[level]))].join(SEP);
      if (root.SnowRealmMini) root.SnowRealmMini.show($('endNote'), { game: 'pipes', lv: ['easy', 'normal', 'hard'].indexOf(level), value: Math.round(time), ms: Math.round(time) });
      setTimeout(function () { if (state === 'won') { show('end', true); $('again').focus(); } }, reduce ? 200 : 900);
      [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone([523, 587, 659, 784, 880, 1047, 1175, 1319][k], 0.2, 'sine', 0.07); }, j * 90); });
      hud();
    }
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (state === 'play' && !document.hidden) { time += dt; if (Math.floor(time / 1000) !== Math.floor((time - dt) / 1000)) hud(); }
    draw(dt);
  }
  function cellAt(e) { var r = cv.getBoundingClientRect(), X = Math.floor((e.clientX - r.left) / r.width * g.N), Y = Math.floor((e.clientY - r.top) / r.height * g.N); return X >= 0 && Y >= 0 && X < g.N && Y < g.N ? Y * g.N + X : -1; }
  cv.addEventListener('pointerdown', function (e) { if (g && state === 'play') { var c = cellAt(e); if (c >= 0) tap(c, e.button === 2 ? 3 : 1); e.preventDefault(); } });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('go').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('toIntro').addEventListener('click', function () { state = 'intro'; g = null; show('end', false); show('intro', true); size(); draw(0); $('go').focus(); });
  [].forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.addEventListener('click', function () { pickLevel(b.getAttribute('data-lv')); }); });
  window.addEventListener('resize', function () { size(); });
  pickLevel(level);
  size();
  window.requestAnimationFrame(loop);
  root.__pipes = function () { return { g: g, state: state, tap: tap }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
