'use strict';
const ZZ = require('../src/engine.js');
const { Game, ROWS, TOP, SHAPES } = ZZ;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++; else { fail++; console.log('  FAIL: ' + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function lastLock(g) { const l = g.events.filter(e => e.type === 'lock'); return l[l.length - 1]; }
function mk(board, queue, extra) { const g = new Game(Object.assign({ board, queue, manual: true, seed: 7 }, extra || {})); g.start(); return g; }
function show(g, n) { return g.grid.slice(ROWS - n).map(r => Array.from(r).map(v => v ? (v === 8 ? '#' : 'IOTSZJL'[v - 1]) : '.').join('')).join('\n'); }

// --- shapes
eq(SHAPES.T[1].slice().sort(), [[1, 0], [1, 1], [1, 2], [2, 1]], 'T right state');
eq(SHAPES.I[1].slice().sort(), [[2, 0], [2, 1], [2, 2], [2, 3]], 'I right state');
eq(SHAPES.I[3].slice().sort(), [[1, 0], [1, 1], [1, 2], [1, 3]], 'I left state');

// --- T-spin double, no kick
{
  const g = mk(['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX'], ['T', 'I']);
  eq([g.cur.x, g.cur.y, g.cur.rot], [3, TOP - 1, 0], 'T spawn after first drop');
  ok(g.rotate(-1), 'TSD: turn left');
  g.sonicDrop();
  eq([g.cur.x, g.cur.y, g.cur.rot], [3, 37, 3], 'TSD: stem sits in the slot');
  ok(g.rotate(-1), 'TSD: final turn');
  eq(g.spinState(), 'full', 'TSD: spin state before lock');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack], ['full', 2, 4], 'TSD result');
  eq(g.b2b, 0, 'TSD starts a back-to-back chain');
}

// --- T-spin triple with the last kick
{
  const g = mk(['....XX....', '.....X....', 'XXXX.XXXXX', 'XXX..XXXXX', 'XXXX.XXXXX'], ['T', 'I']);
  g.move(-1); g.move(-1);
  g.sonicDrop();
  eq([g.cur.x, g.cur.y], [1, 35], 'TST: resting left of the overhang');
  ok(g.move(1), 'TST: slide under the overhang');
  ok(g.rotate(-1), 'TST: kick turn');
  eq([g.cur.x, g.cur.y, g.cur.rot, g.lastKick], [3, 37, 3, 4], 'TST: fifth kick used');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack], ['full', 3, 6], 'TST result');
  ok(g.isEmpty() === false, 'TST leaves the overhang');
}

// --- mirrored TST
{
  const g = mk(['....XX....', '....X.....', 'XXXXX.XXXX', 'XXXXX..XXX', 'XXXXX.XXXX'], ['T', 'I']);
  g.move(1); g.move(1); g.move(1);
  g.sonicDrop();
  ok(g.move(-1), 'TST mirror: slide under');
  ok(g.rotate(1), 'TST mirror: kick turn');
  eq(g.lastKick, 4, 'TST mirror: fifth kick');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines], ['full', 3], 'TST mirror result');
}

// --- mini against the wall
{
  const g = mk(['..........', '.XXXXXXXXX'], ['T', 'I']);
  g.move(-1); g.move(-1); g.move(-1);
  g.sonicDrop();
  ok(g.rotate(1), 'mini: turn with wall kick');
  eq([g.cur.x, g.lastKick], [-1, 1], 'mini: second test used');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack], ['mini', 1, 1], 'mini single result');
  eq(g.b2b, 0, 'mini counts for back-to-back');
}

// --- no spin when the last action is a shift or a fall
{
  const g = mk(['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX'], ['T', 'T', 'I']);
  g.rotate(2);                       // pointing down, dropped from above: cannot enter the slot
  g.hardDrop();
  eq(lastLock(g).tspin, 'none', 'drop from above is not a spin');
}
{
  const g = mk(['XXXX.XXXXX'], ['T', 'I']);
  g.rotate(2); g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack], ['none', 1, 0], 'plain single');
}

// --- back-to-back and combo
{
  const b = ['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX', '.....XX...', 'XXX...XXXX', 'XXXX.XXXXX'];
  // second slot becomes reachable after the first double clears (overhang rows stay)
  const g = mk(['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX'], ['T', 'T', 'I']);
  g.rotate(-1); g.sonicDrop(); g.rotate(-1); g.hardDrop();
  eq(lastLock(g).attack, 4, 'first TSD');
  g.setBoard(['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX']);
  g.rotate(-1); g.sonicDrop(); g.rotate(-1); g.hardDrop();
  const l = lastLock(g);
  eq([l.b2b, l.combo, l.attack], [true, 1, 6], 'second TSD: +1 back-to-back, +1 combo');
}

// --- quad, perfect clear
{
  const g = mk(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], ['I', 'O']);
  g.rotate(1);
  while (g.move(1));
  g.hardDrop();
  const l = lastLock(g);
  eq([l.lines, l.perfect, l.attack], [4, true, 10], 'quad with perfect clear');
}

// --- I kicks off the wall
{
  const g = mk([], ['I', 'O']);
  g.rotate(1);
  while (g.move(-1));
  eq(g.cur.x, -2, 'I upright hugs the left wall');
  ok(g.rotate(-1), 'I turns back flat at the wall');
  ok(g.cur.x >= 0, 'I stays inside after kick');
}

// --- garbage: queue, cancel, land
{
  const g = mk(['XXXX.XXXXX'], ['O', 'O', 'T', 'I'], { garbageDelay: 0 });
  g.receive(3);
  eq(g.pendingTotal(), 3, 'garbage queued');
  while (g.move(-1));
  g.hardDrop();
  eq(g.pendingTotal(), 0, 'garbage landed after a lock without clear');
  const txt = show(g, 5).split('\n');
  ok(txt[2] === txt[3] && txt[3] === txt[4] && /^#*\.#*$/.test(txt[4]), 'three cement rows share one gap');
  ok(txt[1] === 'XXXX.XXXXX'.replace(/X/g, '#'), 'old stack pushed up');
}
{
  const g = mk(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], ['I', 'O'], { garbageDelay: 0 });
  let out = 0; g.onAttack = n => { out += n; };
  g.receive(3);
  g.rotate(1); while (g.move(1)); g.hardDrop();
  const l = lastLock(g);
  eq([l.attack, l.cancelled, l.sent, out, g.pendingTotal()], [10, 3, 7, 7, 0], 'attack cancels queue first');
}
{
  const g = mk([], ['O', 'O', 'O'], { garbageDelay: 500 });
  g.receive(2);
  g.hardDrop();
  eq(g.pendingTotal(), 2, 'garbage waits out its delay');
  g.update(600);
  g.hardDrop();
  eq(g.pendingTotal(), 0, 'garbage lands once the delay has passed');
}

// --- 7-bag
{
  const g = new Game({ seed: 99, manual: true });
  g.start();
  const seq = [g.cur.type];
  for (let i = 0; i < 13; i++) { seq.push(g.queue.shift()); g.fill(); }
  eq(new Set(seq.slice(0, 7)).size, 7, 'first bag has all seven');
  eq(new Set(seq.slice(7, 14)).size, 7, 'second bag has all seven');
}

// --- hold
{
  const g = mk([], ['T', 'I', 'O', 'S']);
  ok(g.hold(), 'hold first piece');
  eq([g.holdType, g.cur.type], ['T', 'I'], 'hold stores T, next comes in');
  ok(!g.hold(), 'no second hold on the same piece');
  g.hardDrop();
  ok(g.hold(), 'hold again after a lock');
  eq([g.holdType, g.cur.type], ['O', 'T'], 'swap with held piece');
}

// --- gravity, lock delay and reset limit
{
  const g = new Game({ queue: ['O', 'O', 'O'], gravity: 1 / 100, seed: 1 });
  g.start();
  for (let i = 0; i < 400 && g.stats.pieces === 0; i++) g.update(16);
  eq(g.stats.pieces, 1, 'piece falls and locks by itself');
}
{
  const g = new Game({ queue: ['T', 'O', 'O'], gravity: 1, seed: 1 });
  g.start();
  g.update(16); g.update(16);
  ok(g.grounded(), 'fast gravity grounds the piece');
  g.update(400);
  ok(g.cur && g.cur.type === 'T', 'still movable inside lock delay');
  let moves = 0, dir = 1;
  for (let i = 0; i < 40 && g.cur && g.cur.type === 'T'; i++) {
    if (!g.move(dir)) { dir = -dir; g.move(dir); }
    moves++;
    g.update(300);
  }
  ok(moves >= 14 && moves <= 17, 'lock timer resets about fifteen times, then the piece locks (moves=' + moves + ')');
}

// --- top out and revive
{
  const rows = [];
  for (let i = 0; i < 21; i++) rows.push('XXXX..XXXX'.replace(/\./g, i < 20 ? 'X' : '.').replace(/^(.)/, '.'));
  const g = mk(rows.map(() => '.XXXXXXXXX'), ['O', 'O', 'O']);
  ok(g.over, 'spawn blocked ends the round');
  eq(g.events.filter(e => e.type === 'topout').length, 1, 'top out reported once');
  g.revive();
  ok(!g.over && g.cur, 'revive brings a piece back');
  ok(g.isEmpty(), 'cement wall is removed on revive');
}

// --- a knockout keeps the player's own wall: only cement rows go, and a too-tall wall loses rows from the top only
{
  const g = new ZZ.Game({ seed: 4, garbage: false });
  const put = (y, s) => { for (let x = 0; x < 10; x++) g.grid[y][x] = s[x] === 'X' ? 3 : s[x] === 'C' ? ZZ.GARBAGE : 0; };
  put(ZZ.ROWS - 1, 'CCCCCCCCC.');      // cement rows from the rival
  put(ZZ.ROWS - 2, 'CCCC.CCCCC');
  put(ZZ.ROWS - 3, 'XXXXCXXXX.');      // the player's row with one cell turned to cement (lightning, an item)
  put(ZZ.ROWS - 4, 'XXXXXXXX..');
  g.over = true; g.revive();
  const rows = g.grid.slice(ZZ.ROWS - 2).map(r => Array.from(r).map(v => v === ZZ.GARBAGE ? 'C' : v ? 'X' : '.').join(''));
  eq(rows, ['XXXXXXXX..', 'XXXXCXXXX.'], 'cement rows go, the player\'s two rows stay and drop to the floor');
  const t = new ZZ.Game({ seed: 4, garbage: false });
  for (let y = ZZ.ROWS - 18; y < ZZ.ROWS; y++) for (let x = 0; x < 9; x++) t.grid[y][x] = 1 + (y % 7);
  const base = t.grid[ZZ.ROWS - 1].slice();
  t.over = true; t.revive();
  ok(t.stackHeight() === 12 && t.grid[ZZ.ROWS - 1].join() === base.join(), 'an 18-row wall is cut to 12 from the top; the base is untouched');
}

// --- Z-spin and S-spin doubles: turn in the notch, the third kick drops the piece under the roof
{
  const g = mk(['..X.......', 'XXX..XXXXX', 'XXXX..XXXX'], ['Z', 'I']);
  ok(g.rotate(1), 'Z-spin: stand it up');
  ok(g.move(-1), 'Z-spin: over the notch');
  g.sonicDrop();
  eq([g.cur.x, g.cur.y, g.cur.rot], [2, 36, 1], 'Z-spin: standing in the notch');
  ok(g.rotate(1), 'Z-spin: kick turn');
  eq([g.cur.x, g.cur.y, g.cur.rot, g.lastKick], [3, 37, 2, 2], 'Z-spin: third kick used');
  eq(g.spinState(), 'spin', 'Z-spin: cannot move any more');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack, l.piece], ['spin', 2, 2, 'Z'], 'Z-spin double result');
  eq([g.b2b, g.stats.xspins], [0, 1], 'Z-spin counts toward back-to-back');
}
{
  const g = mk(['.......X..', 'XXXXX..XXX', 'XXXX..XXXX'], ['S', 'I']);
  ok(g.rotate(-1), 'S-spin: stand it up');
  ok(g.move(1) && g.move(1), 'S-spin: over the notch');
  g.sonicDrop();
  ok(g.rotate(-1), 'S-spin: kick turn');
  eq(g.spinState(), 'spin', 'S-spin: cannot move any more');
  g.hardDrop();
  const l = lastLock(g);
  eq([l.tspin, l.lines, l.attack], ['spin', 2, 2], 'S-spin double result');
}
{
  const g = mk(['XXXXXX..XX'], ['Z', 'I']);     // open from above: a plain drop, not a spin
  g.rotate(1); g.rotate(-1); g.move(1); g.move(1); g.hardDrop();
  eq(lastLock(g).tspin, 'none', 'a piece that could still move is not a spin');
}

// --- items: tiles appear, clearing their row collects them, effects reshape the wall
{
  const g = mk(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], ['I', 'O', 'O'], { items: true, itemEvery: 1, itemPool: [5] });
  g.rotate(1); while (g.move(1)); g.hardDrop();
  eq([g.inv.length, g.inv[0], g.stats.items], [1, 5, 1], 'item tile in a cleared row is collected');
  eq(g.events.filter(e => e.type === 'item').length, 1, 'collection is reported');
  eq(g.takeItem(), 5, 'takeItem hands out the oldest item');
  eq(g.takeItem(), 0, 'empty inventory gives nothing');
}
{
  const g = mk(['X.X.X.X.X.', '.X.X.X.X.X', 'XXXXXXXXX.'], ['O', 'O']);
  eq(g.chisel(2), 2, 'chisel removes the bottom rows');
  eq(show(g, 2).split('\n')[1], '#.#.#.#.#.', 'rows above slide down');
  g.trowel();
  ok(g.isEmpty() === false && show(g, 1) === '#.#.#.#.#.', 'trowel leaves a hole-free wall alone');
}
{
  const g = mk(['XXXX.XXXXX', '....X.....', 'XXXX.XXXXX'], ['O', 'O']);
  g.trowel();
  eq(show(g, 3).split('\n').join('|'), '..........|..........|####.#####', 'trowel drops every column and clears finished rows');
  eq(g.stats.lines, 1, 'row completed by the trowel is removed');
}
{
  const g = mk([], ['O', 'O'], { garbageDelay: 0 });
  g.shield = 1000;
  g.receive(4);
  eq([g.pendingTotal(), g.events.filter(e => e.type === 'blocked').length], [0, 1], 'shield turns cement away');
  g.update(1200);
  g.receive(2);
  eq(g.pendingTotal(), 2, 'shield runs out');
}
{
  const g = mk(['X.........', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], ['I', 'O']);
  g.boost = 5000;
  g.rotate(1); while (g.move(1)); g.hardDrop();
  eq(lastLock(g).attack, 8, 'boost doubles the attack');
}
{
  // a falling piece is lifted clear when the wall changes under it
  const g = mk(['XXXXXXXXXX'.replace(/X/g, '.'), 'XXX....XXX', 'XXX....XXX'], ['O', 'O']);
  g.sonicDrop();
  const y = g.cur.y;
  g.chisel(1);
  ok(g.fits(g.cur.type, g.cur.rot, g.cur.x, g.cur.y), 'piece still fits after the chisel');
}

// --- 大逃殺: a floor row rises from below and is never cleared
{
  const g = mk(null, ['I', 'I', 'I']);
  ok(g.raiseFloor(1) === 1 && g.floorRows() === 1, 'one floor row rises');
  ok(Array.from(g.grid[ROWS - 1]).every(v => v === 13), 'the bottom row is all floor');
  // lay an I flat on top of it: a full row of floor is not a cleared line
  g.hardDrop();
  ok(g.floorRows() === 1 && lastLock(g).lines === 0, 'the floor itself never counts as a full line');
  g.raiseFloor(2);
  ok(g.floorRows() === 3 && !g.over, 'more rows lift the wall up');
  const h = mk(null, ['O']);
  for (let r = 0; r < ROWS; r++) h.grid[r][0] = r >= 1 ? 1 : 0;
  h.grid[0][0] = 1;
  h.raiseFloor(1);
  ok(h.over, 'a wall pushed past the top is a knockout');
  ok(h.raiseFloor(1) === 0, 'and nothing rises on a wall that is down');
}

console.log('engine tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
