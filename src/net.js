/* 轉磚 net: two players, device to device. One opens a room and gets a code; the other joins with it.
   The room is found through a PeerJS broker, then play data flows straight between the two browsers (WebRTC).
   Each side runs its own game. What crosses the wire: a picture of the wall after every change, the events the other
   screen needs for its effects, attack lines, item hits and a final tally. Nothing received is trusted: every field is checked.
   Test hooks in the page address: ?net=bc uses a BroadcastChannel instead of WebRTC, ?peer=host:port/path uses your own broker. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, TYPES = ZZ.TYPES, ROWS = ZZ.ROWS, COLS = ZZ.COLS;
  var CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', PREFIX = 'zhuanzhuan-v1-', LIB = 'vendor/peerjs.min.js';
  var Net = {
    state: 'idle',            // idle, opening, waiting, joining, ready, playing, error
    code: '', host: false, me: '', foe: '', err: '', cfg: { minutes: 2, items: false },
    wantAgain: false, foeAgain: false, onChange: null
  };
  var peer = null, link = null, dirty = false, urgent = false, acc = 0, foeEnd = null, endWait = null, joinT = 0;
  var qs = (function () { try { return new URLSearchParams(window.location.search); } catch (e) { return { get: function () { return null; } }; } })();

  function changed() { if (Net.onChange) Net.onChange(); }
  function setState(s) { Net.state = s; changed(); }
  function fail(kind) { Net.err = kind; shut(); setState('error'); }
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

  function wire(c) {
    link = c;
    c.on('open', function () {
      clearTimeout(joinT);
      send({ t: 'hello', v: 1, name: Net.me });
      if (Net.host) send({ t: 'cfg', minutes: Net.cfg.minutes, items: Net.cfg.items });
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
    Net.me = String(name || '').slice(0, 12); Net.host = host; Net.foe = ''; Net.err = ''; Net.code = '';
    Net.wantAgain = Net.foeAgain = false; foeEnd = null; endWait = null;
  }

  Net.open = function (name) {
    reset(name, true);
    setState('opening');
    loadLib(function (ok) {
      if (Net.state !== 'opening') return;
      if (!ok) return fail('lib');
      tryOpen(0);
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
    loadLib(function (ok) {
      if (Net.state !== 'joining') return;
      if (!ok) return fail('lib');
      joinT = setTimeout(function () { if (Net.state === 'joining') fail('room'); }, 14000);
      if (qs.get('net') === 'bc') return wire(new BcConn(code, false));
      try { peer = new window.Peer(peerOpts()); } catch (e) { return fail('server'); }
      peer.on('open', function () { wire(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })); });
      peer.on('error', function (e) { if (Net.state === 'joining') fail(e && e.type === 'peer-unavailable' ? 'room' : 'server'); });
    });
  };
  Net.leave = function () {
    send({ t: 'bye' });
    var st = link;
    setTimeout(function () { if (link === st) shut(); }, 150);
    Net.state = 'idle'; Net.err = '';
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
    setTimeout(function () { if (endWait === cb) { endWait = null; settle(cb); } }, 1500);
  };
  function dropped() {
    if (!link && !peer) return;
    var S = App.S(), mid = !!S && S.remote && (S.state === 'play' || S.state === 'count');
    shut();
    if (mid) { Net.state = 'idle'; App.endBattle('left'); return; }
    if (endWait) { var f = endWait; endWait = null; settle(f); }
    if (Net.state === 'ready' || Net.state === 'playing' || Net.state === 'waiting' || Net.state === 'joining') { Net.err = 'lost'; setState('error'); }
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

  ZZ.Net = Net;
})();
