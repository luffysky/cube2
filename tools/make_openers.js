'use strict';
/* Turns search results from tools/find_opener.js into src/openers.js.
   Usage: node tools/make_openers.js tsd.json:1 pc.json:0 dt.json:0   (file:index of the result to keep) */
const fs = require('fs'), path = require('path');
const META = { tsd: { coin: 40 }, pc: { coin: 50 }, dt: { coin: 80 } };
const out = [];
for (const arg of process.argv.slice(2)) {
  const [file, idx] = arg.split(':');
  const r = JSON.parse(fs.readFileSync(file, 'utf8'))[+idx || 0];
  const id = r.name.split(' ')[0];
  const steps = r.steps.map(s => [s.type, s.x, s.y, s.rot]).concat(r.finish.map(s => [s.type, s.x, s.y, s.rot, s.spin, s.lines]));
  out.push({ id: id, coin: META[id].coin, queue: steps.map(s => s[0]), steps: steps });
}
const body = '/* Opening lessons: a fixed queue and where every piece goes. Found by tools/find_opener.js, written by tools/make_openers.js.\n' +
  '   steps: [piece, x, y, rotation] and, for the piece that finishes the lesson, [piece, x, y, rotation, spin, lines]. */\n' +
  '(function (root) {\n  var ZZ = root.ZZ || require(\'./engine.js\');\n  ZZ.OPENERS = [\n' +
  out.map(o => '    { id: \'' + o.id + '\', coin: ' + o.coin + ', queue: ' + JSON.stringify(o.queue).replace(/"/g, '\'') + ',\n      steps: ' + JSON.stringify(o.steps).replace(/"/g, '\'') + ' }').join(',\n') +
  '\n  ];\n  if (typeof module !== \'undefined\' && module.exports) module.exports = ZZ;\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'openers.js'), body);
console.log(out.map(o => o.id + ':' + o.queue.length).join(' '));
