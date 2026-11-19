'use strict';
/* The one door to the database.

   The connection string is read from the environment (Vercel puts it there when the Neon store is linked to the
   project) and never appears anywhere else: not in the repository, not in a response, not in a log line.
   Queries go to Neon over HTTPS, one request per query or per small transaction, so nothing stays connected
   between requests. Every value travels as a parameter; no SQL is ever built from what a player sent.

   Tests and the local dev server swap in an in-process Postgres with use(). */

let impl = null, tried = false;
const TIMEOUT_MS = 8000;

function fromEnv() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || '';
  if (!url) return null;
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
function use(next) { impl = next; tried = true; }
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

module.exports = { get, use, configured, run, migrate, missing, SCHEMA };
