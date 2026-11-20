'use strict';
// Checks every 磚畫謎 picture: the clues are worked out from it, then a solver that reasons one row or column at a
// time (the way a person does it) must fill in the whole picture without guessing. Run: node tools/check_pics.js
const clues = line => { const out = []; let n = 0; for (const c of line) { if (c) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; };
// every way of placing the clue in a line of length len, consistent with what is known (1 filled, 0 empty, -1 unknown)
function lineSolve(cl, known) {
  const len = known.length, blocks = cl[0] === 0 ? [] : cl, can1 = new Array(len).fill(false), can0 = new Array(len).fill(false);
  let any = false;
  const place = (bi, start, cur) => {
    if (bi === blocks.length) {
      for (let i = start; i < len; i++) if (known[i] === 1) return;
      any = true;
      for (let i = 0; i < len; i++) { if (i < start ? cur[i] : 0) can1[i] = true; else can0[i] = true; }
      return;
    }
    const b = blocks[bi];
    for (let s = start; s + b <= len; s++) {
      let okk = true;
      for (let i = start; i < s; i++) if (known[i] === 1) { okk = false; break; }
      if (!okk) break;
      for (let i = s; i < s + b; i++) if (known[i] === 0) { okk = false; break; }
      if (!okk) continue;
      if (s + b < len && known[s + b] === 1) continue;
      const nx = cur.slice(); for (let i = start; i < s; i++) nx[i] = 0; for (let i = s; i < s + b; i++) nx[i] = 1; if (s + b < len) nx[s + b] = 0;
      place(bi + 1, Math.min(len, s + b + 1), nx);
    }
  };
  place(0, 0, new Array(len).fill(0));
  if (!any) return null;
  return known.map((k, i) => can1[i] && !can0[i] ? 1 : can0[i] && !can1[i] ? 0 : k === -1 ? -1 : k);
}
function solve(rows, cols) {
  const H = rows.length, W = cols.length, g = []; for (let y = 0; y < H; y++) g.push(new Array(W).fill(-1));
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H; y++) { const r = lineSolve(rows[y], g[y]); if (!r) return null; for (let x = 0; x < W; x++) if (r[x] !== g[y][x]) { g[y][x] = r[x]; changed = true; } }
    for (let x = 0; x < W; x++) { const col = g.map(r => r[x]), r = lineSolve(cols[x], col); if (!r) return null; for (let y = 0; y < H; y++) if (r[y] !== g[y][x]) { g[y][x] = r[y]; changed = true; } }
  }
  return g;
}
function check(pic) {
  const grid = pic.r.map(s => s.split('').map(c => c === '#' ? 1 : 0)), W = grid[0].length;
  if (grid.some(r => r.length !== W)) return 'rows of different lengths';
  const rows = grid.map(clues), cols = grid[0].map((_, x) => clues(grid.map(r => r[x])));
  const s = solve(rows, cols);
  if (!s) return 'contradiction';
  const unknown = s.flat().filter(v => v === -1).length;
  return unknown ? unknown + ' cells left open' : '';
}
if (require.main === module) {
  const P = require('../games/picross/pics.js');
  let bad = 0;
  P.forEach((p, i) => { const r = check(p); if (r) { bad++; console.log((i + 1) + ' ' + p.n + ' (' + p.r[0].length + 'x' + p.r.length + '): ' + r); } });
  console.log(P.length - bad + ' of ' + P.length + ' pictures can be solved without guessing');
  process.exitCode = bad ? 1 : 0;
}
module.exports = { clues, solve, check };
