'use strict';
/* Keeping a member's recovery code with an email address they choose to give, so it can be sent to them if they
   lose it (docs/BRICKDUEL ... devstore "my own password").

   Opt-in only. A player who sets "my own password" gets a recovery code; they may also give an email address. Once
   they prove the address is theirs (a six-digit code mailed to it), the recovery code is kept here, locked with
   ESCROW_KEY (a server setting, not in the database), and can be mailed to that address on request from a device on
   the same save. With this on, 轉磚 holds a backup of the code: the page says so before they choose it.
   Later, when a save is linked to a SnowRealm Games account, that account's address can take this place.

   Settings (names only): RESEND_API_KEY and MAIL_FROM (the sending service), ESCROW_KEY (at least 32 characters).
   Without all three, everything here answers 503 and the page shows the option as not ready.

   Limits: three mails an hour and six a day for one save; five tries at a six-digit code, which lasts 15 minutes. The
   address is never shown back in full (a***@example.com), and nothing here says whether an address is known.
   Also (2026-11-23, so new saves cannot be used to send mail to anyone): ten mails an hour from one network address
   (a keyed hash, as everywhere else), three a day to one address, and MAIL_DAY_CAP (default 200) a day in all. */
const crypto = require('crypto');
const core = require('./core.js');

const HOUR = 3600000, DAY = 86400000, PIN_LIFE = 15 * 60000, PIN_TRIES = 5;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
const CODE = /^[A-Z0-9]{20}$/;
let sender = null;      // tests put their own here

function conf(env) {
  env = env || process.env;
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.ESCROW_KEY || env.ESCROW_KEY.length < 32) return null;
  return { key: env.RESEND_API_KEY, from: env.MAIL_FROM, escrow: crypto.createHash('sha256').update('zz-escrow|' + env.ESCROW_KEY).digest() };
}
const configured = env => !!conf(env);
const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body || {}) });
const no = (status, why) => ({ status, body: { ok: false, why } });
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function seal(key, text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function open(key, text) {
  const b = Buffer.from(text, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
function hide(email) { const [u, d] = String(email).split('@'); return (u.slice(0, 1) || '*') + '***@' + d; }
const pretty = c => c.replace(/(.{4})(?=.)/g, '$1-');

async function send(c, to, subject, text) {
  // the browser tests read mail from a file instead (never on Vercel)
  if (process.env.MAIL_TEST_OUTBOX && !process.env.VERCEL) { require('fs').appendFileSync(process.env.MAIL_TEST_OUTBOX, JSON.stringify({ to, subject, text }) + '\n'); return true; }
  const r = await (sender || fetch)('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: c.from, to: [to], subject, text })
  });
  return r.status >= 200 && r.status < 300;
}
// ip: the keyed hash of the network address; to: the address the mail is going to
async function slow(db, pid, now, ip, to, env) {
  env = env || process.env;
  if ((await core.bump(db, 'mailh', pid, HOUR, now)) > 3 || (await core.bump(db, 'maild', pid, DAY, now)) > 6) return true;
  // one network address cannot spread mail over many new saves (a school's shared address still gets ten an hour)
  if (ip && (await core.bump(db, 'mailip', ip, HOUR, now)) > 10) return true;
  // one inbox is not flooded from many saves
  if (to && (await core.bump(db, 'mailto', sha('to|' + String(to).toLowerCase()).slice(0, 32), DAY, now)) > 3) return true;
  // and the sending account has a ceiling for the day
  const cap = Math.max(1, Math.min(100000, parseInt(env.MAIL_DAY_CAP, 10) || 200));
  return (await core.bump(db, 'mailall', 'all', DAY, now)) > cap;
}

// what the page may know: is it set up, is an address kept for this save (shown hidden)
async function status(db, row, env) {
  if (!conf(env)) return ok({ ready: false });
  const r = (await db.query('SELECT email, verified FROM zz.mailbox WHERE pid = $1', [row.id]))[0];
  return ok({ ready: true, kept: !!(r && r.verified), to: r && r.verified ? hide(r.email) : null });
}
// a new address (and the recovery code to keep with it): a six-digit code goes to it. Replaces any earlier address
// only once the new one is proven.
async function start(db, row, body, now, env, ip) {
  const c = conf(env);
  if (!c) return no(503, 'off');
  const email = String(body.email || '').trim(), code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (email.length > 254 || !EMAIL.test(email)) return no(400, 'email');
  if (!CODE.test(code)) return no(400, 'code');
  if (await slow(db, row.id, now, ip, email, env)) return no(429, 'slow');
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.query(`INSERT INTO zz.mailbox (pid, email, rcode, verified, pend_email, pend_rcode, pin, pin_exp, tries, at)
    VALUES ($1, '', '', false, $2, $3, $4, $5, 0, $6)
    ON CONFLICT (pid) DO UPDATE SET pend_email = $2, pend_rcode = $3, pin = $4, pin_exp = $5, tries = 0, at = $6`,
  [row.id, email, seal(c.escrow, code), sha(row.id + ':' + pin), now + PIN_LIFE, now]);
  let sent = false;
  try {
    sent = await send(c, email, '轉磚：信箱驗證碼 Verification code',
      '你的轉磚信箱驗證碼是 ' + pin + '，15 分鐘內有效。\n這是為了替你保管雲端檔案的救援碼。如果不是你本人操作，忽略這封信即可，信箱不會被綁定。\n\n' +
      'Your 轉磚 (Zhuan Zhuan) verification code is ' + pin + ', valid for 15 minutes.\nIt is for keeping the recovery code of your cloud files. If this was not you, ignore this mail and nothing is linked.');
  } catch (e) { sent = false; }
  return sent ? ok({ to: hide(email) }) : no(502, 'mail');
}
async function verify(db, row, body, now, env) {
  if (!conf(env)) return no(503, 'off');
  const pin = String(body.pin || '');
  const r = (await db.query('UPDATE zz.mailbox SET tries = tries + 1 WHERE pid = $1 AND pend_email IS NOT NULL AND pin_exp > $2 AND tries < $3 RETURNING pin, tries', [row.id, now, PIN_TRIES]))[0];
  if (!r) return no(410, 'expired');
  if (!/^\d{6}$/.test(pin) || sha(row.id + ':' + pin) !== r.pin) return no(400, 'pin');
  await db.query('UPDATE zz.mailbox SET email = pend_email, rcode = pend_rcode, verified = true, pend_email = NULL, pend_rcode = NULL, pin = NULL, pin_exp = 0, at = $2 WHERE pid = $1', [row.id, now]);
  return ok({ kept: true });
}
// lost the recovery code: it goes to the address kept for this save
async function remind(db, row, now, env, ip) {
  const c = conf(env);
  if (!c) return no(503, 'off');
  const r = (await db.query('SELECT email, rcode FROM zz.mailbox WHERE pid = $1 AND verified', [row.id]))[0];
  if (!r) return no(404, 'none');
  if (await slow(db, row.id, now, ip, r.email, env)) return no(429, 'slow');
  let code;
  try { code = open(c.escrow, r.rcode); } catch (e) { return no(500, 'escrow'); }
  let sent = false;
  try {
    sent = await send(c, r.email, '轉磚：你的救援碼 Your recovery code',
      '你的轉磚雲端檔案救援碼：' + pretty(code) + '\n在「用救援碼重設密碼」輸入它，再設一個新密碼。請不要把這組碼告訴任何人。\n\n' +
      'Your 轉磚 (Zhuan Zhuan) cloud files recovery code: ' + pretty(code) + '\nEnter it under "Reset with the recovery code" and choose a new password. Do not share it with anyone.');
  } catch (e) { sent = false; }
  return sent ? ok({ to: hide(r.email) }) : no(502, 'mail');
}
// a new recovery code was made (the old one no longer opens anything): the kept copy follows, if there is one
async function swap(db, row, body, now, env) {
  const c = conf(env);
  if (!c) return no(503, 'off');
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE.test(code)) return no(400, 'code');
  const r = await db.query('UPDATE zz.mailbox SET rcode = $2, at = $3 WHERE pid = $1 AND verified RETURNING pid', [row.id, seal(c.escrow, code), now]);
  return ok({ kept: !!r[0] });
}

module.exports = { configured, status, start, verify, remind, swap, hide, setSend(fn) { sender = fn; } };
