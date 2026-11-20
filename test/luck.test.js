'use strict';
// The wheel and the slot machine: the odds published in the game add up, the draws follow them, the daily limits
// hold, and the slot pays back less than it costs on average.
const ZZ = require('../src/engine.js');
require('../src/meta.js');
const M = ZZ.Meta;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
const mem = {}; M.store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
let clock = new Date(2026, 10, 20, 12).getTime(); M.now = () => clock;
const rng = new ZZ.RNG(12345); M.rand = () => rng.next();
M.load();

const sum = l => l.reduce((a, x) => a + x.p, 0);
ok(Math.abs(sum(M.WHEEL) - 100) < 1e-9, 'wheel odds add up to 100');
ok(Math.abs(sum(M.SLOT.outs) - 100) < 1e-9, 'slot odds add up to 100');

// once a day free, twice for a member
let r = M.spinWheel(); ok(r.ok, 'first spin');
r = M.spinWheel(); ok(!r.ok && r.why === 'none', 'no second free spin');
M.subscribe(); ok(M.wheelLeft() === 1 && M.spinWheel().ok && !M.spinWheel().ok, 'a member gets one more');

// the wheel follows its odds
const N = 40000, seen = {};
for (let i = 0; i < N; i++) { M.data.daily.wheel = 0; const s = M.spinWheel(); seen[s.seg] = (seen[s.seg] || 0) + 1; }
M.WHEEL.forEach(w => { const got = (seen[w.id] || 0) / N * 100; ok(Math.abs(got - w.p) < Math.max(0.6, w.p * 0.12), 'wheel ' + w.id + ' near ' + w.p + '% (got ' + got.toFixed(2) + ')'); });

// the slot: costs 50, twenty a day, and pays back less than it takes
M.data.coins = 10;
r = M.pullSlot(); ok(!r.ok && r.why === 'poor', 'no pull without 50 coins');
M.data.coins = 1e7;
let pulls = 0;
while (M.pullSlot().ok) pulls++;
ok(pulls === 20, 'twenty pulls a day (' + pulls + ')');
let spent = 0, back = 0, items = 0; const outs = {};
for (let i = 0; i < N; i++) {
  M.data.daily.slot = 0;
  const c0 = M.data.coins, s = M.pullSlot();
  spent += 50; back += M.data.coins - c0 + 50; items += s.got.filter(g => g.kind === 'item').length;
  outs[s.out] = (outs[s.out] || 0) + 1;
}
M.SLOT.outs.forEach(o => { const got = (outs[o.id] || 0) / N * 100; ok(Math.abs(got - o.p) < Math.max(0.4, o.p * 0.12), 'slot ' + o.id + ' near ' + o.p + '% (got ' + got.toFixed(2) + ')'); });
const rtp = (back + items * 50) / spent;      // an item counted at about what one costs in the shop
ok(rtp > 0.8 && rtp < 0.95, 'the slot pays back a little less than it takes (' + (rtp * 100).toFixed(1) + '%)');

// ---------- the 200 items ----------
const I = ZZ.ITEMS;
ok(I.length === 201 && I.slice(1).every((d, i) => d.id === i + 1), '200 items, numbered 1 to 200');
ok(new Set(I.slice(1).map(d => JSON.stringify(d.fx))).size === 200, 'no two items do the same thing');
ok(JSON.stringify(I.slice(1, 8).map(d => d.fx)) === JSON.stringify([[['chisel', 3]], [['grout', 3]], [['shield', 8000]], [['goldT', 2]], [['trowel', 1]], [['freeze', 3000]], [['boost', 8000, 2]]]), 'the first seven are the classic ones');
ok(JSON.stringify(M.ITEM_PRICE.slice(0, 8)) === JSON.stringify([0, 40, 50, 40, 60, 50, 60, 60]), 'and keep their prices');
ok(I.slice(1).every(d => d.price >= 30 && d.price <= 150 && d.tier >= 1 && d.tier <= 5 && d.fx.every(f => ZZ.FX_KIND[f[0]])), 'every item has a price, a rarity and known effects');
ok(I.slice(1).every(d => d.fx.length < 2 || d.fx[0][0] !== d.fx[1][0]), 'a combo never doubles one effect');
const pool = ZZ.ITEM_POOL, c1 = pool.filter(x => x === 1).length, c200 = pool.filter(x => x === 200).length;
ok(pool.every(x => x >= 1 && x <= 200) && c1 > c200 && new Set(pool).size === 200, 'every item can show up on the board, the classic ones most');
M.data.coins = 1000;
const had150 = M.data.items[150]; ok(M.buyItem(150).ok && M.data.items[150] === had150 + 1, 'item 150 can be bought');
ok(M.run('item', [201]).ok === false && M.run('item', [1.5]).ok === false && M.run('bring', ['3']).ok === false, 'an item number out of range is refused, not rounded');
// ---------- daily jobs in waves ----------
clock = Date.UTC(2026, 10, 19, 17, 0, 0);       // 01:00 on 20 Nov in Taiwan: a whole day ahead
M.reset();
const finishAll = () => { M.data.daily.jobs.forEach(j => { j.n = 999; }); M.data.daily.jobs.forEach(j => M.claimJobId(j.id)); };
ok(M.jobs().length === 5 && M.waveInfo().wave === 1, 'five jobs in the first wave');
ok(!M.nextWave().ok, 'no next wave before this one is done');
const w1 = M.data.daily.jobs.map(j => j.id).join();
finishAll();
let wv = M.nextWave(); ok(wv.ok && M.waveInfo().wave === 2 && M.data.daily.jobs.map(j => j.id).join() !== w1, 'a finished wave gives the next one at once, with other jobs');
finishAll();
let wi = M.waveInfo(); ok(wi.done && !wi.can && wi.at === clock + 12 * 3600000, 'after the second wave the third waits twelve hours', wi);
ok(M.nextWave().why === 'wait', 'and asking early is refused');
clock += 12 * 3600000;
ok(M.nextWave().ok && M.waveInfo().wave === 3, 'twelve hours later the third wave opens');
finishAll();
wi = M.waveInfo(); ok(wi.done && wi.last && !wi.can && M.nextWave().why === 'none', 'three waves a day at most');
clock += 12 * 3600000;
ok(M.waveInfo().wave === 1 && !M.waveInfo().done, 'a new day starts again from the first wave');
M.data.daily.jobs = M.data.daily.jobs.map(j => ({ id: 'box', n: 0, paid: false }));
M.data.coins = 0; M.data.daily.draws = 0; M.draw(2);
ok(M.data.daily.jobs[0].n === 2, 'opening boxes counts for a box job');

// ---------- holiday looks: only the open ones are on sale; each region sees its own ----------
M.data.coins = 1e6; M.cancelSub && M.cancelSub();
ok(M.buy('tile', 'xmas').ok, 'Christmas is open');
ok(M.buy('tile', 'cny').why === 'locked' && M.state('bg', 'cny') === 'locked' && M.buySet('cny').why === 'locked', 'the Lunar New Year waits');
M.subscribe(); ok(M.state('theme', 'halloween') === 'locked', 'not even a member can use a holiday before it opens'); M.cancelSub();
ok(M.festShown('cny', 'tw') && !M.festShown('cny', 'us') && M.festShown('thanks', 'us') && !M.festShown('thanks', 'jp') && M.festShown('xmas', 'jp') && M.festShown('hina', 'other'), 'each region sees its own holidays and the shared ones');
// ---------- levels ----------
require('../src/levels.js');
const Lv = ZZ.Levels;
ok(Lv.par() && Lv.par().length === 1000 && Lv.par().every(p => p[1] >= 4 && p[1] <= 150), 'every numbered level has a par the computer reached');
ok(JSON.stringify(Lv.level(77)) === JSON.stringify(Lv.level(77)), 'a level is the same every time');
ok(Lv.level(500).board.length <= 12 && Lv.level(1000).board.length <= 12, 'no level fills more than twelve rows');
M.reset();
ok(M.lvOpen(1) && !M.lvOpen(2) && M.levelClear(2, 10).ok === false, 'only level 1 is open at first');
const l1 = Lv.level(1);
let lr = M.levelClear(1, l1.par + 10); ok(lr.ok && lr.stars < 3 && M.lvOpen(2), 'a clear opens the next level', lr);
lr = M.levelClear(1, l1.par); ok(lr.stars === 3 && lr.coins === (3 - lr.had) * 10, 'a better clear pays for the new stars only', lr);
const code = Lv.encode({ goal: 'lines', need: 12, limit: 50, board: ['XX.XXXXXXX', 'X.XXXXXXXX'] }), lvBack = Lv.decode(code);
ok(lvBack && lvBack.goal === 'lines' && lvBack.need === 12 && lvBack.limit === 50 && lvBack.board.join() === 'XX.XXXXXXX,X.XXXXXXXX', 'a custom level survives its share code');
ok(Lv.decode('AAAA') === null && Lv.decode(Lv.encode({ goal: 'dig', need: 0, limit: 30, board: ['XXXXXXXXXX'] })) === null && Lv.decode('<script>') === null, 'a broken or impossible code is refused');

console.log('luck tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
