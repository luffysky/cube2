'use strict';
/* The fast lane for online matches: the same conversation as POST /api/room { a: 'x' }, held over one open
   WebSocket instead of a new request every round.

   A frame from the page is { i, code, key, seat, acks, out }, exactly the body of an exchange plus a number, and the
   answer is { i, s: status, b: body }. Every letter still goes through the database first, so nothing here has to be
   remembered: if this connection drops (they are cut when the function reaches its time limit) the page carries on
   over plain requests and opens a new one, and it does not matter which machine answers.

   The one thing kept in memory is who is connected to this machine. When the reader of a letter happens to be here
   too, it is handed the letter at once ({ p: [letters] }) instead of waiting for its next round. That is only a
   shortcut: the page takes such a letter only if it is the next one in line, and collects anything else the usual way. */
const { WebSocketServer } = require('ws');
const db = require('./db.js');
const core = require('./core.js');

const MAX_FRAME = 24 * 1024, PER_SECOND = 80;
const here = new Map();      // room code -> Map(seat -> socket)

function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;      // not a browser (browsers always name the page that opens a socket)
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}
function seatOf(ws, code, seat) {
  if (ws.zzCode === code && ws.zzSeat === seat) return;
  leave(ws);
  let room = here.get(code);
  if (!room) here.set(code, room = new Map());
  const old = room.get(seat);
  if (old && old !== ws) { old.zzCode = null; try { old.close(4000, 'replaced'); } catch (e) { /* gone */ } }
  room.set(seat, ws); ws.zzCode = code; ws.zzSeat = seat;
}
function leave(ws) {
  const room = ws.zzCode && here.get(ws.zzCode);
  if (room && room.get(ws.zzSeat) === ws) { room.delete(ws.zzSeat); if (!room.size) here.delete(ws.zzCode); }
  ws.zzCode = null;
}
function attach(server, opts) {
  const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME, perMessageDeflate: false, path: opts && opts.path,
    verifyClient: (info, done) => (sameSite(info.req) ? done(true) : done(false, 403, 'origin')) });
  wss.on('connection', ws => {
    let tick = 0, count = 0, chain = Promise.resolve();
    ws.on('error', () => { /* the close that follows does the tidying */ });
    ws.on('close', () => leave(ws));
    ws.on('message', (data, binary) => {
      const now = Date.now();
      if (now - tick > 1000) { tick = now; count = 0; }
      if (binary || ++count > PER_SECOND) return ws.close(1008, 'slow');
      let f;
      try { f = JSON.parse(data.toString('utf8')); } catch (e) { return ws.close(1007, 'json'); }
      if (!f || typeof f !== 'object' || Array.isArray(f)) return ws.close(1007, 'json');
      // one at a time per connection, in the order they came
      chain = chain.then(() => one(ws, f)).catch(() => { try { ws.send(JSON.stringify({ i: f.i, s: 503, b: { ok: false, why: 'busy' } })); } catch (e) { /* gone */ } });
    });
  });
  return wss;
}
async function one(ws, f) {
  const out = await db.run(d => core.roomExchange(d, f, Date.now()));
  if (ws.readyState !== 1) return;
  const body = out.body;
  if (out.status === 200) {
    const code = core.readRoom(f.code), seat = core.readSeat(f);
    if (ws.zzCode !== code) console.log('[zz] ws seated');      // one line per connection, nothing about who
    seatOf(ws, code, seat);
    const said = core.cleanMail(f.out) || [];
    let near = 0;
    const peers = here.get(code);
    if (peers) peers.forEach((peer, s) => {
      if (peer === ws || peer.readyState !== 1) return;
      near++;
      const mine = said.filter(l => l.to === undefined || l.to === s).map(l => ({ n: l.n, m: l.m, f: seat }));
      if (mine.length) try { peer.send(JSON.stringify({ p: mine })); } catch (e) { /* its own rounds will fetch them */ }
    });
    body.near = near;      // how many of the others are on this same machine (the page relaxes its own rounds for those)
  }
  ws.send(JSON.stringify({ i: f.i, s: out.status, b: body }));
}
module.exports = { attach, here };
