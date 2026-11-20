'use strict';
// 磚蛇: moving, turning, growing, crumbling runs of three, chains, cement, gold and the ways a run ends.
const Snake = require('../games/snake/snake.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const N = Snake.N;
const linked = g => g.body.every((p, i) => i === 0 || Math.abs(p.x - g.body[i - 1].x) + Math.abs(p.y - g.body[i - 1].y) === 1);
const unique = g => new Set(g.body.map(p => p.x + ',' + p.y)).size === g.body.length;

let g = new Snake(1);
ok(g.body.length === 3 && g.dir === 'right' && linked(g), 'starts three long, heading right');
const hx = g.body[0].x; g.food = null; g.step();
ok(g.body[0].x === hx + 1 && g.body.length === 3 && linked(g), 'one step moves one cell');
ok(!g.turn('left'), 'cannot turn straight back');
ok(g.turn('up') && g.turn('left') && !g.turn('down'), 'two turns can be queued, not three');
g.step(); g.step();
ok(g.dir === 'left' && linked(g), 'queued turns are taken one a step');

// eating: the new tile goes behind the head
g = new Snake(2); g.cement = []; g.gold = null;
const h = g.body[0], c1 = g.body[1].c, c2 = g.body[2].c;
let pick = 1; while (pick === c1 || pick === c2) pick++;
g.food = { x: h.x + 1, y: h.y, c: pick };
g.step();
ok(g.body.length === 4 && g.body[1].c === pick && g.body[2].c === c1 && g.body[3].c === c2 && linked(g) && unique(g), 'eating puts the new tile behind the head and grows by one', g.body);
ok(g.score === 10 && g.eaten === 1 && g.food && !g.taken.call({ body: [], cement: [], food: null, gold: null, spikes: [], portals: null }, g.food.x, g.food.y), 'ten points and new food');

// three of a colour crumble; the tail closes up behind
g = new Snake(3); g.cement = []; g.gold = null;
g.body = [{ x: 8, y: 8, c: 0 }, { x: 7, y: 8, c: 2 }, { x: 6, y: 8, c: 2 }, { x: 5, y: 8, c: 4 }, { x: 4, y: 8, c: 5 }];
g.food = { x: 9, y: 8, c: 2 };
g.step();
ok(g.body.length === 3 && g.body.map(p => p.c).join() === '0,4,5' && linked(g) && unique(g), 'three blues crumble and the tail closes up', g.body);
ok(g.score === 10 + 50 && g.cleared === 3, 'eat 10 + crumble 50', g.score);

// a chain: what closes up makes another run
g = new Snake(4); g.cement = []; g.gold = null;
g.body = [{ x: 10, y: 8, c: 0 }, { x: 9, y: 8, c: 1 }, { x: 8, y: 8, c: 1 }, { x: 7, y: 8, c: 3 }, { x: 6, y: 8, c: 3 }, { x: 5, y: 8, c: 3 }, { x: 4, y: 8, c: 1 }, { x: 3, y: 8, c: 2 }];
// the reds at 3..5 are already a run: set up so that eating red closes nothing first; use pink
g.body[3].c = 3; g.body[4].c = 3; g.body[5].c = 4;   // 0,1,1,3,3,4,1,2 -> no run yet
g.food = { x: 11, y: 8, c: 1 };
g.step();     // 0,1,1,1,3,3,4,1,2 -> three pinks go -> 0,3,3,4,1,2
ok(g.body.map(p => p.c).join() === '0,3,3,4,1,2' && linked(g), 'a single run crumbles', g.body.map(p => p.c));
g = new Snake(9); g.cement = []; g.gold = null;
// a run in the middle with one pink in front and two behind: when it goes, the pinks meet and go too
g.body = [{ x: 10, y: 8, c: 0 }, { x: 9, y: 8, c: 1 }, { x: 8, y: 8, c: 3 }, { x: 7, y: 8, c: 3 }, { x: 6, y: 8, c: 3 }, { x: 5, y: 8, c: 1 }, { x: 4, y: 8, c: 1 }, { x: 3, y: 8, c: 2 }];
const before = g.score, ch = g.crumble();
ok(ch === 2 && g.body.map(p => p.c).join() === '0,2' && linked(g) && unique(g), 'a crumble that closes up into another run is a chain', g.body.map(p => p.c));
ok(g.score - before === 50 + 100, 'the second link of a chain counts double', g.score - before);

// crashing costs a heart; the snake comes back with room ahead; the last heart ends the run
g = new Snake(10); g.cement = []; g.food = null; g.gold = null;
const len0 = g.body.length;
for (let i = 0; i < N && g.lives === Snake.LIVES; i++) g.step();
ok(g.lives === Snake.LIVES - 1 && !g.over && g.events.some(e => e.type === 'crash' && e.why === 'wall'), 'a wall costs one heart, not the run', [g.lives, g.over]);
ok(g.body.length === len0 && linked(g) && g.dir === 'right' && [1, 2, 3, 4].every(k => !g.taken(g.body[0].x + k, g.body[0].y) && g.body[0].x + k < N), 'it comes back as long as it was, with room ahead', g.body);
g.lives = 1; for (let i = 0; i < N && !g.over; i++) g.step();
ok(g.over && g.why === 'wall' && g.lives === 0, 'the last heart ends it');
g = new Snake(11); g.food = null; g.gold = null; g.cement = [{ x: g.body[0].x + 1, y: g.body[0].y }];
g.step(); ok(g.lives === 4 && g.events.some(e => e.why === 'cement'), 'cement costs a heart');
g = new Snake(12); g.cement = []; g.food = null; g.gold = null;
g.body = [{ x: 5, y: 5, c: 0 }, { x: 4, y: 5, c: 1 }, { x: 4, y: 6, c: 2 }, { x: 5, y: 6, c: 3 }, { x: 6, y: 6, c: 4 }, { x: 6, y: 5, c: 5 }, { x: 6, y: 4, c: 1 }];
g.dir = 'right'; g.step(); ok(g.lives === 4 && g.events.some(e => e.why === 'self') && linked(g) && unique(g), 'running into itself costs a heart');
g = new Snake(13); g.cement = []; g.food = null; g.gold = null;
g.body = [{ x: 5, y: 5, c: 0 }, { x: 5, y: 6, c: 1 }, { x: 6, y: 6, c: 2 }, { x: 6, y: 5, c: 3 }];
g.dir = 'right'; g.step(); ok(g.lives === Snake.LIVES, 'it may move into the cell its tail is leaving');

// traps: spikes rise and sink; portals send the head out of the other end
g = new Snake(30); g.cement = []; g.food = null; g.gold = null;
g.spikes = [{ x: g.body[0].x + 1, y: g.body[0].y, ph: 0 }];
g.ticks = Snake.SPIKE.up + 1;       // down when the head arrives
g.step(); ok(g.lives === Snake.LIVES, 'a sunk spike can be crossed');
g = new Snake(31); g.cement = []; g.food = null; g.gold = null;
g.spikes = [{ x: g.body[0].x + 1, y: g.body[0].y, ph: 0 }];
g.ticks = Snake.SPIKE.up + Snake.SPIKE.down - 1;   // the step makes it 0: up
g.step(); ok(g.lives === 4 && g.events.some(e => e.why === 'spike'), 'a raised spike costs a heart');
const sp = { x: 0, y: 0, ph: 0 }; g.ticks = Snake.SPIKE.up + Snake.SPIKE.down - 2;
ok(g.spikeState(sp) === 'warn', 'a spike warns before it rises');
g = new Snake(32); g.cement = []; g.food = null; g.gold = null;
const hd = g.body[0];
g.portals = [{ x: hd.x + 1, y: hd.y }, { x: 2, y: 2 }];
g.step(); ok(g.body[0].x === 3 && g.body[0].y === 2 && g.lives === Snake.LIVES, 'the head comes out of the other portal', g.body[0]);
// traps arrive after enough bricks, a few at most, never on anything
for (const lv of ['easy', 'normal', 'hard']) {
  const t = new Snake(40, lv); t.eaten = t.cfg.trapAt; t.addTraps();
  ok(t.spikes.length === t.cfg.spikes && t.portals && t.spikes.length <= 3, lv + ': ' + t.spikes.length + ' spikes and a pair of portals');
  ok(t.spikes.every(s2 => !t.body.some(p => p.x === s2.x && p.y === s2.y)), lv + ': not on the snake');
}
// difficulty
ok(new Snake(1, 'easy').speed() > new Snake(1, 'normal').speed() && new Snake(1, 'normal').speed() > new Snake(1, 'hard').speed(), 'easy is slower than normal, normal than hard');
ok(new Snake(1, 'nonsense').level === 'normal', 'an unknown difficulty is normal');

// cement and gold appear as the snake eats (fed straight ahead, then put back on a long straight row)
g = new Snake(15); g.cement = []; g.gold = null;
let goldSeen = false;
for (let k = 0; k < 10; k++) {
  g.cement = g.cement.filter(c => c.y !== 8);           // nothing in the snake's own row
  const hd = g.body[0];
  g.food = { x: hd.x + 1, y: 8, c: 1 + (k % 5) };
  if (g.gold && g.gold.y === 8) g.gold = null;
  g.step();
  if (g.gold) goldSeen = true;
  g.body.forEach((p, i) => { p.x = g.body.length - i; p.y = 8; });   // back to the left end of the row
}
ok(!g.over && g.eaten === 10, 'fed ten bricks', [g.over, g.why, g.eaten]);
{ const t = new Snake(15); t.cement = []; t.gold = null; let laid = 0; for (let k = 0; k < 12; k++) { const hd = t.body[0]; t.food = { x: hd.x + 1, y: 8, c: 1 + (k % 5) }; t.gold = null; t.step(); if (t.events.some(e => e.type === 'cement')) laid++; t.body.forEach((p, i) => { p.x = t.body.length - i; p.y = 8; }); t.cement = t.cement.filter(c => c.y !== 8); } ok(laid === 2, 'cement every sixth brick', laid); }
ok(goldSeen, 'a gold brick shows up now and then');
const s0 = new Snake(1).speed(); g = new Snake(1); g.eaten = 20;
ok(g.speed() < s0 && new Snake(1).speed() === 200 && (g.eaten = 999, g.speed() === 105), 'faster as it eats, down to a floor');
// food never lands on the snake or cement
g = new Snake(16);
let bad = 0; for (let i = 0; i < 200; i++) { g.placeFood(); if (g.body.some(p => p.x === g.food.x && p.y === g.food.y)) bad++; }
ok(bad === 0, 'food never appears on the snake');

console.log('snake: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
