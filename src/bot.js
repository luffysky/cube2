/* 轉磚 bot: reachability search over real inputs, board evaluation, the computer opponent,
   the T-spin radar and the drill solver. Pure logic, no DOM. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ || require('./engine.js');
  var COLS = ZZ.COLS, ROWS = ZZ.ROWS, TOP = ZZ.TOP, SHAPES = ZZ.SHAPES, FULL = (1 << COLS) - 1;

  // Search state: (x, y, rot) packed into one index. x runs from -3 to 9.
  var W = 13, NS = ROWS * 4 * W;
  var seen = new Uint8Array(NS), par = new Int32Array(NS), pmv = new Int8Array(NS), qu = new Int32Array(NS);
  var spinFrom = new Int32Array(NS), spinMv = new Int8Array(NS), spinKick = new Int8Array(NS);
  var L = 0, R = 1, CW = 2, CCW = 3, SD = 4;

  function enc(x, y, rot) { return (y * 4 + rot) * W + x + 3; }

  function rowsOf(grid) {
    var rows = new Array(ROWS);
    for (var r = 0; r < ROWS; r++) {
      var m = 0, g = grid[r];
      for (var x = 0; x < COLS; x++) if (g[x]) m |= 1 << x;
      rows[r] = m;
    }
    return rows;
  }

  function fits(rows, type, rot, x, y) {
    var c = SHAPES[type][rot];
    for (var i = 0; i < 4; i++) {
      var cx = x + c[i][0], cy = y + c[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS || cy < 0) return false;
      if ((rows[cy] >> cx) & 1) return false;
    }
    return true;
  }

  function spawnPos(rows, type) {
    var x = type === 'O' ? 4 : 3, y = TOP - 2;
    if (!fits(rows, type, 0, x, y)) return null;
    if (fits(rows, type, 0, x, y + 1)) y++;
    return { x: x, y: y, rot: 0 };
  }

  function visit(n, from, mv, tailRef) {
    if (seen[n]) return;
    seen[n] = 1; par[n] = from; pmv[n] = mv; qu[tailRef.t++] = n;
  }

  // Breadth-first search over shifts, turns (with kicks) and drops. Returns every state where the piece rests on something.
  function reach(rows, type, sx, sy, srot) {
    var finals = [];
    seen.fill(0);
    spinFrom.fill(-1);
    if (!fits(rows, type, srot, sx, sy)) return finals;
    var head = 0, tail = { t: 0 }, start = enc(sx, sy, srot);
    seen[start] = 1; par[start] = -1; pmv[start] = -1; qu[tail.t++] = start;
    while (head < tail.t) {
      var s = qu[head++], xi = s % W, q = (s - xi) / W, rot = q & 3, y = q >> 2, x = xi - 3;
      var grounded = !fits(rows, type, rot, x, y + 1);
      if (grounded) finals.push(s);
      if (fits(rows, type, rot, x - 1, y)) visit(enc(x - 1, y, rot), s, L, tail);
      if (fits(rows, type, rot, x + 1, y)) visit(enc(x + 1, y, rot), s, R, tail);
      if (type !== 'O') {
        for (var m = CW; m <= CCW; m++) {
          var to = (rot + (m === CW ? 1 : 3)) & 3, ks = ZZ.kicksFor(type, rot, to);
          for (var i = 0; i < ks.length; i++) {
            var nx = x + ks[i][0], ny = y - ks[i][1];
            if (fits(rows, type, to, nx, ny)) {
              var n = enc(nx, ny, to);
              if (spinFrom[n] < 0 || (type === 'T' && i === 4 && spinKick[n] !== 4)) {
                spinFrom[n] = s; spinMv[n] = m; spinKick[n] = i;
              }
              visit(n, s, m, tail);
              break;
            }
          }
        }
      }
      if (!grounded) {
        var dy = y;
        while (fits(rows, type, rot, x, dy + 1)) dy++;
        visit(enc(x, dy, rot), s, SD, tail);
      }
    }
    return finals;
  }

  function pathOf(s, viaSpin) {
    var out = [];
    if (viaSpin) { out.push(spinMv[s]); s = spinFrom[s]; }
    while (par[s] >= 0) { out.push(pmv[s]); s = par[s]; }
    return out.reverse();
  }

  function occOf(rows) {
    return function (x, y) {
      if (x < 0 || x >= COLS || y >= ROWS) return 1;
      if (y < 0) return 0;
      return (rows[y] >> x) & 1;
    };
  }

  function cellKey(type, rot, x, y) {
    var c = SHAPES[type][rot], a = [];
    for (var i = 0; i < 4; i++) a.push((y + c[i][1]) * COLS + x + c[i][0]);
    a.sort(function (p, q) { return p - q; });
    return a[0] + a[1] * 400 + a[2] * 160000 + a[3] * 64000000;
  }

  // Distinct resting placements of one piece, each with the spin it would score if the last input is a turn.
  function placements(rows, type, sx, sy, srot) {
    var fin = reach(rows, type, sx, sy, srot || 0), out = [], idx = {}, occ = type === 'T' ? occOf(rows) : null;
    for (var i = 0; i < fin.length; i++) {
      var s = fin[i], xi = s % W, q = (s - xi) / W, rot = q & 3, y = q >> 2, x = xi - 3;
      var spin = 'none';
      if (spinFrom[s] >= 0) {
        if (type === 'T') spin = ZZ.tspinType(occ, x, y, rot, spinKick[s]);
        else if (!fits(rows, type, rot, x - 1, y) && !fits(rows, type, rot, x + 1, y) && !fits(rows, type, rot, x, y - 1)) spin = 'spin';
      }
      var key = cellKey(type, rot, x, y), p = { s: s, x: x, y: y, rot: rot, spin: spin };
      if (idx[key] === undefined) { idx[key] = out.length; out.push(p); }
      else if (spin !== 'none' && out[idx[key]].spin === 'none') out[idx[key]] = p;
    }
    return out;
  }

  // Straight drops only: used for the second ply, where speed matters more than tucks.
  function eachDrop(rows, type, fn) {
    var nrot = type === 'O' ? 1 : (type === 'I' || type === 'S' || type === 'Z') ? 2 : 4;
    for (var rot = 0; rot < nrot; rot++) {
      for (var x = -2; x < COLS; x++) {
        var y = TOP - 3;
        if (!fits(rows, type, rot, x, y)) continue;
        while (fits(rows, type, rot, x, y + 1)) y++;
        fn(rot, x, y);
      }
    }
  }

  function applyMove(rows, type, rot, x, y, spin, b2b, combo) {
    var r2 = rows.slice(), c = SHAPES[type][rot], above = true, i, r;
    for (i = 0; i < 4; i++) {
      var cy = y + c[i][1];
      r2[cy] |= 1 << (x + c[i][0]);
      if (cy >= TOP) above = false;
    }
    var lines = 0, w = ROWS - 1;
    for (r = ROWS - 1; r >= 0; r--) { if (r2[r] === FULL) lines++; else r2[w--] = r2[r]; }
    while (w >= 0) r2[w--] = 0;
    var res = { rows: r2, lines: lines, atk: 0, b2b: b2b, combo: -1, dead: above && !lines, spin: spin };
    if (lines) {
      var hard = lines === 4 || spin !== 'none';
      res.combo = combo + 1;
      res.atk = ZZ.calcAttack(lines, spin, hard && b2b >= 0, res.combo, r2[ROWS - 1] === 0);
      res.b2b = hard ? b2b + 1 : -1;
    }
    return res;
  }

  function pop(v) { var n = 0; while (v) { v &= v - 1; n++; } return n; }

  var hts = new Int32Array(COLS);
  var feat = { holes: 0, holeRows: 0, bump: 0, agg: 0, maxH: 0, wellDepth: 0, wellCol: 0, slot: 0 };

  function features(rows) {
    var top = 0, c, r;
    while (top < ROWS && !rows[top]) top++;
    for (c = 0; c < COLS; c++) hts[c] = 0;
    var mask = 0, holes = 0, holeRows = 0;
    for (r = top; r < ROWS; r++) {
      var row = rows[r], nw = row & ~mask;
      if (nw) for (c = 0; c < COLS; c++) if ((nw >> c) & 1) hts[c] = ROWS - r;
      mask |= row;
      var hl = mask & ~row & FULL;
      if (hl) { holeRows++; holes += pop(hl); }
    }
    var minH = 99, wc = 0, maxH = 0, agg = 0;
    for (c = 0; c < COLS; c++) {
      var h = hts[c];
      agg += h;
      if (h > maxH) maxH = h;
      if (h < minH || (h === minH && c === COLS - 1)) { minH = h; wc = c; }
    }
    var bump = 0, prev = -1;
    for (c = 0; c < COLS; c++) {
      if (c === wc) continue;
      if (prev >= 0) { var d = hts[c] - hts[prev]; bump += d < 0 ? -d : d; }
      prev = c;
    }
    var nb = 99;
    if (wc > 0) nb = Math.min(nb, hts[wc - 1]);
    if (wc < COLS - 1) nb = Math.min(nb, hts[wc + 1]);
    feat.holes = holes; feat.holeRows = holeRows; feat.bump = bump; feat.agg = agg; feat.maxH = maxH;
    feat.wellDepth = nb - minH; feat.wellCol = wc;
    return feat;
  }

  // T-spin double slot on the surface, read from the column heights left by features():
  // a notch one cell deep, an open neighbour level with its rim, and a roof two cells above the rim on the other side.
  // Returns 0 when there is none, otherwise how complete the two rows around it are (1 = ready to spin).
  function slotScore(rows) {
    var best = 0;
    for (var c = 1; c < COLS - 1; c++) {
      var k = hts[c], lo = ROWS - (k + 1), up = lo - 1, roof = lo - 2;
      if (roof < 0 || lo >= ROWS) continue;
      for (var side = -1; side <= 1; side += 2) {
        var o = c + side, s = c - side;
        if (hts[o] !== k + 1) continue;
        if (!((rows[lo] >> s) & 1) || ((rows[up] >> s) & 1) || !((rows[roof] >> s) & 1)) continue;
        var sc = (pop(rows[lo]) + pop(rows[up])) / 16;
        if (sc > best) best = sc;
      }
    }
    return best;
  }

  var WEIGHTS = {
    holes: 9, holeRows: 4, bump: 1.25, agg: 0.3, safe: 12, danger: 2.2, well: 1.6, midWell: 2,
    attack: 7, clearSafe: [0, -5, -4, -2.5, 3], clearDanger: 4, b2bBreak: 4, slot: 0, tWaste: 0
  };

  function evaluate(rows, w, pend) {
    var f = features(rows), over = f.maxH + pend - w.safe;
    var s = -w.holes * f.holes - w.holeRows * f.holeRows - w.bump * f.bump - w.agg * f.agg + w.well * Math.min(f.wellDepth, 4);
    if (over > 0) s -= w.danger * over * over;
    if (f.wellCol > 0 && f.wellCol < COLS - 1) s -= w.midWell;
    if (w.slot && over <= 0) {
      var sc = slotScore(rows);
      if (sc > 0) s += w.holes + w.holeRows + w.slot * sc * sc;   // the gap under the roof is not a real hole
    }
    return s;
  }

  function moveValue(res, w, danger, b2bBefore, type, slotBefore) {
    if (res.dead) return -1e7;
    var v = w.attack * res.atk;
    if (res.lines) {
      if (res.spin === 'full') v += 2;
      else v += danger ? w.clearDanger * res.lines : w.clearSafe[res.lines];
    }
    if (b2bBefore >= 0 && res.b2b < 0) v -= w.b2bBreak;
    if (type === 'T' && slotBefore > 0.6 && !(res.spin === 'full' && res.lines >= 2)) v -= w.tWaste;
    return v;
  }

  function mergeW(over) {
    if (!over) return WEIGHTS;
    var w = {}, k;
    for (k in WEIGHTS) w[k] = WEIGHTS[k];
    for (k in over) w[k] = over[k];
    return w;
  }

  // Pick a placement for the current piece (optionally through hold), looking one piece ahead.
  // The second piece may be the next one or the one waiting in hold; a T there is searched with real turns so spins count.
  function think(g, cfg) {
    var cur = g.cur;
    if (!cur) return null;
    var w = cfg._w || (cfg._w = mergeW(cfg.w)), rows = rowsOf(g.grid), pend = g.pendingTotal();
    var danger = features(rows).maxH + pend >= w.safe;
    var slot0 = w.slot ? slotScore(rows) : 0;
    var opts = [{ hold: false, type: cur.type, x: cur.x, y: cur.y, rot: cur.rot, next: g.queue[0], alt: cfg.hold ? g.holdType : null }];
    if (cfg.hold && !g.holdUsed) {
      var ht = g.holdType || g.queue[0];
      if (ht && ht !== cur.type) {
        var sp = spawnPos(rows, ht);
        if (sp) opts.push({ hold: true, type: ht, x: sp.x, y: sp.y, rot: 0, next: g.holdType ? g.queue[0] : g.queue[1], alt: cur.type });
      }
    }
    var best = null, i;
    for (var o = 0; o < opts.length; o++) {
      var op = opts[o], ps = placements(rows, op.type, op.x, op.y, op.rot);
      for (i = 0; i < ps.length; i++) ps[i].path = pathOf(ps[i].s, ps[i].spin !== 'none');
      var seconds = [];
      if (cfg.depth >= 2) {
        if (op.next) seconds.push(op.next);
        if (op.alt && op.alt !== op.next) seconds.push(op.alt);
      }
      for (i = 0; i < ps.length; i++) {
        var p = ps[i], res = applyMove(rows, op.type, p.rot, p.x, p.y, p.spin, g.b2b, g.combo);
        var v = moveValue(res, w, danger, g.b2b, op.type, slot0);
        if (seconds.length && !res.dead) {
          var b2 = -1e7;
          for (var k = 0; k < seconds.length; k++) {
            var t2 = seconds[k];
            if (t2 === 'T' && w.slot) {
              var sp2 = spawnPos(res.rows, 'T');
              if (!sp2) continue;
              var qs = placements(res.rows, 'T', sp2.x, sp2.y, 0);
              for (var j = 0; j < qs.length; j++) {
                var q = qs[j], rq = applyMove(res.rows, 'T', q.rot, q.x, q.y, q.spin, res.b2b, res.combo);
                var vq = 0.85 * moveValue(rq, w, danger, res.b2b, 'T', 0) + evaluate(rq.rows, w, pend);
                if (vq > b2) b2 = vq;
              }
            } else {
              eachDrop(res.rows, t2, function (rot, x, y) {
                var r2 = applyMove(res.rows, t2, rot, x, y, 'none', res.b2b, res.combo);
                var v2 = 0.85 * moveValue(r2, w, danger, res.b2b, t2, 0) + evaluate(r2.rows, w, pend);
                if (v2 > b2) b2 = v2;
              });
            }
          }
          v += b2;
        } else {
          v += evaluate(res.rows, w, pend);
        }
        if (cfg.noise) v += (Math.random() + Math.random() - 1) * cfg.noise;
        if (!best || v > best.v) best = { v: v, hold: op.hold, type: op.type, x: p.x, y: p.y, rot: p.rot, spin: p.spin, path: p.path };
      }
    }
    return best;
  }

  // ---- computer opponent: turns a decision into timed inputs on a manual game ----
  function BotPlayer(game, cfg) {
    this.g = game; this.cfg = cfg; this.plan = null; this.clock = 0; this.glide = 0;
  }
  BotPlayer.prototype.exec = function (a) {
    var g = this.g;
    if (a === L) return g.move(-1);
    if (a === R) return g.move(1);
    if (a === CW) return g.rotate(1);
    if (a === CCW) return g.rotate(-1);
    if (a === SD) return g.sonicDrop();
    if (a === 'hold') return g.hold();
    if (a === 'hd') return g.hardDrop();
  };
  BotPlayer.prototype.makePlan = function () {
    var g = this.g, cfg = this.cfg, d = think(g, cfg);
    var dur = 1000 / cfg.pps * (0.8 + 0.4 * Math.random()), acts = [], t0 = dur * 0.2, end = t0;
    if (d) {
      if (d.hold) acts.push({ t: t0 * 0.5, a: 'hold' });
      var n = d.path.length, step = n ? Math.min(dur * 0.55 / n, 95) : 0;
      for (var i = 0; i < n; i++) acts.push({ t: t0 + step * (i + 1), a: d.path[i] });
      end = t0 + step * n;
    }
    acts.push({ t: Math.max(dur, end + 30), a: 'hd' });
    this.plan = { id: g.stats.pieces, acts: acts, i: 0, glideFrom: end, dur: Math.max(dur, end + 30) };
    this.clock = 0; this.glide = 0;
  };
  BotPlayer.prototype.update = function (dt) {
    var g = this.g;
    if (g.over || !g.cur) { this.plan = null; return; }
    if (!this.plan || this.plan.id !== g.stats.pieces) this.makePlan();
    var p = this.plan;
    this.clock += dt;
    while (p.i < p.acts.length && p.acts[p.i].t <= this.clock) {
      this.exec(p.acts[p.i++].a);
      if (g.over || !g.cur || p.id !== g.stats.pieces) return;
    }
    // Once the inputs are done, let the tile sink toward its landing so it does not hang in the air.
    if (p.i === p.acts.length - 1 && this.clock > p.glideFrom) {
      var left = p.dur - this.clock, dist = g.ghostY() - g.cur.y;
      if (dist > 0 && left > 0) {
        this.glide += dist * dt / (left + dt);
        while (this.glide >= 1 && g.stepDown()) this.glide -= 1;
      }
    }
  };

  // ---- spin radar: every line-clearing spin a piece of this type could finish with ----
  function findSpins(g, type, fromCurrent) {
    type = type || 'T';
    var rows = rowsOf(g.grid), st;
    if (fromCurrent && g.cur && g.cur.type === type) st = g.cur; else st = spawnPos(rows, type);
    if (!st) return [];
    var ps = placements(rows, type, st.x, st.y, st.rot), out = [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.spin === 'none') continue;
      var res = applyMove(rows, type, p.rot, p.x, p.y, p.spin, -1, -1);
      if (!res.lines) continue;
      out.push({ type: type, x: p.x, y: p.y, rot: p.rot, spin: p.spin, lines: res.lines, path: pathOf(p.s, true) });
    }
    out.sort(function (a, b) { return (b.spin !== 'mini') - (a.spin !== 'mini') || b.lines - a.lines; });
    return out;
  }

  // ---- drill solver: place the queue so that every piece of the goal type ends in the wanted spin ----
  function solve(grid, queue, goal) {
    var first = rowsOf(grid), w = WEIGHTS, want = goal.piece || 'T';
    function rec(rows, i) {
      if (i >= queue.length) return { score: evaluate(rows, w, 0), steps: [] };
      var type = queue[i], sp = spawnPos(rows, type);
      if (!sp) return null;
      var ps = placements(rows, type, sp.x, sp.y, 0), cands = [], k;
      for (k = 0; k < ps.length; k++) {
        var p = ps[k];
        if (type === want && goal.spin && p.spin !== goal.spin) continue;
        var res = applyMove(rows, type, p.rot, p.x, p.y, p.spin, -1, -1);
        if (res.dead) continue;
        if (type === want ? res.lines !== goal.lines : res.lines !== 0) continue;
        cands.push({ p: p, res: res, path: pathOf(p.s, p.spin !== 'none') });
      }
      var best = null;
      for (k = 0; k < cands.length; k++) {
        var c = cands[k], sub = rec(c.res.rows, i + 1);
        if (!sub) continue;
        var sc = sub.score - c.path.length * 0.05;
        if (!best || sc > best.score) {
          best = { score: sc, steps: [{ type: type, x: c.p.x, y: c.p.y, rot: c.p.rot, spin: c.p.spin, path: c.path }].concat(sub.steps) };
        }
      }
      return best;
    }
    var r = rec(first, 0);
    return r ? r.steps : null;
  }

  // A level's place in this list is its number in saved games and in what the server is told, so new ones go at the
  // end. ORDER is the list from easiest to hardest; tier is a level's place in that.
  var LEVELS = [
    { id: 'l1', name: '學徒', pps: 0.45, depth: 1, hold: false, noise: 14, w: { attack: 3, clearSafe: [0, 2, 3, 4, 6] } },
    { id: 'l2', name: '熟手', pps: 0.75, depth: 1, hold: false, noise: 8, w: { attack: 5, clearSafe: [0, -1, 0, 1, 4] } },
    { id: 'l3', name: '師傅', pps: 1.1, depth: 2, hold: true, noise: 4 },
    { id: 'l4', name: '老師傅', pps: 1.6, depth: 2, hold: true, noise: 1.5, w: { agg: 0.15, clearSafe: [0, -8, -6, -4, 4], well: 3 } },
    { id: 'l5', name: '宗師', pps: 2.3, depth: 2, hold: true, noise: 0, w: { slot: 18, tWaste: 13, safe: 11, danger: 3 } },
    // two for people who are new to this kind of game: slow, careless, and they hardly send anything
    { id: 'e1', name: '新手', pps: 0.22, depth: 1, hold: false, noise: 60, w: { attack: 0, clearSafe: [0, 3, 2, 1, 0] } },
    { id: 'e2', name: '小工', pps: 0.32, depth: 1, hold: false, noise: 30, w: { attack: 1, clearSafe: [0, 3, 3, 2, 2] } }
  ];
  var ORDER = [5, 6, 0, 1, 2, 3, 4];
  ORDER.forEach(function (i, tier) { LEVELS[i].tier = tier; });
  // The player's own "make the computer easier or harder" setting, -2 to 2. Slower and sloppier, or faster and sharper.
  var EASE = { '-2': [0.6, 2, 6], '-1': [0.8, 1.4, 3], '0': [1, 1, 0], '1': [1.2, 0.7, 0], '2': [1.4, 0.5, 0] };
  function eased(cfg, step) {
    var e = EASE[step] || EASE[0];
    return {
      pps: Math.round(cfg.pps * e[0] * 100) / 100, noise: Math.round((cfg.noise * e[1] + e[2]) * 10) / 10,
      depth: cfg.depth, hold: cfg.hold, w: cfg.w
    };
  }

  ZZ.Bot = {
    L: L, R: R, CW: CW, CCW: CCW, SD: SD,
    rowsOf: rowsOf, reach: reach, placements: placements, pathOf: pathOf, applyMove: applyMove,
    features: features, evaluate: evaluate, slotScore: slotScore, think: think, findSpins: findSpins, solve: solve,
    spawnPos: spawnPos, BotPlayer: BotPlayer, LEVELS: LEVELS, ORDER: ORDER, eased: eased, WEIGHTS: WEIGHTS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
