'use strict';
// The WebSocket lane for online matches (server/ws.js), against the real handlers and an in-memory Postgres.
const http = require('http');
const WebSocket = require('ws');
const db = require('../server/db.js'), app = require('../server/app.js'), wsrv = require('../server/ws.js');
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } }
const nap = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const pg = require('../tools/pglite-db.js').make();
  db.use(pg);
  const server = http.createServer((req, res) => { const m = /^\/api\/([a-z]+)$/.exec(req.url); return m && app.routes.includes(m[1]) ? app.handle(m[1], req, res) : (res.statusCode = 404, res.end()); });
  wsrv.attach(server, { path: '/api/ws' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, base = 'http://127.0.0.1:' + port;
  const post = body => fetch(base + '/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));
  const K = n => ('socket-test-seat-' + n + '-xxxxxxxxxxxxxxxxxxxx').slice(0, 32);
  const open = (headers) => new Promise((yes, no) => { const w = new WebSocket('ws://127.0.0.1:' + port + '/api/ws', { headers }); w.box = []; w.on('message', d => w.box.push(JSON.parse(d.toString()))); w.on('open', () => yes(w)); w.on('error', no); w.on('unexpected-response', (q, r) => no(new Error('http ' + r.statusCode))); });
  const ask = (w, f) => new Promise(yes => { const i = f.i; const t = setInterval(() => { const k = w.box.findIndex(x => x.i === i); if (k >= 0) { clearInterval(t); yes(w.box.splice(k, 1)[0]); } }, 5); w.send(JSON.stringify(f)); });
  try {
    const code = (await post({ a: 'open', key: K(0), cap: 3 })).json.code;
    await post({ a: 'join', code, key: K(1) }); await post({ a: 'join', code, key: K(2) });
    // a page on another site may not open a socket here
    let refused = false;
    await open({ Origin: 'https://evil.example' }).then(w => w.close(), e => { refused = /403/.test(e.message); });
    ok(refused, 'a socket opened from another site is refused');
    const a = await open({ Origin: base }), b = await open({}), c = await open({});
    let r = await ask(a, { i: 1, code, key: K(0), seat: 0, acks: [], out: [] });
    ok(r.s === 200 && r.b.ok && r.b.seats === 3 && r.b.near === 0, 'a round over the socket answers like a request', r);
    r = await ask(b, { i: 1, code, key: K(1), seat: 1, acks: [], out: [] });
    ok(r.b.near === 1, 'the second seat is told one of the others is on this machine', r.b);
    await ask(c, { i: 1, code, key: K(2), seat: 2, acks: [], out: [] });
    // a letter is handed straight to those who are connected here
    r = await ask(a, { i: 2, code, key: K(0), seat: 0, acks: [], out: [{ n: 1, m: { t: 'all' } }, { n: 2, m: { t: 'two' }, to: 2 }] });
    await nap(40);
    const pb = b.box.filter(x => x.p), pc = c.box.filter(x => x.p);
    ok(r.s === 200 && pb.length === 1 && pb[0].p.length === 1 && pb[0].p[0].f === 0 && pb[0].p[0].m.t === 'all', 'seat 1 is pushed the broadcast and only that', pb);
    ok(pc.length === 1 && pc[0].p.length === 2 && pc[0].p[1].m.t === 'two', 'seat 2 is pushed both', pc);
    ok(!a.box.some(x => x.p), 'the writer is not pushed its own letters');
    // and it is in the database all the same, for whoever is not connected here
    r = await post({ a: 'x', code, key: K(1), seat: 1, acks: [], out: [] });
    ok(r.json.in.length === 1 && r.json.in[0].n === 1, 'the same letter waits in the box for a plain request', r.json);
    r = await ask(b, { i: 3, code, key: K(1), seat: 1, acks: [1], out: [] });
    ok(r.b.in.length === 0, 'and is gone once acknowledged');
    r = await ask(b, { i: 4, code, key: K(0), seat: 1, acks: [], out: [] });
    ok(r.s === 404, 'the wrong key gets nowhere over a socket either', r);
    r = await ask(b, { i: 5, code, key: K(1), seat: 1, acks: [], out: [{ n: 0, m: {} }] });
    ok(r.s === 400, 'a malformed letter is refused', r);
    // a second socket for the same seat replaces the first
    const b2 = await open({});
    const closed = new Promise(y => b.on('close', code => y(code)));
    await ask(b2, { i: 1, code, key: K(1), seat: 1, acks: [], out: [] });
    ok((await Promise.race([closed, nap(1000).then(() => 0)])) === 4000, 'an older socket for the same seat is let go');
    // nonsense closes the socket
    const bad = await open({}), gone = new Promise(y => bad.on('close', code => y(code)));
    bad.send('not json');
    ok((await Promise.race([gone, nap(1000).then(() => 0)])) === 1007, 'nonsense closes the socket');
    const flood = await open({}), cut = new Promise(y => flood.on('close', code => y(code)));
    for (let i = 0; i < 200; i++) flood.send(JSON.stringify({ i: 100 + i, code, key: K(2), seat: 2, acks: [], out: [] }));
    ok((await Promise.race([cut, nap(3000).then(() => 0)])) === 1008, 'a flood of frames is cut off');
    await nap(300);
    for (const w of [a, b2, c]) w.close();
    await nap(100);
    ok(wsrv.here.size === 0, 'nothing is remembered once everyone has gone', [...wsrv.here.keys()]);
    const plain = await fetch(base + '/api/ws').then(r => r.status, () => 0);
    ok(plain === 404 || plain === 426, 'a plain request to the socket address gets a plain refusal', plain);
  } catch (e) { fail++; console.log('CRASH', e); }
  server.close(); server.closeAllConnections && server.closeAllConnections();
  console.log('ws tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
