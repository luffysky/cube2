'use strict';
const ZZ = require('../src/engine.js'); require('../src/bot.js'); require('../src/drills.js');
const { Game, Bot } = ZZ;
let bad = 0;
for (const d of ZZ.DRILLS) {
  const g = new Game({ board: d.board, queue: d.queue, manual: true, seed: 1 });
  g.start();
  const steps = Bot.solve(g.grid, d.queue, d.goal);
  if (!steps) { console.log('NO SOLUTION', d.id); bad++; continue; }
  const got = [];
  for (const s of steps) {
    for (const a of s.path) { if (a === 0) g.move(-1); else if (a === 1) g.move(1); else if (a === 2) g.rotate(1); else if (a === 3) g.rotate(-1); else g.sonicDrop(); }
    g.hardDrop();
    const l = g.events.filter(e => e.type === 'lock').pop();
    got.push(l.piece + ':' + l.tspin + '/' + l.lines + '/atk' + l.attack);
  }
  const names = ['←', '→', '↻', '↺', '↓'];
  const last = g.events.filter(e => e.type === 'lock').pop();
  const okGoal = last.tspin === d.goal.spin && last.lines === d.goal.lines && last.piece === (d.goal.piece || 'T');
  if (!okGoal) bad++;
  console.log((okGoal ? 'ok  ' : 'BAD ') + d.id.padEnd(8), got.join('  '), ' | ', steps.map(s => s.type + '[' + s.path.map(a => names[a]).join('') + ']').join(' '));
}
process.exit(bad ? 1 : 0);
