'use strict';
// For the tests: a real match played by the computer, with the tape and the report a page would send for it.
const ZZ = require('../src/engine.js');
require('../src/bot.js'); require('../src/meta.js'); require('../src/replay.js');
// o: { seed, ms (how long to play), level, garbage (rows thrown at the player every five seconds), sprint }
function play(o) {
  // the computer player rolls dice for its slips; fixed here so the same seed always plays the same match
  const dice = Math.random; let d = (o.seed ^ 0x5bd1e995) >>> 0;
  Math.random = () => { d = (d + 0x6D2B79F5) | 0; let t = Math.imul(d ^ (d >>> 15), 1 | d); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return playOne(o); } finally { Math.random = dice; }
}
function playOne(o) {
  const seed = o.seed >>> 0, g = new ZZ.Game({ seed, manual: true });
  const bot = new ZZ.Bot.BotPlayer(g, Object.assign({}, ZZ.Bot.LEVELS[o.level == null ? 3 : o.level], { pps: o.pps || 2.5 }));
  const tape = new ZZ.Replay.Tape(seed, false);
  g.start();
  let t = 0, nextHit = 4000, down = 0;
  const end = o.sprint ? 600000 : o.ms || 120000;
  while (t < end) {
    const dt = 16; t += dt; tape.tick(dt);
    if (down > 0) { down -= dt; if (down <= 0) g.revive(); }
    else { if (!g.over) bot.update(dt); g.update(dt); }
    if (o.garbage && t >= nextHit) { g.receive(o.garbage); nextHit += 5000; }
    const ev = g.events; g.events = [];
    for (const e of ev) { tape.on(g, e); if (e.type === 'topout') down = 1150; }
    if (o.sprint && g.stats.lines >= 40) break;
  }
  const kos = tape.ev.filter(e => e[0] === 'o').length;
  return { tape: tape.done(), game: g, ms: t, kos, stats: JSON.parse(JSON.stringify(g.stats)) };
}
// the two things a page sends when a match ends: the report and the tape
function fin(mode, o, more) {
  const p = play(Object.assign({ sprint: mode === 'sprint' }, o));
  const m = Object.assign({ mode, result: mode === 'sprint' ? 1 : p.kos ? -1 : 1, level: 2, stats: p.stats, ko: 0, koOpp: p.kos, itemsUsed: 0, ms: p.ms }, more || {});
  return [m, p.tape];
}
// Many tests want a match with exact numbers ("12000 points, 3 knockouts"). No real game gives those on demand, so
// those tests hand in a stand-in tape that simply states its numbers, and stub() teaches this process's checker to
// accept it. The real checker is untouched for everything else, and no server code knows about stand-ins.
let seedNo = 1000;
function fake(m) {
  const c = ZZ.Meta.cleanMatch(m), st = c.stats;
  return { v: 1, rv: ZZ.RULES, seed: seedNo++, ev: [], standIn: { ms: c.ms, kos: c.koOpp, pieces: st.pieces, lines: st.lines, attack: st.sent, score: st.score, spins: st.spins, tst: st.tst, minis: st.minis, xspins: st.xspins, quads: st.quads, maxCombo: st.maxCombo } };
}
// zz: the copy of the game code the server under test uses (it can be a different copy from the one loaded here)
function stub(zz) {
  zz = zz || ZZ;
  const real = zz.Replay.check;
  if (real.stubbed) return;
  zz.Replay.check = t => (t && t.standIn ? t.standIn : real(t));
  zz.Replay.check.stubbed = true;
}
module.exports = { play, fin, fake, stub, ZZ };
if (require.main === module) {
  let bad = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const p = play({ seed, ms: 60000, garbage: seed % 3 ? (seed % 5) + 1 : 0, level: seed % 7 }), v = ZZ.Replay.check(p.tape), s = p.stats;
    const same = v && v.pieces === s.pieces && v.lines === s.lines && v.score <= s.score && v.attack === s.attack && v.spins === s.spins && v.minis === s.minis && v.xspins === s.xspins && v.quads === s.quads && v.maxCombo === s.maxCombo && v.kos === p.kos;
    if (!same) { bad++; console.log('seed', seed, 'differs', JSON.stringify(v), JSON.stringify(s), p.kos); }
  }
  const sp = play({ seed: 77, sprint: true });
  console.log('sprint', sp.ms, sp.stats.lines, !!ZZ.Replay.check(sp.tape), 'tape bytes', JSON.stringify(sp.tape).length);
  console.log(bad ? bad + ' differ' : '40 matches: the tape gives the same numbers as the game');
}
