'use strict';
const ZZ = require('../src/engine.js');
require('../src/bot.js');
const { Game, Bot } = ZZ;

function solo(level, pieces, garbageEvery, garbageN, seed) {
  const g = new Game({ manual: true, seed, events: false, garbageDelay: 0 });
  g.start();
  let deaths = 0, maxH = 0, tThink = 0, n = 0;
  for (let i = 0; i < pieces; i++) {
    if (g.over) { deaths++; g.revive(); }
    if (garbageEvery && i % garbageEvery === garbageEvery - 1) g.receive(garbageN);
    const t0 = process.hrtime.bigint();
    const d = Bot.think(g, level);
    tThink += Number(process.hrtime.bigint() - t0) / 1e6; n++;
    if (d) {
      if (d.hold) g.hold();
      for (const a of d.path) {
        if (a === Bot.L) g.move(-1); else if (a === Bot.R) g.move(1); else if (a === Bot.CW) g.rotate(1); else if (a === Bot.CCW) g.rotate(-1); else g.sonicDrop();
      }
      if (g.cur && (g.cur.x !== d.x || g.cur.y !== d.y || g.cur.rot !== d.rot)) solo.mismatch = (solo.mismatch || 0) + 1;
    }
    g.hardDrop();
    const h = g.stackHeight(); if (h > maxH) maxH = h;
  }
  const s = g.stats;
  return { name: level.name, app: +(s.attack / s.pieces).toFixed(3), lines: s.lines, quads: s.quads, spins: s.spins, tsd: s.tsd, tst: s.tst, minis: s.minis, maxCombo: s.maxCombo, b2bMax: s.b2bMax, deaths, maxH, msPerThink: +(tThink / n).toFixed(2) };
}

function duel(la, lb, seed, seconds) {
  const mk = () => new Game({ manual: true, seed, events: false });
  const a = mk(), b = mk();
  a.onAttack = n => b.receive(n); b.onAttack = n => a.receive(n);
  a.start(); b.start();
  const pa = new Bot.BotPlayer(a, la), pb = new Bot.BotPlayer(b, lb);
  let koA = 0, koB = 0, ra = 0, rb = 0;
  const dt = 16;
  for (let t = 0; t < seconds * 1000; t += dt) {
    a.update(dt); b.update(dt);
    if (a.over) { if (ra === 0) { koB++; ra = 1000; } ra -= dt; if (ra <= 0) { ra = 0; a.revive(); } } else pa.update(dt);
    if (b.over) { if (rb === 0) { koA++; rb = 1000; } rb -= dt; if (rb <= 0) { rb = 0; b.revive(); } } else pb.update(dt);
  }
  return { a: la.name, b: lb.name, koA, koB, sentA: a.stats.sent, sentB: b.stats.sent, pcsA: a.stats.pieces, pcsB: b.stats.pieces, spinsA: a.stats.spins, spinsB: b.stats.spins, quadsA: a.stats.quads, quadsB: b.stats.quads };
}

const mode = process.argv[2] || 'all';
const LV = Bot.LEVELS;
if (mode === 'all' || mode === 'solo') {
  console.log('--- solo, no garbage, 1500 pieces');
  for (const l of LV) console.log(JSON.stringify(solo(l, 1500, 0, 0, 12345)));
  console.log('--- solo, 3 cement rows every 9 pieces, 1500 pieces');
  for (const l of LV) console.log(JSON.stringify(solo(l, 1500, 9, 3, 777)));
  console.log('path mismatches:', solo.mismatch || 0);
}
if (mode === 'all' || mode === 'duel') {
  console.log('--- duels, 120 s each');
  const pairs = [[4, 3], [4, 2], [3, 2], [2, 1], [1, 0], [4, 4], [2, 2], [0, 0]];
  for (const [i, j] of pairs) {
    for (const seed of [1, 2, 3]) console.log(JSON.stringify(duel(LV[i], LV[j], seed * 1000 + 17, 120)));
  }
}
