'use strict';
/* What the server believes about a player's record.

   The record itself (coins, rating, what is owned…) is the same object the page keeps, and it is changed by the
   same code: src/meta.js. The page reports each change by name ("buy this tile", "that match ended like so") and
   this file repeats it on the server's copy. A purchase the player cannot afford, a look they do not own or a job
   that is not finished simply fails here, whatever the page claimed.

   A finished match is the one thing the server has to take on trust. It is held to what a match of that length
   can produce, and to a time allowance: matches cannot be reported faster than they could have been played.

   Everything in this file is synchronous. src/meta.js works on one shared record at a time, so no function here
   may wait for anything while it holds that record. */

const ZZ = require('../src/engine.js');
require('../src/drills.js');
require('../src/openers.js');
require('../src/meta.js');
const Meta = ZZ.Meta;

Meta.store = { getItem() { return null; }, setItem() {} };   // the server keeps records in the database, never in a browser store
Meta.onChange = null;
Meta.onOp = null;

const DAY = 86400000;
const LIMIT = {
  OPS_PER_CALL: 40,          // changes accepted in one request
  OP_IDS_KEPT: 160,          // recent change ids remembered, so a repeated request does nothing twice
  OPS_PER_HOUR: 1500,
  BUDGET_START: 15 * 60000,  // play time a new account may report straight away
  BUDGET_CAP: 8 * 3600000,   // and the most that can pile up while away (covers a long stretch offline)
  BUDGET_RATE: 1.5,          // play time earned per unit of real time
  MATCH_MIN: 20000,          // every reported match costs at least this much of the allowance
  SPRINT_MIN: 15000,         // a 40-line sprint faster than this is not believed
  IMPORT_COINS: 20000, IMPORT_RP: 900, IMPORT_ITEM: 20
};

function int(v, lo, hi) { v = Math.round(+v || 0); return v < lo ? lo : v > hi ? hi : v; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function open(state, now) {
  Meta.now = () => now;
  Meta.quiet = 0;
  return Meta.use(state && typeof state === 'object' ? state : null);
}
function seasonOf(now) { Meta.now = () => now; return Meta.seasonId(); }

// ---------- the server's own notes about a player (never sent to the page) ----------
function freshSrv(now) {
  return { ops: [], bud: LIMIT.BUDGET_START, at: now, hw: Math.floor(now / 3600000), hn: 0, rg: 0, season: '' };
}
function readSrv(srv, now) {
  const f = freshSrv(now);
  if (!srv || typeof srv !== 'object') return f;
  const out = {
    ops: Array.isArray(srv.ops) ? srv.ops.filter(x => typeof x === 'string').slice(-LIMIT.OP_IDS_KEPT) : [],
    bud: typeof srv.bud === 'number' && isFinite(srv.bud) ? srv.bud : f.bud,
    at: typeof srv.at === 'number' && isFinite(srv.at) ? srv.at : now,
    hw: typeof srv.hw === 'number' ? srv.hw : f.hw, hn: int(srv.hn, 0, 1e9),
    rg: int(srv.rg, 0, 1e9), season: typeof srv.season === 'string' ? srv.season : ''
  };
  // the allowance fills up with real time
  const waited = Math.max(0, now - out.at);
  out.bud = Math.max(0, Math.min(LIMIT.BUDGET_CAP, out.bud + waited * LIMIT.BUDGET_RATE));
  out.at = now;
  if (out.hw !== f.hw) { out.hw = f.hw; out.hn = 0; }
  return out;
}

// ---------- changes ----------
// ops: [{ i: id, k: kind, a: [arguments] }], already checked for shape by the caller.
// Gives the new record, the server's notes, one result per change and the leaderboard marks the matches earned.
function applyOps(state, srv, ops, now) {
  const d0 = open(state, now);
  srv = readSrv(srv, now);
  if (srv.season !== d0.season) { srv.season = d0.season; srv.rg = 0; }   // a new season: ranked games start from none
  const seen = new Set(srv.ops), res = [], marks = {};
  let applied = 0;
  const mark = (board, val) => { if (!(board in marks) || val > marks[board]) marks[board] = val; };
  for (const op of ops) {
    if (seen.has(op.i)) { res.push({ i: op.i, ok: true, dup: true }); continue; }
    seen.add(op.i); srv.ops.push(op.i);
    if (++srv.hn > LIMIT.OPS_PER_HOUR) { res.push({ i: op.i, ok: false, why: 'slow' }); continue; }
    let r;
    if (op.k === 'fin') r = finish(op.a, srv, mark);
    else r = Meta.run(op.k, op.a);
    applied++;
    res.push(r && r.ok ? { i: op.i, ok: true } : { i: op.i, ok: false, why: (r && r.why) || 'no' });
  }
  if (srv.ops.length > LIMIT.OP_IDS_KEPT) srv.ops = srv.ops.slice(-LIMIT.OP_IDS_KEPT);
  const d = Meta.data, list = [];
  for (const board in marks) { list.push({ board, season: d.season, val: marks[board] }, { board, season: 'all', val: marks[board] }); }
  return { state: clone(d), srv, res, marks: list, touched: applied > 0 || res.length > 0 };
}
function finish(a, srv, mark) {
  const m = Meta.cleanMatch(a[0] && typeof a[0] === 'object' ? a[0] : {});
  const sprint = m.mode === 'sprint';
  if (sprint && (m.result <= 0 || m.ms < LIMIT.SPRINT_MIN || m.stats.lines < 40)) return { ok: false, why: 'range' };
  const cost = Math.max(LIMIT.MATCH_MIN, m.ms);
  if (srv.bud < cost) return { ok: false, why: 'fast' };
  srv.bud -= cost;
  Meta.run('fin', [m]);
  if (sprint) mark('sprint', -m.ms);
  else {
    if (m.stats.score > 0) mark('score', m.stats.score);
    if (m.mode === 'rank') srv.rg++;
  }
  return { ok: true };
}
// The record as it stands right now (a new day or season may have begun since it was stored).
function current(state, now) { return clone(open(state, now)); }

// ---------- a record brought in from a device ----------
// A player may have been playing on this device before it had a cloud save. That progress is taken over once, when
// the account is made, but only what could plausibly have been earned: the record came from a browser store that
// anyone can edit. Nothing here reaches a leaderboard; those only ever take matches the server has seen itself.
function importState(raw, now) {
  const src = clone(open(raw, now)), today = Meta.dayNo();
  const d = open(null, now), C = Meta.CATALOG;
  const list = v => Array.isArray(v) ? v : [];
  const obj = v => v && typeof v === 'object' ? v : {};
  d.name = Meta.cleanName(src.name);
  d.coins = int(src.coins, 0, LIMIT.IMPORT_COINS);
  d.rp = Math.round(int(src.rp, 0, LIMIT.IMPORT_RP));
  d.peak = Math.max(d.rp, int(src.peak, 0, LIMIT.IMPORT_RP));
  d.rgames = 0;
  d.streak = int(src.streak, 0, 50);
  Meta.KINDS.forEach(kind => {
    const got = [];
    list(obj(src.owned)[kind]).forEach(id => {
      const it = typeof id === 'string' ? Meta.find(kind, id) : null;
      if (it && it.price > 0 && got.indexOf(id) < 0) got.push(id);
    });
    d.owned[kind] = got;
    const worn = obj(src.equip)[kind];
    if (typeof worn === 'string' && Meta.find(kind, worn)) d.equip[kind] = worn;
  });
  for (let i = 1; i < 8; i++) d.items[i] = int(list(src.items)[i], 0, LIMIT.IMPORT_ITEM);
  d.items[0] = 0;
  d.bring = [];
  list(src.bring).forEach(id => { if (id === Math.floor(id) && id >= 1 && id <= 7 && d.items[id] > 0 && d.bring.indexOf(id) < 0 && d.bring.length < Meta.BRING_MAX) d.bring.push(id); });
  const until = +obj(src.sub).until || 0;
  d.sub = { until: until > now ? Math.min(until, now + 30 * DAY) : 0, demo: true };
  const sd = obj(src.daily);
  if (sd.day === today) {
    d.daily.jobs.forEach(j => {
      const def = Meta.JOBS.filter(x => x.id === j.id)[0], old = list(sd.jobs).filter(x => x && x.id === j.id)[0];
      if (!def || !old) return;
      j.n = int(old.n, 0, def.need);
      j.paid = !!old.paid && j.n >= def.need;
    });
  }
  d.daily.login = sd.login === today || sd.login === today - 1 ? sd.login : 0;
  d.daily.streak = d.daily.login ? int(sd.streak, 0, 3650) : 0;
  d.daily.win = sd.win === today ? today : 0;
  const t = obj(src.tot);
  d.tot.games = int(t.games, 0, 1e6); d.tot.wins = int(t.wins, 0, d.tot.games);
  d.tot.best = int(t.best, 0, 600000);
  d.tot.sprint = t.sprint >= LIMIT.SPRINT_MIN ? int(t.sprint, LIMIT.SPRINT_MIN, 3600000) : 0;
  d.tot.tspins = int(t.tspins, 0, 1e7); d.tot.sent = int(t.sent, 0, 1e8); d.tot.kos = int(t.kos, 0, 1e7);
  d.tot.coins = int(t.coins, 0, 1e7); d.tot.online = int(t.online, 0, d.tot.games);
  const f = obj(src.first);
  list(f.drills).forEach(id => { if (Meta.firstCoin('drills', id) && d.first.drills.indexOf(id) < 0) d.first.drills.push(id); });
  list(f.openers).forEach(id => { if (typeof id === 'string' && Meta.firstCoin('openers', id) && d.first.openers.indexOf(id) < 0) d.first.openers.push(id); });
  d.note = null;
  Meta.tidy();
  return clone(d);
}

// ---------- shape checks for what arrives over the wire ----------
const OP_ID = /^[A-Za-z0-9_-]{6,24}$/;
function cleanOps(v) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > LIMIT.OPS_PER_CALL) return null;
  const out = [];
  for (const o of v) {
    if (!o || typeof o !== 'object' || typeof o.i !== 'string' || !OP_ID.test(o.i) || typeof o.k !== 'string' || Meta.OPS.indexOf(o.k) < 0 || !Array.isArray(o.a) || o.a.length > 4) return null;
    out.push({ i: o.i, k: o.k, a: o.a });
  }
  return out;
}

module.exports = { Meta, LIMIT, applyOps, current, importState, cleanOps, freshSrv, readSrv, seasonOf, clone };
