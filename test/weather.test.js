'use strict';
// The weather mode: the same seed gives the same weather, each kind does what it says to the board, and the
// rewards for a run stay inside what a run of that length can earn.
const ZZ = require('../src/engine.js');
require('../src/weather.js');
require('../src/meta.js');
const W = ZZ.Weather, M = ZZ.Meta;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }

function run(seed, only, ms, play) {
  const g = new ZZ.Game({ seed, garbage: false }), w = new W({ seed, only });
  g.start();
  const log = [];
  for (let t = 0; t < ms && !g.over; t += 16) {
    w.baseGrav = W.gravAt(t);
    w.step(g, 16).forEach(e => log.push(e.type + ':' + (e.kind || e.x || '')));
    if (play) play(g, t);
    g.update(16);
  }
  return { g, w, log };
}
const bottom = g => g.grid.map(r => Array.from(r).join('')).join('/');

// same seed, same sky (and the same board)
const a = run(77, '', 90000), b = run(77, '', 90000);
ok(a.log.join() === b.log.join() && a.log.length > 0, 'same seed gives the same weather');
ok(bottom(a.g) === bottom(b.g), 'same seed gives the same board');
ok(run(78, '', 90000).log.join() !== a.log.join(), 'another seed gives other weather');
// it changes kind over time and never repeats the same kind twice in a row
const kinds = a.log.filter(x => x.startsWith('change:')).map(x => x.slice(7));
ok(kinds.length >= 2, 'the weather changes in 90 seconds (' + kinds.length + ')');
ok(kinds.every((k, i) => i === 0 || k !== kinds[i - 1]), 'never the same kind twice running');
ok(kinds.every(k => W.KINDS.indexOf(k) >= 0), 'only known kinds');
const calm = new W({ seed: 5 }); ok(calm.kind === 'clear', 'a run starts calm');
ok(new W({ seed: 5, only: 'fog' }).kind === 'fog', 'practice starts on its weather');

// wind pushes the falling piece toward the wind
{
  const g = new ZZ.Game({ seed: 3, garbage: false, gravity: 0 }), w = new W({ seed: 3, only: 'wind' });
  g.start(); g.gravity = 0;
  const x0 = g.cur.x;
  for (let t = 0; t < 4000; t += 16) { w.step(g, 16); g.gravity = 0; }
  ok(g.cur && g.cur.x !== x0 && Math.sign(g.cur.x - x0) === w.dir, 'wind blows the piece its way');
  ok(w.wind > 0, 'wind speed shown');
}
// rain: falls faster and locks sooner; snow: slower
{
  const g = new ZZ.Game({ seed: 4, garbage: false });
  const r = new W({ seed: 4, only: 'rain' }); r.step(g, 16);
  ok(g.gravity > r.baseGrav && g.lockDelay < r.baseLock, 'rain: faster fall, shorter lock');
  ok(r.rain > 0, 'rain amount shown');
  const s = new W({ seed: 4, only: 'snow' }); s.step(g, 16);
  ok(g.gravity < s.baseGrav && g.lockDelay === s.baseLock, 'snow: slower fall');
}
// snow settles on the stack, but never completes a row by itself
{
  const r = run(9, 'snow', 60000);
  const snow = r.g.grid.reduce((n, row) => n + Array.from(row).filter(c => c === ZZ.SNOW).length, 0);
  ok(r.log.some(x => x.startsWith('drift')), 'snow drifts');
  ok(snow > 0, 'snow cells on the board (' + snow + ')');
  ok(r.g.grid.every(row => Array.from(row).filter(c => c).length < ZZ.COLS || Array.from(row).some(c => c !== ZZ.SNOW)), 'snow alone never fills a row');
}
// lightning turns a block into cement
{
  const g = new ZZ.Game({ seed: 11, garbage: false, board: ['XXXX.XXXXX', 'XXXX.XXXXX'] });
  for (let x = 0; x < 10; x++) if (g.grid[ZZ.ROWS - 2][x]) g.grid[ZZ.ROWS - 2][x] = 3;   // glaze the top row so a strike shows
  const w = new W({ seed: 11, only: 'storm' });
  g.start();
  let bolt = null;
  for (let t = 0; t < 20000 && !bolt; t += 16) { w.step(g, 16).forEach(e => { if (e.type === 'bolt') bolt = e; }); g.gravity = 0; }
  ok(bolt && bolt.y >= 0 && g.grid[bolt.y][bolt.x] === ZZ.GARBAGE, 'lightning makes cement');
}
// fog hides more rows at higher levels
{ const w = new W({ seed: 2, only: 'fog' }); w.step(new ZZ.Game({ seed: 2 }), 16); ok(w.fog >= 4 && w.info().fog === w.fog, 'fog rows'); }
// runs get faster
ok(W.gravAt(300000) > W.gravAt(0), 'the run speeds up');

// rewards
const mem = {}; M.store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
M.now = () => new Date(2026, 10, 20, 12).getTime();
M.load();
let c0 = M.data.coins, r = M.wxDone(10, 3, 2000, false);
ok(r.ok && r.coins === 0 && M.data.coins === c0, 'under 20 seconds: no coins');
ok(M.data.lv.wx === 2000, 'best score kept');
r = M.wxDone(200, 40, 50000, false);
ok(r.coins === Math.min(60, 10 + 10) && r.best && r.bestSec, 'coins for a long run');
r = M.wxDone(3600, 99999, 1e12, false);
ok(r.coins === 60 && M.data.lv.wx === 3600 * 3000 + 5000, 'coins and score capped');
c0 = M.data.coins; const best = M.data.lv.wx;
r = M.wxDone(600, 100, 9e9, true);
ok(r.coins === 0 && M.data.coins === c0 && M.data.lv.wx === best, 'practice pays nothing and sets no record');
ok(M.OPS.indexOf('wx') >= 0, 'wx is an op');
ok(M.run('wx', [30, 4, 900, 0]).ok, 'runs as an op');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
