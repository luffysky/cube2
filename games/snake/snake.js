/* 磚蛇 (brick snake), one of the SnowRealm brick games.

   A snake made of glazed tiles. Eating a brick puts a tile of that colour right behind the head; three or more tiles
   of one colour in a row anywhere along the body crumble away (the snake gets shorter and the points double for
   each chain). Cement blocks appear as the snake eats, and now and then a gold brick that is gone in a few seconds.
   Hitting a wall, cement or itself ends the run. Faster with every brick eaten.

   The rules (Snake) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var N = 16;                                    // the field is N by N
  var COLORS = 5;                                // tile colours 1..5; 0 is the head, 6 cement, 7 gold
  var CEMENT = 6, GOLD = 7;

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function Snake(seed) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    var mid = N >> 1;
    // body[0] is the head; each part is { x, y, c }
    this.body = [{ x: mid, y: mid, c: 0 }, { x: mid - 1, y: mid, c: 1 + this.int(COLORS) }, { x: mid - 2, y: mid, c: 1 + this.int(COLORS) }];
    while (this.body[1].c === this.body[2].c) this.body[2].c = 1 + this.int(COLORS);
    this.dir = 'right'; this.turns = [];
    this.cement = []; this.food = null; this.gold = null; this.goldLeft = 0;
    this.eaten = 0; this.score = 0; this.cleared = 0; this.chainBest = 0; this.over = false; this.why = '';
    this.events = [];
    this.placeFood();
  }
  Snake.N = N; Snake.CEMENT = CEMENT; Snake.GOLD = GOLD; Snake.COLORS = COLORS;
  Snake.prototype.int = function (n) { return Math.floor(this.rng.next() * n); };
  Snake.prototype.taken = function (x, y) {
    var i;
    for (i = 0; i < this.body.length; i++) if (this.body[i].x === x && this.body[i].y === y) return true;
    for (i = 0; i < this.cement.length; i++) if (this.cement[i].x === x && this.cement[i].y === y) return true;
    if (this.food && this.food.x === x && this.food.y === y) return true;
    if (this.gold && this.gold.x === x && this.gold.y === y) return true;
    return false;
  };
  // a free cell, kept away from just in front of the head so nothing appears where the snake is about to go
  Snake.prototype.freeCell = function () {
    var h = this.body[0], d = DIRS[this.dir];
    for (var tries = 0; tries < 400; tries++) {
      var x = this.int(N), y = this.int(N);
      if (this.taken(x, y)) continue;
      var ahead = (x - h.x) * d[0] + (y - h.y) * d[1];
      if (ahead > 0 && ahead < 4 && Math.abs((x - h.x) * d[1]) + Math.abs((y - h.y) * d[0]) < 2) continue;
      return { x: x, y: y };
    }
    return null;
  };
  Snake.prototype.placeFood = function () {
    var p = this.freeCell();
    if (!p) return;
    // a colour that matches one near the head now and then, so chains are there to be made
    var c = this.rng.next() < 0.45 && this.body[1] ? this.body[1].c : 1 + this.int(COLORS);
    this.food = { x: p.x, y: p.y, c: c };
  };
  // turn: queued, at most two ahead, never straight back into the body
  Snake.prototype.turn = function (d) {
    if (!DIRS[d] || this.over) return false;
    var last = this.turns.length ? this.turns[this.turns.length - 1] : this.dir;
    if (d === last || (DIRS[d][0] === -DIRS[last][0] && DIRS[d][1] === -DIRS[last][1])) return false;
    if (this.turns.length >= 2) return false;
    this.turns.push(d);
    return true;
  };
  // milliseconds between steps: quicker with every brick eaten
  Snake.prototype.speed = function () { return Math.max(70, 160 - this.eaten * 2.5); };

  // one step forward
  Snake.prototype.step = function () {
    if (this.over) return;
    this.events = [];
    if (this.turns.length) this.dir = this.turns.shift();
    var d = DIRS[this.dir], h = this.body[0], x = h.x + d[0], y = h.y + d[1], i;
    if (x < 0 || y < 0 || x >= N || y >= N) return this.end('wall');
    for (i = 0; i < this.cement.length; i++) if (this.cement[i].x === x && this.cement[i].y === y) return this.end('cement');
    var eat = this.food && this.food.x === x && this.food.y === y, gold = this.gold && this.gold.x === x && this.gold.y === y;
    // the tail moves away this step unless the snake grows, so the head may go where the tail just was
    var grows = eat;
    for (i = 1; i < this.body.length - (grows ? 0 : 1); i++) if (this.body[i].x === x && this.body[i].y === y) return this.end('self');
    // everything slides one cell along: each part takes the place of the one in front of it
    var prev = { x: h.x, y: h.y };
    h.x = x; h.y = y;
    for (i = 1; i < this.body.length; i++) { var p = this.body[i], here = { x: p.x, y: p.y }; p.x = prev.x; p.y = prev.y; prev = here; }
    if (eat) {
      // the new tile goes right behind the head; the tail stays where it was, so the snake is one longer
      this.body.push({ x: prev.x, y: prev.y, c: 0 });
      for (i = this.body.length - 1; i > 1; i--) this.body[i].c = this.body[i - 1].c;
      this.body[1].c = this.food.c;
      this.eaten++;
      this.score += 10;
      this.events.push({ type: 'eat', c: this.food.c, x: x, y: y });
      this.food = null;
      this.crumble();
      this.placeFood();
      if (this.eaten % 6 === 0) { var cp = this.freeCell(); if (cp) { this.cement.push(cp); this.events.push({ type: 'cement', x: cp.x, y: cp.y }); } }
      if (!this.gold && this.eaten % 7 === 3) { var gp = this.freeCell(); if (gp) { this.gold = gp; this.goldLeft = 40; } }
    }
    if (gold) { this.score += 100; this.events.push({ type: 'gold', x: x, y: y }); this.gold = null; }
    if (this.gold && --this.goldLeft <= 0) this.gold = null;
  };
  // Three or more of one colour in a row along the body crumble away; what closes up may make another run (a chain).
  Snake.prototype.crumble = function () {
    var chain = 0, b = this.body;
    for (;;) {
      var start = -1, best = null;
      for (var i = 1; i <= b.length; i++) {
        var c = i < b.length ? b[i].c : -1;
        if (start < 0 || c !== b[start].c) {
          if (start >= 1 && i - start >= 3) { best = [start, i - start]; break; }
          start = i;
        }
      }
      if (!best) break;
      chain++;
      var gone = b.splice(best[0], best[1]);
      // the parts behind close up: the rest of the tail moves forward along the path, into the cells just emptied
      var at = best[0], cells = gone.map(function (g) { return { x: g.x, y: g.y }; }), trail = cells.slice(), j;
      for (j = at; j < b.length; j++) trail.push({ x: b[j].x, y: b[j].y });
      for (j = at; j < b.length; j++) { b[j].x = trail[j - at].x; b[j].y = trail[j - at].y; }
      var pts = 50 + (best[1] - 3) * 20;
      this.score += pts * Math.pow(2, chain - 1);
      this.cleared += best[1];
      this.events.push({ type: 'crumble', n: best[1], chain: chain, cells: cells, c: gone[0].c });
    }
    if (chain > this.chainBest) this.chainBest = chain;
    return chain;
  };
  Snake.prototype.end = function (why) { this.over = true; this.why = why; this.events.push({ type: 'over', why: why }); };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Snake; return; }
  root.Snake = Snake;

  // ---------- the screen ----------
  var COL = [null, '#FF9DB5', '#5DB7F5', '#37C29A', '#F0704F', '#B49CFF', '#8C939B', '#F5B82E'];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.snake.best';
  var g = null, state = 'intro', acc = 0, last = 0, cell = 20, dpr = 1, fx = [], shake = 0, ac = null;
  var best = 0;
  try { best = +window.localStorage.getItem(KEY) || 0; } catch (e) { /* no storage */ }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function size() {
    var pad = $('pad'), padH = pad && getComputedStyle(pad).display !== 'none' ? pad.offsetHeight + 16 : 0;
    var room = Math.min(window.innerWidth - 28, window.innerHeight - board.getBoundingClientRect().top - padH - 46, 560);
    cell = Math.max(12, Math.floor(room / N));
    dpr = window.devicePixelRatio || 1;
    cv.width = cell * N * dpr; cv.height = cell * N * dpr;
    cv.style.width = cv.style.height = cell * N + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function tile(cx, cy, c, scale) {
    var s = cell * (scale || 1), g0 = cell * 0.06, px = cx * cell + (cell - s) / 2 + g0, py = cy * cell + (cell - s) / 2 + g0, w = s - 2 * g0;
    rr(px, py, w, w, w * 0.22);
    x.fillStyle = COL[c] || '#F2F5F8'; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + w * 0.1, py + w * 0.8, w * 0.8, w * 0.12);
    x.fillStyle = 'rgba(255,255,255,0.55)'; rr(px + w * 0.16, py + w * 0.14, w * 0.34, w * 0.14, w * 0.07); x.fill();
  }
  function draw(dt) {
    var W = cell * N, i;
    x.save();
    if (shake > 0 && !reduce) { x.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 0.03); }
    x.fillStyle = '#222B36'; x.fillRect(-10, -10, W + 20, W + 20);
    x.fillStyle = '#3B4857';
    for (i = 1; i < N; i++) for (var j = 1; j < N; j++) x.fillRect(i * cell - 1, j * cell - 1, 2, 2);
    if (!g) { x.restore(); return; }
    g.cement.forEach(function (c) { tile(c.x, c.y, CEMENT); });
    if (g.food) tile(g.food.x, g.food.y, g.food.c, 0.86);
    if (g.gold) {
      var blink = g.goldLeft < 12 && Math.floor(Date.now() / 150) % 2;
      if (!blink) tile(g.gold.x, g.gold.y, GOLD, 0.92);
    }
    for (i = g.body.length - 1; i >= 1; i--) tile(g.body[i].x, g.body[i].y, g.body[i].c);
    // the head: a white tile with eyes looking the way it goes
    var h = g.body[0], d = DIRS[g.dir];
    tile(h.x, h.y, 0);
    x.fillStyle = '#222B36';
    var ex = h.x * cell + cell / 2 + d[0] * cell * 0.16, ey = h.y * cell + cell / 2 + d[1] * cell * 0.16;
    var sx = d[1] * cell * 0.17, sy = d[0] * cell * 0.17;
    x.beginPath(); x.arc(ex + sx, ey + sy, cell * 0.08, 0, 6.283); x.arc(ex - sx, ey - sy, cell * 0.08, 0, 6.283); x.fill();
    // crumbling tiles and points
    for (i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.t += dt;
      if (f.t > f.life) { fx.splice(i, 1); continue; }
      var k = f.t / f.life;
      x.globalAlpha = 1 - k;
      if (f.kind === 'bit') { x.fillStyle = f.c; x.fillRect(f.x + f.vx * f.t, f.y + f.vy * f.t + 0.0006 * f.t * f.t, cell * 0.22, cell * 0.22); }
      else { x.fillStyle = '#FFFFFF'; x.font = '800 ' + Math.round(cell * 0.8) + 'px sans-serif'; x.textAlign = 'center'; x.fillText(f.text, f.x, f.y - k * cell); }
      x.globalAlpha = 1;
    }
    x.restore();
  }
  function burst(cx, cy, c) {
    for (var i = 0; i < (reduce ? 3 : 8); i++) fx.push({ kind: 'bit', x: cx * cell + cell / 2, y: cy * cell + cell / 2, vx: (Math.random() - 0.5) * 0.16, vy: -Math.random() * 0.16, c: COL[c], t: 0, life: 520 });
  }
  function pop(text, cx, cy) { fx.push({ kind: 'txt', text: text, x: cx * cell + cell / 2, y: cy * cell + cell / 2, t: 0, life: 800 }); }

  // ---------- sound ----------
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
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];

  function show(id, on) { $(id).hidden = !on; }
  function hud() { $('score').textContent = g ? g.score : 0; $('len').textContent = g ? g.body.length : 3; $('best').textContent = best; }
  function start() {
    g = new Snake(); state = 'play'; acc = 0; fx = [];
    show('intro', false); show('end', false); show('paused', false);
    $('pause').disabled = false;
    hud();
    tone(660, 0.12, 'sine', 0.06, 990);
  }
  function finish() {
    state = 'over';
    var nb = g.score > best;
    if (nb) { best = g.score; try { window.localStorage.setItem(KEY, String(best)); } catch (e) { /* no storage */ } }
    $('endTitle').textContent = g.why === 'self' ? '咬到自己了' : g.why === 'cement' ? '撞到水泥了' : '撞到牆了';
    $('endScore').textContent = g.score;
    $('endNote').textContent = (nb ? '新紀錄！' : '最佳 ' + best + ' 分') + '・吃了 ' + g.eaten + ' 塊・消掉 ' + g.cleared + ' 塊' + (g.chainBest > 1 ? '・最多 ' + g.chainBest + ' 連消' : '');
    show('end', true);
    $('pause').disabled = true;
    hud();
    tone(330, 0.3, 'triangle', 0.09, 160); shake = 10;
    setTimeout(function () { $('again').focus(); }, 50);
  }
  function pause(on) {
    if (state !== 'play' && state !== 'pause') return;
    state = on ? 'pause' : 'play';
    show('paused', on);
    $('pause').textContent = on ? '繼續' : '暫停';
    if (on) $('resume').focus();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(100, now - last) : 16;
    last = now;
    if (state === 'play') {
      acc += dt;
      var sp = g.speed();
      while (acc >= sp && state === 'play') {
        acc -= sp;
        g.step();
        g.events.forEach(function (e) {
          if (e.type === 'eat') { tone(SCALE[Math.min(7, g.eaten % 8)], 0.07, 'sine', 0.06); }
          else if (e.type === 'gold') { pop('+100', e.x, e.y); tone(1320, 0.18, 'sine', 0.08, 1760); }
          else if (e.type === 'cement') { tone(140, 0.12, 'square', 0.03); }
          else if (e.type === 'crumble') {
            e.cells.forEach(function (c) { burst(c.x, c.y, e.c); });
            var m = e.cells[Math.floor(e.cells.length / 2)];
            pop(e.chain > 1 ? e.chain + ' 連消！' : '消 ' + e.n, m.x, m.y);
            for (var i = 0; i < 3; i++) setTimeout(function (k) { tone(SCALE[Math.min(7, k + e.chain * 2)], 0.12, 'sine', 0.07); }, i * 55, i);
            shake = 4;
          }
        });
        if (g.over) finish();
      }
      hud();
    }
    draw(dt);
  }

  // ---------- input ----------
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  document.addEventListener('keydown', function (e) {
    if (KEYS[e.key] && state === 'play') { g.turn(KEYS[e.key]); e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state === 'play' || state === 'pause') { pause(state === 'play'); e.preventDefault(); }
      else if (e.key === ' ' && (state === 'intro' || state === 'over') && document.activeElement === document.body) { start(); e.preventDefault(); }
    }
  });
  $('pad').addEventListener('pointerdown', function (e) {
    var b = e.target.closest('[data-d]');
    if (b && state === 'play') { g.turn(b.getAttribute('data-d')); e.preventDefault(); }
  });
  var sw = null;
  board.addEventListener('pointerdown', function (e) { sw = { x: e.clientX, y: e.clientY }; });
  board.addEventListener('pointermove', function (e) {
    if (!sw || state !== 'play') return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    g.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    sw = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', function () { sw = null; });
  $('go').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('resume').addEventListener('click', function () { pause(false); });
  $('pause').addEventListener('click', function () { pause(state === 'play'); });
  $('pause').disabled = true;
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(true); });
  window.addEventListener('resize', size);
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = '用下面的方向鍵或在場地上滑動';
  hud();
  size();
  window.requestAnimationFrame(loop);
  root.__snake = function () { return { g: g, state: state }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
