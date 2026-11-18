/* 轉磚 net: two players, each on their own device. One opens a room and gets a code; the other joins with it.
   Each side runs its own game. What crosses the wire: a picture of the wall after every change, the events the other
   screen needs for its effects, attack lines, item hits and a final tally. Nothing received is trusted: every field is checked.

   How the two sides reach each other depends on where the page is served:
   - With the game's own API (Vercel): through /api/room. Each side posts its messages and collects the other's with
     plain HTTPS requests, a few times a second. It needs nothing but ordinary web access, so it works on any network.
   - On a plain static host: through a public PeerJS broker and a direct WebRTC link. No server of ours is involved,
     but it only works when that broker is up and the two networks let a direct link through.
   Test hooks in the page address: ?net=bc uses a BroadcastChannel, ?net=peer forces the PeerJS way,
   ?peer=host:port/path uses your own PeerJS broker. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, TYPES = ZZ.TYPES, ROWS = ZZ.ROWS, COLS = ZZ.COLS;
  var CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', PREFIX = 'zhuanzhuan-v1-', LIB = 'vendor/peerjs.min.js';
  var Net = {
    state: 'idle',            // idle, opening, waiting, joining, ready, playing, error
    code: '', host: false, me: '', foe: '', err: '', cfg: { minutes: 2, items: false },
    seated: false,            // joining through the relay: in the room, the host has not answered yet
    wantAgain: false, foeAgain: false, onChange: null
  };
  var peer = null, link = null, dirty = false, urgent = false, acc = 0, foeEnd = null, endWait = null, joinT = 0, epoch = 0, relayed = false;
  var qs = (function () { try { return new URLSearchParams(window.location.search); } catch (e) { return { get: function () { return null; } }; } })();

  function changed() { if (Net.onChange) Net.onChange(); }
  function setState(s) { Net.state = s; changed(); }
  function fail(kind) { Net.err = kind; Net.seated = false; shut(); setState('error'); }
  function int(v, lo, hi) { v = Math.round(+v); return v >= lo && v <= hi ? v : lo; }
  function shut() {
    clearTimeout(joinT);
    try { if (link) link.close(); } catch (e) { /* already gone */ }
    try { if (peer) peer.destroy(); } catch (e2) { /* already gone */ }
    link = null; peer = null;
  }
  function send(m) {
    if (!link) return;
    try { link.send(m); } catch (e) { /* the close handler deals with a dead link */ }
  }

  // ---------- transports ----------
  function loadLib(cb) {
    if (qs.get('net') === 'bc' || window.Peer) return cb(true);
    var s = document.createElement('script');
    s.src = LIB;
    s.onload = function () { cb(!!window.Peer); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function peerOpts() {
    var o = { debug: 0 }, p = qs.get('peer');
    if (p) {
      var m = /^([^:\/]+)(?::(\d+))?(\/.*)?$/.exec(p);
      if (m) { o.host = m[1]; o.port = +(m[2] || 9000); o.path = m[3] || '/'; o.secure = false; }
    }
    return o;
  }
  // Same-browser stand-in for a data connection, used by the automated two-page test.
  function BcConn(code, host) {
    var self = this;
    this.h = {}; this.open = false;
    this.ch = new BroadcastChannel(PREFIX + code);
    this.ch.onmessage = function (e) {
      var m = e.data || {};
      if (m.k === 'join' && host && !self.open) { self.ch.postMessage({ k: 'ok' }); self.fire('open'); }
      else if (m.k === 'ok' && !host && !self.open) self.fire('open');
      else if (m.k === 'd') self.fire('data', m.d);
      else if (m.k === 'close') self.fire('close');
    };
    if (!host) this.ch.postMessage({ k: 'join' });
  }
  BcConn.prototype.on = function (ev, fn) { this.h[ev] = fn; };
  BcConn.prototype.fire = function (ev, d) { if (ev === 'open') this.open = true; if (this.h[ev]) this.h[ev](d); };
  BcConn.prototype.send = function (d) { this.ch.postMessage({ k: 'd', d: d }); };
  BcConn.prototype.close = function () { try { this.ch.postMessage({ k: 'close' }); this.ch.close(); } catch (e) { /* closed */ } };

  // ---------- our own relay ----------
  function rpc(body, last) {
    var o = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', keepalive: !!last }, t = 0;
    if (typeof AbortController === 'function') { var ctl = new AbortController(); o.signal = ctl.signal; t = setTimeout(function () { ctl.abort(); }, 9000); }
    return window.fetch('api/room', o).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(t);
        var j = null;
        try { j = JSON.parse(text); } catch (e) { /* not ours */ }
        return { status: res.status, body: j && typeof j === 'object' ? j : null };
      });
    }, function (e) { clearTimeout(t); throw e; });
  }
  function seatKey() {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', buf = new Uint8Array(32), i;
    try { window.crypto.getRandomValues(buf); } catch (e) { for (i = 0; i < 32; i++) buf[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < 32; i++) s += abc[buf[i] % abc.length];
    return s;
  }
  // One seat in a room. Looks like a data connection to the rest of this file: on('open' | 'data' | 'close'), send, close.
  // Every message gets a number. A batch is offered again until the server has confirmed it, the server keeps each
  // number once, and what comes back is only taken in order, so nothing is lost or doubled when a request goes missing.
  function Relay(code, key, role) {
    this.code = code; this.key = key; this.role = role;
    this.h = {}; this.out = []; this.nOut = 0; this.ack = 0;
    this.open = false; this.dead = false; this.busy = false; this.fails = 0; this.t = 0; this.due = 0;
    this.heard = Date.now(); this.said = Date.now(); this.born = Date.now();
    this.pump(0);
  }
  // Until the other side has said anything at all it may simply not be looking: a host who is still in the chat app
  // where the code was sent. That gets more patience than silence from someone who was talking a moment ago.
  var QUIET = Net.QUIET = { play: 15000, lobby: 70000, first: 150000 };
  Relay.prototype.on = function (ev, fn) { this.h[ev] = fn; };
  Relay.prototype.fire = function (ev, d) { if (this.h[ev]) this.h[ev](d); };
  // how long to wait between rounds: quick while a match is on, relaxed in the lobby, slow while waiting alone
  Relay.prototype.pace = function () {
    if (Net.state === 'playing') return 110;
    if (this.open) return this.ack || Date.now() - this.heard < 10000 ? 500 : 1500;
    var waited = Date.now() - this.born;      // nobody has joined yet: look less often the longer the room sits open
    return waited < 120000 ? 1300 : waited < 600000 ? 2500 : 5000;
  };
  Relay.prototype.send = function (m) {
    if (this.dead) return;
    var last = this.out[this.out.length - 1];
    // only the newest picture of the wall is worth sending
    if (m && m.t === 's' && last && !last.s && last.m.t === 's') last.m = m;
    else this.out.push({ n: ++this.nOut, m: m });
    this.said = Date.now();
    this.pump(m && (m.t === 's' || m.t === 'e') ? 90 : 0);
  };
  Relay.prototype.pump = function (ms) {
    var self = this, at = Date.now() + ms;
    if (this.dead || this.busy) return;
    if (this.t && this.due <= at) return;      // an earlier round is already booked
    clearTimeout(this.t);
    this.due = at;
    this.t = setTimeout(function () { self.t = 0; self.round(false); }, ms);
  };
  Relay.prototype.round = function (last) {
    var self = this, batch = [], size = 0, i;
    if (this.dead || this.busy) return;
    // silence from the other side for too long means they are gone (a phone that went to sleep, a closed tab).
    // Say so on the way out: if they do come back they should not find a room that looks alive.
    if (this.open && Date.now() - this.heard > (Net.state === 'playing' ? QUIET.play : this.ack ? QUIET.lobby : QUIET.first)) {
      this.out.push({ n: ++this.nOut, m: { t: 'bye' } });
      this.finish();
      return this.fire('close');
    }
    if (this.open && Net.state !== 'playing' && Date.now() - this.said > 5000) { this.out.push({ n: ++this.nOut, m: { t: 'p' } }); this.said = Date.now(); }
    for (i = 0; i < this.out.length && batch.length < 60; i++) {
      var len = JSON.stringify(this.out[i].m).length;
      if (batch.length && size + len > 16000) break;
      size += len; this.out[i].s = 1;
      batch.push({ n: this.out[i].n, m: this.out[i].m });
    }
    var top = batch.length ? batch[batch.length - 1].n : 0, retry = function () {
      self.busy = false;
      if (self.dead) return;
      for (var k = 0; k < self.out.length; k++) delete self.out[k].s;
      if (++self.fails > 14) { self.dead = true; return self.fire('close'); }
      self.pump(Math.min(3000, 250 * self.fails));
    };
    this.busy = true;
    rpc({ a: 'x', code: this.code, key: this.key, role: this.role, ack: this.ack, out: batch }, last).then(function (r) {
      var b = r.body;
      if (self.dead) return;
      if (r.status === 404) { self.dead = true; return self.fire('close'); }      // the room is gone
      if (r.status !== 200 || !b || !b.ok) return retry();
      self.busy = false; self.fails = 0;
      self.out = self.out.filter(function (o) { return o.n > top; });
      if (b.paired && !self.open) { self.open = true; self.heard = Date.now(); self.fire('open'); }
      var got = Array.isArray(b.in) ? b.in : [], any = false;
      for (var k = 0; k < got.length && !self.dead; k++) {
        var it = got[k];
        if (!it || typeof it.n !== 'number' || it.n <= self.ack) continue;
        self.ack = it.n; self.heard = Date.now(); any = true;
        self.fire('data', it.m);
      }
      if (self.dead) return;
      self.pump(self.out.length || any ? Math.min(110, self.pace()) : self.pace());
    }, retry);
  };
  Relay.prototype.close = function () { this.finish(); };
  // The last word: hand over what is still waiting (the goodbye), then stop. When it is the host who leaves, the same
  // request takes the room down. It is a single request so that it still gets out while the page is closing.
  Relay.prototype.finish = function () {
    var rest = [], size = 0, i, len;
    if (this.dead) return;
    for (i = this.out.length - 1; i >= 0 && rest.length < 60; i--) {      // the newest first: the goodbye is the one that must arrive
      len = JSON.stringify(this.out[i].m).length;
      if (rest.length && size + len > 16000) break;
      size += len;
      rest.unshift({ n: this.out[i].n, m: this.out[i].m });
    }
    this.dead = true; this.out = [];
    clearTimeout(this.t); this.t = 0;
    if (!rest.length && this.role !== 0) return;
    rpc({ a: 'x', code: this.code, key: this.key, role: this.role, ack: this.ack, out: rest, end: true }, true).then(null, function () { /* the room runs out by itself */ });
  };
  function transport(cb) {
    var mode = qs.get('net'), C = ZZ.Cloud;
    if (mode === 'bc') return cb('bc');
    if (mode === 'peer' || qs.get('peer') || !C || !C.whenKnown) return cb('peer');
    var go = function (hosted) { cb(hosted ? 'relay' : 'peer'); };
    // written off because nothing answered when the page loaded? Look once more before settling for the public broker:
    // two friends must not end up on different sides
    if (C.dead && C.unsure && C.recheck) return C.recheck().then(go, function () { go(false); });
    C.whenKnown(go);
  }

  function wire(c) {
    link = c;
    c.on('open', function () {
      clearTimeout(joinT);
      send({ t: 'hello', v: 1, name: Net.me });
      if (Net.host) send({ t: 'cfg', minutes: Net.cfg.minutes, items: Net.cfg.items });
      else if (relayed && Net.state === 'joining') { Net.seated = true; changed(); }
    });
    c.on('data', onMsg);
    c.on('close', dropped);
    c.on('error', dropped);
  }
  function newCode() {
    var s = '';
    for (var i = 0; i < 5; i++) s += CODE.charAt(Math.floor(Math.random() * CODE.length));
    return s;
  }
  function reset(name, host) {
    shut();
    Net.me = String(name || '').slice(0, 12); Net.host = host; Net.foe = ''; Net.err = ''; Net.code = ''; Net.seated = false;
    Net.wantAgain = Net.foeAgain = false; foeEnd = null; endWait = null; relayed = false;
    epoch++;
  }

  Net.open = function (name) {
    reset(name, true);
    setState('opening');
    var run = epoch;
    transport(function (kind) {
      if (run !== epoch || Net.state !== 'opening') return;
      if (kind === 'relay') {
        var key = seatKey();
        relayed = true;
        return rpc({ a: 'open', key: key }).then(function (r) {
          if (run !== epoch || Net.state !== 'opening') return;
          if (r.status !== 200 || !r.body || !r.body.ok || !r.body.code) return fail(r.status === 429 ? 'slow' : 'server');
          Net.code = String(r.body.code);
          wire(new Relay(Net.code, key, 0));
          setState('waiting');
        }, function () { if (run === epoch && Net.state === 'opening') fail('server'); });
      }
      loadLib(function (ok) {
        if (run !== epoch || Net.state !== 'opening') return;
        if (!ok) return fail('lib');
        tryOpen(0);
      });
    });
  };
  function tryOpen(n) {
    Net.code = newCode();
    if (qs.get('net') === 'bc') {
      if (qs.get('code')) Net.code = String(qs.get('code')).toUpperCase();
      wire(new BcConn(Net.code, true));
      return setState('waiting');
    }
    try { peer = new window.Peer(PREFIX + Net.code, peerOpts()); } catch (e) { return fail('server'); }
    peer.on('open', function () { if (Net.state === 'opening') setState('waiting'); });
    peer.on('connection', function (c) {
      if (link) {      // a third player knocked: tell them and hang up
        c.on('open', function () { try { c.send({ t: 'full' }); } catch (e) { /* gone */ } setTimeout(function () { try { c.close(); } catch (e2) { /* gone */ } }, 400); });
        return;
      }
      wire(c);
    });
    peer.on('error', function (e) {
      if (e && e.type === 'unavailable-id' && n < 4) { try { peer.destroy(); } catch (x) { /* gone */ } return tryOpen(n + 1); }
      if (!link && (Net.state === 'opening' || Net.state === 'waiting')) fail('server');
    });
  }
  Net.join = function (code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    reset(name, false);
    Net.code = code;
    if (code.length !== 5) { Net.err = 'room'; return setState('error'); }
    setState('joining');
    var run = epoch;
    transport(function (kind) {
      if (run !== epoch || Net.state !== 'joining') return;
      if (kind === 'relay') {
        var key = seatKey();
        relayed = true;
        joinT = setTimeout(function () { if (run === epoch && Net.state === 'joining') fail('server'); }, 20000);
        return rpc({ a: 'join', code: code, key: key }).then(function (r) {
          if (run !== epoch || Net.state !== 'joining') return;
          if (r.status !== 200 || !r.body || !r.body.ok) return fail(r.status === 404 ? 'room' : r.status === 409 ? 'full' : r.status === 429 ? 'slow' : 'server');
          wire(new Relay(code, key, 1));
        }, function () { if (run === epoch && Net.state === 'joining') fail('server'); });
      }
      loadLib(function (ok) {
        if (run !== epoch || Net.state !== 'joining') return;
        if (!ok) return fail('lib');
        joinT = setTimeout(function () { if (Net.state === 'joining') fail('room'); }, 14000);
        if (qs.get('net') === 'bc') return wire(new BcConn(code, false));
        try { peer = new window.Peer(peerOpts()); } catch (e) { return fail('server'); }
        peer.on('open', function () { wire(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })); });
        peer.on('error', function (e) { if (Net.state === 'joining') fail(e && e.type === 'peer-unavailable' ? 'room' : 'server'); });
      });
    });
  };
  Net.leave = function () {
    send({ t: 'bye' });
    var st = link;
    setTimeout(function () { if (link === st) shut(); }, 150);
    Net.state = 'idle'; Net.err = ''; Net.seated = false;
    changed();
  };
  Net.setCfg = function (c) {
    if (!Net.host) return;
    Net.cfg = { minutes: int(c.minutes, 1, 3), items: !!c.items };
    send({ t: 'cfg', minutes: Net.cfg.minutes, items: Net.cfg.items });
    changed();
  };

  // ---------- match ----------
  function startMatch(seed, minutes, items) {
    Net.state = 'playing';
    Net.wantAgain = Net.foeAgain = false; foeEnd = null; endWait = null; dirty = true; urgent = true; acc = 0;
    App.begin('battle', { mode: 'net', seed: seed >>> 0, minutes: int(minutes, 1, 3), items: !!items, oppName: Net.foe || ZZ.L.t('foe') });
  }
  Net.start = function () {
    if (!Net.host || !link || (Net.state !== 'ready' && Net.state !== 'playing')) return;
    var seed = (Math.random() * 4294967296) >>> 0;
    send({ t: 'start', seed: seed, minutes: Net.cfg.minutes, items: Net.cfg.items });
    startMatch(seed, Net.cfg.minutes, Net.cfg.items);
  };
  Net.again = function () {
    Net.wantAgain = true;
    send({ t: 'again' });
    if (Net.host && Net.foeAgain) Net.start(); else changed();
  };
  Net.attack = function (n) { send({ t: 'a', n: n }); };
  Net.item = function (id) { send({ t: 'i', id: id }); };

  function pack(g) {
    var first = ROWS, r, x, s = '', items = [], c = g.cur, st = g.stats;
    for (r = 0; r < ROWS && first === ROWS; r++) for (x = 0; x < COLS; x++) if (g.grid[r][x]) { first = r; break; }
    for (r = first; r < ROWS; r++) for (x = 0; x < COLS; x++) {
      var v = g.grid[r][x];
      s += (v & 15).toString(16);
      if (v >> 4) items.push([x, r, v >> 4]);
    }
    return { t: 's', f: first, g: s, it: items, c: c ? [TYPES.indexOf(c.type), c.x, c.y, c.rot] : 0, p: g.pendingTotal(),
      st: [st.sent, st.score, st.lines, st.pieces, st.attack], sh: g.shield > 0 ? 1 : 0, ov: g.over ? 1 : 0 };
  }
  // Paints the other player's wall onto our stand-in game.
  function mirror(m) {
    var S = App.S();
    if (!S || !S.remote) return;
    var g = S.opp, first = int(m.f, 0, ROWS), s = String(m.g || ''), r, x, i;
    if (s.length !== (ROWS - first) * COLS) return;
    for (r = 0; r < ROWS; r++) {
      var row = g.grid[r];
      for (x = 0; x < COLS; x++) {
        var v = r < first ? 0 : parseInt(s.charAt((r - first) * COLS + x), 16);
        row[x] = v >= 0 && v <= 8 ? v : 0;
      }
    }
    if (Array.isArray(m.it)) for (i = 0; i < m.it.length && i < 40; i++) {
      var it = m.it[i];
      if (Array.isArray(it) && it[0] >= 0 && it[0] < COLS && it[1] >= 0 && it[1] < ROWS && it[2] >= 1 && it[2] <= 7 && g.grid[it[1] | 0][it[0] | 0]) g.grid[it[1] | 0][it[0] | 0] |= (it[2] | 0) << 4;
    }
    var c = m.c;
    g.cur = Array.isArray(c) && TYPES[c[0]] ? { type: TYPES[c[0]], x: int(c[1], -3, COLS), y: int(c[2], 0, ROWS - 1), rot: int(c[3], 0, 3) } : null;
    var p = int(m.p, 0, 60);
    g.pending = p ? [{ n: p, col: 0, t: 0 }] : [];
    if (Array.isArray(m.st)) {
      g.stats.sent = int(m.st[0], 0, 99999); g.stats.score = int(m.st[1], 0, 99999999); g.stats.lines = int(m.st[2], 0, 99999);
      g.stats.pieces = int(m.st[3], 0, 99999); g.stats.attack = int(m.st[4], 0, 99999);
    }
    g.shield = m.sh ? 1000 : 0;
    g.over = !!m.ov;
  }
  function cellList(a, max) {
    var out = [];
    if (Array.isArray(a)) for (var i = 0; i < a.length && i < max; i++) if (Array.isArray(a[i])) out.push([int(a[i][0], 0, COLS - 1), int(a[i][1], 0, ROWS - 1)]);
    return out;
  }
  function rowList(a) {
    var out = [];
    if (Array.isArray(a)) for (var i = 0; i < a.length && i < 4; i++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(Array.isArray(a[i]) ? int(a[i][x], 0, 127) : 0);
      out.push(row);
    }
    return out;
  }
  // An effect event from the other side, rebuilt field by field before it goes to the screen.
  function foeEvent(e) {
    var S = App.S();
    if (!S || !S.remote || S.state !== 'play' || !e) return;
    var ty = e.type, o = null, SPINS = { none: 1, mini: 1, full: 1, spin: 1 };
    if (ty === 'lock') {
      var rows = [];
      if (Array.isArray(e.rows)) for (var i = 0; i < e.rows.length && i < 4; i++) rows.push(int(e.rows[i], 0, ROWS - 1));
      var colors = rowList(e.rowColors);
      if (colors.length !== rows.length) { rows = []; colors = []; }
      o = { type: 'lock', piece: TYPES[int(e.piece, 0, 6)], cells: cellList(e.cells, 4), tspin: SPINS[e.tspin] ? e.tspin : 'none', lines: rows.length, rows: rows, rowColors: colors,
        attack: int(e.attack, 0, 99), b2b: !!e.b2b, combo: int(e.combo, -1, 99), perfect: !!e.perfect };
      if (o.cells.length !== 4) return;
    } else if (ty === 'harddrop') {
      o = { type: 'harddrop', n: int(e.n, 0, ROWS), x: int(e.x, -3, COLS), y: int(e.y, 0, ROWS - 1), rot: int(e.rot, 0, 3), piece: TYPES[int(e.piece, 0, 6)] };
    } else if (ty === 'garbage') {
      o = { type: 'garbage', n: int(e.n, 0, 40) };
    } else if (ty === 'topout' || ty === 'revive' || ty === 'trowel') {
      o = { type: ty };
    } else if (ty === 'chisel') {
      o = { type: 'chisel', rows: rowList(e.rows) };
    }
    if (o) S.opp.events.push(o);
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    var S = App.S(), live = !!S && S.remote && S.state === 'play';
    switch (m.t) {
      case 'hello':
        // answer once, in case our own greeting went out before the other side was listening
        if (!m.ack) { send({ t: 'hello', v: 1, name: Net.me, ack: 1 }); if (Net.host) send({ t: 'cfg', minutes: Net.cfg.minutes, items: Net.cfg.items }); }
        Net.foe = String(m.name || '').replace(/[<>&"]/g, '').slice(0, 12);
        Net.seated = false;
        if (Net.state !== 'playing') setState('ready'); else changed();
        break;
      case 'full': fail('full'); break;
      case 'cfg': if (!Net.host) { Net.cfg = { minutes: int(m.minutes, 1, 3), items: !!m.items }; changed(); } break;
      case 'start': if (!Net.host && link) startMatch(+m.seed || 1, m.minutes, m.items); break;
      case 's': mirror(m); break;
      case 'e': foeEvent(m.e); break;
      case 'a': if (live) S.me.receive(int(m.n, 0, 40)); break;
      case 'i': if (live) App.foeItem(int(m.id, 1, 7)); break;
      case 'end':
        foeEnd = { downs: int(m.downs, 0, 99), sent: int(m.sent, 0, 99999), score: int(m.score, 0, 99999999) };
        if (live) App.endBattle('');
        else if (endWait) { var f = endWait; endWait = null; settle(f); }
        break;
      case 'again': Net.foeAgain = true; if (Net.host && Net.wantAgain) Net.start(); else changed(); break;
      case 'bye': dropped(); break;
    }
  }
  function settle(cb) {
    var S = App.S();
    if (S && S.remote && foeEnd) { S.ko.me = foeEnd.downs; S.opp.stats.sent = foeEnd.sent; S.opp.stats.score = foeEnd.score; }
    cb();
  }
  // Called when our clock runs out: tell the other side our tally, then wait a moment for theirs.
  Net.finish = function (cb) {
    var S = App.S();
    Net.state = 'ready';
    send(pack(S.me));
    send({ t: 'end', downs: S.ko.opp, sent: S.me.stats.sent, score: S.me.stats.score });
    if (foeEnd) return settle(cb);
    endWait = cb;
    // through the relay the other side's tally takes a little longer to arrive
    setTimeout(function () { if (endWait === cb) { endWait = null; settle(cb); } }, relayed ? 4000 : 1500);
  };
  function dropped() {
    if (!link && !peer) return;
    var S = App.S(), mid = !!S && S.remote && (S.state === 'play' || S.state === 'count');
    shut();
    if (mid) { Net.state = 'idle'; App.endBattle('left'); return; }
    if (endWait) { var f = endWait; endWait = null; settle(f); }
    if (Net.state === 'ready' || Net.state === 'playing' || Net.state === 'waiting' || Net.state === 'joining') {
      Net.err = Net.state === 'joining' && Net.seated ? 'host' : 'lost';      // in the room, but the host never answered
      Net.seated = false;
      setState('error');
    }
  }

  // every event of our own game: mark the wall as changed and pass on what the other screen needs for its effects
  App.taps.push(function (g, e) {
    var S = App.S();
    if (!S || !S.remote || !link) return;
    dirty = true;
    var ty = e.type, flat = function (rows) { return rows.map(function (r) { return Array.prototype.slice.call(r); }); };
    if (ty === 'lock') {
      urgent = true;
      send({ t: 'e', e: { type: 'lock', piece: TYPES.indexOf(e.piece), cells: e.cells, tspin: e.tspin, rows: e.rows, rowColors: flat(e.rowColors), attack: e.attack, b2b: e.b2b, combo: e.combo, perfect: e.perfect } });
    } else if (ty === 'harddrop') {
      send({ t: 'e', e: { type: 'harddrop', n: e.n, x: e.x, y: e.y, rot: e.rot, piece: TYPES.indexOf(e.piece) } });
    } else if (ty === 'garbage') {
      urgent = true;
      send({ t: 'e', e: { type: 'garbage', n: e.n } });
    } else if (ty === 'topout' || ty === 'revive' || ty === 'trowel') {
      urgent = true;
      send({ t: 'e', e: { type: ty } });
    } else if (ty === 'chisel') {
      urgent = true;
      send({ t: 'e', e: { type: 'chisel', rows: flat(e.rows) } });
    }
  });
  Net.tick = function (dt) {
    var S = App.S();
    acc += dt;
    if (!link || !S || !(dirty || acc > 500) || !(urgent || acc >= 66)) return;
    acc = 0; dirty = urgent = false;
    send(pack(S.me));
  };
  Net.link = function () { return !!link; };
  Net.relayed = function () { return relayed; };
  // back from the background: catch up at once instead of waiting for the next round
  document.addEventListener('visibilitychange', function () { if (!document.hidden && link && link.pump && !link.dead) link.pump(0); });
  // The page is being closed or left: say goodbye now. The other side is told at once and, for a host, the room code
  // stops working, instead of a room that looks open with nobody in it.
  window.addEventListener('pagehide', function () {
    if (!link) return;
    send({ t: 'bye' });
    shut();
    Net.state = 'idle'; Net.err = ''; Net.seated = false;
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) changed(); });      // brought back by the back button: show where things stand

  ZZ.Net = Net;
})();
