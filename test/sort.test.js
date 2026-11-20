'use strict';
// 分磚: moving, what may not move, undo, solved, stars, and the levels (each solvable in its stated moves).
const S = require('../games/sort/sort.js'), L = require('../games/sort/levels.js'), T = require('../tools/make_sort.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
let g = new S('0011/1100//');
ok(g.st.length === 4 && g.run(0) === 2 && g.run(1) === 2, 'read, with runs of the top colour');
ok(g.can(0, 1) === 0, 'not onto another colour');
ok(g.move(0, 2) === 2 && g.st[2].join('') === '11' && g.st[0].join('') === '00', 'the whole run of the top colour moves');
ok(g.move(1, 2) === 0 && g.can(1, 3) === 2, 'a stack of four takes no more');
ok(g.undo() && g.st[0].join('') === '0011' && g.moves === 0, 'undo');
g = new S('0101/1010//');
let k = 0; const route = [[0, 2], [1, 3], [1, 2], [0, 3], [0, 2], [1, 3], [1, 2], [0, 3]];
route.forEach(([a, b]) => { if (g.move(a, b)) k++; });
ok(g.solved() && k === 8, 'sorted', g.st);
ok(S.stars(8, 8) === 3 && S.stars(12, 8) === 2 && S.stars(13, 8) === 1, 'stars');
ok(L.length === 60 && L.every(l => { const t = new S(l.m); const n = t.st.length - 2; const all = t.st.flat(); return t.st.slice(-2).every(s => !s.length) && all.length === n * 4 && [...new Set(all)].every(c => all.filter(x => x === c).length === 4) && !t.solved(); }), 'sixty levels: four of each colour and two empty stacks, none already done');
let agree = 0; for (let i = 0; i < 20; i++) { const st = L[i].m.split('/').map(s => s.split('').map(Number)); if (T.solve(st, 3000000) === L[i].p) agree++; }
ok(agree === 20, 'the solver agrees with the stated moves for the first twenty', agree);
console.log('sort: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
