'use strict';
// 磚道: turning tiles, the water's reach, every puzzle a tree that can be solved, and solved only when complete.
const P = require('../games/pipes/pipes.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
ok(P.turn(P.UP, 1) === P.RIGHT && P.turn(P.UP | P.RIGHT, 1) === (P.RIGHT | P.DOWN) && P.turn(P.LEFT, 1) === P.UP && P.turn(5, 4) === 5, 'a quarter turn moves each opening clockwise');
for (const lv of ['easy', 'normal', 'hard']) {
  let trees = 0, sol = 0, scrambled = 0;
  for (let s = 1; s <= 300; s++) {
    const g = new P(s, lv), N = g.N;
    // the answer: a tree over every tile (edges = tiles - 1, all connected, nothing pointing off the board)
    let edges = 0, off = false;
    g.sol.forEach((m, c) => { const x = c % N, y = Math.floor(c / N); if ((m & P.RIGHT) && x < N - 1) edges++; if ((m & P.DOWN) && y < N - 1) edges++; if ((m & P.UP && y === 0) || (m & P.LEFT && x === 0) || (m & P.RIGHT && x === N - 1) || (m & P.DOWN && y === N - 1)) off = true; });
    if (edges === N * N - 1 && !off && g.sol.every(m => m)) trees++;
    const t = new P(s, lv); t.tiles = t.sol.slice(); if (t.solved()) sol++;
    if (!g.solved()) scrambled++;
    // each tile is a turn of its answer
    if (!g.tiles.every((m, c) => [0, 1, 2, 3].some(k => P.turn(m, k) === g.sol[c]))) ok(false, lv + ' seed ' + s + ': tiles are turns of the answer');
  }
  ok(trees === 300 && sol === 300 && scrambled === 300, lv + ': three hundred puzzles, each a tree over every tile, solved by its answer, not solved at the start', [trees, sol, scrambled]);
}
const g = new P(5, 'easy');
ok(g.N === 5 && new P(5, 'normal').N === 7 && new P(5, 'hard').N === 9, 'sizes 5, 7, 9');
const f0 = g.flow(); ok(f0.lit[g.src] && f0.count >= 1, 'the water is always in the middle tile');
// turning every tile to its answer one tap at a time solves it, and the count of taps is kept
let taps = 0; g.tiles.forEach((m, c) => { let k = 0; while (g.tiles[c] !== g.sol[c] && k < 4) { g.rotate(c, 1); k++; taps++; } });
ok(g.solved() && g.taps === taps, 'turning each tile into place solves it', [g.taps, taps]);
ok(!g.rotate(0, 1), 'nothing turns once it is solved');
// one tile wrong: not solved
const h = new P(6, 'normal'); h.tiles = h.sol.slice(); const leaf = h.sol.findIndex((m, c) => c !== h.src && h.bits(m) === 1); h.tiles[leaf] = P.turn(h.sol[leaf], 2);
ok(!h.solved() && h.flow().open, 'one end turned away: the water spills, not solved');
console.log('pipes: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
