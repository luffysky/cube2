'use strict';
// Records a computer-played match, then checks that a ghost rebuilds the same wall, with and without new cement underneath.
const ZZ = require('../src/engine.js');
require('../src/bot.js');
require('../src/replay.js');
const { Recorder, Ghost, queueOf } = ZZ.Replay, ROWS = ZZ.ROWS;
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
const rowsStr = g => g.grid.map(r => Array.from(r).join('')).join('\n');

function record(seed, ms, opts) {
  const g = new ZZ.Game({ seed, manual: true, items: !!(opts && opts.items) });
  const bot = new ZZ.Bot.BotPlayer(g, Object.assign({}, ZZ.Bot.LEVELS[3], { pps: 2 }));
  const rec = new Recorder({ seed, minutes: 1, items: false, mode: 'ai', foe: 'x' });
  g.start();
  let t = 0, nextHit = 4000, kos = 0, down = 0;
  while (t < ms) {
    const dt = 16; t += dt; rec.tick(dt);
    if (down > 0) { down -= dt; if (down <= 0) { g.revive(); } }
    else { if (!g.over) bot.update(dt); g.update(dt); }
    if (opts && opts.garbage && t >= nextHit) { g.receive(opts.garbage); nextHit += 5000; }
    if (opts && opts.useItems && g.inv.length && t % 3200 < 16) { const id = g.takeItem(); if (id === 1) g.chisel(3); else if (id === 5) g.trowel(); rec.item(id); }
    const ev = g.events; g.events = [];
    for (const e of ev) { rec.on(g, e); if (e.type === 'topout') { kos++; down = 1150; } }
  }
  return { g, rep: rec.done({ pps: 2, apm: 30 }), kos };
}
const endOf = rep => rep.ev[rep.ev.length - 1][1];
function play(rep, ms, hits) {
  const g = new ZZ.Game({ seed: 99, manual: true, queue: queueOf(rep) });
  const gh = new Ghost(g, rep, {});
  g.start();
  let t = 0, down = 0, kos = 0, sent = 0, took = false;
  gh.o.onTakeOver = () => { took = true; };
  g.onAttack = n => { sent += n; };
  while (t < ms) {
    const dt = 16; t += dt;
    if (down > 0) { down -= dt; if (down <= 0) { g.revive(); gh.onRevive(); } }
    else { if (!g.over) gh.update(dt); g.update(dt); }
    if (hits) for (const h of hits) if (!h.done && t >= h.t) { h.done = true; g.receive(h.n); }
    const ev = g.events; g.events = [];
    for (const e of ev) if (e.type === 'topout') { kos++; down = 1150; }
  }
  return { g, gh, kos, sent, took };
}

// 1. plain playback rebuilds the same wall and sends the same attack
{
  const a = record(11, 30000, null);
  const b = play(a.rep, endOf(a.rep), null);
  ok(queueOf(a.rep).length === a.g.stats.pieces, 'one entry per piece');
  ok(rowsStr(a.g) === rowsStr(b.g), 'same wall after playback');
  ok(a.g.stats.attack === b.g.stats.attack && a.g.stats.lines === b.g.stats.lines, 'same lines and attack');
  ok(b.gh.sync, 'stayed on the recording');
  ok(JSON.stringify(a.rep).length < 60000, 'recording is small: ' + JSON.stringify(a.rep).length);
}
// 2. recorded cement is replayed
{
  const a = record(12, 30000, { garbage: 2 });
  const b = play(a.rep, endOf(a.rep), null);
  ok(a.rep.ev.some(e => e[0] === 'g'), 'recording has cement');
  ok(rowsStr(a.g) === rowsStr(b.g), 'same wall with recorded cement');
}
// 3. new cement from the live player goes underneath; the recorded wall sits on top of it
{
  const a = record(13, 24000, { garbage: 1 });
  const b = play(a.rep, endOf(a.rep), [{ t: 3000, n: 3 }]);
  if (b.kos === 0 && a.kos === 0) {
    ok(b.gh.lift === 3, 'lift is 3, got ' + b.gh.lift);
    let same = true;
    for (let r = 3; r < ROWS; r++) if (Array.from(a.g.grid[r]).join('') !== Array.from(b.g.grid[r - 3]).join('')) same = false;
    ok(same, 'recorded wall lifted by three rows');
    ok(Array.from(b.g.grid[ROWS - 1]).filter(v => v === ZZ.GARBAGE).length === 9, 'cement on the floor');
  } else ok(true, 'skipped (a knockout happened)');
}
// 4. a knockout the recording did not have hands the wall to a computer player
{
  const a = record(14, 30000, null);
  const b = play(a.rep, 30000, [{ t: 2000, n: 8 }, { t: 2600, n: 8 }, { t: 3200, n: 8 }]);
  ok(b.kos >= 1, 'ghost was knocked out');
  ok(b.took && !!b.gh.bot, 'computer took over');
  ok(b.g.stats.pieces > 20, 'and kept playing: ' + b.g.stats.pieces);
}
// 5. a knockout that is in the recording keeps the ghost in step
{
  let a = null;
  for (let seed = 30; seed < 60 && !a; seed++) { const r = record(seed, 26000, { garbage: 7 }); if (r.kos >= 1) a = r; }
  if (a) {
    const b = play(a.rep, endOf(a.rep), null);
    ok(b.kos === a.kos, 'same knockouts: ' + a.kos + ' vs ' + b.kos);
    ok(b.gh.sync, 'still in step after a recorded knockout');
    ok(rowsStr(a.g) === rowsStr(b.g), 'still the same wall after a recorded knockout');
    if (rowsStr(a.g) !== rowsStr(b.g)) { console.log(a.rep.ev.filter(e => e[0] === 'o' || e[0] === 'r').map(e => e.join(':')).join(' '), 'pieces', a.g.stats.pieces, b.g.stats.pieces, 'endOf', endOf(a.rep)); }
  } else ok(false, 'could not record a knockout');
}
// 6. item tiles and wall-shaping items come back the same
{
  const a = record(15, 40000, { items: true, useItems: true });
  const b = play(a.rep, endOf(a.rep), null);
  ok(a.rep.ev.some(e => e[0] === 'p' && e[7]), 'recording has item tiles');
  ok(rowsStr(a.g) === rowsStr(b.g), 'same wall with items');
}
// 7. recording ends early: the computer carries on
{
  const a = record(16, 8000, null);
  const b = play(a.rep, 16000, null);
  ok(b.took && b.g.stats.pieces > a.g.stats.pieces, 'carries on after the recording ends');
}
console.log('replay tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
