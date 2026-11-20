/* 分磚 (sort the bricks), one of the SnowRealm brick games.

   Coloured bricks are mixed up in stacks of four. Tap a stack, then another: the top brick moves across, along with
   any of the same colour right under it that fit. A brick can only go onto an empty stack or onto one of its own
   colour, and a stack holds four. Done when every stack is one colour (or empty). Every level was checked by a solver
   (tools/make_sort.js), which also found the fewest moves: do it in that many for three stars. Undo as often as you
   like. Each colour also carries a mark, so the colours never have to be told apart by colour alone.

   The rules (Sort) are kept apart from the screen so they can be tested without a browser. */
(function (root) {
  'use strict';
  var CAP = 4;

  function Sort(m) {
    this.st = String(m).split('/').map(function (s) { return s.split('').map(Number); });
    this.moves = 0; this.hist = [];
  }
  Sort.CAP = CAP;
  Sort.prototype.run = function (a) { var A = this.st[a]; if (!A || !A.length) return 0; var c = A[A.length - 1], n = 1; while (n < A.length && A[A.length - 1 - n] === c) n++; return n; };
  // how many bricks would go from a to b (0: not allowed)
  Sort.prototype.can = function (a, b) {
    var A = this.st[a], B = this.st[b];
    if (!A || !B || a === b || !A.length || B.length >= CAP) return 0;
    var c = A[A.length - 1];
    if (B.length && B[B.length - 1] !== c) return 0;
    return Math.min(this.run(a), CAP - B.length);
  };
  Sort.prototype.move = function (a, b) {
    var n = this.can(a, b);
    if (!n) return 0;
    for (var i = 0; i < n; i++) this.st[b].push(this.st[a].pop());
    this.hist.push([a, b, n]); this.moves++;
    return n;
  };
  Sort.prototype.undo = function () {
    var h = this.hist.pop();
    if (!h) return false;
    for (var i = 0; i < h[2]; i++) this.st[h[0]].push(this.st[h[1]].pop());
    this.moves--;
    return true;
  };
  Sort.prototype.full = function (a) { var A = this.st[a]; return A.length === CAP && A.every(function (c) { return c === A[0]; }); };
  Sort.prototype.solved = function () { var self = this; return this.st.every(function (s, i) { return !s.length || self.full(i); }); };
  Sort.stars = function (moves, best) { return moves <= best ? 3 : moves <= Math.ceil(best * 1.5) ? 2 : 1; };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Sort; return; }
  root.Sort = Sort;

  // ---------- the screen ----------
  var LEVELS = root.SORT_LEVELS || [];
  var T = function () { return window.SRW ? window.SRW.t.apply(null, arguments) : arguments[0]; }, SEP = window.SRW ? window.SRW.t('g.sep') : '・';
  var GROUPS = [{ name: T('g.easy'), from: 0, to: 18, note: T('so.g1') }, { name: T('g.normal'), from: 18, to: 30, note: T('so.g2') }, { name: T('g.hard'), from: 30, to: 60, note: T('so.g3') }];
  var COL = ['#FF9DB5', '#F5B82E', '#5DB7F5', '#37C29A', '#B49CFF', '#F0704F', '#8C939B'];
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), x = cv.getContext('2d'), board = $('board');
  var KEY = 'snowrealm.sort.done';
  var startAt = 0, g = null, n = 0, state = 'list', dpr = 1, ac = null, done = {}, sel = -1, last = 0, shake = { i: -1, t: 0 }, fly = null;
  var L = { bw: 44, bh: 24, gap: 14, per: 5, W: 340, H: 300 };
  try { done = JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* no storage */ }
  // stars kept in 轉磚's record (a cloud save brings them from other devices) count too
  if (root.SnowRealmMini) { var fromRec = root.SnowRealmMini.stars('sort'); for (var lvk in fromRec) if (!done[lvk] || done[lvk].s < fromRec[lvk]) done[lvk] = Object.assign({}, done[lvk], { s: fromRec[lvk] }); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function starsOf(i) { return done[i] ? done[i].s : 0; }
  function open(i) { return i === 0 || !!done[i] || !!done[i - 1]; }
  function stars(k) { var s = ''; for (var i = 0; i < 3; i++) s += i < k ? '★' : '☆'; return s; }
  function total() { var t = 0; for (var k in done) t += done[k].s || 0; return t; }

  // stacks in up to two rows
  function layout() {
    if (!g) return;
    var count = g.st.length, rows = count > 6 ? 2 : 1, per = Math.ceil(count / rows);
    var room = Math.min(window.innerWidth - 28, 560), tall = window.innerHeight - board.getBoundingClientRect().top - 120;
    var bw = Math.max(34, Math.min(64, Math.floor((room - 16) / per) - 14)), bh = Math.round(bw * 0.52), gap = Math.round(bw * 0.3);
    var stackH = (CAP + 1.2) * bh + 16;
    while (rows * stackH + 30 > tall && bw > 34) { bw -= 2; bh = Math.round(bw * 0.52); gap = Math.round(bw * 0.3); stackH = (CAP + 1.2) * bh + 16; }
    L = { bw: bw, bh: bh, gap: gap, per: per, rows: rows, stackH: stackH, W: per * (bw + gap) + gap, H: rows * stackH + 24 };
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(L.W * dpr); cv.height = Math.round(L.H * dpr);
    cv.style.width = L.W + 'px'; cv.style.height = L.H + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }
  // where stack i is drawn: its left edge and the bottom of its inside
  function spot(i) {
    var row = Math.floor(i / L.per), col = i % L.per, inRow = Math.min(L.per, g.st.length - row * L.per);
    var offset = (L.per - inRow) * (L.bw + L.gap) / 2;
    return { x: L.gap + offset + col * (L.bw + L.gap), y: 12 + (row + 1) * L.stackH - 8 };
  }
  function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function mark(c, cx, cy, s) {
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = Math.max(1.5, s * 0.22);
    x.beginPath();
    if (c === 0) x.arc(cx, cy, s * 0.5, 0, 6.283);
    else if (c === 1) { x.moveTo(cx, cy - s * 0.6); x.lineTo(cx + s * 0.6, cy + s * 0.45); x.lineTo(cx - s * 0.6, cy + s * 0.45); x.closePath(); }
    else if (c === 2) x.rect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
    else if (c === 3) { x.moveTo(cx, cy - s * 0.6); x.lineTo(cx + s * 0.6, cy); x.lineTo(cx, cy + s * 0.6); x.lineTo(cx - s * 0.6, cy); x.closePath(); }
    else if (c === 4) { x.moveTo(cx - s * 0.6, cy); x.lineTo(cx + s * 0.6, cy); x.moveTo(cx, cy - s * 0.6); x.lineTo(cx, cy + s * 0.6); x.stroke(); return; }
    else if (c === 5) { x.arc(cx, cy, s * 0.5, 0, 6.283); x.stroke(); return; }
    else { x.moveTo(cx - s * 0.5, cy - s * 0.5); x.lineTo(cx + s * 0.5, cy + s * 0.5); x.moveTo(cx + s * 0.5, cy - s * 0.5); x.lineTo(cx - s * 0.5, cy + s * 0.5); x.stroke(); return; }
    x.fill();
  }
  function brick(px, py, c) {
    var w = L.bw - 6, h = L.bh - 3;
    rr(px + 3, py, w, h, Math.min(6, h * 0.3)); x.fillStyle = COL[c]; x.fill();
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + 6, py + h - 3, w - 6, 2);
    x.fillStyle = 'rgba(255,255,255,0.45)'; rr(px + 7, py + 3, w * 0.28, 3, 1.5); x.fill();
    mark(c, px + 3 + w / 2, py + h / 2, h * 0.32);
  }
  function draw(dt) {
    x.clearRect(0, 0, L.W, L.H);
    x.fillStyle = '#222B36'; x.fillRect(0, 0, L.W, L.H);
    if (!g) return;
    if (shake.t > 0) shake.t = Math.max(0, shake.t - dt);
    for (var i = 0; i < g.st.length; i++) {
      var p = spot(i), sx = p.x + (shake.i === i && shake.t > 0 && !reduce ? Math.sin(shake.t / 25) * 4 : 0), full = g.full(i);
      // the stack: an open box
      x.strokeStyle = full ? '#F5B82E' : sel === i ? '#E8EDF2' : '#4A5666'; x.lineWidth = sel === i || full ? 3 : 2;
      x.beginPath(); x.moveTo(sx, p.y - CAP * L.bh - 6); x.lineTo(sx, p.y + 4); x.lineTo(sx + L.bw, p.y + 4); x.lineTo(sx + L.bw, p.y - CAP * L.bh - 6); x.stroke();
      var A = g.st[i], lift = sel === i ? g.run(i) : 0;
      for (var k = 0; k < A.length; k++) {
        var up = k >= A.length - lift ? L.bh * 0.9 : 0;
        if (fly && fly.to === i && k >= A.length - fly.n) continue;
        brick(sx, p.y - (k + 1) * L.bh - up, A[k]);
      }
    }
    // bricks flying across
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 180);
      var a = spot(fly.from), b = spot(fly.to), e = 1 - Math.pow(1 - fly.t, 3);
      for (var j = 0; j < fly.n; j++) {
        var fy0 = a.y - (fly.fromH - j) * L.bh - L.bh * 0.9, fy1 = b.y - (fly.toH + j + 1) * L.bh;
        var fx = a.x + (b.x - a.x) * e, fy = fy0 + (fy1 - fy0) * e - Math.sin(e * Math.PI) * L.bh * 2;
        brick(fx, fy, fly.c);
      }
      if (fly.t >= 1) fly = null;
    }
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
    $('goal').textContent = g ? LEVELS[n].p : 0;
    $('lvName').textContent = g ? T('g.levelN', n + 1) : T('g.levels');
    $('undo').disabled = !g || !g.hist.length || state !== 'play';
    $('restart').disabled = !g || state !== 'play';
  }
  function list() {
    state = 'list'; g = null; sel = -1;
    var h = '<h2>' + T('n.sort') + '</h2><p>' + T('so.how') + '</p><p class="tot">' + T('g.starsTot', total(), LEVELS.length * 3) + '</p>';
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
    hud();
  }
  function play(i) {
    if (i < 0 || i >= LEVELS.length || !open(i)) return;
    n = i; g = new Sort(LEVELS[i].m); startAt = Date.now(); state = 'play'; sel = -1; fly = null;
    show('list', false); show('win', false);
    layout(); hud();
  }
  function tap(i) {
    if (state !== 'play' || !g || i < 0 || i >= g.st.length) return;
    if (sel < 0) { if (g.st[i].length && !g.full(i)) { sel = i; tone(660, 0.04, 'sine', 0.04); } return; }
    if (sel === i) { sel = -1; return; }
    var from = sel, fromH = g.st[from].length, toH = g.st[i].length, c = g.st[from][fromH - 1], moved = g.move(from, i);
    sel = -1;
    if (!moved) { shake = { i: i, t: 300 }; tone(140, 0.08, 'square', 0.03); if (g.st[i].length && !g.full(i)) sel = i; return; }
    fly = reduce ? null : { from: from, to: i, n: moved, c: c, t: 0, fromH: fromH - 1, toH: toH };
    if (fly) fly.fromH = fromH - moved;
    tone(g.full(i) ? 1047 : 523, g.full(i) ? 0.16 : 0.07, 'sine', 0.06);
    hud();
    if (g.solved()) win();
  }
  function win() {
    state = 'won';
    var s = Sort.stars(g.moves, LEVELS[n].p), was = starsOf(n);
    if (!done[n] || s > was || (s === was && g.moves < done[n].m)) done[n] = { s: Math.max(s, was), m: done[n] ? Math.min(done[n].m, g.moves) : g.moves };
    try { window.localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* no storage */ }
    $('winStars').textContent = stars(s);
    $('winNote').textContent = [T('so.win', g.moves, LEVELS[n].p)].concat(s < 3 ? [T('so.winMore')] : []).join(SEP);
    if (root.SnowRealmMini) root.SnowRealmMini.show($('winNote'), { game: 'sort', value: n, stars: s, ms: Date.now() - startAt });
    $('next').hidden = n + 1 >= LEVELS.length;
    setTimeout(function () { if (state === 'won') { show('win', true); $(n + 1 < LEVELS.length ? 'next' : 'toList').focus(); } }, reduce ? 0 : 400);
    [0, 2, 4, 7].forEach(function (k, j) { setTimeout(function () { tone([523, 587, 659, 784, 880, 1047, 1175, 1319][k], 0.2, 'sine', 0.07); }, j * 90); });
    hud();
  }
  function loop(now) {
    window.requestAnimationFrame(loop);
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (g) draw(dt);
  }
  function stackAt(e) {
    var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * L.W, py = (e.clientY - r.top) / r.height * L.H;
    for (var i = 0; i < g.st.length; i++) { var p = spot(i); if (px >= p.x - L.gap / 2 && px <= p.x + L.bw + L.gap / 2 && py >= p.y - L.stackH + 8 && py <= p.y + 10) return i; }
    return -1;
  }
  cv.addEventListener('pointerdown', function (e) { if (g && state === 'play') { var i = stackAt(e); if (i >= 0) tap(i); else sel = -1; e.preventDefault(); } });
  document.addEventListener('keydown', function (e) {
    if (state !== 'play' || !g) return;
    if (/^[1-9]$/.test(e.key) && +e.key <= g.st.length) { tap(+e.key - 1); e.preventDefault(); }
    else if (e.key === '0' && g.st.length >= 10) { tap(9); e.preventDefault(); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { if (g.undo()) { sel = -1; fly = null; hud(); } e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { play(n); e.preventDefault(); }
    else if (e.key === 'Escape') sel = -1;
  });
  $('list').addEventListener('click', function (e) { var b = e.target.closest('[data-lv]'); if (b && !b.disabled) play(+b.getAttribute('data-lv')); });
  $('undo').addEventListener('click', function () { if (g && state === 'play' && g.undo()) { sel = -1; fly = null; hud(); } });
  $('restart').addEventListener('click', function () { if (g && state === 'play') play(n); });
  $('levels').addEventListener('click', list);
  $('next').addEventListener('click', function () { play(n + 1); });
  $('again').addEventListener('click', function () { play(n); });
  $('toList').addEventListener('click', list);
  window.addEventListener('resize', layout);
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) $('keysHint').textContent = T('so.touch');
  list();
  window.requestAnimationFrame(loop);
  root.__sort = function () { return { g: g, n: n, state: state, play: play, tap: tap }; };      // for the browser test
})(typeof window !== 'undefined' ? window : globalThis);
