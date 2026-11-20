/* 磚畫謎 (picture logic), one of the SnowRealm brick games.

   The numbers beside each row and above each column say how many bricks in a row go there, in order, with at least
   one gap between groups. Fill in the bricks; when they are all in, a picture appears. A brick put where none goes is
   a mistake: it costs a heart (five) and the cell is marked empty for you. Mark cells you know are empty with a cross
   (no cost). Every picture can be worked out one row or column at a time, without guessing (tools/check_pics.js).
   Stars: no mistakes three, up to two mistakes two.

   The rules (Picross) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var LIVES = 5, EMPTY = 0, FILL = 1, CROSS = 2;
  function clues(line) { var out = [], n = 0; for (var i = 0; i < line.length; i++) { if (line[i]) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; }

  function Picross(pic) {
    this.pic = pic;
    this.sol = pic.r.map(function (s) { return s.split('').map(function (c) { return c === '#' ? 1 : 0; }); });
    this.H = this.sol.length; this.W = this.sol[0].length;
    var self = this;
    this.rows = this.sol.map(clues);
    this.cols = this.sol[0].map(function (_, x) { return clues(self.sol.map(function (r) { return r[x]; })); });
    this.cells = this.sol.map(function (r) { return r.map(function () { return EMPTY; }); });
    this.lives = LIVES; this.mistakes = 0; this.over = false; this.left = 0;
    for (var y = 0; y < this.H; y++) for (var x = 0; x < this.W; x++) this.left += this.sol[y][x];
  }
  Picross.LIVES = LIVES; Picross.FILL = FILL; Picross.CROSS = CROSS; Picross.clues = clues;
  // fill a cell: right, 'fill'; wrong, 'miss' (a heart, and the cell is marked empty); nothing to do, ''
  Picross.prototype.fill = function (x, y) {
    if (this.over || this.done() || this.cells[y][x] !== EMPTY) return '';
    if (this.sol[y][x]) { this.cells[y][x] = FILL; this.left--; return 'fill'; }
    this.cells[y][x] = CROSS; this.lives--; this.mistakes++;
    if (this.lives <= 0) this.over = true;
    return 'miss';
  };
  // a cross on an empty cell, or off again; filled cells stay filled
  Picross.prototype.cross = function (x, y, on) {
    if (this.over || this.done() || this.cells[y][x] === FILL) return '';
    var want = on == null ? this.cells[y][x] !== CROSS : on;
    if (want === (this.cells[y][x] === CROSS)) return '';
    this.cells[y][x] = want ? CROSS : EMPTY;
    return want ? 'cross' : 'uncross';
  };
  Picross.prototype.done = function () { return this.left === 0; };
  // a row or column whose bricks are all in
  Picross.prototype.rowDone = function (y) { for (var x = 0; x < this.W; x++) if (this.sol[y][x] && this.cells[y][x] !== FILL) return false; return true; };
  Picross.prototype.colDone = function (x) { for (var y = 0; y < this.H; y++) if (this.sol[y][x] && this.cells[y][x] !== FILL) return false; return true; };
  Picross.stars = function (mistakes) { return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1; };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Picross; return; }
  root.Picross = Picross;

  // ---------- the screen ----------
  var PICS = root.PICROSS || [];
  var GROUPS = [{ name: '5 × 5', from: 0, to: 10 }, { name: '10 × 10', from: 10, to: PICS.length }];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.picross.done';
  var startAt = 0, g = null, n = 0, state = 'list', dpr = 1, ac = null, done = {}, mode = 'fill', drag = null, last = 0, flashCell = null, reveal = 0;
  var Lo = { cell: 28, cl: 60, ct: 60, W: 340, H: 340 };
  try { done = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  // stars kept in 轉磚's record (a cloud save brings them from other devices) count too
  if (root.SnowRealmMini) { var fromRec = root.SnowRealmMini.stars('picross'); for (var lvk in fromRec) if (!done[lvk] || done[lvk].s < fromRec[lvk]) done[lvk] = Object.assign({}, done[lvk], { s: fromRec[lvk] }); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function starsOf(i) { return done[i] ? done[i].s : 0; }
  function open(i) { return i === 0 || !!done[i] || !!done[i - 1] || i === GROUPS[1].from; }
  function stars(k) { var s = ''; for (var i = 0; i < 3; i++) s += i < k ? '★' : '☆'; return s; }
  function total() { var t = 0; for (var k in done) t += done[k].s || 0; return t; }

  function layout() {
    if (!g) return;
    var maxR = Math.max.apply(null, g.rows.map(function (r) { return r.length; })), maxC = Math.max.apply(null, g.cols.map(function (c) { return c.length; }));
    var room = Math.min(window.innerWidth - 28, 560), tall = window.innerHeight - board.getBoundingClientRect().top - 130;
    var cell = Math.floor(Math.min(room / (g.W + maxR * 0.62 + 0.4), tall / (g.H + maxC * 0.62 + 0.4)));
    cell = Math.max(20, Math.min(56, cell));
    var cl = Math.ceil(maxR * cell * 0.62 + cell * 0.3), ct = Math.ceil(maxC * cell * 0.62 + cell * 0.3);
    Lo = { cell: cell, cl: cl, ct: ct, W: cl + g.W * cell + 2, H: ct + g.H * cell + 2 };
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(Lo.W * dpr); cv.height = Math.round(Lo.H * dpr);
    cv.style.width = Lo.W + 'px'; cv.style.height = Lo.H + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function draw(dt) {
    if (!g) return;
    var c = Lo.cell, ox = Lo.cl, oy = Lo.ct, X, Y, i, col = state === 'won' ? g.pic.c : '#F5B82E';
    x.fillStyle = '#222B36'; x.fillRect(0, 0, Lo.W, Lo.H);
    // the clues
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 ' + Math.round(c * 0.46) + 'px "Avenir Next Condensed", "Roboto Condensed", sans-serif';
    for (Y = 0; Y < g.H; Y++) {
      var rc = g.rows[Y], rd = g.rowDone(Y);
      if (Y % 2) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(0, oy + Y * c, ox, c); }
      for (i = 0; i < rc.length; i++) { x.fillStyle = rd ? '#5A6573' : '#E8EDF2'; x.fillText(String(rc[i]), ox - (rc.length - i - 0.5) * c * 0.62 - c * 0.15, oy + Y * c + c / 2 + 1); }
    }
    for (X = 0; X < g.W; X++) {
      var cc = g.cols[X], cd = g.colDone(X);
      if (X % 2) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(ox + X * c, 0, c, oy); }
      for (i = 0; i < cc.length; i++) { x.fillStyle = cd ? '#5A6573' : '#E8EDF2'; x.fillText(String(cc[i]), ox + X * c + c / 2, oy - (cc.length - i - 0.5) * c * 0.62 - c * 0.15); }
    }
    // the cells
    for (Y = 0; Y < g.H; Y++) for (X = 0; X < g.W; X++) {
      var px = ox + X * c, py = oy + Y * c, v = g.cells[Y][X];
      x.fillStyle = '#2C3745'; x.fillRect(px + 1, py + 1, c - 2, c - 2);
      if (v === FILL) {
        rr(px + 2, py + 2, c - 4, c - 4, c * 0.18); x.fillStyle = col; x.fill();
        x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + 4, py + c - 6, c - 8, 2);
        x.fillStyle = 'rgba(255,255,255,0.45)'; rr(px + c * 0.2, py + c * 0.16, c * 0.28, c * 0.1, c * 0.05); x.fill();
      } else if (v === CROSS) {
        var miss = flashCell && flashCell[0] === X && flashCell[1] === Y && flashCell[2] > 0;
        x.strokeStyle = miss ? '#E04F5F' : '#6B7787'; x.lineWidth = Math.max(1.5, c * 0.08);
        x.beginPath(); x.moveTo(px + c * 0.3, py + c * 0.3); x.lineTo(px + c * 0.7, py + c * 0.7); x.moveTo(px + c * 0.7, py + c * 0.3); x.lineTo(px + c * 0.3, py + c * 0.7); x.stroke();
      }
    }
    if (flashCell && flashCell[2] > 0) flashCell[2] -= dt;
    // a thicker line every five cells
    x.strokeStyle = '#4A5666'; x.lineWidth = 2;
    for (X = 0; X <= g.W; X += 5) { x.beginPath(); x.moveTo(ox + X * c, oy); x.lineTo(ox + X * c, oy + g.H * c); x.stroke(); }
    for (Y = 0; Y <= g.H; Y += 5) { x.beginPath(); x.moveTo(ox, oy + Y * c); x.lineTo(ox + g.W * c, oy + Y * c); x.stroke(); }
    if (state === 'won' && reveal < 1) reveal = Math.min(1, reveal + dt / 600);
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
  var heartsShown = -1;
  function hud() {
    $('lvName').textContent = g ? '第 ' + (n + 1) + ' 幅' : '磚畫謎';
    var k = g ? g.lives : LIVES;
    if (k !== heartsShown) {
      var h = ''; for (var i = 0; i < LIVES; i++) h += i < k ? '♥' : '♡';
      var el = $('hearts'); el.textContent = h; el.setAttribute('aria-label', '剩 ' + k + ' 條命');
      if (heartsShown > k) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      heartsShown = k;
    }
    $('modeFill').setAttribute('aria-pressed', String(mode === 'fill'));
    $('modeCross').setAttribute('aria-pressed', String(mode === 'cross'));
  }
  function list() {
    state = 'list'; g = null;
    var h = '<h2>磚畫謎</h2><p>旁邊和上面的數字，是這一排有幾塊連在一起的磚，依順序排，每組中間至少空一格。把磚都填對，會出現一幅畫。填錯一格少一條命（5 條），確定是空的可以打叉。沒填錯拿 3 顆星。</p><p class="tot">已拿 ' + total() + ' / ' + PICS.length * 3 + ' 顆星</p>';
    GROUPS.forEach(function (gr) {
      h += '<h3>' + gr.name + '</h3><div class="lvs">';
      for (var i = gr.from; i < gr.to; i++) {
        var s = starsOf(i), o = open(i);
        h += '<button type="button" class="lv' + (s ? ' done' : '') + '" data-lv="' + i + '"' + (o ? '' : ' disabled aria-label="先完成前一幅"') + '><b>' + (s ? esc(PICS[i].n) : i + 1) + '</b><span>' + (s ? stars(s) : o ? '' : '🔒') + '</span></button>';
      }
      h += '</div>';
    });
    $('list').innerHTML = h;
    show('list', true); show('win', false); show('lost', false);
    hud();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function play(i) {
    if (i < 0 || i >= PICS.length || !open(i)) return;
    n = i; g = new Picross(PICS[i]); startAt = Date.now(); state = 'play'; reveal = 0; heartsShown = -1; flashCell = null;
    show('list', false); show('win', false); show('lost', false);
    layout(); hud();
  }
  function act(X, Y, how) {
    if (state !== 'play' || !g) return '';
    var r = how === 'fill' ? g.fill(X, Y) : g.cross(X, Y, how === 'uncross' ? false : how === 'cross' ? true : undefined);
    if (r === 'fill') tone(660 + (g.rowDone(Y) || g.colDone(X) ? 220 : 0), 0.05, 'sine', 0.05);
    else if (r === 'miss') { flashCell = [X, Y, 600]; tone(220, 0.2, 'triangle', 0.09, 140); hud(); }
    else if (r === 'cross' || r === 'uncross') tone(420, 0.03, 'sine', 0.03);
    if (g.over) lost();
    else if (g.done()) win();
    return r;
  }
  function win() {
    state = 'won';
    var s = Picross.stars(g.mistakes), was = starsOf(n);
    if (!done[n] || s > was) done[n] = { s: Math.max(s, was) };
    try { window.localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* no storage */ }
    $('winName').textContent = '是「' + g.pic.n + '」！';
    $('winStars').textContent = stars(s);
    $('winNote').textContent = g.mistakes ? '填錯 ' + g.mistakes + ' 格' + (s < 3 ? '・不填錯就能拿 3 顆星' : '') : '一格都沒填錯';
    if (root.SnowRealmMini) root.SnowRealmMini.show($('winNote'), { game: 'picross', value: n, stars: s, ms: Date.now() - startAt });
    $('next').hidden = n + 1 >= PICS.length;
    setTimeout(function () { if (state === 'won') { show('win', true); $(n + 1 < PICS.length ? 'next' : 'toList').focus(); } }, reduce ? 300 : 1500);
    [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone([523, 587, 659, 784, 880, 1047, 1175, 1319][k], 0.2, 'sine', 0.07); }, j * 90); });
    hud();
  }
  function lost() { state = 'lost'; setTimeout(function () { show('lost', true); $('retry').focus(); }, 500); tone(330, 0.3, 'triangle', 0.09, 160); }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    draw(dt);
  }
  function cellAt(e) {
    var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * Lo.W - Lo.cl, py = (e.clientY - r.top) / r.height * Lo.H - Lo.ct;
    var X = Math.floor(px / Lo.cell), Y = Math.floor(py / Lo.cell);
    return X >= 0 && Y >= 0 && X < g.W && Y < g.H ? [X, Y] : null;
  }
  // dragging paints the same thing along a row or a column
  cv.addEventListener('pointerdown', function (e) {
    if (!g || state !== 'play') return;
    var p = cellAt(e); if (!p) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
    var how = mode === 'fill' && e.button !== 2 ? 'fill' : (g.cells[p[1]][p[0]] === CROSS ? 'uncross' : 'cross');
    if (how === 'fill' && g.cells[p[1]][p[0]] === CROSS) how = 'uncross';
    drag = { how: how, x: p[0], y: p[1], axis: '' };
    act(p[0], p[1], how);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || !g || state !== 'play') return;
    var p = cellAt(e); if (!p) return;
    if (!drag.axis && (p[0] !== drag.x || p[1] !== drag.y)) drag.axis = p[1] === drag.y ? 'row' : 'col';
    if (drag.axis === 'row') p[1] = drag.y; else if (drag.axis === 'col') p[0] = drag.x;
    if (drag.how === 'fill' && g.cells[p[1]][p[0]] !== 0) return;
    act(p[0], p[1], drag.how);
  });
  window.addEventListener('pointerup', function () { drag = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('modeFill').addEventListener('click', function () { mode = 'fill'; hud(); });
  $('modeCross').addEventListener('click', function () { mode = 'cross'; hud(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'x' || e.key === 'X') { mode = mode === 'fill' ? 'cross' : 'fill'; hud(); } });
  $('list').addEventListener('click', function (e) { var b = e.target.closest('[data-lv]'); if (b && !b.disabled) play(+b.getAttribute('data-lv')); });
  $('levels').addEventListener('click', list);
  $('next').addEventListener('click', function () { play(n + 1); });
  $('again').addEventListener('click', function () { play(n); });
  $('retry').addEventListener('click', function () { play(n); });
  $('toList').addEventListener('click', list);
  $('toList2').addEventListener('click', list);
  window.addEventListener('resize', function () { layout(); });
  list();
  window.requestAnimationFrame(loop);
  root.__picross = function () { return { g: g, n: n, state: state, play: play, act: act }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
