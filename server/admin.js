'use strict';
/* 轉磚's read-only operations API for the SnowRealm Games console (docs/BRICKDUEL_ADMIN_API_ADAPTER_SPEC.md, and
   cube1 docs/SNOWREALM_GAMES_ADMIN_API_BRICKDUEL_HANDOFF.md v0.2).

     GET /internal/admin/v1/overview
     GET /internal/admin/v1/players?limit=&cursor=
     GET /internal/admin/v1/players/{gameUserId}
     GET /internal/admin/v1/draws?limit=&cursor=&from=&to=
     GET /internal/admin/v1/matches?limit=&cursor=&player=&room=
     GET /internal/admin/v1/metrics
     GET /internal/admin/v1/metrics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
     GET /internal/admin/v1/metrics/games   each game inside 轉磚 (match modes, the brick games, 磚之冒險, 地城小隊)

   Server to server only: no CORS headers, every answer Cache-Control: no-store, GET only, nothing is ever written
   except the audit line of each call. Who may call is decided by one thing: a short-lived Ed25519 JWT from the
   SnowRealm machine issuer, checked against its own admin JWKS (never the players' JWKS), with
     iss  https://identity.snowrealm.pet              aud  snowrealm:brickduel:admin
     scope brickduel:admin:read (whole word)          sub  svc:snowrealm-games-admin, and listed in BRICKDUEL_ADMIN_SUBJECTS
     kid, iat, nbf, exp, jti all there; whole seconds; 0 < exp - iat <= 600; 60 s of clock leeway
   No origin, network address or player token counts for anything here.

   Settings (names only; the values live in Vercel):
     BRICKDUEL_ADMIN_SUBJECTS   comma-separated service subjects. Not set: every call is 503 (off).
     BRICKDUEL_ADMIN_JWKS       the admin public keys as JWKS JSON (optional; for an emergency key swap)
     BRICKDUEL_ADMIN_JWKS_URL   where they are published (default https://identity.snowrealm.pet/.well-known/admin-jwks.json)
     BRICKDUEL_ADMIN_ISSUER     only for tests: anything but the SnowRealm issuer needs BRICKDUEL_ADMIN_TEST_TRUST=1
                                and is refused outright on Vercel production
   Errors: 401 bad or missing token (never says which check failed), 403 good token without the scope or subject,
   404 no such path or player, 405 not GET, 400 bad parameters, 429 more than 60 calls a minute for one subject,
   503 off, or the keys cannot be fetched (the console must show "source unavailable", never zeros).

   Not returned, ever: device key hashes (zz.keys), transfer codes (zz.codes), the raw state and srv records,
   network addresses, tokens. A count the game has no honest source for is null, never 0. */
const crypto = require('crypto');
const { Meta } = require('./rules.js');

const ISSUER = 'https://identity.snowrealm.pet', JWKS_URL = ISSUER + '/.well-known/admin-jwks.json';
const AUD = 'snowrealm:brickduel:admin', SCOPE = 'brickduel:admin:read', SERVICE = 'svc:snowrealm-games-admin';
const SKEW = 60, MAX_LIFE = 600, KEYS_TTL = 10 * 60000, REFETCH_GAP = 60000, FETCH_MS = 4000, PER_MIN = 60;
const DAY = 86400000, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, SUB = /^svc:[a-z0-9][a-z0-9-]{0,79}$/;
let cache = { src: '', at: 0, tried: 0, keys: null };
let fetcher = null;

// ---------- settings ----------
function settings(env) {
  env = env || process.env;
  const test = env.BRICKDUEL_ADMIN_TEST_TRUST === '1' && env.VERCEL_ENV !== 'production';
  // outside tests the one service the console calls with is the only subject there can be (cube1 contract 2026-11-21)
  const subs = String(env.BRICKDUEL_ADMIN_SUBJECTS || '').split(',').map(s => s.trim()).filter(s => SUB.test(s) && (test || s === SERVICE));
  if (!subs.length) return null;
  const iss = env.BRICKDUEL_ADMIN_ISSUER || ISSUER;
  if (iss !== ISSUER && !test) return null;
  let inline = null;
  if (env.BRICKDUEL_ADMIN_JWKS) { try { inline = JSON.parse(env.BRICKDUEL_ADMIN_JWKS); } catch (e) { return null; } }
  const url = env.BRICKDUEL_ADMIN_JWKS_URL || JWKS_URL;
  if (!inline && !/^https:\/\//.test(url) && !test) return null;
  if (!inline && url !== JWKS_URL && !test) return null;
  return { iss, subs, inline, url };
}
const configured = env => !!settings(env);

function readKeys(j) {
  const out = {};
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
    if (!k || k.kty !== 'OKP' || k.crv !== 'Ed25519' || typeof k.x !== 'string' || typeof k.kid !== 'string' || 'd' in k) continue;
    if (k.use && k.use !== 'sig') continue;
    if (k.alg && k.alg !== 'EdDSA') continue;
    if (out[k.kid]) { out[k.kid] = 'twice'; continue; }      // one kid, one key: a doubled kid is believed for neither
    try { out[k.kid] = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' }); } catch (e) { /* skipped */ }
  }
  return out;
}
// the admin keys: from the setting, or fetched and kept ten minutes. An unknown kid may fetch again, once a minute.
async function keyFor(s, kid, now) {
  if (s.inline) { const k = readKeys(s.inline)[kid]; return k && k !== 'twice' ? k : null; }
  const fresh = cache.keys && cache.src === s.url && now - cache.at < KEYS_TTL;
  if (fresh && cache.keys[kid]) return cache.keys[kid] === 'twice' ? null : cache.keys[kid];
  if (fresh && now - cache.tried < REFETCH_GAP) return null;
  const tried = fresh ? now : 0;      // a fetch for a kid the fresh keys do not have: at most once a minute
  if (fresh) cache.tried = now;
  const r = await (fetcher || fetch)(s.url, { signal: AbortSignal.timeout(FETCH_MS), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('jwks ' + r.status);
  cache = { src: s.url, at: now, tried, keys: readKeys(await r.json()) };
  const k = cache.keys[kid];
  return k && k !== 'twice' ? k : null;
}
const part = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const int = v => typeof v === 'number' && Number.isSafeInteger(v);

// { ok, sub, jti } or { ok: false, status, why } (why is for the log only, never sent)
async function check(header, s, now) {
  const bad = why => ({ ok: false, status: 401, why });
  if (typeof header !== 'string' || header.length > 4200 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header)) return bad('token');
  const bits = header.slice(7).split('.');
  let head, body;
  try { head = part(bits[0]); body = part(bits[1]); } catch (e) { return bad('token'); }
  if (!head || head.alg !== 'EdDSA' || head.crit != null) return bad('alg');
  if (typeof head.kid !== 'string' || !head.kid || head.kid.length > 200) return bad('kid');
  let key;
  try { key = await keyFor(s, head.kid, now); } catch (e) { return { ok: false, status: 503, why: 'jwks' }; }
  if (!key) return bad('kid');
  let good = false;
  try { good = crypto.verify(null, Buffer.from(bits[0] + '.' + bits[1]), key, Buffer.from(bits[2], 'base64url')); } catch (e) { good = false; }
  if (!good) return bad('signature');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('token');
  const sec = Math.floor(now / 1000);
  if (body.iss !== s.iss) return bad('iss');
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (aud.indexOf(AUD) < 0) return bad('aud');
  if (typeof body.jti !== 'string' || !body.jti || body.jti.length > 200) return bad('jti');
  if (!int(body.iat) || !int(body.nbf) || !int(body.exp)) return bad('time');
  if (body.iat > sec + SKEW || body.nbf > sec + SKEW) return bad('early');
  if (body.exp <= sec - SKEW) return bad('expired');
  if (!(body.exp - body.iat > 0 && body.exp - body.iat <= MAX_LIFE)) return bad('life');
  if (typeof body.sub !== 'string' || !body.sub) return bad('sub');
  const scope = typeof body.scope === 'string' ? body.scope.split(' ') : [];
  if (s.subs.indexOf(body.sub) < 0 || scope.indexOf(SCOPE) < 0) return { ok: false, status: 403, why: 'forbidden', sub: body.sub, jti: body.jti };
  return { ok: true, sub: body.sub, jti: body.jti };
}

// ---------- shapes ----------
const iso = ms => ms == null ? null : new Date(+ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = v => v == null ? 0 : +v;
const str = v => v == null ? '0' : String(v).replace(/\..*$/, '');
function levelOf(xp) {
  let l = 1, left = Math.max(0, Math.floor(+xp || 0));
  while (l < 100 && left >= 60 + 20 * (l - 1)) { left -= 60 + 20 * (l - 1); l++; }
  return l;
}
class Bad extends Error { constructor() { super('bad_request'); this.bad = true; } }
function limitOf(q) {
  if (!q.has('limit')) return 25;
  const v = q.get('limit');
  if (!/^\d{1,3}$/.test(v) || +v < 1 || +v > 100) throw new Bad();
  return +v;
}
// an opaque cursor: base64url of a small JSON array, checked against the shape each list expects
function cursorOf(q, shape) {
  if (!q.has('cursor')) return null;
  const c = q.get('cursor');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(c)) throw new Bad();
  let v;
  try { v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')); } catch (e) { throw new Bad(); }
  if (!Array.isArray(v) || v.length !== shape.length || !shape.every((t, i) => t(v[i]))) throw new Bad();
  return v;
}
const makeCursor = a => Buffer.from(JSON.stringify(a)).toString('base64url');
const isNum = v => typeof v === 'number' && isFinite(v) && v >= 0;
const isId = v => typeof v === 'string' && /^\d{1,19}$/.test(v);
const isUuid = v => typeof v === 'string' && UUID.test(v);
// a moment: YYYY-MM-DD (the start of that UTC day) or a full ISO time
function timeOf(q, name) {
  if (!q.has(name)) return null;
  const v = q.get(name);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z)?$/.test(v)) throw new Bad();
  const t = Date.parse(v.length === 10 ? v + 'T00:00:00Z' : v);
  if (!isFinite(t)) throw new Bad();
  return t;
}
function dayOf(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Bad();
  const t = Date.parse(v + 'T00:00:00Z');
  if (!isFinite(t) || iso(t).slice(0, 10) !== v) throw new Bad();
  return t;
}

const PLAYER_COLS = `p.id, p.pub, p.name, p.rp, p.season, p.rg, p.ban, p.made, p.seen,
  (p.state->>'xp') AS xp, (p.state->>'coins') AS coins, (p.state->'tot'->>'games') AS games, i.platform_id`;
function playerItem(r) {
  return {
    gameUserId: r.id, snowrealmPlayerId: r.platform_id || null, publicTag: r.pub, nickname: r.name || '',
    level: levelOf(r.xp), coins: str(r.coins), rating: num(r.rp), season: r.season || '', rankedGames: num(r.rg),
    games: num(r.games), banned: !!r.ban, createdAt: iso(r.made), lastSeenAt: iso(r.seen)
  };
}
function matchItem(r) {
  const d = r.data || {};
  const n = v => typeof v === 'number' && isFinite(v) ? v : null;
  return {
    matchLogId: String(r.id), gameUserId: r.pid, at: iso(r.at), mode: r.mode, result: num(r.result), proven: !!r.proven,
    room: r.room || '', seats: num(r.seats), level: n(d.level), durationMs: n(d.ms), ko: n(d.ko), koOpp: n(d.koOpp), score: n(d.score),
    sent: n(d.sent), lines: n(d.lines), pieces: n(d.pieces), spins: n(d.spins), itemsUsed: n(d.items), team: !!d.team, quick: !!d.quick
  };
}
function drawItem(r) {
  const boxes = (Array.isArray(r.boxes) ? r.boxes : []).map(b => ({ grade: b && b.grade != null ? String(b.grade) : null, got: Array.isArray(b && b.got) ? b.got : [] }));
  return { drawId: String(r.id), gameUserId: r.pid, at: iso(r.at), kind: r.kind || 'box', boxes };
}
// the published odds, to set beside what was really drawn
const PUBLISHED = () => (Meta.BOX || []).map(b => ({ grade: String(b.id), published: b.p / 100 }));

// ---------- the endpoints ----------
const LIVE = 'p.gone IS NULL';
// names for the console (Traditional Chinese, as the game shows them); an unknown id is shown as it is
const MODE_NAMES = { ai: '對電腦', battle: '對戰', rank: '排位', net: '線上對戰', wx: '挑戰大自然', lv: '關卡地形', race: '競速', relay: '接力', royale: '大逃殺',
  terr: '搶地盤', tower: '高塔', sprint: '40 行衝刺', level: '關卡', solo: '單人' };
const MINI_NAMES = { snake: '磚蛇', breakout: '打磚塊', stack: '疊磚塔', push: '推磚倉庫', merge: '磚塊合成', sort: '分磚', picross: '磚畫謎', pipes: '磚道', sweep: '掃磚' };
const RPG_STAGES = Meta.RPG.STAGES.length;      // 磚之冒險 chapter one
const H = {
  async overview(db, q, now) {
    const [p] = await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE seen > $1)::int AS a7, count(*) FILTER (WHERE ban)::int AS ban,
      COALESCE(sum((state->>'coins')::numeric), 0)::text AS coins, COALESCE(sum((state->'tot'->>'games')::numeric), 0)::bigint AS games
      FROM zz.players p WHERE ${LIVE}`, [now - 7 * DAY]);
    const [o] = await db.query(`SELECT (SELECT count(*)::int FROM zz.rooms WHERE exp > $1) AS rooms, (SELECT count(*)::int FROM zz.queue) AS queue,
      (SELECT COALESCE(sum(jsonb_array_length(boxes)), 0)::int FROM zz.draws WHERE kind = 'box' AND at > $2) AS boxes`, [now, now - 7 * DAY]);
    return { gameId: 'brickduel', apiVersion: '1', players: p.n, playersActive7d: p.a7, bannedPlayers: p.ban, coinsOutstanding: str(p.coins),
      playerGamesTotal: num(p.games), openRooms: o.rooms, quickQueue: o.queue, boxesOpened7d: o.boxes, generatedAt: iso(now) };
  },
  async players(db, q) {
    const limit = limitOf(q), c = cursorOf(q, [isNum, isUuid]);
    const rows = await db.query(`SELECT ${PLAYER_COLS} FROM zz.players p LEFT JOIN zz.identity i ON i.pid = p.id
      WHERE ${LIVE} ${c ? 'AND (p.made, p.id) < ($2, $3::uuid)' : ''} ORDER BY p.made DESC, p.id DESC LIMIT $1`, c ? [limit + 1, c[0], c[1]] : [limit + 1]);
    const more = rows.length > limit, page = rows.slice(0, limit), last = page[page.length - 1];
    return { items: page.map(playerItem), nextCursor: more ? makeCursor([+last.made, last.id]) : null };
  },
  async player(db, q, now, id) {
    const [r] = await db.query(`SELECT ${PLAYER_COLS}, p.state->'items' AS items, p.state->'sub' AS sub,
      (SELECT count(*)::int FROM zz.keys k WHERE k.pid = p.id) AS devices
      FROM zz.players p LEFT JOIN zz.identity i ON i.pid = p.id WHERE p.id = $1 AND ${LIVE}`, [id]);
    if (!r) return null;
    const m = await db.query('SELECT id, pid, at, mode, result, proven, room, seats, data FROM zz.matches WHERE pid = $1 ORDER BY at DESC, id DESC LIMIT 50', [id]);
    const d = await db.query('SELECT id, pid, at, kind, boxes FROM zz.draws WHERE pid = $1 ORDER BY at DESC, id DESC LIMIT 50', [id]);
    const items = {};
    (Array.isArray(r.items) ? r.items : []).forEach((n, i) => { if (i > 0 && +n > 0) items[String(i)] = +n; });
    const until = r.sub && +r.sub.until > 0 ? +r.sub.until : 0, active = until > now;
    return Object.assign(playerItem(r), {
      items, subscription: { active, kind: active ? (r.sub.demo === false ? 'paid' : 'trial') : null, until: active ? iso(until) : null },
      deviceCount: num(r.devices), recentMatches: m.map(matchItem), recentDraws: d.map(drawItem)
    });
  },
  async draws(db, q) {
    const limit = limitOf(q), c = cursorOf(q, [isId]), from = timeOf(q, 'from'), to = timeOf(q, 'to');
    if (from != null && to != null && to < from) throw new Bad();
    const where = ['true'], args = [limit + 1];
    if (from != null) { args.push(from); where.push('d.at >= $' + args.length); }
    if (to != null) { args.push(to); where.push('d.at < $' + args.length); }
    const span = where.slice(), spanArgs = args.slice(1);
    if (c) { args.push(c[0]); where.push('d.id < $' + args.length + '::bigint'); }
    const rows = await db.query(`SELECT d.id, d.pid, d.at, d.kind, d.boxes FROM zz.draws d WHERE ${where.join(' AND ')} ORDER BY d.id DESC LIMIT $1`, args);
    // the summary: treasure boxes in the whole period asked for (not just this page), against the published odds
    const sum = await db.query(`SELECT b->>'grade' AS grade, count(*)::int AS n FROM zz.draws d, jsonb_array_elements(d.boxes) AS b
      WHERE d.kind = 'box' AND ${span.join(' AND ').replace(/\$(\d+)/g, (m, k) => '$' + (k - 1))} GROUP BY 1`, spanArgs);
    const total = sum.reduce((a, r) => a + r.n, 0), seen = {};
    sum.forEach(r => { seen[r.grade] = r.n; });
    const grades = PUBLISHED().map(g => ({ grade: g.grade, count: seen[g.grade] || 0, share: total ? (seen[g.grade] || 0) / total : null, published: g.published }));
    Object.keys(seen).forEach(k => { if (!grades.some(g => g.grade === k)) grades.push({ grade: k, count: seen[k], share: seen[k] / total, published: null }); });
    const more = rows.length > limit, page = rows.slice(0, limit);
    return { items: page.map(drawItem), nextCursor: more ? makeCursor([String(page[page.length - 1].id)]) : null,
      summary: { from: iso(from), to: iso(to), boxes: total, grades } };
  },
  async matches(db, q) {
    const limit = limitOf(q), c = cursorOf(q, [isId]), where = ['true'], args = [limit + 1];
    if (q.has('player')) { if (!isUuid(q.get('player'))) throw new Bad(); args.push(q.get('player')); where.push('pid = $' + args.length + '::uuid'); }
    if (q.has('room')) { if (!/^[A-Z0-9]{4,8}$/.test(q.get('room'))) throw new Bad(); args.push(q.get('room')); where.push('room = $' + args.length); }
    if (c) { args.push(c[0]); where.push('id < $' + args.length + '::bigint'); }
    const rows = await db.query(`SELECT id, pid, at, mode, result, proven, room, seats, data FROM zz.matches WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $1`, args);
    const more = rows.length > limit, page = rows.slice(0, limit);
    return { items: page.map(matchItem), nextCursor: more ? makeCursor([String(page[page.length - 1].id)]) : null };
  },
  async metrics(db, q, now) {
    const day0 = Math.floor(now / DAY) * DAY;
    const [p] = await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE ban)::int AS ban,
      count(*) FILTER (WHERE seen > $1)::int AS d1, count(*) FILTER (WHERE seen > $2)::int AS d7, count(*) FILTER (WHERE seen > $3)::int AS d30,
      count(*) FILTER (WHERE (state->'sub'->>'until')::float8 > $4)::int AS subs,
      count(*) FILTER (WHERE (state->'sub'->>'until')::float8 > $4 AND (state->'sub'->>'demo') = 'false')::int AS paid,
      COALESCE(sum((state->>'coins')::numeric), 0)::text AS coins,
      (SELECT count(*)::int FROM zz.identity i JOIN zz.players x ON x.id = i.pid WHERE x.gone IS NULL) AS linked,
      (SELECT count(*)::int FROM zz.keys k JOIN zz.players x ON x.id = k.pid WHERE x.gone IS NULL) AS devices
      FROM zz.players p WHERE ${LIVE}`, [now - DAY, now - 7 * DAY, now - 30 * DAY, now]);
    const items = await db.query(`SELECT e.i - 1 AS id, sum(e.v::numeric)::bigint AS n FROM zz.players p,
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.state->'items') = 'array' THEN p.state->'items' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(v, i)
      WHERE ${LIVE} AND e.i > 1 AND e.v ~ '^[0-9]+$' GROUP BY 1 HAVING sum(e.v::numeric) > 0 ORDER BY 1`, []);
    const m = await db.query('SELECT mode, count(*)::int AS n FROM zz.matches WHERE at >= $1 GROUP BY 1', [day0]);
    const b = await db.query(`SELECT x->>'grade' AS grade, count(*)::int AS n FROM zz.draws d, jsonb_array_elements(d.boxes) AS x WHERE d.kind = 'box' AND d.at >= $1 GROUP BY 1`, [day0]);
    const [o] = await db.query('SELECT (SELECT count(*)::int FROM zz.rooms WHERE exp > $1) AS rooms, (SELECT count(*)::int FROM zz.queue) AS queue', [now]);
    const obj = rows => { const out = {}; rows.forEach(r => { out[r.mode != null ? r.mode : r.grade] = r.n; }); return out; };
    const itemsOut = {}; items.forEach(r => { itemsOut[String(r.id)] = num(r.n); });
    return {
      gameId: 'brickduel', apiVersion: '1',
      players: { total: p.n, guest: p.n - p.linked, linked: p.linked, steam: null, banned: p.ban, minorDeclared: null },
      regions: null,
      devices: { total: p.devices, perPlayer: p.n ? Math.round(p.devices / p.n * 100) / 100 : null, unsaved: null },
      subs: { active: p.subs, trial: p.subs - p.paid, paid: p.paid },
      active: { d1: p.d1, d7: p.d7, d30: p.d30 },
      economy: { coinsOutstanding: str(p.coins), itemsOutstanding: itemsOut },
      matches: { today: obj(m) }, boxes: { today: obj(b) },
      online: { openRooms: o.rooms, quickQueue: o.queue },
      day: iso(day0).slice(0, 10), generatedAt: iso(now)
    };
  },
  // Each game inside 轉磚, for the console's per-game view (Owner 2026-11-23). Only what the server really records:
  // the match log (kept a year) for the main game's modes, the brick games' best scores (one row per player and board,
  // dated when it last improved), and 磚之冒險's progress inside each save. 地城小隊 keeps nothing on the server (the
  // host's page runs it), so it says source: null instead of showing zeros.
  async games(db, q, now) {
    const day0 = Math.floor(now / DAY) * DAY, d7 = now - 7 * DAY;
    const modes = await db.query(`SELECT m.mode, count(*) FILTER (WHERE m.at >= $1)::int AS today, count(*) FILTER (WHERE m.at >= $2)::int AS d7,
      count(DISTINCT m.pid) FILTER (WHERE m.at >= $2)::int AS players7d, count(*)::int AS kept, count(DISTINCT m.pid)::int AS players
      FROM zz.matches m GROUP BY 1 ORDER BY 1`, [day0, d7]);
    const minis = await db.query(`SELECT substring(s.board from '^m_([a-z]+)') AS game, count(DISTINCT s.pid)::int AS players,
      count(DISTINCT s.pid) FILTER (WHERE s.at >= $1)::int AS improved7d FROM zz.scores s JOIN zz.players p ON p.id = s.pid
      WHERE s.board LIKE 'm\\_%' AND ${LIVE} GROUP BY 1`, [d7]);
    const [rpg] = await db.query(`SELECT count(*) FILTER (WHERE r.best > 0)::int AS players, count(*) FILTER (WHERE r.best >= $1)::int AS finished,
      COALESCE(sum(r.wins), 0)::bigint AS clears FROM (SELECT
        CASE WHEN (p.state->'rpg'->>'best') ~ '^[0-9]{1,3}$' THEN (p.state->'rpg'->>'best')::int ELSE 0 END AS best,
        CASE WHEN (p.state->'rpg'->>'wins') ~ '^[0-9]{1,9}$' THEN (p.state->'rpg'->>'wins')::bigint ELSE 0 END AS wins
        FROM zz.players p WHERE ${LIVE} AND jsonb_typeof(p.state->'rpg') = 'object') r`, [RPG_STAGES]);
    const games = [];
    modes.forEach(r => games.push({ id: 'mode:' + r.mode, kind: 'mode', name: MODE_NAMES[r.mode] || r.mode, source: 'matches',
      matchesToday: r.today, matches7d: r.d7, players7d: r.players7d, matchesKept: r.kept, playersKept: r.players }));
    const seen = {};
    minis.forEach(r => { seen[r.game] = 1; games.push({ id: r.game, kind: 'mini', name: MINI_NAMES[r.game] || r.game, source: 'scores', playersWithScore: r.players, playersImproved7d: r.improved7d }); });
    Object.keys(MINI_NAMES).forEach(g => { if (!seen[g]) games.push({ id: g, kind: 'mini', name: MINI_NAMES[g], source: 'scores', playersWithScore: 0, playersImproved7d: 0 }); });
    games.push({ id: 'rpg', kind: 'adventure', name: '磚之冒險', source: 'saves', playersStarted: rpg.players, playersFinished: rpg.finished, stages: RPG_STAGES, clearsTotal: str(rpg.clears), active7d: null });
    games.push({ id: 'dungeon', kind: 'coop', name: '地城小隊', source: null });
    return { gameId: 'brickduel', apiVersion: '1', games, generatedAt: iso(now) };
  },
  async daily(db, q, now) {
    const today = Math.floor(now / DAY) * DAY;
    const to = q.has('to') ? dayOf(q.get('to')) : today, from = q.has('from') ? dayOf(q.get('from')) : to - 6 * DAY;
    if (to < from || (to - from) / DAY > 366) throw new Bad();
    const end = to + DAY, args = [from, end];
    const np = await db.query('SELECT floor(made / 86400000)::int AS d, count(*)::int AS n FROM zz.players WHERE made >= $1 AND made < $2 GROUP BY 1', args);
    const mm = await db.query('SELECT floor(at / 86400000)::int AS d, mode, count(*)::int AS n, count(DISTINCT pid)::int AS who FROM zz.matches WHERE at >= $1 AND at < $2 GROUP BY 1, 2', args);
    const ap = await db.query('SELECT floor(at / 86400000)::int AS d, count(DISTINCT pid)::int AS n FROM zz.matches WHERE at >= $1 AND at < $2 GROUP BY 1', args);
    const bx = await db.query(`SELECT floor(d.at / 86400000)::int AS d, x->>'grade' AS grade, count(*)::int AS n FROM zz.draws d, jsonb_array_elements(d.boxes) AS x
      WHERE d.kind = 'box' AND d.at >= $1 AND d.at < $2 GROUP BY 1, 2`, args);
    // the starting coins of a new save (kind open) are not earnings
    const lg = await db.query(`SELECT floor(at / 86400000)::int AS d, COALESCE(sum(delta) FILTER (WHERE delta > 0), 0)::bigint AS earned,
      COALESCE(-sum(delta) FILTER (WHERE delta < 0), 0)::bigint AS spent FROM zz.ledger WHERE at >= $1 AND at < $2 AND kind <> 'open' GROUP BY 1`, args);
    const by = (rows, k) => { const o = {}; rows.forEach(r => { o[r.d] = k ? (o[r.d] || []).concat(r) : r; }); return o; };
    const NP = by(np), AP = by(ap), MM = by(mm, 1), BX = by(bx, 1), LG = by(lg), items = [];
    for (let t = from; t <= to; t += DAY) {
      const d = Math.floor(t / DAY), modes = {}, grades = {};
      (MM[d] || []).forEach(r => { modes[r.mode] = r.n; });
      (BX[d] || []).forEach(r => { grades[r.grade] = r.n; });
      items.push({
        date: iso(t).slice(0, 10), newPlayers: NP[d] ? NP[d].n : 0, activePlayers: AP[d] ? AP[d].n : 0,
        matches: modes, rankedGames: modes.rank || 0, onlineMatches: modes.net || 0, boxesOpened: grades,
        coinsEarned: str(LG[d] ? LG[d].earned : 0), coinsSpent: str(LG[d] ? LG[d].spent : 0),
        newSubs: null, steamNewPlayers: null, steamActivePlayers: null
      });
    }
    return { timezone: 'UTC', from: iso(from).slice(0, 10), to: iso(to).slice(0, 10), items, generatedAt: iso(now) };
  }
};

// which handler a path is: 'overview' … or ['player', id]; null for none
function route(p) {
  p = String(p || '').replace(/^\/+|\/+$/g, '');
  if (p === 'overview' || p === 'players' || p === 'draws' || p === 'matches' || p === 'metrics') return [p];
  if (p === 'metrics/daily') return ['daily'];
  if (p === 'metrics/games') return ['games'];
  const m = /^players\/([^/]+)$/.exec(p);
  if (m) return ['player', m[1]];
  return null;
}

// one call: { status, body, sub, jti, path } for app.js to send and log
async function serve(db, method, path, query, auth, now, env) {
  const out = (status, body, extra) => Object.assign({ status, body, path }, extra || {});
  if (method !== 'GET') return out(405, { error: 'method' }, { allow: 'GET' });
  const s = settings(env);
  if (!s) return out(503, { error: 'disabled' });
  const who = await check(auth, s, now);
  if (!who.ok) return out(who.status, { error: who.status === 403 ? 'forbidden' : who.status === 503 ? 'unavailable' : 'unauthorized' }, { sub: who.sub || null, jti: who.jti || null, why: who.why });
  const tag = { sub: who.sub, jti: who.jti };
  const r = route(path);
  if (!r) return out(404, { error: 'not_found' }, tag);
  if (!db) return out(503, { error: 'unavailable' }, tag);
  const slot = Math.floor(now / 60000), key = 'adm:' + crypto.createHash('sha256').update(who.sub).digest('hex').slice(0, 24) + ':' + slot;
  const [n] = await db.query('INSERT INTO zz.rate (k, n, exp) VALUES ($1, 1, $2) ON CONFLICT (k) DO UPDATE SET n = zz.rate.n + 1 RETURNING n', [key, (slot + 2) * 60000]);
  if (n.n > PER_MIN) return out(429, { error: 'slow' }, Object.assign({ retry: 60 - Math.floor(now / 1000) % 60 }, tag));
  try {
    if (r[0] === 'player') {
      if (!isUuid(r[1])) return out(404, { error: 'not_found' }, tag);
      const p = await H.player(db, query, now, r[1].toLowerCase());
      return p ? out(200, p, tag) : out(404, { error: 'not_found' }, tag);
    }
    return out(200, await H[r[0]](db, query, now), tag);
  } catch (e) {
    if (e && e.bad) return out(400, { error: 'bad_request' }, tag);
    throw e;
  }
}
// the audit line: who, which token, what, how it went. Never the token itself or the query string.
async function audit(db, now, o) {
  await db.query('INSERT INTO zz.admin_log (at, sub, jti, path, status) VALUES ($1, $2, $3, $4, $5)',
    [now, o.sub ? String(o.sub).slice(0, 100) : null, o.jti ? String(o.jti).slice(0, 200) : null, String(o.path || '').slice(0, 120), o.status]);
}

module.exports = { serve, audit, settings, configured, route, ISSUER, JWKS_URL, AUD, SCOPE, SERVICE,
  setFetch(fn) { fetcher = fn; cache = { src: '', at: 0, tried: 0, keys: null }; }, clearCache() { cache = { src: '', at: 0, tried: 0, keys: null }; } };
