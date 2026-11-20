/* 轉磚 cloud: keeps the player's record on the server and shows the leaderboards.

   The game never waits for the network. Every change (a purchase, a finished match…) is worked out on the spot by
   ZZ.Meta as before; this file hears about it through Meta.onOp, puts it in a queue and sends the queue to /api/rpc.
   The server repeats each change on its own copy and answers with the record as it sees it. That answer replaces
   the local record, and anything still waiting in the queue is played on top of it again. So the screen always
   shows "what the server has confirmed, plus what it has not heard yet", and the server always has the last word.

   A device is known by a random id and secret kept in localStorage. There is no account to sign up for: the first
   real change makes one, and a one-time code links a second device to it.

   Where the page is served without the API (a plain static host, the Claude preview) none of this happens and the
   game stays on the device exactly as before. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ || require('./engine.js');
  var Meta = ZZ.Meta, KEY = 'zhuanzhuan.cloud.v1', BATCH = 40, QUEUE_MAX = 1000;

  var Cloud = {
    api: 'api/',      // relative, so the game also works from a sub-folder
    on: false,        // the API answered and has a database behind it
    dead: false,      // this host has no API: stay local, do not keep asking
    unsure: false,    // …or so it seemed: nothing answered, which a dead network also looks like
    seen: false,      // the API has answered from this address before
    del: null,        // { id, key, until }: the save this device asked to delete, while it can still be taken back
    nodb: false,      // the API is here but has no database linked
    gone: false,      // this device was unlinked on purpose; do not make a new account by itself
    cred: null,       // { id, key }
    pub: '',          // the short public tag shown on leaderboards
    q: [],            // changes the server has not confirmed yet: { i, k, a }
    base: null,       // with no account yet: the record as it was before the first queued change
    busy: null, fails: 0, last: 0, skew: 0, want: false, auto: true,
    delay: { op: 700, fin: 60 },
    fetch: null, store: null, later: null, now: function () { return Date.now(); },
    onChange: null, onAdopt: null, onNote: null
  };
  var probeFails = 0, timer = 0, pullNext = false, known = false, waiters = [];
  // Other parts of the game (online rooms) ask whether this host has the API; they get their answer once the first
  // look is done. The answer is "no" only when that is certain: a look that merely failed (a bad moment on the
  // network) must not send one player to the public broker while their friend's room is on our own server.
  Cloud.hosted = function () { return known && !Cloud.dead && !Cloud.nodb; };
  Cloud.whenKnown = function (cb) { if (known || Cloud.dead) cb(Cloud.hosted()); else waiters.push(cb); };
  function nowKnown() {
    known = true;
    var w = waiters; waiters = [];
    for (var i = 0; i < w.length; i++) w[i](Cloud.hosted());
  }

  // ---------- what is kept on the device ----------
  function storage() {
    if (Cloud.store) return Cloud.store;
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function readStore() {
    try {
      var st = storage(), raw = st && st.getItem(KEY), v = raw ? JSON.parse(raw) : null;
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }
  function persist() {
    if (!Cloud.cred && !Cloud.gone) theirs();   // never write over an account another tab has just made
    var st = storage(), c = Cloud.cred;
    var v = { id: c ? c.id : '', key: c ? c.key : '', pub: Cloud.pub, gone: Cloud.gone, seen: Cloud.seen, base: c ? null : Cloud.base, del: Cloud.del,
      q: Cloud.q.map(function (o) { return { i: o.i, k: o.k, a: o.a }; }) };
    try { if (st) st.setItem(KEY, JSON.stringify(v)); } catch (e) { /* kept in memory for this visit */ }
  }
  function load() {
    var v = readStore() || {};
    Cloud.cred = typeof v.id === 'string' && v.id && typeof v.key === 'string' && v.key ? { id: v.id, key: v.key } : null;
    Cloud.pub = typeof v.pub === 'string' ? v.pub : '';
    Cloud.gone = !!v.gone; Cloud.seen = !!v.seen;
    Cloud.del = readDel(v.del);
    Cloud.q = Array.isArray(v.q) ? v.q.filter(function (o) { return o && typeof o.i === 'string' && typeof o.k === 'string' && Array.isArray(o.a); }).slice(-QUEUE_MAX) : [];
    Cloud.base = !Cloud.cred && v.base && typeof v.base === 'object' && Cloud.q.length ? v.base : null;
  }
  // a cloud save this device asked to delete, still in its 30 days: kept so the player can take it back from here
  function readDel(d) { return d && typeof d.id === 'string' && typeof d.key === 'string' && typeof d.until === 'number' ? { id: d.id, key: d.key, until: d.until } : null; }
  function snapshot() { return JSON.parse(JSON.stringify(Meta.data)); }
  function changed() { if (Cloud.onChange) Cloud.onChange(); }
  function opId() {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', i, buf;
    try { buf = new Uint8Array(16); (root.crypto || require('crypto').webcrypto).getRandomValues(buf); } catch (e) { buf = null; }
    for (i = 0; i < 16; i++) s += abc[(buf ? buf[i] : Math.floor(Math.random() * 256)) % abc.length];
    return s;
  }

  // ---------- talking to the API ----------
  function call(method, path, body, auth) {
    var f = Cloud.fetch || (typeof root.fetch === 'function' ? function (u, o) { return root.fetch(u, o); } : null);
    if (!f) return Promise.reject(new Error('no fetch'));
    var o = { method: method, headers: {}, credentials: 'same-origin', cache: 'no-store' }, ctl = null, t = 0;
    if (body) { o.body = JSON.stringify(body); o.headers['Content-Type'] = 'application/json'; o.keepalive = o.body.length < 60000; }
    var who = auth === true ? Cloud.cred : auth;
    if (who) o.headers.Authorization = 'Bearer ' + who.id + '.' + who.key;
    if (typeof AbortController === 'function') { ctl = new AbortController(); o.signal = ctl.signal; t = setTimeout(function () { ctl.abort(); }, 15000); }
    var done = function () { if (t) clearTimeout(t); };
    return f(Cloud.api + path, o).then(function (res) {
      return res.text().then(function (text) {
        done();
        var j = null;
        try { j = JSON.parse(text); } catch (e) { /* not ours */ }
        return { status: res.status, body: j && typeof j === 'object' ? j : null };
      });
    }, function (e) { done(); throw e; });
  }
  function clockFrom(serverNow) {
    if (typeof serverNow !== 'number') return;
    var s = serverNow - Cloud.now();
    if (Math.abs(s - Cloud.skew) > 1500) Cloud.skew = s;   // the game day follows the server's clock, not the device's
  }
  function later(fn, ms) { return (Cloud.later || setTimeout)(fn, ms); }
  function schedule(ms) {
    if (!Cloud.auto) return;
    if (timer) clearTimeout(timer);
    timer = later(function () { timer = 0; Cloud.flush(); }, ms);
  }

  // ---------- several tabs of one browser ----------
  // They share the store, so they must end up on one account, and none of them may lose what it still has to send.
  //
  // The account another tab has put in the store, if there is one: this tab joins it and keeps its own queue (the
  // server knows each change by its id, so one that both tabs send is still done once).
  // spare: an account this tab has just made itself. If another tab was quicker, that one is one too many.
  function theirs(spare) {
    var v = readStore();
    if (!v || !v.id || !v.key || v.gone || (spare && v.id === spare.id)) return false;
    if (spare) call('POST', 'rpc', { a: 'delete' }, { id: spare.id, key: spare.key }).then(null, function () {});
    Cloud.cred = { id: v.id, key: v.key };
    Cloud.pub = typeof v.pub === 'string' ? v.pub : '';
    Cloud.base = null; Cloud.want = false; Cloud.gone = false;
    return true;
  }
  // One tab at a time. Where the browser cannot do that (it is rare), fn simply runs.
  function alone(fn) {
    var nav = root.navigator, locks = Cloud.locks === undefined ? nav && nav.locks : Cloud.locks, ran = false;
    var go = function () { ran = true; return fn(); };
    if (!locks || typeof locks.request !== 'function') return Promise.resolve().then(go);
    try {
      return Promise.resolve(locks.request(KEY, go)).then(null, function (e) { if (ran) throw e; return go(); });
    } catch (e) { return Promise.resolve().then(go); }
  }
  // Another tab changed which account this browser uses: it made one, switched to another save, or unlinked.
  Cloud.follow = function () {
    var v = readStore() || {}, id = v.id && v.key ? v.id : '', mine = Cloud.cred ? Cloud.cred.id : '', gone = !id && !!v.gone;
    if (id === mine && gone === Cloud.gone) return false;
    if (!id && !gone && mine) { persist(); return false; }   // a tab that had not heard of the account wrote over it: put it back
    var join = !!id && !mine;                                  // it made the account this tab was about to make
    Cloud.cred = id ? { id: v.id, key: v.key } : null;
    Cloud.pub = id && typeof v.pub === 'string' ? v.pub : '';
    Cloud.gone = gone; Cloud.want = false; Cloud.del = readDel(v.del);
    if (!join) Cloud.q = [];                                   // a different save, or none: what waited here was meant for the old one
    Cloud.base = Cloud.cred || gone ? null : snapshot();
    if (Cloud.cred && Cloud.on) Cloud.flush(true);
    changed();
    return true;
  };

  // ---------- the queue ----------
  function push(k, a) {
    if (Cloud.dead || Cloud.gone) return;
    var q = Cloud.q, last = q[q.length - 1];
    a = JSON.parse(JSON.stringify(a));
    // typing a name or trying on looks: only where it ends up matters
    if (last && !last.s && last.k === k && (k === 'name' || k === 'wset' || (k === 'wear' && last.a[0] === a[0]))) { last.a = a; last.i = opId(); }
    else q.push({ i: opId(), k: k, a: a });
    if (q.length > QUEUE_MAX) {
      if (Cloud.cred) q.splice(0, q.length - QUEUE_MAX);
      else { Cloud.q = []; Cloud.base = snapshot(); }   // no account yet: what happened so far simply becomes the starting record
    }
    persist();
    schedule(k === 'fin' ? Cloud.delay.fin : Cloud.delay.op);
  }
  // The server's record becomes ours; what it has not heard yet is played on top again.
  function adopt(st) {
    var before = JSON.stringify(Meta.data), look = JSON.stringify(Meta.data.equip), keep = Meta.data.custom, i;
    Meta.quiet++;
    try {
      Meta.use(st);
      Meta.data.custom = keep;   // the player's own pictures live on this device only
      ['tile', 'bg'].forEach(function (k) { if (Meta.data.equip[k] === 'custom' && !keep[k]) Meta.data.equip[k] = k === 'tile' ? 'glaze' : 'wall'; });
      for (i = 0; i < Cloud.q.length; i++) Meta.run(Cloud.q[i].k, Cloud.q[i].a);
    } finally { Meta.quiet--; }
    Meta.save();
    if (Cloud.onAdopt) Cloud.onAdopt(JSON.stringify(Meta.data) !== before, JSON.stringify(Meta.data.equip) !== look);
  }
  function take(b) {
    Cloud.cred = { id: b.id, key: b.key };
    Cloud.pub = b.pub || '';
    Cloud.base = null; Cloud.want = false; Cloud.gone = false;
    Cloud.last = Cloud.now();
    clockFrom(b.now);
    persist();
  }
  function lost() {
    Cloud.cred = null; Cloud.pub = ''; Cloud.q = []; Cloud.base = null; Cloud.gone = true;
    persist();
    if (Cloud.onNote) Cloud.onNote('lost');
  }
  // the save this device is on is waiting to be deleted: nothing goes to it any more; it can still be taken back
  function waits(until) {
    if (Cloud.cred) Cloud.del = { id: Cloud.cred.id, key: Cloud.cred.key, until: +until || 0 };
    Cloud.cred = null; Cloud.pub = ''; Cloud.q = []; Cloud.base = null; Cloud.gone = true;
    persist();
    if (Cloud.onNote) Cloud.onNote('pending');
  }
  function unmark() { Cloud.q.forEach(function (o) { delete o.s; }); }

  // One request. Answers 'more' (go on), 'done' or 'wait' (try again later).
  function step() {
    if (!Cloud.cred) {
      return alone(function () {
        if (Cloud.cred || theirs()) return 'more';   // another tab made the account while this one waited its turn
        return call('POST', 'rpc', { a: 'hello', st: Cloud.base || snapshot() }).then(function (r) {
          var b = r.body;
          if (r.status === 200 && b && b.ok && b.id && b.key) {
            if (theirs(b)) return 'more';            // (a browser that cannot take turns) another tab got there first
            take(b); adopt(b.st);
            return 'more';
          }
          if (r.status === 429) Cloud.fails = Math.max(Cloud.fails, 6);
          return 'wait';
        });
      });
    }
    // as many waiting changes as fit: finished matches carry their tape, so the batch is cut by size as well as by count
    var batch = [], bytes = 0, ids = {};
    for (var bi = 0; bi < Cloud.q.length && batch.length < BATCH; bi++) {
      var len = JSON.stringify(Cloud.q[bi].a).length + 60;
      if (batch.length && bytes + len > 60000) break;
      bytes += len; batch.push(Cloud.q[bi]);
    }
    batch.forEach(function (o) { o.s = 1; ids[o.i] = 1; });
    var drop = function () { Cloud.q = Cloud.q.filter(function (o) { return !ids[o.i]; }); };
    return call('POST', 'rpc', { a: 'sync', ops: batch.map(function (o) { return { i: o.i, k: o.k, a: o.a }; }) }, true).then(function (r) {
      var b = r.body;
      if (r.status === 200 && b && b.ok && b.st) {
        drop();
        clockFrom(b.now);
        if (b.pub) Cloud.pub = b.pub;
        Cloud.last = Cloud.now();
        adopt(b.st);
        persist();
        // 'proof': the server could not match a result to its tape. With honest play that means this page is older than the rules on the server.
        if (Cloud.onNote && (b.res || []).some(function (x) { return x && x.ok === false && x.why === 'proof'; })) Cloud.onNote('stale');
        else if (Cloud.onNote && (b.res || []).some(function (x) { return x && x.ok === false && (x.why === 'fast' || x.why === 'range' || x.why === 'slow'); })) Cloud.onNote('rejected');
        return Cloud.q.length ? 'more' : 'done';
      }
      if (r.status === 401) { lost(); return 'done'; }
      if (r.status === 409 && b && b.why === 'pending') { waits(b.until); return 'done'; }   // deleted from another device: it is waiting
      if (r.status === 400 || r.status === 413 || r.status === 415) { drop(); persist(); return Cloud.q.length ? 'more' : 'done'; }   // the server will never take these as they are
      unmark();
      return 'wait';
    });
  }
  function run(pull) {
    if (Cloud.cred && !Cloud.q.length && !pull) return Promise.resolve('done');
    return step().then(null, function () { unmark(); return 'wait'; }).then(function (v) { return v === 'more' ? run(false) : v; });
  }
  // Sends what is waiting. pull: also ask for the record when nothing is waiting (another device may have played).
  Cloud.flush = function (pull) {
    if (Cloud.busy) { if (pull) pullNext = true; return Cloud.busy; }
    if (!Cloud.on || Cloud.dead || Cloud.gone) return Promise.resolve('idle');
    if (Cloud.cred ? !Cloud.q.length && !pull : !Cloud.q.length && !Cloud.want) return Promise.resolve('idle');
    Cloud.busy = run(pull).then(function (v) {
      Cloud.busy = null;
      if (v === 'wait') {
        Cloud.fails++;
        if (Cloud.auto) later(function () { Cloud.flush(); }, Math.min(300000, 2000 * Math.pow(2, Math.min(8, Cloud.fails))));
      } else Cloud.fails = 0;
      changed();
      if (v !== 'wait' && (pullNext || (Cloud.q.length && Cloud.cred))) { var p = pullNext; pullNext = false; return Cloud.flush(p); }
      pullNext = false;
      return v;
    });
    changed();
    return Cloud.busy;
  };

  // ---------- is there an API here at all ----------
  // unsure: nothing answered at all (as opposed to a host that plainly said "no such thing here")
  function none(unsure) {
    Cloud.dead = true; Cloud.on = false; Cloud.unsure = !!unsure;
    if (!Cloud.cred) { Cloud.q = []; Cloud.base = null; persist(); }
    nowKnown();
    changed();
  }
  function probe() {
    if (Cloud.dead) return Promise.resolve(false);
    var again = function () {
      probeFails++;
      var fresh = !Cloud.seen && !Cloud.cred;      // nothing has ever answered from this address
      if (fresh && probeFails >= 3) { none(true); return false; }
      if (Cloud.auto) later(probe, fresh ? 1200 * probeFails : Math.min(300000, 4000 * Math.pow(2, Math.min(7, probeFails))));
      if (!fresh) nowKnown();                      // the API has been here before: a bad moment, not a missing server
      changed();
      return false;
    };
    return call('GET', 'health').then(function (r) {
      var b = r.body;
      if (r.status === 200 && b && b.app === 'zhuanzhuan') {
        probeFails = 0;
        if (!b.db) { Cloud.on = false; Cloud.nodb = true; nowKnown(); changed(); return false; }   // the API is here but no database is linked: local for this visit
        Cloud.on = true; Cloud.nodb = false;
        if (!Cloud.seen) { Cloud.seen = true; persist(); }
        nowKnown();
        changed();   // (the clock is not taken from this answer: it may come from a cache and be a minute old)
        Cloud.flush(!!Cloud.cred);
        return true;
      }
      if (r.status === 404 || r.status === 405 || (r.status < 500 && !b)) { none(); return false; }   // a plain static host
      return again();
    }, again);
  }
  Cloud.probe = probe;
  // Asked when it matters (an online room is about to be opened, the network is back): if the API was written off
  // only because nothing answered, look once more.
  Cloud.recheck = function () {
    if (!Cloud.dead || !Cloud.unsure) return Promise.resolve(Cloud.hosted());
    Cloud.dead = false; Cloud.unsure = false; probeFails = 2;
    if (!Cloud.cred && !Cloud.base) Cloud.base = snapshot();
    return probe().then(function () { return Cloud.hosted(); });
  };

  // ---------- start ----------
  Cloud.init = function (o) {
    o = o || {};
    if (o.fetch) Cloud.fetch = o.fetch;
    if (o.store) Cloud.store = o.store;
    if (o.now) Cloud.now = o.now;
    if (o.auto != null) Cloud.auto = o.auto;
    if ('locks' in o) Cloud.locks = o.locks;
    Cloud.dead = false; Cloud.unsure = false; Cloud.on = false; Cloud.nodb = false; Cloud.busy = null; Cloud.fails = 0; Cloud.skew = 0; probeFails = 0; pullNext = false; known = false;
    load();
    if (!Cloud.cred && !Cloud.base) Cloud.base = snapshot();
    Meta.now = function () { return Cloud.now() + Cloud.skew; };
    Meta.onOp = push;
    // with a cloud save, treasure boxes are opened by the server (see Meta.draw)
    Meta.remote = function () { return Cloud.on && !Cloud.dead && !Cloud.gone; };
    if (o.local) { none(); return Promise.resolve(false); }
    return probe();
  };

  // ---------- what the screens ask ----------
  // none: no server here · new: no account yet · ok · busy · wait: cannot reach it right now · gone: unlinked
  Cloud.status = function () {
    if (Cloud.dead) return 'none';
    if (!known) return 'busy';          // still finding out whether a server is here
    if (!Cloud.on && !Cloud.cred && !Cloud.seen) return 'none';
    if (Cloud.gone) return Cloud.del && Cloud.del.until > Cloud.now() ? 'pend' : 'gone';
    if (Cloud.busy) return 'busy';
    if (!Cloud.on || Cloud.fails) return 'wait';
    return Cloud.cred ? 'ok' : 'new';
  };
  function answer(r) { return r.body || { ok: false, why: r.status === 429 ? 'slow' : 'net' }; }
  var offline = function () { return { ok: false, why: 'net' }; };
  // Makes the account now if there is none (normally the first change does that).
  Cloud.ensure = function () {
    if (Cloud.cred) return Promise.resolve(true);
    if (!Cloud.on) return Promise.resolve(false);
    if (Cloud.gone) { Cloud.gone = false; Cloud.q = []; Cloud.base = snapshot(); }
    Cloud.want = true;
    persist();
    return Cloud.flush().then(function () { return !!Cloud.cred; });
  };
  Cloud.restart = Cloud.ensure;
  Cloud.code = function () {
    return Cloud.ensure().then(function (ok) {
      if (!ok) return offline();
      return Cloud.flush().then(function () { return call('POST', 'rpc', { a: 'code' }, true); }).then(answer, offline);
    });
  };
  // go false: whose save is behind this code. go true: this device switches to it.
  Cloud.redeem = function (code, go) {
    if (!Cloud.on) return Promise.resolve(offline());
    return call('POST', 'rpc', { a: 'redeem', code: String(code || '').slice(0, 24), go: !!go }, true).then(function (r) {
      var b = answer(r);
      if (go && r.status === 200 && b.ok && b.id && b.key) {
        Cloud.q = [];
        take(b);
        adopt(b.st);
        changed();
      }
      return b;
    }, offline);
  };
  Cloud.wipe = function () {
    if (!Cloud.cred) return Promise.resolve({ ok: true });
    return call('POST', 'rpc', { a: 'delete' }, true).then(function (r) {
      var b = answer(r);
      if ((r.status === 200 && b.ok) || r.status === 401) {
        Cloud.del = r.status === 200 && typeof b.until === 'number' ? { id: Cloud.cred.id, key: Cloud.cred.key, until: b.until } : null;
        Cloud.cred = null; Cloud.pub = ''; Cloud.q = []; Cloud.base = null; Cloud.gone = true; Cloud.want = false;
        persist();
        changed();
        return { ok: true, until: Cloud.del ? Cloud.del.until : 0 };
      }
      return b;
    }, offline);
  };
  // Takes back the deletion of the save this device was on. The cloud save comes back as it was and becomes this
  // device's progress again.
  Cloud.restore = function () {
    var d = Cloud.del;
    if (!d) return Promise.resolve({ ok: false, why: 'none' });
    if (!Cloud.on) return Promise.resolve(offline());
    return call('POST', 'rpc', { a: 'restore' }, { id: d.id, key: d.key }).then(function (r) {
      var b = answer(r);
      if (r.status === 200 && b.ok && b.st) {
        Cloud.del = null; Cloud.q = [];
        take({ id: d.id, key: d.key, pub: b.pub, now: b.now });
        adopt(b.st);
        changed();
        return { ok: true };
      }
      if (r.status === 410 || r.status === 401) { Cloud.del = null; persist(); changed(); return { ok: false, why: 'purged' }; }
      return b;
    }, offline);
  };
  // The player does not want it back: this device forgets it (the server still removes it when the 30 days are up).
  Cloud.letGo = function () { Cloud.del = null; persist(); changed(); };
  var boards = {};
  Cloud.board = function (b, scope) {
    var key = b + '|' + scope + '|' + Cloud.pub, hit = boards[key];
    if (hit && Cloud.now() - hit.at < 20000) return Promise.resolve(hit.data);
    return call('GET', 'board?b=' + encodeURIComponent(b) + '&s=' + encodeURIComponent(scope) + (Cloud.pub ? '&me=' + encodeURIComponent(Cloud.pub) : '')).then(function (r) {
      if (r.status !== 200 || !r.body || !r.body.ok) return null;
      boards[key] = { at: Cloud.now(), data: r.body };
      return r.body;
    }, function () { return null; });
  };
  Cloud._forget = function () { boards = {}; };

  ZZ.Cloud = Cloud;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
  if (!ZZ.App || typeof document === 'undefined') return;

  // =====================================================================================================
  // The screens: a cloud block in the profile, the device and data sheet, and the leaderboards.
  // =====================================================================================================
  var App = ZZ.App, L = ZZ.L, t = L.t, esc = App.esc, btn = App.btn;
  var $ = function (id) { return document.getElementById(id); };

  L.add({
    'm.board': ['排行榜', 'Leaderboards', 'ランキング', '랭킹'],
    'lb.rp': ['段位', 'Rating', 'レート', '레이팅'],
    'lb.score': ['單場最高分', 'Best score', '最高スコア', '최고 점수'],
    'lb.sprint': ['40 行競速', '40-line sprint', '40ライン', '40줄 스프린트'],
    'lb.wx': ['挑戰大自然', 'Weather', '大自然チャレンジ', '대자연 도전'],
    'lb.wxr': ['天氣排位', 'Storm rank', '天気ランク', '날씨 랭크'],
    'lb.season': ['本季', 'This season', '今シーズン', '이번 시즌'],
    'lb.all': ['歷來', 'All time', '歴代', '역대'],
    'lb.loading': ['讀取中…', 'Loading…', '読み込み中…', '불러오는 중…'],
    'lb.empty': ['還沒有人上榜，第一名等你來拿。', 'Nobody is on this board yet. First place is open.', 'まだ誰も載っていません。1位は空いています。', '아직 아무도 없습니다. 1위가 비어 있습니다.'],
    'lb.fail': ['排行榜現在讀不到，等一下再試。', 'The leaderboard cannot be loaded right now. Try again in a moment.', '現在ランキングを読み込めません。少し待ってからお試しください。', '지금 랭킹을 불러올 수 없습니다. 잠시 후 다시 시도하세요.'],
    'lb.retry': ['再試一次', 'Try again', 'もう一度', '다시 시도'],
    'lb.me': ['你目前第 {0} 名', 'You are in place {0}', '現在{0}位', '현재 {0}위'],
    'lb.none.rp': ['打一場排位賽就會上榜。', 'Play a ranked match to get on this board.', 'ランクマッチを1回プレイすると載ります。', '랭크전을 한 판 하면 등록됩니다.'],
    'lb.none.score': ['打完一場對戰就會上榜。', 'Finish a match to get on this board.', '対戦を1回終えると載ります。', '대전을 한 판 마치면 등록됩니다.'],
    'lb.none.sprint': ['跑完一次 40 行競速就會上榜。', 'Finish a 40-line sprint to get on this board.', '40ラインを完走すると載ります。', '40줄 스프린트를 완주하면 등록됩니다.'],
    'lb.you': ['你', 'You', 'あなた', '나'],
    'lb.anon': ['磚友 {0}', 'Player {0}', 'プレイヤー {0}', '플레이어 {0}'],
    'lb.seasonNote': ['{0} 賽季。每月一號換季（台灣時間），段位榜和本季成績會重新開始。', 'Season {0}. A new season starts on the 1st of each month (Taiwan time); the rating board and season scores start over.', 'シーズン {0}。毎月1日（台湾時間）に切り替わり、レートと今シーズンの記録はリセットされます。', '{0} 시즌. 매월 1일(대만 시간)에 새 시즌이 시작되며 레이팅과 이번 시즌 기록이 초기화됩니다.'],
    'lb.open': ['看排行榜', 'See the leaderboards', 'ランキングを見る', '랭킹 보기'],
    // cloud save
    'sr.title': ['SnowRealm Games 帳號', 'SnowRealm Games account', 'SnowRealm Games アカウント', 'SnowRealm Games 계정'],
    'sr.p': ['轉磚不用註冊就能玩。想用同一個帳號玩 SnowRealm 的每一款遊戲，請到 SnowRealm Games：已經有帳號就按右上角「登入」，還沒有就在登入畫面選「註冊」。', 'You can play 轉磚 without an account. To use one account across every SnowRealm game, go to SnowRealm Games: press "Sign in" at the top right, or choose "Register" there if you have no account yet.', '轉磚は登録なしで遊べます。SnowRealm の全ゲームで同じアカウントを使うには SnowRealm Games へ：右上の「ログイン」、まだなら「登録」を選んでください。', '轉磚는 가입 없이 즐길 수 있어요. SnowRealm의 모든 게임을 한 계정으로 즐기려면 SnowRealm Games에서 오른쪽 위 "로그인", 계정이 없으면 "회원가입"을 고르세요.'],
    'sr.kid': ['13 歲以下先不用註冊帳號，直接玩就可以，進度會存在這台裝置。', 'Under 13 there is no need for an account: just play, and progress stays on this device.', '13歳未満の方はアカウント登録なしでそのまま遊べます。', '13세 미만은 계정 없이 그대로 즐기면 돼요.'],
    'sr.menu': ['登入／註冊', 'Sign in / Register', 'ログイン／登録', '로그인/가입'],
    'sr.go': ['到 SnowRealm Games 註冊／登入', 'Register / sign in at SnowRealm Games', 'SnowRealm Games で登録／ログイン', 'SnowRealm Games 가입/로그인'],
    'sr.soon': ['登入或註冊好之後，轉磚這邊的綁定會在 SnowRealm 統一登入上線時開放；你在轉磚的進度、金幣都會保留，綁定時再接上去。', 'Linking 轉磚 to that account opens when SnowRealm sign-in goes live; your progress and coins here stay as they are and carry over when you link.', 'アカウント連携は SnowRealm の統一ログイン開始時に開放されます。ここでの進行状況とコインはそのまま引き継げます。', '계정 연결은 SnowRealm 통합 로그인이 열리면 가능해요. 여기의 진행 상황과 코인은 그대로 유지되고 연결할 때 이어집니다.'],
    'cl.title': ['雲端存檔', 'Cloud save', 'クラウドセーブ', '클라우드 저장'],
    'cl.none': ['這個版本沒有連上伺服器，進度只存在這台裝置。', 'This copy of the game is not connected to a server. Progress stays on this device.', 'このバージョンはサーバーに接続していません。進行状況はこの端末にだけ保存されます。', '이 버전은 서버에 연결되어 있지 않습니다. 진행 상황은 이 기기에만 저장됩니다.'],
    'cl.new': ['打完第一場，或買了第一樣東西，就會自動開始存到雲端。', 'Your progress starts saving to the cloud after your first match or purchase.', '最初の対戦か買い物のあと、自動でクラウドに保存されます。', '첫 대전이나 첫 구매 후 자동으로 클라우드에 저장됩니다.'],
    'cl.ok': ['進度已經存到雲端。', 'Your progress is saved to the cloud.', '進行状況はクラウドに保存済みです。', '진행 상황이 클라우드에 저장되었습니다.'],
    'cl.busy': ['同步中…', 'Syncing…', '同期中…', '동기화 중…'],
    'cl.wait': ['現在連不上伺服器。進度先留在這台裝置，連上後會自動補傳。', 'The server cannot be reached right now. Progress is kept on this device and sent when the connection is back.', '現在サーバーに接続できません。進行状況はこの端末に保存され、接続が戻ると自動で送信されます。', '지금 서버에 연결할 수 없습니다. 진행 상황은 이 기기에 보관되며 연결되면 자동으로 전송됩니다.'],
    'cl.gone': ['這台裝置沒有連著雲端存檔，進度只存在這裡。', 'This device is not linked to a cloud save. Progress stays here.', 'この端末はクラウドセーブに接続していません。進行状況はここにだけ保存されます。', '이 기기는 클라우드 저장에 연결되어 있지 않습니다. 진행 상황은 여기에만 저장됩니다.'],
    'cl.start': ['開始存到雲端', 'Start a cloud save', 'クラウドセーブを始める', '클라우드 저장 시작'],
    'cl.manage': ['換裝置・管理資料', 'Devices and data', '端末の引き継ぎ・データ管理', '기기 이전·데이터 관리'],
    'cl.tag': ['你在排行榜上的代號：{0}', 'Your tag on the leaderboards: {0}', 'ランキングでのタグ：{0}', '랭킹에 표시되는 태그: {0}'],
    'cl.what': ['雲端只存你的名字、遊戲進度和排行榜成績。不用註冊，也不存信箱或密碼。自己的圖片和對戰錄影留在裝置上。', 'The cloud keeps your name, your progress and your leaderboard scores. There is no sign-up, and no email or password is stored. Your own pictures and recorded matches stay on the device.', 'クラウドに保存されるのは名前、進行状況、ランキングの記録だけです。登録は不要で、メールアドレスやパスワードは保存しません。自分の画像と対戦記録は端末に残ります。', '클라우드에는 이름, 진행 상황, 랭킹 기록만 저장됩니다. 가입이 필요 없고 이메일이나 비밀번호는 저장하지 않습니다. 내 사진과 대전 기록은 기기에 남습니다.'],
    'cl.move': ['換到另一台裝置', 'Move to another device', '別の端末に引き継ぐ', '다른 기기로 옮기기'],
    'cl.moveP': ['在有進度的那台按「產生引繼碼」，再到另一台輸入。之後兩台共用同一份進度。', 'Get a transfer code on the device that has your progress, then enter it on the other one. Both devices share the same progress from then on.', '進行状況がある端末で「引き継ぎコードを発行」を押し、もう一方の端末で入力します。以後、両方の端末で同じ進行状況を使います。', '진행 상황이 있는 기기에서 「이전 코드 발급」을 누르고 다른 기기에서 입력하세요. 이후 두 기기가 같은 진행 상황을 함께 씁니다.'],
    'cl.getCode': ['產生引繼碼', 'Get a transfer code', '引き継ぎコードを発行', '이전 코드 발급'],
    'cl.codeIs': ['引繼碼，{0} 分鐘內有效，只能用一次', 'Transfer code, valid for {0} minutes, works once', '引き継ぎコード（{0}分間有効・1回限り）', '이전 코드 ({0}분간 유효, 1회용)'],
    'cl.codeWarn': ['拿到這組碼的人可以進入你的存檔，不要給別人。', 'Anyone with this code can get into your save. Keep it to yourself.', 'このコードを知っている人はあなたのセーブに入れます。他人に教えないでください。', '이 코드를 아는 사람은 내 저장 데이터에 들어올 수 있습니다. 남에게 알려 주지 마세요.'],
    'cl.enter': ['輸入另一台的引繼碼', 'Enter a code from another device', '別の端末のコードを入力', '다른 기기의 코드 입력'],
    'cl.enterPh': ['例如 ABCD-EFGH', 'e.g. ABCD-EFGH', '例：ABCD-EFGH', '예: ABCD-EFGH'],
    'cl.check': ['查看', 'Look up', '確認', '확인'],
    'cl.found': ['找到這份存檔', 'Found this save', 'このセーブが見つかりました', '이 저장 데이터를 찾았습니다'],
    'cl.foundRow': ['{0}　{1}　{2} 金幣　{3} 場', '{0} · {1} · {2} coins · {3} matches', '{0}　{1}　{2}コイン　{3}戦', '{0} · {1} · {2}코인 · {3}판'],
    'cl.replace': ['換過去之後，這台裝置現在的進度（{0}、{1} 金幣）會被取代，救不回來。', 'After switching, the progress now on this device ({0}, {1} coins) is replaced and cannot be brought back.', '切り替えると、この端末の現在の進行状況（{0}、{1}コイン）は置き換えられ、元に戻せません。', '전환하면 이 기기의 현재 진행 상황({0}, {1}코인)은 대체되며 되돌릴 수 없습니다.'],
    'cl.same': ['這台裝置已經在用這份存檔了。', 'This device is already using that save.', 'この端末はすでにこのセーブを使っています。', '이 기기는 이미 이 저장 데이터를 사용 중입니다.'],
    'cl.use': ['換成這份存檔', 'Switch to this save', 'このセーブに切り替える', '이 저장 데이터로 전환'],
    'cl.moved': ['換好了，這台裝置現在用的是這份存檔。', 'Done. This device now uses that save.', '切り替えました。この端末はこのセーブを使います。', '전환했습니다. 이 기기는 이제 이 저장 데이터를 사용합니다.'],
    'cl.badCode': ['這組碼不對，或是已經過期。', 'That code is wrong or has run out.', 'コードが違うか、有効期限が切れています。', '코드가 틀렸거나 만료되었습니다.'],
    'cl.slow': ['試太多次了，等十分鐘再試。', 'Too many tries. Wait ten minutes and try again.', '試行回数が多すぎます。10分待ってからお試しください。', '시도 횟수가 너무 많습니다. 10분 후 다시 시도하세요.'],
    'cl.err': ['現在連不上伺服器，等一下再試。', 'The server cannot be reached right now. Try again in a moment.', '現在サーバーに接続できません。少し待ってからお試しください。', '지금 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'],
    'cl.stale': ['剛剛那場伺服器沒有採計。請重新整理頁面換成最新版再打。', 'The server did not count that match. Reload the page to get the latest version, then play again.', 'さっきの試合はサーバーで記録されませんでした。ページを再読み込みして最新版にしてください。', '방금 경기는 서버에 기록되지 않았습니다. 페이지를 새로 고쳐 최신 버전으로 바꿔 주세요.'],
    'cl.privacy': ['隱私說明：存了什麼、怎麼刪', 'Privacy: what is stored and how to delete it', 'プライバシー：保存される内容と削除方法', '개인정보: 저장되는 내용과 삭제 방법'],
    'cl.pend': ['雲端存檔等待刪除中，已暫停使用。', 'Your cloud save is waiting to be deleted and is switched off.', 'クラウドセーブは削除待ちで、停止しています。', '클라우드 저장 데이터가 삭제 대기 중이며 중지되었습니다.'],
    'cl.pendWhen': ['{0} 以前可以恢復，之後永久刪除。', 'You can take it back until {0}; after that it is deleted for good.', '{0} までは元に戻せます。その後は完全に削除されます。', '{0}까지 복구할 수 있으며 그 이후에는 영구 삭제됩니다.'],
    'cl.pendP': ['恢復後，雲端存檔會回到刪除前的樣子，並取代這台裝置現在的進度（{0}、{1} 金幣）。不恢復的話，這台裝置的進度不受影響，到期後雲端那份永久刪除。', 'Taking it back brings the cloud save back as it was and replaces the progress now on this device ({0}, {1} coins). If you leave it, progress here is not touched and the cloud copy is deleted for good when the time is up.', '元に戻すと、クラウドセーブは削除前の状態に戻り、この端末の現在の進行状況（{0}、{1}コイン）と置き換わります。そのままにすると、この端末の進行状況はそのままで、期限後にクラウドの分は完全に削除されます。', '복구하면 클라우드 저장 데이터가 삭제 전 상태로 돌아오고 이 기기의 현재 진행 상황({0}, {1}코인)을 대체합니다. 그대로 두면 이 기기의 진행 상황은 그대로이고 기한 후 클라우드 데이터는 영구 삭제됩니다.'],
    'cl.restore': ['取消刪除，恢復雲端存檔', 'Take it back', '削除を取り消して復元', '삭제 취소하고 복구'],
    'cl.restored': ['雲端存檔已經恢復。', 'Your cloud save is back.', 'クラウドセーブを復元しました。', '클라우드 저장 데이터를 복구했습니다.'],
    'cl.letGo': ['不恢復，改開新的雲端存檔', 'Leave it and start a new cloud save', '復元せず新しいクラウドセーブを始める', '복구하지 않고 새 클라우드 저장 시작'],
    'cl.purged': ['這份雲端存檔已經超過 30 天，永久刪除了。', 'That cloud save is past its 30 days and has been deleted for good.', 'そのクラウドセーブは 30 日を過ぎ、完全に削除されました。', '그 클라우드 저장 데이터는 30일이 지나 영구 삭제되었습니다.'],
    'cl.pending': ['這份雲端存檔在別台裝置申請刪除了，到「雲端存檔」可以恢復。', 'This cloud save was put up for deletion on another device. You can take it back in Cloud save.', 'このクラウドセーブは別の端末で削除申請されました。「クラウドセーブ」から復元できます。', '이 클라우드 저장 데이터는 다른 기기에서 삭제 신청되었습니다. "클라우드 저장"에서 복구할 수 있어요.'],
    'cl.delWhen': ['按下確定後立刻暫停使用、從排行榜移除，所有裝置斷開。{0} 以前可以在這裡恢復；之後雲端存檔、排行榜成績和 SnowRealm 綁定紀錄永久刪除。這台裝置上的進度不受影響。', 'Once you confirm, it is switched off at once, taken off the leaderboards and every device is unlinked. You can take it back here until {0}; after that the cloud save, your leaderboard scores and your SnowRealm link are deleted for good. Progress on this device is not touched.', '確定すると、すぐに停止してランキングから外れ、すべての端末の接続を解除します。{0} まではここで元に戻せます。その後、クラウドセーブ、ランキングの記録、SnowRealm 連携の記録は完全に削除されます。この端末の進行状況には影響しません。', '확인하면 즉시 중지되고 랭킹에서 빠지며 모든 기기의 연결이 해제됩니다. {0}까지는 여기에서 복구할 수 있고, 그 이후에는 클라우드 저장 데이터, 랭킹 기록, SnowRealm 연결 기록이 영구 삭제됩니다. 이 기기의 진행 상황에는 영향이 없습니다.'],
    'cl.del': ['刪除雲端資料', 'Delete cloud data', 'クラウドのデータを削除', '클라우드 데이터 삭제'],
    'cl.delP': ['雲端上的存檔和排行榜成績會立刻停用，所有連著的裝置都會斷開；資料先保留 30 天，之後永久刪除。這台裝置上的進度不受影響。', 'Your cloud save and leaderboard scores are switched off at once and every device is unlinked. The data is kept for 30 days, then deleted for good. Progress on this device is not touched.', 'クラウドのセーブとランキングの記録はすぐに停止し、すべての端末の接続を解除します。データは 30 日間保管したあと完全に削除します。この端末の進行状況には影響しません。', '클라우드 저장 데이터와 랭킹 기록은 즉시 중지되고 모든 기기의 연결이 해제됩니다. 데이터는 30일 동안 보관한 뒤 영구 삭제됩니다. 이 기기의 진행 상황에는 영향이 없습니다.'],
    'cl.delYes': ['確定刪除', 'Yes, delete', '削除する', '삭제'],
    'cl.deleted': ['雲端資料已停用，30 天後永久刪除。', 'Cloud data switched off; it will be deleted for good in 30 days.', 'クラウドのデータを停止しました。30 日後に完全に削除します。', '클라우드 데이터를 중지했습니다. 30일 후 영구 삭제됩니다.'],
    'cl.lost': ['雲端存檔已經不在了，可能是在別台裝置刪掉的。進度還留在這台裝置。', 'The cloud save no longer exists. It may have been deleted from another device. Your progress is still on this device.', 'クラウドセーブはもう存在しません。別の端末で削除された可能性があります。進行状況はこの端末に残っています。', '클라우드 저장 데이터가 더 이상 없습니다. 다른 기기에서 삭제했을 수 있습니다. 진행 상황은 이 기기에 남아 있습니다.'],
    'cl.rejected': ['有一筆紀錄伺服器沒有收，進度以雲端為準。', 'The server did not accept one of your results. Your progress follows the cloud copy.', 'サーバーが受け付けなかった記録があります。進行状況はクラウドの内容に合わせました。', '서버가 받지 않은 기록이 있습니다. 진행 상황은 클라우드 기준으로 맞췄습니다.']
  });

  var ui = { code: '', codeExp: 0, entered: '', peek: null, msg: '', del: false, wait: false };
  var lb = { b: 'rp', scope: 'season', data: null, state: 'idle', ask: 0 };

  function stateText() {
    var st = Cloud.status();
    return st === 'pend' ? t('cl.pend') + ' ' + t('cl.pendWhen', when(Cloud.del.until)) : t('cl.' + st);
  }
  // a moment in the player's own time zone, to the minute
  function when(ms) {
    try { return new Date(ms).toLocaleString(L.lang === 'en' ? 'en' : L.lang, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  }
  function rankText(rp) { return App.rankName(Meta.rankOf(rp)); }
  function nameOf(n, pub) { return n || t('lb.anon', String(pub || '').slice(0, 4).toUpperCase()); }

  // ---------- the cloud block in the profile ----------
  // the platform account: sign-up happens on SnowRealm Games; linking opens when SnowRealm Identity is live
  var SR_URL = 'https://games.snowrealm.pet/';
  function srBlock() {
    // under 13: no sign-up push (accounts for children need a parent's consent, which is not in place)
    if (ZZ.Consent && ZZ.Consent.child()) return '<h3>' + t('sr.title') + '</h3><p class="note">' + t('sr.kid') + '</p>';
    return '<h3>' + t('sr.title') + '</h3><p class="note">' + t('sr.p') + '</p><div class="row"><a class="btn main" href="' + SR_URL + '" target="_blank" rel="noopener" data-sr="signup">' + esc(t('sr.go')) + ' ↗</a></div><p class="note">' + t('sr.soon') + '</p>';
  }
  App.srBlock = srBlock;
  App.sheets.srAccount = function () { return srBlock() + '<div class="row">' + btn('close', 'close') + '</div>'; };
  App.profileExtra = function () {
    var st = Cloud.status(), h = '<h3>' + t('cl.title') + '</h3><p class="note" id="clState">' + esc(stateText()) + '</p>';
    if (st !== 'none') h += '<div class="row">' + (st === 'gone' ? btn('cloudStart', 'cl.start') : st === 'pend' ? btn('cloud', 'cl.restore') : btn('cloud', 'cl.manage')) + '</div>';
    return h + srBlock();
  };
  App.acts.cloud = function () { ui.msg = ''; ui.peek = null; ui.del = false; App.openSheet('cloud'); };
  App.acts.cloudStart = function () {
    Cloud.ensure().then(function (ok) {
      if (!ok) App.toast(t('cl.err'), 3200);
      refresh();
    });
    refresh();
  };

  // ---------- devices and data ----------
  App.dismiss.cloud = 1;
  App.sheets.cloud = function () {
    var st = Cloud.status(), d = Meta.data, h = '<h2>' + t('cl.title') + '</h2><p class="note" id="clState">' + esc(stateText()) + '</p>';
    if (Cloud.pub) h += '<p class="note">' + esc(t('cl.tag', Cloud.pub.toUpperCase())) + '</p>';
    h += '<p>' + t('cl.what') + '</p>';
    if (st === 'none') return h + srBlock() + '<div class="row">' + btn('close', 'close') + '</div>';
    if (ui.msg) h += '<p class="warn" role="status">' + esc(ui.msg) + '</p>';
    if (st === 'pend') {
      h += '<div class="plan"><b>' + t('cl.pend') + '</b><p>' + esc(t('cl.pendWhen', when(Cloud.del.until))) + '</p><p class="note">' + esc(t('cl.pendP', rankText(d.rp), L.num(d.coins))) + '</p>' +
        '<div class="row">' + btn('cloudLetGo', 'cl.letGo') + btn('cloudRestore', 'cl.restore', true) + '</div></div>';
    }
    h += srBlock();
    if (st !== 'pend') {
      h += '<h3>' + t('cl.move') + '</h3><p>' + t('cl.moveP') + '</p>';
      if (ui.code && ui.codeExp > Date.now()) {
        h += '<p class="note">' + esc(t('cl.codeIs', 10)) + '</p><div class="roomcode xfer" aria-label="' + esc(ui.code) + '">' + esc(ui.code) + '</div><p class="warn">' + t('cl.codeWarn') + '</p>';
      } else h += '<div class="row">' + btn('cloudCode', 'cl.getCode') + '</div>';
      h += '<h3>' + t('cl.enter') + '</h3><div class="joinrow"><input id="clCode" type="text" inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" placeholder="' + esc(t('cl.enterPh')) + '" value="' + esc(ui.entered) + '">' +
        btn('cloudPeek', 'cl.check') + '</div>';
      if (ui.peek) {
        var p = ui.peek;
        h += '<div class="plan"><b>' + t('cl.found') + '</b><p>' + esc(t('cl.foundRow', nameOf(p.name, p.pub), rankText(p.rp), L.num(p.coins), p.games)) + '</p>';
        if (p.same) h += '<p class="note">' + t('cl.same') + '</p></div>';
        else h += '<p class="warn">' + esc(t('cl.replace', rankText(d.rp), L.num(d.coins))) + '</p><div class="row">' + btn('cloudUse', 'cl.use', true) + '</div></div>';
      }
    }
    if (Cloud.cred) {
      h += '<h3>' + t('cl.del') + '</h3><p class="note">' + esc(ui.del ? t('cl.delWhen', when(Cloud.now() + 30 * 86400000)) : t('cl.delP')) + '</p><div class="row">' +
        (ui.del ? btn('cloudDelNo', 'cancel') + btn('cloudDelYes', 'cl.delYes') : btn('cloudDel', 'cl.del')) + '</div>';
    }
    h += '<p class="note"><a href="privacy.html" target="_blank" rel="noopener">' + t('cl.privacy') + '</a></p>';
    return h + '<div class="row">' + btn('close', 'done', true) + '</div>';
  };
  function refresh() {
    var sh = App.sheet(), e;
    if (sh === 'cloud') { if (document.activeElement && document.activeElement.id === 'clCode') { e = $('clState'); if (e) e.textContent = stateText(); } else App.openSheet('cloud'); }
    else if (sh === 'profile') { if (document.activeElement && document.activeElement.id === 'pName') { e = $('clState'); if (e) e.textContent = stateText(); } else App.openSheet('profile'); }
  }
  function say(b) { return t(b && b.why === 'slow' ? 'cl.slow' : b && b.why === 'code' ? 'cl.badCode' : 'cl.err'); }
  App.acts.cloudCode = function () {
    if (ui.wait) return;
    ui.wait = true; ui.msg = '';
    Cloud.code().then(function (b) {
      ui.wait = false;
      if (b && b.ok && b.code) { ui.code = b.code; ui.codeExp = Date.now() + 10 * 60000 - 5000; }
      else ui.msg = say(b);
      if (App.sheet() === 'cloud') App.openSheet('cloud');
    });
  };
  App.acts.cloudPeek = function () {
    var e = $('clCode');
    if (e) ui.entered = e.value;
    if (ui.wait || !ui.entered.replace(/[^A-Za-z0-9]/g, '')) return;
    ui.wait = true; ui.msg = ''; ui.peek = null;
    Cloud.redeem(ui.entered, false).then(function (b) {
      ui.wait = false;
      if (b && b.ok && b.peek) ui.peek = b.peek; else ui.msg = say(b);
      if (App.sheet() === 'cloud') App.openSheet('cloud');
    });
  };
  App.acts.cloudUse = function () {
    if (ui.wait || !ui.peek) return;
    ui.wait = true; ui.msg = '';
    Cloud.redeem(ui.entered, true).then(function (b) {
      ui.wait = false;
      if (b && b.ok) { ui.peek = null; ui.entered = ''; ui.code = ''; App.sfx.play('win'); App.toast(t('cl.moved'), 3200); Cloud._forget(); }
      else { ui.peek = null; ui.msg = say(b); }
      if (App.sheet() === 'cloud') App.openSheet('cloud');
    });
  };
  App.acts.cloudRestore = function () {
    if (ui.wait) return;
    ui.wait = true; ui.msg = '';
    Cloud.restore().then(function (b) {
      ui.wait = false;
      if (b && b.ok) { App.sfx.play('win'); App.toast(t('cl.restored'), 3200); Cloud._forget(); App.applyLook(); }
      else ui.msg = b && b.why === 'purged' ? t('cl.purged') : say(b);
      refresh();
    });
  };
  App.acts.cloudLetGo = function () { Cloud.letGo(); App.acts.cloudStart(); };
  App.acts.cloudDel = function () { ui.del = true; App.openSheet('cloud'); };
  App.acts.cloudDelNo = function () { ui.del = false; App.openSheet('cloud'); };
  App.acts.cloudDelYes = function () {
    if (ui.wait) return;
    ui.wait = true; ui.msg = '';
    Cloud.wipe().then(function (b) {
      ui.wait = false; ui.del = false; ui.code = '';
      if (b && b.ok) { App.toast(t('cl.deleted'), 3200); Cloud._forget(); } else ui.msg = say(b);
      if (App.sheet() === 'cloud') App.openSheet('cloud');
    });
  };
  App.inputs.push(function (el) {
    if (el.id !== 'clCode') return false;
    ui.entered = el.value;
    return true;
  });

  // ---------- leaderboards ----------
  var BOARDS = ['rp', 'score', 'sprint', 'wx', 'wxr'];
  function valueOf(b, v) {
    if (b === 'rp') return '<small>' + esc(rankText(v)) + '</small>' + L.num(v);
    return b === 'sprint' ? App.fmtTime(v) : L.num(v);
  }
  function fetchBoard() {
    var ask = ++lb.ask, b = lb.b, scope = b === 'rp' ? 'season' : lb.scope;
    lb.state = 'load'; lb.data = null;
    Cloud.board(b, scope).then(function (data) {
      if (ask !== lb.ask) return;
      lb.data = data; lb.state = data ? 'ok' : 'fail';
      if (App.sheet() === 'board') App.openSheet('board');
    });
  }
  App.dismiss.board = 1;
  App.sheets.board = function () {
    var h = '<h2>' + t('m.board') + '</h2><div class="tabs" role="tablist">', i, b = lb.b;
    for (i = 0; i < BOARDS.length; i++) h += '<button type="button" role="tab" aria-selected="' + (b === BOARDS[i]) + '" data-lb="' + BOARDS[i] + '">' + t('lb.' + BOARDS[i]) + '</button>';
    h += '</div>';
    if (b !== 'rp') {
      h += '<div class="seg" role="radiogroup" aria-label="' + esc(t('lb.season')) + '">' +
        ['season', 'all'].map(function (s) { return '<button type="button" role="radio" aria-checked="' + (lb.scope === s) + '" data-lbs="' + s + '">' + t('lb.' + s) + '</button>'; }).join('') + '</div>';
    }
    if (lb.state === 'load' || lb.state === 'idle') h += '<p class="note lb-wait">' + t('lb.loading') + '</p>';
    else if (lb.state === 'fail') h += '<p class="warn">' + t('lb.fail') + '</p><div class="row">' + btn('boardRetry', 'lb.retry') + '</div>';
    else {
      var d = lb.data, top = d.top || [], mine = false;
      if (!top.length) h += '<p class="lb-none">' + t('lb.empty') + '</p>';
      else {
        h += '<ol class="lb">';
        for (i = 0; i < top.length; i++) {
          var r = top[i], me = !!Cloud.pub && r.p === Cloud.pub;
          if (me) mine = true;
          h += '<li' + (me ? ' class="me"' : '') + '><i>' + (i + 1) + '</i><b>' + esc(nameOf(r.n, r.p)) + (me ? '<em>' + t('lb.you') + '</em>' : '') + (r.lv ? '<small>' + t('xp.lv', r.lv) + (r.t && L.has('tt.' + r.t) ? ' · ' + esc(t('tt.' + r.t)) : '') + '</small>' : '') + '</b><span>' + valueOf(b, r.v) + '</span></li>';
        }
        h += '</ol>';
      }
      if (d.me && !mine) h += '<ol class="lb solo"><li class="me"><i>' + d.me.rank + '</i><b>' + esc(nameOf(Meta.data.name, Cloud.pub)) + '<em>' + t('lb.you') + '</em></b><span>' + valueOf(b, d.me.v) + '</span></li></ol>';
      else if (d.me) h += '<p class="note">' + esc(t('lb.me', d.me.rank)) + '</p>';
      else h += '<p class="note">' + t('lb.none.' + b) + '</p>';
      if (b === 'rp' || lb.scope === 'season') h += '<p class="note">' + esc(t('lb.seasonNote', d.season || Meta.seasonId())) + '</p>';
    }
    return h + '<div class="row">' + btn('close', 'close', true) + '</div>';
  };
  var boardWasOpen = false;
  App.opened.board = function () {
    if (!boardWasOpen) { boardWasOpen = true; fetchBoard(); }
  };
  App.closed.board = function () { boardWasOpen = false; lb.state = 'idle'; lb.data = null; lb.ask++; };
  App.acts.boardRetry = function () { Cloud._forget(); fetchBoard(); App.openSheet('board'); };
  App.acts.board = function () { App.openSheet('board'); };
  App.clicks.push(function (d) {
    if (d.lb) { if (d.lb !== lb.b) { lb.b = d.lb; fetchBoard(); App.openSheet('board'); App.el.sheetCard.scrollTop = 0; } return true; }
    if (d.lbs) { if (d.lbs !== lb.scope) { lb.scope = d.lbs; fetchBoard(); App.openSheet('board'); } return true; }
    return false;
  });

  // ---------- wiring ----------
  function showLink() { var e = $('mBoard'); if (e) e.hidden = !Cloud.on; }
  var wasOn = null;
  Cloud.onChange = function () {
    showLink();
    refresh();
    // the online lobby words its note by whether the relay is there; redraw it once that is known
    if (wasOn !== Cloud.hosted()) {
      wasOn = Cloud.hosted();
      var net = ZZ.Net, active = document.activeElement;
      if (App.sheet() === 'online' && net && (net.state === 'idle' || net.state === 'error') && !(active && active.id === 'nCode')) App.openSheet('online');
    }
  };
  Cloud.onNote = function (kind) { App.toast(t(kind === 'lost' ? 'cl.lost' : kind === 'pending' ? 'cl.pending' : kind === 'stale' ? 'cl.stale' : 'cl.rejected'), kind === 'stale' || kind === 'pending' ? 7000 : 4600); };
  Cloud.onAdopt = function (any, look) {
    // progress kept with the settings follows the record: drills passed, so a second device does not start the dojo over
    var done = Meta.data.first.drills, sv = App.save, top = 0, i;
    for (i = 0; i < done.length; i++) top = Math.max(top, done[i] + 1);
    if (top > sv.dojo) { sv.dojo = top; App.saveStore(); }
    if (look) App.applyLook();
    if (!any) return;
    var sh = App.sheet(), active = document.activeElement;
    if ((sh === 'shop' || sh === 'jobs' || sh === 'rank' || sh === 'battle' || sh === 'boxes') && !(active && /^(INPUT|SELECT)$/.test(active.tagName))) App.openSheet(sh);
    else refresh();
    if (App.screen() === 'menu') App.updateMenu();
  };
  // First among the start-up steps, so that nothing the others do goes unheard.
  App.boot.unshift(function () {
    var local = false;
    try { local = !/^https?:$/.test(window.location.protocol) || /[?&]cloud=off\b/.test(window.location.search); } catch (e) { local = true; }
    Cloud.init({ local: local });
    showLink();
    window.addEventListener('online', function () { Cloud.fails = 0; if (Cloud.on) Cloud.flush(true); else if (!Cloud.dead) Cloud.probe(); else Cloud.recheck(); });
    window.addEventListener('pagehide', function () { Cloud.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Cloud.on && Cloud.cred && Date.now() - Cloud.last > 60000) Cloud.flush(true);
    });
    window.addEventListener('storage', function (e) { if (e.key === KEY) Cloud.follow(); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
