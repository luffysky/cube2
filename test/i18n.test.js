'use strict';
// Every string must exist in all four written columns, keep its {0} placeholders in every language,
// and every key the code asks for must be defined.
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
global.window = global; global.document = undefined;
const ZZ = require('../src/engine.js');
require('../src/hans-map.js'); require('../src/i18n.js'); require('../src/bot.js'); require('../src/drills.js'); require('../src/openers.js'); require('../src/meta.js');
const L = ZZ.L;
// pull the dictionaries out of the browser-only files without running their UI code
for (const f of ['modes.js', 'shop.js', 'cloud.js']) {
  const s = src(f), a = s.indexOf('L.add({'), b = s.indexOf('});', a);
  new Function('L', s.slice(a, b + 3))(L);
}
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
const dict = {};
const origAdd = L.add;
// re-read all dictionaries to inspect raw entries
for (const f of ['i18n.js', 'modes.js', 'shop.js', 'cloud.js']) {
  const s = src(f), a = s.indexOf('L.add({'), b = s.indexOf('});', a);
  new Function('L', s.slice(a, b + 3))({ add: o => Object.assign(dict, o) });
}
const keys = Object.keys(dict);
ok(keys.length > 400, 'dictionary size ' + keys.length);
const ph = s => (s.match(/\{\d\}/g) || []).sort().join('');
for (const k of keys) {
  const e = dict[k];
  if (!Array.isArray(e) || e.length !== 4 || e.some(v => typeof v !== 'string')) { ok(false, k + ' needs four strings'); continue; }
  if (k !== 'sep' && e.some(v => !v)) ok(false, k + ' has an empty string');
  if (new Set(e.map(ph)).size !== 1) ok(false, k + ' placeholders differ: ' + e.map(ph).join(' | '));
  pass++;
}
// keys used in code
const used = new Set();
for (const f of ['ui.js', 'modes.js', 'shop.js', 'net.js', 'cloud.js']) {
  const s = src(f);
  for (const m of s.matchAll(/\bt\('([A-Za-z0-9_.\-]+)'(?!\s*\+)/g)) used.add(m[1]);   // a quote followed by + is a prefix, checked below
  for (const m of s.matchAll(/btn\('[A-Za-z]+', '([A-Za-z0-9_.\-]+)'/g)) used.add(m[1]);
  for (const m of s.matchAll(/tool\('[A-Za-z]+', '([A-Za-z0-9_.\-]+)'/g)) used.add(m[1]);
  for (const m of s.matchAll(/ul\(\[([^\]]+)\]\)/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) used.add(q[1]);
}
for (const m of src('index.template.html').matchAll(/data-ta?="([^"]+)"/g)) used.add(m[1]);
for (const k of used) ok(L.has(k), 'key used but not defined: ' + k);
// keys built at run time
const built = [];
for (let i = 0; i < 5; i++) built.push('lv' + i, 'lvn' + i);
for (let i = 1; i <= 4; i++) built.push('ln' + i);
for (let i = 1; i <= 7; i++) built.push('i' + i, 'i' + i + 't');
for (let i = 0; i < 7; i++) built.push('tier' + i);
for (let i = 0; i < 3; i++) built.push('s.pad' + i);
for (const a of ['L', 'R', 'D', 'HD', 'CW', 'CCW', '180', 'HOLD', 'ITEM', 'PAUSE', 'RESTART', 'UNDO']) built.push('a.' + a);
for (const d of ZZ.DRILLS) built.push('d.' + d.id + '.n', 'd.' + d.id + '.t');
for (const o of ZZ.OPENERS) built.push('o.' + o.id + '.n', 'o.' + o.id + '.t');
for (const j of ZZ.Meta.JOBS) built.push('j.' + j.id);
for (const kind of ['tile', 'bg', 'theme', 'fx', 'set']) for (const it of ZZ.Meta.CATALOG[kind]) built.push('c.' + kind + '.' + it.id);
for (const k of ['set', 'tile', 'bg', 'theme', 'fx', 'items', 'member']) built.push('k.' + k);
for (const w of ['score', 'win', 'draw', 'played', 'ko', 'first', 'member', 'promo', 'sprint', 'speed', 'best']) built.push('w.' + w);
for (const e of ['poor', 'have', 'no', 'max', 'setHave']) built.push('e.' + e);
for (const e of ['lib', 'server', 'room', 'full', 'lost', 'slow']) built.push('net.e.' + e);
for (const s of ['none', 'new', 'ok', 'busy', 'wait', 'gone']) built.push('cl.' + s);
for (const b of ['rp', 'score', 'sprint']) built.push('lb.' + b, 'lb.none.' + b);
for (const s of ['season', 'all']) built.push('lb.' + s);
for (const k of built) ok(L.has(k), 'run-time key not defined: ' + k);
// Simplified Chinese comes out converted
L.set('zh-Hans');
ok(L.t('m.settings') === '设置' && L.t('m.online') === '联机对战' && L.t('m.rank') === '排位赛', 'Simplified conversion: ' + [L.t('m.settings'), L.t('m.online'), L.t('m.rank')].join(' '));
ok(!/[設戰對轉機擊]/.test(keys.map(k => L.t(k)).join('')), 'no Traditional characters left in Simplified');
L.set('ja'); ok(L.t('pts', 5) === '5 点', 'placeholders fill in');
L.set('xx'); ok(['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].indexOf(L.lang) >= 0, 'unknown language falls back');
// unused keys are reported, not failed
const all = new Set([...used, ...built]);
const unused = keys.filter(k => !all.has(k));
console.log('i18n tests: ' + pass + ' passed, ' + fail + ' failed; ' + keys.length + ' keys, ' + unused.length + ' not referenced directly' + (unused.length ? ': ' + unused.slice(0, 40).join(' ') : ''));
process.exit(fail ? 1 : 0);
