'use strict';
/* 轉磚 → SnowRealm Games: a copy of every linked save, kept up to date (Owner decision C-042). One way only: Games keeps
   and shows the copy, 轉磚 stays the authority. The receiving side is cube1's (docs/BRICKDUEL_SAVE_SYNC.md there,
   PR #23); this follows its contract.

   Off unless all of this is set (names only; values live in the hosting settings, never here):
     SAVE_SYNC_ENABLED       "1" to send; anything else sends nothing and queues nothing
     SAVE_SYNC_URL           where an event goes, with {platformId} in it, https only
                             (production https://identity.snowrealm.pet/v1/games/brickduel/saves/{platformId},
                              staging the same on identity-staging.snowrealm.pet)
     SAVE_SYNC_PRIVATE_JWK   this environment's own Ed25519 signing key (a private JWK; never shared, never logged)
     SAVE_SYNC_ISSUER        this environment's origin; production may leave it out (https://brickduel.snowrealm.pet),
                             anywhere else it must be set (staging: https://brickduel-staging.snowrealm.pet)
   The public half is published at /.well-known/sync-jwks.json on this origin whenever the key is set, so Games can
   check the tokens before sending is switched on. No secret is shared between the two sides.

   Events (PUT, JSON), only for saves linked to a SnowRealm Games account:
     upsert  { schema, platformId, gameUserId, generation, ver, at, event, publicTag, state }   the whole save (its
             30 normalized fields: never device keys, transfer codes, the server's own notes, addresses or e-mail)
     hide    the same without publicTag and state: its player deleted it (it can still be taken back for 30 days;
             taken back, an upsert follows)
     purge   likewise: the save is gone for good; nothing more is ever sent for it
   generation: one per save an account has had here (1, then 2 for a save linked after the first one was purged, which
   waits until that purge has been acknowledged). ver: a new, higher number for every attempt, so no two sends of
   different content ever share one. at: when that attempt was made. Each signed with a token made here (EdDSA, iss
   this origin, aud snowrealm:games:save-sync, sub svc:brickduel, scope save:write, five minutes, a jti of its own).

   How: zz.syncs keeps one row per linked save (kept after the save is deleted, until its purge is acknowledged). A
   change marks it due; the request that made the change sends it at once (a few seconds at most), and what does not
   go through is tried again further apart each time (the next requests and the daily job pick it up). Answers:
     200 (applied, duplicate or stale)  done
     409 (a version or binding conflict) kept aside for a person to look at, with a line in the log
     429, 5xx, no answer                 tried again later; an update is put aside after a day, a purge never is
     any other                           kept aside, with a line in the log
   Nothing put aside is lost: the next change to that save tries again, and the rows stay for investigation. */
const crypto = require('crypto');

const SCHEMA = 'brickduel.save.v1', AUD = 'snowrealm:games:save-sync', PROD = 'https://brickduel.snowrealm.pet';
const SUB = 'svc:brickduel', SCOPE = 'save:write', LIFE = 300, SEND_MS = 3000, GIVE_UP = 86400000;
let fetcher = null;                  // tests put their own here
const backoff = tries => Math.min(6 * 3600000, 30000 * Math.pow(2, Math.max(0, tries - 1)));

function keyOf(env) {
  const raw = env.SAVE_SYNC_PRIVATE_JWK;
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw);
    if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.d !== 'string') return null;
    const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
    const pub = crypto.createPublicKey(key).export({ format: 'jwk' });
    // the key's id: the RFC 7638 thumbprint of its public half
    const kid = crypto.createHash('sha256').update(JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: pub.x })).digest('base64url');
    return { key, kid, x: pub.x };
  } catch (e) { return null; }
}
function settings(env) {
  env = env || process.env;
  if (env.SAVE_SYNC_ENABLED !== '1') return null;
  const url = String(env.SAVE_SYNC_URL || ''), tests = !!env.SAVE_SYNC_ALLOW_HTTP_FOR_TESTS;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/\S*\{platformId\}\S*$/i.test(url) && !(tests && /^http:\/\/\S*\{platformId\}/.test(url))) return null;
  const iss = env.SAVE_SYNC_ISSUER || (env.VERCEL_ENV === 'production' ? PROD : '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(iss)) return null;
  const k = keyOf(env);
  return k ? { url, iss, key: k.key, kid: k.kid } : null;
}
const enabled = env => !!settings(env);
// the public key, for anyone (Games checks the tokens with it); empty when no key is set
function jwks(env) {
  const k = keyOf(env || process.env);
  return { keys: k ? [{ kty: 'OKP', crv: 'Ed25519', x: k.x, kid: k.kid, use: 'sig', alg: 'EdDSA' }] : [] };
}
function token(s, now) {
  const sec = Math.floor(now / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b64({ alg: 'EdDSA', typ: 'JWT', kid: s.kid }) + '.' + b64({ iss: s.iss, aud: AUD, sub: SUB, scope: SCOPE, iat: sec, exp: sec + LIFE, jti: crypto.randomUUID() });
  return data + '.' + crypto.sign(null, Buffer.from(data), s.key).toString('base64url');
}

// a linked save changed: mark it due (nothing for a save that is not linked, or while this is off). A first row for a
// save takes the next generation of its account.
async function touch(db, pid, now, env) {
  if (!pid || !enabled(env)) return;
  try { await mark(db, pid, now); } catch (e) {
    // the table is new: made the first time it is needed, like the others (server/db.js)
    const dbm = require('./db.js');
    if (!dbm.missing(e)) throw e;
    await dbm.migrate();
    await mark(db, pid, now);
  }
}
async function mark(db, pid, now) {
  await db.query(`INSERT INTO zz.syncs (pid, platform_id, gen, due, first)
    SELECT $1::uuid, i.platform_id, COALESCE((SELECT max(s.gen) FROM zz.syncs s WHERE s.platform_id = i.platform_id), 0) + 1, $2::float8, $2::float8
    FROM zz.identity i WHERE i.pid = $1::uuid
    ON CONFLICT (pid) DO UPDATE SET rev = zz.syncs.rev + 1,
      tries = CASE WHEN zz.syncs.due IS NULL THEN 0 ELSE zz.syncs.tries END,
      first = CASE WHEN zz.syncs.due IS NULL THEN EXCLUDED.first ELSE zz.syncs.first END,
      due = LEAST(COALESCE(zz.syncs.due, EXCLUDED.due), EXCLUDED.due), err = NULL
    WHERE NOT zz.syncs.ended`, [pid, now]);
}

// one save's event; 'sent' | 'later' | 'aside'
async function sendOne(db, s, pid, now) {
  const rows = await db.query('SELECT pid, platform_id, gen, rev, tries, first FROM zz.syncs WHERE pid = $1 AND NOT ended', [pid]);
  const row = rows[0];
  if (!row) return 'sent';
  const aside = async (note, log) => {
    if (log) console.warn('[zz] savesync ' + note);
    await db.query('UPDATE zz.syncs SET due = NULL, err = $3 WHERE pid = $1 AND rev = $2', [pid, row.rev, note]);
    return 'aside';
  };
  // a new save for an account waits until the one before it is purged there
  const before = await db.query('SELECT 1 FROM zz.syncs WHERE platform_id = $1 AND gen < $2 AND NOT ended LIMIT 1', [row.platform_id, row.gen]);
  if (before[0]) { await db.query('UPDATE zz.syncs SET due = $2, err = $3 WHERE pid = $1', [pid, now + backoff(row.tries + 1), 'waiting for the earlier save']); return 'later'; }
  const p = (await db.query('SELECT p.pub, p.state, p.gone, (SELECT count(*) FROM zz.identity i WHERE i.pid = p.id)::int AS linked FROM zz.players p WHERE p.id = $1', [pid]))[0];
  if (p && !p.linked) return aside('unlinked');
  const event = !p ? 'purge' : p.gone != null ? 'hide' : 'upsert';
  const ver = Number((await db.query('UPDATE zz.syncs SET sver = sver + 1 WHERE pid = $1 RETURNING sver', [pid]))[0].sver);
  const body = { schema: SCHEMA, platformId: row.platform_id, gameUserId: pid, generation: row.gen, ver, at: new Date(now).toISOString(), event };
  if (event === 'upsert') { body.publicTag = p.pub; body.state = require('./rules.js').current(p.state, now); }
  let status = 0, why = '', answer = null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), SEND_MS);
  try {
    const res = await (fetcher || fetch)(s.url.replace('{platformId}', encodeURIComponent(row.platform_id)), {
      method: 'PUT', signal: ctl.signal, redirect: 'error',
      headers: { Authorization: 'Bearer ' + token(s, now), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    status = res.status;
    try { answer = await res.json(); } catch (e) { answer = null; }
  } catch (e) { why = e && e.name === 'AbortError' ? 'timeout' : 'fetch'; } finally { clearTimeout(timer); }
  const code = answer && typeof answer.error === 'string' && /^[a-z_]{1,40}$/.test(answer.error) ? answer.error : '';
  if (status === 200) {
    // applied, duplicate or stale: Games has this or something newer. A change that came in meanwhile stays due.
    await db.query(`UPDATE zz.syncs SET due = CASE WHEN rev = $2 THEN NULL ELSE due END, tries = 0, first = NULL, err = NULL, sent = $3,
      ended = $4 WHERE pid = $1`, [pid, row.rev, now, event === 'purge']);
    return 'sent';
  }
  if (status === 409) return aside(event + ' conflict' + (code ? ' ' + code : ''), true);
  if (!(why || status === 429 || status >= 500)) return aside(event + ' refused http ' + status + (code ? ' ' + code : ''), true);
  const tries = row.tries + 1, note = why || 'http ' + status;
  // updates and hides give up after a day (the next change tries again); a purge keeps trying until it is heard
  if (event !== 'purge' && now - (row.first || now) >= GIVE_UP) return aside(event + ' gave up (' + note + ', ' + tries + ' tries)', true);
  await db.query('UPDATE zz.syncs SET tries = $2, due = $3, err = $4 WHERE pid = $1', [pid, tries, now + backoff(tries), note]);
  return 'later';
}

// sends what is due: first the save named (the one the current request changed), then up to max others. The saves
// deleted for good since the last time are found here and their purge is made due.
async function drain(db, now, max, first, env) {
  const s = settings(env);
  if (!s) return { sent: 0, later: 0, aside: 0 };
  const out = { sent: 0, later: 0, aside: 0 }, seen = {};
  const one = async pid => { if (seen[pid]) return; seen[pid] = 1; out[await sendOne(db, s, pid, now)]++; };
  try {
    if (first) { const f = await db.query('SELECT pid FROM zz.syncs WHERE pid = $1 AND due <= $2 AND NOT ended', [first, now]); if (f[0]) await one(first); }
    if (max > 0) {
      await db.query(`UPDATE zz.syncs s SET due = $1, first = $1, tries = 0 WHERE NOT s.ended AND s.due IS NULL AND s.err IS NULL
        AND NOT EXISTS (SELECT 1 FROM zz.players p WHERE p.id = s.pid)`, [now]);
      for (const r of await db.query('SELECT pid FROM zz.syncs WHERE due <= $1 AND NOT ended ORDER BY due LIMIT $2', [now, max])) await one(r.pid);
    }
  } catch (e) { if (!require('./db.js').missing(e)) throw e; }    // nothing linked has changed since this was switched on
  return out;
}

module.exports = { settings, enabled, jwks, touch, drain, SCHEMA, AUD, SUB, SCOPE, setFetch(fn) { fetcher = fn; } };
