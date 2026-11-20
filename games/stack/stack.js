/* 疊磚塔 (stacker), one of the SnowRealm brick games.

   A brick slides from side to side above the tower; drop it. Whatever hangs over the edge of the brick below is cut
   off and falls, so the tower gets narrower. Drop it right on (within a few pixels) for a perfect: nothing is cut, and
   every third perfect in a row widens the brick a little. A drop that misses the tower altogether costs a heart (five
   to start) and the brick comes round again; the last heart ends the run. The higher the tower, the quicker the
   slide, set by the difficulty picked. Higher up, the brick now and then comes from the other side, and on hard it
   speeds up and slows down as it goes.

   The rules (Stacker) are kept apart from the screen so they can be tested without a browser. Field 360 wide. */
(function (root) {
  'use strict';
  var W = 360, BH = 24, BASE = 200, PERFECT = 4, LIVES = 5, GROW = 12;
  var LEVELS = {
    easy: { speed: 110, up: 2.5, max: 260, wobble: false },
    normal: { speed: 160, up: 3.5, max: 340, wobble: false },
    hard: { speed: 215, up: 4.5, max: 420, wobble: true }
  };

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function Stacker(seed, level) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.level = LEVELS[level] ? level : 'normal';
    this.cfg = LEVELS[this.level];
    this.tower = [{ x: (W - BASE) / 2, w: BASE, c: 0 }];
    this.lives = LIVES; this.score = 0; this.combo = 0; this.perfects = 0; this.bestCombo = 0; this.over = false;
    this.t = 0;
    this.events = [];
    this.next();
  }
  Stacker.W = W; Stacker.BH = BH; Stacker.BASE = BASE; Stacker.PERFECT = PERFECT; Stacker.LIVES = LIVES; Stacker.LEVELS = LEVELS;

  Stacker.prototype.top = function () { return this.tower[this.tower.length - 1]; };
  Stacker.prototype.floors = function () { return this.tower.length - 1; };
  Stacker.prototype.speed = function () { var c = this.cfg; return Math.min(c.max, c.speed + c.up * this.floors()); };
  // the next brick: as wide as the top, coming in from the left, or from either side once the tower is 10 high
  Stacker.prototype.next = function () {
    var w = this.top().w, fromRight = this.floors() >= 10 && this.rng.next() < 0.5;
    this.cur = { x: fromRight ? W - w : 0, w: w, dir: fromRight ? -1 : 1, c: 1 + (this.tower.length % 6) };
    this.t = 0;
  };
  Stacker.prototype.step = function (dt) {
    if (this.over) return;
    var c = this.cur, s = this.speed();
    this.t += dt;
    // on hard, past the 15th floor, the slide speeds up and slows down
    if (this.cfg.wobble && this.floors() >= 15) s *= 1 + 0.45 * Math.sin(this.t * 3.1);
    c.x += c.dir * s * dt;
    if (c.x < 0) { c.x = -c.x; c.dir = 1; }
    if (c.x > W - c.w) { c.x = 2 * (W - c.w) - c.x; c.dir = -1; }
  };
  Stacker.prototype.drop = function () {
    if (this.over) return null;
    this.events = [];
    var c = this.cur, t = this.top(), lo = Math.max(c.x, t.x), hi = Math.min(c.x + c.w, t.x + t.w), y = this.tower.length;
    if (hi - lo <= 0) {
      // missed the tower: the whole brick falls
      this.lives--; this.combo = 0;
      this.events.push({ type: 'miss', x: c.x, w: c.w, y: y, c: c.c, lives: this.lives });
      if (this.lives <= 0) { this.over = true; this.events.push({ type: 'over' }); return 'over'; }
      this.next();
      return 'miss';
    }
    if (Math.abs(c.x - t.x) <= PERFECT) {
      // right on: nothing cut; every third perfect in a row gives some width back
      this.combo++; this.perfects++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      var w = t.w, x = t.x;
      if (this.combo % 3 === 0 && w < BASE) { var add = Math.min(GROW, BASE - w); w += add; x = Math.max(0, Math.min(W - w, x - add / 2)); }
      this.tower.push({ x: x, w: w, c: c.c });
      this.score += 1 + this.combo;
      this.events.push({ type: 'perfect', combo: this.combo, y: y, grew: w > t.w });
    } else {
      this.combo = 0;
      this.tower.push({ x: lo, w: hi - lo, c: c.c });
      this.score += 1;
      // the part that hung over, falling
      var cut = c.x < t.x ? { x: c.x, w: t.x - c.x } : { x: hi, w: c.x + c.w - hi };
      this.events.push({ type: 'cut', x: cut.x, w: cut.w, y: y, c: c.c, side: c.x < t.x ? -1 : 1 });
    }
    if (this.floors() % 10 === 0) this.events.push({ type: 'height', floors: this.floors() });
    this.next();
    return 'ok';
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Stacker; return; }
  root.Stacker = Stacker;

  // ---------- the screen ----------
  var COL = ['#8C939B', '#FF9DB5', '#F5B82E', '#5DB7F5', '#37C29A', '#B49CFF', '#F0704F'];
  var H = 540, VIEW_TOP = 230;      // the top of the tower is kept about here on screen
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.stack.bests', LVKEY = 'snowrealm.stack.level';
  var g = null, state = 'intro', last = 0, scale = 1, dpr = 1, fx = [], bits = [], shake = 0, ac = null, wait = 0, cam = 0, flash = 0;
  var level = 'normal', bests = {};
  try { level = window.localStorage.getItem(LVKEY) || 'normal'; bests = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  if (!LEVELS[level]) level = 'normal';
  var LV_NAME = { easy: '簡單', normal: '普通', hard: '困難' };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function bestOf(lv) { return +bests[lv] || 0; }

  function size() {
    var room = Math.min(window.innerWidth - 28, 560), tall = window.innerHeight - board.getBoundingClientRect().top - 40;
    scale = Math.max(0.5, Math.min(room / W, tall / H));
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
    cv.style.width = Math.round(W * scale) + 'px'; cv.style.height = Math.round(H * scale) + 'px';
    draw(0);
  }
  function rr(px, py, w, h, r) { r = Math.min(r, w / 2, h / 2); x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  // floor n sits at this height on screen (floor 0 is the base)
  function yOf(n) { return H - 60 - (n + 1) * BH + cam; }
  function brick(px, py, w, c) {
    if (w <= 0) return;
    rr(px, py, w, BH - 2, 5); x.fillStyle = COL[c]; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + 3, py + BH - 6, Math.max(0, w - 6), 3);
    if (w > 16) { x.fillStyle = 'rgba(255,255,255,0.5)'; rr(px + 5, py + 4, Math.min(22, w - 10), 4, 2); x.fill(); }
  }
  function draw(dt) {
    x.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    x.save();
    if (shake > 0 && !reduce) { x.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 0.03); }
    // the sky darkens as the tower climbs, and stars come out
    var hgt = g ? g.floors() : 0, k = Math.min(1, hgt / 60), sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix('#2E3B4C', '#0B0F1A', k)); sky.addColorStop(1, mix('#222B36', '#141B28', k));
    x.fillStyle = sky; x.fillRect(-10, -10, W + 20, H + 20);
    if (k > 0.2) { x.fillStyle = 'rgba(255,255,255,' + ((k - 0.2) * 0.9).toFixed(2) + ')'; for (var i = 0; i < 40; i++) { var sx = (i * 97) % W, sy = ((i * 53 + cam * 0.2) % H); x.fillRect(sx, sy, 1.5, 1.5); } }
    if (!g) { x.restore(); return; }
    // the ground
    x.fillStyle = '#3B4857'; x.fillRect(0, yOf(-1), W, H);
    // the tower, only what is on screen
    for (i = 0; i < g.tower.length; i++) { var f = g.tower[i], y = yOf(i); if (y > H || y < -BH) continue; brick(f.x, y, f.w, f.c); }
    // the brick in the air
    if (state === 'play' || state === 'pause' || state === 'ouch') { var c = g.cur; brick(c.x, yOf(g.tower.length), c.w, c.c); }
    // the guide: where the brick below begins and ends
    var tp = g.top(), gy = yOf(g.tower.length);
    x.strokeStyle = 'rgba(232,237,242,0.18)'; x.setLineDash([3, 4]); x.lineWidth = 1;
    x.beginPath(); x.moveTo(tp.x + 0.5, gy); x.lineTo(tp.x + 0.5, gy + BH); x.moveTo(tp.x + tp.w - 0.5, gy); x.lineTo(tp.x + tp.w - 0.5, gy + BH); x.stroke(); x.setLineDash([]);
    // falling pieces
    for (i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.t += dt; b.vy += 0.0018 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.a += b.va * dt;
      if (b.y > H + 80 || b.t > 2500) { bits.splice(i, 1); continue; }
      x.save(); x.translate(b.x + b.w / 2, b.y + BH / 2); x.rotate(b.a); brick(-b.w / 2, -BH / 2, b.w, b.c); x.restore();
    }
    for (i = fx.length - 1; i >= 0; i--) {
      var p = fx[i];
      p.t += dt;
      if (p.t > p.life) { fx.splice(i, 1); continue; }
      var q = p.t / p.life;
      x.globalAlpha = 1 - q;
      if (p.kind === 'ring') { x.strokeStyle = '#FFE08A'; x.lineWidth = 3; rr(p.x - q * 10, p.y - q * 6, p.w + q * 20, BH - 2 + q * 12, 6); x.stroke(); }
      else { x.fillStyle = '#FFFFFF'; x.font = '800 16px sans-serif'; x.textAlign = 'center'; x.fillText(p.text, p.x, p.y - q * 24); }
      x.globalAlpha = 1;
    }
    if (flash > 0) { x.fillStyle = 'rgba(224,79,95,' + (flash * 0.35).toFixed(3) + ')'; x.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt / 400); }
    if (state === 'play' && hgt === 0) { x.fillStyle = 'rgba(232,237,242,0.8)'; x.font = '700 14px sans-serif'; x.textAlign = 'center'; x.fillText(window.matchMedia('(hover: none)').matches ? '點一下放下磚塊' : '按空白鍵或點一下放下磚塊', W / 2, 120); }
    x.restore();
  }
  function mix(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
    for (var s = 16; s >= 0; s -= 8) { var v = Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); out += ('0' + v.toString(16)).slice(-2); }
    return out;
  }

  function tone(f, dur, type, vol, f2) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), gn = ac.createGain(), t0 = ac.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      gn.gain.setValueAtTime(vol || 0.08, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];

  function show(id, on) { $(id).hidden = !on; }
  var heartsShown = -1;
  function hud() {
    $('score').textContent = g ? g.score : 0;
    $('best').textContent = bestOf(level);
    $('stage').textContent = g ? g.floors() : 0;
    var n = g ? g.lives : LIVES;
    if (n !== heartsShown) {
      var h = '';
      for (var i = 0; i < LIVES; i++) h += i < n ? '♥' : '♡';
      var el = $('hearts');
      el.textContent = h; el.setAttribute('aria-label', '剩 ' + n + ' 條命');
      if (heartsShown > n) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      heartsShown = n;
    }
  }
  function pickLevel(lv) {
    if (!LEVELS[lv]) return;
    level = lv;
    try { window.localStorage.setItem(LVKEY, lv); } catch (e) { /* no storage */ }
    [].forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-lv') === lv)); });
    hud();
  }
  function start() {
    g = new Stacker(null, level); state = 'play'; fx = []; bits = []; cam = 0; heartsShown = -1;
    show('intro', false); show('end', false); show('paused', false); show('ouch', false);
    $('pause').disabled = false;
    hud();
    tone(660, 0.12, 'sine', 0.06, 990);
  }
  function finish() {
    state = 'over';
    var nb = g.score > bestOf(level);
    if (nb) { bests[level] = g.score; try { window.localStorage.setItem(KEY, JSON.stringify(bests)); } catch (e) { /* no storage */ } }
    show('ouch', false);
    $('endScore').textContent = g.score;
    $('endNote').textContent = LV_NAME[level] + '・' + (nb ? '新紀錄！' : '最佳 ' + bestOf(level) + ' 分') + '・疊了 ' + g.floors() + ' 層・完美 ' + g.perfects + ' 次' + (g.bestCombo > 1 ? '・最多連續 ' + g.bestCombo + ' 次' : '');
    show('end', true);
    $('pause').disabled = true;
    hud();
    tone(330, 0.3, 'triangle', 0.09, 160); shake = 8;
    setTimeout(function () { $('again').focus(); }, 50);
  }
  function pause(on) {
    if (state !== 'play' && state !== 'pause') return;
    state = on ? 'pause' : 'play';
    show('paused', on);
    $('pause').textContent = on ? '繼續' : '暫停';
    if (on) $('resume').focus();
  }
  function drop() {
    if (state !== 'play') return;
    var r = g.drop();
    g.events.forEach(function (e) {
      var y = yOf(e.y);
      if (e.type === 'cut') { bits.push({ x: e.x, y: y, w: e.w, c: e.c, t: 0, vx: e.side * 0.04, vy: 0, a: 0, va: e.side * 0.003 }); tone(392, 0.07, 'triangle', 0.06); shake = 2; }
      else if (e.type === 'perfect') {
        var tp = g.tower[e.y];
        fx.push({ kind: 'ring', x: tp.x, y: y, w: tp.w, t: 0, life: 450 });
        fx.push({ kind: 'txt', text: e.grew ? '變寬了！' : e.combo > 1 ? '完美 ×' + e.combo : '完美', x: tp.x + tp.w / 2, y: y - 6, t: 0, life: 800 });
        tone(SCALE[Math.min(9, e.combo - 1)], 0.14, 'sine', 0.08);
      }
      else if (e.type === 'miss') {
        bits.push({ x: e.x, y: y, w: e.w, c: e.c, t: 0, vx: 0, vy: 0, a: 0, va: 0.002 });
        if (e.lives > 0) { $('ouchT').textContent = '沒放到塔上'; $('ouchP').textContent = '還剩 ' + e.lives + ' 條命'; show('ouch', true); state = 'ouch'; wait = 1000; }
        flash = 1; shake = 6; tone(260, 0.22, 'triangle', 0.09, 150);
      }
      else if (e.type === 'height') { fx.push({ kind: 'txt', text: e.floors + ' 層！', x: W / 2, y: 90, t: 0, life: 1200 }); [0, 2, 4].forEach(function (k, j) { setTimeout(function () { tone(SCALE[k + 3], 0.16, 'sine', 0.06); }, j * 80); }); }
    });
    if (r === 'over') finish();
    hud();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (state === 'ouch') { wait -= dt; if (wait <= 0) { state = 'play'; show('ouch', false); } }
    else if (state === 'play') g.step(dt / 1000);
    // the camera follows the top of the tower
    if (g) { var want = Math.max(0, (g.tower.length + 1) * BH - (H - 60 - VIEW_TOP)); cam += (want - cam) * Math.min(1, dt / 160); }
    draw(dt);
  }

  board.addEventListener('pointerdown', function (e) { if (state === 'play') { drop(); e.preventDefault(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      if (state === 'play' && document.activeElement !== $('pause')) { drop(); e.preventDefault(); }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (state === 'play' || state === 'pause') { pause(state === 'play'); e.preventDefault(); } }
  });
  $('go').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('toIntro').addEventListener('click', function () { state = 'intro'; show('end', false); show('intro', true); $('go').focus(); });
  [].forEach.call(document.querySelectorAll('[data-lv]'), function (b) { b.addEventListener('click', function () { pickLevel(b.getAttribute('data-lv')); }); });
  $('resume').addEventListener('click', function () { pause(false); });
  $('pause').addEventListener('click', function () { pause(state === 'play'); });
  $('pause').disabled = true;
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(true); });
  window.addEventListener('resize', size);
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = '點一下場地放下磚塊';
  pickLevel(level);
  size();
  window.requestAnimationFrame(loop);
  root.__stack = function () { return { g: g, state: state, drop: drop }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
