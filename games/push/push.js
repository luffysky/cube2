/* 推磚倉庫 (push the bricks), one of the SnowRealm brick games.

   Push every brick onto a marked spot. Bricks can only be pushed, never pulled, and one at a time. Every level was
   built backwards from the solved position and checked by a solver (tools/make_push.js), which also says how few
   pushes it can be done in; do it in that many for three stars. Undo as often as you like.

   The rules (Push) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // m: rows joined by '/', using # wall, . spot, $ brick, * brick on a spot, @ player, + player on a spot
  function Push(m) {
    var rows = String(m).split('/'), y, x;
    // trim rows and columns that are wall all the way, keeping one wall around the floor
    var y0 = rows.length, y1 = -1, x0 = 99, x1 = -1;
    for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) if (rows[y].charAt(x) !== '#') { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    y0 = Math.max(0, y0 - 1); x0 = Math.max(0, x0 - 1); y1++; x1++;
    this.w = x1 - x0 + 1; this.h = y1 - y0 + 1;
    this.wall = []; this.spot = []; this.box = [];
    for (y = 0; y < this.h; y++) {
      var r = rows[y + y0] || '';
      for (x = 0; x < this.w; x++) {
        var c = r.charAt(x + x0) || '#', i = y * this.w + x;
        this.wall[i] = c === '#';
        this.spot[i] = c === '.' || c === '*' || c === '+';
        this.box[i] = c === '$' || c === '*';
        if (c === '@' || c === '+') { this.px = x; this.py = y; }
      }
    }
    this.moves = 0; this.pushes = 0; this.hist = []; this.facing = 'down';
  }
  Push.prototype.at = function (x, y) { return y * this.w + x; };
  Push.prototype.isWall = function (x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h || this.wall[this.at(x, y)]; };
  Push.prototype.isBox = function (x, y) { return !this.isWall(x, y) && this.box[this.at(x, y)]; };
  // one step; a brick in the way is pushed if the cell behind it is clear. Gives 'push', 'move' or '' (blocked)
  Push.prototype.move = function (dir) {
    var d = D[dir];
    if (!d || this.solved()) return '';
    this.facing = dir;
    var nx = this.px + d[0], ny = this.py + d[1];
    if (this.isWall(nx, ny)) return '';
    var pushed = false;
    if (this.isBox(nx, ny)) {
      var bx = nx + d[0], by = ny + d[1];
      if (this.isWall(bx, by) || this.isBox(bx, by)) return '';
      this.box[this.at(nx, ny)] = false; this.box[this.at(bx, by)] = true;
      pushed = true; this.pushes++;
    }
    this.hist.push({ x: this.px, y: this.py, dir: dir, pushed: pushed });
    this.px = nx; this.py = ny; this.moves++;
    return pushed ? 'push' : 'move';
  };
  Push.prototype.undo = function () {
    var h = this.hist.pop();
    if (!h) return false;
    if (h.pushed) {
      var d = D[h.dir], bx = this.px + d[0], by = this.py + d[1];
      this.box[this.at(bx, by)] = false; this.box[this.at(this.px, this.py)] = true;
      this.pushes--;
    }
    this.px = h.x; this.py = h.y; this.moves--; this.facing = h.dir;
    return true;
  };
  Push.prototype.onSpot = function () { var n = 0; for (var i = 0; i < this.box.length; i++) if (this.box[i] && this.spot[i]) n++; return n; };
  Push.prototype.count = function () { var n = 0; for (var i = 0; i < this.box.length; i++) if (this.box[i]) n++; return n; };
  Push.prototype.solved = function () { return this.onSpot() === this.count(); };
  // three stars for doing it in the fewest pushes, two within half as many again
  Push.stars = function (pushes, best) { return pushes <= best ? 3 : pushes <= Math.ceil(best * 1.5) ? 2 : 1; };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Push; return; }
  root.Push = Push;

  // ---------- the screen ----------
  var LEVELS = root.PUSH_LEVELS || [];
  var T = function () { return window.SRW ? window.SRW.t.apply(null, arguments) : arguments[0]; }, SEP = window.SRW ? window.SRW.t('g.sep') : '・';
  var GROUPS = [{ name: T('g.easy'), from: 0, to: 10, note: T('pu.g1') }, { name: T('g.normal'), from: 10, to: 30, note: T('pu.g2') }, { name: T('g.hard'), from: 30, to: 60, note: T('pu.g3') }];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.push.done';
  var startAt = 0, g = null, n = 0, state = 'list', cell = 32, dpr = 1, ac = null, done = {}, anim = null, last = 0;
  try { done = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  // stars kept in 轉磚's record (a cloud save brings them from other devices) count too
  if (root.SnowRealmMini) { var fromRec = root.SnowRealmMini.stars('push'); for (var lvk in fromRec) if (!done[lvk] || done[lvk].s < fromRec[lvk]) done[lvk] = Object.assign({}, done[lvk], { s: fromRec[lvk] }); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function starsOf(i) { return done[i] ? done[i].s : 0; }
  function open(i) { return i === 0 || !!done[i] || !!done[i - 1]; }
  function stars(k) { var s = ''; for (var i = 0; i < 3; i++) s += i < k ? '★' : '☆'; return s; }
  function total() { var t = 0; for (var k in done) t += done[k].s || 0; return t; }

  function size() {
    if (!g) return;
    var pad = $('pad'), padH = pad && getComputedStyle(pad).display !== 'none' ? pad.offsetHeight + 16 : 0;
    var roomW = Math.min(window.innerWidth - 28, 560), roomH = window.innerHeight - board.getBoundingClientRect().top - padH - 64;
    cell = Math.max(18, Math.min(56, Math.floor(Math.min(roomW / g.w, roomH / g.h))));
    dpr = window.devicePixelRatio || 1;
    cv.width = cell * g.w * dpr; cv.height = cell * g.h * dpr;
    cv.style.width = cell * g.w + 'px'; cv.style.height = cell * g.h + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function tile(px, py, col, light) {
    var g0 = cell * 0.06, w = cell - 2 * g0;
    rr(px + g0, py + g0, w, w, w * 0.2); x.fillStyle = col; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + g0 + w * 0.1, py + g0 + w * 0.82, w * 0.8, w * 0.1);
    if (light) { x.fillStyle = 'rgba(255,255,255,0.55)'; rr(px + g0 + w * 0.15, py + g0 + w * 0.13, w * 0.32, w * 0.13, w * 0.06); x.fill(); }
  }
  function draw() {
    if (!g) return;
    var W = g.w * cell, H = g.h * cell, X, Y, i;
    x.fillStyle = '#222B36'; x.fillRect(0, 0, W, H);
    for (Y = 0; Y < g.h; Y++) for (X = 0; X < g.w; X++) {
      i = g.at(X, Y);
      var px = X * cell, py = Y * cell;
      if (g.wall[i]) { x.fillStyle = '#556273'; x.fillRect(px, py, cell, cell); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px, py + cell - 2, cell, 2); x.fillRect(px + cell - 2, py, 2, cell); continue; }
      x.fillStyle = '#1C232C'; x.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      if (g.spot[i]) { x.strokeStyle = '#F5B82E'; x.lineWidth = Math.max(2, cell * 0.07); x.setLineDash([cell * 0.12, cell * 0.08]); rr(px + cell * 0.18, py + cell * 0.18, cell * 0.64, cell * 0.64, cell * 0.12); x.stroke(); x.setLineDash([]); }
    }
    // the bricks: clay red, gold once home
    var k = 0, a = anim && anim.t < 1 ? anim : null, ease = a ? 1 - Math.pow(1 - a.t, 3) : 1;
    for (Y = 0; Y < g.h; Y++) for (X = 0; X < g.w; X++) {
      i = g.at(X, Y);
      if (!g.box[i]) continue;
      var ox = 0, oy = 0;
      if (a && a.box && a.box[0] === X && a.box[1] === Y) { ox = -a.d[0] * (1 - ease) * cell; oy = -a.d[1] * (1 - ease) * cell; }
      tile(X * cell + ox, Y * cell + oy, g.spot[i] ? '#F5B82E' : '#F0704F', true);
      if (g.spot[i]) { x.fillStyle = 'rgba(126,89,0,0.9)'; x.font = '800 ' + Math.round(cell * 0.42) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✓', X * cell + ox + cell / 2, Y * cell + oy + cell / 2 + 1); }
      k++;
    }
    // the player: a white tile with eyes looking the way it last went
    var pox = a ? -a.d[0] * (1 - ease) * cell : 0, poy = a ? -a.d[1] * (1 - ease) * cell : 0, hx = g.px * cell + pox, hy = g.py * cell + poy, d = D[g.facing];
    tile(hx, hy, '#F2F5F8', false);
    x.fillStyle = '#222B36';
    var ex = hx + cell / 2 + d[0] * cell * 0.14, ey = hy + cell / 2 + d[1] * cell * 0.14, sx = d[1] * cell * 0.15, sy = d[0] * cell * 0.15;
    x.beginPath(); x.arc(ex + sx, ey + sy, cell * 0.07, 0, 6.283); x.arc(ex - sx, ey - sy, cell * 0.07, 0, 6.283); x.fill();
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
  function show(id, on) { $(id).hidden = !on; }
  function hud() {
    $('moves').textContent = g ? g.moves : 0;
    $('pushes').textContent = g ? g.pushes : 0;
    $('lvName').textContent = g ? T('g.levelN', n + 1) : T('g.levels');
    $('lvGoal').textContent = g ? T('pu.goal', LEVELS[n].p) : '';
    $('undo').disabled = !g || !g.hist.length || state !== 'play';
    $('restart').disabled = !g || state !== 'play';
  }
  // the level list, in three groups
  function list() {
    state = 'list'; g = null;
    var h = '<h2>' + T('n.push') + '</h2><p>' + T('pu.how') + '</p><p class="tot">' + T('g.starsTot', total(), LEVELS.length * 3) + '</p>';
    GROUPS.forEach(function (gr) {
      h += '<h3>' + gr.name + '<small>' + gr.note + '</small></h3><div class="lvs">';
      for (var i = gr.from; i < gr.to && i < LEVELS.length; i++) {
        var s = starsOf(i), o = open(i);
        h += '<button type="button" class="lv' + (s ? ' done' : '') + '" data-lv="' + i + '"' + (o ? '' : ' disabled aria-label="' + T('g.lockFirst') + '"') + '><b>' + (i + 1) + '</b><span>' + (s ? stars(s) : o ? '' : '🔒') + '</span></button>';
      }
      h += '</div>';
    });
    $('list').innerHTML = h;
    show('list', true); show('win', false);
    cv.width = cv.width; // clear
    hud();
  }
  function play(i) {
    if (i < 0 || i >= LEVELS.length || !open(i)) return;
    n = i; g = new Push(LEVELS[i].m); startAt = Date.now(); state = 'play'; anim = null;
    show('list', false); show('win', false);
    size(); hud();
  }
  function step(dir) {
    if (state !== 'play' || !g) return;
    var bx = g.px + D[dir][0], by = g.py + D[dir][1], r = g.move(dir);
    if (!r) { draw(); tone(140, 0.05, 'square', 0.02); return; }
    anim = reduce ? null : { t: 0, d: D[dir], box: r === 'push' ? [bx + D[dir][0], by + D[dir][1]] : null };
    if (r === 'push') { var home = g.spot[g.at(bx + D[dir][0], by + D[dir][1])]; tone(home ? 880 : 330, home ? 0.12 : 0.06, home ? 'sine' : 'triangle', 0.06); }
    hud();
    if (g.solved()) win();
  }
  function win() {
    state = 'won';
    var s = Push.stars(g.pushes, LEVELS[n].p), was = starsOf(n);
    if (!done[n] || s > was || (s === was && g.pushes < done[n].p)) done[n] = { s: Math.max(s, was), p: done[n] ? Math.min(done[n].p, g.pushes) : g.pushes };
    try { window.localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* no storage */ }
    $('winStars').textContent = stars(s);
    $('winNote').textContent = [T('pu.win', g.pushes, LEVELS[n].p), T('pu.winMoves', g.moves)].concat(s < 3 ? [T('pu.winMore')] : []).join(SEP);
    if (root.SnowRealmMini) root.SnowRealmMini.show($('winNote'), { game: 'push', value: n, stars: s, ms: Date.now() - startAt });
    $('next').hidden = n + 1 >= LEVELS.length;
    setTimeout(function () { if (state === 'won') { show('win', true); $(n + 1 < LEVELS.length ? 'next' : 'toList').focus(); } }, reduce ? 0 : 350);
    [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone([523, 587, 659, 784, 880, 1047, 1175, 1319][k], 0.2, 'sine', 0.07); }, j * 90); });
    hud();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (anim && anim.t < 1) { anim.t = Math.min(1, anim.t + dt / 110); draw(); }
  }

  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  document.addEventListener('keydown', function (e) {
    if (KEYS[e.key] && state === 'play') { step(KEYS[e.key]); e.preventDefault(); return; }
    if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && state === 'play') { if (g.undo()) { anim = null; draw(); hud(); } e.preventDefault(); return; }
    if ((e.key === 'r' || e.key === 'R') && state === 'play') { play(n); e.preventDefault(); }
  });
  $('pad').addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-d]'); if (b) { step(b.getAttribute('data-d')); e.preventDefault(); } });
  var sw = null;
  board.addEventListener('pointerdown', function (e) { if (e.target === cv) sw = { x: e.clientX, y: e.clientY }; });
  board.addEventListener('pointermove', function (e) {
    if (!sw || state !== 'play') return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    sw = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', function () { sw = null; });
  $('list').addEventListener('click', function (e) { var b = e.target.closest('[data-lv]'); if (b && !b.disabled) play(+b.getAttribute('data-lv')); });
  $('undo').addEventListener('click', function () { if (g && state === 'play' && g.undo()) { anim = null; draw(); hud(); } });
  $('restart').addEventListener('click', function () { if (g && state === 'play') play(n); });
  $('levels').addEventListener('click', list);
  $('next').addEventListener('click', function () { play(n + 1); });
  $('again').addEventListener('click', function () { play(n); });
  $('toList').addEventListener('click', list);
  window.addEventListener('resize', size);
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = T('g.padHint');
  // straight back to the first level not done yet
  var first = 0; while (first < LEVELS.length - 1 && done[first]) first++;
  list();
  window.requestAnimationFrame(loop);
  root.__push = function () { return { g: g, n: n, state: state, play: play, step: step }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
