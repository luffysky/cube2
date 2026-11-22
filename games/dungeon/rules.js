/* 地城小隊 (Dungeon Party): the rules. One to four heroes go down five floors together; the last one is the Dungeon
   Lord's. A floor is a fight in rounds: every hero picks what to do (attack, the class skill, or guard), and once all
   have picked (or the time is up: those who have not, guard) the heroes act, fastest first, then the monsters. A
   cleared floor gives each hero a choice of three upgrades. Everyone down is the end; the Lord down is the win.

   The room's host keeps the one true copy of the game and runs these rules; the others send what they picked and
   are sent the new state (DG.clean checks every field of it before a page uses it). Kept apart from the screen so
   it can be tested without a browser. Same rules on every page: window.DG, or module.exports under Node. */
(function (root) {
  'use strict';
  var CLASSES = {
    warrior: { hp: 120, mp: 30, atk: 14, df: 6, spd: 2, skill: 'taunt', cost: 10 },
    ranger: { hp: 85, mp: 40, atk: 16, df: 3, spd: 4, skill: 'volley', cost: 12 },
    mage: { hp: 80, mp: 60, atk: 10, df: 2, spd: 3, skill: 'fireball', cost: 15 },
    cleric: { hp: 92, mp: 50, atk: 10, df: 4, spd: 1, skill: 'heal', cost: 12, heal: 8 }
  };
  var MONSTERS = {
    slime: { hp: 30, atk: 8, df: 0, spd: 1 },
    goblin: { hp: 40, atk: 11, df: 2, spd: 3 },
    bat: { hp: 26, atk: 9, df: 0, spd: 5 },
    skeleton: { hp: 55, atk: 13, df: 4, spd: 2 },
    archer: { hp: 40, atk: 15, df: 2, spd: 4, aim: 'low' },
    wolf: { hp: 45, atk: 12, df: 2, spd: 5 },
    orc: { hp: 110, atk: 18, df: 5, spd: 1 },
    lord: { hp: 300, atk: 21, df: 6, spd: 2, boss: true }
  };
  var FLOORS = [['slime', 'slime'], ['goblin', 'goblin', 'bat'], ['skeleton', 'skeleton', 'archer'], ['wolf', 'orc', 'wolf'], ['lord']];
  var UPS = ['hp', 'atk', 'def', 'mp', 'pot'];
  var KINDS = ['atk', 'skill', 'guard'], PHASES = ['fight', 'loot', 'win', 'lose'];
  var DG = {
    CLASSES: CLASSES, MONSTERS: MONSTERS, FLOORS: FLOORS, UPS: UPS, MAX: 4,
    ROUND_MS: 30000,       // a round waits this long for picks, then those who have not picked guard
    LOOT_MS: 30000,        // and the upgrade choice this long, then the first offer is taken
    LOG: 16,               // log lines kept
    REGEN: 4,              // magic back every round
    REVIVE: 25,            // the cleric's heal on a hero who is down costs this much and brings them back
    // monsters' hit points and strength by the number of heroes (1 to 4); found by playing the rules many times over
    SCALE: { hp: [0, 1, 1.6, 2.2, 2.8], atk: [0, 0.6, 0.85, 1.12, 1.05], boss: [0, 0.6, 1.2, 1.9, 1.85], acts: [0, 1, 1, 1, 2] }
  };
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function hit(atk, df, rng) {
    var crit = rng() < 0.1, d = atk * (0.85 + 0.3 * rng()) * (crit ? 1.5 : 1) - df / 2;
    return { d: Math.max(1, Math.round(d)), c: crit };
  }
  function alive(list) { return list.filter(function (x) { return x.hp > 0; }); }
  function heroAt(st, seat) { for (var i = 0; i < st.h.length; i++) if (st.h[i].s === seat) return st.h[i]; return null; }
  function say(st, line) { st.log.push(line); if (st.log.length > DG.LOG) st.log.splice(0, st.log.length - DG.LOG); }
  function spawn(st) {
    var n = st.h.length;
    // a smaller party meets fewer and weaker monsters (alone: at most two at a time)
    st.m = FLOORS[st.fl - 1].slice(0, n + 1).map(function (k) {
      var b = MONSTERS[k], hp = Math.round(b.hp * (b.boss ? DG.SCALE.boss : DG.SCALE.hp)[n]);
      return { k: k, hp: hp, mh: hp, atk: Math.round(b.atk * DG.SCALE.atk[n]), df: b.df, spd: b.spd, rg: 0 };
    });
  }
  // players: [{ s: seat, n: name, c: class }] in seat order
  DG.newGame = function (players) {
    var st = { v: 1, ph: 'fight', fl: 1, rd: 1, h: [], m: [], log: [], up: {} };
    players.slice(0, DG.MAX).forEach(function (p) {
      var c = CLASSES[p.c] ? p.c : 'warrior', b = CLASSES[c];
      st.h.push({ s: p.s, n: String(p.n || '').slice(0, 16), c: c, hp: b.hp, mh: b.hp, mp: b.mp, mm: b.mp, atk: b.atk, df: b.df, spd: b.spd, tn: 0, gd: 0, a: null, off: false, pk: '' });
    });
    spawn(st);
    say(st, ['floor', 1]);
    return st;
  };
  // a hero's pick for this round: { k: 'atk', t: monster } · { k: 'skill', t: seat (heal) } · { k: 'guard' }
  DG.choose = function (st, seat, a) {
    var h = heroAt(st, seat);
    if (st.ph !== 'fight' || !h || h.hp <= 0 || !a || KINDS.indexOf(a.k) < 0) return 'no';
    var out = { k: a.k };
    if (a.k === 'atk') {
      var t = Math.floor(+a.t);
      if (!(t >= 0 && t < st.m.length) || st.m[t].hp <= 0) return 'target';
      out.t = t;
    } else if (a.k === 'skill') {
      var cl = CLASSES[h.c];
      if (h.c === 'cleric') {
        var who = heroAt(st, Math.floor(+a.t));
        if (!who) return 'target';
        if (who.hp <= 0 ? h.mp < DG.REVIVE : (h.mp < cl.cost || who.hp >= who.mh)) return who.hp <= 0 ? 'mp' : h.mp < cl.cost ? 'mp' : 'full';
        out.t = who.s;
      } else if (h.mp < cl.cost) return 'mp';
    }
    h.a = out;
    return '';
  };
  // everyone who can act has picked
  DG.ready = function (st) { return st.ph === 'fight' && st.h.every(function (h) { return h.hp <= 0 || h.a; }); };
  DG.pickedAll = function (st) { return st.ph === 'loot' && st.h.every(function (h) { return h.pk; }); };
  function firstAlive(st) { for (var i = 0; i < st.m.length; i++) if (st.m[i].hp > 0) return i; return -1; }
  function strike(st, h, i, atk, rng) {
    var m = st.m[i], r = hit(atk, m.df, rng);
    m.hp = Math.max(0, m.hp - r.d);
    if (m.hp <= 0) say(st, ['kill', h.s, i]);
    return r;
  }
  function heroTurn(st, h, rng) {
    var a = h.a || { k: 'guard' }, cl = CLASSES[h.c], i, r, total, who;
    if (a.k === 'atk') {
      i = st.m[a.t] && st.m[a.t].hp > 0 ? a.t : firstAlive(st);
      if (i < 0) return;
      r = strike(st, h, i, h.atk, rng);
      say(st, ['atk', h.s, i, r.d, r.c ? 1 : 0]);
    } else if (a.k === 'skill') {
      if (h.c === 'warrior') { h.mp -= cl.cost; h.tn = 2; h.gd = 1; say(st, ['taunt', h.s]); }
      else if (h.c === 'ranger') {
        h.mp -= cl.cost; total = 0;
        for (var k = 0; k < 3; k++) {
          var left = []; st.m.forEach(function (m, j) { if (m.hp > 0) left.push(j); });
          if (!left.length) break;
          total += strike(st, h, left[Math.floor(rng() * left.length)], Math.round(h.atk * 0.7), rng).d;
        }
        say(st, ['volley', h.s, total]);
      } else if (h.c === 'mage') {
        h.mp -= cl.cost; total = 0;
        st.m.forEach(function (m, j) { if (m.hp > 0) total += strike(st, h, j, h.atk + 10, rng).d; });
        say(st, ['fire', h.s, total]);
      } else {
        who = heroAt(st, a.t);
        if (!who) return;
        if (who.hp <= 0) {
          if (h.mp < DG.REVIVE) return;
          h.mp -= DG.REVIVE; who.hp = Math.round(who.mh * 0.4);
          say(st, ['revive', h.s, who.s]);
        } else {
          if (h.mp < cl.cost) return;
          h.mp -= cl.cost;
          var amt = Math.min(who.mh - who.hp, cl.heal + h.atk);
          who.hp += amt;
          say(st, ['heal', h.s, who.s, amt]);
        }
      }
    } else {
      // guarding: half the damage this round, some breath back
      h.mp = Math.min(h.mm, h.mp + 8); h.hp = Math.min(h.mh, h.hp + Math.round(h.mh * 0.06));
      say(st, ['guard', h.s]);
    }
  }
  function monsterTurn(st, m, i, rng, again) {
    var up = alive(st.h);
    if (!up.length) return;
    // the Lord at half its strength gets angry once; and every third round breathes black fire on everyone
    if (MONSTERS[m.k].boss && !m.rg && m.hp * 2 <= m.mh) { m.rg = 1; m.atk = Math.round(m.atk * 1.3); say(st, ['rage', i]); }
    if (MONSTERS[m.k].boss && st.rd % 3 === 0 && !again) {
      var total = 0;
      up.forEach(function (h) { var d = hit(Math.round(m.atk * 0.65), h.df, rng).d; if (h.gd) d = Math.ceil(d / 2); h.hp = Math.max(0, h.hp - d); total += d; if (h.hp <= 0) say(st, ['down', h.s]); });
      say(st, ['aoe', i, total]);
      return;
    }
    var taunt = up.filter(function (h) { return h.tn > 0; }), h;
    if (taunt.length) h = taunt[0];
    else if (MONSTERS[m.k].aim === 'low') h = up.slice().sort(function (a, b) { return a.hp - b.hp || a.s - b.s; })[0];
    else h = up[Math.floor(rng() * up.length)];
    var r = hit(m.atk, h.df, rng), d = h.gd ? Math.ceil(r.d / 2) : r.d;
    h.hp = Math.max(0, h.hp - d);
    say(st, ['hit', i, h.s, d, r.c ? 1 : 0]);
    if (h.hp <= 0) say(st, ['down', h.s]);
  }
  function offers(rng) {
    var pool = UPS.slice(), out = [];
    while (out.length < 3) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }
  // the round is played out (anybody who has not picked guards)
  DG.resolve = function (st, rng) {
    if (st.ph !== 'fight') return false;
    rng = rng || Math.random;
    st.h.forEach(function (h) { if (h.hp > 0 && !h.a) h.a = { k: 'guard' }; if (h.a && (h.a.k === 'guard' || (h.a.k === 'skill' && h.c === 'warrior'))) h.gd = 1; });
    say(st, ['round', st.rd]);
    var order = alive(st.h).sort(function (a, b) { return b.spd - a.spd || a.s - b.s; });
    for (var i = 0; i < order.length && firstAlive(st) >= 0; i++) if (order[i].hp > 0) heroTurn(st, order[i], rng);
    if (firstAlive(st) >= 0) {
      var ms = st.m.map(function (m, j) { return j; }).filter(function (j) { return st.m[j].hp > 0; }).sort(function (a, b) { return st.m[b].spd - st.m[a].spd || a - b; });
      // the Lord acts more than once against a big party
      ms.forEach(function (j) { var n = MONSTERS[st.m[j].k].boss ? DG.SCALE.acts[st.h.length] : 1; for (var k = 0; k < n; k++) if (st.m[j].hp > 0) monsterTurn(st, st.m[j], j, rng, k); });
    }
    st.h.forEach(function (h) { h.a = null; h.gd = 0; if (h.tn > 0) h.tn--; if (h.hp > 0) h.mp = Math.min(h.mm, h.mp + DG.REGEN); });
    st.rd++;
    if (!alive(st.h).length) { st.ph = 'lose'; say(st, ['lose']); }
    else if (firstAlive(st) < 0) {
      if (st.fl >= FLOORS.length) { st.ph = 'win'; say(st, ['win']); }
      else {
        st.ph = 'loot'; st.up = {};
        st.h.forEach(function (h) { h.pk = ''; st.up[h.s] = offers(rng); });
        say(st, ['clear', st.fl]);
      }
    }
    return true;
  };
  // one hero takes one of the three upgrades offered
  DG.pick = function (st, seat, id) {
    var h = heroAt(st, seat), list = st.up[seat];
    if (st.ph !== 'loot' || !h || h.pk || !list || list.indexOf(id) < 0) return 'no';
    if (id === 'hp') { h.mh += 20; h.hp += 20; }
    else if (id === 'atk') h.atk += 3;
    else if (id === 'def') h.df += 2;
    else if (id === 'mp') { h.mm += 15; h.mp += 15; }
    else { h.hp = Math.max(h.hp, h.mh); h.mp = h.mm; }
    if (h.hp <= 0 && id !== 'pot') h.hp = 0;
    h.pk = id;
    return '';
  };
  // the next floor (whoever has not chosen gets the first offer); the fallen come back, everyone gets some strength back
  DG.next = function (st) {
    if (st.ph !== 'loot') return false;
    st.h.forEach(function (h) { if (!h.pk) DG.pick(st, h.s, st.up[h.s][0]); });
    st.fl++; st.rd = 1; st.ph = 'fight'; st.up = {};
    st.h.forEach(function (h) {
      h.pk = '';
      h.hp = h.hp <= 0 ? Math.round(h.mh * 0.5) : Math.min(h.mh, h.hp + Math.round(h.mh * 0.4));
      h.mp = Math.min(h.mm, h.mp + Math.round(h.mm * 0.5));
    });
    spawn(st);
    say(st, ['floor', st.fl]);
    return true;
  };
  // the host lost touch with a player (or got it back): an absent hero simply guards
  DG.setOff = function (st, seat, off) { var h = heroAt(st, seat); if (h) h.off = !!off; };
  DG.hero = heroAt;

  // ---------- a state that came over the wire: every field checked, a fresh copy made, or null ----------
  function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null; }
  function word(v, max) { return typeof v === 'string' && v.length <= max ? v : null; }
  DG.clean = function (s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || PHASES.indexOf(s.ph) < 0) return null;
    var out = { v: 1, ph: s.ph, fl: num(s.fl, 1, FLOORS.length), rd: num(s.rd, 1, 9999), h: [], m: [], log: [], up: {} };
    if (out.fl === null || out.rd === null || !Array.isArray(s.h) || !s.h.length || s.h.length > DG.MAX || !Array.isArray(s.m) || s.m.length > 6 || !Array.isArray(s.log) || s.log.length > DG.LOG) return null;
    for (var i = 0; i < s.h.length; i++) {
      var h = s.h[i] || {}, c = {
        s: num(h.s, 0, 7), n: word(h.n, 16), c: CLASSES[h.c] ? h.c : null, hp: num(h.hp, 0, 9999), mh: num(h.mh, 1, 9999), mp: num(h.mp, 0, 9999), mm: num(h.mm, 0, 9999),
        atk: num(h.atk, 0, 999), df: num(h.df, 0, 999), spd: num(h.spd, 0, 99), tn: num(h.tn, 0, 9), gd: num(h.gd, 0, 1), a: null, off: !!h.off, pk: h.pk === '' || UPS.indexOf(h.pk) >= 0 ? h.pk : null
      };
      for (var k in c) if (c[k] === null && k !== 'a') return null;
      if (h.a && typeof h.a === 'object' && KINDS.indexOf(h.a.k) >= 0) c.a = { k: h.a.k };      // only that a pick was made shows
      out.h.push(c);
    }
    for (i = 0; i < s.m.length; i++) {
      var m = s.m[i] || {}, d = { k: MONSTERS[m.k] ? m.k : null, hp: num(m.hp, 0, 99999), mh: num(m.mh, 1, 99999), atk: num(m.atk, 0, 999), df: num(m.df, 0, 999), spd: num(m.spd, 0, 99), rg: num(m.rg, 0, 1) };
      for (k in d) if (d[k] === null) return null;
      out.m.push(d);
    }
    for (i = 0; i < s.log.length; i++) {
      var l = s.log[i];
      if (!Array.isArray(l) || !l.length || l.length > 5 || typeof l[0] !== 'string' || l[0].length > 8) return null;
      for (var j = 1; j < l.length; j++) if (num(l[j], 0, 99999) === null) return null;
      out.log.push(l.slice());
    }
    if (s.up && typeof s.up === 'object') for (k in s.up) {
      var list = s.up[k];
      if (!/^[0-7]$/.test(k) || !Array.isArray(list) || list.length !== 3 || !list.every(function (u) { return UPS.indexOf(u) >= 0; })) return null;
      out.up[k] = list.slice();
    }
    return out;
  };
  // what a page sends to the others: the state without anyone's pick for this round (only that one was made)
  DG.wire = function (st) {
    var c = JSON.parse(JSON.stringify(st));
    c.h.forEach(function (h) { if (h.a) h.a = { k: h.a.k }; });
    return c;
  };

  root.DG = DG;
  if (typeof module !== 'undefined' && module.exports) module.exports = DG;
})(typeof window !== 'undefined' ? window : globalThis);
