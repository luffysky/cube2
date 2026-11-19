/* 轉磚 meta: coins, ranked ladder, daily jobs, the shop catalogue and what the player owns.
   Pure logic plus one localStorage record. Runs in the page, in Node tests and on the server:
   the page works out every change at once so nothing waits on the network, and when a cloud save is linked
   the server repeats the same change on its own copy (Meta.run) and its result is the one that counts. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ || require('./engine.js');
  var KEY = 'zhuanzhuan.meta.v1', DAY = 86400000;
  var TZ = 480;   // the game's day and season turn over at midnight UTC+8 for every player, on every device and on the server
  function int(v, lo, hi) { v = Math.round(+v || 0); return v < lo ? lo : v > hi ? hi : v; }

  // ---------- ladder ----------
  var TIERS = ['陶土', '紅磚', '青瓦', '白瓷', '琉璃', '鎏金', '窯神'];
  var DIVS = ['III', 'II', 'I'], STEP = 100, TOP_RP = 18 * STEP;
  function rankOf(rp) {
    rp = Math.max(0, Math.round(rp || 0));
    if (rp >= TOP_RP) return { tier: 6, div: 0, name: TIERS[6], rp: rp, into: rp - TOP_RP, need: 0, floor: TOP_RP, top: true };
    var i = Math.floor(rp / STEP), tier = Math.floor(i / 3), div = i % 3;
    return { tier: tier, div: div, name: TIERS[tier] + ' ' + DIVS[div], rp: rp, into: rp - i * STEP, need: STEP, floor: tier * 3 * STEP, top: false };
  }
  // Win or lose, how far the rating moves. Losing never drops you out of the tier you have reached.
  function rpDelta(rp, result, koDiff, streak) {
    var r = rankOf(rp);
    if (result > 0) return 20 + Math.min(10, Math.max(0, koDiff) * 3) + (streak >= 3 ? 5 : 0);
    if (result === 0) return 2;
    var loss = r.tier >= 5 ? 20 : r.tier >= 3 ? 16 : 12;
    return -Math.min(loss, rp - r.floor);
  }
  var FOES = ['阿土', '磚頭伯', '小釉', '瓦片姐', '泥作仔', '阿窯', '磨石嬸', '水泥哥', '砌牆王', '青花妹', '老窯頭', '白瓷姨', '琉璃仔', '金磚爺'];
  // The opponent for a rating: speed and care rise smoothly, the playing style switches at the level boundaries.
  // The ladder starts with the two beginner levels, 150 points apiece (so the first tier is a gentle one), and from
  // 300 on each level takes 450 points, as it always has.
  function botFor(rp, rnd) {
    var B = ZZ.Bot, L = B.ORDER.map(function (n) { return B.LEVELS[n]; }), top = L.length - 1;
    rp = Math.max(0, Math.min(rp, 2700));
    var t = rp < 300 ? rp / 150 : 2 + (rp - 300) / 450, i = Math.min(top - 1, Math.floor(t)), f = Math.min(1, t - i);
    var a = L[i], b = L[i + 1], near = f < 0.5 ? a : b, over = Math.max(0, t - top);
    var r = rnd ? rnd() : Math.random();
    return {
      name: FOES[Math.floor(r * FOES.length) % FOES.length],
      pps: Math.round((a.pps + (b.pps - a.pps) * f + over * 0.6) * 100) / 100,
      noise: Math.round((a.noise + (b.noise - a.noise) * f) * 10) / 10,
      depth: near.depth, hold: near.hold, w: near.w, level: B.LEVELS.indexOf(near)
    };
  }

  // ---------- catalogue ----------
  // price in coins. rank: free once that tier has been reached. sub: members only.
  var CATALOG = {
    tile: [
      { id: 'glaze', name: '釉面磚', price: 0 },
      { id: 'pixel', name: '像素', price: 400 },
      { id: 'mosaic', name: '馬賽克', price: 600 },
      { id: 'brick', name: '紅磚', price: 600 },
      { id: 'candy', name: '軟糖', price: 900 },
      { id: 'glass', name: '玻璃磚', price: 900 },
      { id: 'wood', name: '積木', price: 900 },
      { id: 'neon', name: '霓虹燈管', price: 1200 },
      { id: 'gem', name: '寶石', rank: 3 },
      { id: 'custom', name: '自己的圖', sub: true }
    ],
    bg: [
      { id: 'wall', name: '水泥牆', price: 0 },
      { id: 'blueprint', name: '藍圖', price: 500 },
      { id: 'board', name: '黑板', price: 500 },
      { id: 'stone', name: '磨石子', price: 500 },
      { id: 'night', name: '夜空', price: 700 },
      { id: 'tatami', name: '榻榻米', price: 700 },
      { id: 'dusk', name: '暮色', price: 700 },
      { id: 'neongrid', name: '霓虹格線', price: 900 },
      { id: 'ember', name: '窯火', rank: 4 },
      { id: 'custom', name: '自己的圖', sub: true }
    ],
    theme: [
      { id: 'auto', name: '磨石子', price: 0 },
      { id: 'ink', name: '墨', price: 600 },
      { id: 'kiln', name: '窯燒', price: 800 },
      { id: 'qinghua', name: '青花', price: 800 },
      { id: 'matcha', name: '抹茶', price: 800 },
      { id: 'sakura', name: '櫻花', price: 800 },
      { id: 'market', name: '夜市', price: 1000 }
    ],
    fx: [
      { id: 'shard', name: '碎磚', price: 0 },
      { id: 'star', name: '星屑', price: 600 },
      { id: 'bubble', name: '泡泡', price: 600 },
      { id: 'petal', name: '花瓣', price: 800 }
    ],
    set: [
      { id: 'market', name: '霓虹夜市', parts: { tile: 'neon', bg: 'neongrid', theme: 'market', fx: 'star' } },
      { id: 'qinghua', name: '青花瓷', parts: { tile: 'glass', bg: 'blueprint', theme: 'qinghua', fx: 'bubble' } },
      { id: 'kiln', name: '窯邊紅磚', parts: { tile: 'brick', bg: 'dusk', theme: 'kiln', fx: 'shard' } },
      { id: 'washitsu', name: '和室', parts: { tile: 'wood', bg: 'tatami', theme: 'matcha', fx: 'petal' } },
      { id: 'candy', name: '糖果屋', parts: { tile: 'candy', bg: 'night', theme: 'sakura', fx: 'bubble' } }
    ]
  };
  var KINDS = ['tile', 'bg', 'theme', 'fx'];
  var KIND_NAME = { tile: '方塊', bg: '牆面', theme: '主題', fx: '消行特效', set: '整套風格' };
  var ITEM_PRICE = [0, 40, 50, 40, 60, 50, 60, 60];
  var BRING_MAX = 2, SET_OFF = 0.75, SUB_BOOST = 1.5, SUB_DAYS = 30;
  var PLAN = { name: '轉磚會員', month: 90, year: 890 };   // planned prices in NT$, shown in the shop; nothing is charged yet
  function find(kind, id) {
    var list = CATALOG[kind] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- daily jobs ----------
  var JOBS = [
    { id: 'win', need: 2, coin: 60, on: function (m) { return m.battle && m.result > 0 ? 1 : 0; } },
    { id: 'play', need: 3, coin: 40, on: function (m) { return m.battle ? 1 : 0; } },
    { id: 'tspin', need: 5, coin: 60, on: function (m) { return m.stats.spins + m.stats.minis; } },
    { id: 'send', need: 40, coin: 50, on: function (m) { return m.battle ? m.stats.sent : 0; } },
    { id: 'quad', need: 3, coin: 40, on: function (m) { return m.stats.quads; } },
    { id: 'ko', need: 4, coin: 50, on: function (m) { return m.battle ? m.ko : 0; } },
    { id: 'rank', need: 2, coin: 60, on: function (m) { return m.mode === 'rank' ? 1 : 0; } },
    { id: 'combo', need: 1, coin: 40, on: function (m) { return m.stats.maxCombo >= 5 ? 1 : 0; } },
    { id: 'xspin', need: 2, coin: 50, on: function (m) { return m.stats.xspins; } },
    { id: 'sprint', need: 1, coin: 40, on: function (m) { return m.mode === 'sprint' && m.result > 0 ? 1 : 0; } },
    { id: 'score', need: 1, coin: 60, on: function (m) { return m.stats.score >= 20000 ? 1 : 0; } },
    { id: 'item', need: 3, coin: 30, on: function (m) { return m.itemsUsed || 0; } }
  ];
  var LOGIN = [20, 30, 40, 50, 60, 80, 120];
  function job(id) { for (var i = 0; i < JOBS.length; i++) if (JOBS[i].id === id) return JOBS[i]; return null; }

  // ---------- state ----------
  function blank() {
    return {
      v: 1, coins: 200, name: '', rp: 0, peak: 0, season: '', rgames: 0, streak: 0,
      owned: { tile: [], bg: [], theme: [], fx: [] },
      equip: { tile: 'glaze', bg: 'wall', theme: 'auto', fx: 'shard' },
      items: [0, 0, 0, 0, 0, 0, 0, 0], bring: [],
      sub: { until: 0, demo: true },
      custom: { tile: false, bg: false, dim: 45 },
      daily: { day: 0, jobs: [], login: 0, streak: 0, win: 0 },
      tot: { games: 0, wins: 0, best: 0, sprint: 0, tspins: 0, sent: 0, kos: 0, coins: 0, online: 0 },
      first: { drills: [], openers: [] },
      note: null
    };
  }
  var Meta = {
    data: blank(), now: function () { return Date.now(); }, onChange: null, store: null, onOp: null, quiet: 0, TZ: TZ,
    TIERS: TIERS, CATALOG: CATALOG, KINDS: KINDS, KIND_NAME: KIND_NAME, ITEM_PRICE: ITEM_PRICE, BRING_MAX: BRING_MAX, JOBS: JOBS, LOGIN: LOGIN, PLAN: PLAN,
    SUB_BOOST: SUB_BOOST, rankOf: rankOf, rpDelta: rpDelta, botFor: botFor, find: find
  };
  function storage() {
    if (Meta.store) return Meta.store;
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function merge(into, from) {
    for (var k in into) {
      if (!from || from[k] == null) continue;
      if (Array.isArray(into[k])) { if (Array.isArray(from[k])) into[k] = from[k].slice(); }
      else if (typeof into[k] === 'object' && into[k]) { if (typeof from[k] === 'object') merge(into[k], from[k]); }
      else if (typeof into[k] === typeof from[k]) into[k] = from[k];
    }
    if (from && from.note && typeof from.note === 'object') into.note = from.note;
  }
  // Reports a change the player made (kind, arguments) to whoever keeps the cloud copy. Silent while Meta.run replays one.
  function emit(k, a) { if (Meta.onOp && !Meta.quiet) Meta.onOp(k, a); }
  Meta.dayNo = function () { return Math.floor((Meta.now() + TZ * 60000) / DAY); };
  Meta.seasonId = function () { var d = new Date(Meta.now() + TZ * 60000); return d.getUTCFullYear() + '-' + (d.getUTCMonth() < 9 ? '0' : '') + (d.getUTCMonth() + 1); };
  Meta.save = function () {
    var st = storage();
    try { if (st) st.setItem(KEY, JSON.stringify(Meta.data)); } catch (e) { /* kept in memory only */ }
    if (Meta.onChange) Meta.onChange();
  };
  // Takes a saved record (from this device or from the server), fills in whatever it lacks and brings it up to today.
  Meta.use = function (obj) {
    var d = blank();
    if (obj && typeof obj === 'object') merge(d, obj);
    while (d.items.length < 8) d.items.push(0);
    Meta.data = d;
    Meta.rollSeason();
    Meta.rollDay();
    Meta.tidy();
    return d;
  };
  Meta.load = function () {
    var st = storage(), obj = null;
    try {
      var raw = st && st.getItem(KEY);
      if (raw) obj = JSON.parse(raw);
    } catch (e) { /* start fresh */ }
    return Meta.use(obj);
  };
  Meta.reset = function () { Meta.data = blank(); Meta.rollSeason(); Meta.rollDay(); };

  // A new month starts a new season: a reward for the tier reached, then the rating settles back part of the way.
  Meta.rollSeason = function () {
    var d = Meta.data, s = Meta.seasonId();
    if (d.season === s) return;
    if (d.season && d.rgames > 0) {
      var r = rankOf(d.peak), coins = 60 + r.tier * 90;
      d.coins += coins;
      d.note = { kind: 'season', coins: coins, tier: r.tier, div: r.div, top: r.top };
      d.rp = Math.round(d.rp * 0.7 / 10) * 10;
    }
    d.season = s; d.peak = d.rp; d.rgames = 0;
  };
  Meta.rollDay = function () {
    var d = Meta.data.daily, day = Meta.dayNo();
    if (d.day === day && d.jobs.length) return;
    // three jobs a day, picked by the date so everyone gets the same set
    var rnd = new ZZ.RNG(day * 2654435761), pool = JOBS.map(function (j) { return j.id; }), jobs = [];
    for (var i = 0; i < 3; i++) jobs.push({ id: pool.splice(Math.floor(rnd.next() * pool.length), 1)[0], n: 0, paid: false });
    d.day = day; d.jobs = jobs;
  };
  Meta.loginDue = function () { return Meta.data.daily.login !== Meta.dayNo(); };
  Meta.claimLogin = function () {
    var d = Meta.data.daily, day = Meta.dayNo();
    if (d.login === day) return 0;
    d.streak = d.login === day - 1 ? d.streak + 1 : 1;
    d.login = day;
    var coins = LOGIN[(d.streak - 1) % LOGIN.length];
    if (Meta.isSub()) coins *= 2;
    Meta.earn(coins);
    emit('login', []);
    return coins;
  };
  Meta.jobs = function () {
    Meta.rollDay();
    return Meta.data.daily.jobs.map(function (j, i) {
      var def = job(j.id) || { need: 1, coin: 0 };
      return { i: i, id: j.id, need: def.need, coin: def.coin, n: Math.min(j.n, def.need), done: j.n >= def.need, paid: j.paid };
    });
  };
  Meta.jobsReady = function () { return Meta.jobs().filter(function (j) { return j.done && !j.paid; }).length; };
  Meta.claimJob = function (i) {
    var j = Meta.data.daily.jobs[i], def = j && job(j.id);
    if (!j || !def || j.paid || j.n < def.need) return 0;
    j.paid = true;
    Meta.earn(def.coin);
    emit('job', [j.id]);
    return def.coin;
  };
  // The same claim by the job's name, which still means the same thing if the day has turned over in between.
  Meta.claimJobId = function (id) {
    Meta.rollDay();
    var jobs = Meta.data.daily.jobs;
    for (var i = 0; i < jobs.length; i++) if (jobs[i].id === id) return Meta.claimJob(i);
    return 0;
  };

  // ---------- money ----------
  Meta.earn = function (n) { n = Math.max(0, Math.round(n)); Meta.data.coins += n; Meta.data.tot.coins += n; Meta.save(); return n; };
  Meta.spend = function (n) {
    if (n < 0 || Meta.data.coins < n) return false;
    Meta.data.coins -= n;
    Meta.save();
    return true;
  };
  Meta.isSub = function () { return Meta.data.sub.until > Meta.now(); };
  Meta.subDaysLeft = function () { return Math.max(0, Math.ceil((Meta.data.sub.until - Meta.now()) / DAY)); };
  // No payment is wired up in this build: starting a membership here is a free trial that ends by itself.
  Meta.subscribe = function () { Meta.data.sub = { until: Meta.now() + SUB_DAYS * DAY, demo: true }; Meta.save(); emit('sub', []); };
  Meta.cancelSub = function () { Meta.data.sub = { until: 0, demo: true }; Meta.tidy(); Meta.save(); emit('unsub', []); };
  // A name is at most 12 characters, with nothing that could be read as markup.
  // Names everyone can see on the leaderboard. Two kinds are turned away (the name becomes empty, which shows as the
  // player's tag): insults, and names that pretend to speak for the game. The check ignores case, spacing, punctuation
  // and the usual digit-for-letter swaps. It is a short list on purpose: a long one mostly catches innocent names.
  var BAD_NAME = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'faggot', 'retard', 'whore', 'slut', 'nazi', 'hitler', 'porn', 'pussy', 'penis', 'vagina',
    '幹你', '干你', '操你', '肏', '屄', '雞巴', '鸡巴', '雞掰', '機掰', '机掰', '婊子', '賤人', '贱人', '妓女', '強姦', '强奸', '智障', '低能', '白癡', '白痴', '去死', '傻逼', '傻屄', '他媽的', '他妈的', '媽的', '妈的', '靠北', '靠腰', '垃圾人', '廢物', '废物', '支那',
    '死ね', 'くそ', 'ばか', 'まんこ', 'ちんこ', '씨발', '시발', '병신', '좆', '개새끼', '지랄',
    'admin', 'moderator', 'official', 'snowrealm', 'system', 'support', '官方', '管理員', '管理员', '客服', '系統', '系统', '運営', '公式', '운영자', '관리자'];
  var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
  Meta.badName = function (v) {
    var flat = String(v == null ? '' : v).normalize('NFKC').toLowerCase().replace(/[0134578@$!]/g, function (c) { return LEET[c]; }).replace(/[\s\-_.·•*~^|/,:;+=()\[\]{}#%?]/g, '');
    if (!flat) return false;
    if (flat === 'gm' || flat === 'mod') return true;
    for (var i = 0; i < BAD_NAME.length; i++) if (flat.indexOf(BAD_NAME[i]) >= 0) return true;
    return false;
  };
  Meta.cleanName = function (v) {
    var name = Array.from(String(v == null ? '' : v).replace(/[<>&"'`\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('').trim();
    return Meta.badName(name) ? '' : name;
  };
  Meta.setName = function (v) {
    v = Meta.cleanName(v);
    if (v === Meta.data.name) return false;
    Meta.data.name = v;
    Meta.save();
    emit('name', [v]);
    return true;
  };

  Meta.owns = function (kind, id) { return Meta.data.owned[kind].indexOf(id) >= 0; };
  Meta.state = function (kind, id) {
    var it = find(kind, id);
    if (!it) return 'none';
    if (it.sub) return Meta.isSub() ? 'ok' : 'sub';
    if (it.price === 0 || Meta.owns(kind, id)) return 'ok';
    if (it.rank != null) return rankOf(Math.max(Meta.data.peak, Meta.data.rp)).tier >= it.rank ? 'ok' : (Meta.isSub() ? 'ok' : 'rank');
    return Meta.isSub() ? 'ok' : 'buy';
  };
  Meta.canUse = function (kind, id) { return Meta.state(kind, id) === 'ok'; };
  Meta.buy = function (kind, id) {
    var it = find(kind, id);
    if (!it || it.sub || it.rank != null || !it.price) return { ok: false, why: 'no' };
    if (Meta.owns(kind, id)) return { ok: false, why: 'have' };
    if (!Meta.spend(it.price)) return { ok: false, why: 'poor', n: it.price - Meta.data.coins };
    Meta.data.owned[kind].push(id);
    Meta.save();
    emit('buy', [kind, id]);
    return { ok: true };
  };
  Meta.setPrice = function (id) {
    var st = find('set', id), sum = 0, miss = 0;
    if (!st) return { price: 0, full: 0, miss: 0 };
    KINDS.forEach(function (k) {
      var it = find(k, st.parts[k]);
      if (!it || !it.price) return;
      sum += it.price;
      if (!Meta.owns(k, it.id)) miss += it.price;
    });
    return { price: Math.round(miss * SET_OFF / 10) * 10, full: sum, miss: miss };
  };
  Meta.buySet = function (id) {
    var st = find('set', id), p = Meta.setPrice(id);
    if (!st || !p.miss) return { ok: false, why: 'setHave' };
    if (!Meta.spend(p.price)) return { ok: false, why: 'poor', n: p.price - Meta.data.coins };
    KINDS.forEach(function (k) { var it = find(k, st.parts[k]); if (it && it.price && !Meta.owns(k, it.id)) Meta.data.owned[k].push(it.id); });
    Meta.save();
    emit('set', [id]);
    return { ok: true };
  };
  Meta.setUsable = function (id) {
    var st = find('set', id);
    return !!st && KINDS.every(function (k) { return Meta.canUse(k, st.parts[k]); });
  };
  Meta.equip = function (kind, id) {
    if (KINDS.indexOf(kind) < 0 || !Meta.canUse(kind, id)) return false;
    Meta.data.equip[kind] = id;
    Meta.save();
    emit('wear', [kind, id]);
    return true;
  };
  Meta.equipSet = function (id) {
    var st = find('set', id);
    if (!st || !Meta.setUsable(id)) return false;
    KINDS.forEach(function (k) { Meta.data.equip[k] = st.parts[k]; });
    Meta.save();
    emit('wset', [id]);
    return true;
  };
  // Anything worn that is no longer allowed (a membership ran out) goes back to the stock look.
  Meta.tidy = function () {
    var d = Meta.data, def = blank().equip;
    KINDS.forEach(function (k) { if (!Meta.canUse(k, d.equip[k])) d.equip[k] = def[k]; });
    d.bring = d.bring.filter(function (id) { return id >= 1 && id <= 7; }).slice(0, BRING_MAX);
  };

  // ---------- items carried into a match ----------
  Meta.buyItem = function (id) {
    var p = ITEM_PRICE[id];
    if (!p) return { ok: false, why: 'no' };
    if (Meta.data.items[id] >= 99) return { ok: false, why: 'max' };
    if (!Meta.spend(p)) return { ok: false, why: 'poor', n: p - Meta.data.coins };
    Meta.data.items[id]++;
    Meta.save();
    emit('item', [id]);
    return { ok: true };
  };
  Meta.toggleBring = function (id) {
    var b = Meta.data.bring, i = b.indexOf(id);
    if (i >= 0) b.splice(i, 1);
    else if (b.length < BRING_MAX && Meta.data.items[id] > 0) b.push(id);
    else return false;
    Meta.save();
    emit('bring', [id]);
    return true;
  };
  // Takes the chosen items out of stock when a match starts. Returns what actually goes in.
  Meta.takeBring = function () {
    var d = Meta.data, out = [];
    d.bring.forEach(function (id) { if (d.items[id] > 0) { d.items[id]--; out.push(id); } });
    d.bring = d.bring.filter(function (id) { return d.items[id] > 0; });
    if (out.length) { Meta.save(); emit('take', []); }
    return out;
  };

  // ---------- after a match ----------
  var WIN_AI = [10, 15, 22, 30, 40, 5, 7];   // by level number; the last two are the beginner levels
  var MODES = { ai: 1, rank: 1, ghost: 1, net: 1, sprint: 1 };
  // Reduces a finished match to the few numbers the rewards depend on, each kept inside what a match of that length
  // can produce. The page and the server both pass the match through here, so they pay out on the same figures.
  //   ms: how long it was played (for a sprint, the finishing time)
  Meta.cleanMatch = function (m) {
    m = m && typeof m === 'object' ? m : {};
    var st = m.stats && typeof m.stats === 'object' ? m.stats : {}, mode = typeof m.mode === 'string' && MODES.hasOwnProperty(m.mode) ? m.mode : 'ai', sprint = mode === 'sprint';
    var ms = int(m.ms != null ? m.ms : m.time, 0, 3600000), sec = ms / 1000;
    var cap = function (v, perSec, base) { return int(v, 0, Math.round(base + sec * perSec)); };
    return {
      mode: mode, result: m.result > 0 ? 1 : m.result < 0 && !sprint ? -1 : 0, level: int(m.level, 0, 6),
      ko: sprint ? 0 : int(m.ko, 0, 60), koOpp: sprint ? 0 : int(m.koOpp, 0, 60), itemsUsed: sprint ? 0 : int(m.itemsUsed, 0, 60),
      ms: ms, time: sprint ? ms : 0,
      stats: {
        score: cap(st.score, 3000, 5000), sent: sprint ? 0 : cap(st.sent, 6, 20), spins: cap(st.spins, 1.5, 4), minis: cap(st.minis, 1.5, 4),
        xspins: cap(st.xspins, 1.5, 4), quads: cap(st.quads, 1, 3), maxCombo: int(st.maxCombo, 0, 40), lines: cap(st.lines, 5, 8), pieces: cap(st.pieces, 6, 10)
      }
    };
  };
  // m: { mode: 'ai'|'rank'|'ghost'|'net'|'sprint', result: 1|0|-1, level, stats, ko, koOpp, itemsUsed, ms }
  Meta.finish = function (m) {
    var d = Meta.data, parts = [], out = { parts: parts, coins: 0, rank: null, jobs: [], best: false };
    m = Meta.cleanMatch(m);
    m.battle = m.mode !== 'sprint';
    var st = m.stats, sc = st.score;
    function add(key, n) { n = Math.round(n); if (n > 0) parts.push({ key: key, n: n }); }
    if (m.battle) {
      add('score', Math.min(80, Math.floor(sc / 400)));
      if (m.result > 0) add('win', m.mode === 'rank' ? 30 : m.mode === 'net' ? 25 : m.mode === 'ghost' ? 20 : WIN_AI[m.level] || 10);
      else add(m.result === 0 ? 'draw' : 'played', m.result === 0 ? 10 : 5);
      add('ko', Math.min(5, m.ko || 0) * 4);
      if (m.result > 0 && d.daily.win !== Meta.dayNo()) { d.daily.win = Meta.dayNo(); add('first', 50); }
      d.tot.games++; if (m.result > 0) d.tot.wins++;
      d.tot.tspins += (st.spins || 0) + (st.minis || 0); d.tot.sent += st.sent || 0; d.tot.kos += m.ko || 0;
      if (m.mode === 'net') d.tot.online++;
      if (sc > d.tot.best) { d.tot.best = sc; out.best = true; }
    } else {
      if (m.result > 0) {
        add('sprint', 15);
        add('speed', m.time < 60000 ? 40 : m.time < 90000 ? 20 : m.time < 120000 ? 10 : 0);
        if (!d.tot.sprint || m.time < d.tot.sprint) { d.tot.sprint = m.time; out.best = true; add('best', 20); }
      }
    }
    var sum = 0;
    parts.forEach(function (p) { sum += p.n; });
    if (Meta.isSub() && sum) { var extra = Math.round(sum * (SUB_BOOST - 1)); parts.push({ key: 'member', n: extra }); sum += extra; }
    out.coins = sum;

    if (m.mode === 'rank') {
      var before = d.rp, rb = rankOf(before);
      d.streak = m.result > 0 ? d.streak + 1 : 0;
      d.rp = Math.max(0, before + rpDelta(before, m.result, (m.ko || 0) - (m.koOpp || 0), d.streak));
      d.rgames++;
      var ra = rankOf(d.rp), up = ra.tier * 3 + ra.div > rb.tier * 3 + rb.div || (ra.top && !rb.top);
      out.rank = { before: before, after: d.rp, delta: d.rp - before, from: rb, to: ra, up: up, bonus: 0 };
      if (d.rp > d.peak) {
        // first time at a new division this season
        if (up) { out.rank.bonus = 40 + ra.tier * 20; parts.push({ key: 'promo', n: out.rank.bonus, arg: ra }); out.coins += out.rank.bonus; }
        d.peak = d.rp;
      }
    }

    Meta.rollDay();
    d.daily.jobs.forEach(function (j) {
      var def = job(j.id);
      if (!def || j.paid || j.n >= def.need) return;
      j.n += def.on(m) || 0;
      if (j.n >= def.need) out.jobs.push(def.id);
    });
    d.coins += out.coins; d.tot.coins += out.coins;
    Meta.save();
    delete m.battle;
    emit('fin', [m]);
    return out;
  };
  // First time through a drill or an opener lesson pays once. What it pays is looked up here, not taken from the caller.
  Meta.firstCoin = function (kind, id) {
    if (kind === 'drills') return typeof id === 'number' && id === Math.floor(id) && id >= 0 && id < (ZZ.DRILLS ? ZZ.DRILLS.length : 0) ? 15 : 0;
    if (kind === 'openers') { var list = ZZ.OPENERS || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].coin; }
    return 0;
  };
  Meta.firstClear = function (kind, id) {
    var coins = Meta.firstCoin(kind, id);
    if (!coins || Meta.data.first[kind].indexOf(id) >= 0) return 0;
    Meta.data.first[kind].push(id);
    Meta.earn(coins);
    emit('first', [kind, id]);
    return coins;
  };
  Meta.takeNote = function () { var n = Meta.data.note; if (n) { Meta.data.note = null; Meta.save(); emit('note', []); } return n; };

  // ---------- one change, by name ----------
  // The cloud copy is kept in step by repeating each change there: kind 'buy' with ['tile', 'neon'], and so on.
  // Everything arriving here may come from outside, so each argument is checked before it is used.
  function yes(v) { return v ? { ok: true } : { ok: false, why: 'no' }; }
  function str(v) { return typeof v === 'string' && v.length <= 24 ? v : ''; }
  var RUN = {
    fin: function (a) { return { ok: true, out: Meta.finish(a[0] && typeof a[0] === 'object' ? a[0] : {}) }; },
    buy: function (a) { return KINDS.indexOf(a[0]) < 0 ? yes(0) : Meta.buy(a[0], str(a[1])); },
    set: function (a) { return Meta.buySet(str(a[0])); },
    item: function (a) { return Meta.buyItem(int(a[0], 0, 99)); },
    wear: function (a) { return yes(Meta.equip(a[0], str(a[1]))); },
    wset: function (a) { return yes(Meta.equipSet(str(a[0]))); },
    bring: function (a) { return yes(Meta.toggleBring(int(a[0], 0, 99))); },
    take: function () { Meta.takeBring(); return yes(1); },
    login: function () { return yes(Meta.claimLogin()); },
    job: function (a) { return yes(Meta.claimJobId(str(a[0]))); },
    first: function (a) { return yes(Meta.firstClear(str(a[0]), typeof a[1] === 'number' ? a[1] : str(a[1]))); },
    name: function (a) { Meta.setName(typeof a[0] === 'string' ? a[0].slice(0, 64) : ''); return yes(1); },
    sub: function () { Meta.subscribe(); return yes(1); },
    unsub: function () { Meta.cancelSub(); return yes(1); },
    note: function () { Meta.takeNote(); return yes(1); }
  };
  Meta.OPS = Object.keys(RUN);
  Meta.run = function (k, a) {
    if (typeof k !== 'string' || !RUN.hasOwnProperty(k) || !Array.isArray(a)) return { ok: false, why: 'op' };
    Meta.quiet++;
    try { return RUN[k](a); } finally { Meta.quiet--; }
  };

  ZZ.Meta = Meta;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
