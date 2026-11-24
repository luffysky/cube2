'use strict';
// Several tabs of one browser, all with the game open. They share one storage, so they must end up on one cloud
// account, and none of them may lose a result it has not sent yet. (Found the hard way: two tabs playing each other
// online both finish at the same moment, both tried to make the account, and both results were thrown away.)
// Real API handlers, real SQL, a Postgres inside this process; each tab is its own copy of the game code.
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const { make } = require('../tools/pglite-db.js');
const TAPE = require('./tape.js'); TAPE.stub(require('../server/rules.js').ZZ);

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ''); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

const now = Date.UTC(2026, 10, 19, 4, 0, 0), KEY = 'zhuanzhuan.cloud.v1';
app.setClock(() => now);
const pg = make();
dbm.use(pg);
const nap = ms => new Promise(r => setTimeout(r, ms));

// ---------- the network: answers to "hello" can be held back, so two tabs can both be asking at once ----------
const net = { calls: [], holdHello: false, held: [], ip: '203.0.113.9' };
net.release = () => { net.holdHello = false; const h = net.held; net.held = []; h.forEach(f => f()); };
function fakeFetch(url, o) {
  o = o || {};
  const u = new URL(url, 'https://game.test/'), name = u.pathname.replace(/^\/api\//, ''), act = o.body ? JSON.parse(o.body).a || '' : '';
  net.calls.push((o.method || 'GET') + ' ' + name + (act ? ' ' + act : ''));
  return new Promise(resolve => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'GET'; req.url = u.pathname + u.search;
    req.headers = { host: 'game.test', origin: 'https://game.test', 'x-real-ip': net.ip };
    for (const k in (o.headers || {})) req.headers[k.toLowerCase()] = o.headers[k];
    if (o.body) { req.headers['content-length'] = String(Buffer.byteLength(o.body)); req.push(o.body); }
    req.push(null);
    const res = { statusCode: 200, setHeader() {}, end(text) {
      const done = () => resolve({ status: this.statusCode, text: async () => text });
      if (net.holdHello && act === 'hello') net.held.push(done); else done();
    } };
    app.handle(name, req, res);
  });
}
// what navigator.locks does, for the tabs of one browser
function makeLocks() {
  let tail = Promise.resolve();
  return { asked: 0, request(name, fn) { this.asked++; const run = tail.then(() => fn()); tail = run.then(() => {}, () => {}); return run; } };
}

// ---------- a browser: one storage, any number of tabs ----------
function browser(locks) {
  const mem = {}, tabs = [];
  const B = { mem, tabs, locks: locks === undefined ? null : locks };
  B.open = async function (name) {
    for (const k of Object.keys(require.cache)) if (/[\\/]src[\\/]/.test(k)) delete require.cache[k];
    delete globalThis.ZZ;
    const ZZ = require('../src/engine.js');
    for (const f of ['bot', 'drills', 'openers', 'meta', 'cloud']) require('../src/' + f + '.js');
    const tab = { name, ZZ, M: ZZ.Meta, C: ZZ.Cloud, notes: [], closed: false };
    // writing to the shared storage tells every other tab, a moment later (the browser's "storage" event)
    tab.store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => {
      mem[k] = String(v);
      if (k === KEY) tabs.forEach(t => { if (t !== tab && !t.closed) setTimeout(() => { if (!t.closed) t.C.follow(); }, 0); });
    } };
    tab.M.store = tab.store; tab.M.onOp = null; tab.M.load();
    // a match as the page ends one: with its tape (a stand-in here, which the server's checker is taught to accept)
    const fin0 = tab.M.finish; tab.M.finish = (m, tape) => fin0(m, tape === undefined ? TAPE.fake(m) : tape);
    tab.C.onNote = k => tab.notes.push(k);
    tabs.push(tab);
    await tab.C.init({ store: tab.store, fetch: fakeFetch, now: () => now, auto: false, locks: B.locks });
    return tab;
  };
  // until nothing is on its way any more, in any tab
  B.quiet = async function () {
    for (let calm = 0, i = 0; calm < 3 && i < 400; i++) {
      await nap(2);
      const busy = tabs.filter(t => !t.closed && t.C.busy);
      if (busy.length) { calm = 0; await Promise.race([Promise.all(busy.map(t => t.C.busy)), nap(30)]); } else calm++;
    }
  };
  B.stored = () => (mem[KEY] ? JSON.parse(mem[KEY]) : {});
  return B;
}
const players = async () => (await pg.query('SELECT id, state, ver FROM zz.players WHERE gone IS NULL ORDER BY made, id'));
const wipeAll = async () => { await pg.query('DELETE FROM zz.players'); await pg.query('DELETE FROM zz.rate'); net.calls = []; };
const match = o => Object.assign({ mode: 'net', result: 0, level: 0, ko: 0, koOpp: 0, itemsUsed: 0, ms: 60000, stats: { score: 24, spins: 0, minis: 0, sent: 0, quads: 0, maxCombo: 0, xspins: 0, lines: 0, pieces: 4 } }, o || {});
const hellos = () => net.calls.filter(c => c === 'POST rpc hello').length;

(async () => {
  await dbm.migrate();

  // ---------- 1. two tabs finish a match at the same moment (a browser that cannot take turns) ----------
  {
    const B = browser(null), a = await B.open('host'), b = await B.open('guest');
    eq([a.C.status(), b.C.status()], ['new', 'new'], 'two tabs, no account yet');
    net.holdHello = true;
    a.M.finish(match({ stats: Object.assign(match().stats, { score: 2400 }) })); b.M.finish(match());
    ok(a.M.data.coins === 216 && b.M.data.coins === 210, 'each tab shows its own result at once', [a.M.data.coins, b.M.data.coins]);
    a.C.flush(); b.C.flush();
    for (let i = 0; i < 100 && net.held.length < 2; i++) await nap(2);
    eq(net.held.length, 2, 'both tabs are asking for an account at the same time');
    net.release();
    await B.quiet();
    let all = await players();
    eq(all.length, 1, 'only one account is left: the one made a moment too late is removed again');
    ok(a.C.cred && b.C.cred && a.C.cred.id === b.C.cred.id && a.C.cred.id === all[0].id && B.stored().id === all[0].id, 'both tabs and the storage agree on it', [a.C.cred, b.C.cred, B.stored().id]);
    eq([all[0].state.tot.games, all[0].state.tot.online, all[0].state.coins, all[0].state.tot.best], [2, 2, 226, 2400], 'both results are on the record');
    eq([a.C.q.length, b.C.q.length], [0, 0], 'nothing is left waiting');
    await a.C.flush(true); await b.C.flush(true); await B.quiet();
    eq([a.M.data.tot.games, b.M.data.tot.games, a.M.data.coins, b.M.data.coins], [2, 2, 226, 226], 'and both tabs show them');
    ok(!a.notes.length && !b.notes.length, 'nobody was told anything went wrong', [a.notes, b.notes]);
    ok(net.calls.filter(c => c === 'POST rpc delete').length === 1, 'the spare account was deleted with its own key', net.calls);
  }
  await wipeAll();

  // ---------- 2. the same, in a browser that lets tabs take turns ----------
  {
    const locks = makeLocks(), B = browser(locks), a = await B.open('host'), b = await B.open('guest');
    net.holdHello = true;
    a.M.finish(match()); b.M.finish(match());
    a.C.flush(); b.C.flush();
    for (let i = 0; i < 100 && net.held.length < 1; i++) await nap(2);
    await nap(20);
    eq([net.held.length, hellos()], [1, 1], 'only one tab asks; the other waits its turn');
    net.release();
    await B.quiet();
    const all = await players();
    eq([all.length, hellos(), net.calls.filter(c => c === 'POST rpc delete').length], [1, 1, 0], 'one account, made once, nothing to tidy up');
    eq([all[0].state.tot.games, all[0].state.coins], [2, 220], 'both results are on the record');
    ok(a.C.cred.id === b.C.cred.id && locks.asked >= 2, 'both tabs use it');
    await a.C.flush(true); await b.C.flush(true); await B.quiet();
    eq([a.M.data.tot.games, b.M.data.tot.games], [2, 2], 'and both show it');
  }
  await wipeAll();

  // ---------- 3. one tab makes the account while the other has something waiting ----------
  {
    const B = browser(null), a = await B.open('a'), b = await B.open('b');
    b.M.buyItem(1);                                   // b: 160 coins, one item, queued but not sent
    eq(b.C.q.map(o => o.k), ['item'], 'tab b has a purchase waiting');
    a.M.finish(match());
    await a.C.flush(); await B.quiet();
    const all = await players();
    eq(all.length, 1, 'one account');
    ok(b.C.cred && b.C.cred.id === a.C.cred.id, 'tab b joined the account tab a made');
    eq([all[0].state.tot.games, all[0].state.items[1], all[0].state.coins], [1, 1, 170], 'and its purchase went to it instead of being dropped');
    eq(b.C.q.length, 0, 'tab b has nothing waiting any more');
    await a.C.flush(true); await B.quiet();
    ok(a.M.data.items[1] === 1 && b.M.data.tot.games === 1, 'each tab sees what the other did');
  }
  await wipeAll();

  // ---------- 4. a tab that has not heard of the new account yet must not write over it ----------
  {
    const B = browser(null), a = await B.open('a'), b = await B.open('b');
    b.closed = true;                                  // (its storage events are held back for this test)
    a.M.finish(match());
    await a.C.flush(); await B.quiet();
    const made = B.stored().id;
    ok(!!made && !b.C.cred, 'tab a has made the account; tab b has not heard');
    b.M.buyItem(2);                                   // tab b saves its queue…
    eq(B.stored().id, made, '…and the account in the storage is still there');
    ok(b.C.cred && b.C.cred.id === made, 'tab b picked it up on the way');
    b.closed = false;
    await b.C.flush(); await B.quiet();
    const all = await players();
    eq([all.length, all[0].state.items[2], all[0].state.tot.games, hellos()], [1, 1, 1, 1], 'one account, with what both tabs did');
  }
  await wipeAll();

  // ---------- 5. a second tab is opened while the first still has an unsent change ----------
  {
    const B = browser(null), a = await B.open('a');
    a.M.finish(match());                              // queued in tab a, stored with it
    const b = await B.open('b');                      // finds the same queue in the storage
    eq([a.C.q.length, b.C.q.length], [1, 1], 'both tabs hold the same unsent result');
    a.C.flush(); b.C.flush();
    await B.quiet();
    const all = await players();
    eq([all.length, all[0].state.tot.games, all[0].state.coins], [1, 1, 210], 'it is counted once');
  }
  await wipeAll();

  // ---------- 6. one tab switches to another save; the other follows and drops what was meant for the old one ----------
  {
    const phone = browser(null), p = await phone.open('phone');
    p.M.finish(match({ result: 1 }));
    await p.C.flush(); await phone.quiet();
    const code = (await p.C.code()).code;
    ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), 'a transfer code from another device', code);

    const B = browser(null), a = await B.open('a'), b = await B.open('b');
    a.M.buyItem(1);
    await a.C.flush(); await B.quiet();
    const old = a.C.cred.id;
    ok(b.C.cred && b.C.cred.id === old, 'both tabs on the first save');
    b.closed = true;
    b.M.buyItem(3);                                   // waiting in tab b, meant for the first save
    b.closed = false;
    const r = await a.C.redeem(code, true);
    ok(r.ok && a.C.cred.id === p.C.cred.id, 'tab a switches to the phone save');
    await B.quiet();
    ok(b.C.cred.id === p.C.cred.id && b.C.q.length === 0, 'tab b follows, and does not carry the old purchase over', [b.C.cred.id === p.C.cred.id, b.C.q]);
    await b.C.flush(true); await B.quiet();
    const all = await players(), mine = all.filter(x => x.id === p.C.cred.id)[0];
    eq([mine.state.items[3], mine.state.tot.wins, b.M.data.tot.wins], [0, 1, 1], 'the phone save is untouched by it, and tab b shows it');
  }
  await wipeAll();

  // ---------- 7. one tab deletes the cloud data; the other stops too ----------
  {
    const B = browser(null), a = await B.open('a'), b = await B.open('b');
    a.M.finish(match());
    await a.C.flush(); await B.quiet();
    ok((await a.C.wipe()).ok, 'tab a deletes the cloud data');
    await B.quiet();
    eq([a.C.status(), b.C.status(), !!b.C.cred, (await players()).length], ['pend', 'pend', false, 0], 'both tabs see the save waiting to be deleted');
    b.M.finish(match());
    await b.C.flush(); await B.quiet();
    eq([(await players()).length, b.C.q.length], [0, 0], 'and neither makes a new account by itself');
    ok(await b.C.ensure(), 'tab b starts a cloud save again');
    await B.quiet();
    ok(a.C.cred && a.C.cred.id === b.C.cred.id && a.C.status() === 'ok', 'tab a follows');
    eq((await players()).length, 1, 'one account');
  }
  await wipeAll();

  // ---------- 8. the stored link is wiped by something that did not know better; a tab that has it puts it back ----------
  {
    const B = browser(null), a = await B.open('a');
    a.M.finish(match());
    await a.C.flush(); await B.quiet();
    const id = a.C.cred.id;
    B.mem[KEY] = JSON.stringify({ id: '', key: '', pub: '', gone: false, seen: true, base: null, q: [] });
    ok(a.C.follow() === false && B.stored().id === id && a.C.cred.id === id, 'the account is written back, not forgotten');
    a.M.finish(match());
    await a.C.flush(); await B.quiet();
    eq((await players())[0].state.tot.games, 2, 'and keeps working');
  }

  console.log('tabs tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
