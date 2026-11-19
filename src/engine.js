/* 轉磚 engine: board, pieces, rotation with wall kicks, T-spin detection, attack and garbage.
   Pure logic, no DOM. Runs in the page and in Node tests. */
(function (root) {
  'use strict';

  var COLS = 10, ROWS = 40, VIS = 20, TOP = ROWS - VIS;
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var TID = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
  var GARBAGE = 8;   // a cell holds its glaze in the low four bits and, for an item tile, the item id above them
  // Items. Names and descriptions live in the language file (keys i1..i7); the tile shows a wordless mark.
  var ITEMS = [null,
    { id: 1, color: '#D9432F' },   // knock down: removes your bottom 3 rows
    { id: 2, color: '#59636F' },   // grout: 3 cement rows to the rival
    { id: 3, color: '#2F7FD9' },   // tarp: blocks cement for 8 s
    { id: 4, color: '#A8700A' },   // gold tiles: the next 2 pieces are T
    { id: 5, color: '#168A63' },   // level: fills the holes in your wall
    { id: 6, color: '#1C8DBF' },   // freeze: the rival cannot move for 3 s
    { id: 7, color: '#7C4BD0' }    // double: lines sent count twice for 8 s
  ];
  // ---------- all 200 items ----------
  // Every item is a list of effects. Twelve kinds of effect, each at a few strengths, make the single items; the rest
  // pair one effect for yourself with one against the rival (or two of one side). Items 1 to 7 are the first seven and
  // never change, so old saves, recordings and online play keep working.
  //   self: chisel n (remove your bottom n rows), shield ms, goldT n / goldI n (your next n pieces), trowel (fill
  //         holes), boost ms x (lines sent count x times), cleanse (drop incoming cement), score n (points)
  //   rival: grout n (n cement rows), freeze ms, curse n (their next n pieces are S or Z), blind ms (their next
  //          pieces hidden)
  var FX_KIND = {
    chisel: { side: 'self', color: '#D9432F', w: 6 }, grout: { side: 'foe', color: '#59636F', w: 7 }, shield: { side: 'self', color: '#2F7FD9', w: 0.6 },
    goldT: { side: 'self', color: '#A8700A', w: 6 }, goldI: { side: 'self', color: '#C9921A', w: 5 }, trowel: { side: 'self', color: '#168A63', w: 14 },
    freeze: { side: 'foe', color: '#1C8DBF', w: 4 }, boost: { side: 'self', color: '#7C4BD0', w: 1.2 }, cleanse: { side: 'self', color: '#3BA8A0', w: 9 },
    curse: { side: 'foe', color: '#8E3B6E', w: 5 }, blind: { side: 'foe', color: '#444B57', w: 1 }, score: { side: 'self', color: '#C79A1A', w: 0.005 }
  };
  function fxPower(f) { var k = FX_KIND[f[0]], v = f[1] || 1; return f[0] === 'shield' || f[0] === 'freeze' || f[0] === 'blind' ? k.w * v / 1000 : f[0] === 'boost' ? k.w * (v / 1000) * (f[2] - 1) : k.w * v; }
  (function () {
    var first = [[['chisel', 3]], [['grout', 3]], [['shield', 8000]], [['goldT', 2]], [['trowel', 1]], [['freeze', 3000]], [['boost', 8000, 2]]], list = first.slice(), i, j;
    var singles = [];
    [1, 2, 4, 5].forEach(function (n) { singles.push([['chisel', n]]); });
    [1, 2, 4, 5, 6].forEach(function (n) { singles.push([['grout', n]]); });
    [3000, 5000, 10000, 12000, 15000].forEach(function (n) { singles.push([['shield', n]]); });
    [1, 3].forEach(function (n) { singles.push([['goldT', n]]); });
    [1, 2, 3].forEach(function (n) { singles.push([['goldI', n]]); });
    [1000, 1500, 2000, 2500, 4000, 5000].forEach(function (n) { singles.push([['freeze', n]]); });
    [4000, 6000, 10000, 12000].forEach(function (n) { singles.push([['boost', n, 2]]); });
    [4000, 6000, 8000].forEach(function (n) { singles.push([['boost', n, 3]]); });
    singles.push([['cleanse', 1]]);
    [1, 2, 3].forEach(function (n) { singles.push([['curse', n]]); });
    [3000, 5000, 8000, 10000].forEach(function (n) { singles.push([['blind', n]]); });
    [500, 1000, 2000, 3000, 5000].forEach(function (n) { singles.push([['score', n]]); });
    list = list.concat(singles);
    var S = [['chisel', 1], ['chisel', 2], ['shield', 3000], ['shield', 5000], ['goldT', 1], ['goldI', 1], ['trowel', 1], ['boost', 4000, 2], ['cleanse', 1], ['score', 1000]];
    var F = [['grout', 1], ['grout', 2], ['grout', 3], ['freeze', 1000], ['freeze', 2000], ['curse', 1], ['curse', 2], ['blind', 3000], ['blind', 5000]];
    for (i = 0; i < S.length; i++) for (j = 0; j < F.length; j++) list.push([S[i], F[j]]);
    for (i = 0; i < S.length && list.length < 200; i++) for (j = i + 1; j < S.length && list.length < 200; j++) if (S[i][0] !== S[j][0]) list.push([S[i], S[j]]);
    for (i = 0; i < F.length && list.length < 200; i++) for (j = i + 1; j < F.length && list.length < 200; j++) if (F[i][0] !== F[j][0]) list.push([F[i], F[j]]);
    for (i = 0; i < 200; i++) {
      var fx = list[i], power = 0;
      fx.forEach(function (f) { power += fxPower(f); });
      var tier = power < 10 ? 1 : power < 18 ? 2 : power < 26 ? 3 : power < 36 ? 4 : 5;
      var def = { id: i + 1, fx: fx, power: Math.round(power * 10) / 10, tier: tier, color: FX_KIND[fx[0][0]].color, color2: fx[1] ? FX_KIND[fx[1][0]].color : null,
        price: [0, 40, 50, 40, 60, 50, 60, 60][i + 1] || Math.round((25 + power * 2.2) / 5) * 5 };
      if (i < 7) { def.color = ITEMS[i + 1].color; ITEMS[i + 1] = def; } else ITEMS.push(def);
    }
  })();
  // How often each item shows up on the board: the first seven most, weaker ones more than strong ones.
  var ITEM_POOL = [];
  ITEMS.forEach(function (d) { if (!d) return; var n = d.id <= 7 ? 12 : [0, 4, 3, 2, 1, 1][d.tier]; for (var k = 0; k < n; k++) ITEM_POOL.push(d.id); });

  // Spawn-state cells inside an n*n box; the other three states come from rotating the box clockwise.
  var BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  var SHAPE0 = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]],
    T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]]
  };
  var SHAPES = {};
  TYPES.forEach(function (t) {
    var n = BOX[t], states = [SHAPE0[t]];
    for (var r = 1; r < 4; r++) {
      states.push(states[r - 1].map(function (c) { return [n - 1 - c[1], c[0]]; }));
    }
    SHAPES[t] = states;
  });

  // Wall kick offsets, written (x, y) with y pointing up; rotate() flips y for the grid.
  var KICK_JLSTZ = {
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  var KICK_I = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };
  var KICK_180 = {
    '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
    '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
    '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
    '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]]
  };
  var KICK_NONE = [[0, 0]];

  function kicksFor(type, from, to) {
    if (type === 'O') return KICK_NONE;
    var key = '' + from + to;
    if (((from + 2) & 3) === to) return type === 'I' ? KICK_NONE : KICK_180[key];
    return (type === 'I' ? KICK_I : KICK_JLSTZ)[key];
  }

  // T-spin test. occ(x, y) is 1 for a filled cell or anything outside the walls and floor.
  // Corner order TL, TR, BL, BR; FRONT lists the two corners beside the T's pointing cell.
  var FRONT = [[0, 1], [1, 3], [2, 3], [0, 2]];
  function tspinType(occ, x, y, rot, kick) {
    var k0 = occ(x, y), k1 = occ(x + 2, y), k2 = occ(x, y + 2), k3 = occ(x + 2, y + 2);
    if (k0 + k1 + k2 + k3 < 3) return 'none';
    var k = [k0, k1, k2, k3], f = FRONT[rot];
    if (k[f[0]] && k[f[1]]) return 'full';
    if (kick === 4) return 'full';
    return 'mini';
  }

  var ATTACK_NORMAL = [0, 0, 1, 2, 4];
  var ATTACK_SPIN = [0, 2, 4, 6];
  var ATTACK_MINI = [0, 1, 2, 2];
  var COMBO = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
  var PERFECT = 6;

  // tspin: 'none', 'full' or 'mini' for a T, 'spin' for any other piece twisted into a spot where it cannot move.
  function calcAttack(lines, tspin, b2b, combo, perfect) {
    if (lines <= 0) return 0;
    var a = tspin === 'full' ? ATTACK_SPIN[lines] : tspin === 'mini' ? ATTACK_MINI[lines] : tspin === 'spin' ? ATTACK_NORMAL[lines] + 1 : ATTACK_NORMAL[lines];
    if (b2b && (lines === 4 || tspin !== 'none')) a += 1;
    a += COMBO[Math.min(Math.max(combo, 0), COMBO.length - 1)];
    if (perfect) a += PERFECT;
    return a;
  }

  // Points for one placed piece. Our own table: harder clears pay more, chains pay a little extra each step.
  var SCORE_LINE = [0, 100, 250, 450, 800];
  var SCORE_TSPIN = [150, 600, 1000, 1500];
  var SCORE_MINI = [50, 200, 400, 400];
  function calcScore(lines, tspin, b2b, combo, perfect) {
    var s = tspin === 'full' ? SCORE_TSPIN[lines] : tspin === 'mini' ? SCORE_MINI[lines] : SCORE_LINE[lines] + (tspin === 'spin' ? (lines ? 200 : 60) : 0);
    if (b2b && lines) s = Math.round(s * 1.5);
    if (lines && combo > 0) s += 40 * combo;
    if (perfect) s += 2500;
    return s;
  }

  function RNG(seed) { this.s = seed >>> 0; }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) | 0;
    var t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function emptyRow() { return new Uint8Array(COLS); }

  function Game(o) {
    o = o || {};
    this.seed = (o.seed != null ? o.seed : Math.random() * 4294967296) >>> 0;
    this.gravity = o.gravity != null ? o.gravity : 1 / 900;      // rows per ms
    this.lockDelay = o.lockDelay != null ? o.lockDelay : 500;
    this.maxResets = o.maxResets != null ? o.maxResets : 15;
    this.sdf = o.sdf != null ? o.sdf : 60;                         // soft drop speed in rows per second; Infinity drops at once
    this.manual = !!o.manual;                                     // driven step by step, no gravity or lock timer
    this.takesGarbage = o.garbage !== false;
    this.garbageCap = o.garbageCap || 8;
    this.garbageDelay = o.garbageDelay != null ? o.garbageDelay : 450;
    this.fixedQueue = o.queue ? o.queue.slice() : null;
    this.keepEvents = o.events !== false;
    this.onAttack = o.onAttack || null;
    this.itemsOn = !!o.items;
    this.itemEvery = o.itemEvery || 8;
    this.itemPool = o.itemPool || ITEM_POOL;
    this.bring = o.bring ? o.bring.slice(0, 3) : [];              // items carried in from outside the match
    this.reset(o.board);
  }

  Game.prototype.reset = function (board) {
    this.rng = new RNG(this.seed);
    this.grng = new RNG(this.seed ^ 0x9E3779B9);
    this.grid = [];
    for (var r = 0; r < ROWS; r++) this.grid.push(emptyRow());
    if (board) this.setBoard(board);
    this.bag = [];
    this.queue = this.fixedQueue ? this.fixedQueue.slice() : [];
    this.holdType = null; this.holdUsed = false;
    this.cur = null;
    this.combo = -1; this.b2b = -1;
    this.pending = []; this.lastHole = -1;
    this.over = false; this.soft = false;
    this.time = 0;
    this.lockTimer = 0; this.resets = 0; this.lowest = 0; this.touched = false;
    this.lastMove = ''; this.lastKick = -1; this.gravAcc = 0;
    this.stats = { pieces: 0, lines: 0, attack: 0, sent: 0, spins: 0, tsd: 0, tst: 0, minis: 0, xspins: 0, quads: 0, maxCombo: 0, perfects: 0, b2bMax: 0, kos: 0, items: 0, score: 0 };
    this.inv = this.bring.slice(); this.itemCount = 0; this.shield = 0; this.boost = 0; this.boostX = 2;
    this.events = [];
    this.fill();
  };

  // rows: strings listed top to bottom, aligned to the floor. '.' empty, piece letters keep their colour, anything else is cement.
  Game.prototype.setBoard = function (rows) {
    for (var i = 0; i < rows.length; i++) {
      var y = ROWS - rows.length + i, s = rows[i];
      for (var x = 0; x < COLS; x++) {
        var ch = s.charAt(x);
        this.grid[y][x] = (ch === '.' || ch === ' ' || ch === '') ? 0 : (TID[ch] || GARBAGE);
      }
    }
  };

  Game.prototype.emit = function (type, data) {
    if (!this.keepEvents) return;
    var e = data || {};
    e.type = type;
    this.events.push(e);
  };

  Game.prototype.fill = function () {
    if (this.fixedQueue) return;
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = TYPES.slice();
        for (var i = this.bag.length - 1; i > 0; i--) {
          var j = Math.floor(this.rng.next() * (i + 1)), t = this.bag[i];
          this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
      }
      this.queue.push(this.bag.pop());
    }
  };

  Game.prototype.fits = function (type, rot, x, y) {
    var c = SHAPES[type][rot];
    for (var i = 0; i < 4; i++) {
      var cx = x + c[i][0], cy = y + c[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
      if (cy >= 0 && this.grid[cy][cx]) return false;
    }
    return true;
  };

  Game.prototype.occ = function (x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return 1;
    if (y < 0) return 0;
    return this.grid[y][x] ? 1 : 0;
  };

  Game.prototype.grounded = function () {
    var c = this.cur;
    return !!c && !this.fits(c.type, c.rot, c.x, c.y + 1);
  };

  Game.prototype.start = function () {
    if (!this.cur && !this.over) this.spawnNext();
  };

  Game.prototype.spawnNext = function () {
    if (!this.queue.length) { this.cur = null; this.emit('empty'); return false; }
    var t = this.queue.shift();
    this.fill();
    return this.spawn(t, false);
  };

  Game.prototype.spawn = function (t, fromHold) {
    var x = t === 'O' ? 4 : 3, y = TOP - 2;
    this.cur = { type: t, rot: 0, x: x, y: y };
    this.lockTimer = 0; this.resets = 0; this.lowest = y; this.touched = false;
    this.lastMove = ''; this.lastKick = -1; this.gravAcc = 0;
    if (!this.fits(t, 0, x, y)) { this.cur = null; this.topOut('block'); return false; }
    if (this.fits(t, 0, x, y + 1)) { this.cur.y++; this.lowest = this.cur.y; }
    this.emit('spawn', { piece: t, hold: !!fromHold });
    return true;
  };

  Game.prototype.hold = function () {
    if (!this.cur || this.holdUsed) return false;
    var t = this.cur.type;
    if (this.holdType) {
      var h = this.holdType;
      this.holdType = t; this.holdUsed = true;
      this.emit('hold');
      this.spawn(h, true);
    } else {
      if (!this.queue.length) return false;
      this.holdType = t; this.holdUsed = true;
      this.emit('hold');
      var n = this.queue.shift();
      this.fill();
      this.spawn(n, true);
    }
    return true;
  };

  // A successful shift or turn after the piece has touched down restarts the lock timer, up to maxResets times per row reached.
  Game.prototype.manip = function () {
    if (this.touched || this.grounded()) {
      this.touched = true;
      if (this.resets < this.maxResets) { this.resets++; this.lockTimer = 0; }
    }
  };

  Game.prototype.newLow = function () {
    var c = this.cur;
    if (c.y > this.lowest) { this.lowest = c.y; this.resets = 0; this.touched = false; this.lockTimer = 0; }
  };

  Game.prototype.move = function (dx) {
    var c = this.cur;
    if (!c || !this.fits(c.type, c.rot, c.x + dx, c.y)) return false;
    c.x += dx;
    this.lastMove = 'move';
    this.manip();
    this.emit('move', { dx: dx, x: c.x, y: c.y, rot: c.rot });
    return true;
  };

  // dir: 1 clockwise, -1 counter-clockwise, 2 half turn
  Game.prototype.rotate = function (dir) {
    var c = this.cur;
    if (!c || c.type === 'O') return false;
    var from = c.rot, to = (from + dir + 4) & 3, ks = kicksFor(c.type, from, to);
    for (var i = 0; i < ks.length; i++) {
      var nx = c.x + ks[i][0], ny = c.y - ks[i][1];
      if (this.fits(c.type, to, nx, ny)) {
        var dx = nx - c.x, dy = ny - c.y;
        c.x = nx; c.y = ny; c.rot = to;
        this.lastMove = 'rotate';
        this.lastKick = dir === 2 ? -1 : i;
        this.newLow();
        this.manip();
        this.emit('rotate', { dir: dir, kick: i, dx: dx, dy: dy, spin: this.spinState(), x: c.x, y: c.y, rot: c.rot });
        return true;
      }
    }
    return false;
  };

  // A piece that has just been turned and cannot shift left, right, up or down.
  Game.prototype.immobile = function () {
    var c = this.cur;
    return !this.fits(c.type, c.rot, c.x - 1, c.y) && !this.fits(c.type, c.rot, c.x + 1, c.y) &&
      !this.fits(c.type, c.rot, c.x, c.y - 1) && !this.fits(c.type, c.rot, c.x, c.y + 1);
  };

  Game.prototype.spinState = function () {
    var c = this.cur, self = this;
    if (!c || c.type === 'O' || this.lastMove !== 'rotate') return 'none';
    if (c.type === 'T') return tspinType(function (x, y) { return self.occ(x, y); }, c.x, c.y, c.rot, this.lastKick);
    return this.immobile() ? 'spin' : 'none';
  };

  Game.prototype.stepDown = function () {
    var c = this.cur;
    if (!c || !this.fits(c.type, c.rot, c.x, c.y + 1)) return false;
    c.y++;
    this.lastMove = 'fall';
    this.newLow();
    return true;
  };

  Game.prototype.sonicDrop = function () {
    var n = 0;
    while (this.stepDown()) n++;
    if (n) { this.stats.score += n; this.emit('fall', { n: n, soft: true, x: this.cur.x, y: this.cur.y, rot: this.cur.rot }); }
    return n;
  };

  Game.prototype.ghostY = function () {
    var c = this.cur, y = c.y;
    while (this.fits(c.type, c.rot, c.x, y + 1)) y++;
    return y;
  };

  Game.prototype.hardDrop = function () {
    var c = this.cur;
    if (!c) return false;
    var from = c.y, n = 0;
    while (this.fits(c.type, c.rot, c.x, c.y + 1)) { c.y++; n++; }
    if (n) this.lastMove = 'fall';
    this.stats.score += 2 * n;
    this.emit('harddrop', { n: n, from: from, x: c.x, y: c.y, rot: c.rot, piece: c.type });
    this.lock();
    return true;
  };

  Game.prototype.update = function (dt) {
    if (this.over) return;
    this.time += dt;
    for (var i = 0; i < this.pending.length; i++) this.pending[i].t -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.boost > 0) this.boost -= dt;
    var c = this.cur;
    if (!c || this.manual) return;
    if (!this.grounded()) {
      var n = 0;
      if (this.soft && this.sdf === Infinity) {
        while (this.fits(c.type, c.rot, c.x, c.y + 1)) { c.y++; n++; }
      } else {
        this.gravAcc += (this.soft ? Math.max(this.gravity, this.sdf / 1000) : this.gravity) * dt;
        while (this.gravAcc >= 1 && this.fits(c.type, c.rot, c.x, c.y + 1)) { c.y++; this.gravAcc -= 1; n++; }
      }
      if (n) {
        this.lastMove = 'fall';
        this.newLow();
        if (this.soft) this.stats.score += n;
        this.emit('fall', { n: n, soft: this.soft, x: c.x, y: c.y, rot: c.rot });
      }
    }
    if (this.grounded()) {
      this.gravAcc = 0;
      this.touched = true;
      this.lockTimer += dt;
      if (this.lockTimer >= this.lockDelay) this.lock();
    }
  };

  Game.prototype.isEmpty = function () {
    for (var r = ROWS - 1; r >= 0; r--) {
      var row = this.grid[r];
      for (var x = 0; x < COLS; x++) if (row[x]) return false;
    }
    return true;
  };

  Game.prototype.stackHeight = function () {
    for (var r = 0; r < ROWS; r++) {
      var row = this.grid[r];
      for (var x = 0; x < COLS; x++) if (row[x]) return ROWS - r;
    }
    return 0;
  };

  // force (optional) replays a recorded placement: { tspin } fixes how the spin is judged, { item: {x, y, id} } marks the item tile.
  Game.prototype.lock = function (force) {
    var c = this.cur;
    if (!c) return;
    var cells = SHAPES[c.type][c.rot], tspin = force && force.tspin ? force.tspin : this.spinState(), id = TID[c.type];
    var above = true, placed = [], i, r, x;
    for (i = 0; i < 4; i++) {
      var px = c.x + cells[i][0], py = c.y + cells[i][1];
      if (py >= 0) this.grid[py][px] = id;
      if (py >= TOP) above = false;
      placed.push([px, py]);
    }
    this.cur = null;
    this.holdUsed = false;
    this.stats.pieces++;

    // Every few pieces one tile of the piece just placed turns into an item tile.
    if (force && force.item) {
      var fi = force.item;
      if (fi.y >= 0 && fi.y < ROWS && this.grid[fi.y][fi.x]) {
        this.grid[fi.y][fi.x] = (this.grid[fi.y][fi.x] & 15) | (fi.id << 4);
        this.emit('itemtile', { x: fi.x, y: fi.y, id: fi.id });
      }
    } else if (this.itemsOn && ++this.itemCount >= this.itemEvery) {
      this.itemCount = 0;
      var pick = placed[Math.floor(this.grng.next() * 4)];
      var item = this.itemPool[Math.floor(this.grng.next() * this.itemPool.length)];
      if (pick[1] >= 0) {
        this.grid[pick[1]][pick[0]] = (this.grid[pick[1]][pick[0]] & 15) | (item << 4);
        this.emit('itemtile', { x: pick[0], y: pick[1], id: item });
      }
    }

    var rows = [];
    for (r = 0; r < ROWS; r++) {
      var row = this.grid[r], full = true;
      for (x = 0; x < COLS; x++) if (!row[x]) { full = false; break; }
      if (full) rows.push(r);
    }
    var lines = rows.length, colors = [], got = [];
    for (i = 0; i < lines; i++) {
      var cr = this.grid[rows[i]];
      for (x = 0; x < COLS; x++) if (cr[x] >> 4) got.push(cr[x] >> 4);
      colors.push(cr);
      this.grid.splice(rows[i], 1);
      this.grid.unshift(emptyRow());
    }

    var atk = 0, b2b = false, perfect = false, pts = 0;
    if (lines) {
      this.combo++;
      perfect = this.isEmpty();
      var hard = lines === 4 || tspin !== 'none';
      b2b = hard && this.b2b >= 0;
      atk = calcAttack(lines, tspin, b2b, this.combo, perfect);
      if (this.boost > 0) atk *= this.boostX || 2;
      if (hard) this.b2b++; else this.b2b = -1;
      var st = this.stats;
      st.lines += lines; st.attack += atk;
      if (this.combo > st.maxCombo) st.maxCombo = this.combo;
      if (this.b2b > st.b2bMax) st.b2bMax = this.b2b;
      if (lines === 4) st.quads++;
      if (perfect) st.perfects++;
      if (tspin === 'full') { st.spins++; if (lines === 2) st.tsd++; if (lines === 3) st.tst++; }
      if (tspin === 'mini') st.minis++;
      if (tspin === 'spin') st.xspins++;
    } else {
      this.combo = -1;
    }
    pts = calcScore(lines, tspin, b2b, this.combo, perfect);
    this.stats.score += pts;

    // Outgoing attack first cancels what is queued against us; the rest goes out.
    var send = atk, cancelled = 0;
    while (send > 0 && this.pending.length) {
      var p = this.pending[0], k = Math.min(send, p.n);
      p.n -= k; send -= k; cancelled += k;
      if (!p.n) this.pending.shift();
    }
    if (send > 0) this.stats.sent += send;

    this.emit('lock', {
      piece: c.type, x: c.x, y: c.y, rot: c.rot, cells: placed, tspin: tspin, lines: lines, rows: rows, rowColors: colors,
      attack: atk, sent: send, cancelled: cancelled, b2b: b2b, combo: this.combo, perfect: perfect, score: pts
    });
    if (send > 0 && this.onAttack) this.onAttack(send, this);
    for (i = 0; i < got.length; i++) {
      if (this.inv.length < 3) { this.inv.push(got[i]); this.stats.items++; this.emit('item', { id: got[i] }); }
      else this.emit('itemfull', { id: got[i] });
    }

    if (!lines) this.landGarbage();
    if (above && !lines) { this.topOut('lock'); return; }
    this.spawnNext();
  };

  Game.prototype.pendingTotal = function () {
    var n = 0;
    for (var i = 0; i < this.pending.length; i++) n += this.pending[i].n;
    return n;
  };

  // Queue n cement rows against this board. One gap column per attack, never the same as the previous attack's.
  Game.prototype.receive = function (n) {
    if (!this.takesGarbage || n <= 0 || this.over) return;
    if (this.shield > 0) { this.emit('blocked', { n: n }); return; }
    var col;
    do { col = Math.floor(this.grng.next() * COLS); } while (col === this.lastHole);
    this.lastHole = col;
    this.pending.push({ n: n, col: col, t: this.garbageDelay });
    this.emit('incoming', { n: n });
  };

  Game.prototype.landGarbage = function () {
    var total = 0, segs = [];
    while (this.pending.length && this.pending[0].t <= 0 && total < this.garbageCap) {
      var p = this.pending[0], k = Math.min(p.n, this.garbageCap - total);
      this.pushGarbage(k, p.col);
      segs.push([k, p.col]);
      p.n -= k; total += k;
      if (!p.n) this.pending.shift();
    }
    if (total) this.emit('garbage', { n: total, segs: segs });
    return total;
  };

  // lift: how many rows at the very bottom stay underneath the new cement (0 puts it on the floor).
  Game.prototype.pushGarbage = function (n, col, lift) {
    lift = lift || 0;
    for (var i = 0; i < n; i++) {
      this.grid.shift();
      var row = emptyRow();
      for (var x = 0; x < COLS; x++) row[x] = x === col ? 0 : GARBAGE;
      this.grid.splice(ROWS - 1 - lift, 0, row);
    }
  };

  Game.prototype.topOut = function (kind) {
    this.over = true;
    this.cur = null;
    this.emit('topout', { kind: kind });
  };

  // After a knockout: cement rows fall away; if what is left is still tall, the wall is cleared.
  Game.prototype.revive = function () {
    var keep = [], r, x;
    for (r = 0; r < ROWS; r++) {
      var row = this.grid[r], cement = false;
      for (x = 0; x < COLS; x++) if ((row[x] & 15) === GARBAGE) { cement = true; break; }
      if (!cement) keep.push(row);
    }
    while (keep.length < ROWS) keep.unshift(emptyRow());
    this.grid = keep;
    if (this.stackHeight() > 9) {
      for (r = 0; r < ROWS; r++) this.grid[r] = emptyRow();
    }
    this.pending = [];
    this.combo = -1;
    this.over = false;
    this.holdUsed = false;
    this.soft = false;
    this.emit('revive');
    this.spawnNext();
  };

  // ---- item effects that reshape the wall ----
  Game.prototype.takeItem = function () { return this.inv.length ? this.inv.shift() : 0; };

  // After the wall changes under a falling piece, lift the piece clear of anything that moved into it.
  Game.prototype.refit = function () {
    var c = this.cur;
    if (!c) return;
    var guard = 0;
    while (!this.fits(c.type, c.rot, c.x, c.y) && guard++ < ROWS) c.y--;
    this.lowest = c.y; this.lockTimer = 0; this.lastMove = '';
  };

  Game.prototype.chisel = function (n, lift) {
    var gone = [];
    lift = lift || 0;
    for (var i = 0; i < n; i++) {
      var row = this.grid.splice(ROWS - 1 - lift, 1)[0], any = false;
      for (var x = 0; x < COLS; x++) if (row[x]) { any = true; break; }
      if (any) gone.push(row);
      this.grid.unshift(emptyRow());
    }
    this.refit();
    this.emit('chisel', { rows: gone, n: n });
    return gone.length;
  };

  // Every column drops straight down until its holes are gone; rows completed that way are simply removed.
  Game.prototype.trowel = function (lift) {
    var x, y, moved = 0, floor = ROWS - 1 - (lift || 0);
    for (x = 0; x < COLS; x++) {
      var w = floor;
      for (y = floor; y >= 0; y--) {
        var v = this.grid[y][x];
        if (v) {
          if (w !== y) { this.grid[w][x] = v; this.grid[y][x] = 0; moved++; }
          w--;
        }
      }
    }
    var lines = 0;
    for (y = floor; y >= 0; y--) {
      var row = this.grid[y], full = true;
      for (x = 0; x < COLS; x++) if (!row[x]) { full = false; break; }
      if (full) { this.grid.splice(y, 1); this.grid.unshift(emptyRow()); lines++; y++; }
    }
    this.stats.lines += lines;
    this.refit();
    this.emit('trowel', { moved: moved, lines: lines });
    return moved;
  };

  Game.prototype.snapshot = function () {
    var s = this.stats, st = {};
    for (var k in s) st[k] = s[k];
    return {
      grid: this.grid.map(function (r) { return r.slice(); }),
      queue: this.queue.slice(), bag: this.bag.slice(), rng: this.rng.s,
      holdType: this.holdType, combo: this.combo, b2b: this.b2b, stats: st,
      cur: this.cur ? this.cur.type : null
    };
  };

  Game.prototype.restore = function (s) {
    this.grid = s.grid.map(function (r) { return r.slice(); });
    this.queue = s.queue.slice(); this.bag = s.bag.slice(); this.rng.s = s.rng;
    this.holdType = s.holdType; this.holdUsed = false;
    this.combo = s.combo; this.b2b = s.b2b;
    for (var k in s.stats) this.stats[k] = s.stats[k];
    this.pending = []; this.over = false; this.soft = false;
    this.cur = null;
    if (s.cur) this.spawn(s.cur, true);
  };

  var ZZ = {
    COLS: COLS, ROWS: ROWS, VIS: VIS, TOP: TOP, TYPES: TYPES, TID: TID, GARBAGE: GARBAGE, ITEMS: ITEMS, FX_KIND: FX_KIND, ITEM_POOL: ITEM_POOL,
    BOX: BOX, SHAPES: SHAPES, kicksFor: kicksFor, tspinType: tspinType, calcAttack: calcAttack, calcScore: calcScore,
    RNG: RNG, Game: Game
  };
  // The number of this set of rules. A recording only plays back (and a reported match only checks out) under the
  // rules it was made with, so raise it whenever a change here would make the same moves end differently.
  ZZ.RULES = 1;
  root.ZZ = ZZ;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
