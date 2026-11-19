/* 轉磚 replay: records the player's side of a match and plays it back later as an opponent.
   Timeline entries, all starting [kind, time in ms]:
     ['p', t, pieceIndex, x, y, rot, spinIndex, itemTile|0]  a piece locked ([x, y, id] when one of its cells became an item tile)
     ['k', t, x, y, rot]      where the falling piece is now
     ['g', t, [[rows, gapColumn], ...]]   cement that came up
     ['c', t, rows]  knock-down item   ['w', t]  level item   ['i', t, id]  any item used
     ['o', t]  knocked out   ['r', t]  back on its feet */
(function (root) {
  'use strict';
  var ZZ = root.ZZ || require('./engine.js');
  var TYPES = ZZ.TYPES, KEY = 'zhuanzhuan.rep.v1';
  var SPIN = ['none', 'mini', 'full', 'spin'];

  function Recorder(info) { this.info = info; this.ev = []; this.t = 0; this.tile = null; }
  Recorder.prototype.tick = function (dt) { this.t += dt; };
  Recorder.prototype.on = function (g, e) {
    var t = Math.round(this.t), ev = this.ev, last = ev[ev.length - 1];
    switch (e.type) {
      case 'move': case 'rotate': case 'fall':
        if (e.x == null) break;
        // a run of falls collapses into its last position
        if (e.type === 'fall' && last && last[0] === 'k' && last[5] && t - last[1] < 80) { last[1] = t; last[2] = e.x; last[3] = e.y; last[4] = e.rot; }
        else ev.push(e.type === 'fall' ? ['k', t, e.x, e.y, e.rot, 1] : ['k', t, e.x, e.y, e.rot]);
        break;
      case 'hold':
        // positions recorded so far belonged to the piece that just went into hold
        while (last && last[0] === 'k') { ev.pop(); last = ev[ev.length - 1]; }
        break;
      case 'itemtile': this.tile = [e.x, e.y, e.id]; break;
      case 'lock':
        ev.push(['p', t, TYPES.indexOf(e.piece), e.x, e.y, e.rot, SPIN.indexOf(e.tspin), this.tile || 0]);
        this.tile = null;
        break;
      case 'garbage': if (e.segs) ev.push(['g', t, e.segs]); break;
      case 'chisel': ev.push(['c', t, e.n || 3]); break;
      case 'trowel': ev.push(['w', t]); break;
      case 'topout': ev.push(['o', t]); break;
      case 'revive': ev.push(['r', t]); break;
    }
  };
  Recorder.prototype.item = function (id) { this.ev.push(['i', Math.round(this.t), id]); };
  Recorder.prototype.done = function (sum) {
    var ev = this.ev.map(function (e) { return e[0] === 'k' && e.length > 5 ? e.slice(0, 5) : e; });
    return { v: 1, rv: ZZ.RULES, at: Date.now(), info: this.info, sum: sum, ev: ev };
  };

  function queueOf(rep) {
    var q = [];
    for (var i = 0; i < rep.ev.length; i++) if (rep.ev[i][0] === 'p') q.push(TYPES[rep.ev[i][2]]);
    return q;
  }
  // The computer that steps in when a ghost can no longer follow its recording: same pace, a style to match the attack rate.
  function botCfg(sum) {
    var apm = (sum && sum.apm) || 10, lv = apm < 1.5 ? 5 : apm < 3.5 ? 6 : apm < 6 ? 0 : apm < 14 ? 1 : apm < 24 ? 2 : apm < 40 ? 3 : 4, L = ZZ.Bot.LEVELS[lv];
    return { pps: Math.max(0.4, Math.min(3, (sum && sum.pps) || L.pps)), depth: L.depth, hold: L.hold, noise: L.noise, w: L.w };
  }

  /* Ghost: drives a manual Game from a recording. The live player's cement goes underneath the recorded wall,
     so every recorded position is simply lifted by that many rows ("lift"). If the ghost is knocked out where the
     recording was not, the wall no longer matches and a computer player takes over at the recorded pace. */
  function Ghost(game, rep, o) {
    this.g = game; this.rep = rep; this.ev = rep.ev; this.i = 0; this.t = 0;
    this.lift = 0; this.sync = true; this.bot = null; this.plan = null; this.o = o || {};
  }
  Ghost.prototype.nextKind = function () {
    // cement recorded alongside a lock can sit between that lock and its knockout
    for (var j = this.i; j < this.ev.length; j++) { var k = this.ev[j][0]; if (k !== 'k' && k !== 'g') return k; }
    return '';
  };
  Ghost.prototype.update = function (dt) {
    var g = this.g;
    if (this.bot) { this.bot.update(dt); return; }
    if (g.over) return;
    this.t += dt;
    while (this.i < this.ev.length && this.ev[this.i][1] <= this.t) {
      this.apply(this.ev[this.i++]);
      if (g.over || this.bot) return;
    }
    if (this.i >= this.ev.length) this.takeOver();
  };
  Ghost.prototype.apply = function (e) {
    var g = this.g, c = g.cur, k = e[0], j;
    if (k === 'k') {
      if (c && g.fits(c.type, e[4], e[2], e[3] - this.lift)) { c.x = e[2]; c.y = e[3] - this.lift; c.rot = e[4]; }
    } else if (k === 'p') {
      this.place(e);
    } else if (k === 'g') {
      var n = 0;
      for (j = 0; j < e[2].length; j++) { g.pushGarbage(e[2][j][0], e[2][j][1], this.lift); n += e[2][j][0]; }
      g.refit();
      g.emit('garbage', { n: n });
    } else if (k === 'c') {
      g.chisel(e[2], this.lift);
    } else if (k === 'w') {
      g.trowel(this.lift);
    } else if (k === 'i') {
      if (this.o.onItem) this.o.onItem(e[2]);
    } else if (k === 'o') {
      if (!g.over) g.topOut('lock');
    }
  };
  Ghost.prototype.place = function (e) {
    var g = this.g, c = g.cur, type = TYPES[e[2]];
    if (!c) return;
    var x = e[3], y = e[4] - this.lift, rot = e[5];
    if (c.type !== type || !g.fits(type, rot, x, y) || g.fits(type, rot, x, y + 1)) { this.sync = false; this.takeOver(); return; }
    c.x = x; c.y = y; c.rot = rot;
    var from = g.events.length;
    g.lock({ tspin: SPIN[e[6]] || 'none', item: e[7] ? { x: e[7][0], y: e[7][1] - this.lift, id: e[7][2] } : null });
    // cement the live player sent lands inside lock(); it sits under everything recorded from now on
    for (var j = from; j < g.events.length; j++) if (g.events[j].type === 'garbage') this.lift += g.events[j].n;
    if (g.over && this.nextKind() !== 'o') this.sync = false;
  };
  Ghost.prototype.takeOver = function () {
    var g = this.g;
    g.fixedQueue = null;
    g.queue = [];
    g.bag = [];
    g.fill();
    if (!g.cur && !g.over) g.spawnNext();
    this.bot = new ZZ.Bot.BotPlayer(g, botCfg(this.rep.sum));
    if (this.o.onTakeOver) this.o.onTakeOver();
  };
  // Called after the match loop has stood the ghost back up.
  Ghost.prototype.onRevive = function () {
    this.lift = 0;
    if (this.bot) { this.bot.plan = null; return; }
    if (!this.sync) { this.takeOver(); return; }
    // the recording has the same pause in it: jump to where it got up
    var ev = this.ev, j, g = this.g, rest = [];
    for (j = this.i; j < ev.length; j++) {
      if (ev[j][0] === 'r') { this.t = Math.max(this.t, ev[j][1]); this.i = j + 1; break; }
      if (ev[j][0] === 'p') break;
    }
    // a knockout can swallow the piece that was about to spawn, so deal the remaining recorded pieces again
    for (j = this.i; j < ev.length; j++) if (ev[j][0] === 'p') rest.push(TYPES[ev[j][2]]);
    g.queue = rest;
    g.cur = null;
    g.spawnNext();
  };

  // ---------- storage ----------
  var mem = null;
  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function list() {
    if (mem) return mem;
    mem = [];
    try {
      var st = storage(), raw = st && st.getItem(KEY), d = raw ? JSON.parse(raw) : [];
      if (Array.isArray(d)) mem = d.filter(function (r) { return r && r.v === 1 && (r.rv || 1) === ZZ.RULES && Array.isArray(r.ev) && r.info && r.sum; });   // recordings made under other rules no longer line up
    } catch (e) { /* none kept */ }
    return mem;
  }
  function write() {
    var st = storage();
    if (!st) return;
    // drop the oldest until it fits
    for (var tries = 0; tries < 40; tries++) {
      try { st.setItem(KEY, JSON.stringify(mem)); return; } catch (e) { if (mem.length <= 1) return; mem.pop(); }
    }
  }
  function save(rep, cap) {
    list();
    mem.unshift(rep);
    while (mem.length > (cap || 5)) mem.pop();
    write();
    return true;
  }
  function remove(i) { list(); if (i >= 0 && i < mem.length) { mem.splice(i, 1); write(); } }
  function trim(cap) { list(); if (mem.length > cap) { mem.length = cap; write(); } }

  ZZ.Replay = { Recorder: Recorder, Ghost: Ghost, queueOf: queueOf, botCfg: botCfg, list: list, save: save, remove: remove, trim: trim, _reset: function () { mem = null; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
