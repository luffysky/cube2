'use strict';
// Scoring, and the engine additions the recorder relies on.
const ZZ = require('../src/engine.js');
let pass = 0, fail = 0;
function eq(a, b, name) { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } }
const S = ZZ.calcScore;
eq([S(1, 'none', false, 0, false), S(2, 'none', false, 0, false), S(3, 'none', false, 0, false), S(4, 'none', false, 0, false)], [100, 250, 450, 800], 'line clears');
eq([S(0, 'full', false, -1, false), S(1, 'full', false, 0, false), S(2, 'full', false, 0, false), S(3, 'full', false, 0, false)], [150, 600, 1000, 1500], 'T-spins');
eq([S(0, 'mini', false, -1, false), S(1, 'mini', false, 0, false)], [50, 200], 'mini T-spins');
eq(S(2, 'spin', false, 0, false), 450, 'other spins pay the clear plus 200');
eq(S(4, 'none', true, 0, false), 1200, 'back-to-back pays half again');
eq(S(1, 'none', false, 3, false), 220, 'combo adds 40 a step');
eq(S(4, 'none', false, 0, true), 3300, 'perfect clear adds 2500');
eq(S(0, 'none', false, -1, false), 0, 'nothing for a plain placement');
// drops
let g = new ZZ.Game({ seed: 5, garbage: false });
g.start();
const y0 = g.cur.y, n = g.ghostY() - y0;
g.hardDrop();
eq(g.stats.score, 2 * n, 'hard drop pays 2 a row');
g.soft = true; g.sdf = Infinity; g.update(16);
eq(g.stats.score > 2 * n, true, 'soft drop pays too');
// a quad through the engine: four rows with one gap, the long piece upright
g = new ZZ.Game({ seed: 1, manual: true, garbage: false, queue: ['I'], board: ['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'] });
g.start();
g.rotate(1); while (g.move(1)) { /* to the right wall */ }
g.events = [];
g.hardDrop();
const lock = g.events.find(e => e.type === 'lock');
eq([lock.lines, lock.perfect, lock.score, lock.rot, lock.x != null], [4, true, 3300, 1, true], 'quad with a perfect clear, scored on the lock event');
eq(g.stats.score, 3300 + 2 * g.events.find(e => e.type === 'harddrop').n, 'score total');
// forced spin judgement and item tile (what a ghost replays)
g = new ZZ.Game({ seed: 1, manual: true, garbage: false, queue: ['T', 'O'], board: ['XXXXXXX...'] });
g.start();
while (g.move(1)) { /* right */ }
g.events = [];
while (g.stepDown()) { /* down */ }
const c = g.cur;
g.lock({ tspin: 'full', item: { x: c.x + 1, y: c.y, id: 6 } });
const l2 = g.events.find(e => e.type === 'lock');
eq([l2.tspin, l2.lines, l2.attack], ['full', 1, 2], 'forced T-spin single sends 2');
eq(g.inv, [], 'the item tile was not in the cleared row');
eq(g.grid[c.y][c.x + 1 - 0] >> 4 || g.grid[c.y + 1][c.x + 1] >> 4, 6, 'item tile marked where asked');
// cement lifted over rows that stay on the floor
g = new ZZ.Game({ seed: 1, manual: true, board: ['AAAA......', 'XXXXXXXXX.'] });
g.pushGarbage(2, 3, 1);
const row = r => Array.from(g.grid[r]).map(v => v ? (v === ZZ.GARBAGE ? 'G' : 'X') : '.').join('');
eq([row(39), row(38), row(37), row(36)], ['GGGGGGGGG.', 'GGG.GGGGGG', 'GGG.GGGGGG', 'GGGG......'], 'new cement goes above the floor row');
g.chisel(2, 1);
eq([row(39), row(38)], ['GGGGGGGGG.', 'GGGG......'], 'knock-down with lift removes the rows above the floor row');
console.log('score tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
