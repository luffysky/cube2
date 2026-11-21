'use strict';
/* A member's own pictures and music in the cloud (Cloudflare R2), when the player chooses to upload them.

   Off until these environment variables are set in Vercel (names only; the values never leave the server):
     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
   and the bucket allows PUT and GET from the game's own site (CORS). /api/health then says files: true and the page
   turns the upload choice on.

   The files themselves never pass through our server: it hands the page a signed address, good for a few minutes, to
   put one file straight into the bucket (or to read one back), under u/<player id>/<kind>/<file id>. Each file has a
   row in zz.files (whose it is, its name, kind and size), so the limits hold and a list can be given back on another
   device. Taking a file off the list hides it for 30 days (the player can bring it back in that time); after that a
   daily job (api/cron) deletes the object from the bucket and its row. The Owner approved this rule (C-034). */
const crypto = require('crypto');

const KINDS = { pics: { max: 5 * 1024 * 1024, total: 20 * 1024 * 1024, count: 10, type: /^image\/(png|jpeg|webp|gif)$/ },
  music: { max: 15 * 1024 * 1024, total: 200 * 1024 * 1024, count: 30, type: /^audio\/[a-z0-9.+-]{1,30}$/ } };
const PUT_SECS = 600, GET_SECS = 3600, DAY = 86400000, KEEP_DAYS = 30, PURGE_MAX = 200;

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
  const size = Math.floor(+body.size), type = String(body.type || ''), enc = body.enc === 'p' || body.enc === 's' ? body.enc : '';
  if (!(size > 0) || size > K.max) return no(413, 'big');
  if (!K.type.test(type)) return no(415, 'type');
  const used = (await db.query('SELECT count(*)::int AS n, COALESCE(sum(size), 0)::bigint AS s FROM zz.files WHERE pid = $1 AND kind = $2 AND NOT hidden', [row.id, body.kind]))[0];
  if (used.n >= K.count || +used.s + size > K.total) return no(409, 'full');
  const id = crypto.randomBytes(9).toString('base64url'), key = keyOf(row.id, body.kind, id);
  await db.query('INSERT INTO zz.files (id, pid, kind, name, size, type, at, ready, hidden, enc) VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, $8)', [id, row.id, body.kind, cleanName(body.name), size, type, now, enc]);
  return ok({ id, url: presign('PUT', key, PUT_SECS, now, { 'content-type': type }), type, exp: now + PUT_SECS * 1000 });
}
// the upload went through: the file goes on the list. A picture replaces the earlier one of the same name (the wall,
// the tile), which goes to the 30 days of "recently removed".
async function done(db, row, body, now) {
  const r = await db.query('UPDATE zz.files SET ready = true WHERE id = $1 AND pid = $2 AND NOT hidden RETURNING id, kind, name', [String(body.id || ''), row.id]);
  if (!r[0]) return no(404, 'file');
  if (r[0].kind === 'pics') await db.query('UPDATE zz.files SET hidden = true, hidden_at = $4 WHERE pid = $1 AND kind = $2 AND name = $3 AND id <> $5 AND ready AND NOT hidden', [row.id, 'pics', r[0].name, now, r[0].id]);
  return ok({ id: r[0].id });
}
// what this player has uploaded, with an address to read each one for the next hour.
// trash: true lists instead what was taken off in the last 30 days, with the days left to bring it back.
async function list(db, row, body, now) {
  if (!configured()) return no(503, 'off');
  const kind = KINDS[body.kind] ? body.kind : null;
  if (!kind) return no(400, 'kind');
  if (body.trash === true) {
    const gone = await db.query('SELECT id, name, size, type, at, hidden_at FROM zz.files WHERE pid = $1 AND kind = $2 AND ready AND hidden AND COALESCE(hidden_at, $3) > $4 ORDER BY hidden_at DESC NULLS FIRST', [row.id, kind, now, now - KEEP_DAYS * DAY]);
    return ok({ files: gone.map(f => ({ id: f.id, name: f.name, size: +f.size, type: f.type, at: f.at, left: Math.max(1, Math.ceil(((f.hidden_at == null ? now : +f.hidden_at) + KEEP_DAYS * DAY - now) / DAY)) })) });
  }
  const rows = await db.query('SELECT id, name, size, type, at, enc FROM zz.files WHERE pid = $1 AND kind = $2 AND ready AND NOT hidden ORDER BY at', [row.id, kind]);
  return ok({ files: rows.map(f => ({ id: f.id, name: f.name, size: +f.size, type: f.type, at: f.at, enc: f.enc || '', url: presign('GET', 'u/' + row.id + '/' + kind + '/' + f.id, GET_SECS, now) })) });
}
// off the list: one file by id, or (kind + name) every picture of that name. Kept 30 days before it is deleted.
async function hide(db, row, body, now) {
  const r = body.id
    ? await db.query('UPDATE zz.files SET hidden = true, hidden_at = $3 WHERE id = $1 AND pid = $2 AND NOT hidden RETURNING id', [String(body.id), row.id, now])
    : KINDS[body.kind] && body.name ? await db.query('UPDATE zz.files SET hidden = true, hidden_at = $4 WHERE pid = $1 AND kind = $2 AND name = $3 AND NOT hidden RETURNING id', [row.id, body.kind, cleanName(body.name), now]) : [];
  return r[0] ? ok({ id: r[0].id, n: r.length }) : no(404, 'file');
}
// changed their mind within the 30 days: back on the list, if it still fits. A picture brought back takes the place
// of the one in use now (which goes to "recently removed" in its turn).
async function back(db, row, body, now) {
  if (!configured()) return no(503, 'off');
  const f = (await db.query('SELECT id, kind, name, size FROM zz.files WHERE id = $1 AND pid = $2 AND ready AND hidden AND COALESCE(hidden_at, $3) > $4', [String(body.id || ''), row.id, now, now - KEEP_DAYS * DAY]))[0];
  if (!f) return no(404, 'file');
  if (!isMember(row.state, now)) return no(403, 'member');
  if (f.kind === 'pics') await db.query('UPDATE zz.files SET hidden = true, hidden_at = $4 WHERE pid = $1 AND kind = $2 AND name = $3 AND ready AND NOT hidden', [row.id, 'pics', f.name, now]);
  const K = KINDS[f.kind], used = (await db.query('SELECT count(*)::int AS n, COALESCE(sum(size), 0)::bigint AS s FROM zz.files WHERE pid = $1 AND kind = $2 AND NOT hidden', [row.id, f.kind]))[0];
  if (used.n >= K.count || +used.s + +f.size > K.total) return no(409, 'full');
  await db.query('UPDATE zz.files SET hidden = false, hidden_at = NULL WHERE id = $1', [f.id]);
  return ok({ id: f.id, kind: f.kind });
}

const keyOf = (pid, kind, id) => 'u/' + pid + '/' + kind + '/' + id;
// one object out of the bucket; true once it is gone (already gone counts)
async function dropObject(key, now) {
  const url = presign('DELETE', key, 300, now);
  if (!url) return false;
  const r = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(8000) });
  return r.status === 204 || r.status === 200 || r.status === 404;
}
// the daily job: what has been off the list for more than 30 days is deleted, object first, then its row.
// Rows hidden before hidden_at existed start their 30 days now. drop is replaceable for the tests.
async function purge(db, now, drop) {
  if (!configured()) return { status: 503, body: { ok: false, why: 'off' } };
  drop = drop || dropObject;
  await db.query('UPDATE zz.files SET hidden_at = $1 WHERE hidden AND hidden_at IS NULL', [now]);
  const due = await db.query('SELECT id, pid, kind FROM zz.files WHERE hidden AND hidden_at <= $1 ORDER BY hidden_at LIMIT $2', [now - KEEP_DAYS * DAY, PURGE_MAX]);
  let gone = 0, kept = 0;
  for (const f of due) {
    let yes = false;
    try { yes = await drop(keyOf(f.pid, f.kind, f.id), now); } catch (e) { yes = false; }
    if (yes) { await db.query('DELETE FROM zz.files WHERE id = $1 AND hidden', [f.id]); gone++; } else kept++;
  }
  return { status: 200, body: { ok: true, due: due.length, gone, kept } };
}

// ---------- the keys files are locked with in the browser ----------
// fileKey: this player's server-kept key (made the first time), and their vault if they set a password.
async function key(db, row, now) {
  await db.query('INSERT INTO zz.filekeys (pid, k, at) VALUES ($1, $2, $3) ON CONFLICT (pid) DO NOTHING', [row.id, crypto.randomBytes(32).toString('base64url'), now]);
  const r = (await db.query('SELECT k, vault FROM zz.filekeys WHERE pid = $1', [row.id]))[0];
  return ok({ key: r.k, vault: r.vault || null });
}
// fileVault: keeps the player's locked key. The browser locks it; the server only checks the shape. Replacing a vault
// that is there needs { replace: true } (changing the password, or a new one after the recovery code was used).
const B64 = /^[A-Za-z0-9_-]{16,200}$/;
const lockOk = v => v && typeof v === 'object' && B64.test(v.salt || '') && B64.test(v.iv || '') && B64.test(v.w || '');
async function vault(db, row, body, now) {
  const v = body.vault;
  if (!v || !lockOk(v.p) || !lockOk(v.r) || !Number.isSafeInteger(v.rounds) || v.rounds < 100000 || v.rounds > 5000000) return no(400, 'vault');
  const clean = { v: 1, rounds: v.rounds, p: { salt: v.p.salt, iv: v.p.iv, w: v.p.w }, r: { salt: v.r.salt, iv: v.r.iv, w: v.r.w } };
  await db.query('INSERT INTO zz.filekeys (pid, k, at) VALUES ($1, $2, $3) ON CONFLICT (pid) DO NOTHING', [row.id, crypto.randomBytes(32).toString('base64url'), now]);
  const r = await db.query('UPDATE zz.filekeys SET vault = $2, at = $3 WHERE pid = $1 AND (vault IS NULL OR $4) RETURNING pid', [row.id, JSON.stringify(clean), now, body.replace === true]);
  return r[0] ? ok({}) : no(409, 'exists');
}

module.exports = { configured, presign, up, done, list, hide, back, purge, key, vault, KINDS, KEEP_DAYS };
