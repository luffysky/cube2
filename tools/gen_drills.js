'use strict';
// Search for small walls where a given piece can only finish by a spin that clears every row it touches.
const ZZ = require('../src/engine.js'); require('../src/bot.js');
const { Bot, SHAPES, COLS, ROWS } = ZZ;
const rnd = new ZZ.RNG(424242);
const names = ['←', '→', '↻', '↺', '↓'];

function tryBoard(type, rot, x, roofRows) {
  const cells = SHAPES[type][rot].map(c => [x + c[0], c[1]]);
  const minY = Math.min(...cells.map(c => c[1])), maxY = Math.max(...cells.map(c => c[1]));
  const span = maxY - minY + 1;
  if (cells.some(c => c[0] < 0 || c[0] >= COLS)) return null;
  // rows listed top to bottom: roofRows + span
  const H = roofRows + span, g = [];
  for (let r = 0; r < H; r++) g.push(new Array(COLS).fill(r >= roofRows ? 1 : 0));
  for (const [cx, cy] of cells) g[roofRows + (cy - minY)][cx] = 0;
  // roof: random blocks near the piece
  const lo = Math.max(0, x - 2), hi = Math.min(COLS - 1, x + 5);
  const n = 1 + Math.floor(rnd.next() * 4);
  for (let i = 0; i < n; i++) g[Math.floor(rnd.next() * roofRows)][lo + Math.floor(rnd.next() * (hi - lo + 1))] = 1;
  // support: every roof block must rest on something or hang off a supported neighbour
  const sup = g.map(r => r.map(() => false));
  let changed = true;
  for (let r = roofRows; r < H; r++) for (let c = 0; c < COLS; c++) sup[r][c] = !!g[r][c];
  while (changed) {
    changed = false;
    for (let r = roofRows - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) {
      if (!g[r][c] || sup[r][c]) continue;
      if ((g[r + 1][c] && sup[r + 1][c]) || (c > 0 && sup[r][c - 1]) || (c < COLS - 1 && sup[r][c + 1])) { sup[r][c] = true; changed = true; }
    }
  }
  for (let r = 0; r < roofRows; r++) for (let c = 0; c < COLS; c++) if (g[r][c] && !sup[r][c]) return null;
  const board = g.map(r => r.map(v => v ? 'X' : '.').join(''));
  const game = new ZZ.Game({ board, queue: [type], manual: true, seed: 1 });
  const steps = Bot.solve(game.grid, [type], { piece: type, spin: type === 'T' ? 'full' : 'spin', lines: span });
  if (!steps) return null;
  const st = steps[0];
  const roofCount = board.slice(0, roofRows).join('').split('X').length - 1;
  return { board, path: st.path.map(a => names[a]).join(''), len: st.path.length, roofCount, span, rot: st.rot };
}

const want = process.argv[2] ? process.argv[2].split(',') : ['Z', 'S', 'L', 'J', 'I'];
for (const type of want) {
  const found = new Map();
  for (let t = 0; t < 60000; t++) {
    const rot = Math.floor(rnd.next() * 4), x = -2 + Math.floor(rnd.next() * 11), roofRows = 2 + Math.floor(rnd.next() * 2);
    const r = tryBoard(type, rot, x, roofRows);
    if (!r) continue;
    const key = r.board.join('|');
    if (!found.has(key)) found.set(key, r);
  }
  const list = [...found.values()].sort((a, b) => (b.span - a.span) || (a.roofCount - b.roofCount) || (a.len - b.len));
  console.log('=== ' + type + ': ' + list.length + ' walls');
  const seen = new Set();
  let shown = 0;
  for (const r of list) {
    const k = r.span + ':' + r.rot + ':' + r.roofCount;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('lines ' + r.span + '  roof ' + r.roofCount + '  path ' + r.path + '\n  ' + r.board.join('\n  '));
    if (++shown >= 5) break;
  }
}
