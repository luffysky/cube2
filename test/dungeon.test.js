'use strict';
// 地城小隊's rules (games/dungeon/rules.js): picks, rounds, upgrades between floors, the Lord, and the check every page
// makes on a state that came over the wire. Ends with many whole runs by sensible computer players, to keep the
// difficulty where it was set: a balanced party nearly always wins, odd ones about half the time.
const DG = require('../games/dungeon/rules.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const party = cs => cs.map((c, i) => ({ s: i, n: 'P' + i, c }));

// ---------- a new game ----------
{
  const st = DG.newGame(party(['warrior', 'cleric']));
  ok(st.ph === 'fight' && st.fl === 1 && st.rd === 1 && st.h.length === 2 && st.m.length === 2 && st.m.every(m => m.k === 'slime'), 'two heroes meet two slimes on floor 1');
  ok(st.h[0].hp === 120 && st.h[1].mp === 50, 'heroes start with their class numbers');
  ok(DG.newGame(party(['mage'])).m.length === 2 && DG.newGame(party(['mage'])).m[0].mh < st.m[0].mh, 'alone: weaker monsters');
  ok(DG.newGame(party(['a', 'b', 'c', 'd', 'e'])).h.length === 4 && DG.newGame(party(['x'])).h[0].c === 'warrior', 'at most four heroes; an unknown class becomes a warrior');
}
// ---------- picks ----------
{
  const st = DG.newGame(party(['warrior', 'cleric']));
  ok(DG.choose(st, 0, { k: 'atk', t: 5 }) === 'target', 'no attacking a monster that is not there');
  ok(DG.choose(st, 1, { k: 'skill', t: 0 }) === 'full', 'no healing someone at full health');
  ok(DG.choose(st, 7, { k: 'guard' }) === 'no' && DG.choose(st, 0, { k: 'dance' }) === 'no', 'no picks for a seat that is not playing, or of a kind that does not exist');
  ok(DG.choose(st, 0, { k: 'atk', t: 1 }) === '' && !DG.ready(st), 'one has picked, the other not yet');
  ok(DG.choose(st, 1, { k: 'guard' }) === '' && DG.ready(st), 'both have picked');
  const hp0 = st.m[1].hp;
  DG.resolve(st, rngOf(3));
  ok(st.m[1].hp < hp0 && st.rd === 2 && st.h.every(h => h.a === null), 'the round is played: the slime is hurt, the next round starts with no picks');
  ok(st.log.some(l => l[0] === 'atk' && l[1] === 0 && l[2] === 1) && st.log.some(l => l[0] === 'hit'), 'the log says who hit whom');
}
// ---------- skills ----------
{
  let st = DG.newGame(party(['mage', 'ranger', 'warrior', 'cleric']));
  st.h[3].hp = 50; st.h[1].hp = 0;
  ok(DG.choose(st, 0, { k: 'skill' }) === '' && DG.choose(st, 2, { k: 'skill' }) === '' && DG.choose(st, 3, { k: 'skill', t: 1 }) === '', 'fireball, taunt and a revive picked');
  const total0 = st.m.reduce((n, m) => n + m.hp, 0), mp0 = st.h[0].mp;
  DG.resolve(st, rngOf(9));
  ok(st.h[0].mp === mp0 - 15 + DG.REGEN && st.m.reduce((n, m) => n + m.hp, 0) < total0 && st.log.some(l => l[0] === 'fire'), 'the fireball costs 15 and hurts every monster');
  ok(st.h[1].hp > 0 && st.log.some(l => l[0] === 'revive' && l[2] === 1), 'the cleric brings the ranger back');
  ok(st.h[2].tn === 1 && st.log.filter(l => l[0] === 'hit').every(l => l[2] === 2), 'while taunting, every monster hits the warrior');
  st = DG.newGame(party(['cleric']));
  st.h[0].mp = 5;
  ok(DG.choose(st, 0, { k: 'skill', t: 0 }) !== '', 'no heal without the magic for it');
}
// ---------- floors, upgrades, the end ----------
{
  const st = DG.newGame(party(['warrior', 'ranger']));
  st.m.forEach(m => { m.hp = 1; });
  DG.choose(st, 0, { k: 'atk', t: 0 }); DG.choose(st, 1, { k: 'atk', t: 1 });
  DG.resolve(st, rngOf(1));
  ok(st.ph === 'loot' && st.up[0].length === 3 && new Set(st.up[1]).size === 3, 'a cleared floor: three different upgrades for each hero');
  ok(DG.pick(st, 0, 'nope') === 'no' && DG.pick(st, 0, st.up[0][0]) === '' && DG.pick(st, 0, st.up[0][1]) === 'no', 'one upgrade each, from the offers');
  st.h[1].hp = 0;
  DG.next(st);
  ok(st.ph === 'fight' && st.fl === 2 && st.m.length === 3 && st.h[1].hp === Math.round(st.h[1].mh * 0.5) && st.h[1].pk === '', 'the next floor: the fallen get up, whoever had not chosen got the first offer');
  st.h.forEach(h => { h.hp = 1; h.df = 0; });
  st.m.forEach(m => { m.atk = 999; });
  DG.choose(st, 0, { k: 'atk', t: 0 }); DG.choose(st, 1, { k: 'atk', t: 0 });
  DG.resolve(st, rngOf(2));
  ok(st.ph === 'lose' && st.log[st.log.length - 1][0] === 'lose', 'everyone down: the run is lost');
  const b = DG.newGame(party(['warrior', 'mage', 'ranger', 'cleric']));
  b.fl = 5; b.m = []; b.ph = 'fight';
  const lord = { k: 'lord', hp: 100, mh: 300, atk: 20, df: 6, spd: 2, rg: 0 }; b.m.push(lord);
  b.rd = 3;
  b.h.forEach(h => DG.choose(b, h.s, { k: 'guard' }));
  DG.resolve(b, rngOf(4));
  ok(lord.rg === 1 && b.log.some(l => l[0] === 'rage') && b.log.some(l => l[0] === 'aoe'), 'the Lord below half gets angry, and every third round breathes on everyone');
  ok(b.log.filter(l => l[0] === 'hit' || l[0] === 'aoe').length === 2, 'against four heroes it acts twice a round');
  lord.hp = 1;
  b.h.forEach(h => DG.choose(b, h.s, { k: 'atk', t: 0 }));
  DG.resolve(b, rngOf(5));
  ok(b.ph === 'win', 'the Lord down: a win');
}
// ---------- a state from the wire ----------
{
  const st = DG.newGame(party(['warrior', 'cleric']));
  DG.choose(st, 0, { k: 'atk', t: 1 });
  const w = DG.wire(st);
  ok(w.h[0].a && w.h[0].a.t === undefined, 'others only see that a pick was made, not what');
  const c = DG.clean(JSON.parse(JSON.stringify(w)));
  ok(c && c.h.length === 2 && c.m.length === 2 && c.h[0].a.k === 'atk', 'a good state passes the check');
  const bad = [
    Object.assign({}, w, { ph: 'party' }), Object.assign({}, w, { h: [] }), Object.assign({}, w, { fl: 9 }),
    Object.assign({}, w, { h: [Object.assign({}, w.h[0], { n: '<script>'.repeat(5) })] }), Object.assign({}, w, { m: [{ k: 'dragon', hp: 1, mh: 1, atk: 1, df: 0, spd: 1, rg: 0 }] }),
    Object.assign({}, w, { log: [['atk', 'x']] }), Object.assign({}, w, { up: { 9: ['hp', 'atk', 'mp'] } }), Object.assign({}, w, { h: [Object.assign({}, w.h[0], { hp: -5 })] }), null, 'x'
  ];
  ok(bad.every(b => DG.clean(b) === null), 'broken states are refused', bad.map(b => !!DG.clean(b)));
  ok(JSON.stringify(DG.wire(DG.newGame(party(['warrior', 'ranger', 'mage', 'cleric'])))).length < 3000, 'a whole state fits in one letter');
}
// ---------- many whole runs: the difficulty stays where it was set ----------
{
  function think(st, h, rng) {
    const cl = DG.CLASSES[h.c], live = st.m.map((m, i) => [m, i]).filter(x => x[0].hp > 0), low = live.slice().sort((a, b) => a[0].hp - b[0].hp)[0][1];
    if (h.c === 'cleric') {
      const down = st.h.find(x => x.hp <= 0); if (down && h.mp >= DG.REVIVE) return { k: 'skill', t: down.s };
      const hurt = st.h.filter(x => x.hp > 0 && x.hp < x.mh * 0.55).sort((a, b) => a.hp / a.mh - b.hp / b.mh)[0]; if (hurt && h.mp >= cl.cost) return { k: 'skill', t: hurt.s };
    }
    if ((h.c === 'mage' || h.c === 'ranger') && (live.length >= 2 || h.c === 'mage') && h.mp >= cl.cost) return { k: 'skill' };
    if (h.c === 'warrior' && st.h.length > 1 && st.h.some(x => x !== h && x.hp > 0 && x.hp < x.mh * 0.5) && h.mp >= cl.cost && !h.tn) return { k: 'skill' };
    if (h.hp < h.mh * 0.25 && rng() < 0.3) return { k: 'guard' };
    return { k: 'atk', t: low };
  }
  function play(cs, seed) {
    const rng = rngOf(seed), st = DG.newGame(party(cs));
    for (let i = 0; i < 500 && (st.ph === 'fight' || st.ph === 'loot'); i++) {
      if (st.ph === 'fight') { st.h.forEach(h => { if (h.hp > 0 && DG.choose(st, h.s, think(st, h, rng))) DG.choose(st, h.s, { k: 'guard' }); }); DG.resolve(st, rng); }
      else { st.h.forEach(h => DG.pick(st, h.s, st.up[h.s].includes('atk') && h.c !== 'cleric' ? 'atk' : st.up[h.s].includes('hp') ? 'hp' : st.up[h.s][0])); DG.next(st); }
    }
    return st.ph === 'win';
  }
  const rate = cs => { let w = 0; for (let s = 1; s <= 120; s++) if (play(cs, s * 7919)) w++; return w / 120; };
  const full = rate(['warrior', 'ranger', 'mage', 'cleric']), pair = rate(['warrior', 'cleric']), odd = rate(['ranger', 'mage']), same = rate(['warrior', 'warrior', 'warrior', 'warrior']);
  ok(full >= 0.8 && full <= 0.99, 'a balanced party of four nearly always wins, not quite always', full);
  ok(pair >= 0.8, 'a warrior and a cleric do well together', pair);
  ok(odd >= 0.4 && odd <= 0.85, 'two without healing or armour: about half the time', odd);
  ok(same >= 0.3 && same <= 0.75, 'four of the same class: about half the time', same);
}
console.log('dungeon tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
