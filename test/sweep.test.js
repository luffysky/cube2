'use strict';
// 掃磚: the first tap is safe and opens an area, numbers count cracks around, flags, chords, hearts, done.
const S = require('../games/sweep/sweep.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
let safeFirst = 0, opened = 0;
for (let s = 1; s <= 200; s++) {
  const g = new S(s, 'hard'), first = (s * 37) % (g.W * g.H);
  const r = g.dig(first);
  if (r === 'open' && !g.crack[first] && g.around(first).every(k => !g.crack[k])) safeFirst++;
  if (g.num[first] === 0 && g.open.filter(Boolean).length >= 1 + g.around(first).length) opened++;
  if (g.crack.filter(Boolean).length !== g.count) ok(false, 'seed ' + s + ' has the right number of cracks');
}
ok(safeFirst === 200 && opened === 200, 'the first tap is never a crack, and opens an area', [safeFirst, opened]);
const g = new S(3, 'easy'); g.dig(0);
ok(g.num.every((n, i) => n === g.around(i).filter(k => g.crack[k]).length), 'every number counts the cracks around it');
ok(g.open.every((o, i) => !o || !g.crack[i]), 'nothing cracked was opened');
const crack = g.crack.findIndex((c, i) => c && !g.open[i]);
ok(g.toggleFlag(crack) && g.flag[crack] && g.dig(crack) === '', 'a flagged brick cannot be knocked out');
g.toggleFlag(crack);
ok(g.dig(crack) === 'hit' && g.lives === 4 && g.hits === 1 && g.open[crack], 'a crack costs a heart and stays shown');
// chord: a number whose cracks are all marked opens the rest around it
const h = new S(9, 'normal'); h.dig(55);
const num = h.num.findIndex((n, i) => h.open[i] && n > 0 && h.around(i).some(k => !h.open[k] && !h.crack[k]));
if (num >= 0) { h.around(num).forEach(k => { if (h.crack[k]) h.flag[k] = true; }); const before = h.left; h.chord(num); ok(h.left < before && h.lives === 5, 'a number with its cracks all flagged opens the rest around it'); } else ok(true, 'no chord to test');
// clear everything that is safe: done
const d = new S(11, 'easy'); d.dig(0); for (let i = 0; i < d.open.length; i++) if (!d.crack[i]) d.dig(i);
ok(d.done() && d.lives === 5 && d.dig(0) === '', 'every sound brick out: done');
const e = new S(12, 'easy'); e.dig(0); let k = 0; for (let i = 0; i < e.open.length && !e.over; i++) if (e.crack[i]) { e.dig(i); k++; }
ok(e.over && k === 5, 'five cracks end it');
ok(new S(1, 'easy').W === 8 && new S(1, 'normal').count === 16 && new S(1, 'hard').H === 14, 'sizes');
console.log('sweep: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
