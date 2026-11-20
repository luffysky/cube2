'use strict';
// The brick games paying into 轉磚: what each kind pays, the daily cap, first clears and stars, the record kept.
const ZZ = require('../src/engine.js');
require('../src/meta.js');
const M = ZZ.Meta, R = require('../games/rewards.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const mem = {}; M.store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
let clock = new Date(2026, 10, 20, 12).getTime(); M.now = () => clock;
M.load();
// score games
ok(R.coins({ game: 'snake', lv: 1, value: 400, ms: 120000 }, null) === 10, 'snake: 400 points on normal is 10');
ok(R.coins({ game: 'snake', lv: 2, value: 400, ms: 120000 }, null) === 15 && R.coins({ game: 'snake', lv: 0, value: 400, ms: 120000 }, null) === 6, 'harder pays more, easier less');
ok(R.coins({ game: 'snake', lv: 1, value: 1e6, ms: 600000 }, null) === 30, 'a score game pays 30 at most');
ok(R.coins({ game: 'snake', lv: 1, value: 4000, ms: 9000 }, null) === 3, 'never faster than a coin per three seconds played');
// time games
ok(R.coins({ game: 'pipes', lv: 2, value: 60000, ms: 60000 }, [0, 0, 0]) === 20 && R.coins({ game: 'pipes', lv: 2, value: 50000, ms: 90000 }, [0, 0, 60000]) === 25, 'a finished puzzle by difficulty, +5 for a new best time');
// level games: first clear and more stars only
ok(R.coins({ game: 'push', value: 4, stars: 2, ms: 60000 }, '') === 20, 'a first clear with two stars: 10 + 10');
ok(R.coins({ game: 'push', value: 4, stars: 3, ms: 60000 }, '00002') === 5 && R.coins({ game: 'push', value: 4, stars: 2, ms: 60000 }, '00002') === 0, 'one more star: 5; the same again: nothing');
ok(R.record({ game: 'push', value: 4, stars: 3 }, '00002') === '00003' && R.record({ game: 'snake', lv: 1, value: 50 }, [0, 80, 0]).join() === '0,80,0', 'records keep the best');
ok(R.record({ game: 'pipes', lv: 0, value: 40000 }, [50000, 0, 0])[0] === 40000, 'a time keeps the fastest');
// paying through Meta
const c0 = M.data.coins;
let r = M.miniDone({ game: 'snake', lv: 1, value: 400, ms: 120000 });
ok(r.ok && r.coins === 10 && M.data.coins === c0 + 10 && M.data.mini.snake[1] === 400 && M.data.daily.mini === 10 && r.best, 'Meta pays and keeps the best');
ok(M.OPS.indexOf('mini') >= 0 && M.run('mini', ['stack', 2, 90, 0, 200000]).ok, 'mini is an op the server repeats');
ok(!M.miniDone({ game: 'nope', value: 1 }).ok && !M.miniDone({ game: 'push', value: 3, stars: 0, ms: 9000 }).ok && !M.miniDone({ game: 'sweep', lv: 0, value: 200, ms: 200 }).ok, 'unknown games, no stars, impossible times are refused');
for (let i = 0; i < 40; i++) M.miniDone({ game: 'breakout', lv: 2, value: 5000, ms: 600000 });
ok(M.data.daily.mini === R.DAY_CAP, 'no more than the daily cap', M.data.daily.mini);
const cap = M.data.coins; r = M.miniDone({ game: 'merge', lv: 2, value: 99999, ms: 600000 });
ok(r.ok && r.coins === 0 && M.data.coins === cap && M.data.mini.merge[2] === 99999, 'over the cap: the record still counts, no coins');
clock += 86400000; M.rollDay();
ok(M.data.daily.mini === 0 && M.miniDone({ game: 'merge', lv: 2, value: 99999, ms: 600000 }).coins > 0, 'a new day pays again');
// the record survives a save and a reload, and is tidied
M.data.mini.push = '13x9'; M.tidy(); ok(M.data.mini.push === '13', 'stars strings are tidied');
M.save(); M.load(); ok(M.data.mini.snake[1] === 400 && M.data.mini.push === '13', 'the record is kept');
ok(Object.keys(R.GAMES).length === 9 && Object.keys(R.GAMES).every(k => k in M.data.mini), 'nine brick games pay coins');
console.log('minis: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
