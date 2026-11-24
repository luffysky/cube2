/* What the brick games pay into 轉磚's coins, and how a finished game gets there.

   The same rules run in three places: the mini game (to show what is coming), 轉磚's page (Meta.miniDone, which
   pays it) and the server (which repeats Meta.miniDone on its own copy; its answer is the one that counts).

   A mini game is a page of its own, so it does not touch the record itself: it leaves the result in a queue in this
   browser's storage. The next time 轉磚 opens (here, on the same site) it takes the queue, pays each result through
   Meta, and, when the player has a cloud save, the server checks it: a result may not claim more than the time it
   says it took could produce, and mini games pay at most DAY_CAP coins a day. (For now they pay none: a result cannot
   be checked by the server yet, so only the record and the stars count. coins() stays for when there is a proof.)

   Kinds of game:
     score   paid by the score, more on harder difficulties            (snake, breakout, stack, merge)
     time    paid for finishing, by difficulty, and a little for a new best time   (pipes, sweep)
     levels  paid once for the first clear of a level, and again for more stars    (push, sort, picross) */
(function (root) {
  'use strict';
  var DAY_CAP = 300, QUEUE = 'snowrealm.mini.queue', QUEUE_MAX = 40;
  var GAMES = {
    snake: { kind: 'score', per: 40, name: '磚蛇' },
    breakout: { kind: 'score', per: 60, name: '打磚塊' },
    stack: { kind: 'score', per: 3, name: '疊磚塔' },
    merge: { kind: 'score', per: 150, name: '磚塊合成' },
    pipes: { kind: 'time', name: '磚道' },
    sweep: { kind: 'time', name: '掃磚' },
    push: { kind: 'levels', count: 60, name: '推磚倉庫' },
    sort: { kind: 'levels', count: 60, name: '分磚' },
    picross: { kind: 'levels', count: 26, name: '磚畫謎' }
  };
  var LV = ['easy', 'normal', 'hard'], MULT = [0.6, 1, 1.5], TIME_PAY = [5, 10, 20], SCORE_CAP = 30;
  function int(v, lo, hi) { v = Math.round(+v || 0); return v < lo ? lo : v > hi ? hi : v; }

  // The coins one result is worth, before the daily cap. prev: what the record already holds for this game
  // (score games: best per difficulty [e, n, h]; time games: best time per difficulty in ms; levels: a string of stars).
  //   r: { game, lv (0 1 2), value (score, time in ms, or level number from 0), stars (levels), ms (how long it took) }
  function coins(r, prev) {
    var g = GAMES[r.game];
    if (!g) return 0;
    var lv = int(r.lv, 0, 2), ms = Math.max(0, +r.ms || 0);
    // nothing earns faster than one coin per three seconds played
    var limit = Math.floor(ms / 3000);
    if (g.kind === 'score') return Math.min(limit, SCORE_CAP, Math.floor(Math.max(0, +r.value || 0) / g.per * MULT[lv]));
    if (g.kind === 'time') {
      var best = prev && +prev[lv] || 0, t = Math.max(0, +r.value || 0);
      return Math.min(limit + 5, TIME_PAY[lv] + (best && t < best ? 5 : 0));
    }
    var n = int(r.value, 0, g.count - 1), had = prev ? +String(prev).charAt(n) || 0 : 0, st = int(r.stars, 1, 3);
    if (st <= had) return 0;
    return Math.min(limit + 5, (had ? 0 : 10) + (st - had) * 5);
  }
  // the record a result leaves behind (best score, best time, stars)
  function record(r, prev) {
    var g = GAMES[r.game], lv = int(r.lv, 0, 2);
    if (g.kind === 'levels') {
      var s = String(prev || ''), n = int(r.value, 0, g.count - 1), st = int(r.stars, 1, 3);
      while (s.length < n + 1) s += '0';
      if (st > +s.charAt(n)) s = s.slice(0, n) + st + s.slice(n + 1);
      return s;
    }
    var out = (prev && prev.length === 3 ? prev : [0, 0, 0]).slice(), v = Math.max(0, Math.round(+r.value || 0));
    if (g.kind === 'score') { if (v > out[lv]) out[lv] = v; }
    else if (v > 0 && (!out[lv] || v < out[lv])) out[lv] = v;
    return out;
  }

  // ---------- the queue (in the browser) ----------
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function readQueue() { var s = store(); try { var q = JSON.parse((s && s.getItem(QUEUE)) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
  // 轉磚's own record on this device, read only, for showing what a result is likely to pay
  function localRecord() { var s = store(); try { return JSON.parse((s && s.getItem('zhuanzhuan.meta.v1')) || 'null'); } catch (e) { return null; } }
  // A mini game calls this when a game ends. Gives the coins it should bring (an estimate until 轉磚 pays it).
  function report(r) {
    var g = GAMES[r.game];
    if (!g) return 0;
    var rec = localRecord(), mini = rec && rec.mini || {}, prev = mini[r.game], q = readQueue();
    // results already waiting in the queue count as if paid, so the estimate does not pay the same thing twice
    q.forEach(function (o) { if (o.game === r.game) prev = record(o, prev); });
    // a brick game's result cannot be checked by the server yet, so it pays no coins (the record and stars still count)
    var c = 0;
    q.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), game: r.game, lv: int(r.lv, 0, 2), value: Math.max(0, Math.round(+r.value || 0)), stars: int(r.stars, 0, 3), ms: Math.round(Math.max(0, +r.ms || 0)), at: Date.now(), est: c });
    var s = store();
    try { if (s) s.setItem(QUEUE, JSON.stringify(q.slice(-QUEUE_MAX))); } catch (e) { /* not kept */ }
    return c;
  }
  // 轉磚 takes the queue (and empties it) when it opens
  function take() { var q = readQueue(), s = store(); try { if (s) s.removeItem(QUEUE); } catch (e) { /* fine */ } return q; }
  function waiting() { return readQueue().reduce(function (a, o) { return a + (o.est || 0); }, 0); }
  function balance() { var rec = localRecord(); return rec && typeof rec.coins === 'number' ? rec.coins : null; }

  // In a mini game's result card: report the result and say what it brings, under the element given.
  function show(after, r) {
    var c = report(r), doc = root.document;
    if (!doc || !after || !after.parentNode) return c;
    var old = after.parentNode.querySelector('.coins');
    if (old) old.remove();
    var p = doc.createElement('p');
    p.className = 'coins';
    var W = root.SRW, T = function () { return W ? W.t.apply(null, arguments) : arguments[0]; };
    p.innerHTML = T('rw.records');
    after.parentNode.insertBefore(p, after.nextSibling);
    return c;
  }
  // stars a level game already has in 轉磚's record (from another device through the cloud save), as { level: stars }
  function stars(game) {
    var rec = localRecord(), v = rec && rec.mini && rec.mini[game], out = {};
    String(v || '').split('').forEach(function (c, i) { if (+c > 0) out[i] = +c; });
    return out;
  }
  var api = { GAMES: GAMES, LV: LV, DAY_CAP: DAY_CAP, QUEUE: QUEUE, coins: coins, record: record, report: report, show: show, stars: stars, take: take, waiting: waiting, balance: balance };
  root.SnowRealmMini = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
