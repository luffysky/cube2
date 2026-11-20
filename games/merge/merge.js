/* 磚塊合成 (merge the bricks), one of the SnowRealm brick games.

   Drop numbered bricks into the columns. A brick that lands next to bricks of its own number joins them: they become
   one brick of the next number up (two of a kind double it, three make four times, and so on), and the new brick
   may join its own neighbours in turn, a chain. A column that is already full when a brick is dropped into it costs
   a heart (five to start) and the top rows crumble away to make room; the run ends with the last heart.
   On normal and hard, now and then a cement block drops in by itself; a merge right next to it breaks it.

   The rules (Merge) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var LIVES = 5, CEMENT = -1;
  var LEVELS = {
    easy: { cols: 5, rows: 8, cement: 0, look: 2 },
    normal: { cols: 5, rows: 7, cement: 16, look: 1 },
    hard: { cols: 5, rows: 7, cement: 9, look: 1 }
  };

  function RNG(seed) { this.s = seed >>> 0 || 1; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function Merge(seed, level) {
    this.rng = new RNG(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.level = LEVELS[level] ? level : 'normal';
    this.cfg = LEVELS[this.level];
    this.C = this.cfg.cols; this.R = this.cfg.rows;
    // grid[c][r]: r = 0 is the bottom; each cell null or { v, id }  (v = the number, or CEMENT)
    this.grid = [];
    for (var c = 0; c < this.C; c++) { this.grid.push([]); for (var r = 0; r < this.R; r++) this.grid[c].push(null); }
    this.ids = 0; this.lives = LIVES; this.score = 0; this.drops = 0; this.top = 2; this.bestChain = 0; this.over = false;
    this.queue = [];
    while (this.queue.length < 1 + this.cfg.look) this.queue.push(this.pick());
    this.events = [];
  }
  Merge.LIVES = LIVES; Merge.CEMENT = CEMENT; Merge.LEVELS = LEVELS;

  // the next brick: a small number, the range growing with the biggest brick made so far
  Merge.prototype.pick = function () {
    var maxExp = Math.max(1, Math.min(6, Math.round(Math.log2(this.top)) - 2)), e = 1 + Math.floor(Math.pow(this.rng.next(), 1.6) * maxExp);
    return Math.pow(2, e);
  };
  Merge.prototype.cell = function (c, r) { return c >= 0 && c < this.C && r >= 0 && r < this.R ? this.grid[c][r] : null; };
  Merge.prototype.height = function (c) { var h = 0; while (h < this.R && this.grid[c][h]) h++; return h; };
  Merge.prototype.mk = function (v) { return { v: v, id: ++this.ids }; };

  // let every column settle (nothing floats)
  Merge.prototype.gravity = function () {
    var moved = [];
    for (var c = 0; c < this.C; c++) {
      var col = this.grid[c], w = 0;
      for (var r = 0; r < this.R; r++) if (col[r]) { if (r !== w) { col[w] = col[r]; col[r] = null; moved.push([c, w]); } w++; }
    }
    return moved;
  };
  // the brick at (c, r) joins every neighbour of its own number; gives the new position or null when nothing joined
  Merge.prototype.join = function (c, r) {
    var me = this.cell(c, r);
    if (!me || me.v === CEMENT) return null;
    var nb = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]], same = [], i;
    for (i = 0; i < 4; i++) { var o = this.cell(nb[i][0], nb[i][1]); if (o && o.v === me.v) same.push(nb[i]); }
    if (!same.length) return null;
    var was = me.v;
    for (i = 0; i < same.length; i++) this.grid[same[i][0]][same[i][1]] = null;
    me.v = was * Math.pow(2, same.length);
    // cement right next to the brick breaks
    for (i = 0; i < 4; i++) { var k = this.cell(nb[i][0], nb[i][1]); if (k && k.v === CEMENT) { this.grid[nb[i][0]][nb[i][1]] = null; this.events.push({ type: 'crack', c: nb[i][0], r: nb[i][1] }); } }
    this.score += me.v;
    if (me.v > this.top) this.top = me.v;
    this.events.push({ type: 'merge', c: c, r: r, v: me.v, from: same, id: me.id });
    return [c, r];
  };
  Merge.prototype.drop = function (c) {
    if (this.over || !(c >= 0 && c < this.C)) return '';
    this.events = [];
    var h = this.height(c), v = this.queue.shift();
    this.queue.push(this.pick());
    this.drops++;
    if (h >= this.R) return this.overflow(c);
    var b = this.mk(v);
    this.grid[c][h] = b;
    this.events.push({ type: 'drop', c: c, r: h, v: v, id: b.id });
    this.settle([[c, h]]);
    // cement now and then, into the lowest column
    if (this.cfg.cement && this.drops % this.cfg.cement === 0) this.cement();
    return 'ok';
  };
  // joins, settles, joins again until nothing more happens: the length of the chain is how many rounds it took
  Merge.prototype.settle = function (active) {
    var chain = 0, guard = 0;
    while (active.length && guard++ < 200) {
      var next = [], any = false;
      for (var i = 0; i < active.length; i++) {
        var at = active[i], id = this.cell(at[0], at[1]) && this.cell(at[0], at[1]).id;
        if (!id) continue;
        var j = this.join(at[0], at[1]);
        if (j) { any = true; next.push(this.find(id)); }
      }
      if (any) chain++;
      var moved = this.gravity();
      // the merged bricks (by id: they may have fallen) and anything that fell get a look in the next round
      next = next.filter(Boolean).concat(moved);
      active = [];
      var seen = {};
      for (i = 0; i < next.length; i++) { var p = this.locate(next[i]); if (p && !seen[p]) { seen[p] = 1; active.push(p); } }
      if (!any && !moved.length) break;
    }
    if (chain > 1) this.events.push({ type: 'chain', n: chain });
    if (chain > this.bestChain) this.bestChain = chain;
    return chain;
  };
  Merge.prototype.find = function (id) { for (var c = 0; c < this.C; c++) for (var r = 0; r < this.R; r++) if (this.grid[c][r] && this.grid[c][r].id === id) return { id: id }; return null; };
  // where something is now: by its id, or a position as it stands
  Merge.prototype.locate = function (p) {
    if (p && p.id) { for (var c = 0; c < this.C; c++) for (var r = 0; r < this.R; r++) if (this.grid[c][r] && this.grid[c][r].id === p.id) return [c, r]; return null; }
    return p && this.cell(p[0], p[1]) ? [p[0], p[1]] : null;
  };
  Merge.prototype.cement = function () {
    var best = -1, low = this.R;
    for (var c = 0; c < this.C; c++) { var h = this.height(c); if (h < low) { low = h; best = c; } }
    if (best < 0 || low >= this.R - 1) return;
    this.grid[best][low] = this.mk(CEMENT);
    this.events.push({ type: 'cement', c: best, r: low });
  };
  Merge.prototype.overflow = function (c) {
    this.lives--;
    this.events.push({ type: 'overflow', c: c, lives: this.lives });
    if (this.lives <= 0) { this.over = true; this.events.push({ type: 'over' }); return 'over'; }
    // the top three rows crumble away
    for (var x = 0; x < this.C; x++) for (var r = this.R - 3; r < this.R; r++) if (this.grid[x][r]) { this.events.push({ type: 'crumble', c: x, r: r, v: this.grid[x][r].v }); this.grid[x][r] = null; }
    return 'overflow';
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Merge; return; }
  root.Merge = Merge;

  // ---------- the screen ----------
  var PAL = ['#F1EADB', '#FF9DB5', '#F5B82E', '#5DB7F5', '#37C29A', '#B49CFF', '#F0704F', '#E04F5F', '#2FA4A9', '#7A6FF0', '#D9A400', '#1B2530'];
  function colOf(v) { return v === CEMENT ? '#8C939B' : PAL[Math.min(PAL.length - 1, Math.round(Math.log2(v)) - 1)]; }
  function inkOf(v) { var e = Math.round(Math.log2(v)); return v === CEMENT ? '#3B4857' : e === 1 ? '#5A4A2A' : e >= 12 ? '#F5B82E' : '#FFFFFF'; }
  function label(v) { return v >= 1048576 ? Math.round(v / 1048576) + 'M' : v >= 10000 ? Math.round(v / 1024) + 'K' : String(v); }
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.merge.bests', LVKEY = 'snowrealm.merge.level';
  var g = null, state = 'intro', last = 0, cell = 56, dpr = 1, fx = [], vis = {}, shake = 0, ac = null, wait = 0, hover = -1, flash = 0;
  var level = 'normal', bests = {};
  try { level = window.localStorage.getItem(LVKEY) || 'normal'; bests = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  if (!LEVELS[level]) level = 'normal';
  var LV_NAME = { easy: '簡單', normal: '普通', hard: '困難' };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function bestOf(lv) { return +bests[lv] || 0; }
  var TOPH = 1.3;      // rows of room above the field for the brick about to drop

  function size() {
    var C = g ? g.C : LEVELS[level].cols, R = g ? g.R : LEVELS[level].rows;
    var room = Math.min(window.innerWidth - 28, 520), tall = window.innerHeight - board.getBoundingClientRect().top - 40;
    cell = Math.max(36, Math.min(78, Math.floor(Math.min(room / C, tall / (R + TOPH)))));
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cell * C * dpr); cv.height = Math.round(cell * (R + TOPH) * dpr);
    cv.style.width = cell * C + 'px'; cv.style.height = cell * (R + TOPH) + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function brick(px, py, v, s) {
    s = s || 1;
    var g0 = cell * 0.06, w = (cell - 2 * g0) * s, ox = px + (cell - w) / 2, oy = py + (cell - w) / 2;
    rr(ox, oy, w, w, w * 0.2); x.fillStyle = colOf(v); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(ox + w * 0.1, oy + w * 0.82, w * 0.8, w * 0.1);
    if (v === CEMENT) {
      x.fillStyle = 'rgba(0,0,0,0.2)'; for (var i = 0; i < 6; i++) { x.beginPath(); x.arc(ox + w * ((i * 37) % 80 + 10) / 100, oy + w * ((i * 53) % 70 + 12) / 100, w * 0.04, 0, 6.283); x.fill(); }
      return;
    }
    x.fillStyle = 'rgba(255,255,255,0.45)'; rr(ox + w * 0.14, oy + w * 0.11, w * 0.3, w * 0.1, w * 0.05); x.fill();
    var t = label(v);
    x.fillStyle = inkOf(v); x.font = '800 ' + Math.round(w * (t.length <= 2 ? 0.42 : t.length === 3 ? 0.34 : 0.27)) + 'px "Avenir Next Condensed", "Roboto Condensed", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, ox + w / 2, oy + w / 2 + 1);
  }
  function rowY(r) { return (TOPH + g.R - 1 - r) * cell; }
  function draw(dt) {
    var C = g ? g.C : LEVELS[level].cols, R = g ? g.R : LEVELS[level].rows, W = cell * C, H = cell * (R + TOPH), c, r;
    x.save();
    if (shake > 0 && !reduce) { x.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 0.03); }
    x.fillStyle = '#222B36'; x.fillRect(-10, -10, W + 20, H + 20);
    x.fillStyle = '#1C232C'; x.fillRect(0, 0, W, TOPH * cell);
    for (c = 0; c < C; c++) {
      if (c === hover && state === 'play') { x.fillStyle = 'rgba(245,184,46,0.08)'; x.fillRect(c * cell, TOPH * cell, cell, R * cell); }
      if (c) { x.fillStyle = '#2C3745'; x.fillRect(c * cell - 0.5, TOPH * cell, 1, R * cell); }
    }
    // the danger line: the top row
    x.strokeStyle = 'rgba(224,79,95,0.45)'; x.setLineDash([5, 5]); x.beginPath(); x.moveTo(0, TOPH * cell + 0.5); x.lineTo(W, TOPH * cell + 0.5); x.stroke(); x.setLineDash([]);
    if (!g) { x.restore(); return; }
    // the bricks, each sliding to where it now is
    var k = Math.min(1, dt / 70), live = {};
    for (c = 0; c < C; c++) for (r = 0; r < R; r++) {
      var b = g.grid[c][r];
      if (!b) continue;
      live[b.id] = 1;
      var ty = rowY(r), tx = c * cell, v = vis[b.id];
      if (!v) v = vis[b.id] = { x: tx, y: reduce ? ty : TOPH * cell * 0.15, s: 1 };
      if (reduce) { v.x = tx; v.y = ty; } else { v.x += (tx - v.x) * Math.min(1, k * 2.2); v.y += (ty - v.y) * Math.min(1, k * 2.2); }
      if (v.pop) { v.pop -= dt; }
      var s = v.pop > 0 ? 1 + 0.18 * Math.sin((1 - v.pop / 220) * Math.PI) : 1;
      brick(v.x, v.y, b.v, s);
    }
    for (var id in vis) if (!live[id]) delete vis[id];
    // the brick about to drop, over the column under the pointer, and the one after it
    if (state === 'play' || state === 'pause') {
      var hc = hover >= 0 ? hover : Math.floor(C / 2);
      brick(hc * cell, 0.12 * cell, g.queue[0], 0.92);
      x.fillStyle = 'rgba(232,237,242,0.55)'; x.font = '700 ' + Math.round(cell * 0.2) + 'px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      var nx = W - 6;
      for (var q = g.queue.length - 1; q >= 1; q--) { var sc = 0.5; x.save(); x.translate(nx - cell * sc, 0.25 * cell); x.scale(sc, sc); brick(0, 0, g.queue[q], 1); x.restore(); nx -= cell * sc + 4; }
      x.fillText('下一個', nx - 2, 0.55 * cell);
    }
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.t += dt;
      if (f.t > f.life) { fx.splice(i, 1); continue; }
      var p = f.t / f.life;
      x.globalAlpha = 1 - p;
      if (f.kind === 'bit') { x.fillStyle = f.c; x.fillRect(f.x + f.vx * f.t, f.y + f.vy * f.t + 0.0005 * f.t * f.t, cell * 0.12, cell * 0.12); }
      else { x.fillStyle = '#FFFFFF'; x.font = '800 ' + Math.round(cell * 0.32) + 'px sans-serif'; x.textAlign = 'center'; x.fillText(f.text, f.x, f.y - p * cell * 0.6); }
      x.globalAlpha = 1;
    }
    if (flash > 0) { x.fillStyle = 'rgba(224,79,95,' + (flash * 0.35).toFixed(3) + ')'; x.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt / 400); }
    x.restore();
  }
  function burst(c, r, col) { for (var i = 0; i < (reduce ? 3 : 8); i++) fx.push({ kind: 'bit', x: c * cell + cell / 2, y: rowY(r) + cell / 2, vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.15, c: col, t: 0, life: 520 }); }

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
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];

  function show(id, on) { $(id).hidden = !on; }
  var heartsShown = -1;
  function hud() {
    $('score').textContent = g ? g.score : 0;
    $('best').textContent = bestOf(level);
    $('top').textContent = g ? label(g.top) : 2;
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
    if (!g) size();
  }
  function start() {
    g = new Merge(null, level); state = 'play'; fx = []; vis = {}; heartsShown = -1; hover = Math.floor(g.C / 2);
    show('intro', false); show('end', false); show('paused', false); show('ouch', false);
    $('pause').disabled = false;
    size(); hud();
    tone(660, 0.12, 'sine', 0.06, 990);
  }
  function finish() {
    state = 'over';
    var nb = g.score > bestOf(level);
    if (nb) { bests[level] = g.score; try { window.localStorage.setItem(KEY, JSON.stringify(bests)); } catch (e) { /* no storage */ } }
    show('ouch', false);
    $('endScore').textContent = g.score;
    $('endNote').textContent = LV_NAME[level] + '・' + (nb ? '新紀錄！' : '最佳 ' + bestOf(level) + ' 分') + '・最大合到 ' + label(g.top) + '・放了 ' + g.drops + ' 塊' + (g.bestChain > 1 ? '・最多 ' + g.bestChain + ' 連鎖' : '');
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
  function drop(c) {
    if (state !== 'play') return;
    hover = c;
    var res = g.drop(c), merges = 0;
    g.events.forEach(function (e) {
      if (e.type === 'drop') { vis[e.id] = { x: c * cell, y: 0.12 * cell, s: 1 }; tone(330, 0.05, 'triangle', 0.05); }
      else if (e.type === 'merge') {
        merges++;
        var pv = vis[e.id]; if (pv) pv.pop = 220;
        e.from.forEach(function (f) { burst(f[0], f[1], colOf(e.v / 2)); });
        fx.push({ kind: 'txt', text: '+' + e.v, x: e.c * cell + cell / 2, y: rowY(e.r) + cell * 0.4, t: 0, life: 700 });
        setTimeout(function () { tone(SCALE[Math.min(11, Math.round(Math.log2(e.v)) - 1)], 0.12, 'sine', 0.07); }, merges * 70);
      }
      else if (e.type === 'chain') fx.push({ kind: 'txt', text: e.n + ' 連鎖！', x: g.C * cell / 2, y: TOPH * cell + cell, t: 0, life: 1000 });
      else if (e.type === 'cement') { tone(140, 0.12, 'square', 0.03); }
      else if (e.type === 'crack') { burst(e.c, e.r, '#8C939B'); }
      else if (e.type === 'crumble') { burst(e.c, e.r, colOf(e.v)); }
      else if (e.type === 'overflow') {
        flash = 1; shake = 8; tone(260, 0.22, 'triangle', 0.09, 150);
        if (e.lives > 0) { $('ouchT').textContent = '這排滿了'; $('ouchP').textContent = '最上面三排碎掉了・還剩 ' + e.lives + ' 條命'; show('ouch', true); state = 'ouch'; wait = 1300; }
      }
    });
    if (res === 'over') finish();
    hud();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (state === 'ouch') { wait -= dt; if (wait <= 0) { state = 'play'; show('ouch', false); } }
    draw(dt);
  }

  function colAt(e) { var r = cv.getBoundingClientRect(); return Math.max(0, Math.min(g.C - 1, Math.floor((e.clientX - r.left) / r.width * g.C))); }
  cv.addEventListener('pointermove', function (e) { if (g && state === 'play' && e.pointerType === 'mouse') hover = colAt(e); });
  cv.addEventListener('pointerdown', function (e) { if (g && state === 'play') { drop(colAt(e)); e.preventDefault(); } });
  document.addEventListener('keydown', function (e) {
    if (!g || state !== 'play') { if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && state === 'pause') pause(false); return; }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { hover = Math.max(0, hover - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { hover = Math.min(g.C - 1, hover + 1); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { if (document.activeElement !== $('pause')) { drop(hover); e.preventDefault(); } }
    else if (/^[1-9]$/.test(e.key) && +e.key <= g.C) { drop(+e.key - 1); e.preventDefault(); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { pause(true); e.preventDefault(); }
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
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = '點一下要放的那一排';
  pickLevel(level);
  size();
  window.requestAnimationFrame(loop);
  root.__merge = function () { return { g: g, state: state, drop: drop }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
