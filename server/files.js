'use strict';
/* A member's own pictures and music in the cloud (Cloudflare R2), when the player chooses to upload them.

   Off until these environment variables are set in Vercel (names only; the values never leave the server):
     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
   and the bucket allows PUT and GET from the game's own site (CORS). /api/health then says files: true and the page
   turns the upload choice on.

   The files themselves never pass through our server: it hands the page a signed address, good for a few minutes, to
   put one file straight into the bucket (or to read one back), under u/<player id>/<kind>/<file id>. Each file has a
   row in zz.files (whose it is, its name, kind and size), so the limits hold and a list can be given back on another
   device. Taking a file off the list hides the row; the object stays in the bucket until removal is approved (the
   Owner decides on deletions). */
const crypto = require('crypto');

const KINDS = { pics: { max: 5 * 1024 * 1024, total: 20 * 1024 * 1024, count: 10, type: /^image\/(png|jpeg|webp|gif)$/ },
  music: { max: 15 * 1024 * 1024, total: 200 * 1024 * 1024, count: 30, type: /^audio\/[a-z0-9.+-]{1,30}$/ } };
const PUT_SECS = 600, GET_SECS = 3600;

function conf() {
  const e = process.env;
  if (!e.R2_ACCOUNT_ID || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET) return null;
  return { host: e.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com', id: e.R2_ACCESS_KEY_ID, secret: e.R2_SECRET_ACCESS_KEY, bucket: e.R2_BUCKET };
}
const configured = () => !!conf();

// ---------- AWS signature v4, query-string form (what R2 takes for a signed address) ----------
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const hex = b => Buffer.from(b).toString('hex');
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function presign(method, key, secs, now, extraHeaders) {
  const c = conf();
  if (!c) return null;
  const d = new Date(now), amz = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), day = amz.slice(0, 8);
  const scope = day + '/auto/s3/aws4_request', path = '/' + c.bucket + '/' + key.split('/').map(enc).join('/');
  const headers = Object.assign({ host: c.host }, extraHeaders || {}), names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': c.id + '/' + scope, 'X-Amz-Date': amz, 'X-Amz-Expires': String(secs), 'X-Amz-SignedHeaders': names.join(';') };
  const qs = Object.keys(q).sort().map(k => enc(k) + '=' + enc(q[k])).join('&');
  const lower = {}; Object.keys(headers).forEach(h => { lower[h.toLowerCase()] = String(headers[h]).trim(); });
  const canon = [method, path, qs, names.map(h => h + ':' + lower[h] + '\n').join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, hex(crypto.createHash('sha256').update(canon).digest())].join('\n');
  const kDate = hmac('AWS4' + c.secret, day), kSign = hmac(hmac(hmac(kDate, 'auto'), 's3'), 'aws4_request');
  return 'https://' + c.host + path + '?' + qs + '&X-Amz-Signature=' + hex(hmac(kSign, toSign));
}

const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const no = (status, why) => ({ status, body: { ok: false, why } });
const isMember = (state, now) => !!(state && state.sub && state.sub.until > now);
const cleanName = v => String(v == null ? '' : v).replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, '').slice(0, 60) || 'file';

// a signed address to put one file, after the limits are checked; the row waits as not ready until fileOk
async function up(db, row, body, now) {
  if (!configured()) return no(503, 'off');
  const K = KINDS[body.kind];
  if (!K) return no(400, 'kind');
  if (!isMember(row.state, now)) return no(403, 'member');
  const size = Math.floor(+body.size), type = String(body.type || '');
  if (!(size > 0) || size > K.max) return no(413, 'big');
  if (!K.type.test(type)) return no(415, 'type');
  const used = (await db.query('SELECT count(*)::int AS n, COALESCE(sum(size), 0)::bigint AS s FROM zz.files WHERE pid = $1 AND kind = $2 AND NOT hidden', [row.id, body.kind]))[0];
  if (used.n >= K.count || +used.s + size > K.total) return no(409, 'full');
  const id = crypto.randomBytes(9).toString('base64url'), key = 'u/' + row.id + '/' + body.kind + '/' + id;
  await db.query('INSERT INTO zz.files (id, pid, kind, name, size, type, at, ready, hidden) VALUES ($1, $2, $3, $4, $5, $6, $7, false, false)', [id, row.id, body.kind, cleanName(body.name), size, type, now]);
  return ok({ id, url: presign('PUT', key, PUT_SECS, now, { 'content-type': type }), type, exp: now + PUT_SECS * 1000 });
}
// the upload went through: the file goes on the list
async function done(db, row, body) {
  const r = await db.query('UPDATE zz.files SET ready = true WHERE id = $1 AND pid = $2 AND NOT hidden RETURNING id', [String(body.id || ''), row.id]);
  return r[0] ? ok({ id: r[0].id }) : no(404, 'file');
}
// what this player has uploaded, with an address to read each one for the next hour
async function list(db, row, body, now) {
  if (!configured()) return no(503, 'off');
  const kind = KINDS[body.kind] ? body.kind : null;
  if (!kind) return no(400, 'kind');
  const rows = await db.query('SELECT id, name, size, type, at FROM zz.files WHERE pid = $1 AND kind = $2 AND ready AND NOT hidden ORDER BY at', [row.id, kind]);
  return ok({ files: rows.map(f => ({ id: f.id, name: f.name, size: +f.size, type: f.type, at: f.at, url: presign('GET', 'u/' + row.id + '/' + kind + '/' + f.id, GET_SECS, now) })) });
}
// off the list (the object itself stays until deletions are approved)
async function hide(db, row, body) {
  const r = await db.query('UPDATE zz.files SET hidden = true WHERE id = $1 AND pid = $2 RETURNING id', [String(body.id || ''), row.id]);
  return r[0] ? ok({ id: r[0].id }) : no(404, 'file');
}

module.exports = { configured, presign, up, done, list, hide, KINDS };
