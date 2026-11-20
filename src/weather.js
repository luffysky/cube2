/* 轉磚 weather (挑戰大自然): wind, rain, snow, thunderstorms and fog that push the game around.

   Only the weather mode uses this; every other mode plays without it. Everything here comes from the seed and the
   time played, so two players given the same seed get the same weather at the same moment (that is what lets the
   online version share one sky).

   What each one does to the game:
     wind   the falling piece drifts one column at a time in the wind's direction (stronger wind, more often)
     rain   pieces fall faster, lock sooner, and slide along the wet stack after they land
     snow   pieces fall slower, but snow settles on the stack a cell at a time
     storm  wind and rain together, and lightning now and then turns a block into cement
     fog    the lower rows are hidden behind fog
     sand   a sandstorm: the wind pushes like a gale and the next pieces cannot be seen
     aurora the good one: every point scored while it lasts counts twice
     eclipse the sky goes dark; only the cells around the falling piece can be seen

   The weather changes every 20 to 30 seconds and gets stronger the longer the run goes.

   Disasters come on top of the weather, rarely (one every one to two minutes, from a minute in) and always after a
   warning of about two seconds:
     flood    a wave sweeps across: the top blocks of each column it passes are washed downstream (off the far edge
              they are gone), and the falling piece bobs up and down and drifts with it
     tornado  a funnel crosses the wall: it lifts the top blocks of the columns it passes and, as it leaves, drops them
              back on other columns
     quake    the wall shakes: every block with a gap under it falls (rows filled that way are cleared and scored), and
              columns standing well above both neighbours topple one block over
     hail     hailstones land on top of a few columns as ice: a row of ice cleared once only cracks it (the cracked
              block drops back on its column), cleared again it goes
     volcano  a row of lava pushes up from the floor (one gap, like cement); the blocks sitting on it burn away one
              cell each, more of them the stronger it is, and the lava cools into cement when it is over
     zap      one great bolt splits a whole column: every block in it is gone (a well for you, or a gap in every row)
   They run on their own random stream, so the ordinary weather is the same with or without them. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ, COLS = ZZ.COLS, ROWS = ZZ.ROWS, TOP = ZZ.TOP, GARBAGE = ZZ.GARBAGE, RNG = ZZ.RNG, SHAPES = ZZ.SHAPES;
  var SNOW = 9;
  var KINDS = ['wind', 'rain', 'snow', 'storm', 'fog', 'sand', 'aurora', 'eclipse'];
  var GOOD = ['aurora'];      // weather that helps: never thrown at a rival
  var DISASTERS = ['flood', 'tornado', 'quake', 'hail', 'volcano', 'zap'];
  var DIS_WARN = 2000, DIS_LEN = { flood: 3200, tornado: 3800, quake: 2200, hail: 2600, volcano: 3400, zap: 900 };
  var ICE = ZZ.ICE || 10, LAVA = ZZ.LAVA || 12;
  var CALM = 6000;          // a short calm at the start
  var MINUTE = 60000;

  function Weather(o) {
    o = o || {};
    this.seed = (o.seed >>> 0) || 1;
    this.only = KINDS.indexOf(o.only) >= 0 ? o.only : '';       // practice one kind of weather all the way through
    this.onlyDis = DISASTERS.indexOf(o.only) >= 0 ? o.only : '';   // …or one kind of disaster, under a clear sky
    this.noDis = !!o.noDis;
    this.drng = new RNG(this.seed ^ 0x2545F491);
    this.dis = null; this.disNext = this.onlyDis ? 8000 : 60000 + this.drng.next() * 30000;
    this.rng = new RNG(this.seed ^ 0x5bd1e995);
    this.t = 0;
    this.kind = 'clear'; this.lvl = 0; this.left = CALM; this.n = 0;
    this.dir = 1; this.wind = 0; this.rain = 0; this.snow = 0; this.fog = 0; this.sand = 0; this.dark = 0; this.aurora = 0; this.sc = 0;
    this.pushAcc = 0; this.driftAcc = 0; this.boltAt = 0; this.gustT = 0;
    this.baseGrav = 1 / 900; this.baseLock = 500;
    this.boardOnly = !!o.boardOnly;     // a computer's board: no pushing or speed changes, only what lands on the wall
    this.hitKind = ''; this.hitLeft = 0; this.hitLvl = 3;
    if (this.only) this.next();
  }

  // the next spell of weather
  Weather.prototype.next = function () {
    var r = this.rng, prev = this.kind, k;
    if (this.only) k = this.only;
    else if (this.onlyDis) k = 'clear';
    else do { k = KINDS[Math.floor(r.next() * KINDS.length)]; } while (k === prev);
    this.n++;
    this.kind = k;
    // stronger as the run goes: level 1 for the first minute and a half, up to 3 after four minutes
    var age = this.t / MINUTE;
    this.lvl = Math.max(1, Math.min(3, 1 + Math.floor(age / 1.5) + (r.next() < 0.3 ? 1 : 0)));
    this.left = 20000 + Math.floor(r.next() * 10000);
    this.dir = r.next() < 0.5 ? -1 : 1;
    this.boltAt = 3000 + r.next() * 4000;
    this.driftAcc = 0; this.pushAcc = 0;
    return k;
  };

  // Weather thrown by the rival (a 4-line clear in a weather battle): this kind at full strength for ms, then the sky
  // goes back to its own schedule.
  Weather.prototype.hit = function (kind, ms) {
    if (DISASTERS.indexOf(kind) >= 0) { if (this.dis) return false; this.startDis(kind, 3, 1500); return true; }
    if (KINDS.indexOf(kind) < 0 || GOOD.indexOf(kind) >= 0) return false;
    this.hitKind = kind; this.hitLeft = Math.max(1000, Math.min(15000, ms || 9000));
    this.boltAt = Math.min(this.boltAt, 1500); this.driftAcc = 0; this.pushAcc = 0;
    return true;
  };
  Weather.prototype.kindNow = function () { return this.hitLeft > 0 ? this.hitKind : this.kind; };
  Weather.prototype.lvlNow = function () { return this.hitLeft > 0 ? this.hitLvl : this.lvl; };

  // How hard the wind blows right now, in metres a second (shown to the player); gusts come and go.
  Weather.prototype.windNow = function () {
    var k = this.kindNow(), L = this.lvlNow(), base = k === 'wind' ? 4 + L * 4 : k === 'storm' ? 6 + L * 4 : k === 'sand' ? 3 + L * 3 : k === 'rain' ? 1 + L : 0;
    if (!base) return 0;
    var gust = Math.sin(this.t / 1700) * 0.25 + Math.sin(this.t / 610 + this.n) * 0.15;
    return Math.max(0, Math.round(base * (1 + gust)));
  };

  // The board (a ZZ.Game) under this weather for dt milliseconds. Gives back what happened, for the screen and the sound:
  // { type: 'change', kind } | { type: 'gust', dir } | { type: 'drift', x, y } | { type: 'bolt', x, y }
  Weather.prototype.step = function (g, dt) {
    var out = [];
    this.t += dt;
    this.left -= dt;
    if (this.left <= 0) { this.next(); if (!(this.hitLeft > 0)) out.push({ type: 'change', kind: this.kind, lvl: this.lvl }); }
    if (this.hitLeft > 0) { this.hitLeft -= dt; if (this.hitLeft <= 0) out.push({ type: 'change', kind: this.kind, lvl: this.lvl, back: true }); }
    var k = this.kindNow(), L = this.lvlNow(), wet = k === 'rain' || k === 'storm';
    this.wind = this.windNow();
    this.rain = wet ? Math.round((k === 'storm' ? 20 : 8) * L + Math.sin(this.t / 2300) * 3 + 3) : 0;
    this.snow = k === 'snow' ? L : 0;
    this.fog = k === 'fog' ? 2 + L * 2 : 0;
    this.sand = k === 'sand' ? L : 0;
    this.dark = k === 'eclipse' ? L : 0;
    this.aurora = k === 'aurora' ? 1 : 0;
    // under the aurora every point scored since the last step counts twice
    var sc = g.stats.score || 0;
    if (this.aurora && sc > this.sc) { g.stats.score = sc + (sc - this.sc); out.push({ type: 'bonus', n: sc - this.sc }); }
    this.sc = g.stats.score || 0;

    // fall speed and how long a landed piece waits
    if (this.boardOnly) return this.land(g, dt, k, L, out);
    var fall = wet ? 1 + 0.22 * L : k === 'snow' ? 0.6 : 1;
    g.gravity = this.baseGrav * fall;
    g.lockDelay = wet ? Math.max(260, Math.round(this.baseLock * (1 - 0.13 * L))) : this.baseLock;

    var c = g.cur;
    // the wind pushes the piece; on a wet stack it keeps sliding after it lands
    if (c && this.wind > 0) {
      var grounded = g.grounded();
      if (!grounded || wet) {
        this.pushAcc += this.wind * dt / (grounded ? 26000 : 13000);
        if (this.pushAcc >= 1) {
          this.pushAcc -= 1;
          if (g.fits(c.type, c.rot, c.x + this.dir, c.y)) {
            c.x += this.dir;
            g.lastMove = 'wind';
            g.emit('move', { dx: this.dir, x: c.x, y: c.y, rot: c.rot, wind: true });
            out.push({ type: 'gust', dir: this.dir });
          }
        }
      }
    } else this.pushAcc = 0;
    return this.land(g, dt, k, L, out);
  };
  // what the weather does to the wall itself: snow settling, lightning, and the disasters
  Weather.prototype.land = function (g, dt, k, L, out) {
    this.disaster(g, dt, out);
    // snow settles: one cell at a time on top of a column, never filling a row by itself
    if (k === 'snow') {
      this.driftAcc += dt;
      var every = 6500 - L * 1500;
      if (this.driftAcc >= every) {
        this.driftAcc = Math.min(every - 1, this.driftAcc - every);
        var d = this.settle(g);
        if (d) out.push(d);
      }
    }

    // lightning: the top block of a column turns to cement
    if (k === 'storm') {
      this.boltAt -= dt;
      if (this.boltAt <= 0) {
        this.boltAt = 9000 - L * 1500 + this.rng.next() * 3000;
        var b = this.strike(g);
        out.push(b || { type: 'bolt', x: Math.floor(this.rng.next() * COLS), y: -1 });
      }
    }
    return out;
  };

  function top(g, x) { for (var y = 0; y < ROWS; y++) if (g.grid[y][x]) return y; return ROWS; }
  function underPiece(g, x, y) {
    var c = g.cur;
    if (!c) return false;
    var cells = SHAPES[c.type][c.rot];
    for (var i = 0; i < 4; i++) if (c.x + cells[i][0] === x && c.y + cells[i][1] === y) return true;
    return false;
  }
  Weather.prototype.settle = function (g) {
    var r = this.rng, start = Math.floor(r.next() * COLS);
    for (var i = 0; i < COLS; i++) {
      var x = (start + i) % COLS, y = top(g, x) - 1;
      if (y < TOP + 2 || underPiece(g, x, y)) continue;
      var row = g.grid[y], filled = 0;
      for (var j = 0; j < COLS; j++) if (row[j]) filled++;
      if (filled >= COLS - 1) continue;
      row[x] = SNOW;
      g.emit('drift', { x: x, y: y });
      return { type: 'drift', x: x, y: y };
    }
    return null;
  };
  Weather.prototype.strike = function (g) {
    var r = this.rng, start = Math.floor(r.next() * COLS);
    for (var i = 0; i < COLS; i++) {
      var x = (start + i * 3) % COLS, y = top(g, x);
      if (y >= ROWS) continue;
      g.grid[y][x] = GARBAGE;
      g.emit('bolt', { x: x, y: y });
      return { type: 'bolt', x: x, y: y };
    }
    return null;
  };

  // ---------- disasters ----------
  Weather.prototype.startDis = function (kind, lvl, warn) {
    var r = this.drng;
    this.dis = { kind: kind, lvl: lvl, phase: 'warn', t: 0, warn: warn || DIS_WARN, dur: DIS_LEN[kind], dir: r.next() < 0.5 ? -1 : 1, col: -1, air: [], bob: 0, wob: r.next() * 6.283, gone: 0, started: true };
  };
  Weather.prototype.disaster = function (g, dt, out) {
    var d = this.dis;
    if (!d) {
      if (this.noDis) return;
      this.disNext -= dt;
      if (this.disNext > 0) return;
      this.startDis(this.onlyDis || DISASTERS[Math.floor(this.drng.next() * DISASTERS.length)], this.onlyDis ? Math.max(1, this.lvl) : Math.max(1, Math.min(3, this.lvl)));
      d = this.dis;
    }
    if (d.started) { d.started = false; out.push({ type: 'disaster', kind: d.kind, phase: 'warn', dir: d.dir, lvl: d.lvl }); }
    d.t += dt;
    if (d.phase === 'warn') {
      if (d.t < d.warn) return;
      d.phase = 'hit'; d.t = 0;
      out.push({ type: 'disaster', kind: d.kind, phase: 'hit', dir: d.dir, lvl: d.lvl });
      if (d.kind === 'quake') out.push(this.quake(g, d));
      else if (d.kind === 'volcano') out.push(this.erupt(g, d));
      else if (d.kind === 'zap') out.push(this.zap(g, d));
      d.left = d.kind === 'hail' ? 2 + d.lvl * 2 : d.kind === 'volcano' ? d.lvl + 1 : 0;
      return;
    }
    var p = Math.min(1, d.t / d.dur), col;
    if (d.kind === 'flood') {
      col = Math.min(COLS - 1, Math.floor(p * (COLS + 1)));
      col = d.dir > 0 ? col : COLS - 1 - col;
      while (d.col !== col && p < 1) {
        d.col = d.col < 0 ? (d.dir > 0 ? 0 : COLS - 1) : d.col + d.dir;
        var w = this.wash(g, d.col, d);
        if (w) out.push(w);
      }
      // the falling piece rides the wave: up and down, and along with it where the wave is
      if (!this.boardOnly && g.cur) {
        d.bob += dt;
        if (d.bob >= 260) {
          d.bob -= 260;
          var c = g.cur, up = Math.floor(d.t / 260) % 2 === 0, dy = up ? -1 : 1;
          if (g.fits(c.type, c.rot, c.x, c.y + dy)) { c.y += dy; g.emit('move', { dx: 0, x: c.x, y: c.y, rot: c.rot, wind: true }); }
          if (Math.abs(c.x + 1.5 - d.col) < 2.5 && g.fits(c.type, c.rot, c.x + d.dir, c.y)) { c.x += d.dir; g.lastMove = 'wind'; g.emit('move', { dx: d.dir, x: c.x, y: c.y, rot: c.rot, wind: true }); }
        }
      }
    } else if (d.kind === 'hail') {
      // stones come down one after another through the spell
      var due = Math.min(2 + d.lvl * 2, Math.floor(p * (2 + d.lvl * 2) + 1));
      while (d.left > 0 && (2 + d.lvl * 2) - d.left < due) { d.left--; var hs = this.hail(g, d); if (hs) out.push(hs); }
    } else if (d.kind === 'volcano') {
      // the blocks resting on the lava catch fire one after another
      var bd = Math.floor(p * (d.lvl + 1));
      while (d.left > 0 && (d.lvl + 1) - d.left < bd) { d.left--; var bu = this.burn(g, d); if (bu) out.push(bu); }
    } else if (d.kind === 'tornado') {
      // the funnel's column: across the wall with a wobble
      var along = p * (COLS - 1), wob = Math.sin(d.wob + p * 9) * 1.2;
      col = Math.max(0, Math.min(COLS - 1, Math.round((d.dir > 0 ? along : COLS - 1 - along) + wob)));
      if (col !== d.col && p < 1) { d.col = col; var l = this.lift(g, col, d); if (l) out.push(l); }
    }
    if (d.t >= d.dur) {
      if (d.kind === 'tornado') out.push(this.drop(g, d));
      if (d.kind === 'volcano') out.push(this.cool(g));
      out.push({ type: 'disaster', kind: d.kind, phase: 'end', gone: d.gone });
      this.dis = null;
      this.disNext = this.onlyDis ? 12000 + this.drng.next() * 8000 : 60000 + this.drng.next() * 60000;
    }
  };
  // the wave washes the top blocks of column x one column downstream; off the far edge they are gone
  Weather.prototype.wash = function (g, x, d) {
    var n = d.lvl, moved = 0, nx = x + d.dir;
    for (var i = 0; i < n; i++) {
      var y = top(g, x);
      if (y >= ROWS) break;
      var v = g.grid[y][x];
      g.grid[y][x] = 0;
      moved++;
      if (nx < 0 || nx >= COLS) { d.gone++; continue; }
      var ty = top(g, nx) - 1;
      if (ty < TOP + 1 || fullAfter(g, ty, nx)) { d.gone++; continue; }
      g.grid[ty][nx] = v;
    }
    if (!moved) return null;
    g.refit();
    g.emit('wash', { x: x, n: moved });
    return { type: 'wash', x: x, n: moved };
  };
  // the funnel lifts the top blocks of column x
  Weather.prototype.lift = function (g, x, d) {
    var n = d.lvl, got = 0;
    for (var i = 0; i < n; i++) {
      var y = top(g, x);
      if (y >= ROWS) break;
      d.air.push(g.grid[y][x]);
      g.grid[y][x] = 0;
      got++;
    }
    if (!got) return null;
    g.refit();
    g.emit('lift', { x: x, n: got });
    return { type: 'lift', x: x, n: got };
  };
  // …and drops them back on other columns as it leaves (never filling a row by itself)
  Weather.prototype.drop = function (g, d) {
    var r = this.drng, put = [];
    for (var i = 0; i < d.air.length; i++) {
      var start = Math.floor(r.next() * COLS), done = false;
      for (var j = 0; j < COLS && !done; j++) {
        var x = (start + j * 3) % COLS, y = top(g, x) - 1;
        if (y < TOP + 2 || underPiece(g, x, y) || fullAfter(g, y, x)) continue;
        g.grid[y][x] = d.air[i];
        put.push([x, y]); done = true;
      }
      if (!done) d.gone++;
    }
    d.air = [];
    g.refit();
    g.emit('drop', { cells: put });
    return { type: 'drop', cells: put };
  };
  // the ground shakes: everything with a gap under it falls (full rows go, and score), tall columns topple
  Weather.prototype.quake = function (g, d) {
    var before = g.stats.lines;
    g.trowel(0);
    var lines = g.stats.lines - before, fell = 0;
    for (var x = 0; x < COLS; x++) {
      var h = ROWS - top(g, x), hl = x > 0 ? ROWS - top(g, x - 1) : 99, hr = x < COLS - 1 ? ROWS - top(g, x + 1) : 99;
      if (h - Math.min(hl, hr) < 3) continue;
      var to = hl <= hr ? x - 1 : x + 1, y = top(g, x), ty = top(g, to) - 1;
      if (ty < TOP + 1 || fullAfter(g, ty, to)) continue;
      g.grid[ty][to] = g.grid[y][x]; g.grid[y][x] = 0; fell++;
    }
    if (lines) g.stats.score = (g.stats.score || 0) + lines * 150 * d.lvl;
    g.refit();
    g.emit('quake', { lines: lines, fell: fell });
    return { type: 'quake', lines: lines, fell: fell };
  };
  // a hailstone lands on top of a column as ice (never filling a row, never under the falling piece); it knocks the
  // falling piece down a row if there is room
  Weather.prototype.hail = function (g, d) {
    var r = this.drng, start = Math.floor(r.next() * COLS);
    for (var i = 0; i < COLS; i++) {
      var x = (start + i * 7) % COLS, y = top(g, x) - 1;
      if (y < TOP + 2 || underPiece(g, x, y) || fullAfter(g, y, x)) continue;
      g.grid[y][x] = ICE;
      if (!this.boardOnly && g.cur && g.fits(g.cur.type, g.cur.rot, g.cur.x, g.cur.y + 1)) { g.cur.y++; g.emit('move', { dx: 0, x: g.cur.x, y: g.cur.y, rot: g.cur.rot, wind: true }); }
      g.refit();
      g.emit('hail', { x: x, y: y });
      return { type: 'hail', x: x, y: y };
    }
    return null;
  };
  // a row of lava comes up from the floor, with one gap
  Weather.prototype.erupt = function (g, d) {
    var gap = Math.floor(this.drng.next() * COLS);
    g.pushGarbage(1, gap, 0);
    var row = g.grid[ROWS - 1];
    for (var x = 0; x < COLS; x++) if (row[x]) row[x] = LAVA;
    d.gap = gap;
    g.refit();
    g.emit('erupt', { gap: gap });
    return { type: 'erupt', gap: gap };
  };
  // a block sitting on the lava burns away; the column above it settles down a cell
  Weather.prototype.burn = function (g, d) {
    var r = this.drng, start = Math.floor(r.next() * COLS), y0 = -1;
    for (var y = ROWS - 1; y >= 0; y--) { var lv = false; for (var j = 0; j < COLS; j++) if ((g.grid[y][j] & 15) === LAVA) { lv = true; break; } if (lv) { y0 = y; break; } }
    if (y0 < 1) return null;
    for (var i = 0; i < COLS; i++) {
      var x = (start + i * 3) % COLS;
      if ((g.grid[y0][x] & 15) !== LAVA || !g.grid[y0 - 1][x]) continue;
      for (var yy = y0 - 1; yy > 0; yy--) g.grid[yy][x] = g.grid[yy - 1][x];
      g.grid[0][x] = 0;
      d.gone++;
      g.refit();
      g.emit('burn', { x: x, y: y0 - 1 });
      return { type: 'burn', x: x, y: y0 - 1 };
    }
    return null;
  };
  // …and when it is over, the lava cools into cement
  Weather.prototype.cool = function (g) {
    var n = 0;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if ((g.grid[y][x] & 15) === LAVA) { g.grid[y][x] = GARBAGE; n++; }
    g.emit('cool', { n: n });
    return { type: 'cool', n: n };
  };
  // one bolt splits a whole column (the falling piece is left alone)
  Weather.prototype.zap = function (g, d) {
    var r = this.drng, x = Math.floor(r.next() * COLS), n = 0;
    // a strong bolt finds the tallest column
    if (d.lvl >= 3) { var best = -1; for (var i = 0; i < COLS; i++) { var h = ROWS - top(g, i); if (h > best) { best = h; x = i; } } }
    for (var y = 0; y < ROWS; y++) if (g.grid[y][x]) { g.grid[y][x] = 0; n++; }
    d.col = x; d.gone += 0;
    g.refit();
    g.emit('zap', { x: x, n: n });
    return { type: 'zap', x: x, n: n };
  };
  function fullAfter(g, y, x) { var row = g.grid[y], n = 0; for (var j = 0; j < COLS; j++) if (row[j] || j === x) n++; return n >= COLS; }

  // what the screen shows beside the next pieces
  Weather.prototype.info = function () {
    var d = this.dis;
    return { kind: this.kindNow(), lvl: this.lvlNow(), hit: this.hitLeft > 0, dir: this.dir, wind: this.wind, rain: this.rain, snow: this.snow, fog: this.fog, sand: this.sand, dark: this.dark, aurora: this.aurora, left: Math.max(0, this.hitLeft > 0 ? this.hitLeft : this.left),
      dis: d ? { kind: d.kind, phase: d.phase, p: d.phase === 'hit' ? Math.min(1, d.t / d.dur) : d.t / d.warn, col: d.col, dir: d.dir, air: d.air.length, lvl: d.lvl } : null };
  };

  // How the run is scored: the game's own score plus 5 for every second survived.
  function scoreOf(g, ms) { return (g.stats.score || 0) + Math.floor(ms / 1000) * 5; }
  // the fall speed of the run itself, before the weather: quicker every minute
  function gravAt(ms) { return 1 / Math.max(110, 900 - ms / 1000 * 2.6); }

  ZZ.SNOW = SNOW;
  ZZ.Weather = Weather;
  Weather.KINDS = KINDS;
  Weather.DISASTERS = DISASTERS;
  Weather.GOOD = GOOD;
  Weather.THROWN = KINDS.filter(function (k) { return GOOD.indexOf(k) < 0; }).concat(DISASTERS);
  Weather.scoreOf = scoreOf;
  Weather.gravAt = gravAt;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
