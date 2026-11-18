'use strict';
const ZZ = require('../src/engine.js'); require('../src/bot.js');
const { Game, Bot } = ZZ;
function run(w, pieces, gEvery, gN, seed) {
  const cfg = { pps: 2, depth: 2, hold: true, noise: 0, w };
  const g = new Game({ manual: true, seed, events: false, garbageDelay: 0 });
  g.start(); let deaths = 0;
  for (let i = 0; i < pieces; i++) {
    if (g.over) { deaths++; g.revive(); }
    if (gEvery && i % gEvery === gEvery - 1) g.receive(gN);
    const d = Bot.think(g, cfg);
    if (d) { if (d.hold) g.hold(); for (const a of d.path) { if (a === 0) g.move(-1); else if (a === 1) g.move(1); else if (a === 2) g.rotate(1); else if (a === 3) g.rotate(-1); else g.sonicDrop(); } }
    g.hardDrop();
  }
  const s = g.stats;
  return { app: +(s.attack / s.pieces).toFixed(3), quads: s.quads, tsd: s.tsd, tst: s.tst, spins: s.spins, minis: s.minis, deaths, b2b: s.b2bMax, combo: s.maxCombo };
}
const sets = JSON.parse(process.argv[2]);
for (const [name, w] of Object.entries(sets)) {
  let a = [], b = [];
  for (const seed of [11, 22, 33]) { a.push(run(w, 1200, 0, 0, seed)); b.push(run(w, 1200, 8, 3, seed + 5)); }
  const avg = (arr, k) => +(arr.reduce((s, x) => s + x[k], 0) / arr.length).toFixed(3);
  const line = arr => ['app', 'quads', 'tsd', 'tst', 'minis', 'deaths', 'b2b'].map(k => k + '=' + avg(arr, k)).join(' ');
  console.log(name.padEnd(10), '| free:', line(a), '| garbage:', line(b));
}
