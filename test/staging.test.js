'use strict';
// A staging setup on a Vercel Preview never reaches the production database (server/db.js staging()).
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL', name); } }
const KEYS = ['VERCEL_ENV', 'IDENTITY_STAGING', 'BRICKDUEL_ADMIN_TEST_TRUST', 'DATABASE_URL', 'STAGING_DATABASE_URL'];
function fresh(env) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../server/db.js')];
  return require('../server/db.js');
}
const PROD = 'postgres://prod.invalid/db', STG = 'postgres://staging.invalid/db';
let db = fresh({ DATABASE_URL: PROD, VERCEL_ENV: 'production', IDENTITY_STAGING: '1', BRICKDUEL_ADMIN_TEST_TRUST: '1' });
ok(!db.staging() && db.configured(), 'production: the flags are ignored and the production database is used');
db = fresh({ DATABASE_URL: PROD, VERCEL_ENV: 'preview' });
ok(!db.staging() && db.configured(), 'an ordinary Preview is unchanged');
db = fresh({ DATABASE_URL: PROD, VERCEL_ENV: 'preview', IDENTITY_STAGING: '1' });
ok(db.staging() && !db.configured(), 'staging login without its own database: no database at all (not production)');
db = fresh({ DATABASE_URL: PROD, VERCEL_ENV: 'preview', BRICKDUEL_ADMIN_TEST_TRUST: '1' });
ok(db.staging() && !db.configured(), 'staging admin trust without its own database: no database at all');
db = fresh({ DATABASE_URL: PROD, STAGING_DATABASE_URL: STG, VERCEL_ENV: 'preview', IDENTITY_STAGING: '1' });
ok(db.staging() && db.configured(), 'with STAGING_DATABASE_URL it has a database (that one)');
for (const k of KEYS) delete process.env[k];
console.log('staging tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
