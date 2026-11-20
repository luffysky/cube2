'use strict';
// Copies the game's words (server/i18n-data.json, written by build.js) into zz.i18n once per deployment, so the
// admin side can read every language and see which lines a machine translated. A line edited in the database
// (src 'admin') is never overwritten. Runs in the background of the first request a server instance gets.
const fs = require('fs'), path = require('path');
const db = require('./db.js');
const FILE = path.join(__dirname, 'i18n-data.json');
const CHUNK = 800;
let done = null;

async function push(d, data, now) {
  const have = await d.query('SELECT ver FROM zz.i18nmeta WHERE id = 1');
  if (have[0] && have[0].ver === data.ver) return { same: true };
  for (let i = 0; i < data.rows.length; i += CHUNK) {
    await d.query(`INSERT INTO zz.i18n (k, lang, text, src, zh, at)
      SELECT x.k, x.lang, x.text, x.src, x.zh, $2 FROM jsonb_to_recordset($1::jsonb) AS x(k text, lang text, text text, src text, zh text)
      ON CONFLICT (k, lang) DO UPDATE SET text = EXCLUDED.text, src = EXCLUDED.src, zh = EXCLUDED.zh, at = EXCLUDED.at
      WHERE zz.i18n.src <> 'admin' AND (zz.i18n.text, zz.i18n.src, zz.i18n.zh) IS DISTINCT FROM (EXCLUDED.text, EXCLUDED.src, EXCLUDED.zh)`,
    [JSON.stringify(data.rows.slice(i, i + CHUNK)), now]);
  }
  await d.query('INSERT INTO zz.i18nmeta (id, ver, at) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET ver = EXCLUDED.ver, at = EXCLUDED.at', [data.ver, now]);
  return { same: false, rows: data.rows.length };
}
// once per instance; failures are logged and tried again on a later request
function sync(now, log) {
  if (done || !db.configured()) return done;
  let data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { done = Promise.resolve({ none: true }); return done; }
  done = db.run(d => push(d, data, now)).then(null, e => { done = null; if (log) log('i18n', e); return { error: true }; });
  return done;
}
function reset() { done = null; }
module.exports = { sync, push, reset, FILE };
