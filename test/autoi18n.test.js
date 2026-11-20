'use strict';
// The machine-translation path: which words need it, how machine text fills the empty columns (and stops when the
// Chinese changes or a person translates), the translator keeping blanks and tags, and the copy into the database
// (lines edited by the admin side are never overwritten).
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const D = require('../tools/dict.js');
const dbm = require('../server/db.js'), { make } = require('../tools/pglite-db.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
(async () => {
  // ---------- what needs translating ----------
  const dict = { full: ['完整', 'Full', '完全', '완전'], only: '只有中文 {0}', part: ['一部分', 'Part'], blank: ['空白', '', '', ''], sep: ['', '', '', ''] };
  eq(D.missing(dict.full), [], 'a full entry needs nothing');
  eq(D.missing(dict.only), ['en', 'ja', 'ko'], 'Chinese only: three columns');
  eq(D.missing(dict.part), ['ja', 'ko'], 'missing columns at the end');
  eq(D.missing(dict.blank), ['en', 'ja', 'ko'], 'empty strings count as missing');
  let todo = D.todo(dict, {});
  eq(todo.map(x => x.k + ':' + x.langs.join('')), ['blank:enjako', 'only:enjako', 'part:jako'], 'the list, without full entries or the separator');
  const auto = { only: { zh: '只有中文 {0}', en: 'Chinese only {0}', ja: '中国語のみ {0}', ko: '중국어만 {0}' } };
  eq(D.todo(dict, auto).map(x => x.k), ['blank', 'part'], 'machine text already there: not asked again');
  eq(D.todo({ only: '改過的中文 {0}' }, auto).map(x => x.k), ['only'], 'the Chinese changed: translated again');
  let m = D.merged(dict, auto);
  eq(m.dict.only, ['只有中文 {0}', 'Chinese only {0}', '中国語のみ {0}', '중국어만 {0}'], 'machine text fills the empty columns');
  eq(m.machine.only, ['en', 'ja', 'ko'], 'and is marked as machine text');
  eq(m.dict.part, ['一部分', 'Part', null, null], 'nothing yet: left empty, so the page shows the Chinese');
  eq(m.dict.full, dict.full, 'a full entry is untouched');
  m = D.merged({ only: ['只有中文 {0}', 'Written by hand {0}'] }, auto);
  eq(m.dict.only, ['只有中文 {0}', 'Written by hand {0}', '中国語のみ {0}', '중국어만 {0}'], 'a column a person wrote wins over the machine');
  eq(m.machine.only, ['ja', 'ko'], 'only the machine columns are marked');
  m = D.merged({ only: '改過的中文 {0}' }, auto);
  eq(m.dict.only, ['改過的中文 {0}', null, null, null], 'stale machine text (the Chinese changed) is not used');

  // ---------- the translator, with the test engine (no models needed) ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zz-i18n-'));
  fs.writeFileSync(path.join(dir, 'todo.json'), JSON.stringify([{ k: 'a', zh: '你好 {0}，<b>{1}</b> 金幣', langs: ['en', 'ja', 'ko'] }, { k: 'b', zh: '再見', langs: ['ko'] }]));
  fs.writeFileSync(path.join(dir, 'auto.json'), JSON.stringify({ b: { zh: '再見', en: 'Bye', ja: 'さようなら' } }));
  const outp = execFileSync('python3', [path.join(__dirname, '..', 'tools', 'i18n-auto.py'), '--engine', 'mark'], { env: Object.assign({}, process.env, { I18N_DIR: dir }) }).toString();
  const got = JSON.parse(fs.readFileSync(path.join(dir, 'auto.json'), 'utf8'));
  ok(/2 machine-translated/.test(outp), 'two words translated', outp);
  ok(got.a.en.includes('{0}') && got.a.en.includes('{1}') && got.a.en.includes('<b>') && got.a.ja.includes('{1}') && got.a.ko.includes('</b>'), 'blanks and tags survive in every language', got.a);
  ok(got.a.zh === '你好 {0}，<b>{1}</b> 金幣' && got.a.by === 'mark' && /^\d{4}-\d\d-\d\d$/.test(got.a.at), 'each line says what it came from, by what, and when', got.a);
  ok(got.b.en === 'Bye' && got.b.ja === 'さようなら' && got.b.ko && got.b.ko.startsWith('[ko]'), 'a word missing one column: only that column is added, from the English already there', got.b);
  fs.rmSync(dir, { recursive: true, force: true });

  // ---------- the repository itself ----------
  const real = D.raw().dict;
  // (words may wait between a push and the translate workflow's commit; it is listed, not failed)
  const waiting = D.todo(real, D.readAuto());
  ok(waiting.every(x => x.zh && x.langs.length), 'the waiting list is well formed', waiting);

  // ---------- into the database ----------
  const words = require('../server/words.js');
  const pg = make(); dbm.use(pg);
  const data = { ver: 'v1', rows: [{ k: 'x', lang: 'en', text: 'One', src: 'machine', zh: '一' }, { k: 'x', lang: 'ja', text: '一つ', src: 'machine', zh: '一' }] };
  await dbm.run(d => words.push(d, data, 1000));
  let rows = await pg.query('SELECT k, lang, text, src FROM zz.i18n ORDER BY lang');
  eq(rows.map(r => r.lang + ':' + r.text + ':' + r.src), ['en:One:machine', 'ja:一つ:machine'], 'the words are copied in');
  await pg.query("UPDATE zz.i18n SET text = 'Uno', src = 'admin' WHERE lang = 'en'");
  data.ver = 'v2'; data.rows[0].text = 'One!'; data.rows[1].text = 'ひとつ';
  await dbm.run(d => words.push(d, data, 2000));
  rows = await pg.query('SELECT lang, text, src FROM zz.i18n ORDER BY lang');
  eq(rows.map(r => r.lang + ':' + r.text + ':' + r.src), ['en:Uno:admin', 'ja:ひとつ:machine'], 'a new build updates the rest but never an admin edit');
  const r = await dbm.run(d => words.push(d, data, 3000));
  ok(r.same === true, 'the same build again does nothing');
  eq((await pg.query('SELECT ver FROM zz.i18nmeta'))[0].ver, 'v2', 'the version on record');
  const file = JSON.parse(fs.readFileSync(words.FILE, 'utf8'));
  ok(file.rows.length > 4000 && file.rows.every(x => x.k && x.lang && typeof x.text === 'string' && ['human', 'machine', 'hans', 'zh'].includes(x.src)), 'the build wrote every word in five languages', file.rows.length);
  console.log('auto i18n tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
