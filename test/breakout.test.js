'use strict';
// 打磚塊: walls, serving, the paddle angle, breaking and cracking, power-ups, losing a ball, the next level.
const B = require('../games/breakout/breakout.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const { W, H, PY, R } = B;

for (let n = 1; n <= 30; n++) {
  const w = B.wall(n, n * 7);
  const breakable = w.filter(k => k.kind !== B.STEEL).length;
  if (breakable === 0 || w.some(k => k.x < 0 || k.x + k.w > W || k.y + k.h > PY - 100)) { ok(false, 'wall ' + n + ' is playable', w.length); break; }
}
ok(true, 'thirty walls, each with bricks to break, all inside the field');
ok(B.wall(1, 1).every(k => k.kind <= 5), 'the first wall is all plain bricks');
ok(B.wall(9, 3).some(k => k.kind === B.CEMENT), 'later walls have cement');

let g = new B(1, 'normal');
ok(g.held && g.balls.length === 1 && g.lives === 5 && g.n === 1, 'the ball waits on the paddle');
g.move(50); ok(g.balls[0].x === 50, 'and moves with it');
g.move(-100); ok(g.paddle.x === g.paddle.w / 2, 'the paddle stays inside the field');
g.move(W / 2);
ok(g.launch() && !g.held && g.balls[0].vy < 0, 'launched upward');
ok(Math.abs(Math.hypot(g.balls[0].vx, g.balls[0].vy) - g.speed()) < 1e-6, 'at the level speed');

// the paddle: the edge sends the ball out at a wide angle, the middle straight up
for (const [off, wide] of [[0, false], [g.paddle.w / 2 - 1, true]]) {
  const t = new B(2); t.launch(); t.bricks = [{ x: 0, y: 0, w: 1, h: 1, kind: B.STEEL, hits: Infinity }];
  t.balls = [{ x: t.paddle.x + off, y: PY - R - 2, vx: 0, vy: 300 }];
  t.step(0.02);
  const b = t.balls[0], ang = Math.abs(Math.atan2(b.vx, -b.vy));
  ok(b.vy < 0 && (wide ? ang > 0.9 : ang < 0.05), (wide ? 'the edge of the paddle sends it wide' : 'the middle sends it straight up') + ' (' + ang.toFixed(2) + ')');
}
// walls
g = new B(3); g.launch(); g.bricks = [{ x: 0, y: 0, w: 1, h: 1, kind: B.STEEL, hits: Infinity }];
g.balls = [{ x: 3, y: 200, vx: -300, vy: -10 }]; g.step(0.02); ok(g.balls[0].vx > 0, 'bounces off the left wall');
g.balls = [{ x: 200, y: 3, vx: 10, vy: -300 }]; g.step(0.02); ok(g.balls[0].vy > 0, 'and the top');

// breaking: one hit for glazed, two for cement, never for steel
g = new B(4); g.launch();
const k1 = { x: 100, y: 200, w: 32, h: 14, kind: 2, hits: 1 }, kc = { x: 200, y: 200, w: 32, h: 14, kind: B.CEMENT, hits: 2 }, ks = { x: 300, y: 300, w: 32, h: 14, kind: B.STEEL, hits: Infinity };
g.bricks = [k1, kc, ks];
g.balls = [{ x: 116, y: 230, vx: 0, vy: -300 }];
g.step(0.05);
ok(g.bricks.indexOf(k1) < 0 && g.balls[0].vy > 0 && g.score === 10, 'a glazed brick breaks and the ball comes back down', g.score);
g.balls = [{ x: 216, y: 230, vx: 0, vy: -300 }]; g.step(0.05);
ok(g.bricks.indexOf(kc) >= 0 && kc.cracked && kc.hits === 1, 'cement cracks on the first hit');
g.balls = [{ x: 216, y: 230, vx: 0, vy: -300 }]; g.step(0.05);
ok(g.bricks.indexOf(kc) < 0 && g.score === 10 + 20 + 100, 'and breaks on the second, for 20 (and 100 for the level)', g.score);
// only steel left: the level is clear
ok(g.n === 2 && g.held, 'with only steel left the level is clear and the next one waits to serve', [g.n, g.held]);

// power-ups
g = new B(5); g.launch();
g.take('wide'); ok(g.paddle.w === 100, 'wide paddle');
g.step(13); ok(g.paddle.w === 64 || g.lives < 5, 'for a while');
g = new B(6); g.launch(); const n0 = g.balls.length; g.take('multi'); ok(g.balls.length === n0 + 2, 'two more balls');
g = new B(7); g.launch(); const s0 = g.speed(); g.take('slow'); ok(g.speed() < s0, 'a slower ball');
g = new B(8); g.lives = 3; g.take('heart'); ok(g.lives === 4, 'a heart'); g.lives = 5; const sc = g.score; g.take('heart'); ok(g.lives === 5 && g.score === sc + 50, 'no more than five; 50 points instead');
// a falling power-up is caught by the paddle
g = new B(9); g.drops = [{ x: g.paddle.x, y: PY - 20, kind: 'slow' }];
for (let i = 0; i < 20; i++) g.step(0.02);
ok(!g.drops.length && g.slowT > 0, 'catching a power-up');

// losing the ball
g = new B(10); g.launch(); g.bricks = [{ x: 0, y: 0, w: 1, h: 1, kind: B.STEEL, hits: Infinity }, { x: 100, y: 60, w: 32, h: 14, kind: 1, hits: 1 }];
g.balls = [{ x: 10, y: H - 2, vx: 0, vy: 300 }]; g.paddle.x = 300;
g.step(0.1);
ok(g.lives === 4 && g.held && g.events.some(e => e.type === 'miss'), 'a missed ball costs a heart and the next waits on the paddle');
g.lives = 1; g.launch(); g.balls = [{ x: 10, y: H - 2, vx: 0, vy: 300 }]; g.step(0.1);
ok(g.over, 'the last heart ends it');
// with several balls, losing one is free
g = new B(11); g.launch(); g.balls.push({ x: 10, y: H - 2, vx: 0, vy: 300 }); g.step(0.1); ok(g.lives === 5 && g.balls.length === 1, 'one of several balls lost costs nothing');

// difficulty and the levels getting quicker
ok(new B(1, 'easy').speed() < new B(1, 'normal').speed() && new B(1, 'normal').speed() < new B(1, 'hard').speed(), 'easy is slower than normal, normal than hard');
g = new B(1); const v1 = g.speed(); g.n = 5; ok(g.speed() > v1, 'later levels are faster');
g.n = 999; ok(g.speed() <= B.LEVELS.normal.max, 'up to a limit');

// a whole run on its own: a perfect paddle under the ball clears levels without losing
g = new B(12, 'hard'); g.launch();
let off = 0, seedR = 1; const rnd = () => (seedR = (seedR * 16807) % 2147483647) / 2147483647;
for (let t = 0; t < 180 * 120 && g.n < 3; t++) { g.events = []; g.move(g.balls[0].x + off); if (g.held) g.launch(); g.step(1 / 120); if (g.events.some(e => e.type === 'paddle')) off = (rnd() - 0.5) * 50; }
ok(g.n >= 3 && g.lives === 5, 'a paddle that follows the ball clears levels', [g.n, g.lives, g.left()]);

console.log('breakout: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
