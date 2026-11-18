'use strict';
// Plays every opening lesson through the engine: each piece must fit, rest, and the last pieces must finish as promised.
const ZZ = require('../src/engine.js');
require('../src/bot.js');
require('../src/openers.js');
const Bot = ZZ.Bot;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
for (const les of ZZ.OPENERS) {
  const g = new ZZ.Game({ queue: les.queue, manual: true, garbage: false, seed: 1 });
  g.start();
  let last = null;
  les.steps.forEach((st, i) => {
    const [type, x, y, rot, spin, lines] = st;
    ok(g.cur && g.cur.type === type, les.id + ' step ' + i + ' piece');
    const rows = Bot.rowsOf(g.grid), sp = Bot.spawnPos(rows, type);
    const hit = Bot.placements(rows, type, sp.x, sp.y, 0).find(p => p.x === x && p.y === y && p.rot === rot);
    ok(!!hit, les.id + ' step ' + i + ' reachable');
    if (spin) ok(hit && hit.spin === spin, les.id + ' step ' + i + ' spin ' + (hit && hit.spin));
    g.cur.x = x; g.cur.y = y; g.cur.rot = rot;
    ok(g.fits(type, rot, x, y) && !g.fits(type, rot, x, y + 1), les.id + ' step ' + i + ' rests');
    g.events = [];
    g.lock(spin ? { tspin: spin } : null);
    last = g.events.find(e => e.type === 'lock');
    if (lines != null) ok(last.lines === lines, les.id + ' step ' + i + ' clears ' + last.lines);
    else ok(last.lines === 0, les.id + ' step ' + i + ' clears nothing');
  });
  if (les.id === 'pc') ok(last.perfect, 'pc ends with an empty wall');
  if (les.id === 'dt') ok(g.stats.tsd === 1 && g.stats.tst === 1, 'dt is a double then a triple');
  if (les.id === 'tsd') ok(g.stats.tsd === 1, 'tsd is a T-spin double');
}
console.log('opener tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
