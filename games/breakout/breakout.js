/* 打磚塊 (breakout), one of the SnowRealm brick games.

   Bounce the ball off the paddle into the wall of glazed bricks until every breakable brick is gone; then the next
   wall, a little faster. Cement bricks take two hits, steel ones never break (and do not count). Some bricks drop a
   power-up: a wider paddle, two more balls, a slower ball, or now and then a heart. Five hearts; a heart goes each
   time the last ball falls past the paddle. How fast the ball is, is set by the difficulty picked.

   The rules (Breakout) are kept apart from the screen so they can be tested without a browser. Everything is in a
   field 360 by 540; the screen scales it. */
(function (root) {
  'use strict';
  var W = 360, H = 540, COLS = 10, BW = 32, BH = 14, GAP = 2, TOP = 64, LEFT = (W - (COLS * (BW + GAP) - GAP)) / 2;
  var PY = 500, PH = 12, PW = 64, WIDE = 100, R = 6, LIVES = 5;
  var LEVELS = {
    easy: { speed: 250, up: 0.04, max: 420 },
    normal: { speed: 320, up: 0.05, max: 520 },
    hard: { speed: 400, up: 0.06, max: 620 }
  };
  // brick kinds: 1..5 glazed colours (one hit), 6 cement (two hits), 8 steel (never breaks)
  var CEMENT = 6, STEEL = 8;
  var DROPS = ['wide', 'multi', 'slow', 'heart'];

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // the wall for level n: a pattern, more rows as the levels go, cement from level 2 and a few steel from level 4
  var PATTERNS = ['full', 'checker', 'pyramid', 'stripes', 'gaps', 'diamond', 'frame'];
  function wall(n, rng) {
    var rows = Math.min(9, 4 + Math.floor((n - 1) / 1.5)), pat = PATTERNS[(n - 1) % PATTERNS.length], out = [], r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < COLS; c++) {
      var on = true, mid = (COLS - 1) / 2;
      if (pat === 'checker') on = (r + c) % 2 === 0;
      else if (pat === 'pyramid') on = Math.abs(c - mid) <= r * 0.75 + 0.5;
      else if (pat === 'stripes') on = r % 2 === 0;
      else if (pat === 'gaps') on = c % 3 !== 1;
      else if (pat === 'diamond') on = Math.abs(c - mid) + Math.abs(r - (rows - 1) / 2) <= rows / 2 + 1;
      else if (pat === 'frame') on = r === 0 || r === rows - 1 || c === 0 || c === COLS - 1 || (r === Math.floor(rows / 2) && c > 2 && c < 7);
      if (!on) continue;
      var kind = 1 + (r % 5), hits = 1;
      if (n >= 2 && rng.next() < Math.min(0.3, 0.06 * (n - 1))) { kind = CEMENT; hits = 2; }
      if (n >= 4 && r === rows - 1 && rng.next() < 0.18) { kind = STEEL; hits = Infinity; }
      out.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH, kind: kind, hits: hits, drop: kind !== STEEL && rng.next() < 0.14 });
    }
    return out;
  }

  function Breakout(seed, level) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.level = LEVELS[level] ? level : 'normal';
    this.cfg = LEVELS[this.level];
    this.n = 0; this.lives = LIVES; this.score = 0; this.combo = 0; this.broken = 0; this.over = false;
    this.paddle = { x: W / 2, w: PW };
    this.wideT = 0; this.slowT = 0;
    this.events = [];
    this.nextLevel();
  }
  Breakout.W = W; Breakout.H = H; Breakout.PY = PY; Breakout.PH = PH; Breakout.R = R; Breakout.LIVES = LIVES;
  Breakout.LEVELS = LEVELS; Breakout.CEMENT = CEMENT; Breakout.STEEL = STEEL; Breakout.wall = function (n, seed) { return wall(n, new RNG(seed || 1)); };

  Breakout.prototype.nextLevel = function () {
    this.n++;
    this.bricks = wall(this.n, this.rng);
    this.drops = [];
    this.wideT = 0; this.slowT = 0; this.paddle.w = PW;
    this.serve();
  };
  // the ball sits on the paddle until it is launched
  Breakout.prototype.serve = function () {
    this.balls = [{ x: this.paddle.x, y: PY - R - 1, vx: 0, vy: 0 }];
    this.held = true;
    this.combo = 0;
  };
  Breakout.prototype.speed = function () {
    var c = this.cfg, s = Math.min(c.max, c.speed * (1 + c.up * (this.n - 1)) + this.broken * 0.4);
    return this.slowT > 0 ? s * 0.7 : s;
  };
  Breakout.prototype.launch = function () {
    if (!this.held || this.over) return false;
    this.held = false;
    var a = (this.rng.next() - 0.5) * 0.6, s = this.speed();
    this.balls[0].vx = s * Math.sin(a); this.balls[0].vy = -s * Math.cos(a);
    this.events.push({ type: 'launch' });
    return true;
  };
  Breakout.prototype.move = function (x) {
    var half = this.paddle.w / 2;
    this.paddle.x = Math.max(half, Math.min(W - half, x));
    if (this.held) this.balls[0].x = this.paddle.x;
  };
  Breakout.prototype.left = function () { var n = 0; for (var i = 0; i < this.bricks.length; i++) if (this.bricks[i].kind !== STEEL) n++; return n; };

  // keep every ball at the speed it should have now
  function setSpeed(b, s) { var v = Math.hypot(b.vx, b.vy) || 1; b.vx *= s / v; b.vy *= s / v; }

  // dt in seconds
  Breakout.prototype.step = function (dt) {
    if (this.over) return;
    var i, b, s = this.speed(), parts = Math.max(1, Math.ceil(s * dt / 3));
    if (this.wideT > 0) { this.wideT -= dt; if (this.wideT <= 0) this.paddle.w = PW; }
    if (this.slowT > 0) this.slowT -= dt;
    this.move(this.paddle.x);
    if (!this.held) {
      for (var k = 0; k < parts; k++) {
        for (i = this.balls.length - 1; i >= 0; i--) {
          b = this.balls[i];
          setSpeed(b, s);
          b.x += b.vx * dt / parts; b.y += b.vy * dt / parts;
          this.bounce(b);
          if (b.y - R > H) { this.balls.splice(i, 1); }
        }
        if (!this.balls.length) break;
      }
      if (!this.balls.length) return this.lose();
    }
    // power-ups falling
    for (i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i];
      d.y += 130 * dt;
      var p = this.paddle;
      if (d.y + 8 >= PY && d.y - 8 <= PY + PH && Math.abs(d.x - p.x) <= p.w / 2 + 8) { this.drops.splice(i, 1); this.take(d.kind); }
      else if (d.y > H + 10) this.drops.splice(i, 1);
    }
  };
  Breakout.prototype.bounce = function (b) {
    // the side walls and the top
    if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); this.events.push({ type: 'wall' }); }
    if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); this.events.push({ type: 'wall' }); }
    if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); this.events.push({ type: 'wall' }); }
    // the paddle: where it is hit decides the angle, up to 60 degrees off straight up
    var p = this.paddle;
    if (b.vy > 0 && b.y + R >= PY && b.y + R <= PY + PH + 8 && Math.abs(b.x - p.x) <= p.w / 2 + R) {
      var rel = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2))), a = rel * Math.PI / 3, s = Math.hypot(b.vx, b.vy);
      b.vx = s * Math.sin(a); b.vy = -s * Math.cos(a);
      b.y = PY - R;
      this.combo = 0;
      this.events.push({ type: 'paddle' });
      return;
    }
    // the bricks: the first one the ball overlaps; it bounces off the side it came in through
    for (var i = 0; i < this.bricks.length; i++) {
      var k = this.bricks[i], cx = Math.max(k.x, Math.min(b.x, k.x + k.w)), cy = Math.max(k.y, Math.min(b.y, k.y + k.h)), dx = b.x - cx, dy = b.y - cy;
      if (dx * dx + dy * dy > R * R) continue;
      var ox = Math.min(b.x + R - k.x, k.x + k.w - (b.x - R)), oy = Math.min(b.y + R - k.y, k.y + k.h - (b.y - R));
      if (ox < oy) { b.vx = b.x < k.x + k.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += b.vx > 0 ? ox : -ox; }
      else { b.vy = b.y < k.y + k.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += b.vy > 0 ? oy : -oy; }
      this.hit(i);
      return;
    }
  };
  Breakout.prototype.hit = function (i) {
    var k = this.bricks[i];
    if (k.kind === STEEL) { this.events.push({ type: 'steel', x: k.x + k.w / 2, y: k.y + k.h / 2 }); return; }
    k.hits--;
    if (k.hits > 0) { k.cracked = true; this.events.push({ type: 'crack', x: k.x + k.w / 2, y: k.y + k.h / 2 }); return; }
    this.bricks.splice(i, 1);
    this.combo++; this.broken++;
    var pts = (k.kind === CEMENT ? 20 : 10) * (1 + Math.floor(this.combo / 4));
    this.score += pts;
    this.events.push({ type: 'break', x: k.x + k.w / 2, y: k.y + k.h / 2, kind: k.kind, pts: pts, combo: this.combo });
    if (k.drop) {
      var r = this.rng.next(), kind = r < 0.36 ? 'wide' : r < 0.68 ? 'multi' : r < 0.94 ? 'slow' : 'heart';
      this.drops.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, kind: kind });
    }
    if (!this.left()) {
      var bonus = 100 * this.n;
      this.score += bonus;
      this.events.push({ type: 'clear', n: this.n, bonus: bonus });
      this.nextLevel();
    }
  };
  Breakout.prototype.take = function (kind) {
    if (kind === 'wide') { this.paddle.w = WIDE; this.wideT = 12; }
    else if (kind === 'slow') this.slowT = 10;
    else if (kind === 'heart') { if (this.lives < LIVES) this.lives++; else this.score += 50; }
    else if (kind === 'multi' && !this.held && this.balls.length) {
      var b = this.balls[0], s = Math.hypot(b.vx, b.vy) || this.speed();
      for (var j = -1; j <= 1; j += 2) { var a = Math.atan2(b.vx, -b.vy) + j * 0.45; this.balls.push({ x: b.x, y: b.y, vx: s * Math.sin(a), vy: -s * Math.cos(a) }); }
    }
    this.events.push({ type: 'power', kind: kind });
  };
  Breakout.prototype.lose = function () {
    this.lives--;
    this.drops = []; this.wideT = 0; this.slowT = 0; this.paddle.w = PW;
    this.events.push({ type: 'miss', lives: this.lives });
    if (this.lives <= 0) { this.over = true; this.events.push({ type: 'over' }); return; }
    this.serve();
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Breakout; return; }
  root.Breakout = Breakout;

  // ---------- the screen ----------
  var COL = [null, '#FF9DB5', '#F5B82E', '#5DB7F5', '#37C29A', '#B49CFF', '#8C939B', null, '#5A6573'];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.breakout.bests', LVKEY = 'snowrealm.breakout.level';
  var g = null, state = 'intro', last = 0, scale = 1, dpr = 1, fx = [], shake = 0, ac = null, wait = 0, keys = { l: false, r: false };
  var level = 'normal', bests = {};
  try { level = window.localStorage.getItem(LVKEY) || 'normal'; bests = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  if (!LEVELS[level]) level = 'normal';
  var LV_NAME = { easy: '簡單', normal: '普通', hard: '困難' }, POWER = { wide: '加寬', multi: '多球', slow: '變慢', heart: '+1 命' };
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
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function brick(k) {
    rr(k.x, k.y, k.w, k.h, 3.5);
    x.fillStyle = COL[k.kind]; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(k.x + 2, k.y + k.h - 3, k.w - 4, 2);
    if (k.kind === STEEL) { x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(k.x + 4, k.y + 4); x.lineTo(k.x + 8, k.y + 4); x.moveTo(k.x + k.w - 8, k.y + k.h - 5); x.lineTo(k.x + k.w - 4, k.y + k.h - 5); x.stroke(); }
    else { x.fillStyle = 'rgba(255,255,255,0.5)'; rr(k.x + 3, k.y + 2.5, 9, 2.6, 1.3); x.fill(); }
    if (k.cracked) { x.strokeStyle = 'rgba(30,36,44,0.75)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(k.x + k.w * 0.35, k.y); x.lineTo(k.x + k.w * 0.5, k.y + k.h * 0.55); x.lineTo(k.x + k.w * 0.42, k.y + k.h); x.moveTo(k.x + k.w * 0.5, k.y + k.h * 0.55); x.lineTo(k.x + k.w * 0.7, k.y + k.h * 0.4); x.stroke(); }
    if (k.drop) { x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(k.x + k.w - 6, k.y + k.h / 2, 2, 0, 6.283); x.fill(); }
  }
  var DROP_COL = { wide: '#5DB7F5', multi: '#B49CFF', slow: '#37C29A', heart: '#E04F5F' }, DROP_TXT = { wide: '↔', multi: '•••', slow: '≈', heart: '♥' };
  function draw(dt) {
    x.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    x.save();
    if (shake > 0 && !reduce) { x.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 0.03); }
    x.fillStyle = '#222B36'; x.fillRect(-10, -10, W + 20, H + 20);
    x.fillStyle = '#2C3745';
    for (var i = 0; i < 10; i++) x.fillRect(LEFT + i * (BW + GAP) + BW / 2, 0, 1, H);
    if (!g) { x.restore(); return; }
    g.bricks.forEach(brick);
    g.drops.forEach(function (d) {
      x.fillStyle = DROP_COL[d.kind]; rr(d.x - 13, d.y - 8, 26, 16, 8); x.fill();
      x.fillStyle = '#fff'; x.font = '800 11px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(DROP_TXT[d.kind], d.x, d.y + 0.5);
    });
    // the paddle: a long white tile
    var p = g.paddle;
    rr(p.x - p.w / 2, PY, p.w, PH, 6); x.fillStyle = g.wideT > 0 ? '#BFE3FB' : '#F2F5F8'; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(p.x - p.w / 2 + 4, PY + PH - 3, p.w - 8, 2);
    x.fillStyle = '#F5B82E'; rr(p.x - 8, PY + 3, 16, 3, 1.5); x.fill();
    g.balls.forEach(function (b) {
      x.fillStyle = g.slowT > 0 ? '#9FE6CD' : '#FFFFFF';
      x.beginPath(); x.arc(b.x, b.y, R, 0, 6.283); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.arc(b.x + 1.5, b.y + 1.5, R * 0.6, 0, 6.283); x.fill();
    });
    if (g.held && state === 'play') { x.fillStyle = 'rgba(232,237,242,0.75)'; x.font = '700 14px sans-serif'; x.textAlign = 'center'; x.fillText(window.matchMedia('(hover: none)').matches ? '點一下發球' : '按空白鍵或點一下發球', W / 2, PY - 40); }
    for (i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.t += dt;
      if (f.t > f.life) { fx.splice(i, 1); continue; }
      var k = f.t / f.life;
      x.globalAlpha = 1 - k;
      if (f.kind === 'bit') { x.fillStyle = f.c; x.fillRect(f.x + f.vx * f.t, f.y + f.vy * f.t + 0.0005 * f.t * f.t, 4, 4); }
      else { x.fillStyle = '#FFFFFF'; x.font = '800 14px sans-serif'; x.textAlign = 'center'; x.fillText(f.text, f.x, f.y - k * 18); }
      x.globalAlpha = 1;
    }
    x.restore();
  }
  function burst(px, py, c) { for (var i = 0; i < (reduce ? 3 : 7); i++) fx.push({ kind: 'bit', x: px, y: py, vx: (Math.random() - 0.5) * 0.18, vy: -Math.random() * 0.12, c: c, t: 0, life: 480 }); }
  function pop(text, px, py) { fx.push({ kind: 'txt', text: text, x: px, y: py, t: 0, life: 800 }); }

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
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];

  function show(id, on) { $(id).hidden = !on; }
  var heartsShown = -1;
  function hud() {
    $('score').textContent = g ? g.score : 0;
    $('best').textContent = bestOf(level);
    $('stage').textContent = g ? g.n : 1;
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
    g = new Breakout(null, level); state = 'play'; fx = []; heartsShown = -1;
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
    $('endNote').textContent = LV_NAME[level] + '・' + (nb ? '新紀錄！' : '最佳 ' + bestOf(level) + ' 分') + '・打到第 ' + g.n + ' 關・打破 ' + g.broken + ' 塊磚';
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
  function say(t1, t2, ms) { $('ouchT').textContent = t1; $('ouchP').textContent = t2; show('ouch', true); state = 'ouch'; wait = ms; }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (state === 'ouch') { wait -= dt; if (wait <= 0) { state = 'play'; show('ouch', false); } }
    else if (state === 'play') {
      if (keys.l || keys.r) g.move(g.paddle.x + (keys.r - keys.l) * 0.42 * dt);
      g.events = [];
      g.step(dt / 1000);
      g.events.forEach(function (e) {
        if (e.type === 'paddle') tone(392, 0.05, 'triangle', 0.06);
        else if (e.type === 'wall') tone(784, 0.03, 'sine', 0.025);
        else if (e.type === 'steel') tone(1568, 0.06, 'square', 0.025);
        else if (e.type === 'crack') { tone(220, 0.08, 'square', 0.04); burst(e.x, e.y, '#8C939B'); }
        else if (e.type === 'break') {
          tone(SCALE[Math.min(8, e.combo - 1)], 0.08, 'sine', 0.07);
          burst(e.x, e.y, COL[e.kind]);
          if (e.combo >= 4 && e.combo % 4 === 0) pop(e.combo + ' 連打', e.x, e.y);
        }
        else if (e.type === 'power') { tone(880, 0.12, 'sine', 0.07, 1320); pop(POWER[e.kind], g.paddle.x, PY - 14); }
        else if (e.type === 'clear') { say('第 ' + e.n + ' 關過關！', '加 ' + e.bonus + ' 分・下一關快一點', 1500); [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone(SCALE[k], 0.2, 'sine', 0.07); }, j * 90); }); }
        else if (e.type === 'miss' && e.lives > 0) { say('漏接了', '還剩 ' + e.lives + ' 條命', 1100); tone(260, 0.22, 'triangle', 0.09, 150); shake = 6; }
      });
      if (g.over) finish();
      hud();
    }
    draw(dt);
  }

  // ---------- input ----------
  function fieldX(e) { var r = cv.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; }
  board.addEventListener('pointerdown', function (e) {
    if (state !== 'play') return;
    g.move(fieldX(e));
    if (g.held) g.launch();
  });
  board.addEventListener('pointermove', function (e) { if (state === 'play' && (e.pointerType === 'mouse' || e.buttons)) g.move(fieldX(e)); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.l = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.r = true; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowUp') {
      if (state === 'play' && g.held) { g.launch(); e.preventDefault(); }
      else if (e.key === ' ' && (state === 'play' || state === 'pause')) { pause(state === 'play'); e.preventDefault(); }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (state === 'play' || state === 'pause') { pause(state === 'play'); e.preventDefault(); } }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.l = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.r = false;
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
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = '在場地上左右拖曳移動板子，點一下發球';
  pickLevel(level);
  size();
  window.requestAnimationFrame(loop);
  root.__breakout = function () { return { g: g, state: state }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
