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

// weather thrown by a rival: that kind at full strength for a while, then back to the sky's own schedule
{
  const g = new ZZ.Game({ seed: 21, garbage: false }), w = new W({ seed: 21 });
  g.start();
  ok(!w.hit('sunshine') && !w.hit('aurora') && w.kindNow() === 'clear', 'an unknown kind, or the good aurora, is not thrown');
  ok(w.hit('rain', 3000) && w.kindNow() === 'rain' && w.lvlNow() === 3 && w.info().hit, 'a hit brings its weather at level 3');
  let back = false;
  for (let t = 0; t < 3500; t += 16) w.step(g, 16).forEach(e => { if (e.type === 'change' && e.back) back = true; });
  ok(back && w.kindNow() === w.kind && !w.info().hit, 'and the sky goes back afterwards');
  const opp = new W({ seed: 21, boardOnly: true }), og = new ZZ.Game({ seed: 21, manual: true });
  opp.hit('rain', 5000); const g0 = og.gravity; opp.step(og, 16);
  ok(og.gravity === g0, "a computer's wall only gets what lands on it");
}
// ---------- disasters ----------
{
  const cnt = g => g.grid.reduce((a, row) => a + row.filter(v => v).length, 0);
  const wall = (g, rows) => { for (let y = 0; y < rows.length; y++) { const r = rows[rows.length - 1 - y]; for (let x = 0; x < ZZ.COLS; x++) g.grid[ZZ.ROWS - 1 - y][x] = r[x] === '#' ? 3 : 0; } };
  const stepFor = (w, g, ms) => { const ev = []; for (let t = 0; t < ms; t += 16) ev.push(...w.step(g, 16)); return ev; };
  ok(W.DISASTERS.join() === 'flood,tornado,quake,hail,volcano,zap', 'six disasters');
  ok(W.THROWN.indexOf('aurora') < 0 && W.THROWN.indexOf('sand') >= 0 && W.THROWN.indexOf('zap') >= 0, 'everything but the aurora can be thrown');
  // the plain weather is the same with or without them
  const a = new W({ seed: 77 }), b = new W({ seed: 77, noDis: true }), g1 = new ZZ.Game({ seed: 1, garbage: false }), g2 = new ZZ.Game({ seed: 1, garbage: false });
  let ka = [], kb = [];
  for (let t = 0; t < 400000; t += 100) { a.step(g1, 100).forEach(e => e.type === 'change' && ka.push(e.kind)); b.step(g2, 100).forEach(e => e.type === 'change' && kb.push(e.kind)); }
  ok(ka.join() === kb.join() && ka.length > 10, 'disasters do not change the weather sequence');
  // rare, warned, from a minute in
  const w = new W({ seed: 5 }), g = new ZZ.Game({ seed: 5, garbage: false });
  const ev = stepFor(w, g, 600000).filter(e => e.type === 'disaster');
  const warns = ev.filter(e => e.phase === 'warn'), hits = ev.filter(e => e.phase === 'hit');
  ok(warns.length >= 4 && warns.length <= 10 && hits.length === warns.length, 'one every one to two minutes over ten minutes (' + warns.length + ')');
  // same seed, same disasters
  const w2 = new W({ seed: 5 }), ev2 = stepFor(w2, new ZZ.Game({ seed: 5, garbage: false }), 600000).filter(e => e.type === 'disaster');
  ok(JSON.stringify(ev.map(e => e.kind + e.phase)) === JSON.stringify(ev2.map(e => e.kind + e.phase)), 'the same seed brings the same disasters');
  // practice one disaster under a clear sky
  const pw = new W({ seed: 9, only: 'quake' }), pev = stepFor(pw, new ZZ.Game({ seed: 9, garbage: false }), 60000);
  ok(pw.kind === 'clear' && pev.filter(e => e.type === 'disaster' && e.phase === 'hit').every(e => e.kind === 'quake') && pev.filter(e => e.type === 'disaster' && e.phase === 'hit').length >= 2, 'practising earthquakes: clear sky, quakes only, often');

  // the earthquake brings down floating blocks, clears the rows it fills, topples a tower
  {
    const q = new W({ seed: 3, noDis: true }), qg = new ZZ.Game({ seed: 3, garbage: false });
    wall(qg, ['#.........', '..........', '#########.', '#########.']);
    q.startDis('quake', 2, 10);
    const e = stepFor(q, qg, 2400);
    ok(e.some(x => x.type === 'disaster' && x.phase === 'warn') && e.some(x => x.type === 'disaster' && x.phase === 'hit') && e.some(x => x.type === 'disaster' && x.phase === 'end'), 'warn, hit, end');
    ok(qg.grid[ZZ.ROWS - 4][0] === 0 && qg.grid[ZZ.ROWS - 3][0] !== 0 && cnt(qg) === 19, 'the floating block came down, nothing lost');
    const t2 = new W({ seed: 3, noDis: true }), tg = new ZZ.Game({ seed: 3, garbage: false });
    wall(tg, ['....#.....', '....#.....', '....#.....', '....#.....', '###.##.###']);
    const before = cnt(tg), s0 = tg.stats.score || 0;
    t2.startDis('quake', 1, 10); stepFor(t2, tg, 400);
    ok(cnt(tg) === before && (ZZ.ROWS - tg.grid.findIndex(r => r[4])) < 5, 'a tall column topples one block over');
    const l3 = new W({ seed: 3, noDis: true }), lg = new ZZ.Game({ seed: 3, garbage: false });
    wall(lg, ['....#.....', '##########'.replace(/#/g, '#').slice(0, 4) + '.' + '#####']);
    l3.startDis('quake', 2, 10); stepFor(l3, lg, 400);
    ok(lg.stats.lines === 1 && lg.stats.score > s0 && cnt(lg) === 0, 'a row filled by the quake is cleared and scored');
  }
  // the flood washes the top blocks downstream; off the far edge they are gone
  {
    const f = new W({ seed: 4, noDis: true }), fg = new ZZ.Game({ seed: 4, garbage: false });
    wall(fg, ['#.#.#.#.#.', '##########'.slice(0, 9) + '.']);
    const before = cnt(fg);
    f.startDis('flood', 1, 10); f.dis.dir = 1;
    const e = stepFor(f, fg, 3600);
    const end = e.find(x => x.type === 'disaster' && x.phase === 'end');
    ok(e.filter(x => x.type === 'wash').length >= 5, 'the wave washes column after column');
    ok(cnt(fg) + end.gone === before, 'every block is either still on the wall or counted as washed away');
    ok(fg.grid.every(r => r.some(v => !v)), 'it never fills a row by itself');
  }
  // the tornado lifts what it passes and drops it elsewhere
  {
    const tw = new W({ seed: 6, noDis: true }), tg = new ZZ.Game({ seed: 6, garbage: false });
    wall(tg, ['##.##.##..', '###.######']);
    const before = cnt(tg);
    tw.startDis('tornado', 2, 10);
    const e = stepFor(tw, tg, 4200), end = e.find(x => x.type === 'disaster' && x.phase === 'end');
    ok(e.some(x => x.type === 'lift') && e.some(x => x.type === 'drop'), 'lifted, then dropped');
    ok(cnt(tg) + end.gone === before && tw.dis === null, 'nothing appears from nowhere');
  }
  // the falling piece rides the flood
  {
    const f = new W({ seed: 8, noDis: true }), fg = new ZZ.Game({ seed: 8, garbage: false, gravity: 0 });
    fg.start(); const y0 = fg.cur.y, ys = new Set();
    f.startDis('flood', 2, 10);
    for (let t = 0; t < 3000; t += 16) { f.step(fg, 16); ys.add(fg.cur.y); }
    ok(ys.size >= 2, 'the piece bobs up and down');
  }
  // hail: ice on top of columns; cleared once it cracks and comes back, cleared again it goes
  {
    const h = new W({ seed: 11, noDis: true }), hg = new ZZ.Game({ seed: 11, garbage: false, gravity: 0 });
    h.startDis('hail', 2, 10);
    const e = stepFor(h, hg, 3000);
    const ice = hg.grid.reduce((a, r) => a + r.filter(v => v === ZZ.ICE).length, 0);
    ok(e.filter(x => x.type === 'hail').length === 6 && ice === 6, 'six hailstones at level 2, all ice (' + ice + ')');
    const ig = new ZZ.Game({ seed: 3, garbage: false, gravity: 0 });
    // a row of ice and cement with one gap; an I piece standing upright fills it
    for (let x = 0; x < ZZ.COLS; x++) ig.grid[ZZ.ROWS - 1][x] = x === 9 ? 0 : x === 4 ? ZZ.ICE : 8;
    ig.start(); ig.cur = { type: 'I', rot: 1, x: 7, y: ZZ.ROWS - 4 };
    while (!ig.fits('I', 1, ig.cur.x, ig.cur.y)) ig.cur.y--;
    ig.lock();
    ok(ig.stats.lines === 1 && ig.grid.some(r => r[4] === ZZ.CRACK), 'the first clear only cracks the ice');
  }
  // the volcano: a lava row with a gap, blocks on it burn, it cools into cement
  {
    const v = new W({ seed: 12, noDis: true }), vg = new ZZ.Game({ seed: 12, garbage: false, gravity: 0 });
    wall(vg, ['#########.']);
    const before = cnt(vg);
    v.startDis('volcano', 2, 10);
    const e = stepFor(v, vg, 3600), end = e.find(x => x.type === 'disaster' && x.phase === 'end');
    ok(e.some(x => x.type === 'erupt') && e.filter(x => x.type === 'burn').length === 3, 'it erupts and three blocks burn at level 2');
    ok(vg.grid[ZZ.ROWS - 1].filter(c => c === 8).length === 9 && !vg.grid.some(r => r.includes(ZZ.LAVA)), 'the lava cooled into cement with one gap');
    ok(cnt(vg) === before + 9 - end.gone && end.gone === 3, 'nothing else changes');
  }
  // the bolt splits a whole column
  {
    const z = new W({ seed: 13, noDis: true }), zg = new ZZ.Game({ seed: 13, garbage: false });
    wall(zg, ['....#.....', '###.######', '#########.']);
    z.startDis('zap', 3, 10);
    const e = stepFor(z, zg, 1200), hit = e.find(x => x.type === 'zap');
    ok(hit && hit.x === 4 && hit.n === 3 && zg.grid.every(r => !r[4]), 'a strong bolt splits the tallest column');
  }
  // the aurora doubles the points; sand and the eclipse are on show
  {
    const a2 = new W({ seed: 14, only: 'aurora' }), ag = new ZZ.Game({ seed: 14, garbage: false });
    a2.step(ag, 16); ag.stats.score = 100; a2.step(ag, 16);
    ok(ag.stats.score === 200, 'the aurora counts every point twice');
    const sw = new W({ seed: 14, only: 'sand' }), sg = new ZZ.Game({ seed: 14, garbage: false }); sg.start(); sw.step(sg, 16);
    ok(sw.info().sand > 0 && sw.info().wind > 0, 'a sandstorm blows and hides the next pieces');
    const ew = new W({ seed: 14, only: 'eclipse' }); ew.step(new ZZ.Game({ seed: 14, garbage: false }), 16);
    ok(ew.info().dark > 0, 'an eclipse darkens the sky');
  }
  // thrown by the rival
  {
    const hw = new W({ seed: 2, noDis: true });
    ok(hw.hit('tornado', 9000) && hw.dis && hw.dis.kind === 'tornado' && hw.dis.lvl === 3, 'a disaster can be thrown');
    ok(!hw.hit('quake', 9000), 'but not on top of one already going');
  }
}

// storm points
{
  const mem2 = {}; M.store = { getItem: k => mem2[k] || null, setItem: (k, v) => { mem2[k] = v; } }; M.load();
  let r = M.wxBattle(1, false); ok(r.after === 15 && r.delta === 15, 'a win against the computer: +15');
  r = M.wxBattle(1, true); ok(r.after === 40, 'against a person: +25');
  r = M.wxBattle(-1, true); ok(r.after === 30 && r.delta === -10, 'a loss: -10');
  M.data.lv.wxr = 4; r = M.wxBattle(-1, false); ok(r.after === 0 && r.delta === -4, 'never below zero');
  ok(M.OPS.indexOf('wxb') >= 0, 'wxb is an op');
}

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
