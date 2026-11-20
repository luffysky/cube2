'use strict';
// Makes the levels of 推磚倉庫 (games/push/levels.js). Each level is built backwards from the solved position: the
// player pulls the bricks off their spots around a random room, so every level can be solved. Then a solver finds the
// fewest pushes it takes, and levels are kept only if they take some thinking; they are sorted easiest first.
//   node tools/make_push.js        (about a minute)
const fs = require('fs'), path = require('path');
let seed = 20261120;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = n => Math.floor(rnd() * n);
const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function room(w, h) {
  const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill('#'));
  let x = 1 + ri(w - 2), y = 1 + ri(h - 2), floor = 0, want = Math.floor((w - 2) * (h - 2) * (0.55 + rnd() * 0.15));
  // carve 2x2-ish blobs on a random walk so rooms have space to move boxes around
  for (let i = 0; floor < want && i < 5000; i++) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const a = x + dx, b = y + dy; if (a > 0 && b > 0 && a < w - 1 && b < h - 1 && g[b][a] === '#') { g[b][a] = ' '; floor++; } }
    const d = D[ri(4)]; x = Math.max(1, Math.min(w - 3, x + d[0])); y = Math.max(1, Math.min(h - 3, y + d[1]));
  }
  return g;
}
function floors(g) { const out = []; g.forEach((r, y) => r.forEach((c, x) => { if (c !== '#') out.push([x, y]); })); return out; }
const key = (x, y) => x + ',' + y;

function build(w, h, nb, pulls) {
  const g = room(w, h), fl = floors(g);
  if (fl.length < nb + 8) return null;
  const pick = new Set(); while (pick.size < nb) { const f = fl[ri(fl.length)]; pick.add(key(f[0], f[1])); }
  const goals = [...pick].map(s => s.split(',').map(Number));
  let boxes = new Set(pick), px, py;
  do { const f = fl[ri(fl.length)]; px = f[0]; py = f[1]; } while (boxes.has(key(px, py)));
  const free = (x, y) => g[y] && g[y][x] === ' ' && !boxes.has(key(x, y));
  for (let i = 0; i < pulls; i++) {
    const d = D[ri(4)], nx = px + d[0], ny = py + d[1];
    if (!free(nx, ny)) continue;
    const bx = px - d[0], by = py - d[1];
    if (boxes.has(key(bx, by)) && rnd() < 0.7) { boxes.delete(key(bx, by)); boxes.add(key(px, py)); }
    px = nx; py = ny;
  }
  return { g, goals, boxes: [...boxes].map(s => s.split(',').map(Number)), px, py };
}

// fewest pushes to solve (breadth-first over pushes; the player walks freely in between)
function solve(L, cap) {
  const { g, goals } = L, h = g.length, w = g[0].length, goalSet = new Set(goals.map(([x, y]) => key(x, y)));
  const wall = (x, y) => !g[y] || g[y][x] === undefined || g[y][x] === '#';
  // dead cells: a box there can never reach a goal (corners that are not goals)
  const dead = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!wall(x, y) && !goalSet.has(key(x, y))) {
    const n = wall(x, y - 1), s = wall(x, y + 1), e = wall(x + 1, y), ww = wall(x - 1, y);
    if ((n || s) && (e || ww)) dead.add(key(x, y));
  }
  const reach = (px, py, boxes) => {
    const seen = new Set([key(px, py)]), q = [[px, py]]; let min = key(px, py);
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of D) { const a = x + dx, b = y + dy, k = key(a, b); if (!wall(a, b) && !boxes.has(k) && !seen.has(k)) { seen.add(k); q.push([a, b]); if (k < min) min = k; } } }
    return { seen, min };
  };
  const enc = (boxes, min) => [...boxes].sort().join(';') + '|' + min;
  let frontier = [{ boxes: new Set(L.boxes.map(([x, y]) => key(x, y))), px: L.px, py: L.py }];
  const visited = new Set();
  const r0 = reach(L.px, L.py, frontier[0].boxes); visited.add(enc(frontier[0].boxes, r0.min));
  for (let pushes = 0; pushes <= cap; pushes++) {
    const next = [];
    for (const st of frontier) {
      if ([...st.boxes].every(b => goalSet.has(b))) return pushes;
      const { seen } = reach(st.px, st.py, st.boxes);
      for (const b of st.boxes) {
        const [bx, by] = b.split(',').map(Number);
        for (const [dx, dy] of D) {
          if (!seen.has(key(bx - dx, by - dy))) continue;
          const tx = bx + dx, ty = by + dy, tk = key(tx, ty);
          if (wall(tx, ty) || st.boxes.has(tk) || dead.has(tk)) continue;
          const nb = new Set(st.boxes); nb.delete(b); nb.add(tk);
          const r = reach(bx, by, nb), e = enc(nb, r.min);
          if (visited.has(e)) continue;
          visited.add(e);
          if (visited.size > 400000) return -1;
          next.push({ boxes: nb, px: bx, py: by });
        }
      }
    }
    if (!next.length) return -1;
    frontier = next;
  }
  return -1;
}
function text(L) {
  const g = L.g.map(r => r.slice()), gs = new Set(L.goals.map(([x, y]) => key(x, y)));
  L.goals.forEach(([x, y]) => { g[y][x] = '.'; });
  L.boxes.forEach(([x, y]) => { g[y][x] = gs.has(key(x, y)) ? '*' : '$'; });
  g[L.py][L.px] = gs.has(key(L.px, L.py)) ? '+' : '@';
  // trim walls that touch no floor, so the picture is no bigger than it needs to be
  const rows = g.map(r => r.join(''));
  return rows;
}
if (require.main === module) {
const PLAN = [[10, 2, 6, 7, 6, 12], [20, 3, 7, 8, 10, 22], [30, 4, 8, 9, 14, 40]];   // count, boxes, w, h, min pushes, max pushes
const out = [];
for (const [count, nb, w, h, lo, hi] of PLAN) {
  const got = [];
  for (let tries = 0; got.length < count && tries < 4000; tries++) {
    const L = build(w + ri(2), h + ri(2), nb, 300 + nb * 120);
    if (!L) continue;
    const gs = new Set(L.goals.map(([x, y]) => key(x, y)));
    if (L.boxes.some(([x, y]) => gs.has(key(x, y)))) continue;        // nothing starts on its spot
    const p = solve(L, hi);
    if (p < lo || p > hi) continue;
    const t = text(L).join('/');
    if (got.some(x => x.t === t)) continue;
    got.push({ t, p });
  }
  got.sort((a, b) => a.p - b.p);
  out.push(...got);
  console.log(nb + ' boxes: ' + got.length + ' levels, pushes ' + got.map(x => x.p).join(' '));
}
const file = path.join(__dirname, '..', 'games', 'push', 'levels.js');
fs.writeFileSync(file, '/* 推磚倉庫 levels, made by tools/make_push.js: each was built backwards from the solved position and checked by\n   a solver; p is the fewest pushes it takes. #: wall  .: spot  $: brick  *: brick on a spot  @: player  +: player on a spot */\n' +
  '(function (root) {\n  var LEVELS = [\n' + out.map(x => '    { p: ' + x.p + ', m: ' + JSON.stringify(x.t) + ' }').join(',\n') + '\n  ];\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS; else root.PUSH_LEVELS = LEVELS;\n})(typeof window !== 'undefined' ? window : globalThis);\n");
console.log('wrote ' + out.length + ' levels');
}
module.exports = { solve };
