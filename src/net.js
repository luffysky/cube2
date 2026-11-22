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
    state: 'idle',            // idle, opening, waiting, joining, matching, ready, playing, error
    code: '', host: false, me: '', foe: '', err: '', cfg: { minutes: 2, items: false },
    seated: false,            // joining through the relay: in the room, the host has not answered yet
    wantAgain: false, foeAgain: false, onChange: null,
    matched: false,           // this room came from random matchmaking: the match starts by itself
    quickSince: 0, onNoOne: null      // onNoOne(): nobody turned up in time (the page then offers a computer)
  };
  var quickT = 0, quickTries = 0;
  Net.QUICK_WAIT = 20000;
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
  // to: one seat (only the game's own relay can address one; the other ways have just two people anyway)
  function send(m, to) {
    if (!link) return;
    try { if (typeof to === 'number' && relayed) link.send(m, to); else link.send(m); } catch (e) { /* the close handler deals with a dead link */ }
  }
  // ---------- who is in the room ----------
  // peers: everybody else, by seat. A room for more than two only exists through the game's own relay; over a
  // direct link there is exactly one other person, whose seat is simply "the other one".
  Net.seat = 0; Net.peers = {}; Net.SEATS = 8;
  // the size of room the host picks (4, 6 or 8), and the size of the room we are in
  Net.size = 4; Net.cap = 4;
  // a team match needs an even room of four or more: 2 v 2, 3 v 3, 4 v 4
  Net.teamOk = function (n) { return n >= 4 && n % 2 === 0; };
  function peerList() { return Object.keys(Net.peers).map(Number).sort(function (a, b) { return a - b; }); }
  Net.count = function () { return 1 + peerList().length; };
  Net.roster = function () { return [Net.seat].concat(peerList()).sort(function (a, b) { return a - b; }).map(function (s) { var p = s === Net.seat ? null : Net.peers[s]; return { seat: s, name: p ? p.name : Net.me, me: !p, lv: p ? p.lv : ZZ.Meta.level().lv, tt: p ? p.tt : ZZ.Meta.titleNow(), dev: p ? p.dev || '' : Net.devNow() }; }); };
  // the first other player's device ('pc', 'phone', 'tablet' or '' from an older page)
  Net.foeDev = function () { var l = peerList(); return l.length ? Net.peers[l[0]].dev || '' : ''; };
  // who I am, for the others' room list: name, level and the title on show
  // what this player plays on: 'pc' (a keyboard), 'phone' or 'tablet' (a touch screen big enough to be one)
  Net.devNow = function () {
    var touch = !!(App.env && App.env.touch), s = window.screen || {}, small = Math.min(s.width || 0, s.height || 0);
    return !touch ? 'pc' : small >= 600 ? 'tablet' : 'phone';
  };
  function devGroup() { return Net.devNow() === 'pc' ? 'pc' : 'touch'; }
  function hello(ack) {
    var M = ZZ.Meta, o = { t: 'hello', v: 1, name: Net.me, dev: Net.devNow() };
    try { o.lv = M.level().lv; o.tt = M.titleNow(); } catch (e) { /* the list just shows the name */ }
    if (ack) o.ack = 1;
    return o;
  }
  function firstName() { var l = peerList(); return l.length ? Net.peers[l[0]].name : ''; }

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
  function Relay(code, key, seat) {
    this.code = code; this.key = key; this.seat = seat;
    this.h = {}; this.out = []; this.nOut = 0; this.acks = [0, 0, 0, 0, 0, 0, 0, 0]; this.ack = 0;      // ack: has anybody said anything yet
    this.seats = 1; this.near = 0;
    this.ws = null; this.wsUp = false; this.wsTries = 0; this.wsT = 0; this.wsWait = {}; this.wsN = 0;
    this.pc = null; this.dc = null; this.dcUp = false; this.dcBuf = {}; this.rtcTries = 0;
    this.open = false; this.dead = false; this.busy = false; this.fails = 0; this.t = 0; this.due = 0;
    this.heard = Date.now(); this.said = Date.now(); this.born = Date.now();
    this.pump(0);
  }
  // Until the other side has said anything at all it may simply not be looking: a host who is still in the chat app
  // where the code was sent. That gets more patience than silence from someone who was talking a moment ago.
  var QUIET = Net.QUIET = { play: 15000, lobby: 70000, first: 150000 };
  Relay.prototype.on = function (ev, fn) { this.h[ev] = fn; };
  Relay.prototype.fire = function (ev, d, from) { if (this.h[ev]) this.h[ev](d, from); };
  // how long to wait between rounds: quick while a match is on, relaxed in the lobby, slow while waiting alone
  Relay.prototype.pace = function () {
    // with everyone else on the same machine as this socket, their letters are pushed here the moment they are
    // written, and the rounds are only a safety net
    // a direct line to the other player carries the match; the rounds only back it up (and pass on the acks)
    if (Net.state === 'playing') return this.dcUp ? 1500 : this.wsUp && this.near >= this.seats - 1 ? 450 : 110;
    if (this.open) return this.ack || Date.now() - this.heard < 10000 ? 500 : 1500;
    var waited = Date.now() - this.born;      // nobody has joined yet: look less often the longer the room sits open
    return waited < 120000 ? 1300 : waited < 600000 ? 2500 : 5000;
  };
  // to: one seat, or nothing for everybody else in the room
  Relay.prototype.send = function (m, to) {
    if (this.dead) return;
    var last = this.out[this.out.length - 1], one = { n: 0, m: m };
    if (typeof to === 'number') one.to = to;
    // only the newest picture of the wall is worth sending
    // (not with a direct line: each picture goes down it at once, under its own number)
    if (m && m.t === 's' && last && !last.s && last.m.t === 's' && last.to === one.to && !this.dcUp) last.m = m;
    else { one.n = ++this.nOut; this.out.push(one); }
    this.said = Date.now();
    if (this.dcUp && one.n && one.to === undefined) {
      try { this.dc.send(JSON.stringify({ n: one.n, m: m })); return this.pump(this.pace()); } catch (e) { this.rtcDown(); }
    }
    this.pump(m && (m.t === 's' || m.t === 'e') ? (this.wsUp ? 30 : 90) : 0);
  };
  // ---------- the open socket (when the server offers one): the same rounds without a new request each time ----------
  Relay.prototype.wsOpen = function () {
    var self = this, loc = window.location, sock;
    if (this.dead || this.ws || this.wsTries > 4 || typeof window.WebSocket !== 'function' || qs.get('ws') === 'off' || !/^https?:$/.test(loc.protocol)) return;
    try { sock = new window.WebSocket((loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host + loc.pathname.replace(/[^\/]*$/, '') + 'api/ws'); } catch (e) { this.wsTries = 9; return; }
    this.ws = sock; this.wsTries++;
    sock.onopen = function () { if (self.ws !== sock) return; self.wsUp = true; self.wsTries = 0; self.pump(0); if (link === self) changed(); };
    sock.onmessage = function (ev) {
      var f = null, w, k, it;
      if (self.ws !== sock || self.dead) return;
      try { f = JSON.parse(ev.data); } catch (e) { return; }
      if (!f || typeof f !== 'object') return;
      if (f.i && (w = self.wsWait[f.i])) { delete self.wsWait[f.i]; clearTimeout(w.t); w.yes({ status: f.s, body: f.b && typeof f.b === 'object' ? f.b : null }); }
      else if (Array.isArray(f.p)) {
        // handed over directly: fine if it is the very next letter from that seat, otherwise fetch the usual way
        for (k = 0; k < f.p.length && !self.dead; k++) {
          it = f.p[k];
          if (!it || typeof it.n !== 'number' || !(it.f >= 0 && it.f < Net.SEATS) || it.f === self.seat) continue;
          if (it.n === self.acks[it.f] + 1) self.take(it); else if (it.n > self.acks[it.f]) self.pump(0);
        }
      }
    };
    sock.onclose = sock.onerror = function (ev) {
      if (self.ws !== sock) return;
      self.wsWhy = (ev && ev.type || '') + ' ' + (ev && ev.code || '') + ' up=' + (self.wsUp ? 1 : 0);
      self.ws = null; self.wsUp = false;
      for (var i in self.wsWait) { clearTimeout(self.wsWait[i].t); self.wsWait[i].no(new Error('socket')); }
      self.wsWait = {};
      try { sock.close(); } catch (e) { /* closed */ }
      if (self.dead) return;
      // sockets are cut every few minutes by design; plain requests carry the match meanwhile
      clearTimeout(self.wsT);
      self.wsT = setTimeout(function () { self.wsOpen(); }, Math.min(15000, 400 * Math.pow(2, self.wsTries)));
    };
  };
  Relay.prototype.wsShut = function () {
    var sock = this.ws;
    clearTimeout(this.wsT); this.ws = null; this.wsUp = false;
    if (sock) { sock.onclose = sock.onerror = sock.onmessage = null; try { sock.close(); } catch (e) { /* closed */ } }
  };
  Relay.prototype.take = function (it) {
    this.acks[it.f] = it.n; this.ack = 1; this.heard = Date.now();
    if (it.m && it.m.t === '$rtc') this.rtcSignal(it.m);      // setting up the direct line: not for the game
    else this.fire('data', it.m, it.f);
    // letters that came down the direct line ahead of this one
    var nx;
    while ((nx = this.dcBuf[this.acks[it.f] + 1]) && !this.dead) { delete this.dcBuf[this.acks[it.f] + 1]; this.take(nx); }
  };
  // ---------- the direct line (WebRTC), two players only ----------
  // Once both are in, the host offers a data channel; the offer, the answer and the network addresses travel as
  // ordinary letters through the room ('$rtc'). When the channel opens, every letter also goes straight down it under
  // its usual number, and the receiver takes each number once, in order, whichever way it came first. The room's rounds
  // carry on slowly underneath, so nothing is lost if the line drops (phones on mobile networks often cannot connect
  // directly at all: then the room simply does all the work, as before). ?rtc=off leaves it out.
  var ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  Relay.prototype.rtcStart = function () {
    // only between friends (a room opened with a code): a direct line shows each side the other's network address, which
    // strangers from random matching should not get
    if (this.pc || this.dead || Net.matched || this.seats !== 2 || this.seat !== 0 || this.rtcTries > 1 || qs.get('rtc') === 'off' || typeof window.RTCPeerConnection !== 'function') return;
    this.rtcTries++;
    var self = this, pc = this.rtcMake();
    if (!pc) return;
    this.rtcChannel(pc.createDataChannel('zz', { ordered: true }));
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
      if (self.pc === pc) self.send({ t: '$rtc', k: 'offer', d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    }).then(null, function () { self.rtcDown(); });
  };
  Relay.prototype.rtcMake = function () {
    var self = this, pc;
    try { pc = new window.RTCPeerConnection({ iceServers: ICE }); } catch (e) { return null; }
    this.pc = pc;
    pc.onicecandidate = function (e) { if (self.pc === pc && e.candidate) self.send({ t: '$rtc', k: 'ice', d: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.onconnectionstatechange = function () { if (self.pc === pc && /failed|closed/.test(pc.connectionState)) self.rtcDown(); };
    pc.ondatachannel = function (e) { if (self.pc === pc) self.rtcChannel(e.channel); };
    // a line that has not opened within 12 seconds is not going to: leave it to the room
    setTimeout(function () { if (self.pc === pc && !self.dcUp) self.rtcDown(); }, 12000);
    return pc;
  };
  Relay.prototype.rtcChannel = function (dc) {
    var self = this;
    this.dc = dc;
    dc.onopen = function () { if (self.dc !== dc) return; self.dcUp = true; if (link === self) changed(); };
    dc.onclose = function () { if (self.dc === dc) self.rtcDown(); };
    dc.onmessage = function (e) {
      var f = 1 - self.seat, it = null;
      if (self.dc !== dc || self.dead) return;
      try { it = JSON.parse(e.data); } catch (er) { return; }
      if (!it || typeof it.n !== 'number' || it.n <= self.acks[f]) return;
      it.f = f;
      if (it.n === self.acks[f] + 1) self.take(it);
      else { self.dcBuf[it.n] = it; self.pump(0); }      // an earlier letter is still on its way through the room
    };
  };
  Relay.prototype.rtcSignal = function (m) {
    var self = this, pc = this.pc;
    if (this.dead || Net.matched || qs.get('rtc') === 'off' || typeof window.RTCPeerConnection !== 'function' || !m.d || typeof m.d !== 'object') return;
    if (m.k === 'offer' && this.seat !== 0) {
      if (pc) { try { pc.close(); } catch (e) { /* gone */ } }
      pc = this.rtcMake();
      if (!pc) return;
      pc.setRemoteDescription(m.d).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () {
        if (self.pc === pc) self.send({ t: '$rtc', k: 'answer', d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }).then(null, function () { self.rtcDown(); });
    } else if (m.k === 'answer' && pc && this.seat === 0) pc.setRemoteDescription(m.d).then(null, function () { self.rtcDown(); });
    else if (m.k === 'ice' && pc) pc.addIceCandidate(m.d).then(null, function () { /* one address fewer */ });
  };
  Relay.prototype.rtcDown = function () {
    var pc = this.pc, dc = this.dc, was = this.dcUp;
    this.pc = null; this.dc = null; this.dcUp = false;
    try { if (dc) dc.close(); } catch (e) { /* gone */ }
    try { if (pc) pc.close(); } catch (e2) { /* gone */ }
    if (!this.dead) this.pump(0);
    if (was && link === this) changed();
  };
  // one round, over the socket when it is up
  Relay.prototype.xchg = function (body, last) {
    var self = this, sock = this.ws;
    if (last || !this.wsUp || !sock || sock.readyState !== 1) return rpc(body, last);
    return new Promise(function (yes, no) {
      var i = ++self.wsN;
      body.i = i;
      self.wsWait[i] = { yes: yes, no: no, t: setTimeout(function () { delete self.wsWait[i]; no(new Error('slow')); if (self.ws === sock) { try { sock.close(); } catch (e) { /* closed */ } sock.onclose(); } }, 4000) };
      try { sock.send(JSON.stringify(body)); } catch (e) { clearTimeout(self.wsWait[i].t); delete self.wsWait[i]; no(e); }
    });
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
      var one = { n: this.out[i].n, m: this.out[i].m };
      if (this.out[i].to !== undefined) one.to = this.out[i].to;
      batch.push(one);
    }
    var top = batch.length ? batch[batch.length - 1].n : 0, retry = function () {
      self.busy = false;
      if (self.dead) return;
      for (var k = 0; k < self.out.length; k++) delete self.out[k].s;
      if (++self.fails > 14) { self.dead = true; self.wsShut(); return self.fire('close'); }
      self.pump(Math.min(3000, 250 * self.fails));
    };
    this.busy = true;
    this.xchg({ a: 'x', code: this.code, key: this.key, seat: this.seat, acks: this.acks.slice(), out: batch }, last).then(function (r) {
      var b = r.body;
      if (self.dead) return;
      if (r.status === 404) { self.dead = true; self.wsShut(); return self.fire('close'); }      // the room is gone
      if (r.status !== 200 || !b || !b.ok) return retry();
      self.busy = false; self.fails = 0;
      self.out = self.out.filter(function (o) { return o.n > top; });
      self.near = b.near || 0;
      var seats = b.seats || (b.paired ? 2 : 1), grew = seats !== self.seats;
      self.seats = seats;
      if (seats > 1 && !self.open) { self.open = true; self.heard = Date.now(); self.wsOpen(); self.fire('open'); self.rtcStart(); }
      else if (grew) self.fire('seats', seats);
      var got = Array.isArray(b.in) ? b.in : [], any = false;
      for (var k = 0; k < got.length && !self.dead; k++) {
        var it = got[k], f = it && typeof it.f === 'number' ? it.f : 1 - self.seat;
        if (!it || typeof it.n !== 'number' || !(f >= 0 && f < Net.SEATS) || it.n <= self.acks[f]) continue;
        it.f = f; any = true;
        self.take(it);
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
      var o = { n: this.out[i].n, m: this.out[i].m };
      if (this.out[i].to !== undefined) o.to = this.out[i].to;
      rest.unshift(o);
    }
    this.dead = true; this.out = [];
    clearTimeout(this.t); this.t = 0;
    this.wsShut();
    this.rtcDown();
    if (!rest.length && this.seat !== 0) return;
    rpc({ a: 'x', code: this.code, key: this.key, seat: this.seat, acks: this.acks.slice(), out: rest, end: true }, true).then(null, function () { /* the room runs out by itself */ });
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
      send(hello(0));
      if (Net.host) send(cfgMsg());
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
    Net.matched = false; clearInterval(quickT); quickT = 0;
    Net.seat = host ? 0 : 1; Net.peers = {}; Net.cfg.team = false; Net.cfg.wx = false; Net.cfg.mode = 'battle'; Net.pool = '';
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
        return rpc({ a: 'open', key: key, cap: [4, 6, 8].indexOf(Net.size) >= 0 ? Net.size : 4 }).then(function (r) {
          if (run !== epoch || Net.state !== 'opening') return;
          if (r.status !== 200 || !r.body || !r.body.ok || !r.body.code) return fail(r.status === 429 ? 'slow' : 'server');
          Net.code = String(r.body.code); Net.cap = r.body.cap >= 2 && r.body.cap <= Net.SEATS ? r.body.cap : Net.size;
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
          Net.seat = r.body.seat >= 1 && r.body.seat < Net.SEATS ? r.body.seat : 1;
          if (r.body.cap >= 2 && r.body.cap <= Net.SEATS) Net.cap = r.body.cap;
          wire(new Relay(code, key, Net.seat));
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
  // is the open socket carrying this room right now (the lobby says so)
  Net.fast = function () { return !!(link && link.wsUp); };
  // a direct line (WebRTC) to the other player is open
  Net.direct = function () { return !!(link && link.dcUp); };
  Net._link = function () { return link; };      // for the browser tests
  // for looking into a connection that will not come up (?wsdebug=1 shows it in the lobby)
  Net.wsInfo = function () { return link && link.wsOpen ? 'tries ' + link.wsTries + ' · up ' + (link.wsUp ? 1 : 0) + ' · socket ' + (link.ws ? link.ws.readyState : '-') + ' · last ' + (link.wsWhy || '-') + ' · near ' + link.near + '/' + link.seats : 'no relay'; };
  // ---------- random matchmaking ----------
  // Ask the server for anyone. Someone already waiting: sit down in their room. Nobody: wait in a room of our own,
  // telling the server every few seconds that we are still here. After QUICK_WAIT without a real player, give up and
  // let the page offer a computer opponent (onNoOne). Once two are in, the match starts on its own.
  // pool: '' for an ordinary battle, 'wx' for a weather battle (挑戰大自然); each pool is matched only with itself
  Net.quick = function (name, again, pool) {
    pool = ['wx', 'lv', 'race', 'pr', 'tower'].indexOf(pool) >= 0 ? pool : '';
    reset(name, false);
    if (!again) quickTries = 0;
    Net.matched = true; Net.quickSince = Date.now(); Net.pool = pool;
    Net.cfg = { minutes: 2, items: false, wx: pool === 'wx', mode: pool && pool !== 'pr' ? pool : 'battle' };
    setState('matching');
    var run = epoch;
    transport(function (kind) {
      if (run !== epoch || Net.state !== 'matching') return;
      if (kind !== 'relay') return fail('noquick');      // a plain static host has no server to match through
      var key = seatKey();
      relayed = true;
      rpc({ a: 'quick', key: key, pool: pool, dev: devGroup(), mix: Date.now() - Net.quickSince >= 8000 }).then(function (r) {
        if (run !== epoch || Net.state !== 'matching') return;
        var b = r.body;
        if (r.status !== 200 || !b || !b.ok || !b.code) return fail(r.status === 429 ? 'slow' : 'server');
        Net.code = String(b.code);
        Net.host = b.seat === 0; Net.seat = Net.host ? 0 : 1;
        wire(new Relay(Net.code, key, Net.seat));
        quickT = setInterval(function () {
          if (run !== epoch || Net.state !== 'matching') { clearInterval(quickT); quickT = 0; return; }
          var waited = Date.now() - Net.quickSince;
          if (waited >= Net.QUICK_WAIT) { clearInterval(quickT); quickT = 0; return noOne(); }
          // still here; after eight seconds with nobody of the same kind, ready to be matched with the other kind
          if (Net.host && Math.floor(waited / 1000) % 3 === 2) rpc({ a: 'still', code: Net.code, key: key, mix: waited >= 8000 }).then(function (r) {
            var b = r && r.body;
            if (!b || !b.join || run !== epoch || Net.state !== 'matching' || !Net.host) return;
            // moved into another waiting player's room: from now on we are its guest
            var old = link; link = null;
            if (old) { old.h = {}; try { old.close(); } catch (e) { /* it is going anyway */ } }
            Net.code = String(b.join); Net.host = false; Net.seat = 1;
            wire(new Relay(Net.code, key, 1));
          }, function () { /* the next one will do */ });
          changed();      // the seconds on screen
        }, 1000);
      }, function () { if (run === epoch && Net.state === 'matching') fail('server'); });
    });
  };
  function noOne() {
    var f = Net.onNoOne;
    Net.leave();
    if (f) f();
  }
  Net.leave = function () {
    send({ t: 'bye' });
    var st = link;
    setTimeout(function () { if (link === st) shut(); }, 150);
    Net.state = 'idle'; Net.err = ''; Net.seated = false;
    changed();
  };
  Net.setCfg = function (c) {
    if (!Net.host) return;
    Net.cfg = readCfg(c);
    send(cfgMsg());
    changed();
  };

  // what a room plays: an ordinary battle, a weather battle (挑戰大自然, two players only) or a battle on a level's wall
  // (關卡地形). wx stays in the message so a page from before the mode picker still understands a weather room.
  var ROOM_MODES = ['battle', 'wx', 'lv', 'race', 'tower', 'royale', 'relay', 'terr'];
  Net.ROOM_MODES = ROOM_MODES;
  function readCfg(c) {
    var mode = ROOM_MODES.indexOf(c.mode) >= 0 ? c.mode : c.wx ? 'wx' : 'battle';
    return { minutes: int(c.minutes, 1, 3), items: !!c.items, team: !!c.team, wx: mode === 'wx', mode: mode };
  }
  function cfgMsg() { return { t: 'cfg', minutes: Net.cfg.minutes, items: Net.cfg.items, team: !!Net.cfg.team, wx: Net.cfg.mode === 'wx', mode: Net.cfg.mode || 'battle' }; }
  Net.modeOf = function () { return Net.cfg.mode || (Net.cfg.wx ? 'wx' : 'battle'); };

  // ---------- match ----------
  // multi: { roster: [seats], names: {seat: name}, teams: {seat: 0|1} | null } for a match of three or four
  function startMatch(seed, minutes, items, multi, wx, lv, race, tower, royale, relay, terr) {
    Net.state = 'playing';
    Net.wantAgain = Net.foeAgain = false; foeEnd = null; endWait = null; dirty = true; urgent = true; acc = 0;
    peerList().forEach(function (s) { var p = Net.peers[s]; p.again = false; p.end = null; p.heard = Date.now(); p.gone = false; });
    var o = { mode: 'net', seed: seed >>> 0, minutes: int(minutes, 1, 3), items: !!items, oppName: Net.foe || ZZ.L.t('foe'), oppDev: Net.foeDev() };
    if (wx && !multi) o.wx = wx >>> 0;
    if (lv) o.lv = lv;
    // ranked against a person: only from random matching, an ordinary two-minute battle with no items
    if (Net.matched && Net.pool === 'pr' && !multi && !wx && !lv && !race && !tower) { o.pr = true; o.items = false; }
    if (race && !multi) { o.race = 1; o.items = false; }
    if (tower && !multi && !race) { o.tower = 1; }
    if (terr && !race && !tower) { o.terr = 1; }
    if (multi) { o.items = false; o.multi = { me: Net.seat, roster: multi.roster, names: multi.names, teams: royale ? null : multi.teams || null }; if (royale) o.royale = 1; if (relay && o.multi.teams) o.relay = 1; }
    Net.multi = !!multi;
    App.begin('battle', o);
  }
  Net.start = function () {
    if (!Net.host || !link || (Net.state !== 'ready' && Net.state !== 'playing')) return;
    var seed = (Math.random() * 4294967296) >>> 0, roster = Net.roster(), multi = null;
    // whoever is here plays; nobody else can come in now
    if (relayed && link.code) rpc({ a: 'lock', code: link.code, key: link.key }).then(null, function () { /* the room still works, it just stays open */ });
    if (roster.length >= 3) {
      var names = {}, teams = null;
      roster.forEach(function (r) { names[r.seat] = r.name; });
      if ((Net.cfg.team || Net.modeOf() === 'relay') && Net.teamOk(roster.length) && Net.modeOf() !== 'royale') { teams = {}; roster.forEach(function (r, i) { teams[r.seat] = i % 2; }); }
      multi = { roster: roster.map(function (r) { return r.seat; }), names: names, teams: teams };
    }
    var mode = Net.modeOf();
    var wx = mode === 'wx' && !multi ? ((Math.random() * 4294967296) >>> 0 || 1) : 0;
    var lv = mode === 'lv' ? 1 + Math.floor(Math.random() * 1000) : 0;
    var race = mode === 'race' && !multi ? 1 : 0, tower = mode === 'tower' && !multi ? 1 : 0, royale = mode === 'royale' && multi ? 1 : 0, relay = mode === 'relay' && multi && multi.teams ? 1 : 0, terr = mode === 'terr' ? 1 : 0;
    send({ t: 'start', seed: seed, minutes: Net.cfg.minutes, items: multi ? false : Net.cfg.items, multi: multi, wx: wx, lv: lv, race: race, tower: tower, royale: royale, relay: relay, terr: terr });
    startMatch(seed, Net.cfg.minutes, multi ? false : Net.cfg.items, multi, wx, lv, race, tower, royale, relay, terr);
  };
  function everyoneAgain() { return peerList().every(function (s) { return Net.peers[s].again || Net.peers[s].gone; }) && peerList().some(function (s) { return !Net.peers[s].gone; }); }
  Net.again = function () {
    Net.wantAgain = true;
    send({ t: 'again' });
    if (Net.host && everyoneAgain()) Net.start(); else changed();
  };
  // in a match of three or four, cement goes to the player picked as the target
  Net.attack = function (n) {
    var S = App.S();
    if (S && S.multi && S.relay && S.multi.teams) {
      var tt = S.multi.teams[S.multi.target];
      Object.keys(S.multi.foes).map(Number).forEach(function (s) { if (S.multi.teams[s] === tt && Net.peers[s] && !Net.peers[s].gone) send({ t: 'a', n: n }, s); });
      return;
    }
    if (S && S.multi) { var to = S.multi.target; if (to != null && Net.peers[to] && !Net.peers[to].gone) send({ t: 'a', n: n }, to); return; }
    send({ t: 'a', n: n });
  };
  Net.item = function (id) { send({ t: 'i', id: id }); };
  // 2v2 接力: our turn is over; the wall (as a snapshot) goes to the next teammate. Everyone hears whose turn it is.
  Net.handoff = function (to, snap) { send({ t: 'h', to: to, s: snap }); };
  // 搶地盤: claims go to the host, who keeps the one field and sends it to everyone after each change
  Net.terrClaim = function (n) { send({ t: 'c', n: n }, 0); };
  Net.terrMap = function (own) { send({ t: 'T', o: own }); };
  Net.isHost = function () { return !!Net.host; };
  function readSnap(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.grid) || s.grid.length !== ROWS) return null;
    var grid = [], r, x;
    for (r = 0; r < ROWS; r++) {
      if (!Array.isArray(s.grid[r]) || s.grid[r].length !== COLS) return null;
      var row = [];
      for (x = 0; x < COLS; x++) row.push(int(s.grid[r][x], 0, 255));
      grid.push(row);
    }
    var types = function (a, max) { return Array.isArray(a) ? a.slice(0, max).filter(function (t) { return TYPES.indexOf(t) >= 0; }) : []; };
    var st = {}, k;
    if (s.stats && typeof s.stats === 'object') for (k in s.stats) if (/^[a-zA-Z]{1,16}$/.test(k)) st[k] = int(s.stats[k], 0, 99999999);
    return { grid: grid, queue: types(s.queue, 14), bag: types(s.bag, 7), rng: int(s.rng, 0, 4294967295), holdType: TYPES.indexOf(s.holdType) >= 0 ? s.holdType : null,
      combo: int(s.combo, -1, 99), b2b: int(s.b2b, -1, 99), stats: st, cur: TYPES.indexOf(s.cur) >= 0 ? s.cur : null, p: int(s.p, 0, 60) };
  }
  // our wall went down in a room of three or more: tell everyone whose cement did it (older pages ignore this)
  Net.downed = function () {
    var S = App.S();
    if (!S || !S.multi || !ZZ.Meta || !ZZ.Meta.koCredit) return;
    var c = ZZ.Meta.koCredit(S.hits || [], Date.now());
    S.hits = [];
    send({ t: 'k', by: c.by, as: c.as.slice(0, 7) });
  };
  // weather thrown at the other player (a weather battle)
  Net.weather = function (kind) { send({ t: 'w', k: kind }); };

  function pack(g) {
    var first = ROWS, r, x, s = '', items = [], c = g.cur, st = g.stats;
    for (r = 0; r < ROWS && first === ROWS; r++) for (x = 0; x < COLS; x++) if (g.grid[r][x]) { first = r; break; }
    for (r = first; r < ROWS; r++) for (x = 0; x < COLS; x++) {
      var v = g.grid[r][x];
      s += (v & 15).toString(16);
      if (v >> 4) items.push([x, r, v >> 4]);
    }
    var S = App.S();
    return { t: 's', f: first, g: s, it: items, c: c ? [TYPES.indexOf(c.type), c.x, c.y, c.rot] : 0, p: g.pendingTotal(),
      st: [st.sent, st.score, st.lines, st.pieces, st.attack], sh: g.shield > 0 ? 1 : 0, ov: g.over ? 1 : 0, d: S && S.ko ? S.ko.opp : 0 };
  }
  // Paints the other player's wall onto our stand-in game.
  function mirror(m, g) {
    var S = App.S();
    if (!S || !S.remote) return;
    g = g || S.opp;
    var first = int(m.f, 0, ROWS), s = String(m.g || ''), r, x, i;
    if (s.length !== (ROWS - first) * COLS) return;
    for (r = 0; r < ROWS; r++) {
      var row = g.grid[r];
      for (x = 0; x < COLS; x++) {
        var v = r < first ? 0 : parseInt(s.charAt((r - first) * COLS + x), 16);
        row[x] = v >= 0 && v <= 13 ? v : 0;   // 9 to 12: snow, ice and lava from the weather; 13: 大逃殺's floor
      }
    }
    if (Array.isArray(m.it)) for (i = 0; i < m.it.length && i < 40; i++) {
      var it = m.it[i];
      if (Array.isArray(it) && it[0] >= 0 && it[0] < COLS && it[1] >= 0 && it[1] < ROWS && it[2] >= 1 && it[2] < ZZ.ITEMS.length && g.grid[it[1] | 0][it[0] | 0]) g.grid[it[1] | 0][it[0] | 0] |= (it[2] | 0) << 4;
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
  function onMsg(m, from) {
    if (!m || typeof m !== 'object') return;
    var S = App.S(), live = !!S && S.remote && S.state === 'play';
    if (typeof from !== 'number' || from < 0 || from >= Net.SEATS || from === Net.seat) from = Net.seat === 0 ? 1 : 0;     // a direct link: the one other person
    var who = Net.peers[from];
    if (who) who.heard = Date.now();
    // in a match of three or four, each wall arrives with its seat; only the one on show gets the effects
    if (S && S.multi && S.remote) {
      if (m.t === 's') { var f = S.multi.foes[from]; if (f) { mirror(m, f.g); f.downs = int(m.d, 0, 99); f.sent = f.g.stats.sent; } if (S.relay && !S.relay.active && S.relay.team[S.relay.turn] === from) mirror(m, S.me); return; }
      if (m.t === 'e') { if (from === S.multi.target) foeEvent(m.e); return; }
      if (m.t === 'i') return;
    }
    switch (m.t) {
      case 'hello':
        // answer once, in case our own greeting went out before the other side was listening
        if (!m.ack) { send(hello(1)); if (Net.host) send(cfgMsg()); }
        var nm = ZZ.Meta && ZZ.Meta.cleanName ? ZZ.Meta.cleanName(m.name) : String(m.name || '').replace(/[<>&"]/g, '').slice(0, 12);
        if (!Net.peers[from]) Net.peers[from] = { name: nm, heard: Date.now() };
        Net.peers[from].name = nm; Net.peers[from].gone = false;
        Net.peers[from].dev = ['pc', 'phone', 'tablet'].indexOf(m.dev) >= 0 ? m.dev : '';
        Net.peers[from].lv = int(m.lv, 1, 999); Net.peers[from].tt = typeof m.tt === 'string' && /^[a-z0-9]{1,12}$/.test(m.tt) ? m.tt : '';
        Net.foe = firstName();
        Net.seated = false;
        if (Net.state !== 'playing') setState('ready'); else changed();
        // a matched room: the host starts once both have said hello (a moment later, so both see who they got)
        if (Net.matched && Net.host && Net.state === 'ready') { clearInterval(quickT); quickT = 0; setTimeout(function () { if (Net.matched && Net.state === 'ready' && link) Net.start(); }, 1800); }
        break;
      case 'full': fail('full'); break;
      case 'cfg': if (!Net.host && from === 0) { Net.cfg = readCfg(m); changed(); } break;
      case 'start': if (!Net.host && link && from === 0) startMatch(+m.seed || 1, m.minutes, m.items, readMulti(m.multi), m.wx > 0 && m.wx <= 4294967295 ? Math.floor(m.wx) : 0, m.lv >= 1 && m.lv <= 1000 ? Math.floor(m.lv) : 0, m.race === 1 ? 1 : 0, m.tower === 1 ? 1 : 0, m.royale === 1 ? 1 : 0, m.relay === 1 ? 1 : 0, m.terr === 1 ? 1 : 0); break;
      case 's': mirror(m); break;
      case 'e': foeEvent(m.e); break;
      case 'a':
        if (live && S.relay && !S.relay.active) break;      // 接力: only the teammate playing the wall takes cement
        if (live) {
          var hit = int(m.n, 0, 40);
          S.me.receive(hit);
          // in a room of three or more, who sent what and when: if this wall goes down, that decides the knockout
          if (S.multi && hit > 0) { S.hits = S.hits || []; S.hits.push({ s: from, t: Date.now(), n: hit }); if (S.hits.length > 40) S.hits.shift(); }
        }
        break;
      case 'c': if (live && Net.host && S.terr && App.terrClaim) App.terrClaim(from, int(m.n, 1, 12)); break;
      case 'T':
        if (S && S.terr && from === 0 && Array.isArray(m.o) && m.o.length === S.terr.own.length && App.terrSet)
          App.terrSet(m.o.map(function (v) { return v === Math.floor(v) && v >= -1 && v < Net.SEATS ? v : -1; }));
        break;
      case 'h':
        if (S && S.relay && S.multi && S.multi.teams && S.multi.teams[from] === S.multi.myTeam) {
          var to2 = m.to === Math.floor(m.to) ? m.to : -1, snap = readSnap(m.s);
          if (to2 === Net.seat && snap && snap.queue.length) App.relayTake(snap);
          else App.relayTurn(to2);
        }
        break;
      // someone in the room went down and says who knocked them out (by) and who helped (as)
      case 'k':
        if (S && S.multi && S.remote && S.kda && (S.state === 'play' || S.state === 'over')) {
          var by = m.by === Math.floor(m.by) && m.by >= 0 && m.by < Net.SEATS ? m.by : -1;
          if (by === Net.seat) S.kda.k++;
          else if (Array.isArray(m.as) && m.as.indexOf(Net.seat) >= 0) S.kda.a++;
        }
        break;
      case 'i': if (live) App.foeItem(int(m.id, 1, ZZ.ITEMS.length - 1)); break;
      case 'w': if (live && S.sky && App.wxHit && ZZ.Weather && ZZ.Weather.KINDS.concat(ZZ.Weather.DISASTERS).indexOf(m.k) >= 0) App.wxHit(m.k); break;
      case 'end':
        var tally = { downs: int(m.downs, 0, 99), sent: int(m.sent, 0, 99999), score: int(m.score, 0, 99999999), race: int(m.race, 0, 3600000), lines: int(m.lines, 0, 99999) };
        // the rest of the result card (older pages do not send these)
        if (m.x && typeof m.x === 'object') tally.x = { attack: int(m.x.attack, 0, 99999), spins: int(m.x.spins, 0, 9999), minis: int(m.x.minis, 0, 9999), xspins: int(m.x.xspins, 0, 9999), quads: int(m.x.quads, 0, 9999), maxCombo: int(m.x.maxCombo, 0, 99), pieces: int(m.x.pieces, 0, 99999) };
        if (who) who.end = tally;
        if (S && S.multi) { if (endWait && allEnded()) { var g0 = endWait; endWait = null; settle(g0); } break; }
        foeEnd = tally;
        if (live) App.endBattle('');
        else if (endWait) { var f = endWait; endWait = null; settle(f); }
        break;
      case 'again':
        if (who) who.again = true;
        Net.foeAgain = true;
        if (Net.host && Net.wantAgain && everyoneAgain()) Net.start(); else changed();
        break;
      case 'bye':
        // with others still in the room, only the one who left goes; the room itself ends with its host
        if (from !== 0 && Net.count() > 2) { gone(from); break; }
        dropped();
        break;
    }
  }
  function readMulti(v) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.roster)) return null;
    var roster = [], names = {}, teams = null, i, s;
    for (i = 0; i < v.roster.length && i < Net.SEATS; i++) { s = v.roster[i]; if (s === Math.floor(s) && s >= 0 && s < Net.SEATS && roster.indexOf(s) < 0) roster.push(s); }
    if (roster.length < 3 || roster.indexOf(Net.seat) < 0) return null;
    roster.forEach(function (r) { var raw = (v.names && v.names[r]) || ''; names[r] = ZZ.Meta && ZZ.Meta.cleanName ? ZZ.Meta.cleanName(raw) : String(raw).replace(/[<>&"]/g, '').slice(0, 12); });
    if (v.teams && typeof v.teams === 'object' && Net.teamOk(roster.length)) { teams = {}; roster.forEach(function (r) { teams[r] = v.teams[r] === 1 ? 1 : 0; }); }
    return { roster: roster, names: names, teams: teams };
  }
  function allEnded() { var S = App.S(); return !S || !S.multi || peerList().every(function (s) { return Net.peers[s].end || Net.peers[s].gone || !S.multi.foes[s]; }); }
  // one player of three or four has left (said goodbye, or went silent mid-match)
  function gone(seat) {
    var p = Net.peers[seat], S = App.S();
    if (!p) return;
    if (S && S.multi && S.multi.foes[seat] && Net.state === 'playing') { p.gone = true; if (App.foeGone) App.foeGone(seat); }
    else delete Net.peers[seat];
    Net.foe = firstName();
    if (endWait && allEnded()) { var f = endWait; endWait = null; settle(f); }
    if (Net.host && Net.state === 'ready' && Net.wantAgain && everyoneAgain()) return Net.start();
    if (!peerList().some(function (s) { return !Net.peers[s].gone; }) && Net.state !== 'playing') { Net.peers = {}; Net.foe = ''; if (Net.host) setState('waiting'); else changed(); }
    else changed();
  }
  function settle(cb) {
    var S = App.S();
    if (S && S.multi) return cb();
    if (S && S.remote && foeEnd) {
      S.ko.me = foeEnd.downs; S.opp.stats.sent = foeEnd.sent; S.opp.stats.score = foeEnd.score;
      if (S.race) { S.foeRace = foeEnd.race; S.opp.stats.lines = foeEnd.lines; }
      if (foeEnd.x) { for (var k in foeEnd.x) S.opp.stats[k] = foeEnd.x[k]; S.oppFull = true; }
    }
    cb();
  }
  // Called when our clock runs out: tell the other side our tally, then wait a moment for theirs.
  Net.finish = function (cb) {
    var S = App.S();
    Net.state = 'ready';
    send(pack(S.me));
    var ms = S.me.stats;
    send({ t: 'end', downs: S.ko.opp, sent: ms.sent, score: ms.score, race: S.raceMs || 0, lines: ms.lines, x: { attack: ms.attack, spins: ms.spins, minis: ms.minis, xspins: ms.xspins, quads: ms.quads, maxCombo: ms.maxCombo, pieces: ms.pieces } });
    if (S.multi ? allEnded() : foeEnd) return settle(cb);
    endWait = cb;
    // through the relay the other side's tally takes a little longer to arrive
    setTimeout(function () { if (endWait === cb) { endWait = null; settle(cb); } }, relayed ? 4000 : 1500);
  };
  function dropped() {
    if (!link && !peer) return;
    if (Net.state === 'matching' && Net.matched && quickTries < 2 && Date.now() - Net.quickSince < Net.QUICK_WAIT) { quickTries++; shut(); return Net.quick(Net.me, true, Net.pool); }
    var S = App.S(), mid = !!S && S.remote && (S.state === 'play' || S.state === 'count');
    shut();
    if (mid) { Net.state = 'idle'; App.endBattle('left'); return; }
    if (endWait) { var f = endWait; endWait = null; settle(f); }
    if (Net.state === 'ready' || Net.state === 'playing' || Net.state === 'waiting' || Net.state === 'joining' || Net.state === 'matching') {
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
    // a player of three or four who has gone silent mid-match counts as gone
    if (S && S.multi) peerList().forEach(function (s) { var p = Net.peers[s]; if (!p.gone && Date.now() - (p.heard || 0) > QUIET.play) gone(s); });
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
