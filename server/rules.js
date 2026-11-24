'use strict';
/* What the server believes about a player's record.

   The record itself (coins, rating, what is owned…) is the same object the page keeps, and it is changed by the
   same code: src/meta.js. The page reports each change by name ("buy this tile", "that match ended like so") and
   this file repeats it on the server's copy. A purchase the player cannot afford, a look they do not own or a job
   that is not finished simply fails here, whatever the page claimed.

   A finished match comes with a tape of what the player's side did (src/replay.js). The server plays the tape
   through the rules and compares: the reported lines, twists and score have to be what those moves produce. A
   ranked match or a sprint without a tape that checks out is not counted at all, and only checked matches reach
   the score board. What the tape cannot show is the other side (how often the rival went down), so that part is
   still held to what a match of that length can produce, and to a time allowance: matches cannot be reported
   faster than they could have been played.

   Everything in this file is synchronous. src/meta.js works on one shared record at a time, so no function here
   may wait for anything while it holds that record. */

const ZZ = require('../src/engine.js');
require('../src/drills.js');
require('../src/openers.js');
require('../src/levels.js');
require('../src/meta.js');
require('../src/replay.js');
const Meta = ZZ.Meta;

Meta.store = { getItem() { return null; }, setItem() {} };   // the server keeps records in the database, never in a browser store
Meta.onChange = null;
Meta.onOp = null;
// treasure boxes are opened here, with the operating system's randomness
Meta.remote = null;
Meta.rand = () => require('crypto').randomInt(0, 2 ** 32) / 2 ** 32;

const DAY = 86400000;
const LIMIT = {
  OPS_PER_CALL: 40,          // changes accepted in one request
  OP_IDS_KEPT: 160,          // recent change ids remembered, so a repeated request does nothing twice
  OPS_PER_HOUR: 1500,
  BUDGET_START: 15 * 60000,  // play time a new account may report straight away
  BUDGET_CAP: 8 * 3600000,   // and the most that can pile up while away (covers a long stretch offline)
  BUDGET_RATE: 1.5,          // play time earned per unit of real time
  MATCH_MIN: 20000,          // every reported match costs at least this much of the allowance
  TAPE_BYTES: 20000,         // the longest tape accepted with one match
  SEEDS_KEPT: 80,            // recent matches remembered, so the same tape cannot be handed in twice
  SPRINT_MIN: 15000,         // a 40-line sprint faster than this is not believed
  IMPORT_COINS: 20000, IMPORT_RP: 900, IMPORT_ITEM: 20, IMPORT_ITEMS: 80, IMPORT_XP: 5000, LEVEL_MIN: 5000
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
  return { ops: [], bud: LIMIT.BUDGET_START, at: now, hw: Math.floor(now / 3600000), hn: 0, rg: 0, season: '', seeds: [] };
}
function readSrv(srv, now) {
  const f = freshSrv(now);
  if (!srv || typeof srv !== 'object') return f;
  const out = {
    ops: Array.isArray(srv.ops) ? srv.ops.filter(x => typeof x === 'string').slice(-LIMIT.OP_IDS_KEPT) : [],
    bud: typeof srv.bud === 'number' && isFinite(srv.bud) ? srv.bud : f.bud,
    at: typeof srv.at === 'number' && isFinite(srv.at) ? srv.at : now,
    hw: typeof srv.hw === 'number' ? srv.hw : f.hw, hn: int(srv.hn, 0, 1e9),
    rg: int(srv.rg, 0, 1e9), season: typeof srv.season === 'string' ? srv.season : '',
    seeds: Array.isArray(srv.seeds) ? srv.seeds.filter(x => typeof x === 'number').slice(-LIMIT.SEEDS_KEPT) : []
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
  const before = state && typeof state === 'object' && typeof state.coins === 'number' ? state.coins : null;
  const d0 = open(state, now);
  srv = readSrv(srv, now);
  // the coin ledger: every change to the balance, worked out here from what the rules did (the page never writes it)
  const ledger = [];
  let bal = d0.coins;
  const note = (key, kind, why) => { const c = Meta.data.coins; if (c !== bal) { ledger.push({ key, kind, why: why || '', delta: c - bal, bal: c, at: now }); bal = c; } };
  if (before !== null && before !== bal) { ledger.push({ key: 'sys:' + now, kind: 'system', why: 'day', delta: bal - before, bal, at: now }); }
  if (srv.season !== d0.season) { srv.season = d0.season; srv.rg = 0; }   // a new season: ranked games start from none
  const seen = new Set(srv.ops), res = [], marks = {}, draws = [], matches = [];
  let applied = 0;
  const mark = (board, val) => { if (!(board in marks) || val > marks[board]) marks[board] = val; };
  for (const op of ops) {
    if (seen.has(op.i)) { res.push({ i: op.i, ok: true, dup: true }); continue; }
    seen.add(op.i); srv.ops.push(op.i);
    if (++srv.hn > LIMIT.OPS_PER_HOUR) { res.push({ i: op.i, ok: false, why: 'slow' }); continue; }
    let r;
    if (op.k === 'fin') { r = finish(op.a, srv, mark); if (r.ok) matches.push(Object.assign({ at: now }, r.rec)); }
    else if (op.k === 'lvl') {
      // a level takes real time to play: about a third of a second a piece at the very least
      const cost = Math.max(LIMIT.LEVEL_MIN, (Math.floor(+(op.a && op.a[1])) || 0) * 330);
      if (srv.bud < cost) r = { ok: false, why: 'fast' };
      else {
        r = Meta.run(op.k, op.a);
        if (r && r.ok) { srv.bud -= cost; mark('lvs', String(Meta.data.lv.stars || '').split('').reduce((n, c) => n + (+c || 0), 0)); }
      }
    }
    else if (op.k === 'rpg') {
      // an adventure stage: a monster takes time to beat, at least 20 s and a third of a second a piece
      const cost = Math.max(20000, (Math.floor(+(op.a && op.a[1])) || 0) * 330);
      if (srv.bud < cost) r = { ok: false, why: 'fast' };
      else { r = Meta.run(op.k, op.a); if (r && r.ok) srv.bud -= cost; }
    }
    else if (op.k === 'endless') {
      // the endless run: its best stage goes on the board only if there was time to play that far (15 s a stage)
      r = Meta.run(op.k, op.a);
      const stage = Math.max(0, Math.min(999, Math.floor(+(op.a && op.a[0])) || 0)), cost = Math.max(LIMIT.LEVEL_MIN, stage * 15000);
      if (r && r.ok && stage > 0 && srv.bud >= cost) { srv.bud -= cost; mark('lve', stage); }
    }
    else if (op.k === 'wx') {
      // a weather run is paid by how long it lasted, so it has to have taken that long
      const sec = Math.max(0, Math.floor(+(op.a && op.a[0])) || 0), cost = Math.max(LIMIT.LEVEL_MIN, sec * 1000);
      if (srv.bud < cost) r = { ok: false, why: 'fast' };
      else { r = Meta.run(op.k, op.a); if (r && r.ok) { srv.bud -= cost; const sc = Math.min(Math.max(0, Math.floor(+op.a[2]) || 0), sec * 3000 + 5000); if (op.a[3] !== 1 && sc > 0) mark('wx', sc); } }
    }
    else if (op.k === 'wxb') {
      // a weather battle lasts minutes: storm points cannot be reported faster than battles can be played
      if (srv.bud < LIMIT.MATCH_MIN) r = { ok: false, why: 'fast' };
      else { r = Meta.run(op.k, op.a); if (r && r.ok) { srv.bud -= LIMIT.MATCH_MIN; mark('wxr', Meta.data.lv.wxr); } }
    }
    else if (op.k === 'mini') {
      // a brick game: it cannot have taken less time than it says, and the time comes out of the allowance
      const ms = Math.max(0, Math.floor(+(op.a && op.a[4])) || 0), cost = Math.max(3000, ms);
      if (srv.bud < cost) r = { ok: false, why: 'fast' };
      else {
        r = Meta.run(op.k, op.a);
        if (r && r.ok) { srv.bud -= cost; miniMark(op.a, ms, mark); }
      }
    }
    else if (op.k === 'sub' && !trialOpen()) r = { ok: false, why: 'pay' };
    // a paid membership ends at SnowRealm's payment service, not from the page
    else if (op.k === 'unsub' && Meta.data.sub && Meta.data.sub.demo === false) r = { ok: false, why: 'pay' };
    else if (op.srv) { r = Meta.runServer(op.k, op.a); if (op.k === 'pvp' && r && r.ok) mark('prp', Meta.data.pvp.rp); }    // only ever set by the server itself (cleanOps drops it)
    else r = Meta.run(op.k, op.a);
    note(op.i, op.k, op.k === 'fin' && r && r.rec ? r.rec.mode : op.k === 'buy' || op.k === 'set' || op.k === 'item' || op.k === 'job' ? String(op.a && op.a[0] != null ? op.a[0] : '').slice(0, 20) : '');
    if (op.k === 'draw' && r && r.ok && r.out && r.out.boxes) draws.push({ at: now, kind: 'box', boxes: r.out.boxes });
    if ((op.k === 'wheel' || op.k === 'slot') && r && r.ok && r.out && r.out.got) draws.push({ at: now, kind: op.k, boxes: [{ grade: r.out.seg || r.out.out, got: r.out.got }] });
    applied++;
    res.push(r && r.ok ? { i: op.i, ok: true } : { i: op.i, ok: false, why: (r && r.why) || 'no' });
  }
  if (srv.ops.length > LIMIT.OP_IDS_KEPT) srv.ops = srv.ops.slice(-LIMIT.OP_IDS_KEPT);
  const d = Meta.data, list = [];
  for (const board in marks) { list.push({ board, season: d.season, val: marks[board] }, { board, season: 'all', val: marks[board] }); }
  return { state: clone(d), srv, res, marks: list, draws, matches, ledger, touched: applied > 0 || res.length > 0 };
}
// The brick games' boards: a score per game and difficulty (no faster than MINI_RATE points a second could be made),
// a time per game and difficulty (kept as a negative number, so higher is better like every other board), and the
// stars of a level game added up.
const MINI_RATE = 1500;
function miniMark(a, ms, mark) {
  const game = a && a[0], G = Meta.MINI_INFO && Meta.MINI_INFO[game];
  if (!G) return;
  const lv = Math.max(0, Math.min(2, Math.floor(+a[1]) || 0)), v = Math.max(0, Math.floor(+a[2]) || 0);
  if (G.kind === 'score' && v > 0 && v <= ms / 1000 * MINI_RATE + 500) mark('m_' + game + '_' + lv, v);
  else if (G.kind === 'time' && v >= 1000 && v <= ms + 2000) mark('m_' + game + '_' + lv, -v);
  else if (G.kind === 'levels') mark('m_' + game, String(Meta.data.mini[game] || '').split('').reduce((n, c) => n + (+c || 0), 0));
}
// Does the tape back up what the match report says? Gives what the tape shows, or null.
function proven(m, tape, srv) {
  if (!tape || typeof tape !== 'object') return null;
  let size = 0;
  try { size = JSON.stringify(tape).length; } catch (e) { return null; }
  if (size > LIMIT.TAPE_BYTES || srv.seeds.indexOf(tape.seed) >= 0) return null;
  const v = ZZ.Replay.check(tape);
  if (!v) return null;
  const st = m.stats, sprint = m.mode === 'sprint';
  if (v.pieces !== st.pieces || v.lines !== st.lines || v.spins !== st.spins || v.tst !== st.tst || v.minis !== st.minis || v.xspins !== st.xspins || v.quads !== st.quads || v.maxCombo !== st.maxCombo) return null;
  if (v.ms > m.ms + 500 || v.pieces > 12 + (m.ms / 1000) * 6) return null;                 // moves made after the end, or faster than hands can go
  // beyond what the moves score: up to two points a row for dropping a piece, and 1500 for each time the rival went down
  if (st.score > v.score + 44 * v.pieces + 1500 * m.ko) return null;
  if (sprint) return v.lines >= 40 && v.kos === 0 ? v : null;
  if (st.sent > v.attack || m.koOpp !== v.kos || m.ko > 1 + Math.floor(m.ms / 5000)) return null;
  if (m.result > 0 && m.ko < m.koOpp && m.seats <= 2) return null;                        // fewer knockouts than the rival is not a win (a room of more is won on places)
  return v;
}
function finish(a, srv, mark) {
  const m = Meta.cleanMatch(a[0] && typeof a[0] === 'object' ? a[0] : {});
  const sprint = m.mode === 'sprint';
  if (sprint && (m.result <= 0 || m.ms < LIMIT.SPRINT_MIN || m.stats.lines < 40)) return { ok: false, why: 'range' };
  const tape = a[1], v = proven(m, tape, srv);
  if (!v && (sprint || m.mode === 'rank')) return { ok: false, why: 'proof' };
  const cost = Math.max(LIMIT.MATCH_MIN, m.ms);
  if (srv.bud < cost) return { ok: false, why: 'fast' };
  srv.bud -= cost;
  if (v) { srv.seeds.push(tape.seed); if (srv.seeds.length > LIMIT.SEEDS_KEPT) srv.seeds = srv.seeds.slice(-LIMIT.SEEDS_KEPT); }
  Meta.run('fin', [m]);
  if (sprint) mark('sprint', -m.ms);
  else {
    if (v && m.stats.score > 0) mark('score', m.stats.score);
    if (m.mode === 'rank') srv.rg++;
  }
  // one line for the match log: what was reported, and whether the piece placements backed it up
  const st = m.stats;
  return { ok: true, rec: { mode: m.mode, result: m.result, proven: !!v, room: m.room, seats: m.seats,
    data: { level: m.level, ms: m.ms, ko: m.ko, koOpp: m.koOpp, score: st.score, sent: st.sent, lines: st.lines, pieces: st.pieces, spins: st.spins,
    minis: st.minis, xspins: st.xspins, tst: st.tst, quads: st.quads, maxCombo: st.maxCombo, place: m.place, tw: m.tower, ry: m.royale, rl: m.relay, tr: m.terr, as: m.assists, kr: m.koRoom, items: m.itemsUsed, team: m.team, quick: m.quick, pr: m.pr } } };
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
  d.xp = int(src.xp, 0, LIMIT.IMPORT_XP);
  // level progress comes along (it only opens levels; the coins for them were paid on the device)
  d.lv = { stars: String(obj(src.lv).stars || '').replace(/[^0-3]/g, '').slice(0, 1000), endless: int(obj(src.lv).endless, 0, 999), wx: 0, wxs: 0, wxr: 0 };      // titles are not brought in: they are earned where the server can see it
  d.titles = []; d.title = '';
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
  // site themes bought with coins come along; the Steam unlock never does (only the server sets it)
  d.owned.site = list(obj(src.owned).site).filter((id, i, a) => typeof id === 'string' && Meta.SITE.some(t => t.id === id && t.tier === 'coin') && a.indexOf(id) === i);
  if (typeof obj(src.equip).site === 'string') d.equip.site = obj(src.equip).site;
  d.steam = false;
  // each kind held to IMPORT_ITEM, and all of them together to IMPORT_ITEMS (there are 200 kinds)
  let itemsLeft = LIMIT.IMPORT_ITEMS;
  for (let i = 1; i < Meta.ITEM_PRICE.length; i++) { const n = Math.min(int(list(src.items)[i], 0, LIMIT.IMPORT_ITEM), itemsLeft); d.items[i] = n; itemsLeft -= n; }
  d.items[0] = 0;
  d.bring = [];
  list(src.bring).forEach(id => { if (id === Math.floor(id) && id >= 1 && id < Meta.ITEM_PRICE.length && d.items[id] > 0 && d.bring.indexOf(id) < 0 && d.bring.length < Meta.BRING_MAX) d.bring.push(id); });
  // a membership the device says it has is not brought in (it is never the page's to grant)
  const until = trialOpen() ? +obj(src.sub).until || 0 : 0;
  d.sub = { until: until > now ? Math.min(until, now + 30 * DAY) : 0, demo: true };
  const sd = obj(src.daily);
  if (sd.day === today) {
    // the wave the device was on today comes along, or remaking a cloud save would start the day's waves over
    const w = int(sd.wave, 1, Meta.WAVE.max);
    if (w > 1) { d.daily.wave = w; d.daily.jobs = Meta.pickWave(today, w); }
    d.daily.waveNext = w === 2 ? Math.min(now + Meta.WAVE.wait, Math.max(0, +sd.waveNext || 0)) : 0;
    d.daily.jobs.forEach(j => {
      const def = Meta.JOBS.filter(x => x.id === j.id)[0], old = list(sd.jobs).filter(x => x && x.id === j.id)[0];
      if (!def || !old) return;
      j.n = int(old.n, 0, def.need);
      j.paid = !!old.paid && j.n >= def.need;
    });
  }
  d.daily.login = sd.login === today || sd.login === today - 1 ? sd.login : 0;
  // this month's sign-in sheet comes along (days already ticked, goals already paid), nothing from other months
  const ss = obj(src.sign), mm = Meta.monthOf(today);
  if (ss.m === mm.m) {
    d.sign = { m: mm.m, days: list(ss.days).filter((x, i, a) => x === Math.floor(x) && x >= 1 && x <= mm.d && a.indexOf(x) === i), paid: [] };
    // a goal the brought-in days already reach counts as paid: ticks made on the device never pay twice
    Meta.SIGN_GOALS.forEach((g, i) => { if (d.sign.days.length >= (g.n || mm.len)) d.sign.paid.push(i); });
  }
  d.daily.streak = d.daily.login ? int(sd.streak, 0, 3650) : 0;
  d.daily.win = sd.win === today ? today : 0;
  // boxes already opened today come along, or deleting and remaking a cloud save would hand out a fresh day of boxes
  d.daily.draws = sd.day === today ? int(sd.draws, 0, Meta.DRAWS.sub) : 0;
  d.daily.ads = sd.day === today ? int(sd.ads, 0, Meta.ADS.perDay) : 0;
  d.daily.wheel = sd.day === today ? int(sd.wheel, 0, Meta.WHEEL_FREE.sub) : 0;
  d.daily.slot = sd.day === today ? int(sd.slot, 0, Meta.SLOT.perDay) : 0;
  d.daily.mini = sd.day === today ? int(sd.mini, 0, 300) : 0;
  // brick-game progress comes along: stars and bests only open things up; their coins were paid on the device
  if (src.mini && typeof src.mini === 'object') d.mini = src.mini;
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

// Membership is never started by the page on a real server: no payment is wired up yet, and the old free 30-day
// trial (the page's 'sub' op) is turned away. Only a test or local setup can open it (MEMBER_TRIAL=1, never in
// production). Paid membership will come from SnowRealm's central entitlement service, set by the server only.
function trialOpen(env) { env = env || process.env; return env.MEMBER_TRIAL === '1' && env.VERCEL_ENV !== 'production'; }

// ---------- shape checks for what arrives over the wire ----------
const OP_ID = /^[A-Za-z0-9_-]{6,24}$/;
function cleanOps(v) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > LIMIT.OPS_PER_CALL) return null;
  const out = [];
  for (const o of v) {
    if (!o || typeof o !== 'object' || typeof o.i !== 'string' || !OP_ID.test(o.i) || typeof o.k !== 'string' || Meta.OPS.indexOf(o.k) < 0 || !Array.isArray(o.a) || o.a.length > 5) return null;
    out.push({ i: o.i, k: o.k, a: o.a });
  }
  return out;
}

module.exports = { ZZ, Meta, LIMIT, trialOpen, applyOps, current, importState, cleanOps, freshSrv, readSrv, seasonOf, clone };
