'use strict';
/* The one door to the database.

   The connection string is read from the environment (Vercel puts it there when the Neon store is linked to the
   project) and never appears anywhere else: not in the repository, not in a response, not in a log line.
   Queries go to Neon over HTTPS, one request per query or per small transaction, so nothing stays connected
   between requests. Every value travels as a parameter; no SQL is ever built from what a player sent.

   Tests and the local dev server swap in an in-process Postgres with use(). */

let impl = null, tried = false;
const TIMEOUT_MS = 8000;

// A staging setup (a Vercel Preview with IDENTITY_STAGING=1 or BRICKDUEL_ADMIN_TEST_TRUST=1) never reads the
// production database, even though Preview deployments are given the same DATABASE_URL: it uses STAGING_DATABASE_URL
// only, and with that not set it has no database at all (everything that needs one answers 503).
function staging(env) {
  env = env || process.env;
  return env.VERCEL_ENV !== 'production' && (env.IDENTITY_STAGING === '1' || env.BRICKDUEL_ADMIN_TEST_TRUST === '1');
}
// Which database this is, for /api/health (no address, no name): 'main', 'staging', 'test' (swapped in by use()),
// or, on staging, why there is none: 'staging-missing' (no STAGING_DATABASE_URL) or 'staging-same-as-main' (it
// points at the same Neon endpoint as the main settings, so it is refused).
let source = 'none';
const hostOf = u => { try { return new URL(u).hostname.replace(/-pooler(?=\.)/, '').toLowerCase(); } catch (e) { return ''; } };
function fromEnv() {
  const e = process.env;
  const mains = [e.DATABASE_URL, e.DATABASE_POSTGRES_URL, e.POSTGRES_URL, e.DATABASE_URL_UNPOOLED].filter(Boolean);
  let url;
  if (staging(e)) {
    url = e.STAGING_DATABASE_URL || '';
    if (!url) { source = 'staging-missing'; return null; }
    // a staging setting that names the same endpoint as the main one is a mistake: no database rather than that one
    const h = hostOf(url);
    if (!h || mains.some(m => hostOf(m) === h) || mains.indexOf(url) >= 0) { source = 'staging-same-as-main'; return null; }
    source = 'staging';
  } else {
    url = mains[0] || '';
    if (!url) return null;
    source = 'main';
  }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  const opts = () => ({ fetchOptions: { signal: AbortSignal.timeout(TIMEOUT_MS) } });
  return {
    // rows of one statement
    query: (text, params) => sql.query(text, params || [], opts()),
    // several statements in one transaction, one round trip; gives the rows of each
    batch: list => sql.transaction(list.map(q => sql.query(q[0], q[1] || [])), opts())
  };
}
function get() {
  if (!impl && !tried) { tried = true; impl = fromEnv(); }
  return impl;
}
function use(next) { impl = next; tried = true; source = next ? 'test' : 'none'; }
function configured() { return !!get(); }

// ---------- tables ----------
// Everything lives in its own schema, zz, so it cannot collide with anything else kept in the same database.
// Times are milliseconds since 1970 in a float column and always come from the caller, which keeps them testable.
const SCHEMA = [
  'SELECT pg_advisory_xact_lock(7226001)',   // two cold starts at once must not both create the tables
  'CREATE SCHEMA IF NOT EXISTS zz',
  `CREATE TABLE IF NOT EXISTS zz.players (
     id uuid PRIMARY KEY,
     pub text NOT NULL UNIQUE,
     name text NOT NULL DEFAULT '',
     state jsonb NOT NULL,
     srv jsonb NOT NULL DEFAULT '{}'::jsonb,
     ver integer NOT NULL DEFAULT 1,
     rp integer NOT NULL DEFAULT 0,
     season text NOT NULL DEFAULT '',
     rg integer NOT NULL DEFAULT 0,
     ban boolean NOT NULL DEFAULT false,
     made double precision NOT NULL,
     seen double precision NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS players_rank ON zz.players (season, rp DESC, seen) WHERE rg > 0 AND NOT ban',
  // a save its player asked to delete: hidden at once, kept 30 days, then removed (Owner decision C-022)
  'ALTER TABLE zz.players ADD COLUMN IF NOT EXISTS gone double precision',
  'CREATE INDEX IF NOT EXISTS players_gone ON zz.players (gone) WHERE gone IS NOT NULL',
  'ALTER TABLE zz.players ADD COLUMN IF NOT EXISTS restored double precision',
  // what a purge leaves behind: when, and how many saves; nothing that points to a player
  `CREATE TABLE IF NOT EXISTS zz.purges (
     at double precision PRIMARY KEY,
     n integer NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS zz.keys (
     hash text PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     made double precision NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS keys_pid ON zz.keys (pid)',
  `CREATE TABLE IF NOT EXISTS zz.codes (
     hash text PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     exp double precision NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS codes_pid ON zz.codes (pid)',
  `CREATE TABLE IF NOT EXISTS zz.scores (
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     board text NOT NULL,
     season text NOT NULL,
     val integer NOT NULL,
     at double precision NOT NULL,
     PRIMARY KEY (pid, board, season)
   )`,
  'CREATE INDEX IF NOT EXISTS scores_top ON zz.scores (board, season, val DESC, at)',
  `CREATE TABLE IF NOT EXISTS zz.rate (
     k text PRIMARY KEY,
     n integer NOT NULL,
     exp double precision NOT NULL
   )`,
  // online matches: a room has two seats, and each seat has a letter box the other seat posts into
  `CREATE TABLE IF NOT EXISTS zz.rooms (
     code text PRIMARY KEY,
     hk text NOT NULL,
     jk text,
     exp double precision NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS zz.mail (
     room text NOT NULL REFERENCES zz.rooms(code) ON DELETE CASCADE,
     dst smallint NOT NULL,
     n integer NOT NULL,
     body jsonb NOT NULL,
     PRIMARY KEY (room, dst, n)
   )`,
  // rooms for more than two: ks holds the hash of every seat's key in seat order (the host is first), cap is how
  // many seats there are. Letters now say who wrote them, so each writer keeps its own numbering (zz.post replaces zz.mail).
  "ALTER TABLE zz.rooms ADD COLUMN IF NOT EXISTS ks text[] NOT NULL DEFAULT '{}'",
  'ALTER TABLE zz.rooms ADD COLUMN IF NOT EXISTS cap smallint NOT NULL DEFAULT 2',
  "UPDATE zz.rooms SET ks = CASE WHEN jk IS NULL THEN ARRAY[hk] ELSE ARRAY[hk, jk] END WHERE ks = '{}'",
  `CREATE TABLE IF NOT EXISTS zz.post (
     room text NOT NULL REFERENCES zz.rooms(code) ON DELETE CASCADE,
     dst smallint NOT NULL,
     src smallint NOT NULL,
     n integer NOT NULL,
     body jsonb NOT NULL,
     PRIMARY KEY (room, dst, src, n)
   )`,
  // random matchmaking: rooms whose host is waiting for anyone at all. seen is refreshed while the host waits.
  `CREATE TABLE IF NOT EXISTS zz.queue (
     code text PRIMARY KEY REFERENCES zz.rooms(code) ON DELETE CASCADE,
     made double precision NOT NULL,
     seen double precision NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS queue_made ON zz.queue (made)',
  // SnowRealm Identity: one platform player to one 轉磚 save (used only when IDENTITY_LINK_ENABLED is on; see server/identity.js)
  `CREATE TABLE IF NOT EXISTS zz.identity (
     platform_id uuid PRIMARY KEY,
     pid uuid NOT NULL UNIQUE REFERENCES zz.players(id) ON DELETE CASCADE,
     linked_at double precision NOT NULL,
     provider_hint text NOT NULL DEFAULT ''
   )`,
  // platform tokens already used for linking or recovery (each jti once)
  `CREATE TABLE IF NOT EXISTS zz.idjti (
     jti text PRIMARY KEY,
     exp double precision NOT NULL
   )`,
  // which matchmaking pool a waiting room is in ('' ordinary battles, 'wx' weather battles)
  "ALTER TABLE zz.queue ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT ''",
  // what the waiting player plays on ('pc' keyboard, 'touch' phone or tablet): the same kind are matched first
  "ALTER TABLE zz.queue ADD COLUMN IF NOT EXISTS dev text NOT NULL DEFAULT ''",
  // a member's own pictures and music uploaded to R2 (server/files.js): one row per file; hidden ones are off the list
  `CREATE TABLE IF NOT EXISTS zz.files (
     id text PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     kind text NOT NULL,
     name text NOT NULL,
     size bigint NOT NULL,
     type text NOT NULL,
     at double precision NOT NULL,
     ready boolean NOT NULL,
     hidden boolean NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS files_pid ON zz.files (pid, kind)',
  // when a file was taken off the list: 30 days later the daily job deletes it (C-034)
  'ALTER TABLE zz.files ADD COLUMN IF NOT EXISTS hidden_at double precision',
  // ranked matches against people: the two reports (zz.matches ids) of one match, put together once by the server.
  // ok says whether they agreed (then both ratings moved); a pair that disagreed changes nothing.
  `CREATE TABLE IF NOT EXISTS zz.pvp (
     m1 bigint PRIMARY KEY,
     m2 bigint NOT NULL UNIQUE,
     at double precision NOT NULL,
     ok boolean NOT NULL
   )`,
  // every treasure box opened, kept so the published odds can be checked against what was really drawn
  `CREATE TABLE IF NOT EXISTS zz.draws (
     id bigserial PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     at double precision NOT NULL,
     boxes jsonb NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS draws_at ON zz.draws (at)',
  // the wheel and the slot machine are logged in the same table (kind says which)
  "ALTER TABLE zz.draws ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'box'",
  // every finished match a cloud save reports, kept a year: one line per player, so an online match has a line from
  // each seat (put together by room). proven says whether the piece placements backed the report up.
  `CREATE TABLE IF NOT EXISTS zz.matches (
     id bigserial PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     at double precision NOT NULL,
     mode text NOT NULL,
     result smallint NOT NULL,
     proven boolean NOT NULL,
     room text NOT NULL DEFAULT '',
     seats smallint NOT NULL DEFAULT 1,
     data jsonb NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS matches_at ON zz.matches (at)',
  'CREATE INDEX IF NOT EXISTS matches_pid ON zz.matches (pid, at)',
  "CREATE INDEX IF NOT EXISTS matches_room ON zz.matches (room, at) WHERE room <> ''",
  // the coin ledger: one line per change to a player's coins, written by the server from what the rules did. key is
  // the change's own id from the page (or sys:<time> for the server's own, such as a new day), so a retried save
  // never writes a line twice.
  `CREATE TABLE IF NOT EXISTS zz.ledger (
     id bigserial PRIMARY KEY,
     pid uuid NOT NULL REFERENCES zz.players(id) ON DELETE CASCADE,
     key text NOT NULL,
     kind text NOT NULL,
     why text NOT NULL DEFAULT '',
     delta integer NOT NULL,
     bal integer NOT NULL,
     at double precision NOT NULL,
     UNIQUE (pid, key)
   )`,
  'CREATE INDEX IF NOT EXISTS ledger_at ON zz.ledger (at)',
  // every rewarded-ad callback the network vouched for, so one ad never pays twice
  // the game's words in every language, copied from the build (server/i18n-data.json) so the admin side can read
  // them. src: human (written in the code), machine (tools/i18n-auto.py), hans (made from 繁體 by the character
  // table), zh (no translation yet: the Chinese is shown), admin (edited in the database: never overwritten here)
  `CREATE TABLE IF NOT EXISTS zz.i18n (
     k text NOT NULL,
     lang text NOT NULL,
     text text NOT NULL,
     src text NOT NULL,
     zh text NOT NULL,
     at double precision NOT NULL,
     PRIMARY KEY (k, lang)
   )`,
  `CREATE TABLE IF NOT EXISTS zz.i18nmeta (
     id integer PRIMARY KEY,
     ver text NOT NULL,
     at double precision NOT NULL
   )`,
  // each member's file keys (server/files.js). k: the key our server keeps, used to lock files in the browser before
  // upload (mode s). vault: the player's own key for mode p, locked twice in the browser, once with their password and
  // once with their recovery code; the server cannot open it. Never sent to R2.
  `CREATE TABLE IF NOT EXISTS zz.filekeys (
     pid uuid PRIMARY KEY REFERENCES zz.players(id) ON DELETE CASCADE,
     k text NOT NULL,
     vault jsonb,
     at double precision NOT NULL
   )`,
  "ALTER TABLE zz.files ADD COLUMN IF NOT EXISTS enc text NOT NULL DEFAULT ''",
  // an email address a member chose to give, so the recovery code of "my own password" can be mailed back to them
  // (server/mail.js). rcode is locked with ESCROW_KEY (a server setting, not here). pend_*: an address waiting to be
  // proven with the six-digit code (pin holds its hash).
  `CREATE TABLE IF NOT EXISTS zz.mailbox (
     pid uuid PRIMARY KEY REFERENCES zz.players(id) ON DELETE CASCADE,
     email text NOT NULL,
     rcode text NOT NULL,
     verified boolean NOT NULL,
     pend_email text,
     pend_rcode text,
     pin text,
     pin_exp double precision NOT NULL DEFAULT 0,
     tries smallint NOT NULL DEFAULT 0,
     at double precision NOT NULL
   )`,
  // "connect to SnowRealm Games" sessions (server/bff.js): id is the hash of the cookie's session id; box and res are
  // encrypted with a key derived from that id (so this table alone cannot read them) and cleared once used
  `CREATE TABLE IF NOT EXISTS zz.authsess (
     id text PRIMARY KEY,
     intent text NOT NULL,
     pid uuid,
     cred text,
     box text,
     made double precision NOT NULL,
     exp double precision NOT NULL,
     used double precision,
     outcome text,
     res text,
     res_exp double precision NOT NULL DEFAULT 0
   )`,
  // every call to the read-only admin API whose token checked out (server/admin.js): who, which token id, what, how
  // it went. Never the token, the query string or a network address. Kept for audit; clearing old lines waits for the Owner.
  `CREATE TABLE IF NOT EXISTS zz.admin_log (
     id bigserial PRIMARY KEY,
     at double precision NOT NULL,
     sub text,
     jti text,
     path text NOT NULL,
     status smallint NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS admin_log_at ON zz.admin_log (at)',
  `CREATE TABLE IF NOT EXISTS zz.adtx (
     tx text PRIMARY KEY,
     pid uuid REFERENCES zz.players(id) ON DELETE CASCADE,
     at double precision NOT NULL,
     paid boolean NOT NULL
   )`
];
let migrating = null;
function migrate() {
  if (!migrating) {
    migrating = get().batch(SCHEMA.map(q => [q, []])).then(() => true, e => { migrating = null; throw e; });
  }
  return migrating;
}
// undefined table, undefined schema, undefined column: the tables are not there yet (or are older than this code)
function missing(e) { return !!e && (e.code === '42P01' || e.code === '3F000' || e.code === '42703'); }

// Runs fn(db). The tables are created the first time something finds them missing, so a normal request pays nothing for it.
async function run(fn) {
  const db = get();
  if (!db) { const e = new Error('no database configured'); e.status = 503; e.why = 'nodb'; throw e; }
  try { return await fn(db); } catch (e) {
    if (!missing(e)) throw e;
    migrating = null;
    await migrate();
    return await fn(db);
  }
}

module.exports = { get, use, configured, run, migrate, missing, SCHEMA, staging, source: () => { get(); return source; } };
