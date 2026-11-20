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

   The weather changes every 20 to 30 seconds and gets stronger the longer the run goes. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ, COLS = ZZ.COLS, ROWS = ZZ.ROWS, TOP = ZZ.TOP, GARBAGE = ZZ.GARBAGE, RNG = ZZ.RNG, SHAPES = ZZ.SHAPES;
  var SNOW = 9;
  var KINDS = ['wind', 'rain', 'snow', 'storm', 'fog'];
  var CALM = 6000;          // a short calm at the start
  var MINUTE = 60000;

  function Weather(o) {
    o = o || {};
    this.seed = (o.seed >>> 0) || 1;
    this.only = KINDS.indexOf(o.only) >= 0 ? o.only : '';       // practice one kind of weather all the way through
    this.rng = new RNG(this.seed ^ 0x5bd1e995);
    this.t = 0;
    this.kind = 'clear'; this.lvl = 0; this.left = CALM; this.n = 0;
    this.dir = 1; this.wind = 0; this.rain = 0; this.snow = 0; this.fog = 0;
    this.pushAcc = 0; this.driftAcc = 0; this.boltAt = 0; this.gustT = 0;
    this.baseGrav = 1 / 900; this.baseLock = 500;
    if (this.only) this.next();
  }

  // the next spell of weather
  Weather.prototype.next = function () {
    var r = this.rng, prev = this.kind, k;
    if (this.only) k = this.only;
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

  // How hard the wind blows right now, in metres a second (shown to the player); gusts come and go.
  Weather.prototype.windNow = function () {
    var k = this.kind, base = k === 'wind' ? 4 + this.lvl * 4 : k === 'storm' ? 6 + this.lvl * 4 : k === 'rain' ? 1 + this.lvl : 0;
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
    if (this.left <= 0) { this.next(); out.push({ type: 'change', kind: this.kind, lvl: this.lvl }); }
    var k = this.kind, L = this.lvl, wet = k === 'rain' || k === 'storm';
    this.wind = this.windNow();
    this.rain = wet ? Math.round((k === 'storm' ? 20 : 8) * L + Math.sin(this.t / 2300) * 3 + 3) : 0;
    this.snow = k === 'snow' ? L : 0;
    this.fog = k === 'fog' ? 2 + L * 2 : 0;

    // fall speed and how long a landed piece waits
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

  // what the screen shows beside the next pieces
  Weather.prototype.info = function () {
    return { kind: this.kind, lvl: this.lvl, dir: this.dir, wind: this.wind, rain: this.rain, snow: this.snow, fog: this.fog, left: Math.max(0, this.left) };
  };

  // How the run is scored: the game's own score plus 5 for every second survived.
  function scoreOf(g, ms) { return (g.stats.score || 0) + Math.floor(ms / 1000) * 5; }
  // the fall speed of the run itself, before the weather: quicker every minute
  function gravAt(ms) { return 1 / Math.max(110, 900 - ms / 1000 * 2.6); }

  ZZ.SNOW = SNOW;
  ZZ.Weather = Weather;
  Weather.KINDS = KINDS;
  Weather.scoreOf = scoreOf;
  Weather.gravAt = gravAt;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
