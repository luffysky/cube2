'use strict';
// 疊磚塔: sliding, cutting, perfects and widening, misses costing hearts, getting quicker.
const S = require('../games/stack/stack.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const { W, BASE } = S;

let g = new S(1, 'normal');
ok(g.floors() === 0 && g.cur.w === BASE && g.cur.x === 0 && g.lives === 5, 'starts on the base with a brick as wide coming in from the left');
const x0 = g.cur.x; g.step(0.1); ok(Math.abs(g.cur.x - (x0 + g.speed() * 0.1)) < 1e-9, 'it slides at the level speed');
for (let i = 0; i < 400; i++) { g.step(0.016); if (g.cur.x < -1e-9 || g.cur.x + g.cur.w > W + 1e-9) break; }
ok(g.cur.x >= 0 && g.cur.x + g.cur.w <= W + 1e-9, 'and turns at the sides');

// a cut: what hangs over goes
g = new S(2); g.cur.x = g.top().x + 30; g.drop();
ok(g.floors() === 1 && g.top().w === BASE - 30 && g.top().x === (W - BASE) / 2 + 30 && g.events[0].type === 'cut' && g.events[0].w === 30, 'thirty over: thirty cut off', g.top());
ok(g.cur.w === BASE - 30, 'the next brick is as wide as the new top');
// a perfect
g = new S(3); g.cur.x = g.top().x + 3; g.drop();
ok(g.top().w === BASE && g.events[0].type === 'perfect' && g.combo === 1, 'within a few pixels: perfect, nothing cut');
// three perfects in a row widen a narrowed tower
g = new S(4); g.cur.x = g.top().x + 60; g.drop();     // 140 wide
for (let i = 0; i < 3; i++) { g.cur.x = g.top().x; g.drop(); }
ok(g.top().w === BASE - 60 + 12 && g.combo === 3 && g.events.some(e => e.grew), 'three perfects in a row: a little wider', g.top().w);
ok(g.top().x >= 0 && g.top().x + g.top().w <= W, 'and still inside the field');
ok(g.score === 1 + 2 + 3 + 4, 'score: one a floor, more for perfects in a row', g.score);
// a miss
g = new S(5); g.cur.x = W - g.cur.w; g.tower[0] = { x: 0, w: 40, c: 0 }; g.cur.w = 40; const fl = g.floors();
ok(g.drop() === 'miss' && g.lives === 4 && g.floors() === fl && g.cur.w === 40, 'a miss costs a heart; the brick comes round again');
g.lives = 1; g.cur.x = W - g.cur.w; ok(g.drop() === 'over' && g.over, 'the last heart ends it');
// higher: quicker, and from either side
g = new S(6); const v0 = g.speed();
for (let i = 0; i < 30; i++) { g.cur.x = g.top().x; g.drop(); }
ok(g.speed() > v0, 'quicker as it climbs');
let right = 0; for (let i = 0; i < 30; i++) { if (g.cur.dir < 0) right++; g.cur.x = g.top().x; g.drop(); }
ok(right > 3 && right < 27, 'past ten floors, bricks come from both sides', right);
ok(new S(1, 'easy').speed() < new S(1, 'normal').speed() && new S(1, 'normal').speed() < new S(1, 'hard').speed(), 'easy is slower than normal, normal than hard');
g.tower.length = 1000; ok(g.speed() <= S.LEVELS.normal.max, 'up to a limit');

console.log('stack: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
