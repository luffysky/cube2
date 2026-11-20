'use strict';
// Plays every numbered level with the computer and writes the result into src/levels.js (the PAR table): how many
// pieces it needed, and which salt (which terrain draw) it used. A level the computer cannot finish within the
// piece limit is drawn again with the next salt; a number with no finishable draw stops the run with an error.
//   node tools/make_levels.js            all 1000
//   node tools/make_levels.js 1 50       just these (prints, does not write)
const fs = require('fs'), path = require('path');
const ZZ = require('../src/engine.js'); require('../src/bot.js'); require('../src/levels.js');
const { Game, Bot, Levels } = ZZ;
const STRONG = Object.assign({}, Bot.LEVELS[4], { hold: true, depth: 2, noise: 0 });     // the strongest rival, no mistakes
const STEADY = Object.assign({}, Bot.LEVELS[2], { hold: true, depth: 2, noise: 0 });
const CAP = 150, MIN = 4;          // a level done in fewer pieces than MIN is too easy: draw again

function play(lv, cfg) {
  const g = new Game({ manual: true, seed: lv.seed, board: lv.board, garbage: false, events: false });
  g.start();
  for (let i = 1; i <= CAP; i++) {
    if (g.over || !g.cur) return 0;
    const d = Bot.think(g, cfg);
    if (d) { if (d.hold) g.hold(); for (const a of d.path) { if (a === Bot.L) g.move(-1); else if (a === Bot.R) g.move(1); else if (a === Bot.CW) g.rotate(1); else if (a === Bot.CCW) g.rotate(-1); else g.sonicDrop(); } }
    g.hardDrop();
    if (Levels.met(lv, g)) return i;
  }
  return 0;
}
function best(lv) {
  const cfgs = lv.goal === 'tspin' ? [STRONG] : [STEADY, STRONG];
  let p = 0;
  for (const c of cfgs) { const r = play(lv, c); if (r && (!p || r < p)) p = r; }
  return p;
}
const from = +process.argv[2] || 1, to = +process.argv[3] || Levels.COUNT, write = !process.argv[2];
const out = [], t0 = Date.now();
for (let n = from; n <= to; n++) {
  let got = null;
  for (let salt = 0; salt < 12 && !got; salt++) { const lv = Levels.make(n, salt), p = best(lv); if (p >= MIN) got = [salt, p, lv.goal]; }
  if (!got) { console.error('level ' + n + ': no draw could be finished'); process.exit(1); }
  out.push([got[0], got[1]]);
  if (!write || n % 100 === 0) console.log(n, got[2], 'salt', got[0], 'par', got[1], ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
if (write) {
  const file = path.join(__dirname, '..', 'src', 'levels.js');
  const src = fs.readFileSync(file, 'utf8');
  const table = '  PAR = ' + JSON.stringify(out) + ';      // written by tools/make_levels.js';
  const next = src.replace(/  \/\*__PAR__\*\/|  PAR = \[\[.*\]\];      \/\/ written by tools\/make_levels\.js/, table);
  fs.writeFileSync(file, next);
  const salts = out.filter(x => x[0] > 0).length;
  console.log('wrote ' + out.length + ' levels; ' + salts + ' needed another draw; par from ' + Math.min(...out.map(x => x[1])) + ' to ' + Math.max(...out.map(x => x[1])));
}
