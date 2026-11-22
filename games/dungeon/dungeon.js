/* 地城小隊 (Dungeon Party): the page. A room is opened with a five-letter code (the same rooms 轉磚 uses, through the
   game's own server: numbered letters, posted and collected over plain HTTPS). The host's page keeps the game and runs
   the rules (rules.js); the others send what they picked and get the whole state back after every change, checked
   field by field (DG.clean) before it is drawn. Alone, the page is its own host and nothing goes over the wire.

   Letters: guest → host  me {n, c} (name and class, in the lobby) · act {r, a} (a pick for round r) · pk {id} (an
            upgrade) · hb (still here) · bye
            host → all    lb {p} (the lobby) · st {s, left} (the game, seconds left to pick) · hb · bye */
(function () {
  'use strict';
  var W = window.SRW, t = W.t, DG = window.DG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CLS = ['warrior', 'ranger', 'mage', 'cleric'];
  var ICON = { warrior: '⚔️', ranger: '🏹', mage: '🔮', cleric: '✨' };
  var FOE = { slime: '🟢', goblin: '👺', bat: '🦇', skeleton: '💀', archer: '☠️', wolf: '🐺', orc: '👹', lord: '😈' };
  var STORE = 'srw.dungeon.v1', API = '../../api/room';
  var GONE_MS = 20000;       // a player not heard from for this long counts as offline (their hero guards)
  var LOST_MS = 30000;       // a guest that has not heard the host for this long gives up

  // ---------- who I am ----------
  var me = { n: '', c: 'warrior' };
  (function () {
    var saved = null, rec = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { /* none */ }
    try { rec = JSON.parse(localStorage.getItem('zhuanzhuan.meta.v1') || 'null'); } catch (e) { /* none */ }
    me.n = cleanName(saved && saved.n || rec && rec.name || '');
    me.c = saved && CLS.indexOf(saved.c) >= 0 ? saved.c : 'warrior';
  })();
  function keep() { try { localStorage.setItem(STORE, JSON.stringify(me)); } catch (e) { /* not kept */ } }
  function cleanName(v) { return String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); }
  function myName() { return me.n || t('dg.you'); }

  // ---------- the room: numbered letters through /api/room ----------
  function seatKey() {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', buf = new Uint8Array(32), i;
    try { window.crypto.getRandomValues(buf); } catch (e) { for (i = 0; i < 32; i++) buf[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < 32; i++) s += abc[buf[i] % abc.length];
    return s;
  }
  function call(body) {
    var o = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' }, tm = 0;
    if (typeof AbortController === 'function') { var ctl = new AbortController(); o.signal = ctl.signal; tm = setTimeout(function () { ctl.abort(); }, 9000); }
    return fetch(API, o).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(tm);
        var j = null;
        try { j = JSON.parse(text); } catch (e) { /* not ours */ }
        return { status: res.status, body: j && typeof j === 'object' ? j : null };
      });
    }, function (e) { clearTimeout(tm); throw e; });
  }
  function Room() {
    this.code = ''; this.seat = -1; this.key = seatKey(); this.out = []; this.n = 0; this.acks = [0, 0, 0, 0, 0, 0, 0, 0];
    this.seats = 1; this.dead = false; this.busy = false; this.timer = 0; this.fails = 0; this.onMsg = null; this.onGone = null; this.fast = false;
  }
  Room.prototype.start = function (code, seat) { this.code = code; this.seat = seat; this.pump(); };
  Room.prototype.send = function (m, to) {
    if (this.dead) return;
    var one = { n: ++this.n, m: m };
    if (typeof to === 'number') one.to = to;
    this.out.push(one);
    this.soon(40);
  };
  Room.prototype.soon = function (ms) {
    var self = this;
    if (this.dead) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.pump(); }, ms);
  };
  Room.prototype.pump = function () {
    var self = this;
    if (this.dead || !this.code) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.again = false;
    var batch = this.out.slice(0, 60), upto = batch.length ? batch[batch.length - 1].n : 0;
    call({ a: 'x', code: this.code, seat: this.seat, key: this.key, out: batch, acks: this.acks }).then(function (r) {
      if (self.dead) return;
      if (r.status === 404) { self.dead = true; if (self.onGone) self.onGone(); return; }
      if (r.status !== 200 || !r.body || !r.body.ok) { self.fails++; return; }
      self.fails = 0;
      // what was sent is kept by the server now; only take letters in order from each seat
      self.out = self.out.filter(function (x) { return x.n > upto; });
      self.seats = r.body.seats || self.seats;
      (Array.isArray(r.body.in) ? r.body.in : []).forEach(function (it) {
        if (!it || typeof it.n !== 'number' || !(it.f >= 0 && it.f < 8) || it.f === self.seat) return;
        if (it.n !== self.acks[it.f] + 1) return;
        self.acks[it.f] = it.n;
        if (self.onMsg) self.onMsg(it.m, it.f);
      });
    }, function () { self.fails++; }).then(function () {
      self.busy = false;
      if (!self.dead) self.soon(self.again || self.out.length ? 30 : self.fast ? 650 : 1300);
    });
  };
  Room.prototype.stop = function (last) {
    clearTimeout(this.timer);
    if (this.dead || !this.code) { this.dead = true; return; }
    this.dead = true;
    var body = { a: 'x', code: this.code, seat: this.seat, key: this.key, out: this.out.slice(0, 60), acks: this.acks };
    if (last && this.seat === 0) body.end = true;
    try { call(body).catch(function () { /* gone anyway */ }); } catch (e) { /* gone anyway */ }
  };

  // ---------- the game as this page sees it ----------
  var room = null, host = false, solo = false, screen = 'start';
  var lobby = {};            // host: seat → { s, n, c }; everyone: the list as last heard
  var st = null;             // the game (the host's own copy, or the last one the host sent)
  var deadline = 0, heard = {}, pick = null, aim = '', lastSent = 0, hostHeard = 0, ended = false;

  function show(name) {
    screen = name;
    ['start', 'lobby', 'play', 'loot', 'end'].forEach(function (s) { $(s).hidden = s !== name; });
    $('roomTag').hidden = !room || name === 'start';
    if (room) $('roomTag').textContent = t('dg.room', room.code);
  }
  function err(where, key) { var e = $(where); e.textContent = key ? t(key) : ''; e.hidden = !key; }
  function heroName(s) { var h = st && DG.hero(st, s); return h ? h.n || t('dg.c.' + h.c) : '?'; }
  function foeName(i) {
    var m = st && st.m[i];
    if (!m) return '?';
    var same = st.m.filter(function (x) { return x.k === m.k; }).length, nth = st.m.slice(0, i + 1).filter(function (x) { return x.k === m.k; }).length;
    return t('dg.m.' + m.k) + (same > 1 ? ' ' + 'ABCD'.charAt(nth - 1) : '');
  }
  function clsButtons(id) {
    $(id).innerHTML = CLS.map(function (c) {
      return '<button type="button" role="radio" aria-checked="' + (me.c === c) + '" data-cls="' + c + '"><i aria-hidden="true">' + ICON[c] + '</i><b>' + esc(t('dg.c.' + c)) + '</b><span>' + esc(t('dg.c.' + c + 'P')) + '</span></button>';
    }).join('');
  }

  // ---------- lobby ----------
  function lobbyList() { return Object.keys(lobby).map(Number).sort(function (a, b) { return a - b; }).map(function (s) { return lobby[s]; }); }
  function drawLobby() {
    var list = lobbyList(), mySeat = room ? room.seat : 0;
    $('lobbyCode').textContent = room ? room.code : '';
    $('partyTitle').textContent = t('dg.party', list.length);
    $('lobbyList').innerHTML = list.map(function (p) {
      return '<li><i aria-hidden="true">' + ICON[p.c] + '</i><b>' + esc(p.n || t('dg.c.' + p.c)) + '</b><span>' + esc(t('dg.c.' + p.c)) + (p.s === 0 ? ' · ' + esc(t('dg.host')) : '') + (p.s === mySeat ? ' · ' + esc(t('dg.you')) : '') + '</span></li>';
    }).join('');
    clsButtons('clsLobby');
    $('go').hidden = !host; $('lobbyWait').hidden = host;
  }
  function sendLobby() { if (host && room) room.send({ t: 'lb', g: 'dg', p: lobbyList() }); drawLobby(); }
  function readLobby(p) {
    if (!Array.isArray(p) || p.length > DG.MAX) return null;
    var out = {};
    for (var i = 0; i < p.length; i++) {
      var x = p[i];
      if (!x || typeof x.s !== 'number' || !(x.s >= 0 && x.s < 8) || CLS.indexOf(x.c) < 0 || typeof x.n !== 'string') return null;
      out[x.s] = { s: x.s, n: cleanName(x.n), c: x.c };
    }
    return out;
  }

  // ---------- the host's side ----------
  function broadcast() {
    if (!host) return;
    var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (room) { room.send({ t: 'st', g: 'dg', s: DG.wire(st), left: left }); lastSent = Date.now(); }
    draw();
  }
  function setClock() { deadline = Date.now() + (st.ph === 'loot' ? DG.LOOT_MS : DG.ROUND_MS); }
  function everyonePicked() { return st.h.every(function (h) { return h.hp <= 0 || h.a || h.off; }); }
  function hostStep(force) {
    if (!host || !st) return;
    var changed = false;
    if (st.ph === 'fight' && (everyonePicked() || force)) { DG.resolve(st); changed = true; }
    else if (st.ph === 'loot' && (st.h.every(function (h) { return h.pk || h.off; }) || force)) { DG.next(st); changed = true; }
    if (changed) { pick = null; aim = ''; if (st.ph === 'fight' || st.ph === 'loot') setClock(); broadcast(); }
  }
  function hostTick() {
    if (!host || !st || ended) return;
    var now = Date.now(), any = false;
    if (room) st.h.forEach(function (h) {
      if (h.s === 0) return;
      var off = now - (heard[h.s] || 0) > GONE_MS;
      if (off !== h.off) { DG.setOff(st, h.s, off); any = true; }
    });
    if ((st.ph === 'fight' || st.ph === 'loot') && now > deadline) return hostStep(true);
    if (any) { hostStep(false); broadcast(); }
    else if (room && now - lastSent > 4000) { room.send({ t: 'hb' }); lastSent = now; }
    drawClock();
  }
  function startGame() {
    var list = lobbyList();
    if (!host || !list.length) return;
    ended = false;
    if (room) { room.fast = true; call({ a: 'lock', code: room.code, key: room.key }).catch(function () { /* the start goes ahead */ }); }
    st = DG.newGame(list);
    heard = {}; list.forEach(function (p) { heard[p.s] = Date.now(); });
    pick = null; aim = '';
    setClock();
    broadcast();
  }
  // a pick by this page's own player, or a letter from a guest (host); a guest's own pick goes to the host
  var WHY = { mp: 'dg.mpLow', full: 'dg.full' };
  function choose(a) {
    if (!st || st.ph !== 'fight') return;
    var seat = room ? room.seat : 0, why = DG.choose(host ? st : JSON.parse(JSON.stringify(st)), seat, a);
    if (why) { aim = ''; drawFight(); if (WHY[why]) $('acts').insertAdjacentHTML('afterbegin', '<p class="dg-err">' + esc(t(WHY[why])) + '</p>'); return; }
    if (host) {
      pick = { r: st.rd, a: a }; aim = '';
      if (everyonePicked()) hostStep(false); else broadcast();
    } else {
      pick = { r: st.rd, a: a }; aim = '';
      room.send({ t: 'act', r: st.rd, a: a }, 0);
      draw();
    }
  }
  function takeUp(id) {
    if (!st || st.ph !== 'loot') return;
    var seat = room ? room.seat : 0;
    if (host) { if (!DG.pick(st, seat, id)) hostStep(false); draw(); }
    else { pick = { r: -st.fl, a: id }; room.send({ t: 'pk', id: id }, 0); draw(); }
  }

  // ---------- letters ----------
  function onMsg(m, f) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    heard[f] = Date.now();
    if (host) {
      if (m.t === 'me') {
        if (st && !ended) return;
        var c = CLS.indexOf(m.c) >= 0 ? m.c : 'warrior';
        lobby[f] = { s: f, n: cleanName(m.n), c: c };
        if (Object.keys(lobby).length > DG.MAX) { delete lobby[f]; room.send({ t: 'bye', g: 'dg', why: 'full' }, f); return; }
        sendLobby();
      } else if (m.t === 'act' && st && st.ph === 'fight' && m.r === st.rd && m.a && typeof m.a === 'object') {
        if (!DG.choose(st, f, { k: m.a.k, t: m.a.t })) { if (everyonePicked()) hostStep(false); else broadcast(); }
      } else if (m.t === 'pk' && st && st.ph === 'loot' && typeof m.id === 'string') {
        if (!DG.pick(st, f, m.id)) { hostStep(false); broadcast(); }
      } else if (m.t === 'bye') {
        delete lobby[f];
        if (st && !ended) { DG.setOff(st, f, true); hostStep(false); broadcast(); } else sendLobby();
      }
      return;
    }
    if (f !== 0) return;
    hostHeard = Date.now();
    if (m.g !== 'dg' && m.t !== 'hb') { leave(); err('startErr', 'dg.err.other'); return; }      // a 轉磚 room
    if (m.t === 'lb') {
      var l = readLobby(m.p);
      if (!l) return;
      lobby = l;
      if (!st || ended) { st = null; ended = false; show('lobby'); drawLobby(); }
    } else if (m.t === 'st') {
      var s = DG.clean(m.s);
      if (!s) return;
      st = s;
      deadline = Date.now() + Math.max(0, Math.min(60, +m.left || 0)) * 1000;
      draw();
    } else if (m.t === 'bye') {
      var why = m.why === 'full' ? 'dg.err.full' : 'dg.hostGone';
      leave(); err('startErr', why);
    }
  }
  function roomGone() {
    var wasHost = host;
    leave();
    err('startErr', wasHost ? 'dg.err.net' : 'dg.hostGone');
  }

  // ---------- opening, joining, leaving ----------
  function newRoom(seat, code) {
    room = new Room();
    room.onMsg = onMsg; room.onGone = roomGone;
    return room;
  }
  function failKey(r) { return !r ? 'dg.err.net' : r.status === 404 ? 'dg.err.room' : r.status === 409 ? 'dg.err.full' : r.status === 429 ? 'dg.err.slow' : 'dg.err.net'; }
  function readMe() { me.n = cleanName($('name').value); keep(); }
  function openRoom() {
    readMe(); err('startErr', '');
    var r = newRoom();
    $('open').disabled = true;
    call({ a: 'open', key: r.key, cap: DG.MAX }).then(function (res) {
      $('open').disabled = false;
      if (res.status !== 200 || !res.body || !res.body.code) { room = null; return err('startErr', failKey(res)); }
      host = true; solo = false; st = null; ended = false;
      lobby = {}; lobby[0] = { s: 0, n: me.n, c: me.c };
      r.start(res.body.code, 0);
      show('lobby'); drawLobby();
      try { history.replaceState(null, '', '?room=' + res.body.code); } catch (e) { /* fine */ }
    }, function () { $('open').disabled = false; room = null; err('startErr', 'dg.err.net'); });
  }
  function joinRoom() {
    readMe(); err('startErr', '');
    var code = String($('code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return err('startErr', 'dg.err.room');
    var r = newRoom();
    $('join').disabled = true;
    call({ a: 'join', code: code, key: r.key }).then(function (res) {
      $('join').disabled = false;
      if (res.status !== 200 || !res.body || typeof res.body.seat !== 'number') { room = null; return err('startErr', failKey(res)); }
      host = false; solo = false; st = null; ended = false; lobby = {};
      r.start(res.body.code, res.body.seat);
      r.send({ t: 'me', g: 'dg', n: me.n, c: me.c }, 0);
      hostHeard = Date.now();
      show('lobby'); drawLobby();
      $('lobbyList').innerHTML = '<li class="dg-wait">' + esc(t('dg.connecting')) + '</li>';
    }, function () { $('join').disabled = false; room = null; err('startErr', 'dg.err.net'); });
  }
  function playAlone() {
    readMe(); err('startErr', '');
    room = null; host = true; solo = true; ended = false;
    lobby = {}; lobby[0] = { s: 0, n: me.n, c: me.c };
    startGame();
  }
  function leave() {
    if (room) { room.send({ t: 'bye', g: 'dg' }); var r = room; setTimeout(function () { r.stop(true); }, 60); }
    room = null; host = false; solo = false; st = null; ended = false; lobby = {}; pick = null; aim = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* fine */ }
    show('start'); drawStart();
  }

  // ---------- drawing ----------
  function bar(v, max, cls) { return '<span class="dg-bar ' + cls + '"><i style="width:' + Math.max(0, Math.min(100, v / Math.max(1, max) * 100)) + '%"></i></span>'; }
  function mySeat() { return room ? room.seat : 0; }
  function heroCard(h, opts) {
    opts = opts || {};
    var tags = [];
    if (h.hp <= 0) tags.push('<em class="down">' + esc(t('dg.st.down')) + '</em>');
    else if (h.off) tags.push('<em class="off">' + esc(t('dg.st.off')) + '</em>');
    else if (opts.fight) tags.push('<em class="' + (h.a ? 'ok' : '') + '">' + esc(t(h.a ? 'dg.st.ready' : 'dg.st.think')) + '</em>');
    if (h.tn > 0 && h.hp > 0) tags.push('<em class="tn">' + esc(t('dg.st.taunt')) + '</em>');
    if (opts.loot && h.pk) tags.push('<em class="ok">' + esc(t('dg.up.' + h.pk)) + '</em>');
    var inner = '<i aria-hidden="true">' + ICON[h.c] + '</i><b>' + esc(h.n || t('dg.c.' + h.c)) + (h.s === mySeat() ? ' <small>' + esc(t('dg.you')) + '</small>' : '') + '</b>' +
      '<span class="dg-tags">' + tags.join('') + '</span>' +
      '<span class="dg-stat">' + bar(h.hp, h.mh, 'hp') + '<small>' + h.hp + '／' + h.mh + '</small></span>' +
      '<span class="dg-stat">' + bar(h.mp, h.mm, 'mp') + '<small>' + h.mp + '／' + h.mm + '</small></span>';
    var cls = (h.hp <= 0 ? ' down' : '') + (h.s === mySeat() ? ' me' : '');
    if (opts.target) return '<li class="pick' + cls + '"><button type="button" data-ally="' + h.s + '">' + inner + '</button></li>';
    return '<li class="' + cls.trim() + '">' + inner + '</li>';
  }
  function logLine(l) {
    var k = l[0], a = l;
    switch (k) {
      case 'floor': return t('dg.l.floor', a[1]);
      case 'round': return t('dg.l.round', a[1]);
      case 'atk': return t(a[4] ? 'dg.l.crit' : 'dg.l.atk', heroName(a[1]), foeName(a[2]), a[3]);
      case 'kill': return t('dg.l.kill', heroName(a[1]), foeName(a[2]));
      case 'taunt': return t('dg.l.taunt', heroName(a[1]));
      case 'volley': return t('dg.l.volley', heroName(a[1]), a[2]);
      case 'fire': return t('dg.l.fire', heroName(a[1]), a[2]);
      case 'heal': return t('dg.l.heal', heroName(a[1]), heroName(a[2]), a[3]);
      case 'revive': return t('dg.l.revive', heroName(a[1]), heroName(a[2]));
      case 'guard': return t('dg.l.guard', heroName(a[1]));
      case 'hit': return t(a[4] ? 'dg.l.hitc' : 'dg.l.hit', foeName(a[1]), heroName(a[2]), a[3]);
      case 'down': return t('dg.l.down', heroName(a[1]));
      case 'rage': return t('dg.l.rage', foeName(a[1]));
      case 'aoe': return t('dg.l.aoe', foeName(a[1]), a[2]);
      case 'clear': return t('dg.l.clear', a[1]);
      case 'win': return t('dg.l.win');
      case 'lose': return t('dg.l.lose');
    }
    return '';
  }
  function actLabel(a) {
    var h = DG.hero(st, mySeat());
    if (!a || !h) return '';
    if (a.k === 'atk') return t('dg.atk') + ' ' + foeName(a.t);
    if (a.k === 'skill') return t('dg.sk.' + h.c) + (h.c === 'cleric' ? ' ' + heroName(a.t) : '');
    return t('dg.guard');
  }
  function drawClock() {
    var el = $('clock');
    if (!st || (st.ph !== 'fight' && st.ph !== 'loot')) { el.textContent = ''; return; }
    var s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el.textContent = t('dg.left', s);
    el.classList.toggle('low', s <= 5);
  }
  function drawFight() {
    var h = DG.hero(st, mySeat()), cl = h && DG.CLASSES[h.c];
    $('floorTag').textContent = t('dg.floor', st.fl);
    $('roundTag').textContent = t('dg.round', st.rd);
    $('foes').innerHTML = st.m.map(function (m, i) {
      var dead = m.hp <= 0, inner = '<i aria-hidden="true">' + FOE[m.k] + '</i><b>' + esc(foeName(i)) + '</b>' + bar(m.hp, m.mh, 'hp') + '<small>' + m.hp + '／' + m.mh + '</small>';
      var cls = (dead ? 'dead' : '') + (DG.MONSTERS[m.k].boss ? ' boss' : '') + (m.rg ? ' rage' : '');
      if (aim === 'foe' && !dead) return '<li class="pick ' + cls + '"><button type="button" data-foe="' + i + '">' + inner + '</button></li>';
      return '<li class="' + cls + '">' + inner + '</li>';
    }).join('');
    $('party').innerHTML = st.h.map(function (x) { return heroCard(x, { fight: true, target: aim === 'ally' && (x.hp < x.mh) }); }).join('');
    var acts = '', picked = h && (h.a || (pick && pick.r === st.rd));
    if (!h) acts = '';
    else if (h.hp <= 0) acts = '<p class="dg-wait">' + esc(t('dg.downMe')) + '</p>';
    else if (aim) acts = '<p class="dg-wait">' + esc(t(aim === 'foe' ? 'dg.pickFoe' : 'dg.pickAlly')) + '</p><div class="row"><button class="btn plain" type="button" data-do="cancel">' + esc(t('dg.cancel')) + '</button></div>';
    else if (picked) {
      var label = pick && pick.r === st.rd ? actLabel(pick.a) : t('dg.st.ready');
      acts = '<p class="dg-wait">' + esc(t('dg.chose', label)) + '</p><div class="row"><button class="btn plain" type="button" data-do="change">' + esc(t('dg.change')) + '</button></div>';
    } else {
      var cost = h.c === 'cleric' ? cl.cost : cl.cost, noMp = h.mp < cost;
      acts = '<div class="dg-btns">' +
        '<button class="btn" type="button" data-do="atk"><b>' + esc(t('dg.atk')) + '</b></button>' +
        '<button class="btn sk" type="button" data-do="skill"' + (noMp ? ' disabled' : '') + '><b>' + esc(t('dg.sk.' + h.c)) + '</b><small>' + esc(noMp ? t('dg.mpLow') : t('dg.mpCost', cost)) + '</small></button>' +
        '<button class="btn plain" type="button" data-do="guard"><b>' + esc(t('dg.guard')) + '</b><small>' + esc(t('dg.guardP')) + '</small></button></div>';
    }
    $('acts').innerHTML = acts;
    $('log').innerHTML = st.log.map(function (l) { return '<li class="l-' + l[0] + '">' + esc(logLine(l)) + '</li>'; }).join('');
    var lg = $('log'); lg.scrollTop = lg.scrollHeight;
    drawClock();
  }
  function drawLoot() {
    var h = DG.hero(st, mySeat()), offers = st.up[mySeat()] || [], mine = h && (h.pk || (pick && pick.r === -st.fl));
    $('lootTitle').textContent = t('dg.loot', st.fl);
    $('ups').innerHTML = mine ? '<p class="dg-wait">' + esc(t('dg.lootWait')) + '</p>' : offers.map(function (id) { return '<button class="btn plain" type="button" data-up="' + id + '">' + esc(t('dg.up.' + id)) + '</button>'; }).join('');
    $('lootList').innerHTML = st.h.map(function (x) { return heroCard(x, { loot: true }); }).join('');
  }
  function drawEnd() {
    var win = st.ph === 'win';
    $('endTitle').textContent = t(win ? 'dg.win' : 'dg.lose');
    $('endNote').textContent = win ? t('dg.winP', st.rd - 1) : t('dg.loseP', st.fl);
    $('endList').innerHTML = st.h.map(function (x) { return heroCard(x); }).join('');
    $('again').hidden = !host; $('againWait').hidden = host || solo;
  }
  function draw() {
    if (!st) return;
    if (st.ph === 'fight') { if (screen !== 'play') show('play'); drawFight(); }
    else if (st.ph === 'loot') { if (screen !== 'loot') show('loot'); drawLoot(); }
    else { ended = true; if (screen !== 'end') show('end'); drawEnd(); }
  }
  function drawStart() { $('name').value = me.n; clsButtons('clsStart'); }

  // ---------- input ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var d = b.dataset, h = st && DG.hero(st, mySeat());
    if (d.cls) {
      me.c = d.cls; keep();
      if (screen === 'lobby') {
        if (host) { lobby[0].c = me.c; sendLobby(); } else if (room) { room.send({ t: 'me', g: 'dg', n: me.n, c: me.c }, 0); }
        clsButtons('clsLobby');
      } else clsButtons('clsStart');
      return;
    }
    if (d.foe != null) { choose({ k: 'atk', t: +d.foe }); return; }
    if (d.ally != null) { choose({ k: 'skill', t: +d.ally }); return; }
    if (d.up) { takeUp(d.up); return; }
    if (d.do === 'atk') { aim = 'foe'; drawFight(); return; }
    if (d.do === 'skill' && h) { if (h.c === 'cleric') { aim = 'ally'; drawFight(); } else choose({ k: 'skill' }); return; }
    if (d.do === 'guard') { choose({ k: 'guard' }); return; }
    if (d.do === 'cancel') { aim = ''; drawFight(); return; }
    if (d.do === 'change') { pick = null; if (h) h.a = null; drawFight(); return; }
    switch (b.id) {
      case 'open': openRoom(); break;
      case 'join': joinRoom(); break;
      case 'solo': playAlone(); break;
      case 'go': startGame(); break;
      case 'leave': case 'quit': leave(); break;
      case 'again':
        if (!host) break;
        if (solo) { lobby[0].c = me.c; startGame(); break; }
        st = null; ended = false; show('lobby'); sendLobby();
        break;
      case 'copy': {
        var link = location.origin + location.pathname + '?room=' + (room ? room.code : '');
        var ok = function () { b.textContent = t('dg.copied'); setTimeout(function () { b.textContent = t('dg.copy'); }, 1500); };
        try { navigator.clipboard.writeText(link).then(ok, ok); } catch (x) { ok(); }
        break;
      }
    }
  });
  $('name').addEventListener('change', function () { readMe(); });
  $('code').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });
  window.addEventListener('pagehide', function () { if (room) { room.send({ t: 'bye', g: 'dg' }); room.stop(true); } });
  // the clock, the host's rounds, and a guest's patience
  setInterval(function () {
    if (host) hostTick();
    else if (room && st && !ended) {
      drawClock();
      if (Date.now() - lastSent > 4000) { room.send({ t: 'hb' }, 0); lastSent = Date.now(); }
      if (Date.now() - hostHeard > LOST_MS) { leave(); err('startErr', 'dg.lost'); }
    } else if (room && !st && Date.now() - hostHeard > LOST_MS) { leave(); err('startErr', 'dg.lost'); }
    if (room) room.fast = !!st && !ended;
  }, 400);

  drawStart();
  try { var q = new URLSearchParams(location.search).get('room'); if (q) { $('code').value = q.toUpperCase().slice(0, 6); $('code').focus(); } } catch (e) { /* none */ }
  // for the browser tests
  window.DGPage = { state: function () { return st; }, room: function () { return room; }, host: function () { return host; }, screen: function () { return screen; }, lobby: function () { return lobbyList(); }, deadline: function (ms) { deadline = Date.now() + ms; } };
})();
