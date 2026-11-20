/* 掃磚 (sweep), one of the SnowRealm brick games.

   A wall of cement bricks; some hide a crack. Tap a brick to knock it out: a number says how many of the eight bricks
   around it hide cracks, and a brick with none around opens up its neighbours by itself. Mark the bricks you think
   are cracked with a flag (long press, right click, or the flag mode). Knocking out a cracked brick costs a heart
   (five) and leaves it marked; the run ends with the last heart. Done when every sound brick is out. The first tap is
   never a crack, and opens an area. Sizes by difficulty; the best time for each is kept.

   The rules (Sweep) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var LIVES = 5;
  var LEVELS = { easy: { w: 8, h: 8, n: 9 }, normal: { w: 10, h: 10, n: 16 }, hard: { w: 10, h: 14, n: 30 } };

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function Sweep(seed, level) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.level = LEVELS[level] ? level : 'normal';
    var c = LEVELS[this.level];
    this.W = c.w; this.H = c.h; this.count = c.n;
    this.crack = null;                       // laid on the first tap, away from it
    this.open = []; this.flag = []; this.num = [];
    for (var i = 0; i < this.W * this.H; i++) { this.open.push(false); this.flag.push(false); this.num.push(0); }
    this.lives = LIVES; this.hits = 0; this.left = this.W * this.H - this.count; this.over = false; this.taps = 0;
  }
  Sweep.LIVES = LIVES; Sweep.LEVELS = LEVELS;
  Sweep.prototype.around = function (i) {
    var x = i % this.W, y = Math.floor(i / this.W), out = [];
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < this.W && ny < this.H) out.push(ny * this.W + nx);
    }
    return out;
  };
  Sweep.prototype.lay = function (first) {
    var keep = {}, i, self = this;
    keep[first] = 1; this.around(first).forEach(function (j) { keep[j] = 1; });
    var spots = [];
    for (i = 0; i < this.W * this.H; i++) if (!keep[i]) spots.push(i);
    for (i = spots.length - 1; i > 0; i--) { var j = Math.floor(this.rng.next() * (i + 1)), t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    this.crack = [];
    for (i = 0; i < this.W * this.H; i++) this.crack.push(false);
    spots.slice(0, this.count).forEach(function (s) { self.crack[s] = true; });
    for (i = 0; i < this.W * this.H; i++) this.num[i] = this.around(i).filter(function (k) { return self.crack[k]; }).length;
  };
  // knock out brick i: 'open' (with how many), 'hit' (a crack: a heart), or '' (nothing to do)
  Sweep.prototype.dig = function (i) {
    if (this.over || this.done() || i < 0 || i >= this.open.length || this.open[i] || this.flag[i]) return '';
    if (!this.crack) this.lay(i);
    this.taps++;
    if (this.crack[i]) {
      this.open[i] = true; this.hits++; this.lives--;
      if (this.lives <= 0) this.over = true;
      return 'hit';
    }
    var stack = [i], opened = 0;
    while (stack.length) {
      var c = stack.pop();
      if (this.open[c] || this.crack[c]) continue;
      this.open[c] = true; this.flag[c] = false; this.left--; opened++;
      if (this.num[c] === 0) stack.push.apply(stack, this.around(c));
    }
    return opened ? 'open' : '';
  };
  Sweep.prototype.toggleFlag = function (i) {
    if (this.over || this.done() || this.open[i]) return false;
    this.flag[i] = !this.flag[i];
    return true;
  };
  // tapping an opened number whose flags all around add up: open the rest around it
  Sweep.prototype.chord = function (i) {
    if (!this.open[i] || this.crack && this.crack[i]) return [];
    var self = this, around = this.around(i), flags = around.filter(function (k) { return self.flag[k] || (self.open[k] && self.crack[k]); }).length;
    if (flags !== this.num[i]) return [];
    var out = [];
    around.forEach(function (k) { if (!self.open[k] && !self.flag[k]) out.push([k, self.dig(k)]); });
    return out;
  };
  Sweep.prototype.done = function () { return this.left === 0; };
  Sweep.prototype.flags = function () { var n = 0; for (var i = 0; i < this.flag.length; i++) if (this.flag[i]) n++; return n; };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Sweep; return; }
  root.Sweep = Sweep;

  // ---------- the screen ----------
  var NUMC = [null, '#5DB7F5', '#37C29A', '#F0704F', '#B49CFF', '#E04F5F', '#2FA4A9', '#F5B82E', '#E8EDF2'];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.sweep.bests', LVKEY = 'snowrealm.sweep.level';
  var g = null, state = 'intro', last = 0, cell = 36, dpr = 1, ac = null, time = 0, mode = 'dig', bits = [], press = null, flash = 0;
  var level = 'normal', bests = {};
  try { level = window.localStorage.getItem(LVKEY) || 'normal'; bests = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  if (!LEVELS[level]) level = 'normal';
  var LV_NAME = { easy: '簡單', normal: '普通', hard: '困難' };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  function size() {
    var c = g ? { w: g.W, h: g.H } : LEVELS[level];
    var room = Math.min(window.innerWidth - 28, 560), tall = window.innerHeight - board.getBoundingClientRect().top - 60;
    cell = Math.max(26, Math.min(56, Math.floor(Math.min(room / c.w, tall / c.h))));
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cell * c.w * dpr); cv.height = Math.round(cell * c.h * dpr);
    cv.style.width = cell * c.w + 'px'; cv.style.height = cell * c.h + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function draw(dt) {
    var c = g ? { w: g.W, h: g.H } : LEVELS[level], i;
    x.fillStyle = '#1C232C'; x.fillRect(0, 0, cell * c.w, cell * c.h);
    if (!g) return;
    var showAll = state === 'lost' || state === 'won';
    for (i = 0; i < g.open.length; i++) {
      var X = i % g.W, Y = Math.floor(i / g.W), px = X * cell, py = Y * cell;
      if (g.open[i] && !(g.crack && g.crack[i])) {
        var n = g.num[i];
        if (n) { x.fillStyle = NUMC[n]; x.font = '800 ' + Math.round(cell * 0.5) + 'px "Avenir Next Condensed", "Roboto Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), px + cell / 2, py + cell / 2 + 1); }
        continue;
      }
      var cracked = g.crack && g.crack[i] && (g.open[i] || showAll);
      // a cement brick
      var pr = press && press.i === i ? 2 : 0;
      rr(px + 2, py + 2 + pr, cell - 4, cell - 4 - pr, cell * 0.14); x.fillStyle = cracked ? '#4A3036' : '#8C939B'; x.fill();
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px + 4, py + cell - 6, cell - 8, 2);
      x.fillStyle = 'rgba(255,255,255,0.25)'; rr(px + cell * 0.18, py + cell * 0.15 + pr, cell * 0.26, cell * 0.09, cell * 0.04); x.fill();
      if (cracked) {
        x.strokeStyle = g.open[i] ? '#E04F5F' : '#F2A3AD'; x.lineWidth = Math.max(1.5, cell * 0.07); x.lineJoin = 'round';
        x.beginPath(); x.moveTo(px + cell * 0.3, py + cell * 0.18); x.lineTo(px + cell * 0.48, py + cell * 0.45); x.lineTo(px + cell * 0.36, py + cell * 0.58); x.lineTo(px + cell * 0.62, py + cell * 0.84); x.moveTo(px + cell * 0.48, py + cell * 0.45); x.lineTo(px + cell * 0.72, py + cell * 0.36); x.stroke();
      } else if (g.flag[i]) {
        x.fillStyle = '#F5B82E'; x.beginPath(); x.moveTo(px + cell * 0.38, py + cell * 0.22); x.lineTo(px + cell * 0.72, py + cell * 0.36); x.lineTo(px + cell * 0.38, py + cell * 0.5); x.closePath(); x.fill();
        x.fillStyle = '#222B36'; x.fillRect(px + cell * 0.35, py + cell * 0.2, cell * 0.06, cell * 0.58);
        if (showAll && g.crack && !g.crack[i]) { x.strokeStyle = '#E04F5F'; x.lineWidth = 2; x.beginPath(); x.moveTo(px + 6, py + 6); x.lineTo(px + cell - 6, py + cell - 6); x.stroke(); }
      }
    }
    for (i = bits.length - 1; i >= 0; i--) {
      var b = bits[i]; b.t += dt;
      if (b.t > 520) { bits.splice(i, 1); continue; }
      x.globalAlpha = 1 - b.t / 520; x.fillStyle = '#8C939B'; x.fillRect(b.x + b.vx * b.t, b.y + b.vy * b.t + 0.0006 * b.t * b.t, cell * 0.14, cell * 0.14); x.globalAlpha = 1;
    }
    if (flash > 0) { x.fillStyle = 'rgba(224,79,95,' + (flash * 0.3).toFixed(3) + ')'; x.fillRect(0, 0, cell * c.w, cell * c.h); flash = Math.max(0, flash - dt / 400); }
  }
  function burst(i) { if (reduce) return; var px = (i % g.W) * cell + cell / 2, py = Math.floor(i / g.W) * cell + cell / 2; for (var k = 0; k < 5; k++) bits.push({ x: px, y: py, vx: (Math.random() - 0.5) * 0.18, vy: -Math.random() * 0.14, t: 0 }); }
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
  var heartsShown = -1;
  function hud() {
    $('time').textContent = fmt(time);
    $('left').textContent = g ? Math.max(0, g.count - g.flags() - (g.crack ? g.crack.filter(function (c, i) { return c && g.open[i]; }).length : 0)) : LEVELS[level].n;
    var k = g ? g.lives : LIVES;
    if (k !== heartsShown) {
      var h = ''; for (var i = 0; i < LIVES; i++) h += i < k ? '♥' : '♡';
      var el = $('hearts'); el.textContent = h; el.setAttribute('aria-label', '剩 ' + k + ' 條命');
      if (heartsShown > k) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      heartsShown = k;
    }
    $('modeDig').setAttribute('aria-pressed', String(mode === 'dig'));
    $('modeFlag').setAttribute('aria-pressed', String(mode === 'flag'));
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
    g = new Sweep(null, level); state = 'play'; time = 0; bits = []; heartsShown = -1; mode = 'dig';
    show('intro', false); show('end', false);
    size(); hud();
  }
  function result(r, i) {
    if (r === 'open') { burst(i); tone(520 + Math.min(10, g.num[i]) * 40, 0.05, 'triangle', 0.05); }
    else if (r === 'hit') { flash = 1; tone(220, 0.25, 'sawtooth', 0.06, 110); }
  }
  function act(i, how) {
    if (state !== 'play' || !g) return;
    if (how === 'flag') { if (g.toggleFlag(i)) tone(880, 0.04, 'sine', 0.04); }
    else if (g.open[i]) g.chord(i).forEach(function (p) { result(p[1], p[0]); });
    else result(g.dig(i), i);
    hud();
    if (g.over) end(false); else if (g.done()) end(true);
  }
  function end(won) {
    state = won ? 'won' : 'lost';
    var nb = false;
    if (won) { nb = !bests[level] || time < bests[level]; if (nb) { bests[level] = time; try { window.localStorage.setItem(KEY, JSON.stringify(bests)); } catch (e) { /* no storage */ } } }
    $('endTitle').textContent = won ? '全部敲完了！' : '命用完了';
    $('endScore').textContent = fmt(time);
    $('endNote').textContent = LV_NAME[level] + (won ? '・踩到 ' + g.hits + ' 次裂縫・' + (nb ? '新紀錄！' : '最快 ' + fmt(bests[level])) : '・還剩 ' + g.left + ' 塊沒敲');
    setTimeout(function () { show('end', true); $('again').focus(); }, reduce ? 200 : 900);
    if (won) [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone([523, 587, 659, 784, 880, 1047, 1175, 1319][k], 0.2, 'sine', 0.07); }, j * 90); });
    else tone(330, 0.3, 'triangle', 0.09, 160);
    hud();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (state === 'play' && g.crack && !document.hidden) { var before = Math.floor(time / 1000); time += dt; if (Math.floor(time / 1000) !== before) hud(); }
    if (press && state === 'play' && !press.fired && now - press.at > 420) { press.fired = true; act(press.i, mode === 'flag' ? 'dig' : 'flag'); if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* fine */ } }
    draw(dt);
  }
  function cellAt(e) { var r = cv.getBoundingClientRect(), X = Math.floor((e.clientX - r.left) / r.width * g.W), Y = Math.floor((e.clientY - r.top) / r.height * g.H); return X >= 0 && Y >= 0 && X < g.W && Y < g.H ? Y * g.W + X : -1; }
  // a tap digs (or flags, in flag mode); a long press or right click does the other
  cv.addEventListener('pointerdown', function (e) {
    if (!g || state !== 'play') return;
    var i = cellAt(e); if (i < 0) return;
    e.preventDefault();
    if (e.button === 2) { act(i, 'flag'); return; }
    press = { i: i, at: performance.now(), fired: false };
  });
  cv.addEventListener('pointerup', function (e) {
    if (!press) return;
    var p = press; press = null;
    if (p.fired || !g || state !== 'play') return;
    if (cellAt(e) !== p.i) return;
    act(p.i, mode === 'flag' ? 'flag' : 'dig');
  });
  cv.addEventListener('pointerleave', function () { press = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('modeDig').addEventListener('click', function () { mode = 'dig'; hud(); });
  $('modeFlag').addEventListener('click', function () { mode = 'flag'; hud(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && state === 'play') { mode = mode === 'dig' ? 'flag' : 'dig'; hud(); } });
  $('go').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('toIntro').addEventListener('click', function () { state = 'intro'; g = null; show('end', false); show('intro', true); size(); draw(0); $('go').focus(); });
  [].forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.addEventListener('click', function () { pickLevel(b.getAttribute('data-lv')); }); });
  window.addEventListener('resize', function () { size(); });
  pickLevel(level);
  size();
  window.requestAnimationFrame(loop);
  root.__sweep = function () { return { g: g, state: state, act: act }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
