'use strict';
const ZZ = require('../src/engine.js');
require('../src/bot.js');
require('../src/meta.js');
const M = ZZ.Meta;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
const mem = {}; M.store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
let clock = new Date(2026, 10, 18, 12).getTime(); M.now = () => clock;
M.load();
eq(M.data.coins, 200, 'starting coins');
eq(M.rankOf(0).name, '陶土 III', 'rank 0');
eq(M.rankOf(250).name, '陶土 I', 'rank 250');
eq(M.rankOf(300).name, '紅磚 III', 'rank 300');
eq(M.rankOf(1799).name, '鎏金 I', 'rank 1799');
ok(M.rankOf(1800).top && M.rankOf(1800).name === '窯神', 'top rank');
ok(M.rpDelta(0, 1, 0, 0) === 20 && M.rpDelta(0, 1, 9, 3) === 35, 'win delta');
eq(M.rpDelta(305, -1, 0, 0), -5, 'loss cannot drop below tier floor');
eq(M.rpDelta(300, -1, 0, 0), -0, 'at floor');
const b0 = M.botFor(0, () => 0), b1 = M.botFor(900, () => 0), b2 = M.botFor(1800, () => 0), b3 = M.botFor(2400, () => 0);
ok(b0.pps === 0.45 && b0.level === 0, 'bot at 0');
ok(Math.abs(b1.pps - 1.1) < 0.01 && b1.level === 2 && b1.hold, 'bot at 900');
ok(Math.abs(b2.pps - 2.3) < 0.01 && b2.level === 4, 'bot at 1800');
ok(b3.pps > 2.3, 'bot keeps getting faster past the top');
ok(M.botFor(600, () => 0).pps > b0.pps && M.botFor(600, () => 0).pps < b1.pps, 'bot in between');
// shop
eq(M.state('tile', 'glaze'), 'ok', 'stock tile');
eq(M.state('tile', 'neon'), 'buy', 'neon needs buying');
eq(M.state('tile', 'custom'), 'sub', 'custom needs membership');
eq(M.state('tile', 'gem'), 'rank', 'gem needs rank');
ok(!M.buy('tile', 'neon').ok, 'cannot afford neon');
M.data.coins = 5000;
ok(M.buy('tile', 'neon').ok && M.data.coins === 3800 && M.owns('tile', 'neon'), 'buy neon');
ok(!M.buy('tile', 'neon').ok, 'no double buy');
ok(M.equip('tile', 'neon') && M.data.equip.tile === 'neon', 'equip');
ok(!M.equip('bg', 'neongrid'), 'cannot equip unowned');
const sp = M.setPrice('market');
eq(sp.full, 1200 + 900 + 1000 + 600, 'set full price');
eq(sp.price, Math.round((900 + 1000 + 600) * 0.75 / 10) * 10, 'set price skips owned parts');
ok(M.buySet('market').ok && M.setUsable('market') && M.equipSet('market'), 'buy and wear a set');
eq(M.data.equip, { tile: 'neon', bg: 'neongrid', theme: 'market', fx: 'star' }, 'set equipped');
ok(!M.buySet('market').ok, 'set already owned');
// items
ok(M.buyItem(2).ok && M.data.items[2] === 1, 'buy item');
ok(M.toggleBring(2) && M.data.bring.length === 1, 'bring item');
ok(!M.toggleBring(3), 'cannot bring what you do not have');
eq(M.takeBring(), [2], 'take bring');
eq(M.data.items[2], 0, 'stock used'); eq(M.data.bring, [], 'bring cleared when out of stock');
// membership
ok(!M.isSub(), 'not a member');
M.subscribe();
ok(M.isSub() && M.subDaysLeft() === 30, 'member for 30 days');
ok(M.canUse('tile', 'custom') && M.canUse('tile', 'wood') && M.canUse('bg', 'ember'), 'members can use everything');
M.equip('tile', 'wood'); M.equip('bg', 'custom');
M.cancelSub();
eq(M.data.equip.tile, 'glaze', 'unowned look reverts after membership ends');
eq(M.data.equip.bg, 'wall', 'custom bg reverts');
eq(M.data.equip.theme, 'market', 'owned look stays');
// match rewards
M.data.coins = 0;
let r = M.finish({ mode: 'ai', result: 1, level: 2, ko: 2, koOpp: 0, stats: { score: 12000, spins: 3, minis: 0, sent: 30, quads: 1, maxCombo: 2, xspins: 0 } });
eq(r.coins, 30 + 22 + 8 + 50, 'ai win coins with first win of the day');
eq(M.data.coins, r.coins, 'coins banked');
r = M.finish({ mode: 'ai', result: -1, level: 2, ko: 0, koOpp: 2, stats: { score: 2000, spins: 0, minis: 0, sent: 3, quads: 0, maxCombo: 0, xspins: 0 } });
eq(r.coins, 5 + 5, 'loss still pays a little');
r = M.finish({ mode: 'rank', result: 1, ko: 3, koOpp: 1, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
ok(r.rank && r.rank.delta === 26 && M.data.rp === 26 && !r.rank.up, 'ranked win moves rating');
M.data.rp = 90; M.data.peak = 90;
r = M.finish({ mode: 'rank', result: 1, ko: 1, koOpp: 0, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
ok(r.rank.up && r.rank.to.name === '陶土 II' && r.rank.bonus === 40, 'promotion pays a bonus');
M.subscribe();
r = M.finish({ mode: 'ai', result: -1, level: 0, ko: 0, stats: { score: 4000, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
eq(r.coins, 15 + 8, 'member boost');
M.cancelSub();
r = M.finish({ mode: 'sprint', result: 1, time: 80000, newBest: true, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
eq(r.coins, 15 + 20 + 20, 'sprint reward');
// daily jobs and login
ok(M.jobs().length === 3, 'three jobs a day');
const before = M.jobs().map(j => j.id).join();
M.data.daily.jobs[0] = { id: 'win', n: 2, paid: false };
ok(M.jobsReady() >= 1 && M.claimJob(0) === 60 && M.claimJob(0) === 0, 'claim a finished job once');
M.data.daily.login = 0; M.data.daily.streak = 0;
eq(M.claimLogin(), 20, 'first login'); eq(M.claimLogin(), 0, 'once a day');
clock += 86400000; M.rollDay();
eq(M.claimLogin(), 30, 'second day in a row');
ok(M.jobs().every(j => j.n === 0 && !j.paid), 'new day, new jobs');
clock += 3 * 86400000;
eq(M.claimLogin(), 20, 'streak broken');
// first clears
eq(M.firstClear('drills', 3, 15), 15, 'first clear pays'); eq(M.firstClear('drills', 3, 15), 0, 'only once');
// season roll
M.data.rp = 950; M.data.peak = 950; M.data.rgames = 4; const c0 = M.data.coins;
clock = new Date(2026, 11, 2, 12).getTime(); M.rollSeason();
ok(M.data.coins === c0 + 60 + 3 * 90 && M.data.rp === 670 && M.data.rgames === 0 && M.data.note.kind === 'season', 'season reward and soft reset');
// persistence
M.save(); const snap = JSON.stringify(M.data); M.load();
ok(M.data.rp === 670 && M.data.owned.tile.indexOf('neon') >= 0, 'reload keeps progress');
ok(before.length > 0, 'jobs had ids');
console.log('meta tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
