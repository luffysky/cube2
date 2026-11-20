'use strict';
/* How much of the audit log and the sign-in scratch table is past the time it is meant to be kept. Read only: this
   counts, it never deletes. The clearing itself is a proposal (docs/RETENTION_PROPOSAL.md) waiting for the Owner. */
const DAY = 86400000, AUDIT_DAYS = 180, SESSION_GRACE_DAYS = 1;
const iso = ms => ms == null ? null : new Date(+ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function watch(db, now) {
  const [a] = await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE at < $1)::int AS old, min(at) AS oldest FROM zz.admin_log`, [now - AUDIT_DAYS * DAY]);
  const [s] = await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE exp < $1)::int AS expired,
    count(*) FILTER (WHERE exp < $1 AND (box IS NOT NULL OR res IS NOT NULL))::int AS expired_data FROM zz.authsess`, [now - SESSION_GRACE_DAYS * DAY]);
  return {
    adminLog: { rows: a.n, pastKeep: a.old, keepDays: AUDIT_DAYS, oldest: iso(a.oldest) },
    authSessions: { rows: s.n, expired: s.expired, expiredWithData: s.expired_data }
  };
}
module.exports = { watch, AUDIT_DAYS };
