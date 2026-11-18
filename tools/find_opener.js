'use strict';
/* Finds a way to stack a target shape with whole bags of pieces, then checks the T-spins that finish it.
   Every placement must be reachable from the spawn point on the wall as it stands, rest on something, and stay inside the target.
   Usage: node tools/find_opener.js <name>   (tsd | pc | dt) */
const ZZ = require('../src/engine.js');
require('../src/bot.js');
const Bot = ZZ.Bot, COLS = ZZ.COLS, ROWS = ZZ.ROWS, SHAPES = ZZ.SHAPES;

// rows: strings top to bottom, aligned to the floor. X must be filled, '.' must stay empty, '?' may be filled.
function parse(rows) {
  const must = new Array(ROWS).fill(0), may = new Array(ROWS).fill(0);
  rows.forEach((s, i) => {
    const y = ROWS - rows.length + i;
    for (let x = 0; x < COLS; x++) {
      const ch = s[x];
      if (ch === 'X') must[y] |= 1 << x;
      if (ch === 'X' || ch === '?') may[y] |= 1 << x;
    }
  });
  return { must, may };
}

function cellsOf(type, rot, x, y) { return SHAPES[type][rot].map(c => [x + c[0], y + c[1]]); }

function straight(rows, type, rot, x, y) {
  // true when the piece can fall to (x, y) from the top without sliding under anything
  for (let yy = y; yy >= ZZ.TOP - 3; yy--) {
    for (const c of SHAPES[type][rot]) {
      const cx = x + c[0], cy = yy + c[1];
      if (cx < 0 || cx >= COLS) return false;
      if (cy >= 0 && (rows[cy] >> cx) & 1) return false;
    }
  }
  return true;
}

function tile(spec, opt) {
  opt = opt || {};
  const { must, may } = parse(spec.rows);
  const bags = spec.bags, dead = new Set();
  let nodes = 0;
  function ok(rows) {
    // an empty must-cell with something already above it can no longer be filled by this search
    for (let x = 0; x < COLS; x++) {
      let covered = false;
      for (let y = 0; y < ROWS; y++) {
        const f = (rows[y] >> x) & 1;
        if (f) covered = true;
        else if (covered && (must[y] >> x) & 1) return false;
      }
    }
    return true;
  }
  function done(rows) { for (let y = 0; y < ROWS; y++) if ((rows[y] & must[y]) !== must[y]) return false; return true; }
  function rec(rows, bi, left) {
    if (!left.length) { bi++; if (bi >= bags.length) return done(rows) ? [] : null; left = bags[bi].slice(); }
    const key = rows.join(',') + '|' + bi + '|' + left.slice().sort().join('');
    if (dead.has(key)) return null;
    if (++nodes > (opt.max || 4e6)) return null;
    const tried = {};
    for (let li = 0; li < left.length; li++) {
      const type = left[li];
      if (tried[type]) continue;
      tried[type] = 1;
      const sp = Bot.spawnPos(rows, type);
      if (!sp) continue;
      const ps = Bot.placements(rows, type, sp.x, sp.y, 0).map(p => ({ x: p.x, y: p.y, rot: p.rot, spin: p.spin, path: Bot.pathOf(p.s, p.spin !== 'none') }));
      const cands = [];
      for (const p of ps) {
        const cs = cellsOf(type, p.rot, p.x, p.y);
        if (!cs.every(c => c[1] >= 0 && (may[c[1]] >> c[0]) & 1)) continue;
        const st = straight(rows, type, p.rot, p.x, p.y);
        if (opt.straightOnly && !st) continue;
        const r2 = rows.slice();
        cs.forEach(c => { r2[c[1]] |= 1 << c[0]; });
        if (!ok(r2)) continue;
        let need = 0;
        cs.forEach(c => { if ((must[c[1]] >> c[0]) & 1) need++; });
        cands.push({ p, r2, st, need, low: Math.max(...cs.map(c => c[1])) });
      }
      // lower, simpler and more useful placements first
      cands.sort((a, b) => (b.st - a.st) || (b.need - a.need) || (b.low - a.low) || (a.p.path.length - b.p.path.length));
      const rest = left.slice(); rest.splice(li, 1);
      for (const c of cands) {
        const sub = rec(c.r2, bi, rest);
        if (sub) return [{ type, x: c.p.x, y: c.p.y, rot: c.p.rot, straight: c.st }].concat(sub);
      }
    }
    dead.add(key);
    return null;
  }
  const res = rec(new Array(ROWS).fill(0), 0, bags[0].slice());
  return { steps: res, nodes };
}

function boardOf(steps) {
  const g = new ZZ.Game({ manual: true, queue: steps.map(s => s.type), garbage: false, seed: 1 });
  g.start();
  for (const s of steps) {
    if (!g.cur || g.cur.type !== s.type) throw new Error('queue mismatch at ' + s.type);
    g.cur.x = s.x; g.cur.y = s.y; g.cur.rot = s.rot;
    if (!g.fits(s.type, s.rot, s.x, s.y) || g.fits(s.type, s.rot, s.x, s.y + 1)) throw new Error('bad rest for ' + JSON.stringify(s));
    g.lock();
  }
  return g;
}
function show(grid, n) {
  const out = [];
  for (let y = ROWS - n; y < ROWS; y++) out.push(Array.from(grid[y]).map(v => v ? 'IOTSZJLG'[(v & 15) - 1] : '.').join(''));
  return out.join('\n');
}

// After the stack: each finishing piece must end with the given spin and line count. Tries every way, shortest inputs first.
function spins(grid, goals) {
  function rec(rows, gi) {
    if (gi >= goals.length) return [];
    const goal = goals[gi], type = goal.piece || 'T', sp = Bot.spawnPos(rows, type);
    if (!sp) return null;
    const ps = Bot.placements(rows, type, sp.x, sp.y, 0), cands = [];
    for (const p of ps) {
      if (goal.spin && p.spin !== goal.spin) continue;
      const res = Bot.applyMove(rows, type, p.rot, p.x, p.y, p.spin, -1, -1);
      if (res.lines !== goal.lines) continue;
      if (goal.empty && res.rows.some(v => v)) continue;
      cands.push({ type, x: p.x, y: p.y, rot: p.rot, spin: p.spin, lines: res.lines, path: Bot.pathOf(p.s, p.spin !== 'none'), rows: res.rows });
    }
    cands.sort((a, b) => a.path.length - b.path.length);
    for (const c of cands) {
      const sub = rec(c.rows, gi + 1);
      if (sub) { const o = Object.assign({}, c); delete o.rows; return [o].concat(sub); }
    }
    return null;
  }
  return rec(Bot.rowsOf(grid), 0);
}

const SPECS = {
  // first bag: six pieces build one T slot, the seventh piece is the T
  tsd: (function () {
    const list = [];
    for (let hx = 1; hx <= 8; hx++) for (const side of [1, -1]) {
      const over = hx + side, open = hx - side;
      if (over < 0 || over > 9 || open < 0 || open > 9) continue;
      const row = (f) => Array.from({ length: 10 }, (_, x) => f(x)).join('');
      const r0 = row(x => x === hx ? '.' : 'X');
      const r1 = row(x => Math.abs(x - hx) <= 1 ? '.' : 'X');
      const r2 = row(x => x === over ? 'X' : (x === hx || x === open) ? '.' : '?');
      const r3 = row(x => (x === hx || x === open) ? '.' : '?');
      const r4 = row(x => (x === hx || x === open || x === over) ? '.' : '?');
      list.push({ name: 'tsd hx=' + hx + ' side=' + side, rows: [r4, r3, r2, r1, r0], bags: [['I', 'O', 'S', 'Z', 'J', 'L']], goals: [{ spin: 'full', lines: 2 }] });
    }
    return list;
  })(),
  // nine pieces fill four rows beside a one-wide well; the long piece clears all four and leaves nothing
  pc: (function () {
    const list = [];
    for (const well of [9, 0]) {
      const r = Array.from({ length: 10 }, (_, x) => x === well ? '.' : 'X').join('');
      const two = [['S', 'Z'], ['J', 'L'], ['O', 'L'], ['O', 'J'], ['L', 'S'], ['J', 'Z'], ['O', 'S'], ['O', 'Z'], ['T', 'O'], ['T', 'L'], ['T', 'J'], ['T', 'S'], ['T', 'Z'], ['L', 'Z'], ['J', 'S']];
      for (const t of two) list.push({ name: 'pc well=' + well + ' +' + t.join(''), rows: [r, r, r, r], bags: [['I', 'O', 'T', 'S', 'Z', 'J', 'L'], t], goals: [{ piece: 'I', lines: 4, empty: true }] });
    }
    return list;
  })(),
  // two bags without their T: the double-then-triple cannon on the left wall
  dt: (function () {
    const base = [
      '..?????...',   // r8
      '..????????',   // r7
      '..XX??????',   // r6: overhang
      '...X??????',   // r5
      'XX.XXXXXXX',   // r4
      'X...XXXXXX',   // r3
      'XX.XXXXXXX',   // r2
      'X..XXXXXXX',   // r1
      'XX.XXXXXXX'    // r0
    ];
    const six = ['I', 'O', 'S', 'Z', 'J', 'L'];
    return [{ name: 'dt left', rows: base, bags: [six, six], goals: [{ spin: 'full', lines: 2 }, { spin: 'full', lines: 3 }], cells: 48 }];
  })()
};

function run(name) {
  const list = SPECS[name];
  const found = [];
  for (const spec of list) {
    for (const straightOnly of [true, false]) {
      const t0 = Date.now();
      const r = tile(spec, { straightOnly, max: name === 'dt' ? 3e6 : 6e5 });
      if (!r.steps) { console.error(spec.name, straightOnly ? 'straight' : 'any', 'no tiling', r.nodes, (Date.now() - t0) + 'ms'); continue; }
      let g;
      try { g = boardOf(r.steps); } catch (e) { console.error(spec.name, 'replay failed', e.message); continue; }
      const sp = spins(g.grid, spec.goals);
      if (!sp) { console.error(spec.name, 'stack found but the finish does not work'); console.error(show(g.grid, 9)); continue; }
      console.error(spec.name, straightOnly ? 'straight' : 'any', 'OK', r.nodes, (Date.now() - t0) + 'ms');
      console.error(show(g.grid, 9));
      found.push({ name: spec.name, straightOnly, steps: r.steps, finish: sp, board: show(g.grid, 9).split('\n') });
      break;
    }
    if (found.length >= (name === 'dt' ? 1 : 3)) break;
  }
  console.log(JSON.stringify(found));
}
if (require.main === module) run(process.argv[2] || 'tsd');
module.exports = { tile, boardOf, spins, show, parse, SPECS };
