'use strict';
// Makes the levels of 分磚 (games/sort/levels.js): colours shuffled into stacks, with two empty stacks to work with.
// Each is kept only if a solver finds a way through; the length of the shortest way found (iterative deepening on a
// search with a memory of positions seen) is the par for three stars.
//   node tools/make_sort.js
const fs = require('fs'), path = require('path');
const CAP = 4;
let seed = 777;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// a move takes every brick of the top colour that fits
function moves(st) {
  const out = [];
  for (let a = 0; a < st.length; a++) {
    const A = st[a]; if (!A.length) continue;
    const c = A[A.length - 1]; let run = 1; while (run < A.length && A[A.length - 1 - run] === c) run++;
    if (run === A.length && A.length === CAP) continue;             // already done
    for (let b = 0; b < st.length; b++) {
      if (a === b) continue;
      const B = st[b];
      if (B.length >= CAP || (B.length && B[B.length - 1] !== c)) continue;
      if (!B.length && run === A.length) continue;                      // moving a whole stack into an empty one does nothing
      const n = Math.min(run, CAP - B.length);
      out.push([a, b, n]);
    }
  }
  return out;
}
const apply = (st, [a, b, n]) => { const s = st.map(x => x.slice()); for (let i = 0; i < n; i++) s[b].push(s[a].pop()); return s; };
const done = st => st.every(s => !s.length || (s.length === CAP && s.every(c => c === s[0])));
const key = st => st.map(s => s.join('')).sort().join('|');
// breadth-first: the fewest moves (fine for the sizes used here)
function solve(start, limit) {
  let front = [start]; const seen = new Set([key(start)]);
  for (let d = 0; d <= 60; d++) {
    const next = [];
    for (const st of front) {
      if (done(st)) return d;
      for (const m of moves(st)) { const s = apply(st, m), k = key(s); if (!seen.has(k)) { seen.add(k); next.push(s); if (seen.size > limit) return -1; } }
    }
    if (!next.length) return -1;
    front = next;
  }
  return -1;
}
if (require.main === module) {
  const PLAN = [[8, 3], [10, 4], [12, 5], [15, 6], [15, 7]];   // count, colours
  const out = [];
  for (const [count, n] of PLAN) {
    const got = [];
    for (let tries = 0; got.length < count && tries < 500; tries++) {
      const all = []; for (let c = 0; c < n; c++) for (let i = 0; i < CAP; i++) all.push(c);
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      const st = []; for (let t = 0; t < n; t++) st.push(all.slice(t * CAP, t * CAP + CAP)); st.push([], []);
      if (st.some(s => s.length && s.every(c => c === s[0]))) continue;
      const p = solve(st, 3000000);
      if (p < 0 || p < n + 2) continue;
      got.push({ p, m: st.map(s => s.join('')).join('/') });
    }
    got.sort((a, b) => a.p - b.p);
    out.push(...got);
    console.log(n + ' colours: ' + got.length + ' levels, moves ' + got.map(x => x.p).join(' '));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'games', 'sort', 'levels.js'), '/* 分磚 levels, made by tools/make_sort.js. m: the stacks, bottom first, colours as digits; p: the fewest moves (a solver found it). */\n' +
    '(function (root) {\n  var LEVELS = [\n' + out.map(x => '    { p: ' + x.p + ', m: ' + JSON.stringify(x.m) + ' }').join(',\n') + '\n  ];\n' +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS; else root.SORT_LEVELS = LEVELS;\n})(typeof window !== 'undefined' ? window : globalThis);\n");
  console.log('wrote ' + out.length);
}
module.exports = { solve, moves, apply, done, CAP };
