'use strict';
/* A real Postgres running inside the Node process (PGlite), wearing the same two-function face as server/db.js.
   Used by the tests and by tools/dev-server.js so the API can be worked on with no database account and no network.
   Never loaded in production. */
const { PGlite } = require('@electric-sql/pglite');

function make() {
  const pg = new PGlite();
  let calls = 0;
  return {
    query: (text, params) => { calls++; return pg.query(text, params || []).then(r => r.rows); },
    batch: list => {
      calls++;
      return pg.transaction(async tx => {
        const out = [];
        for (const q of list) out.push((await tx.query(q[0], q[1] || [])).rows);
        return out;
      });
    },
    calls: () => calls,     // round trips so far, for tests that count them
    close: () => pg.close(),
    raw: pg
  };
}
module.exports = { make };
