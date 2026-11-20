'use strict';
// 磚塊合成: dropping, joining one or several neighbours, chains, cement, a full column, the numbers offered.
const M = require('../games/merge/merge.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const put = (g, c, r, v) => { g.grid[c][r] = g.mk(v); };
const vals = g => g.grid.map(col => col.map(b => b ? b.v : 0).join(',')).join(' | ');

let g = new M(1, 'easy');
ok(g.C === 5 && g.R === 8 && g.lives === 5 && g.queue.length === 3, 'easy: 5 by 8, two bricks shown ahead');
g.queue = [4, 2, 2]; g.drop(0); ok(g.grid[0][0].v === 4 && g.queue.length === 3, 'a brick falls to the bottom');
g.queue = [8, 2, 2]; g.drop(0); ok(g.grid[0][1].v === 8, 'and stacks');
// two of a kind
g = new M(2, 'easy'); put(g, 0, 0, 2); g.queue = [2, 2, 2]; g.drop(1);
ok(g.grid[1][0].v === 4 && !g.grid[0][0] && g.score === 4, 'two 2s make a 4', vals(g));
// a brick dropped on top of a 16 between two 4s on row 1: neighbours left, right and below
g = new M(4, 'easy'); put(g, 0, 0, 1024); put(g, 1, 0, 4); put(g, 2, 0, 1024); put(g, 0, 1, 2); put(g, 2, 1, 2);
g.queue = [2, 2, 2]; g.drop(1);    // 2 lands on (1,1): left 2 and right 2 join -> 8, falls? no, sits on the 4
ok(g.grid[1][1] && g.grid[1][1].v === 8 && !g.grid[0][1] && !g.grid[2][1], 'joining two neighbours at once: 2 becomes 8', vals(g));
// a chain: the new brick joins again after it grows
g = new M(5, 'easy'); put(g, 0, 0, 4); put(g, 1, 0, 2);
g.queue = [2, 2, 2]; g.drop(1);    // lands on (1,1): joins the 2 below -> 4 at (1,1), falls to (1,0), joins the 4 at (0,0) -> 8
ok(g.grid[1][0] && g.grid[1][0].v === 8 && !g.grid[0][0] && g.events.some(e => e.type === 'chain' && e.n === 2) && g.bestChain === 2, 'a chain: 2+2 makes 4, which falls and meets the 4', vals(g));
ok(g.score === 4 + 8, 'each join scores its new number', g.score);
// cement breaks next to a merge
g = new M(6, 'normal'); put(g, 0, 0, 128); put(g, 0, 1, M.CEMENT); put(g, 1, 0, 2); g.queue = [2, 2];
g.drop(1);
ok(g.grid[0][0].v === 128 && !g.grid[0][1], 'a merge next to cement breaks it', vals(g));
g = new M(7, 'normal'); let cem = 0; for (let i = 0; i < 16; i++) { g.queue[0] = [2, 8, 32, 128][i % 4]; g.drop(i % 5); }
cem = g.grid.flat().filter(b => b && b.v === M.CEMENT).length;
ok(cem >= 1 || g.events.some(e => e.type === 'cement'), 'normal: cement now and then', cem);
const e = new M(7, 'easy'); for (let i = 0; i < 30; i++) { e.queue[0] = [2, 8, 32, 128, 512][i % 5]; e.drop(i % 5); }
ok(!e.grid.flat().some(b => b && b.v === M.CEMENT), 'easy: no cement');
// a full column costs a heart and the top three rows crumble
g = new M(8, 'normal'); for (let r = 0; r < g.R; r++) put(g, 2, r, r % 2 ? 4 : 8);
g.queue = [2, 2]; ok(g.drop(2) === 'overflow' && g.lives === 4 && g.height(2) === g.R - 3, 'a full column: a heart, and the top three rows go');
g.lives = 1; for (let r = g.height(2); r < g.R; r++) put(g, 2, r, r % 2 ? 4 : 8);
ok(g.drop(2) === 'over' && g.over, 'the last heart ends it');
// the numbers offered grow with the biggest brick made, but stay small
g = new M(9); const seen = new Set(); for (let i = 0; i < 300; i++) seen.add(g.pick());
ok([...seen].every(v => v === 2), 'at first only 2s', [...seen]);
g.top = 4096; const s2 = new Set(); for (let i = 0; i < 2000; i++) s2.add(g.pick());
ok(Math.max(...s2) <= 64 && s2.has(2) && s2.size >= 4, 'later a few more, never above 64', [...s2]);
console.log('merge: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
