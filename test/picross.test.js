'use strict';
// 磚畫謎: clues, filling, mistakes costing hearts, crosses, rows done, stars, and every picture solvable without guessing.
const P = require('../games/picross/picross.js'), PICS = require('../games/picross/pics.js'), { check } = require('../tools/check_pics.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
ok(JSON.stringify(P.clues([1, 1, 0, 1, 0])) === '[2,1]' && JSON.stringify(P.clues([0, 0, 0])) === '[0]', 'clues');
const g = new P(PICS[0]);
ok(g.W === 5 && g.H === 5 && JSON.stringify(g.rows[0]) === '[1,1]' && JSON.stringify(g.rows[1]) === '[5]', 'the heart: rows read', g.rows);
ok(g.fill(1, 0) === 'fill' && g.cells[0][1] === P.FILL, 'a right cell fills');
ok(g.fill(0, 0) === 'miss' && g.lives === 4 && g.cells[0][0] === P.CROSS && g.mistakes === 1, 'a wrong one costs a heart and is crossed out');
ok(g.fill(0, 0) === '' && g.lives === 4, 'no second cost for the same cell');
ok(g.cross(2, 0) === 'cross' && g.cross(2, 0) === 'uncross' && g.lives === 4, 'crosses are free and come off again');
ok(g.cross(1, 0) === '', 'a filled cell cannot be crossed');
g.fill(3, 0); ok(g.rowDone(0), 'a row is done when its bricks are in');
for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.sol[y][x]) g.fill(x, y);
ok(g.done() && P.stars(g.mistakes) === 2, 'all in: done; one mistake is two stars');
const h = new P(PICS[1]); for (let i = 0; i < 5; i++) { for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) if (!h.sol[y][x] && h.cells[y][x] === 0 && h.lives > 0) { h.fill(x, y); y = 99; break; } }
ok(h.over && h.lives === 0, 'five mistakes end it');
ok(PICS.length >= 24 && PICS.every(p => check(p) === ''), 'every picture can be solved without guessing', PICS.filter(p => check(p)).map(p => p.n));
ok(PICS.every(p => p.r.every(r => r.length === p.r[0].length) && /^#[0-9A-F]{6}$/i.test(p.c) && p.n), 'every picture has a name, a colour and even rows');
console.log('picross: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
