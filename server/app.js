'use strict';
/* The HTTP side: three small endpoints, written against plain Node request and response objects so the same code
   runs as Vercel Functions, behind the local dev server and inside the tests.

     GET  /api/health                     is the API here, and is a database linked
     POST /api/rpc    { a: action, … }    hello · sync · code · redeem · delete · idStatus · idLink · idRecover
     GET  /api/board?b=rp|score|sprint    a leaderboard (&s=all for all-time, &me=<tag> for one player's place)
     POST /api/room   { a: action, … }    open · join · x (exchange messages) · close: rooms for online matches

   Only the page served from the same address may call it: no CORS headers are sent, and a request that names a
   different origin is turned away. A player is known by the bearer token the page keeps, never by a cookie. */

const crypto = require('crypto');
const db = require('./db.js');
const words = require('./words.js');
const core = require('./core.js');
const ads = require('./ads.js');
const rules = require('./rules.js');
const identity = require('./identity.js');
const files = require('./files.js');
const admin = require('./admin.js');
const bff = require('./bff.js');
const retention = require('./retention.js');
const mail = require('./mail.js');

const MAX_BODY = 24 * 1024, MAX_SYNC = 96 * 1024;      // a sync carries the tapes of finished matches, so it may be longer
let clock = () => Date.now();
function setClock(fn) { clock = fn || (() => Date.now()); }

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (extra) for (const k in extra) res.setHeader(k, extra[k]);
  res.end(JSON.stringify(body));
}
function header(req, name) { const v = req.headers && req.headers[name]; return Array.isArray(v) ? v[0] : v; }
// A browser names the page a request came from. If it does, that page has to be this site.
function foreign(req) {
  const origin = header(req, 'origin');
  if (!origin) return false;
  try { return new URL(origin).host !== header(req, 'host'); } catch (e) { return true; }
}
// Addresses are only ever used to slow down abuse, and only as a keyed hash that cannot be turned back into one.
let ipKey = null;
function ipTag(req) {
  if (!ipKey) ipKey = crypto.createHash('sha256').update('zz-rate|' + (process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL || 'local')).digest();
  const raw = String(header(req, 'x-real-ip') || header(req, 'x-forwarded-for') || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim().slice(0, 64);
  return crypto.createHmac('sha256', ipKey).update(raw).digest('base64url').slice(0, 22);
}
function readBody(req, MAX_BODY) {
  MAX_BODY = MAX_BODY || 24 * 1024;
  return new Promise((resolve, reject) => {
    const bad = (status, why) => { const e = new Error(why); e.status = status; e.why = why; reject(e); };
    if (!/^application\/json\b/i.test(header(req, 'content-type') || '')) return bad(415, 'type');
    if (+header(req, 'content-length') > MAX_BODY) return bad(413, 'big');
    const parse = text => { let v; try { v = JSON.parse(text); } catch (e) { return bad(400, 'json'); } if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(400, 'json'); resolve(v); };
    // Vercel has usually read and parsed the body already
    let ready;
    try { ready = req.body; } catch (e) { return bad(400, 'json'); }
    if (ready !== undefined && ready !== null) {
      if (Buffer.isBuffer(ready)) return ready.length > MAX_BODY ? bad(413, 'big') : parse(ready.toString('utf8'));
      if (typeof ready === 'string') return ready.length > MAX_BODY ? bad(413, 'big') : parse(ready);
      if (typeof ready === 'object' && !Array.isArray(ready)) return JSON.stringify(ready).length > MAX_BODY ? bad(413, 'big') : resolve(ready);
      return bad(400, 'json');
    }
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { bad(413, 'big'); req.destroy(); } else parts.push(c); });
    req.on('end', () => parse(Buffer.concat(parts).toString('utf8')));
    req.on('error', () => bad(400, 'json'));
  });
}

const routes = {
  async health(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'GET' });
    const out = { ok: true, app: 'zhuanzhuan', api: 1, db: db.configured(), ads: ads.configured(), files: files.configured(), mail: mail.configured(), link: bff.enabled(), admin: admin.configured(), dbSource: db.source(), build: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, region: process.env.VERCEL_REGION || '', now: clock() };
    if (url.searchParams.get('deep') && out.db) {
      // a look at the database itself: is it reachable, how long does one round trip take
      const t0 = Date.now();
      try { await db.run(d => d.query('SELECT count(*)::int AS n FROM zz.players')); out.ready = true; } catch (e) { out.ready = false; log('health', e); }
      out.ms = Date.now() - t0;
      return send(res, 200, out, { 'Cache-Control': 'public, max-age=0, s-maxage=15' });
    }
    send(res, 200, out, { 'Cache-Control': 'public, max-age=0, s-maxage=60' });
  },
  // "connect to SnowRealm Games" (server/bff.js): start (POST, same site), callback (GET from the portal), result (POST)
  async authStart(req, res) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'POST' });
    if (foreign(req)) return send(res, 403, { ok: false, why: 'origin' });
    if (!bff.enabled()) return send(res, 503, { ok: false, why: 'off' });
    const body = await readBody(req), now = clock(), cred = core.readCred(header(req, 'authorization'));
    const out = await db.run(d => bff.start(d, body, cred, ipTag(req), now, undefined, String(header(req, 'host') || '').toLowerCase()));
    send(res, out.status, out.body, out.cookie ? { 'Set-Cookie': out.cookie } : null);
  },
  async authCallback(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'GET' });
    let outcome, note = '';
    if (!bff.enabled()) outcome = 'off';
    else {
      try { const f = await db.run(d => bff.finish(d, url.searchParams, header(req, 'cookie'), clock(), undefined, String(header(req, 'host') || '').toLowerCase())); outcome = f.outcome; note = f.note || ''; }
      catch (e) { log('auth', e); outcome = 'unavailable'; }
    }
    if (bff.OUTCOMES.indexOf(outcome) < 0) outcome = 'unavailable';
    if (['linked', 'recovered'].indexOf(outcome) < 0) console.warn('[zz] auth ' + outcome + (/^[a-z0-9 ]{1,40}$/.test(note) ? ' (' + note + ')' : ''));
    res.statusCode = 303;
    res.setHeader('Location', '/?auth=' + outcome);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end();
  },
  async authResult(req, res) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'POST' });
    if (foreign(req)) return send(res, 403, { ok: false, why: 'origin' });
    if (!bff.enabled()) return send(res, 503, { ok: false, why: 'off' });
    const out = await db.run(d => bff.result(d, header(req, 'cookie'), clock()));
    send(res, out.status, out.body, out.cookie ? { 'Set-Cookie': out.cookie } : null);
  },
  // the read-only operations API for the SnowRealm Games console (server/admin.js). Reached as
  // /internal/admin/v1/<path> (vercel.json rewrites it here with __ap=<path>). Server to server: no CORS, no-store.
  async admin(req, res, url) {
    const now = clock();
    let path = '';
    const m = /^\/internal\/admin\/v1\/(.*)$/.exec(url.pathname);
    if (m) path = m[1]; else path = url.searchParams.get('__ap') || '';
    const q = new URLSearchParams(url.searchParams); q.delete('__ap');
    const d = db.configured() ? db.get() : null;
    let o;
    try {
      o = await admin.serve(d ? { query: (t, p) => db.run(x => x.query(t, p)) } : null, req.method, path, q, header(req, 'authorization'), now);
    } catch (e) { log('admin', e); o = { status: 503, body: { error: 'unavailable' }, path }; }
    if (o.why && o.status === 401) console.warn('[zz] admin 401 ' + o.why);
    if (o.sub && d) { try { await db.run(x => admin.audit(x, now, o)); } catch (e) { log('admin-audit', e); } }
    const extra = { 'Cache-Control': 'no-store' };
    if (o.allow) extra.Allow = o.allow;
    if (o.retry) extra['Retry-After'] = String(o.retry);
    if (o.status === 401) extra['WWW-Authenticate'] = 'Bearer';
    send(res, o.status, o.body, extra);
  },
  // the daily job (Vercel Cron, see vercel.json): files off the list for more than 30 days leave the bucket.
  // With CRON_SECRET set, only Vercel's call (which carries it) is let in; it only ever deletes what is already due.
  async cron(req, res) {
    if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'GET' });
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const got = Buffer.from(String(header(req, 'authorization') || '')), want = Buffer.from('Bearer ' + secret);
      if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return send(res, 401, { ok: false, why: 'auth' });
    }
    if (!db.configured()) return send(res, 503, { ok: false, why: 'db' });
    const now = clock();
    const out = await db.run(d => files.purge(d, now));
    // how much of the audit log and the sign-in scratch table is past its time: counted only, nothing removed
    let watch = null;
    try { watch = await db.run(d => retention.watch(d, now)); } catch (e) { log('cron-watch', e); }
    if (watch && (watch.adminLog.pastKeep > 0 || watch.authSessions.expired > 1000)) console.warn('[zz] retention ' + JSON.stringify(watch));
    send(res, out.status, Object.assign({}, out.body, { watch }));
  },
  // the rewarded-ad network's callback (GET, signed). Not for pages: nothing is paid without a valid signature.
  async ad(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'GET' });
    if (!ads.configured()) return send(res, 503, { ok: false, why: 'off' });
    const raw = (req.url || '').split('?')[1] || '';
    const v = await ads.verify(raw, { now: clock() });
    if (!v.ok) { log('ad', v.why); return send(res, v.why === 'keys' ? 502 : 403, { ok: false, why: 'denied' }); }
    const out = await db.run(d => core.adReward(d, v.tag, v.tx, clock()));
    send(res, out.status, out.body);
  },
  async board(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'GET' });
    const q = url.searchParams, now = clock();
    const out = await db.run(d => core.board(d, q.get('b') || '', q.get('s') || '', q.get('me') || '', now));
    // the same board for everyone asking within half a minute: one database query, not one per visitor
    send(res, out.status, out.body, out.status === 200 ? { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120' } : null);
  },
  async room(req, res) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'POST' });
    if (foreign(req)) return send(res, 403, { ok: false, why: 'origin' });
    const body = await readBody(req), now = clock();
    let out;
    switch (body.a) {
      case 'x': out = await db.run(d => core.roomExchange(d, body, now)); break;
      case 'open': out = await db.run(d => core.roomOpen(d, body, ipTag(req), now)); break;
      case 'join': out = await db.run(d => core.roomJoin(d, body, ipTag(req), now)); break;
      case 'close': out = await db.run(d => core.roomClose(d, body)); break;
      case 'lock': out = await db.run(d => core.roomLock(d, body, now)); break;
      case 'quick': out = await db.run(d => core.roomQuick(d, body, ipTag(req), now)); break;
      case 'still': out = await db.run(d => core.roomStill(d, body, now)); break;
      default: return send(res, 400, { ok: false, why: 'action' });
    }
    send(res, out.status, out.body);
  },
  async rpc(req, res) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'method' }, { Allow: 'POST' });
    if (foreign(req)) return send(res, 403, { ok: false, why: 'origin' });
    const body = await readBody(req, MAX_SYNC), now = clock(), cred = core.readCred(header(req, 'authorization'));
    await words.sync(now, log);     // the first save an instance handles after a deployment copies the words into the database (once)
    let out;
    switch (body.a) {
      case 'hello':
        out = await db.run(d => core.hello(d, body, ipTag(req), now));
        break;
      case 'sync': {
        const ops = rules.cleanOps(body.ops);
        if (!ops) return send(res, 400, { ok: false, why: 'ops' });
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.sync(d, cred, ops, now));
        break;
      }
      case 'code':
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.makeCode(d, cred, now));
        break;
      case 'redeem':
        out = await db.run(d => core.redeem(d, body, cred, ipTag(req), now));
        break;
      case 'history':
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.history(d, cred, body, now));
        break;
      case 'delete':
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.wipe(d, cred, clock()));
        break;
      case 'restore':
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.restore(d, cred, clock()));
        break;
      // a member's own files in the cloud (R2; off until its keys are set, see server/files.js)
      case 'fileUp': case 'fileOk': case 'fileList': case 'fileHide': case 'fileBack': case 'fileKey': case 'fileVault': {
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(async d => {
          const row = await core.findPlayer(d, cred);
          if (!row || row.pending) return { status: 401, body: { ok: false, why: 'auth' } };
          return body.a === 'fileUp' ? files.up(d, row, body, now) : body.a === 'fileOk' ? files.done(d, row, body, now) : body.a === 'fileList' ? files.list(d, row, body, now)
            : body.a === 'fileBack' ? files.back(d, row, body, now) : body.a === 'fileKey' ? files.key(d, row, now)
            : body.a === 'fileVault' ? files.vault(d, row, body, now) : files.hide(d, row, body, now);
        });
        break;
      }
      // keeping the recovery code with the player's own email address (server/mail.js; opt-in)
      case 'mailStatus': case 'mailStart': case 'mailVerify': case 'mailRemind': case 'mailSwap': {
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(async d => {
          const row = await core.findPlayer(d, cred);
          if (!row || row.pending) return { status: 401, body: { ok: false, why: 'auth' } };
          const a = body.a;
          return a === 'mailStatus' ? mail.status(d, row) : a === 'mailStart' ? mail.start(d, row, body, now) : a === 'mailVerify' ? mail.verify(d, row, body, now)
            : a === 'mailRemind' ? mail.remind(d, row, now) : mail.swap(d, row, body, now);
        });
        break;
      }
      // SnowRealm Identity (off until IDENTITY_LINK_ENABLED is set and the service is live; see server/identity.js)
      case 'idStatus':
        if (!cred) return send(res, 401, { ok: false, why: 'auth' });
        out = await db.run(d => core.idStatus(d, cred, identity.enabled()));
        break;
      case 'idLink': case 'idRecover': {
        if (!identity.enabled()) return send(res, 503, { ok: false, why: 'off' });
        if (body.a === 'idLink' && !cred) return send(res, 401, { ok: false, why: 'auth' });
        const v = await identity.verify(body.idt, { now, need: identity.LINK_SCOPE });
        if (!v.ok) return send(res, v.why === 'jwks' ? 503 : 401, { ok: false, why: 'identity', detail: v.why });
        out = await db.run(d => body.a === 'idLink' ? core.idLink(d, cred, v, now) : core.idRecover(d, v, now, body.back === true));
        break;
      }
      default:
        return send(res, 400, { ok: false, why: 'action' });
    }
    send(res, out.status, out.body);
  }
};

// Log lines say what went wrong and nothing about who asked or how the database is reached.
function log(where, e) {
  const msg = String((e && e.message) || e).replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').slice(0, 240);
  console.error('[zz] ' + where + ' ' + ((e && e.code) || (e && e.name) || '') + ' ' + msg);
}
async function handle(name, req, res) {
  try {
    const url = new URL(req.url || '/', 'http://x');
    await routes[name](req, res, url);
  } catch (e) {
    if (e && e.status && e.why) return send(res, e.status, { ok: false, why: e.why });
    // The database did not answer (too slow, waking up, or the network between here and there): ask the page to try again.
    // The driver wraps such failures and keeps the original in sourceError.
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError' || e.sourceError)) { log(name, e); return send(res, 503, { ok: false, why: 'busy' }, { 'Retry-After': '5' }); }
    log(name, e);
    send(res, 500, { ok: false, why: 'server' });
  }
}

module.exports = { handle, setClock, routes: Object.keys(routes) };
