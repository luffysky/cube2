'use strict';
// 推磚倉庫: moving, pushing, blocking, undo, stars, and the levels themselves (each solvable in its stated pushes).
const P = require('../games/push/push.js'), L = require('../games/push/levels.js'), { solve } = require('../tools/make_push.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
let g = new P('#####/#@$.#/#####');
ok(g.w === 5 && g.h === 3 && g.count() === 1 && !g.solved(), 'a level is read');
ok(g.move('left') === '', 'a wall blocks');
ok(g.move('right') === 'push' && g.solved() && g.pushes === 1 && g.moves === 1, 'pushing the brick onto its spot solves it');
ok(g.move('right') === '', 'nothing moves once solved');
ok(g.undo() && !g.solved() && g.px === 1 && g.pushes === 0 && g.moves === 0, 'undo puts the brick back');
ok(!g.undo(), 'nothing more to undo');
ok(new P('######/#@$$.#/######').move('right') === '', 'two bricks in a row cannot be pushed');
g = new P('#####/#@ .#/#  $#/#####'); ok(g.move('right') === 'move' && g.pushes === 0 && g.moves === 1, 'walking is not pushing');
ok(P.stars(6, 6) === 3 && P.stars(9, 6) === 2 && P.stars(10, 6) === 1, 'three stars at the fewest pushes, two within half as many again');
ok(L.length === 60, 'sixty levels');
ok(L.every(l => { const t = new P(l.m); return t.count() >= 2 && t.count() === t.spot.filter(Boolean).length && t.onSpot() === 0; }), 'each has as many spots as bricks, and nothing starts on a spot');
ok(L.every((l, i) => i === 0 || new P(l.m).count() >= new P(L[i - 1].m).count()), 'more bricks further on');
// the solver agrees with the stated pushes (the quicker levels; the rest were checked when they were made)
const parse = m => { const rows = m.split('/'), g2 = rows.map(r => r.split('').map(c => c === '#' ? '#' : ' ')), goals = [], boxes = []; let px = 0, py = 0; rows.forEach((r, y) => r.split('').forEach((c, x) => { if ('.*+'.includes(c)) goals.push([x, y]); if ('$*'.includes(c)) boxes.push([x, y]); if ('@+'.includes(c)) { px = x; py = y; } })); return { g: g2, goals, boxes, px, py }; };
let checked = 0;
for (let i = 0; i < 12; i++) { if (solve(parse(L[i].m), L[i].p) === L[i].p) checked++; }
ok(checked === 12, 'the first twelve solve in exactly their stated pushes', checked);
console.log('push: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
