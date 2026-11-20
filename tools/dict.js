'use strict';
// The game's word lists, read straight from the source files, as written (before machine translation is added).
// Each entry is [繁體中文, English, 日本語, 한국어]; a string, or a list with an empty or missing column, means
// "only Chinese so far": tools/i18n-auto.py fills the rest into i18n/auto.json.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['i18n.js', 'modes.js', 'shop.js', 'cloud.js', 'consent.js', 'bonus.js', 'levelmode.js', 'wxmode.js', 'minis.js', 'drawer.js', 'devstore.js', 'music.js', 'games-dict.js'];
const GAMES_FILE = 'games-dict.js';    // the brick games' words: they go to games/words.js, not into 轉磚's page
const COLS = ['en', 'ja', 'ko'];           // the columns after Chinese, in order
const AUTO = path.join(ROOT, 'i18n', 'auto.json');

function raw(only) {
  const dict = {}, from = {};
  for (const f of only || FILES) {
    const s = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), a = s.indexOf('L.add({'), b = s.indexOf('});', a);
    if (a < 0) continue;
    new Function('L', s.slice(a, b + 3))({ add: o => { for (const k in o) { dict[k] = o[k]; from[k] = f; } } });
  }
  return { dict, from };
}
// the Chinese of an entry, and the columns it still lacks
function zhOf(e) { return typeof e === 'string' ? e : Array.isArray(e) ? String(e[0] || '') : ''; }
function missing(e) {
  if (typeof e === 'string') return COLS.slice();
  return COLS.filter((c, i) => typeof e[i + 1] !== 'string' || !e[i + 1]);
}
function readAuto() { try { return JSON.parse(fs.readFileSync(AUTO, 'utf8')); } catch (e) { return {}; } }
// What still needs a machine translation: a missing column with no machine text yet, or machine text made from a
// Chinese that has since changed.
function todo(dict, auto) {
  const out = [];
  for (const k of Object.keys(dict).sort()) {
    const e = dict[k], zh = zhOf(e), need = missing(e);
    if (!need.length || !zh || k === 'sep') continue;
    const a = auto[k], stale = !a || a.zh !== zh;
    const langs = stale ? need : need.filter(c => !a[c]);
    if (langs.length) out.push({ k, zh, langs });
  }
  return out;
}
// The entries with the machine text put into their empty columns: what the page uses.
function merged(dict, auto) {
  const out = {}, machine = {};
  for (const k of Object.keys(dict)) {
    const e = dict[k], need = missing(e);
    if (!need.length || k === 'sep') { out[k] = e; continue; }
    const zh = zhOf(e), a = auto[k] && auto[k].zh === zh ? auto[k] : null, row = [zh];
    COLS.forEach((c, i) => {
      const own = Array.isArray(e) && typeof e[i + 1] === 'string' && e[i + 1] ? e[i + 1] : '';
      if (own) row.push(own);
      else if (a && a[c]) { row.push(a[c]); (machine[k] = machine[k] || []).push(c); }
      else row.push(null);                // nothing yet: the page shows the Chinese
    });
    out[k] = row;
  }
  return { dict: out, machine };
}
module.exports = { ROOT, FILES, GAMES_FILE, COLS, AUTO, raw, zhOf, missing, readAuto, todo, merged };
