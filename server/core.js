'use strict';
/* Accounts, cloud saves and leaderboards: everything that talks to the database.

   An account has no email and no password. A device holds a random id and a random secret; the database keeps only
   a hash of the secret, so a copy of the database does not let anyone sign in. A second device joins an account
   with a short one-time code that the first device asks for. */

const crypto = require('crypto');
const rules = require('./rules.js');
const DAY = 86400000;

const LIMIT = {
  NEW_PER_IP_DAY: 40,
  GONE_KEEP: 30 * 86400000,       // a deleted save is kept this long before it is really removed
  MATCHES_KEEP: 365 * 86400000,   // the match log is kept a year        // accounts one address may create in a day
  CODE_TRIES: 12, CODE_WINDOW: 10 * 60000,   // code guesses one address may make in ten minutes
  CODE_TTL: 10 * 60000,
  DEVICES: 5,                // devices kept on one account; the oldest drops off
  BOARD_ROWS: 50,
  SAVE_TRIES: 4
};
const BOARDS = { rp: 1, score: 1, sprint: 1, wx: 1, wxr: 1 };
const TITLE_ID = /^[a-z0-9]{1,12}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1: nothing to misread
const PUB_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';

const sha = s => crypto.createHash('sha256').update(String(s)).digest('base64url');
function pick(abc, n) { let s = ''; for (let i = 0; i < n; i++) s += abc[crypto.randomInt(abc.length)]; return s; }
const newSecret = () => crypto.randomBytes(32).toString('base64url');
function fail(status, why, extra) { return Object.assign({ status, body: Object.assign({ ok: false, why }, extra || {}) }); }
function good(body) { return { status: 200, body: Object.assign({ ok: true }, body) }; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, SECRET = /^[A-Za-z0-9_-]{43}$/;
// "Bearer <id>.<secret>" → { id, hash } or null
function readCred(header) {
  if (typeof header !== 'string' || header.length > 120 || header.slice(0, 7) !== 'Bearer ') return null;
  const s = header.slice(7), dot = s.indexOf('.');
  if (dot < 0) return null;
  const id = s.slice(0, dot), secret = s.slice(dot + 1);
  if (!UUID.test(id) || !SECRET.test(secret)) return null;
  return { id, hash: sha(secret) };
}

// Counts one more use of something inside a time window and says how many that makes.
async function bump(db, what, who, windowMs, now) {
  const slot = Math.floor(now / windowMs), key = what + ':' + who + ':' + slot;
  const rows = await db.query(
    'INSERT INTO zz.rate (k, n, exp) VALUES ($1, 1, $2) ON CONFLICT (k) DO UPDATE SET n = zz.rate.n + 1 RETURNING n',
    [key, (slot + 2) * windowMs]);
  return rows[0].n;
}
async function findPlayer(db, cred) {
  const rows = await db.query(
    'SELECT p.id, p.pub, p.state, p.srv, p.ver FROM zz.keys k JOIN zz.players p ON p.id = k.pid WHERE k.hash = $1 AND p.id = $2 AND p.gone IS NULL',
    [cred.hash, cred.id]);
  return rows[0] || null;
}
const INSERT_PLAYER = 'INSERT INTO zz.players (id, pub, name, state, srv, rp, season, made, seen) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $8)';

// ---------- a new account ----------
async function hello(db, body, ip, now) {
  if (await bump(db, 'new', ip, DAY, now) > LIMIT.NEW_PER_IP_DAY) return fail(429, 'slow');
  const state = rules.importState(body.st, now), secret = newSecret();
  for (let tries = 0; ; tries++) {
    const id = crypto.randomUUID(), pub = pick(PUB_ABC, 8);
    try {
      await db.batch([
        [INSERT_PLAYER, [id, pub, state.name, JSON.stringify(state), JSON.stringify(rules.freshSrv(now)), state.rp, state.season, now]],
        ['INSERT INTO zz.keys (hash, pid, made) VALUES ($1, $2, $3)', [sha(secret), id, now]],
        ["INSERT INTO zz.ledger (pid, key, kind, why, delta, bal, at) VALUES ($1, 'open', 'open', $2, $3, $3, $4)", [id, body.st ? 'import' : 'new', state.coins, now]],
        ['DELETE FROM zz.rate WHERE exp < $1', [now]],
        ['DELETE FROM zz.matches WHERE at < $1', [now - LIMIT.MATCHES_KEEP]],
        // saves deleted by their players more than 30 days ago go for good (their keys, scores and links with them)
        ['DELETE FROM zz.players WHERE gone IS NOT NULL AND gone < $1', [now - LIMIT.GONE_KEEP]]
      ]);
      return good({ id, key: secret, pub, st: state, ver: 1, now });
    } catch (e) {
      if (e && e.code === '23505' && tries < 3) continue;   // the public tag was taken: draw another
      throw e;
    }
  }
}

// ---------- load the record, apply what the page reports, save ----------
const SAVE = `
  WITH u AS (
    UPDATE zz.players SET state = $3::jsonb, srv = $4::jsonb, ver = ver + 1, name = $5, rp = $6, season = $7, rg = $8, seen = $9
    WHERE id = $1 AND ver = $2 RETURNING id
  ), s AS (
    INSERT INTO zz.scores (pid, board, season, val, at)
    SELECT u.id, m.board, m.season, m.val, $9 FROM u, jsonb_to_recordset($10::jsonb) AS m(board text, season text, val integer)
    ON CONFLICT (pid, board, season) DO UPDATE SET val = EXCLUDED.val, at = EXCLUDED.at WHERE EXCLUDED.val > zz.scores.val
    RETURNING 1
  ), l AS (
    INSERT INTO zz.ledger (pid, key, kind, why, delta, bal, at)
    SELECT u.id, x.key, x.kind, x.why, x.delta, x.bal, x.at FROM u, jsonb_to_recordset($11::jsonb) AS x(key text, kind text, why text, delta integer, bal integer, at float8)
    ON CONFLICT (pid, key) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM u) AS saved`;
// A reward the ad network has vouched for (server/ads.js checked the signature): pay it once, to the player whose
// public tag the ad carried. Answers ok even when nothing is paid (already paid, or none left today), so the network
// stops retrying.
async function adReward(db, tag, tx, now) {
  if ((await db.query('SELECT 1 FROM zz.adtx WHERE tx = $1', [tx])).length) return good({ paid: false, why: 'dup' });
  for (let tries = 0; tries < LIMIT.SAVE_TRIES; tries++) {
    const rows = await db.query('SELECT id, pub, state, srv, ver FROM zz.players WHERE pub = $1 AND NOT ban AND gone IS NULL', [tag]);
    const row = rows[0];
    if (!row) return good({ paid: false, why: 'who' });
    const out = rules.applyOps(row.state, row.srv, [{ i: 'ad:' + tx.slice(0, 60), k: 'adGrant', a: [], srv: true }], now), d = out.state;
    const paid = !!(out.res[0] && out.res[0].ok && !out.res[0].dup);
    const saved = await db.query(SAVE, [row.id, row.ver, JSON.stringify(d), JSON.stringify(out.srv), d.name, d.rp, d.season, out.srv.rg, now, JSON.stringify(out.marks), JSON.stringify(out.ledger)]);
    if (saved[0] && saved[0].saved === 1) {
      await db.query('INSERT INTO zz.adtx (tx, pid, at, paid) VALUES ($1, $2, $3, $4) ON CONFLICT (tx) DO NOTHING', [tx, row.id, now, paid]);
      return good({ paid, why: paid ? '' : (out.res[0] && out.res[0].why) || 'no' });
    }
  }
  return fail(409, 'busy');
}
async function sync(db, cred, ops, now) {
  for (let tries = 0; tries < LIMIT.SAVE_TRIES; tries++) {
    const row = await findPlayer(db, cred);
    if (!row) return fail(401, 'auth');
    if (!ops.length) return good({ st: rules.current(row.state, now), ver: row.ver, pub: row.pub, res: [], now });
    const out = rules.applyOps(row.state, row.srv, ops, now), d = out.state;
    const saved = await db.query(SAVE, [row.id, row.ver, JSON.stringify(d), JSON.stringify(out.srv), d.name, d.rp, d.season, out.srv.rg, now, JSON.stringify(out.marks), JSON.stringify(out.ledger)]);
    if (saved[0] && saved[0].saved === 1) {
      if (out.matches.length) await db.query('INSERT INTO zz.matches (pid, at, mode, result, proven, room, seats, data) SELECT $1, (x->>\'at\')::float8, x->>\'mode\', (x->>\'result\')::smallint, (x->>\'proven\')::boolean, x->>\'room\', (x->>\'seats\')::smallint, x->\'data\' FROM jsonb_array_elements($2::jsonb) AS x', [row.id, JSON.stringify(out.matches)]);
      if (out.draws.length) await db.query('INSERT INTO zz.draws (pid, at, kind, boxes) SELECT $1, (x->>\'at\')::float8, x->>\'kind\', x->\'boxes\' FROM jsonb_array_elements($2::jsonb) AS x', [row.id, JSON.stringify(out.draws)]);
      return good({ st: d, ver: row.ver + 1, pub: row.pub, res: out.res, now });
    }
    // another device saved in between: read again and repeat on top of that
  }
  return fail(409, 'busy');
}

// ---------- moving to another device ----------
function showCode(c) { return c.slice(0, 4) + '-' + c.slice(4); }
function readCode(v) {
  if (typeof v !== 'string' || v.length > 24) return '';
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 ? c : '';
}
async function makeCode(db, cred, now) {
  const row = await findPlayer(db, cred);
  if (!row) return fail(401, 'auth');
  const code = pick(CODE_ABC, 8), exp = now + LIMIT.CODE_TTL;
  await db.batch([
    ['DELETE FROM zz.codes WHERE pid = $1 OR exp < $2', [row.id, now]],
    ['INSERT INTO zz.codes (hash, pid, exp) VALUES ($1, $2, $3)', [sha(code), row.id, exp]]
  ]);
  return good({ code: showCode(code), exp, now });
}
// go false: only show whose save the code belongs to. go true: this device joins that account.
async function redeem(db, body, old, ip, now) {
  const code = readCode(body.code);
  if (await bump(db, 'code', ip, LIMIT.CODE_WINDOW, now) > LIMIT.CODE_TRIES) return fail(429, 'slow');
  if (!code) return fail(404, 'code');
  const hash = sha(code);
  if (!body.go) {
    const rows = await db.query('SELECT p.id, p.pub, p.state FROM zz.codes c JOIN zz.players p ON p.id = c.pid WHERE c.hash = $1 AND c.exp > $2 AND p.gone IS NULL', [hash, now]);
    if (!rows[0]) return fail(404, 'code');
    const d = rules.current(rows[0].state, now);
    return good({ peek: { pub: rows[0].pub, name: d.name, rp: d.rp, coins: d.coins, games: d.tot.games, same: !!old && old.id === rows[0].id }, now });
  }
  // the code is used up and the new device key is made in one statement, so a code can never open two doors
  const secret = newSecret();
  const used = await db.query(
    'WITH c AS (DELETE FROM zz.codes WHERE hash = $1 AND exp > $2 RETURNING pid) INSERT INTO zz.keys (hash, pid, made) SELECT $3, pid, $2 FROM c RETURNING pid',
    [hash, now, sha(secret)]);
  if (!used[0]) return fail(404, 'code');
  const pid = used[0].pid, q = [
    ['DELETE FROM zz.keys WHERE pid = $1 AND hash NOT IN (SELECT hash FROM zz.keys WHERE pid = $1 ORDER BY made DESC, hash LIMIT ' + LIMIT.DEVICES + ')', [pid]],
    ['SELECT id, pub, state, ver FROM zz.players WHERE id = $1 AND gone IS NULL', [pid]]
  ];
  if (old && old.id !== pid) {
    // this device leaves the account it was on; an account no device can reach any more is removed
    q.push(['DELETE FROM zz.keys WHERE hash = $1 AND pid = $2', [old.hash, old.id]]);
    q.push(['UPDATE zz.players p SET gone = $2 WHERE p.id = $1 AND p.gone IS NULL AND NOT EXISTS (SELECT 1 FROM zz.keys k WHERE k.pid = p.id)', [old.id, now]]);
  }
  const out = await db.batch(q), row = out[1][0];
  if (!row) return fail(404, 'code');
  return good({ id: row.id, key: secret, pub: row.pub, st: rules.current(row.state, now), ver: row.ver, now });
}
// The player deletes their cloud save: it is hidden at once (no device, board or link reaches it any more) and kept
// 30 days, so a mistake can still be undone by hand; after that hello() removes it for good.
async function wipe(db, cred, now) {
  const rows = await db.query('UPDATE zz.players p SET gone = $3 FROM zz.keys k WHERE k.pid = p.id AND k.hash = $1 AND p.id = $2 AND p.gone IS NULL RETURNING p.id', [cred.hash, cred.id, now]);
  return rows[0] ? good({}) : fail(401, 'auth');
}

// ---------- leaderboards ----------
const PUB = /^[a-z0-9]{8}$/;
async function board(db, b, scope, me, now) {
  if (!BOARDS.hasOwnProperty(b)) return fail(400, 'board');
  const season = rules.seasonOf(now), mine = typeof me === 'string' && PUB.test(me) ? me : '';
  let top, own;
  if (b === 'rp') {
    top = ["SELECT pub AS p, name AS n, rp AS v, COALESCE(state->>'xp', '0') AS x, COALESCE(state->>'title', '') AS t FROM zz.players WHERE season = $1 AND rg > 0 AND NOT ban AND gone IS NULL ORDER BY rp DESC, seen LIMIT " + LIMIT.BOARD_ROWS, [season]];
    own = [`SELECT me.rp AS v, 1 + (SELECT count(*)::int FROM zz.players o WHERE o.season = $1 AND o.rg > 0 AND NOT o.ban AND o.gone IS NULL AND (o.rp > me.rp OR (o.rp = me.rp AND o.seen < me.seen))) AS rank
            FROM zz.players me WHERE me.pub = $2 AND me.season = $1 AND me.rg > 0 AND NOT me.ban AND me.gone IS NULL`, [season, mine]];
    scope = 'season';
  } else {
    scope = scope === 'all' ? 'all' : 'season';
    const s = scope === 'all' ? 'all' : season;
    top = ["SELECT p.pub AS p, p.name AS n, s.val AS v, COALESCE(p.state->>'xp', '0') AS x, COALESCE(p.state->>'title', '') AS t FROM zz.scores s JOIN zz.players p ON p.id = s.pid WHERE s.board = $1 AND s.season = $2 AND NOT p.ban AND p.gone IS NULL ORDER BY s.val DESC, s.at LIMIT " + LIMIT.BOARD_ROWS, [b, s]];
    own = [`SELECT ms.val AS v, 1 + (SELECT count(*)::int FROM zz.scores o JOIN zz.players op ON op.id = o.pid
              WHERE o.board = $1 AND o.season = $2 AND NOT op.ban AND op.gone IS NULL AND (o.val > ms.val OR (o.val = ms.val AND o.at < ms.at))) AS rank
            FROM zz.scores ms JOIN zz.players mp ON mp.id = ms.pid WHERE mp.pub = $3 AND ms.board = $1 AND ms.season = $2 AND NOT mp.ban AND mp.gone IS NULL`, [b, s, mine]];
  }
  const out = await db.batch(mine ? [top, own] : [top]), flip = b === 'sprint' ? -1 : 1;
  const row = mine && out[1][0];
  return good({ b, scope, season, top: out[0].map(r => ({ p: r.p, n: r.n, v: r.v * flip, lv: rules.Meta.levelOf(+r.x || 0).lv, t: TITLE_ID.test(r.t) ? r.t : '' })), me: row ? { rank: row.rank, v: row.v * flip } : null, now });
}

// ---------- rooms for online matches ----------
// Two players find each other with a five-character code and then pass game messages through the server: each seat
// posts into the other seat's letter box and collects its own. It works from any network, because all either side
// ever does is ordinary HTTPS requests to this site.
//
// A seat is held by a key the page makes up itself; only its hash is stored. Messages are numbered by the sender,
// kept until the receiver says how far it has read (ack), and a number that arrives twice is stored once. So a
// request that is repeated after a lost answer neither loses nor doubles anything.
const ROOM = {
  TTL: 3 * 3600000,          // a room lives this long, then it and its letters are removed
  OPEN_PER_HOUR: 40, JOIN_TRIES: 60, JOIN_WINDOW: 10 * 60000,
  MAIL_MAX: 400,             // letters that may wait unread in one box
  BATCH: 80, MSG_BYTES: 4096, INBOX: 120,
  SEATS: 8,                  // the most players one room holds (rooms of 4, 6 or 8)
  LINGER: 15000              // after the host has left, a guest still has this long to collect the last letters
};
const SEAT = /^[A-Za-z0-9_-]{20,64}$/;
function readRoom(v) {
  if (typeof v !== 'string' || v.length > 16) return '';
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 5 ? c : '';
}
async function roomOpen(db, body, ip, now) {
  if (typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(400, 'key');
  const cap = body.cap === undefined ? 2 : Math.floor(+body.cap);
  if (!(cap >= 2 && cap <= ROOM.SEATS)) return fail(400, 'cap');
  if (await bump(db, 'room', ip, 3600000, now) > ROOM.OPEN_PER_HOUR) return fail(429, 'slow');
  for (let tries = 0; ; tries++) {
    const code = pick(CODE_ABC, 5);
    try {
      await db.batch([
        ['DELETE FROM zz.rooms WHERE exp < $1', [now]],
        ['INSERT INTO zz.rooms (code, hk, exp, ks, cap) VALUES ($1, $2, $3, ARRAY[$2], $4)', [code, sha(body.key), now + ROOM.TTL, cap]]
      ]);
      return good({ code, seat: 0, cap, now });
    } catch (e) {
      if (e && e.code === '23505' && tries < 6) continue;   // that code is in use: draw another
      throw e;
    }
  }
}
async function roomJoin(db, body, ip, now) {
  const code = readRoom(body.code);
  if (typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(400, 'key');
  if (await bump(db, 'join', ip, ROOM.JOIN_WINDOW, now) > ROOM.JOIN_TRIES) return fail(429, 'slow');
  if (!code) return fail(404, 'room');
  const hash = sha(body.key);
  // taking the next free seat; asking again with the same key (a retry) gets the seat it already has
  const got = await db.query('UPDATE zz.rooms SET ks = ks || $2::text WHERE code = $1 AND exp > $3 AND NOT ($2 = ANY(ks)) AND cardinality(ks) < cap RETURNING cardinality(ks) - 1 AS seat, cap', [code, hash, now]);
  if (got[0]) return good({ code, seat: got[0].seat, cap: got[0].cap, now });
  const there = await db.query('SELECT array_position(ks, $2) - 1 AS seat, cap FROM zz.rooms WHERE code = $1 AND exp > $3', [code, hash, now]);
  if (!there[0]) return fail(404, 'room');
  return there[0].seat === null || there[0].seat === undefined ? fail(409, 'full') : good({ code, seat: there[0].seat, cap: there[0].cap, now });
}
// ---------- random matchmaking ----------
// Someone asks for "anyone". If a host is already waiting in the queue, the oldest one is taken off it (by exactly one
// asker, even when several ask at once) and the asker sits down in that room. Otherwise the asker opens a room and
// waits in the queue themselves. A waiting host says "still here" every few seconds; a host that stops saying it
// (a closed tab, a phone that went to sleep) is skipped, so nobody is matched with an empty chair.
const QUICK = { STALE: 25000, TRIES: 30, WINDOW: 10 * 60000 };
const CLAIM = `
  DELETE FROM zz.queue WHERE code = (
    SELECT q.code FROM zz.queue q JOIN zz.rooms r ON r.code = q.code
    WHERE q.seen > $1 AND r.exp > $2 AND cardinality(r.ks) = 1 AND r.cap = 2 AND NOT ($3 = ANY(r.ks)) AND q.pool = $4
    ORDER BY q.made LIMIT 1 FOR UPDATE OF q SKIP LOCKED
  ) RETURNING code`;
async function roomQuick(db, body, ip, now) {
  if (typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(400, 'key');
  if (await bump(db, 'quick', ip, QUICK.WINDOW, now) > QUICK.TRIES) return fail(429, 'slow');
  const hash = sha(body.key), pool = body.pool === 'wx' ? 'wx' : '';      // weather battles are matched only with each other
  for (let tries = 0; tries < 3; tries++) {
    const got = await db.query(CLAIM, [now - QUICK.STALE, now, hash, pool]);
    if (!got[0]) break;
    const sat = await db.query('UPDATE zz.rooms SET ks = ks || $2::text WHERE code = $1 AND exp > $3 AND cardinality(ks) < cap RETURNING cap', [got[0].code, hash, now]);
    if (sat[0]) return good({ code: got[0].code, seat: 1, cap: 2, quick: true, now });
  }
  for (let tries = 0; ; tries++) {
    const code = pick(CODE_ABC, 5);
    try {
      await db.batch([
        ['DELETE FROM zz.rooms WHERE exp < $1', [now]],
        ['INSERT INTO zz.rooms (code, hk, exp, ks, cap) VALUES ($1, $2, $3, ARRAY[$2], 2)', [code, hash, now + ROOM.TTL]],
        ['INSERT INTO zz.queue (code, made, seen, pool) VALUES ($1, $2, $2, $3)', [code, now, pool]]
      ]);
      return good({ code, seat: 0, cap: 2, quick: true, now });
    } catch (e) {
      if (e && e.code === '23505' && tries < 6) continue;
      throw e;
    }
  }
}
// The waiting host is still here. Answers whether the room is still waiting in the queue.
async function roomStill(db, body, now) {
  const code = readRoom(body.code);
  if (!code || typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(404, 'room');
  const got = await db.query('UPDATE zz.queue q SET seen = $3 FROM zz.rooms r WHERE q.code = $1 AND r.code = q.code AND r.ks[1] = $2 RETURNING 1 AS x', [code, sha(body.key), now]);
  return good({ queued: !!got[0], now });
}
// The host shuts the door: nobody else can take a seat (the match is starting with whoever is here).
async function roomLock(db, body, now) {
  const code = readRoom(body.code);
  if (!code || typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(404, 'room');
  const got = await db.query('UPDATE zz.rooms SET cap = cardinality(ks) WHERE code = $1 AND exp > $3 AND ks[1] = $2 RETURNING cap', [code, sha(body.key), now]);
  return got[0] ? good({ seats: got[0].cap, now }) : fail(404, 'room');
}
function cleanMail(v) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > ROOM.BATCH) return null;
  const out = [];
  for (const x of v) {
    if (!x || typeof x !== 'object' || typeof x.n !== 'number' || x.n !== Math.floor(x.n) || x.n < 1 || x.n > 2e9 || !x.m || typeof x.m !== 'object' || Array.isArray(x.m)) return null;
    if (JSON.stringify(x.m).length > ROOM.MSG_BYTES) return null;
    const o = { n: x.n, m: x.m };
    if (x.to !== undefined) { if (typeof x.to !== 'number' || x.to !== Math.floor(x.to) || x.to < 0 || x.to >= ROOM.SEATS) return null; o.to = x.to; }
    out.push(o);
  }
  return out;
}
// $1 code · $2 my seat · $3 my key's hash · $4 what I say · $5 how far I have read from each seat · $6 now · $7 box limit
const EXCHANGE = `
  WITH room AS (
    SELECT code, cardinality(ks) AS seats, cap FROM zz.rooms WHERE code = $1 AND exp > $6 AND ks[$2::int + 1] = $3
  ), put AS (
    INSERT INTO zz.post (room, dst, src, n, body)
    SELECT room.code, d, $2::int, (x->>'n')::int, x->'m'
    FROM room, jsonb_array_elements($4::jsonb) AS x, generate_series(0, ${ROOM.SEATS - 1}) AS d
    WHERE d < room.seats AND d <> $2::int AND (x->'to' IS NULL OR (x->>'to')::int = d)
      AND (SELECT count(*) FROM zz.post q WHERE q.room = room.code AND q.dst = d) < $7::int
    ON CONFLICT (room, dst, src, n) DO NOTHING
    RETURNING 1
  ), del AS (
    DELETE FROM zz.post p USING room WHERE p.room = room.code AND p.dst = $2::int AND p.n <= COALESCE(($5::int[])[p.src + 1], 0) RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM room) AS ok, (SELECT seats FROM room) AS seats, (SELECT cap FROM room) AS cap,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('n', w.n, 'm', w.body, 'f', w.src) ORDER BY w.src, w.n)
              FROM (SELECT p.n, p.body, p.src FROM zz.post p, room WHERE p.room = room.code AND p.dst = $2::int AND p.n > COALESCE(($5::int[])[p.src + 1], 0) ORDER BY p.src, p.n LIMIT ${ROOM.INBOX}) w), '[]'::jsonb) AS inbox`;
function readSeat(body) {
  const s = body.seat === undefined ? (body.role === 1 ? 1 : 0) : Math.floor(+body.seat);    // pages from before rooms had more than two seats say "role"
  return s >= 0 && s < ROOM.SEATS ? s : -1;
}
function readAcks(body, seat) {
  const acks = [0, 0, 0, 0, 0, 0, 0, 0], num = v => Math.max(0, Math.min(2e9, Math.floor(+v || 0)));
  if (Array.isArray(body.acks)) for (let i = 0; i < ROOM.SEATS && i < body.acks.length; i++) acks[i] = num(body.acks[i]);
  else if (seat < 2) acks[1 - seat] = num(body.ack);
  return acks;
}
// One round of the conversation: hand over what I have to say, say how far I have read, collect what is waiting for me.
async function roomExchange(db, body, now) {
  const code = readRoom(body.code), seat = readSeat(body);
  if (!code || seat < 0 || typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(404, 'room');
  const out = cleanMail(body.out);
  if (!out) return fail(400, 'mail');
  const rows = await db.query(EXCHANGE, [code, seat, sha(body.key), JSON.stringify(out), readAcks(body, seat), now, ROOM.MAIL_MAX]);
  const r = rows[0];
  if (!r || !r.ok) return fail(404, 'room');
  if (body.end === true && seat === 0) await db.query(LEAVE, [code, sha(body.key), now + ROOM.LINGER]);   // the host's last word
  return good({ paired: r.seats > 1, seats: r.seats, cap: r.cap, in: r.inbox || [], now });
}
// The host leaves. With nobody else in the room it is gone at once and its code stops working. With guests in it,
// the room lasts a few seconds more so that the goodbye (and a final score) still reaches them; nobody new can get in.
const LEAVE = `
  WITH empty AS (DELETE FROM zz.rooms WHERE code = $1 AND ks[1] = $2 AND cardinality(ks) = 1 RETURNING 1)
  UPDATE zz.rooms SET exp = LEAST(exp, $3::float8), cap = cardinality(ks) WHERE code = $1 AND ks[1] = $2 AND cardinality(ks) > 1`;
// The host closes the room outright: the code stops working at once and anything still waiting is dropped.
async function roomClose(db, body) {
  const code = readRoom(body.code);
  if (!code || typeof body.key !== 'string' || !SEAT.test(body.key)) return fail(404, 'room');
  await db.query('DELETE FROM zz.rooms WHERE code = $1 AND ks[1] = $2', [code, sha(body.key)]);
  return good({});
}

// ---------- SnowRealm Identity: link this save to a platform player, and get it back on another device ----------
// claims: a token server/identity.js has already checked. Nothing here runs unless linking is switched on.
async function useJti(db, claims) {
  const r = await db.query('INSERT INTO zz.idjti (jti, exp) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING RETURNING jti', [claims.jti, claims.exp * 1000]);
  return !!r[0];
}
async function idStatus(db, cred, on) {
  const p = await findPlayer(db, cred);
  if (!p) return fail(401, 'auth');
  if (!on) return good({ enabled: false, linked: false });
  const r = await db.query('SELECT linked_at FROM zz.identity WHERE pid = $1', [p.id]);
  return good({ enabled: true, linked: !!r[0], linkedAt: r[0] ? r[0].linked_at : 0 });
}
async function idLink(db, cred, claims, now) {
  const p = await findPlayer(db, cred);
  if (!p) return fail(401, 'auth');
  if (!(await useJti(db, claims))) return fail(409, 'replay');
  const mine = await db.query('SELECT platform_id FROM zz.identity WHERE pid = $1', [p.id]);
  const theirs = await db.query('SELECT i.pid, p.pub, p.state, p.gone FROM zz.identity i JOIN zz.players p ON p.id = i.pid WHERE i.platform_id = $1', [claims.sub]);
  if (mine[0] && mine[0].platform_id === claims.sub) return good({ linked: true, same: true });
  // never merged or overwritten: the player chooses, and both saves stay as they are
  if (mine[0]) return fail(409, 'linked');
  // the platform account's old save was deleted by its player: the link moves to this save (the old one stays kept
  // until its 30 days are up, unlinked)
  const moved = !!(theirs[0] && theirs[0].gone != null);
  if (theirs[0] && !moved) { const d = rules.current(theirs[0].state, now); return fail(409, 'taken', { other: { pub: theirs[0].pub, name: d.name, coins: d.coins, games: d.tot.games } }); }
  const secret = newSecret();
  try {
    await db.batch([
      moved ? ['UPDATE zz.identity SET pid = $2, linked_at = $3 WHERE platform_id = $1', [claims.sub, p.id, now]]
        : ['INSERT INTO zz.identity (platform_id, pid, linked_at, provider_hint) VALUES ($1, $2, $3, $4)', [claims.sub, p.id, now, 'snowrealm']],
      // this device gets a fresh key; its old key and any open transfer codes stop working
      ['INSERT INTO zz.keys (hash, pid, made) VALUES ($1, $2, $3)', [sha(secret), p.id, now]],
      ['DELETE FROM zz.keys WHERE hash = $1 AND pid = $2', [cred.hash, p.id]],
      ['DELETE FROM zz.codes WHERE pid = $1', [p.id]]
    ]);
  } catch (e) {
    if (e && e.code === '23505') return fail(409, 'race');      // linked a moment ago from somewhere else
    throw e;
  }
  return good({ linked: true, id: p.id, key: secret, now });
}
// another device: the platform player's 轉磚 save, with a key of its own for this device
async function idRecover(db, claims, now) {
  if (!(await useJti(db, claims))) return fail(409, 'replay');
  const r = await db.query('SELECT p.id, p.pub, p.state, p.ver, p.ban FROM zz.identity i JOIN zz.players p ON p.id = i.pid WHERE i.platform_id = $1 AND p.gone IS NULL', [claims.sub]);
  if (!r[0]) return fail(404, 'none');
  if (r[0].ban) return fail(403, 'ban');
  const secret = newSecret(), pid = r[0].id;
  await db.batch([
    ['INSERT INTO zz.keys (hash, pid, made) VALUES ($1, $2, $3)', [sha(secret), pid, now]],
    ['DELETE FROM zz.keys WHERE pid = $1 AND hash NOT IN (SELECT hash FROM zz.keys WHERE pid = $1 ORDER BY made DESC, hash LIMIT ' + LIMIT.DEVICES + ')', [pid]]
  ]);
  return good({ id: pid, key: secret, pub: r[0].pub, st: rules.current(r[0].state, now), ver: r[0].ver, now });
}

module.exports = { idStatus, idLink, idRecover, adReward, readRoom, readSeat, cleanMail, LIMIT, ROOM, readCred, hello, sync, makeCode, redeem, wipe, board, sha, readCode, roomOpen, roomJoin, roomQuick, roomStill, roomLock, roomExchange, roomClose };
