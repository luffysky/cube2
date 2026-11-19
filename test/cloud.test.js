'use strict';
// The page's side of the cloud save (src/cloud.js) talking to the real API handlers and a real Postgres, all in this
// process. Devices are simulated by giving each its own storage and "opening the page" on it.
const { Readable } = require('stream');
const dbm = require('../server/db.js');
const app = require('../server/app.js');
const serverMeta = require('../server/rules.js').Meta;
const { make } = require('../tools/pglite-db.js');
// The page gets its own copy of the game code, as it has in a real browser. Sharing one copy with the server here
// would let the server's work leak into the "device" and hide mistakes.
for (const k of Object.keys(require.cache)) if (/[\\/]src[\\/]/.test(k)) delete require.cache[k];
delete globalThis.ZZ;
const ZZ = require('../src/engine.js');
require('../src/bot.js'); require('../src/drills.js'); require('../src/openers.js'); require('../src/meta.js'); require('../src/cloud.js');
const M = ZZ.Meta, C = ZZ.Cloud;
if (M === serverMeta) throw new Error('the page and the server must not share one copy of the rules');

let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ''); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

let now = Date.UTC(2026, 10, 19, 4, 0, 0), serverAhead = 0;
const MIN = 60000, DAY = 86400000;
app.setClock(() => now + serverAhead);
const pg = make();
dbm.use(pg);

// ---------- a stand-in for the browser's fetch ----------
const net = { down: false, lose: 0, status: 0, static: false, calls: [], ip: '203.0.113.5' };
function fakeFetch(url, o) {
  o = o || {};
  const u = new URL(url, 'https://game.test/'), name = u.pathname.replace(/^\/api\//, '');
  net.calls.push((o.method || 'GET') + ' ' + name + (o.body ? ' ' + (JSON.parse(o.body).a || '') : ''));
  if (net.down) return Promise.reject(new TypeError('Failed to fetch'));
  if (net.static) return Promise.resolve({ status: 404, text: async () => '<html>Not Found</html>' });
  if (net.status) return Promise.resolve({ status: net.status, text: async () => JSON.stringify({ ok: false, why: 'busy' }) });
  return new Promise((resolve, reject) => {
    const req = new Readable({ read() {} });
    req.method = o.method || 'GET'; req.url = u.pathname + u.search;
    req.headers = { host: 'game.test', origin: 'https://game.test', 'x-real-ip': net.ip };
    for (const k in (o.headers || {})) req.headers[k.toLowerCase()] = o.headers[k];
    if (o.body) { req.headers['content-length'] = String(Buffer.byteLength(o.body)); req.push(o.body); }
    req.push(null);
    const res = { statusCode: 200, setHeader() {}, end(text) {
      if (net.lose > 0) { net.lose--; return reject(new TypeError('connection lost before the answer arrived')); }
      resolve({ status: this.statusCode, text: async () => text });
    } };
    app.handle(name, req, res);
  });
}
const notes = [], adopts = [];
function device(name) { const mem = {}; return { name, mem, store: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } } }; }
const settle = async () => { for (let i = 0; i < 50 && C.busy; i++) await C.busy; };
// opening the page on a device
async function open(dev) {
  M.store = dev.store; M.onOp = null; M.load();
  C.onNote = k => notes.push(dev.name + ':' + k);
  C.onAdopt = (any, look) => adopts.push([dev.name, any, look]);
  await C.init({ store: dev.store, fetch: fakeFetch, now: () => now, auto: false });
  await settle();
  return dev;
}
const send = async () => { await C.flush(); await settle(); };
const pull = async () => { await C.flush(true); await settle(); };
const server = async dev => { const c = JSON.parse(dev.mem['zhuanzhuan.cloud.v1']); const r = await pg.query('SELECT state, ver FROM zz.players WHERE id = $1', [c.id]); return r[0] ? r[0].state : null; };
// the same record, whatever order the keys come back in (jsonb sorts them its own way); pictures are per device
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v;
const same = (a, b) => { const x = canon(JSON.parse(JSON.stringify(a))), y = canon(JSON.parse(JSON.stringify(b))); delete x.custom; delete y.custom; return JSON.stringify(x) === JSON.stringify(y); };
// test set-up only: put coins into the server's copy, then let the device fetch it
const grant = async (dev, coins) => { const c = JSON.parse(dev.mem['zhuanzhuan.cloud.v1']); await pg.query("UPDATE zz.players SET state = jsonb_set(state, '{coins}', to_jsonb($2::int)), ver = ver + 1 WHERE id = $1", [c.id, coins]); await C.flush(true); await settle(); };
const players = async () => { try { return (await pg.query('SELECT count(*)::int AS n FROM zz.players'))[0].n; } catch (e) { return 0; } };
const TAPE = require('./tape.js'); TAPE.stub(require('../server/rules.js').ZZ);
const fin = m => M.finish(m, TAPE.fake(m));      // a match the way the page ends one: the report and a tape (a stand-in here, see test/tape.js)
const match = o => Object.assign({ mode: 'ai', result: 1, level: 2, ko: 2, koOpp: 0, itemsUsed: 0, ms: 120000, stats: { score: 12000, spins: 3, minis: 0, sent: 30, quads: 1, maxCombo: 2, xspins: 0, lines: 40, pieces: 120 } }, o || {});

(async () => {
  // ---------- a host with no API: nothing changes ----------
  net.static = true;
  const P = await open(device('pages'));
  eq(C.status(), 'none', 'on a plain static host there is no cloud');
  M.buyItem(1); fin(match());
  ok(C.q.length === 0 && M.data.items[1] === 1 && M.data.tot.games === 1, 'the game works as before and nothing is queued', C.q);
  eq(net.calls, ['GET health'], 'it asks once and then leaves the network alone');
  net.static = false; net.calls = [];

  // ---------- the network is down on the very first visit ----------
  net.down = true;
  const O = await open(device('offline'));
  ok(C.status() === 'busy' && !C.dead, 'no answer yet: still finding out');
  let told = null;
  C.whenKnown(v => { told = v; });
  ok(told === null, 'whoever asks whether the API is here is kept waiting rather than told "no"');
  M.buyItem(1);
  eq(C.q.length, 1, 'changes are kept in case the server turns up');
  await C.probe(); await C.probe();
  ok(C.dead && C.unsure && C.q.length === 0 && C.status() === 'none', 'after three tries with no answer ever seen, it stays local and drops the queue');
  ok(told === false && C.hosted() === false, 'and the one who asked gets the answer');
  M.buyItem(1);
  eq(C.q.length, 0, 'nothing is queued while it is local');
  // …but that was a dead network, not a host without the API. When it matters, it looks once more.
  eq(await C.recheck(), false, 'still nothing: still local');
  ok(C.dead && C.unsure, 'and still unsure');
  net.down = false;
  eq(await C.recheck(), true, 'the network is back: the API is found after all');
  await settle();
  ok(C.on && !C.dead && C.hosted() && C.status() === 'new', 'the cloud is on from here', [C.on, C.dead, C.status()]);
  const coinsO = M.data.coins;
  M.buyItem(2);
  await send();
  let svO = await server(O);
  ok(C.status() === 'ok' && svO.coins === M.data.coins && svO.coins === coinsO - M.ITEM_PRICE[2] && svO.items[1] === 2 && svO.items[2] === 1, 'what was bought while local comes along once, what is bought now is counted once', [svO.coins, coinsO, svO.items]);
  await C.wipe(); await pg.query('DELETE FROM zz.rate');
  net.calls = [];
  // a host that plainly has no API is not asked again
  net.static = true;
  await open(device('pages2'));
  eq([C.dead, C.unsure, await C.recheck(), net.calls.length], [true, false, false, 1], 'a plain "not here" is final');
  net.static = false; net.calls = [];
  // the API has answered here before: one bad moment does not make it "not here"
  const seenDev = device('seen'); seenDev.mem['zhuanzhuan.cloud.v1'] = JSON.stringify({ id: '', key: '', pub: '', gone: false, seen: true, base: null, q: [] });
  net.down = true;
  await open(seenDev);
  told = null; C.whenKnown(v => { told = v; });
  ok(told === true && C.hosted() && !C.dead && C.status() === 'wait', 'a host known to have the API keeps counting as one while the network is down', [told, C.status()]);
  net.down = false; net.calls = [];

  // ---------- a first-time visitor ----------
  const A = await open(device('A'));
  eq(C.status(), 'new', 'the API is here: ready, but no account yet');
  eq(await players(), 0, 'looking at the menu makes no account');
  ok(!A.mem['zhuanzhuan.cloud.v1'] || !JSON.parse(A.mem['zhuanzhuan.cloud.v1']).id, 'and stores no identity');
  ok(M.buyItem(1).ok, 'first purchase');
  eq(C.q.map(o => o.k), ['item'], 'it is queued');
  ok(M.data.coins === 160, 'and shown at once');
  await send();
  ok(C.status() === 'ok' && !!C.cred && /^[a-z0-9]{8}$/.test(C.pub) && C.q.length === 0, 'the first change makes the account and is saved', [C.status(), C.pub, C.q]);
  eq(net.calls, ['GET health', 'POST rpc hello', 'POST rpc sync'], 'one hello, one save');
  eq(await players(), 1, 'one account');
  let sv = await server(A);
  ok(sv.coins === 160 && sv.items[1] === 1 && same(sv, M.data), 'server and device hold the same record', [sv, M.data]);
  const credA = JSON.parse(A.mem['zhuanzhuan.cloud.v1']);
  ok(credA.id === C.cred.id && credA.key === C.cred.key && credA.q.length === 0 && credA.base === null, 'the device remembers its identity', Object.keys(credA));

  // ---------- progress made before there was a cloud save ----------
  const B = device('B');
  M.store = B.store; M.onOp = null; M.reset();
  Object.assign(M.data, { coins: 1500, rp: 320, peak: 340, name: '老玩家' }); M.data.owned.tile.push('neon'); M.data.equip.tile = 'neon'; M.data.tot.games = 30; M.data.tot.wins = 12; M.data.first.drills = [0, 1, 2];
  M.save();
  net.ip = '203.0.113.6'; net.calls = [];
  await open(B);
  eq([C.status(), await players()], ['new', 1], 'an old local player: still no account until something happens');
  const r1 = fin(match({ mode: 'rank', ko: 3, koOpp: 0 }));
  ok(r1.coins > 0 && M.data.rp === 320 + 29, 'a ranked win, worked out on the device first', [r1.coins, M.data.rp]);
  await send();
  sv = await server(B);
  ok(sv.name === '老玩家' && sv.rp === 349 && sv.owned.tile[0] === 'neon' && sv.equip.tile === 'neon' && sv.tot.games === 31 && sv.first.drills.length === 3, 'the earlier progress came along, and the match on top of it', sv);
  ok(same(sv, M.data), 'server and device agree', [sv.coins, M.data.coins]);
  const pubB = C.pub;
  let brd = await C.board('rp', 'season');
  ok(brd.top.length === 1 && brd.top[0].p === pubB && brd.top[0].v === 349 && brd.me.rank === 1, 'and the ranked match put it on the board', brd);

  // ---------- editing the local record does not work ----------
  const real = M.data.coins;
  M.data.coins = 999999; M.save();
  ok(M.buy('theme', 'market').ok && M.buy('tile', 'candy').ok && M.buy('bg', 'night').ok && M.owns('tile', 'candy') && M.data.coins > 990000, 'the device believes the edited coins');
  await send();
  sv = await server(B);
  ok(real >= 1000 && real < 1900 && M.owns('theme', 'market') && !M.owns('tile', 'candy') && !M.owns('bg', 'night') && sv.coins === real - 1000 && M.data.coins === sv.coins && same(sv, M.data),
    'the server does not: it sells what the real coins can pay for, undoes the rest, and the coins are the real ones', [real, M.data.coins, M.data.owned]);
  M.data.rp = 1790; M.data.peak = 1790; M.save();
  fin(match({ mode: 'rank', ko: 1, koOpp: 0, result: -1 }));
  await send();
  ok(M.data.rp < 400 && same(await server(B), M.data), 'an edited rating is replaced by the real one', M.data.rp);

  // ---------- offline: changes wait, survive a reload, and arrive in order ----------
  await grant(B, 2000);
  eq(M.data.coins, 2000, '(test set-up: coins granted on the server show up on the device)');
  net.down = true;
  M.buyItem(2); M.buyItem(3); M.toggleBring(2); fin(match({ ms: 90000 }));
  await send();
  ok(C.status() === 'wait' && C.q.length === 4 && C.q.every(o => !o.s), 'with no network the changes wait', [C.status(), C.q.length]);
  const localBefore = JSON.stringify(M.data);
  await open(B);   // the page is closed and opened again, still offline
  ok(C.q.length === 4 && JSON.stringify(M.data) === localBefore, 'they survive a reload');
  M.claimLogin();
  net.down = false;
  await C.probe(); await settle();
  sv = await server(B);
  ok(C.q.length === 0 && C.status() === 'ok' && sv.items[2] === 1 && sv.items[3] === 1 && sv.bring[0] === 2 && sv.daily.login === M.dayNo() && same(sv, M.data), 'back online everything arrives', [C.status(), sv.items, sv.daily]);

  // ---------- the answer is lost on the way back ----------
  const coins0 = M.data.coins;
  M.buyItem(4); M.buyItem(4);
  net.lose = 1;
  await send();
  ok(C.q.length === 2 && C.status() === 'wait', 'no answer: the device keeps the changes');
  ok((await server(B)).items[4] === 2, 'although the server did apply them');
  await send();
  sv = await server(B);
  ok(sv.items[4] === 2 && sv.coins === coins0 - 120 && M.data.coins === coins0 - 120 && C.q.length === 0, 'sending them again changes nothing a second time', [sv.items[4], sv.coins, coins0]);

  // ---------- something happens while a save is on its way ----------
  await grant(B, 1000);
  M.buyItem(1);
  const flying = C.flush();
  ok(!!C.busy && C.q.length === 1 && C.q[0].s === 1, 'a save is in flight');
  M.buyItem(2); M.buyItem(2);                    // the player carries on
  ok(M.data.coins === 1000 - 40 - 100 && C.q.length === 3, 'the device shows all three purchases straight away');
  await flying; 
  ok(M.data.coins === 860 && M.data.items[2] >= 2, 'when the first answer comes back the later purchases are still on screen', [M.data.coins, M.data.items]);
  await settle();
  sv = await server(B);
  ok(C.q.length === 0 && sv.coins === 860 && same(sv, M.data), 'and they reach the server next, once each', [sv.coins, C.q.length]);

  // ---------- typing and trying things on do not flood the queue ----------
  'ㄅ,ㄅㄆ,磚,磚頭,磚頭王'.split(',').forEach(v => M.setName(v));
  M.equip('tile', 'glaze'); M.equip('tile', 'neon'); M.equip('tile', 'glaze'); M.equip('tile', 'neon');
  eq(C.q.map(o => o.k + ':' + o.a.join('/')), ['name:磚頭王', 'wear:tile/neon'], 'only where it ended up is sent');
  await send();
  ok((await server(B)).name === '磚頭王', 'the name arrived');

  // ---------- matches reported too fast ----------
  notes.length = 0;
  for (let i = 0; i < 9; i++) fin(match({ ms: 180000, stats: { score: 20000 + i, lines: 50, pieces: 140 } }));
  const believed = M.data.tot.games;
  await send();
  sv = await server(B);
  ok(sv.tot.games < believed && M.data.tot.games === sv.tot.games && same(sv, M.data), 'the server takes only as many matches as there was time for, and the device follows', [believed, sv.tot.games]);
  ok(notes.indexOf('B:rejected') >= 0, 'the player is told', notes);

  // ---------- a second device ----------
  now += 30 * MIN;
  await open(A);
  fin(match({ stats: { score: 8000, lines: 30, pieces: 90 } }));
  await send();
  const code = await C.code();
  ok(code.ok && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code.code), 'device A asks for a code', code);
  const stateA = JSON.stringify(M.data), idA = C.cred.id, pubA = C.pub;
  // device B already has its own account and some unsent changes
  await open(B);
  M.buyItem(1);
  const idB = C.cred.id;
  let peek = await C.redeem(code.code.toLowerCase(), false);
  ok(peek.ok && peek.peek.pub === pubA && peek.peek.coins === JSON.parse(stateA).coins && peek.peek.same === false && C.cred.id === idB, 'looking up the code shows whose save it is and changes nothing yet', peek);
  const moved = await C.redeem(code.code, true);
  ok(moved.ok && C.cred.id === idA && C.pub === pubA && C.q.length === 0 && C.status() === 'ok', 'device B switches to that save', [moved.ok, C.status()]);
  ok(same(JSON.parse(stateA), M.data), "device B now shows device A's record", [M.data.coins, M.data.name]);
  eq(await players(), 1, "device B's old account, which nobody can reach any more, is gone");
  eq((await C.redeem(code.code, true)).why, 'code', 'the code cannot be used again');
  // both devices play; each sees the other's progress
  fin(match({ ms: 100000, stats: { score: 15000, lines: 50, pieces: 130 } }));
  await send();
  const afterB = JSON.stringify(M.data);
  await open(A);
  ok(same(JSON.parse(afterB), M.data) && M.data.tot.best === 15000, 'device A, opened again, has what device B just did', [M.data.tot]);
  // both offline, both do something, then both come back
  net.down = true;
  M.buyItem(5);
  const qA = JSON.stringify(C.q);
  await open(B); M.buyItem(6); M.buyItem(6);
  net.down = false;
  await C.probe(); await settle();
  await open(A);
  eq(JSON.parse(qA).length, 1, '(device A had one change waiting)');
  sv = await server(A);
  ok(sv.items[5] === 1 && sv.items[6] === 2 && same(sv, M.data), 'changes made on both devices while offline all land', sv.items);

  // ---------- pictures stay on the device that has them ----------
  M.subscribe(); M.data.custom.tile = true; M.data.custom.dim = 60; M.equip('tile', 'custom');
  await send();
  ok(M.data.equip.tile === 'custom' && M.data.custom.tile === true && M.data.custom.dim === 60 && (await server(A)).equip.tile === 'custom', 'device A wears its own picture', [M.data.equip, M.data.custom, M.data.sub, (await server(A)).equip, (await server(A)).sub, C.status(), C.q, now]);
  await open(B);
  ok(M.data.equip.tile === 'glaze' && M.data.custom.tile === false && M.isSub(), 'device B has no such picture, so it shows the stock tile', M.data.equip);
  ok(C.q.length === 0 && (await server(B)).equip.tile === 'custom', "and does not overwrite device A's choice");

  // ---------- the server's clock decides the day ----------
  serverAhead = DAY;
  const dayLocal = M.dayNo();
  await pull();
  eq(M.dayNo(), dayLocal + 1, "the device follows the server's day");
  ok(M.claimLogin() > 0, 'check-in on the new day');
  await send();
  sv = await server(B);
  ok(sv.daily.login === M.data.daily.login && sv.daily.login === dayLocal + 1 && sv.coins === M.data.coins, 'agreed by the server', [sv.daily, M.data.daily, sv.coins, M.data.coins]);
  serverAhead = 0; now += DAY; await pull();

  // ---------- deleting the cloud data ----------
  notes.length = 0;
  await open(A);
  const mine = JSON.stringify(M.data);
  const del = await C.wipe();
  ok(del.ok && C.status() === 'gone' && !C.cred && JSON.stringify(M.data) === mine, 'deleted; the progress on the device is untouched', C.status());
  eq(await players(), 0, 'nothing is left on the server');
  M.buyItem(7); fin(match());
  await send();
  ok(C.q.length === 0 && (await players()) === 0, 'an unlinked device does not make a new account by itself');
  await open(B);
  ok(C.status() === 'gone' && notes.indexOf('B:lost') >= 0 && M.data.coins > 0, 'the other device learns the save is gone and keeps its copy', [C.status(), notes]);
  // starting again
  const mineB = M.data.coins;
  ok(await C.ensure(), 'start a cloud save again');
  await settle();
  sv = await server(B);
  ok(C.status() === 'ok' && sv.coins === Math.min(20000, mineB) && (await players()) === 1, 'a new account that starts from what the device has', [C.status(), sv.coins, mineB]);

  // ---------- two tabs, one account ----------
  const T = device('tabs');
  net.ip = '203.0.113.20';
  await open(T);
  M.buyItem(1);                                   // tab 1 has a change waiting, no account yet
  const tab1q = JSON.stringify(C.q), n0 = await players();
  // meanwhile tab 2 (same storage) makes the account
  const raw = await fakeFetch('api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'hello' }) });
  const made = JSON.parse(await raw.text());
  T.store.setItem('zhuanzhuan.cloud.v1', JSON.stringify({ id: made.id, key: made.key, pub: made.pub, q: [], gone: false, seen: true, base: null }));
  eq(JSON.parse(tab1q).length, 1, '(tab 1 still has its change)');
  await send();
  ok(C.cred.id === made.id && (await players()) === n0 + 1 && (await server(T)).items[1] === 1, 'tab 1 uses the account tab 2 made instead of making another', [C.cred.id === made.id, await players(), n0]);

  // ---------- too many accounts from one address ----------
  net.ip = '203.0.113.99';
  for (let i = 0; i < 40; i++) await fakeFetch('api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'hello' }) });
  const R = await open(device('late'));
  M.buyItem(1);
  await send();
  ok(!C.cred && C.q.length === 1 && C.status() === 'wait', 'when the server says "slow down" the changes simply wait', [C.status(), C.q.length]);
  net.ip = '203.0.113.100';
  await send();
  ok(!!C.cred && C.q.length === 0 && (await server(R)).items[1] === 1, 'and go through later');

  // ---------- the server is having a bad moment ----------
  net.status = 503;
  M.buyItem(2);
  await send();
  ok(C.status() === 'wait' && C.q.length === 1, 'a 503 is a reason to wait, not to give up');
  net.status = 0;
  await send();
  ok(C.status() === 'ok' && C.q.length === 0, 'then it goes through');

  // ---------- the database is emptied behind the device's back ----------
  await pg.query('DELETE FROM zz.players');
  notes.length = 0;
  M.buyItem(3);
  await send();
  ok(C.status() === 'gone' && notes.indexOf('late:lost') >= 0 && M.data.items[3] === 1, 'an identity the server no longer knows is dropped; the game goes on locally', [C.status(), notes]);

  // ---------- boards through the page's own call ----------
  const X = await open(device('X')); net.ip = '203.0.113.30';
  M.setName('小釉'); fin(match({ mode: 'sprint', result: 1, ms: 66000, stats: { score: 9000, lines: 40, pieces: 100 } }));
  await send();
  C._forget();
  brd = await C.board('sprint', 'all');
  ok(brd && brd.top.length === 1 && brd.top[0].n === '小釉' && brd.top[0].v === 66000 && brd.me.rank === 1, 'sprint board through the page', brd);
  net.down = true; C._forget();
  eq(await C.board('score', 'season'), null, 'no network: the board call says so quietly');
  net.down = false;

  // ---------- treasure boxes: opened by the server, shown on the page ----------
  {
    const Y = await open(device('Y')); net.ip = '203.0.113.31';
    const items0 = M.data.items.reduce((a, b) => a + b, 0), coins0 = M.data.coins;
    const r = M.draw(2);
    ok(r.ok && r.pending && !M.data.box.last && M.data.items.reduce((a, b) => a + b, 0) === items0, 'with a cloud save the page does not open the boxes itself', r);
    await send();
    const last = M.data.box.last;
    ok(last && last.boxes.length === 2 && M.data.daily.draws === 2, 'the server opened them and the page shows what was inside', last);
    const gotItems = last.boxes.reduce((a, b) => a + b.got.filter(g => g.kind === 'item').length, 0), gotCoins = last.boxes.reduce((a, b) => a + b.got.filter(g => g.kind === 'coins').reduce((x, g) => x + g.n, 0), 0);
    ok(M.data.items.reduce((a, b) => a + b, 0) === items0 + gotItems && M.data.coins === coins0 + gotCoins, 'and the prizes are in the save', [gotItems, gotCoins]);
    eq(M.drawsLeft(), 3, 'three left today');
    // no network: the request waits, nothing is opened on the page
    net.down = true;
    M.draw(1);
    await send();
    ok(M.data.box.last.n === last.n && C.q.some(o => o.k === 'draw'), 'offline: the draw waits for the server');
    net.down = false;
    await send();
    ok(M.data.box.last.n === last.n + 1 && M.data.daily.draws === 3, 'and goes through once it is back');
  }

  await pg.close();
  console.log('cloud tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
