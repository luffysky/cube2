/* 轉磚 levels: 1000 numbered levels, an endless run of random ones, and levels players build themselves.

   A level is a starting wall (the terrain), a goal and a piece limit. Everything about level n comes from n alone,
   so the same level is the same for everyone: the terrain, the goal and the order of the pieces (the game is
   seeded with the level's own seed).

   Goals:  dig    clear away every cement cell of the terrain
           lines  clear a number of lines
           tspin  make a number of T-spins
   Stars:  finish within the "par" (what the computer needed) for three, a little over for two, anything for one.

   Each numbered level was played through by the computer (tools/make_levels.js) before it went in: the table PAR
   holds, per level, how many pieces it needed, and a salt when the first terrain drawn for that number could not be
   done and another was drawn. A level never ships that the computer could not finish. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ, COLS = ZZ.COLS, RNG = ZZ.RNG;
  var COUNT = 1000;

  // ---------- terrain ----------
  // rows of 10 characters, top first: 'X' cement, '.' empty
  var STYLES = ['cheese', 'well', 'stairs', 'pairs', 'tslot', 'zigzag', 'pillars', 'cheese2'];
  function row(holes) { var s = ''; for (var x = 0; x < COLS; x++) s += holes.indexOf(x) >= 0 ? '.' : 'X'; return s; }
  function terrain(rnd, h, style) {
    var out = [], i, x, well = Math.floor(rnd.next() * COLS);
    for (i = 0; i < h; i++) {
      if (style === 'well') {
        // one column open all the way down, now and then a step aside
        if (rnd.next() < 0.18) well = Math.max(0, Math.min(COLS - 1, well + (rnd.next() < 0.5 ? -1 : 1)));
        out.push(row([well]));
      } else if (style === 'stairs') {
        out.push(row([(well + i) % COLS]));
      } else if (style === 'pairs') {
        // two holes side by side: room for an O or a flat piece
        x = Math.floor(rnd.next() * (COLS - 1)); out.push(row([x, x + 1]));
      } else if (style === 'tslot') {
        // a T-spin double slot: an overhang, a three-wide gap under it, and a one-wide hole under that
        if (i + 2 < h) {
          x = 1 + Math.floor(rnd.next() * (COLS - 2));
          var over = ''; for (var c = 0; c < COLS; c++) over += c < x ? 'X' : '.';
          out.push(over, row([x - 1, x, x + 1]), row([x]));
          i += 2;
        } else out.push(row([Math.floor(rnd.next() * COLS)]));
      } else if (style === 'zigzag') {
        out.push(row([i % 2 ? well : (well + 3) % COLS]));
      } else if (style === 'pillars') {
        // the top rows are tall pillars with gaps between them
        if (i < Math.min(4, h - 1)) { var hs = []; for (x = 0; x < COLS; x++) if ((x + i) % 3 === 0 || rnd.next() < 0.25) hs.push(x); if (hs.length >= COLS) hs.pop(); out.push(row(hs.length ? hs : [well])); }
        else out.push(row([Math.floor(rnd.next() * COLS)]));
      } else if (style === 'cheese2') {
        var a = Math.floor(rnd.next() * COLS), b = (a + 2 + Math.floor(rnd.next() * (COLS - 3))) % COLS;
        out.push(row([a, b]));
      } else {
        out.push(row([Math.floor(rnd.next() * COLS)]));
      }
    }
    return out;
  }
  // a few loose cement cells above the terrain, so the top is not flat
  function rubble(rnd, rows, n) {
    if (!n) return rows;
    var top = [];
    for (var k = 0; k < 2; k++) {
      var s = '';
      for (var x = 0; x < COLS; x++) s += rnd.next() < n * (k ? 0.5 : 0.25) ? 'X' : '.';
      if (s.indexOf('.') < 0) s = '.' + s.slice(1);
      top.push(s);
    }
    return top.concat(rows);
  }

  // ---------- one numbered level ----------
  // salt: when the first terrain for a number could not be finished, the maker tried the next salt
  function make(n, salt) {
    n = Math.max(1, Math.min(COUNT, n | 0));
    salt = salt || 0;
    var rnd = new RNG(n * 2654435761 + salt * 97 + 11), tier = Math.floor((n - 1) / 100);       // 0..9
    var styles = n <= 20 ? ['well', 'pairs', 'cheese'] : STYLES, style = styles[Math.floor(rnd.next() * styles.length)];
    var h = Math.min(10, 2 + Math.floor(n / 90) + Math.floor(rnd.next() * 3)), kind, need = 0;
    var pick = rnd.next();
    if (n % 10 === 0) kind = 'dig';                                 // every tenth level: dig it all out
    else if (style === 'tslot' && n > 30) kind = 'tspin';
    else kind = pick < 0.45 ? 'dig' : pick < 0.8 ? 'lines' : n > 60 ? 'tspin' : 'lines';
    if (kind === 'dig' && style === 'well') style = n <= 20 ? 'pairs' : 'cheese';     // a straight shaft is one long bar
    if (kind === 'tspin') { style = 'tslot'; h = Math.max(h, 4); need = Math.min(4, 1 + Math.floor(tier / 3)); }
    if (kind === 'lines') need = Math.min(40, 6 + tier * 3 + Math.floor(rnd.next() * 6));
    var rows = rubble(rnd, terrain(rnd, h, style), tier >= 2 ? Math.min(1, tier / 9) : 0);
    return {
      n: n, salt: salt, seed: (n * 40503 + salt * 7 + 1) >>> 0, style: style, goal: kind, need: need, board: rows,
      gravity: 1 / Math.max(160, 1100 - tier * 95),     // rows per ms: faster as the levels go on
      tier: tier
    };
  }

  // ---------- an endless run: random levels that get harder as you go ----------
  function endless(stage, seed) {
    var n = Math.min(COUNT, 5 + stage * 25), base = make(n, 0), rnd = new RNG((seed ^ (stage * 2654435761)) >>> 0);
    var lv = make(n, 0);
    lv.board = rubble(rnd, terrain(rnd, base.board.length - (base.board.length > 2 ? 2 : 0), STYLES[Math.floor(rnd.next() * STYLES.length)]), lv.tier >= 2 ? Math.min(1, lv.tier / 9) : 0);
    lv.seed = (seed + stage * 7919) >>> 0; lv.endless = stage; lv.goal = stage % 3 === 2 ? 'dig' : 'lines'; lv.need = lv.goal === 'lines' ? Math.min(30, 6 + stage * 2) : 0;
    lv.n = 0;
    return lv;
  }

  // ---------- a level a player built (shared as a code in a link) ----------
  // code: version 1, then goal, need, piece limit, height, and the terrain rows as bits, all in base64url
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function encode(c) {
    var bytes = [1, c.goal === 'lines' ? 1 : c.goal === 'tspin' ? 2 : 0, c.need & 255, c.limit & 255, c.board.length];
    c.board.forEach(function (r) { var v = 0; for (var x = 0; x < COLS; x++) if (r.charAt(x) === 'X') v |= 1 << x; bytes.push(v & 255, v >> 8); });
    var s = '', i, bits = 0, acc = 0;
    for (i = 0; i < bytes.length; i++) { acc = (acc << 8) | bytes[i]; bits += 8; while (bits >= 6) { bits -= 6; s += B64.charAt((acc >> bits) & 63); } acc &= (1 << bits) - 1; }
    if (bits) s += B64.charAt((acc << (6 - bits)) & 63);
    return s;
  }
  function decode(s) {
    if (typeof s !== 'string' || s.length > 64 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
    var bytes = [], acc = 0, bits = 0, i;
    for (i = 0; i < s.length; i++) { acc = (acc << 6) | B64.indexOf(s.charAt(i)); bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); acc &= (1 << bits) - 1; } }
    if (bytes[0] !== 1 || bytes.length < 5) return null;
    var goal = ['dig', 'lines', 'tspin'][bytes[1]], h = bytes[4], rows = [];
    if (!goal || h < 1 || h > 16 || bytes.length < 5 + h * 2) return null;
    for (i = 0; i < h; i++) {
      var v = bytes[5 + i * 2] | (bytes[6 + i * 2] << 8), r = '';
      for (var x = 0; x < COLS; x++) r += v & (1 << x) ? 'X' : '.';
      if (r.indexOf('.') < 0) return null;        // a full row would clear at once
      rows.push(r);
    }
    var need = Math.max(goal === 'dig' ? 0 : 1, Math.min(60, bytes[2])), limit = Math.max(10, Math.min(200, bytes[3]));
    if (goal === 'dig' && rows.join('').indexOf('X') < 0) return null;
    return { n: 0, custom: true, seed: 20261120, goal: goal, need: goal === 'dig' ? 0 : need, limit: limit, board: rows, gravity: 1 / 900, tier: 0 };
  }

  // ---------- par, limit, stars ----------
  // PAR: per numbered level, "salt.pieces" from tools/make_levels.js; filled in below the table marker
  var PAR = null;
  PAR = [[0,22],[0,24],[0,16],[0,5],[0,55],[0,9],[0,13],[0,25],[2,4],[2,7],[0,22],[1,24],[0,25],[0,8],[0,26],[0,19],[0,6],[1,23],[0,18],[1,13],[0,7],[0,18],[0,23],[0,13],[1,16],[0,5],[0,22],[0,17],[0,36],[2,24],[0,15],[2,4],[1,6],[0,6],[0,15],[0,12],[0,17],[0,18],[0,5],[0,4],[0,22],[0,22],[0,18],[1,19],[0,7],[0,26],[0,20],[0,19],[0,23],[0,13],[0,6],[0,48],[0,57],[1,19],[0,11],[0,20],[0,28],[0,5],[0,33],[0,7],[0,19],[0,25],[0,5],[0,4],[0,18],[0,4],[1,4],[0,39],[2,4],[0,7],[0,11],[0,28],[0,6],[0,11],[0,15],[0,18],[0,17],[0,22],[0,5],[0,4],[0,6],[0,20],[0,9],[0,13],[0,10],[0,12],[0,6],[0,24],[0,10],[0,10],[2,38],[0,17],[0,29],[0,49],[0,5],[0,10],[2,21],[0,8],[0,23],[1,15],[0,8],[0,5],[4,4],[0,4],[0,16],[0,6],[0,13],[0,22],[0,20],[0,15],[0,13],[1,25],[0,27],[1,5],[1,41],[0,14],[0,32],[0,24],[1,13],[0,16],[0,23],[1,16],[0,26],[1,16],[0,9],[2,35],[0,25],[0,20],[0,30],[0,9],[1,6],[0,4],[0,8],[0,5],[0,5],[0,15],[0,16],[0,23],[0,25],[0,6],[0,45],[0,22],[0,15],[0,31],[0,6],[0,10],[0,14],[0,8],[0,31],[0,22],[0,4],[0,28],[0,33],[1,7],[0,8],[1,26],[0,21],[0,34],[0,26],[0,9],[0,41],[0,13],[0,21],[0,13],[0,18],[1,25],[0,6],[0,25],[2,8],[0,10],[0,34],[0,11],[0,17],[0,33],[0,16],[0,7],[0,19],[0,6],[0,22],[0,42],[0,17],[0,47],[0,21],[0,18],[0,5],[0,31],[0,13],[0,24],[0,21],[0,5],[0,7],[0,10],[0,45],[0,25],[0,5],[0,34],[0,18],[1,21],[0,14],[0,9],[0,6],[0,20],[1,72],[0,8],[0,18],[0,23],[0,49],[0,33],[0,33],[0,80],[0,7],[0,34],[0,73],[0,26],[0,34],[0,35],[0,32],[0,23],[0,14],[0,63],[0,34],[0,31],[0,36],[0,14],[0,22],[0,33],[0,20],[2,6],[0,43],[0,17],[0,4],[0,5],[0,6],[1,15],[0,39],[1,5],[0,38],[0,33],[0,23],[0,7],[0,33],[0,96],[0,13],[0,29],[0,27],[0,31],[1,36],[0,41],[0,69],[0,34],[0,5],[0,6],[0,29],[1,26],[1,60],[0,12],[0,30],[0,22],[0,45],[0,43],[0,13],[0,13],[0,6],[0,16],[0,34],[0,34],[0,31],[0,6],[0,24],[0,39],[1,27],[0,11],[0,34],[0,47],[0,35],[0,18],[0,5],[0,47],[0,27],[0,42],[0,20],[0,31],[0,26],[0,24],[0,32],[0,27],[0,15],[0,33],[1,25],[0,11],[0,5],[0,52],[0,61],[0,17],[0,44],[0,23],[0,19],[0,17],[0,26],[0,20],[0,55],[0,36],[0,29],[0,41],[0,13],[0,16],[0,40],[0,32],[0,19],[0,47],[0,48],[0,42],[0,59],[0,48],[0,38],[0,70],[0,67],[0,24],[0,44],[0,42],[0,36],[0,30],[0,39],[0,41],[0,41],[0,28],[0,28],[0,37],[0,43],[0,128],[0,38],[0,34],[0,81],[0,52],[0,111],[0,40],[0,10],[0,35],[0,28],[0,36],[0,32],[0,20],[0,22],[0,34],[0,67],[0,68],[0,36],[0,49],[0,31],[0,15],[0,47],[0,30],[0,43],[0,33],[0,41],[0,100],[0,33],[0,32],[0,49],[0,43],[0,31],[0,62],[0,9],[0,37],[0,50],[0,97],[0,34],[0,32],[0,44],[0,57],[0,13],[0,8],[0,38],[0,30],[0,28],[0,8],[0,31],[0,33],[0,49],[0,59],[0,32],[0,39],[0,41],[0,28],[0,32],[0,25],[0,45],[0,85],[0,21],[0,54],[0,36],[0,93],[0,32],[0,37],[0,69],[0,37],[0,30],[0,54],[0,38],[0,31],[0,74],[0,7],[0,9],[0,73],[0,49],[0,56],[0,30],[0,40],[0,41],[0,60],[0,19],[0,45],[0,37],[0,61],[0,49],[0,48],[0,38],[0,39],[0,25],[0,35],[0,88],[0,42],[0,38],[0,101],[0,62],[0,18],[0,39],[0,42],[0,40],[0,64],[0,47],[0,20],[0,44],[0,40],[0,36],[0,48],[0,27],[0,35],[0,39],[0,27],[0,15],[0,95],[0,8],[0,74],[0,25],[0,18],[0,50],[0,23],[0,51],[0,39],[0,50],[0,70],[0,28],[0,16],[0,19],[0,76],[0,45],[0,74],[0,51],[0,86],[0,14],[0,45],[0,10],[0,38],[0,116],[0,23],[0,77],[0,45],[0,29],[0,44],[0,26],[0,77],[0,46],[0,41],[0,33],[0,29],[0,29],[0,38],[0,42],[0,58],[0,86],[0,65],[0,34],[0,36],[0,43],[0,37],[0,47],[0,50],[0,34],[0,49],[0,70],[0,44],[0,42],[0,47],[0,52],[0,54],[0,41],[0,26],[0,30],[0,39],[0,59],[0,7],[0,41],[0,14],[0,74],[0,45],[0,20],[0,109],[0,42],[0,38],[0,22],[0,46],[0,57],[0,53],[0,25],[0,45],[0,34],[0,55],[0,23],[0,44],[0,110],[0,31],[0,46],[0,34],[0,126],[0,27],[0,120],[0,29],[0,66],[0,25],[0,47],[0,51],[0,56],[0,50],[0,39],[0,53],[0,42],[0,13],[0,47],[0,62],[0,23],[0,51],[0,44],[0,50],[0,18],[0,60],[0,22],[0,95],[0,70],[0,55],[0,63],[0,40],[0,53],[0,8],[0,45],[0,34],[0,16],[0,51],[0,75],[0,54],[0,89],[0,53],[0,15],[0,37],[0,53],[0,33],[0,46],[0,63],[0,51],[0,60],[0,54],[0,51],[0,52],[0,21],[0,42],[0,16],[0,39],[0,41],[0,25],[0,26],[0,23],[0,60],[0,49],[0,76],[0,41],[0,24],[0,44],[0,56],[0,42],[0,65],[0,138],[0,44],[0,43],[0,47],[0,49],[0,46],[0,43],[0,35],[0,68],[0,48],[0,28],[0,87],[0,92],[0,60],[0,108],[0,39],[0,24],[0,47],[0,42],[0,55],[0,63],[0,53],[0,32],[0,65],[0,59],[0,68],[0,47],[0,77],[0,32],[0,97],[0,45],[0,50],[0,37],[0,79],[0,107],[0,39],[0,27],[0,43],[0,57],[0,48],[0,85],[0,47],[0,65],[0,97],[0,57],[0,69],[0,58],[0,52],[0,47],[0,61],[0,59],[0,111],[0,86],[0,52],[0,63],[0,21],[0,52],[0,111],[0,136],[0,79],[0,79],[0,52],[0,40],[0,55],[0,80],[0,72],[0,51],[0,46],[0,82],[0,70],[0,38],[0,55],[0,32],[0,76],[0,45],[0,53],[0,56],[0,53],[0,86],[0,71],[0,60],[0,34],[0,59],[0,49],[0,49],[0,46],[0,55],[0,48],[0,105],[0,95],[0,73],[0,126],[0,86],[0,66],[0,115],[0,56],[0,51],[0,33],[0,110],[0,72],[0,52],[0,89],[0,42],[0,52],[0,28],[0,55],[0,62],[0,57],[0,62],[0,49],[0,89],[0,46],[0,44],[0,21],[0,61],[0,117],[0,55],[0,62],[0,34],[0,44],[0,38],[0,42],[0,121],[0,76],[0,27],[0,35],[0,70],[0,59],[0,48],[0,90],[0,58],[0,32],[0,97],[0,55],[0,39],[0,33],[0,58],[0,52],[0,43],[0,60],[0,66],[0,50],[0,53],[0,61],[0,48],[0,62],[0,115],[0,73],[0,69],[0,105],[0,58],[0,64],[0,32],[0,62],[0,84],[0,61],[0,55],[0,40],[0,57],[0,37],[0,102],[0,57],[0,55],[0,146],[0,50],[0,61],[0,46],[0,57],[0,59],[0,82],[0,86],[0,77],[0,56],[0,29],[0,45],[0,102],[0,50],[0,60],[0,67],[0,106],[0,65],[0,37],[0,88],[0,43],[0,55],[0,61],[0,137],[0,73],[0,63],[0,89],[0,72],[0,60],[0,87],[0,61],[0,59],[0,54],[0,62],[0,129],[0,32],[0,102],[0,70],[0,63],[0,23],[0,73],[0,66],[0,66],[0,51],[0,52],[0,59],[0,43],[0,52],[0,72],[0,79],[0,68],[0,70],[0,105],[0,37],[0,104],[0,76],[0,67],[0,71],[0,28],[0,54],[0,48],[0,61],[0,99],[0,55],[0,20],[0,68],[0,49],[0,55],[0,98],[0,76],[0,66],[0,40],[0,69],[0,91],[0,64],[0,35],[0,43],[0,46],[0,46],[0,66],[0,66],[0,68],[0,60],[0,28],[0,54],[0,56],[0,46],[0,60],[0,69],[0,69],[0,49],[0,29],[0,30],[0,51],[0,38],[0,44],[0,58],[0,124],[0,33],[0,48],[0,123],[0,67],[0,47],[0,67],[0,22],[0,128],[0,119],[0,58],[0,75],[0,35],[0,72],[0,67],[0,37],[0,67],[0,80],[0,60],[0,54],[0,92],[0,59],[0,30],[0,45],[0,63],[0,59],[0,79],[0,68],[0,67],[0,59],[0,64],[0,117],[0,58],[0,116],[0,76],[0,63],[0,74],[0,50],[0,68],[0,43],[0,111],[0,64],[0,68],[0,66],[0,69],[0,32],[0,72],[0,72],[0,63],[0,43],[0,149],[0,41],[0,67],[0,66],[0,99],[0,64],[0,64],[0,60],[1,75],[0,38],[0,69],[0,100],[0,70],[0,76],[0,65],[0,77],[0,75],[1,57],[0,73],[0,102],[0,92],[0,67],[0,51],[0,87],[0,74],[0,76],[0,103],[1,77],[0,48],[0,52],[0,117],[0,35],[0,74],[0,28],[1,70],[0,43],[0,63],[0,112],[0,98],[0,107],[0,51],[0,75],[0,64],[1,131],[0,89],[0,59],[0,41],[0,101],[0,64],[0,40],[0,48],[0,72],[0,73],[0,88],[0,55],[0,68],[0,54],[0,67],[0,67],[0,62],[0,72],[0,64],[0,74],[0,58],[0,124],[0,79],[0,86],[0,66],[0,70],[0,37],[0,62],[0,101],[0,73],[0,113],[0,71],[0,66],[0,58],[0,62],[0,87],[0,57],[0,74],[0,63],[0,73],[0,34],[0,42],[0,71],[0,109],[0,111],[0,40],[0,42],[0,143],[0,74],[0,72],[0,62],[0,45],[0,66],[0,101],[1,121],[0,38],[0,57]];      // written by tools/make_levels.js
  function parOf(n) { return PAR && PAR[n - 1] ? PAR[n - 1][1] : 40; }
  function saltOf(n) { return PAR && PAR[n - 1] ? PAR[n - 1][0] : 0; }
  function level(n) { var lv = make(n, saltOf(n)); lv.par = parOf(n); lv.limit = Math.ceil(lv.par * 1.8) + 8; return lv; }
  function limitOf(lv) { return lv.limit || Math.ceil((lv.par || 40) * 1.8) + 8; }
  function stars(lv, pieces) { var p = lv.par || Math.round(limitOf(lv) / 1.8); return pieces <= p + 2 ? 3 : pieces <= Math.ceil(p * 1.3) + 3 ? 2 : 1; }

  // Is the goal met in game g (a level's game)?
  function met(lv, g) {
    if (lv.goal === 'dig') { for (var r = 0; r < g.grid.length; r++) for (var x = 0; x < COLS; x++) if ((g.grid[r][x] & 15) === ZZ.GARBAGE) return false; return true; }
    if (lv.goal === 'lines') return g.stats.lines >= lv.need;
    return g.stats.spins + g.stats.minis >= lv.need;
  }

  ZZ.Levels = { COUNT: COUNT, make: make, level: level, endless: endless, encode: encode, decode: decode, met: met, stars: stars, limitOf: limitOf, setPar: function (p) { PAR = p; }, par: function () { return PAR; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
