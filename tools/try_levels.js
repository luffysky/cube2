'use strict';
// For tuning the computer rivals: how would a level with these numbers play a two-minute match on its own?
//   node tools/try_levels.js '{"gentle":{"pps":0.22,"noise":60,"w":{"attack":0,"clearSafe":[0,3,2,1,0]}}}'
// With no argument it shows the seven levels of the game. For each: lines sent and how often it stacks itself to the top.
const ZZ = require('../src/engine.js'); require('../src/bot.js');
const { Game, Bot } = ZZ;
function solo(cfg, pieces, seed) {
  const g = new Game({ manual: true, seed, events: false, garbageDelay: 0 });
  g.start(); let deaths = 0, single = 0;
  for (let i = 0; i < pieces; i++) {
    if (g.over) { deaths++; g.revive(); }
    const d = Bot.think(g, cfg);
    if (d) { if (d.hold) g.hold(); for (const a of d.path) { if (a === Bot.L) g.move(-1); else if (a === Bot.R) g.move(1); else if (a === Bot.CW) g.rotate(1); else if (a === Bot.CCW) g.rotate(-1); else g.sonicDrop(); } }
    g.hardDrop();
  }
  const s = g.stats;
  return { app: s.attack / s.pieces, lines: s.lines, deaths, quads: s.quads };
}
const cands = process.argv[2] ? JSON.parse(process.argv[2]) : Object.fromEntries(Bot.ORDER.map(i => [Bot.LEVELS[i].name, Bot.LEVELS[i]]));
for (const [name, c] of Object.entries(cands)) {
  let app = 0, deaths = 0, lines = 0; const N = 6, P = 600;
  for (let s = 0; s < N; s++) { const r = solo(Object.assign({ depth: 1, hold: false }, c), P, 100 + s * 7); app += r.app; deaths += r.deaths; lines += r.lines; }
  app /= N; const perPiece = deaths / (N * P), pcs2 = c.pps * 120;
  console.log(name.padEnd(8), 'pps', c.pps, 'noise', c.noise, '| app', app.toFixed(3), '| lines/100pc', (lines / (N * P) * 100).toFixed(1), '| pieces per topout', perPiece ? Math.round(1 / perPiece) : 'inf',
    '| in 2 min: pieces', Math.round(pcs2), 'sent', (pcs2 * app).toFixed(1), 'self-KO', (pcs2 * perPiece).toFixed(2));
}
