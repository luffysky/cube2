'use strict';
const ZZ = require('../src/engine.js');
require('../src/bot.js'); require('../src/drills.js'); require('../src/openers.js');
require('../src/meta.js');
const M = ZZ.Meta;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
const mem = {}; M.store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
let clock = new Date(2026, 10, 18, 12).getTime(); M.now = () => clock;
M.load();
eq(M.data.coins, 200, 'starting coins');
eq(M.rankOf(0).name, '地基 III', 'rank 0');
eq(M.rankOf(250).name, '地基 I', 'rank 250');
eq(M.rankOf(300).name, '石牆 III', 'rank 300');
eq(M.rankOf(1799).name, '天空城 I', 'rank 1799');
ok(M.rankOf(1800).top && M.rankOf(1800).name === '通天塔', 'top rank');
ok(M.rpDelta(0, 1, 0, 0) === 20 && M.rpDelta(0, 1, 9, 3) === 35, 'win delta');
eq(M.rpDelta(305, -1, 0, 0), -5, 'loss cannot drop below tier floor');
eq(M.rpDelta(300, -1, 0, 0), -0, 'at floor');
// the ranked ladder: two beginner levels first (150 points each), then the five regular ones (450 each)
const b0 = M.botFor(0, () => 0), b1 = M.botFor(1200, () => 0), b2 = M.botFor(2100, () => 0), b3 = M.botFor(2700, () => 0);
ok(b0.pps === 0.22 && b0.level === 5 && b0.noise === 60, 'the first ranked rival is the gentlest one', b0);
ok(M.botFor(150, () => 0).pps === 0.32 && M.botFor(150, () => 0).level === 6, 'then the second beginner level');
ok(M.botFor(300, () => 0).pps === 0.45 && M.botFor(300, () => 0).level === 0, 'the old first rival now waits at 300');
ok(Math.abs(b1.pps - 1.1) < 0.01 && b1.level === 2 && b1.hold, 'bot at 1200');
ok(Math.abs(b2.pps - 2.3) < 0.01 && b2.level === 4, 'bot at 2100');
ok(b3.pps > 2.3 && M.botFor(9999, () => 0).pps === b3.pps, 'bot keeps getting faster past the top, up to a limit');
ok(M.botFor(600, () => 0).pps > b0.pps && M.botFor(600, () => 0).pps < b1.pps, 'bot in between');
let lastPps = 0, climbs = true;
for (let rp = 0; rp <= 2700; rp += 25) { const b = M.botFor(rp, () => 0); if (b.pps < lastPps) climbs = false; lastPps = b.pps; if (!ZZ.Bot.LEVELS[b.level]) climbs = false; }
ok(climbs, 'the ladder never gets easier on the way up');
// levels: order, and the player's own difficulty setting
const BL = ZZ.Bot.LEVELS, BO = ZZ.Bot.ORDER;
ok(BL.length === 7 && BO.length === 7 && BO.slice().sort().join() === '0,1,2,3,4,5,6', 'seven levels, each listed once');
ok(BO.every((n, i) => BL[n].tier === i && (i === 0 || BL[n].pps > BL[BO[i - 1]].pps && BL[n].noise < BL[BO[i - 1]].noise)), 'listed from easiest to hardest');
ok(BL[0].id === 'l1' && BL[4].id === 'l5', 'the old levels kept their numbers (saved games and the server use them)');
const ez = ZZ.Bot.eased(BL[1], -2), hd = ZZ.Bot.eased(BL[1], 2), same = ZZ.Bot.eased(BL[1], 0);
ok(same.pps === BL[1].pps && same.noise === BL[1].noise && same.w === BL[1].w, 'standard difficulty changes nothing');
ok(ez.pps < BL[1].pps && ez.noise > BL[1].noise && hd.pps > BL[1].pps && hd.noise < BL[1].noise, 'easier is slower and sloppier, harder is faster and sharper', [ez, hd]);
ok(ZZ.Bot.eased(BL[4], -2).noise > 0 && ZZ.Bot.eased(BL[1], 7).pps === BL[1].pps, 'even the top level slips when eased; a setting out of range counts as standard');
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
eq(M.data.equip, { tile: 'neon', bg: 'neongrid', theme: 'market', fx: 'star', ghost: 'line', site: 'default' }, 'set equipped');
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
// level-up coins come on top of a match's own pay; the sums below are about the match
const noLv = r => r.coins - r.parts.filter(p => p.key === 'lvup').reduce((a, p) => a + p.n, 0);
M.data.coins = 0;
let r = M.finish({ mode: 'ai', result: 1, level: 2, ko: 2, koOpp: 0, ms: 120000, stats: { score: 12000, spins: 3, minis: 0, sent: 30, quads: 1, maxCombo: 2, xspins: 0 } });
eq(noLv(r), 30 + 22 + 8 + 50, 'ai win coins with first win of the day');
eq(M.data.coins, r.coins, 'coins banked');
r = M.finish({ mode: 'ai', result: -1, level: 2, ko: 0, koOpp: 2, ms: 120000, stats: { score: 2000, spins: 0, minis: 0, sent: 3, quads: 0, maxCombo: 0, xspins: 0 } });
eq(noLv(r), 5 + 5, 'loss still pays a little');
r = M.finish({ mode: 'rank', result: 1, ko: 3, koOpp: 1, ms: 120000, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
ok(r.rank && r.rank.delta === 26 && M.data.rp === 26 && !r.rank.up, 'ranked win moves rating');
M.data.rp = 90; M.data.peak = 90;
r = M.finish({ mode: 'rank', result: 1, ko: 1, koOpp: 0, ms: 120000, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
ok(r.rank.up && r.rank.to.name === '地基 II' && r.rank.bonus === 40, 'promotion pays a bonus');
M.subscribe();
r = M.finish({ mode: 'ai', result: -1, level: 0, ko: 0, ms: 120000, stats: { score: 4000, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
eq(noLv(r), 15 + 8, 'member boost');
M.cancelSub();
r = M.finish({ mode: 'sprint', result: 1, ms: 80000, stats: { score: 0, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0 } });
eq(noLv(r), 15 + 20 + 20, 'sprint reward');
ok(r.best && M.data.tot.sprint === 80000, 'first sprint is the record');
r = M.finish({ mode: 'sprint', result: 1, ms: 95000, stats: {} });
ok(!r.best && r.coins === 15 + 10 && M.data.tot.sprint === 80000, 'a slower sprint leaves the record alone', r);
r = M.finish({ mode: 'sprint', result: 1, ms: 59999, stats: {} });
ok(r.best && r.coins === 15 + 40 + 20 && M.data.tot.sprint === 59999, 'a faster sprint takes the record');
// daily jobs and login
ok(M.jobs().length === 5, 'five jobs a wave');
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
eq(M.firstClear('drills', 3), 15, 'first clear pays'); eq(M.firstClear('drills', 3), 0, 'only once');
eq(M.firstClear('openers', 'dt'), 80, 'opener pays what the lesson says'); eq(M.firstClear('openers', 'dt'), 0, 'opener only once');
eq([M.firstClear('drills', 999), M.firstClear('drills', -1), M.firstClear('drills', 1.5), M.firstClear('drills', '2'), M.firstClear('openers', 'nope'), M.firstClear('constructor', 0)], [0, 0, 0, 0, 0, 0], 'no reward for a drill or lesson that does not exist');
// season roll
M.data.rp = 950; M.data.peak = 950; M.data.rgames = 4; const c0 = M.data.coins;
clock = new Date(2026, 11, 2, 12).getTime(); M.rollSeason();
ok(M.data.coins === c0 + 60 + 3 * 90 && M.data.rp === 670 && M.data.rgames === 0 && M.data.note.kind === 'season', 'season reward and soft reset');
// persistence
M.save(); const snap = JSON.stringify(M.data); M.load();
ok(M.data.rp === 670 && M.data.owned.tile.indexOf('neon') >= 0, 'reload keeps progress');
ok(before.length > 0, 'jobs had ids');

// ---------- the game day is the same everywhere: it turns at midnight UTC+8 ----------
clock = Date.UTC(2026, 10, 30, 15, 59, 0); const dA = M.dayNo(); eq(M.seasonId(), '2026-11', 'still November at 23:59 Taiwan time');
clock = Date.UTC(2026, 10, 30, 16, 0, 1); eq(M.dayNo(), dA + 1, 'day turns at 16:00 UTC'); eq(M.seasonId(), '2026-12', 'and so does the season');
clock = Date.UTC(2027, 0, 1, 15, 0, 0); eq(M.seasonId(), '2027-01', 'January');

// ---------- match numbers are kept inside what the match length allows ----------
let c = M.cleanMatch({ mode: 'rank', result: 5, level: 9, ko: 999, koOpp: -3, itemsUsed: 1e9, ms: 60000, stats: { score: 1e9, sent: 1e9, spins: -5, minis: 'x', xspins: 2.4, quads: 1e9, maxCombo: 999, lines: 1e9, pieces: 1e9 } });
eq(c, { mode: 'rank', result: 1, level: 6, team: false, quick: false, pr: false, place: 0, room: '', seats: 1, ko: 60, koOpp: 0, itemsUsed: 60, ms: 60000, time: 0, stats: { score: 185000, sent: 380, spins: 0, minis: 0, xspins: 2, tst: 0, quads: 63, maxCombo: 40, lines: 308, pieces: 370 } }, 'clean match clamps');
eq(M.cleanMatch({ mode: 'hack', result: -1, stats: { score: 99999 } }).mode, 'ai', 'unknown mode becomes a plain match');
eq(M.cleanMatch({ mode: 'ai', result: 1, stats: { score: 99999 } }).stats.score, 5000, 'no length given, so almost no score counts');
eq(M.cleanMatch({ mode: 'sprint', result: -1, ms: 30000 }).result, 0, 'a sprint cannot be lost for points');
eq(M.cleanMatch({ mode: 'sprint', result: 1, ms: 41234.6 }).time, 41235, 'sprint time is whole milliseconds');
eq(M.cleanMatch(null).stats.score, 0, 'nothing in, zeros out');
eq(M.cleanMatch({ mode: 'toString', ms: 1 }).mode, 'ai', 'inherited names are not modes');
eq([M.cleanMatch({ mode: ['rank'], ms: 1 }).mode, M.cleanMatch({ mode: 'rank', stats: 'x', ms: 1 }).stats.score, M.cleanMatch('x').mode, M.cleanMatch([1]).mode], ['ai', 0, 'ai', 'ai'], 'a mode has to be plain text, stats a plain object');

// ---------- every change is reported once, and repeating the reports rebuilds the same record ----------
clock = Date.UTC(2026, 11, 10, 4, 0, 0);
M.reset(); M.data.coins = 6000; M.data.daily.jobs = [{ id: 'win', n: 1, paid: false }, { id: 'play', n: 2, paid: false }, { id: 'tspin', n: 0, paid: false }];
const start = JSON.stringify(M.data), ops = [];
M.onOp = (k, a) => ops.push([k, JSON.parse(JSON.stringify(a))]);
M.setName('  阿<b>明</b>  \u200b');
M.buy('tile', 'neon'); M.equip('tile', 'neon'); M.buySet('qinghua'); M.equipSet('qinghua');
M.buyItem(2); M.buyItem(2); M.buyItem(5); M.toggleBring(2); M.toggleBring(5); M.takeBring();
M.claimLogin();
M.finish({ mode: 'ai', result: 1, level: 3, ko: 3, koOpp: 1, itemsUsed: 2, ms: 120000, stats: { score: 31000, spins: 6, minis: 1, sent: 44, quads: 2, maxCombo: 6, xspins: 1, lines: 60, pieces: 150 } });
M.finish({ mode: 'rank', result: 1, ko: 2, koOpp: 0, ms: 120000, stats: { score: 9000, spins: 1, sent: 20 } });
M.finish({ mode: 'sprint', result: 1, ms: 71000, stats: { score: 12000, lines: 40, pieces: 101 } });
M.claimJob(0); M.claimJob(1);
M.firstClear('drills', 0); M.firstClear('openers', 'tsd');
M.subscribe(); M.equip('bg', 'ember'); M.cancelSub();
M.data.note = { kind: 'season', coins: 60, tier: 0, div: 0, top: false }; M.takeNote();
// things that fail are not reported
M.buy('tile', 'neon'); M.buy('tile', 'gem'); M.equip('fx', 'petal'); M.buyItem(0); M.toggleBring(7); M.toggleBring(3); M.claimLogin(); M.claimJob(7); M.claimJob(0); M.firstClear('drills', 0); M.setName('阿b明/b'); M.takeNote();
M.onOp = null;
eq(ops.map(o => o[0]).join(' '), 'name buy wear set wset item item item bring bring take login fin fin fin job job first first sub wear unsub note', 'one report per change, none for a refusal');
eq(M.data.name, '阿b明/b', 'name cleaned');
eq(ops[0][1], ['阿b明/b'], 'the cleaned name is what gets reported');
eq(ops[15][1], ['win'], 'a job is reported by its name');
ok(ops[12][1][0].mode === 'ai' && ops[12][1][0].stats.score === 31000 && ops[12][1][0].battle === undefined, 'a match is reported cleaned', ops[12][1][0]);
const endA = JSON.stringify(M.data);
M.use(JSON.parse(start));
let seen = 0; M.onOp = () => { seen++; };
const res = ops.map(o => M.run(o[0], o[1]));
M.onOp = null;
ok(res.every(x => x && x.ok), 'every repeated change is accepted', res.filter(x => !x.ok));
eq(seen, 0, 'repeating a change does not report it again');
eq(JSON.parse(JSON.stringify(M.data)), JSON.parse(endA), 'repeating the reports gives the same record');
ok(M.data.coins > 0 && M.data.rp > 0 && M.data.tot.sprint === 71000 && M.data.tot.best === 31000 && M.data.first.openers[0] === 'tsd' && M.data.owned.tile.indexOf('neon') >= 0, 'and that record holds what was done', M.data);

// ---------- nothing odd gets through the by-name door ----------
const before2 = JSON.stringify(M.data);
const junk = [['hack', []], ['buy', 'tile'], ['buy', ['__proto__', 'x']], ['buy', ['constructor', 'length']], ['buy', [{}, {}]], ['buy', ['tile', 'gem']], ['buy', ['tile', 'custom']], ['buy', ['tile', 'x'.repeat(5000)]],
  ['wear', ['__proto__', 'polluted']], ['wear', ['tile', 'gem']], ['wear', [null, null]], ['set', [42]], ['set', ['nope']], ['wset', [{ toString() { return 'market'; } }]], ['item', [0]], ['item', [201]], ['item', ['x']], ['item', [-1]],
  ['bring', [7]], ['bring', [99]], ['job', ['nope']], ['job', [0]], ['first', ['drills', 4096]], ['first', ['__proto__', 0]], ['first', ['openers', { id: 'dt' }]], ['toString', []], ['constructor', []], [null, []], [5, []], ['fin', null]];
const jr = junk.map(j => { try { return M.run(j[0], j[1]); } catch (e) { return { threw: String(e) }; } });
ok(jr.every(x => x && x.ok === false && !x.threw), 'junk is refused without throwing', jr.map((x, i) => x.ok === false && !x.threw ? null : [junk[i][0], x]).filter(Boolean));
eq(JSON.stringify(M.data), before2, 'and changes nothing');
ok(({}).polluted === undefined && Object.prototype.polluted === undefined, 'no prototype pollution');
const fz = M.run('fin', [{ mode: 'ai', result: 1, ms: 5, stats: { score: 1e12 } }]);
ok(fz.ok && fz.out.coins <= 12 + 40 + 50, 'an absurd match pays what a real one of that length could', fz.out);
eq(M.run('fin', ['nonsense']).ok, true, 'a match that is not an object counts as an empty one');
M.run('name', [{ evil: 1 }]); eq(M.data.name, '', 'a name that is not text becomes no name');
M.run('name', ['𝓐'.repeat(40)]); eq(Array.from(M.data.name).length, 12, 'twelve characters, counted whole');
eq(M.cleanName('<script>alert(1)</script>'), 'scriptalert(', 'markup characters dropped');
eq(M.cleanName('a\u202Eb\u0000c\n d'), 'abc d', 'control and direction marks dropped');
// names on the public boards: insults and names posing as staff are cleared, ordinary ones are left alone
for (const n of ['Sh1t head', 'f.u.c.k', '官方客服', 'GM', 'ＡＤＭＩＮ', '操你', 'SnowRealm', '씨발']) eq(M.cleanName(n), '', 'name ' + n + ' is turned away');
for (const n of ['小明', 'Luffy', 'class', 'gmail', 'assassin', '鶯歌磚王', 'grape', 'Dickens', 'たのしね']) eq(M.cleanName(n), n, 'name ' + n + ' is kept');
for (const n of ['a55hole', '靠杯啦', '草泥馬', '尼玛', '腦殘王', '미친놈', 'B4stard', '王八蛋', '屌爆']) eq(M.cleanName(n), '', 'name ' + n + ' is turned away too');
for (const n of ['Luffysky', 'Spicy', 'Skyskipper', 'Lucky8', 'Peacock', 'Grapefruit', 'ちょんまげ', 'シネマ', '幹部', '能幹', 'Agent 88']) eq(M.cleanName(n), n, 'name ' + n + ' is kept too');
ok(!M.badName('B8') && M.cleanName('B8') === 'B8', 'an 8 in a name is a b, not the word undefined');

// ---------- a saved record with holes in it is filled in ----------
M.use({ coins: 12, owned: { tile: ['neon'] }, tot: { wins: 3 }, items: [0, 1], bogus: 1 });
ok(M.data.coins === 12 && M.data.owned.bg.length === 0 && M.data.tot.wins === 3 && M.data.tot.sprint === 0 && M.data.items.length === 201 && M.data.bogus === undefined && M.data.daily.jobs.length === 5, 'use() fills gaps and drops unknown fields', M.data);
M.use('garbage'); eq(M.data.coins, 200, 'use() of nonsense starts fresh');

// ---------- level and titles ----------
{
  M.reset();
  const lv = M.levelOf;
  ok(lv(0).lv === 1 && lv(59).lv === 1 && lv(60).lv === 2 && lv(60 + 80).lv === 3 && lv(1e9).lv === 100 && lv(1e9).top, 'level curve: 60 xp, then 20 more each level, up to 100');
  const win = { mode: 'ai', result: 1, level: 2, ko: 1, koOpp: 0, ms: 120000, stats: { score: 3000, spins: 0, minis: 0, sent: 5, quads: 0, maxCombo: 0, xspins: 0, lines: 10, pieces: 40 } };
  let r = M.finish(win);
  eq(r.xp, 20 + 15 + 2, 'a win: 20, 15 for winning, a little for the score');
  r = M.finish(Object.assign({}, win, { result: -1, ko: 0, koOpp: 2 }));
  eq(r.xp, 20 + 2, 'a loss still earns');
  r = M.finish(win);
  ok(r.level.from === 1 && r.level.to === 2 && r.parts.some(p => p.key === 'lvup' && p.n === M.lvCoins(2)), 'reaching level 2 pays coins', r);
  M.data.xp = 0;
  r = M.finish(Object.assign({}, win, { stats: Object.assign({}, win.stats, { score: 1e6 }) }));
  ok(r.xp <= 50, 'the score part is capped', r.xp);
  // titles
  M.reset();
  eq(M.titleNow(), 'lv1', 'everyone starts as a level-1 title');
  ok(!M.hasTitle('lv10') && !M.wearTitle('lv10'), 'a title not reached cannot be worn');
  M.data.xp = 1e6;
  ok(M.hasTitle('lv100') && M.titleNow() === 'lv100', 'level titles come with the level, the highest shows by default');
  M.data.xp = 0;
  r = M.finish(Object.assign({}, win, { stats: Object.assign({}, win.stats, { tst: 1 }) }));
  ok(r.titles.indexOf('tst') >= 0 && r.titles.indexOf('clean') >= 0 && M.hasTitle('tst'), 'a T-spin triple and a win without going down earn titles', r.titles);
  r = M.finish(Object.assign({}, win, { stats: Object.assign({}, win.stats, { tst: 1 }) }));
  eq(r.titles, [], 'a title is earned once');
  ok(M.wearTitle('tst') && M.titleNow() === 'tst', 'an earned title can be worn');
  eq(M.run('title', ['combo10']).ok, false, 'not one not earned');
  eq(M.run('title', ['']).ok, true, 'taking the title off is fine');
  eq(M.titleNow(), 'lv1', 'and the level title shows again');
  ok(!M.hasTitle('member'), 'the member title needs a membership');
  M.subscribe(); ok(M.hasTitle('member'), 'and comes with one'); M.cancelSub();
  // counted titles
  M.reset();
  for (let i = 0; i < 4; i++) M.finish(Object.assign({}, win, { mode: 'net', quick: true }));
  ok(!M.hasTitle('street'), 'four quick-match wins in a row are not yet enough');
  M.finish(Object.assign({}, win, { mode: 'net', quick: true }));
  ok(M.hasTitle('street') && M.data.tot.qbest === 5, 'the fifth earns it');
  M.finish(Object.assign({}, win, { mode: 'net', quick: true, result: -1, ko: 0, koOpp: 1 }));
  eq(M.data.tot.qstreak, 0, 'a loss ends the streak');
  M.reset();
  for (let i = 0; i < 20; i++) M.finish(Object.assign({}, win, { mode: 'ai', team: true }));
  ok(!M.hasTitle('duo'), 'team wins count only in online team matches');
  for (let i = 0; i < 20; i++) M.finish(Object.assign({}, win, { mode: 'net', team: true }));
  ok(M.hasTitle('duo'), 'twenty team wins');
  M.reset();
  const nowWas = M.now;
  M.now = () => Date.UTC(2026, 10, 19, 18, 30);   // 02:30 in Taiwan
  M.finish(win); ok(M.hasTitle('night'), 'a win in the small hours');
  M.now = () => Date.UTC(2026, 10, 19, 4, 30);
  M.reset(); M.finish(win); ok(!M.hasTitle('night'), 'not at noon');
  M.now = nowWas;
}
// ---------- site themes ----------
{
  M.reset();
  const tiers = {}; M.SITE.forEach(t => { tiers[t.tier] = (tiers[t.tier] || 0) + 1; });
  eq(tiers, { base: 3, free: 4, coin: 5, sub: 4, steam: 2 }, 'site themes: 3 basic, 4 free, 5 for coins, 4 for members, 2 Steam only');
  eq(new Set(M.SITE.map(t => t.id)).size, M.SITE.length, 'site theme ids are all different');
  eq(M.data.equip.site, 'default', 'the site starts on the default look');
  ok(['default', 'dark', 'white', 'slate', 'sage', 'sand', 'blush'].every(id => M.siteState(id) === 'ok'), 'basic and free themes need nothing');
  eq(M.siteState('mist'), 'buy', 'a coin theme has to be bought');
  eq(M.siteState('aurora'), 'sub', 'a member theme waits for membership');
  eq(M.siteState('furnace'), 'steam', 'a Steam theme waits for the Steam version');
  ok(M.wearSite('sage') && M.data.equip.site === 'sage', 'wear a free theme');
  ok(!M.wearSite('mist') && M.data.equip.site === 'sage', 'cannot wear one not bought');
  M.data.coins = 500; eq(M.buySite('mist'), { ok: false, why: 'poor', n: 300 }, 'not enough coins');
  M.data.coins = 900; ok(M.buySite('mist').ok && M.data.coins === 100 && M.owns('site', 'mist'), 'buy one with coins');
  eq(M.buySite('mist').why, 'have', 'not twice');
  eq(M.buySite('aurora').why, 'no', 'member themes are not for sale'); eq(M.buySite('furnace').why, 'no', 'nor the Steam ones');
  ok(M.wearSite('mist'), 'wear what was bought');
  M.data.sub.until = clock + 86400000;
  ok(M.siteState('aurora') === 'ok' && M.siteState('maple') === 'ok' && M.siteState('furnace') === 'steam', 'members get the member themes and the coin ones, not Steam');
  ok(M.wearSite('aurora'), 'a member wears a member theme');
  M.data.sub.until = 0; M.save(); M.load();
  eq(M.data.equip.site, 'default', 'when membership ends the member theme comes off');
  M.data.steam = true; ok(M.wearSite('harbor'), 'a Steam player wears a Steam theme');
  M.data.steam = false; M.data.owned.site.push('aurora', 'nope', 'mist'); M.save(); M.load();
  eq(M.data.owned.site, ['mist'], 'only bought coin themes stay owned');
}
// the sign-in sheet: ticks by calendar day, goals pay once, a new month starts over
{
  const save = clock;
  clock = new Date(2026, 11, 1, 12).getTime();
  M.data.daily.login = 0; M.data.daily.streak = 0;
  let got = 0;
  for (let d = 1; d <= 6; d++) { got += M.claimLogin(); clock += 86400000; }
  eq(M.signMonth().days, [1, 2, 3, 4, 5, 6], 'six days ticked');
  const c7 = M.claimLogin();
  ok(c7 === 120 + 150 && M.signMonth().paid.join() === '0', 'day 7: the daily coins and the 7-day goal');
  for (let d = 8; d <= 31; d++) { clock += 86400000; M.claimLogin(); }
  eq(M.signMonth().paid, [0, 1, 2, 3], 'all four goals by the end of a full month');
  ok(M.monthOf(M.dayNo()).len === 31 && M.signMonth().days.length === 31, 'December has 31 days, all ticked');
  clock += 86400000;
  ok(M.signMonth().m === 202701 && M.signMonth().days.length === 0, 'January starts a clean sheet');
  M.claimLogin();
  eq(M.signMonth().days, [1], 'and ticks the 1st');
  eq(M.monthOf(M.dayNo()).first, new Date(2027, 0, 1).getDay(), 'the calendar knows which weekday the 1st is');
  clock = save;
}
// landing shadows: 30 of them, three free, four for members; bought and worn like any look; a set leaves it alone
{
  ok(M.CATALOG.ghost.length === 30 && M.CATALOG.ghost.filter(g => g.price === 0 && !g.sub).length === 3 && M.CATALOG.ghost.filter(g => g.sub).length === 4, 'thirty landing shadows: 3 free, 4 for members');
  M.data.coins = 1000;
  ok(M.buy('ghost', 'gold').ok && M.equip('ghost', 'gold') && M.data.equip.ghost === 'gold', 'a landing shadow is bought and worn');
  ok(!M.equip('ghost', 'rainbow') || M.isSub(), 'a members\' one needs membership');
  M.equipSet('market');
  ok(M.data.equip.ghost === 'gold', 'wearing a set keeps the landing shadow');
}
console.log('meta tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
