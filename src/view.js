/* 轉磚 view: theme colours, tile sprites, the wall renderer with its effects, and synthesized sound. */
(function () {
  'use strict';
  var ZZ = window.ZZ, COLS = ZZ.COLS, ROWS = ZZ.ROWS, VIS = ZZ.VIS, SHAPES = ZZ.SHAPES, BOX = ZZ.BOX, TID = ZZ.TID;

  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var env = {
    reduce: mq('(prefers-reduced-motion: reduce)').matches,
    touch: mq('(pointer: coarse)').matches || ('ontouchstart' in window),
    dpr: Math.min(window.devicePixelRatio || 1, 3)
  };
  // Tile glazes by piece id: I ivory, O pink, T gold, S sky, Z jade, J coral, L lilac, 8 = cement.
  var TILE = [null, '#F1EADB', '#FF9DB5', '#F5B82E', '#5DB7F5', '#37C29A', '#F0704F', '#B49CFF', '#8C939B'];
  var theme = {};

  function hex(c) {
    c = String(c).trim().replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c, to, a) {
    var p = hex(c), q = hex(to);
    return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * a) + ',' + Math.round(p[1] + (q[1] - p[1]) * a) + ',' + Math.round(p[2] + (q[2] - p[2]) * a) + ')';
  }
  function rgba(c, a) { var p = hex(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    ['floor', 'floor-chip', 'panel', 'edge', 'ink', 'muted', 'wall', 'wall-mark', 'wall-ink', 'gold', 'alarm'].forEach(function (k) {
      theme[k] = cs.getPropertyValue('--' + k).trim() || '#888888';
    });
  }

  // Terrazzo floor: stone chips scattered on the page background, drawn once per theme.
  function terrazzo() {
    var s = 320, c = document.createElement('canvas');
    c.width = c.height = s * 2;
    var x = c.getContext('2d');
    x.scale(2, 2);
    x.fillStyle = theme.floor;
    x.fillRect(0, 0, s, s);
    var rnd = new ZZ.RNG(20261118);
    var cols = [theme['floor-chip'], theme['floor-chip'], theme['floor-chip'], mix(theme.floor, TILE[4], 0.3), mix(theme.floor, TILE[6], 0.28),
      mix(theme.floor, TILE[3], 0.34), mix(theme.floor, TILE[5], 0.26), mix(theme.floor, theme.ink, 0.16)];
    for (var i = 0; i < 170; i++) {
      var cx = rnd.next() * s, cy = rnd.next() * s, r = 1.5 + rnd.next() * rnd.next() * 9, n = 3 + Math.floor(rnd.next() * 3), a0 = rnd.next() * 6.283, pts = [];
      for (var k = 0; k < n; k++) {
        var a = a0 + (k + rnd.next() * 0.6) * 6.283 / n, rad = r * (0.6 + rnd.next() * 0.5);
        pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      x.fillStyle = cols[Math.floor(rnd.next() * cols.length)];
      for (var ox = -s; ox <= s; ox += s) for (var oy = -s; oy <= s; oy += s) {
        if (cx + ox < -12 || cx + ox > s + 12 || cy + oy < -12 || cy + oy > s + 12) continue;
        x.beginPath();
        for (k = 0; k < n; k++) x[k ? 'lineTo' : 'moveTo'](cx + ox + pts[k][0], cy + oy + pts[k][1]);
        x.closePath();
        x.fill();
      }
    }
    try {
      document.body.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
      document.body.style.backgroundSize = s + 'px ' + s + 'px';
    } catch (e) { /* plain floor colour is fine */ }
  }

  function rr(x, a, b, w, h, r) {
    x.beginPath();
    x.moveTo(a + r, b);
    x.arcTo(a + w, b, a + w, b + h, r);
    x.arcTo(a + w, b + h, a, b + h, r);
    x.arcTo(a, b + h, a, b, r);
    x.arcTo(a, b, a + w, b, r);
    x.closePath();
  }

  // ---------- looks: tile styles, wall backgrounds and clear effects the player can swap ----------
  var LOOK = { tile: 'glaze', bg: 'wall', fx: 'shard', dim: 45, img: { tile: null, bg: null } }, lookRev = 0;
  function setLook(o) {
    for (var k in o) {
      if (k === 'img') { for (var n in o.img) LOOK.img[n] = o.img[n]; }
      else LOOK[k] = o[k];
    }
    spriteCache = {};
    lookRev++;
  }

  function cementTile(x, px, col) {
    var g = Math.max(0.5, px * 0.04), r = px * 0.18, w = px - 2 * g;
    rr(x, g, g, w, w, r);
    x.fillStyle = col;
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = 'rgba(0,0,0,0.16)';
    x.fillRect(0, px * 0.82, px, px);
    x.fillStyle = 'rgba(255,255,255,0.10)';
    x.fillRect(0, 0, px, px * 0.13);
    var rnd = new ZZ.RNG(77), d = Math.max(1, px * 0.055);
    for (var i = 0; i < Math.round(px * 0.45); i++) {
      x.fillStyle = rnd.next() < 0.5 ? 'rgba(0,0,0,0.17)' : 'rgba(255,255,255,0.15)';
      x.fillRect(rnd.next() * px, rnd.next() * px, d, d);
    }
    x.restore();
  }
  function poly(x, pts, fill) {
    x.beginPath();
    for (var i = 0; i < pts.length; i++) x[i ? 'lineTo' : 'moveTo'](pts[i][0], pts[i][1]);
    x.closePath();
    x.fillStyle = fill;
    x.fill();
  }
  var TILE_DRAW = {
    glaze: function (x, px, col, id) {
      var g = Math.max(0.5, px * 0.04), r = px * 0.18, w = px - 2 * g;
      rr(x, g, g, w, w, r);
      var lg = x.createLinearGradient(0, 0, 0, px);
      lg.addColorStop(0, mix(col, '#ffffff', 0.18));
      lg.addColorStop(0.5, col);
      lg.addColorStop(1, mix(col, '#000000', 0.14));
      x.fillStyle = lg;
      x.fill();
      x.save();
      x.clip();
      x.fillStyle = 'rgba(0,0,0,0.17)';
      x.fillRect(0, px * 0.86, px, px);
      var hg = x.createRadialGradient(px * 0.32, px * 0.26, 0, px * 0.32, px * 0.26, px * 0.46);
      hg.addColorStop(0, 'rgba(255,255,255,' + (id === 3 ? 0.78 : 0.5) + ')');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hg;
      x.fillRect(0, 0, px, px);
      x.restore();
    },
    pixel: function (x, px, col, id) {
      var b = Math.max(1, Math.round(px * 0.13));
      x.fillStyle = col;
      x.fillRect(0, 0, px, px);
      x.fillStyle = 'rgba(255,255,255,0.42)';
      x.fillRect(0, 0, px, b); x.fillRect(0, 0, b, px);
      x.fillStyle = 'rgba(0,0,0,0.32)';
      x.fillRect(0, px - b, px, b); x.fillRect(px - b, 0, b, px);
      if (id === 8) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(b * 2, b * 2, px - b * 4, px - b * 4); }
    },
    mosaic: function (x, px, col) {
      var g = Math.max(1, px * 0.05), h = (px - g * 3) / 2, sh = [0.16, -0.05, -0.12, 0.05];
      for (var i = 0; i < 4; i++) {
        var cx = g + (i % 2) * (h + g), cy = g + (i >> 1) * (h + g);
        rr(x, cx, cy, h, h, h * 0.22);
        x.fillStyle = sh[i] > 0 ? mix(col, '#ffffff', sh[i]) : mix(col, '#000000', -sh[i]);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.3)';
        x.fillRect(cx + h * 0.16, cy + h * 0.14, h * 0.5, Math.max(1, h * 0.13));
      }
    },
    brick: function (x, px, col) {
      var g = Math.max(0.5, px * 0.03), lw = Math.max(1, px * 0.07), rnd = new ZZ.RNG(31), w = px - 2 * g;
      x.fillStyle = mix(col, '#5A2A18', 0.22);
      x.fillRect(g, g, w, w);
      for (var i = 0; i < Math.round(px * 0.5); i++) {
        x.fillStyle = rnd.next() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.14)';
        x.fillRect(g + rnd.next() * w, g + rnd.next() * w, Math.max(1, px * 0.06), Math.max(1, px * 0.04));
      }
      x.fillStyle = 'rgba(244,236,222,0.78)';
      x.fillRect(g, px / 2 - lw / 2, w, lw);
      x.fillRect(px * 0.5 - lw / 2, g, lw, px / 2 - g);
      x.fillRect(px * 0.22 - lw / 2, px / 2, lw, px / 2 - g);
      x.fillRect(px * 0.78 - lw / 2, px / 2, lw, px / 2 - g);
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(g, px - g - Math.max(1, px * 0.07), w, Math.max(1, px * 0.07));
    },
    candy: function (x, px, col) {
      var g = Math.max(0.5, px * 0.05), w = px - 2 * g;
      rr(x, g, g, w, w, px * 0.34);
      var rg = x.createRadialGradient(px * 0.4, px * 0.34, px * 0.05, px * 0.5, px * 0.5, px * 0.62);
      rg.addColorStop(0, mix(col, '#ffffff', 0.45));
      rg.addColorStop(0.55, col);
      rg.addColorStop(1, mix(col, '#000000', 0.22));
      x.fillStyle = rg;
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.beginPath();
      x.ellipse(px * 0.36, px * 0.27, px * 0.17, px * 0.085, -0.5, 0, 6.283);
      x.fill();
    },
    glass: function (x, px, col) {
      var g = Math.max(0.5, px * 0.04), w = px - 2 * g, lw = Math.max(1, px * 0.08);
      rr(x, g, g, w, w, px * 0.14);
      x.fillStyle = rgba(col, 0.36);
      x.fill();
      x.save();
      x.clip();
      var lg = x.createLinearGradient(0, 0, px, px);
      lg.addColorStop(0, 'rgba(255,255,255,0.42)');
      lg.addColorStop(0.45, 'rgba(255,255,255,0.04)');
      lg.addColorStop(1, 'rgba(255,255,255,0.18)');
      x.fillStyle = lg;
      x.fillRect(0, 0, px, px);
      x.restore();
      rr(x, g + lw / 2, g + lw / 2, w - lw, w - lw, px * 0.11);
      x.lineWidth = lw;
      x.strokeStyle = rgba(col, 0.95);
      x.stroke();
      rr(x, g + lw * 1.7, g + lw * 1.7, w - lw * 3.4, w - lw * 3.4, px * 0.07);
      x.lineWidth = Math.max(0.6, px * 0.03);
      x.strokeStyle = 'rgba(255,255,255,0.45)';
      x.stroke();
    },
    wood: function (x, px, col) {
      var g = Math.max(0.5, px * 0.04), w = px - 2 * g, rnd = new ZZ.RNG(57);
      rr(x, g, g, w, w, px * 0.12);
      x.fillStyle = mix(col, '#C89A62', 0.3);
      x.fill();
      x.save();
      x.clip();
      x.strokeStyle = 'rgba(70,40,10,0.22)';
      x.lineWidth = Math.max(0.6, px * 0.035);
      for (var i = 0; i < 5; i++) {
        var yy = px * (0.14 + i * 0.18) + (rnd.next() - 0.5) * px * 0.05;
        x.beginPath();
        x.moveTo(0, yy);
        x.bezierCurveTo(px * 0.3, yy - px * 0.07, px * 0.65, yy + px * 0.08, px, yy - px * 0.02);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,0.28)';
      x.fillRect(0, 0, px, px * 0.12);
      x.fillStyle = 'rgba(0,0,0,0.2)';
      x.fillRect(0, px * 0.86, px, px);
      x.restore();
    },
    neon: function (x, px, col, id) {
      var g = px * 0.12, w = px - 2 * g, lw = Math.max(1.2, px * 0.09);
      if (id === 8) col = '#7C8794';
      rr(x, g * 0.5, g * 0.5, px - g, px - g, px * 0.16);
      x.fillStyle = 'rgba(6,4,14,0.72)';
      x.fill();
      x.save();
      x.shadowColor = col;
      x.shadowBlur = px * 0.3;
      rr(x, g, g, w, w, px * 0.14);
      x.lineWidth = lw;
      x.strokeStyle = col;
      x.stroke();
      x.stroke();
      x.restore();
      rr(x, g, g, w, w, px * 0.14);
      x.lineWidth = Math.max(0.6, lw * 0.35);
      x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.stroke();
    },
    gem: function (x, px, col) {
      var g = Math.max(0.5, px * 0.04), a = g, b = px - g, m = px * 0.28;
      poly(x, [[a, a], [b, a], [b - m, a + m], [a + m, a + m]], mix(col, '#ffffff', 0.5));
      poly(x, [[a, a], [a + m, a + m], [a + m, b - m], [a, b]], mix(col, '#ffffff', 0.2));
      poly(x, [[b, a], [b, b], [b - m, b - m], [b - m, a + m]], mix(col, '#000000', 0.18));
      poly(x, [[a, b], [a + m, b - m], [b - m, b - m], [b, b]], mix(col, '#000000', 0.36));
      poly(x, [[a + m, a + m], [b - m, a + m], [b - m, b - m], [a + m, b - m]], col);
      poly(x, [[a + m, a + m], [a + m + px * 0.16, a + m], [a + m, a + m + px * 0.16]], 'rgba(255,255,255,0.6)');
    },
    custom: function (x, px, col, id) {
      var img = LOOK.img.tile;
      if (!img) return TILE_DRAW.glaze(x, px, col, id);
      var g = Math.max(0.5, px * 0.04), w = px - 2 * g, lw = Math.max(1, px * 0.1), sq = Math.min(img.width, img.height);
      rr(x, g, g, w, w, px * 0.16);
      x.save();
      x.clip();
      x.drawImage(img, (img.width - sq) / 2, (img.height - sq) / 2, sq, sq, g, g, w, w);
      x.fillStyle = rgba(col, 0.34);
      x.fillRect(0, 0, px, px);
      x.restore();
      rr(x, g + lw / 2, g + lw / 2, w - lw, w - lw, px * 0.13);
      x.lineWidth = lw;
      x.strokeStyle = col;
      x.stroke();
    }
  };
  function makeTile(px, id, style) {
    var c = document.createElement('canvas');
    c.width = c.height = px;
    var x = c.getContext('2d'), col = TILE[id];
    if (px < 9) {
      var gap = px > 4 ? 1 : 0;
      x.fillStyle = col;
      x.fillRect(0, 0, px - gap, px - gap);
      return c;
    }
    if (id === 8 && style !== 'neon' && style !== 'pixel') { cementTile(x, px, col); return c; }
    (TILE_DRAW[style] || TILE_DRAW.glaze)(x, px, col, id);
    return c;
  }

  // The wall behind the tiles. o: { bx, by, W, H, cell, rows, plain }
  function paintWall(x, style, o) {
    var W = o.W, bx = o.bx, by = o.by, cell = o.cell, full = by + o.H + 1, i, j, g, rnd = new ZZ.RNG(4242);
    function grad(stops) {
      g = x.createLinearGradient(0, 0, 0, full);
      for (var k = 0; k < stops.length; k++) g.addColorStop(stops[k][0], stops[k][1]);
      x.fillStyle = g;
      x.fillRect(bx, 0, W, full);
    }
    function dots(c) {
      if (o.plain || cell < 12) return;
      x.fillStyle = c;
      for (i = 1; i < COLS; i++) for (j = 1; j < o.rows; j++) x.fillRect(bx + i * cell - 1, by + j * cell - 1, 2, 2);
    }
    if (style === 'blueprint') {
      x.fillStyle = '#12356B';
      x.fillRect(bx, 0, W, full);
      x.fillStyle = 'rgba(190,220,255,0.16)';
      for (i = 0; i <= COLS; i++) x.fillRect(bx + i * cell - 0.5, 0, 1, full);
      for (j = 0; j <= o.rows; j++) x.fillRect(bx, by + j * cell - 0.5, W, 1);
      x.fillStyle = 'rgba(190,220,255,0.3)';
      for (i = 0; i <= COLS; i += 5) x.fillRect(bx + i * cell - 1, 0, 2, full);
      for (j = 0; j <= o.rows; j += 5) x.fillRect(bx, by + j * cell - 1, W, 2);
    } else if (style === 'board') {
      x.fillStyle = '#1E3A31';
      x.fillRect(bx, 0, W, full);
      x.save();
      x.beginPath(); x.rect(bx, 0, W, full); x.clip();
      for (i = 0; i < 26; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (0.015 + rnd.next() * 0.03) + ')';
        x.fillRect(bx + rnd.next() * W - cell, rnd.next() * full, cell * (2 + rnd.next() * 5), cell * (0.3 + rnd.next() * 0.9));
      }
      x.restore();
      dots('rgba(255,255,255,0.22)');
    } else if (style === 'stone') {
      x.fillStyle = '#262B33';
      x.fillRect(bx, 0, W, full);
      var cols = ['#3A414C', '#4A4F58', '#5B4A46', '#3F5057', '#6A6257', '#2F3640'];
      x.save();
      x.beginPath(); x.rect(bx, 0, W, full); x.clip();
      for (i = 0; i < Math.round(W * full / 520); i++) {
        var cx = bx + rnd.next() * W, cy = rnd.next() * full, r = 1.5 + rnd.next() * rnd.next() * cell * 0.5, n = 3 + Math.floor(rnd.next() * 3), a0 = rnd.next() * 6.283;
        x.fillStyle = cols[Math.floor(rnd.next() * cols.length)];
        x.beginPath();
        for (j = 0; j < n; j++) { var a = a0 + (j + rnd.next() * 0.5) * 6.283 / n; x[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        x.closePath();
        x.fill();
      }
      x.restore();
    } else if (style === 'night') {
      grad([[0, '#070B24'], [0.6, '#131238'], [1, '#2A1B4D']]);
      for (i = 0; i < Math.round(W * full / 900); i++) {
        var sz = rnd.next() < 0.12 ? 2 : 1;
        x.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd.next() * 0.6) + ')';
        x.fillRect(bx + rnd.next() * (W - 2), rnd.next() * full, sz, sz);
      }
      x.fillStyle = 'rgba(255,244,214,0.9)';
      x.beginPath(); x.arc(bx + W * 0.8, by + cell * 2.2, cell * 0.9, 0, 6.283); x.fill();
      x.fillStyle = '#0B0F2C';
      x.beginPath(); x.arc(bx + W * 0.8 + cell * 0.38, by + cell * 2.0, cell * 0.8, 0, 6.283); x.fill();
    } else if (style === 'tatami') {
      x.fillStyle = '#343B26';
      x.fillRect(bx, 0, W, full);
      x.save();
      x.beginPath(); x.rect(bx, 0, W, full); x.clip();
      for (j = -1; j < o.rows / 2 + 1; j++) for (i = 0; i < COLS / 2; i++) {
        var tx = bx + i * 2 * cell, ty = by + j * 2 * cell, horiz = (i + j) % 2 === 0;
        x.fillStyle = horiz ? 'rgba(255,255,220,0.07)' : 'rgba(0,0,0,0.1)';
        for (var k = 0; k < 2 * cell; k += 3) { if (horiz) x.fillRect(tx, ty + k, 2 * cell, 1); else x.fillRect(tx + k, ty, 1, 2 * cell); }
        x.fillStyle = 'rgba(20,24,12,0.55)';
        x.fillRect(tx, ty, 2 * cell, 1.5);
        x.fillRect(tx, ty, 1.5, 2 * cell);
      }
      x.restore();
    } else if (style === 'dusk') {
      grad([[0, '#1B1438'], [0.45, '#4A2350'], [0.8, '#8A3D45'], [1, '#B4582F']]);
      x.fillStyle = 'rgba(10,6,20,0.28)';
      x.fillRect(bx, 0, W, full);
      x.fillStyle = 'rgba(12,8,22,0.55)';
      x.beginPath();
      x.moveTo(bx, full);
      for (i = 0; i <= 10; i++) x.lineTo(bx + W * i / 10, full - cell * (0.8 + rnd.next() * 1.8));
      x.lineTo(bx + W, full);
      x.closePath();
      x.fill();
    } else if (style === 'neongrid') {
      x.fillStyle = '#0A0616';
      x.fillRect(bx, 0, W, full);
      x.fillStyle = 'rgba(64,224,255,0.22)';
      for (i = 0; i <= COLS; i++) x.fillRect(bx + i * cell - 0.5, 0, 1, full);
      x.fillStyle = 'rgba(255,72,176,0.24)';
      for (j = 0; j <= o.rows; j++) x.fillRect(bx, by + j * cell - 0.5, W, 1);
      g = x.createLinearGradient(0, full - cell * 6, 0, full);
      g.addColorStop(0, 'rgba(255,72,176,0)');
      g.addColorStop(1, 'rgba(255,72,176,0.22)');
      x.fillStyle = g;
      x.fillRect(bx, full - cell * 6, W, cell * 6);
    } else if (style === 'ember') {
      grad([[0, '#120806'], [0.6, '#2A0F0A'], [1, '#5C1D0C']]);
      for (i = 0; i < Math.round(W * full / 1400); i++) {
        var ey = full - rnd.next() * rnd.next() * full, er = 0.8 + rnd.next() * 1.6;
        x.fillStyle = 'rgba(255,' + Math.round(120 + rnd.next() * 90) + ',40,' + (0.25 + rnd.next() * 0.55) + ')';
        x.beginPath(); x.arc(bx + er + rnd.next() * (W - 2 * er), ey, er, 0, 6.283); x.fill();
      }
    } else if (style === 'custom' && LOOK.img.bg) {
      var img = LOOK.img.bg, sc = Math.max(W / img.width, full / img.height), dw = img.width * sc, dh = img.height * sc;
      x.fillStyle = '#000000';
      x.fillRect(bx, 0, W, full);
      x.save();
      x.beginPath(); x.rect(bx, 0, W, full); x.clip();
      x.drawImage(img, bx + (W - dw) / 2, (full - dh) / 2, dw, dh);
      x.restore();
      x.fillStyle = 'rgba(0,0,0,' + (Math.max(0, Math.min(90, LOOK.dim)) / 100) + ')';
      x.fillRect(bx, 0, W, full);
      dots('rgba(255,255,255,0.24)');
    } else {
      x.fillStyle = theme.wall;
      x.fillRect(bx, 0, W, full);
      if (!o.plain && cell >= 12) {
        // tile spacers: a small cross at every joint
        var aa = Math.max(1.5, cell * 0.11);
        x.fillStyle = theme['wall-mark'];
        for (i = 1; i < COLS; i++) for (j = 1; j < o.rows; j++) {
          var px = bx + i * cell, py = by + j * cell;
          x.fillRect(px - aa, py - 0.5, aa * 2, 1);
          x.fillRect(px - 0.5, py - aa, 1, aa * 2);
        }
      }
    }
  }

  // One flying bit of a cleared row. kind: shard, star, bubble, petal.
  function drawPart(ctx, kind, s, c) {
    if (kind === 'star') {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (var i = 0; i < 8; i++) { var r = i % 2 ? s * 0.32 : s * 0.95, a = i * 0.7854; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'bubble') {
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1, s * 0.2);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-s * 0.3, -s * 0.34, Math.max(1, s * 0.2), Math.max(1, s * 0.2));
    } else if (kind === 'petal') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.8, s * 0.38, 0, 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = c;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    }
  }
  var PART = {
    shard: { g: 1100, vx: 340, vy0: -70, vy: -280, tint: null },
    star: { g: 520, vx: 300, vy0: -90, vy: -260, tint: ['#FFF3B0', 0.45] },
    bubble: { g: -260, vx: 150, vy0: -20, vy: -120, tint: ['#DDF4FF', 0.35] },
    petal: { g: 300, vx: 240, vy0: -60, vy: -200, tint: ['#FFC1D6', 0.55] }
  };

  // Item tile: a white glazed tile with one character fired onto it.
  function makeItemTile(px, id) {
    var c = document.createElement('canvas');
    c.width = c.height = px;
    var x = c.getContext('2d'), it = ZZ.ITEMS[id];
    if (px < 9) {
      x.fillStyle = '#FFFFFF';
      x.fillRect(0, 0, px - (px > 4 ? 1 : 0), px - (px > 4 ? 1 : 0));
      return c;
    }
    var g = Math.max(0.5, px * 0.04), r = px * 0.18, w = px - 2 * g;
    rr(x, g, g, w, w, r);
    var lg = x.createLinearGradient(0, 0, 0, px);
    lg.addColorStop(0, '#FFFFFF');
    lg.addColorStop(1, '#E3E8EE');
    x.fillStyle = lg;
    x.fill();
    x.lineWidth = Math.max(1, px * 0.09);
    x.strokeStyle = it.color;
    rr(x, g + x.lineWidth / 2, g + x.lineWidth / 2, w - x.lineWidth, w - x.lineWidth, r * 0.8);
    x.stroke();
    x.fillStyle = it.color;
    x.font = '900 ' + Math.round(px * 0.6) + 'px ' + fontFamily();
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(it.ch, px / 2, px / 2 + px * 0.04);
    return c;
  }
  function fontFamily() { return env.font || (env.font = getComputedStyle(document.body).fontFamily || 'sans-serif'); }
  var itemCache = {};
  function itemSprites(px) {
    if (!itemCache[px]) {
      var t = [null];
      for (var i = 1; i < ZZ.ITEMS.length; i++) t.push(makeItemTile(px, i));
      itemCache[px] = t;
    }
    return itemCache[px];
  }
  function clearItemSprites() { itemCache = {}; }

  var spriteCache = {};
  function sprites(px, style) {
    style = style || LOOK.tile;
    var key = style + '|' + px;
    if (!spriteCache[key]) {
      var t = [null];
      for (var i = 1; i <= 8; i++) t.push(makeTile(px, i, style));
      spriteCache[key] = t;
    }
    return spriteCache[key];
  }

  function sizeCanvas(cv, w, h) {
    cv.width = Math.round(w * env.dpr);
    cv.height = Math.round(h * env.dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    var x = cv.getContext('2d');
    x.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    return x;
  }

  // Draw one piece in its spawn pose, centred on (cx, cy).
  function drawPiece(ctx, type, cx, cy, cell, style) {
    var sh = SHAPES[type][0], x0 = 9, x1 = -9, y0 = 9, y1 = -9, i;
    for (i = 0; i < 4; i++) {
      x0 = Math.min(x0, sh[i][0]); x1 = Math.max(x1, sh[i][0]);
      y0 = Math.min(y0, sh[i][1]); y1 = Math.max(y1, sh[i][1]);
    }
    var ox = cx - (x1 - x0 + 1) * cell / 2 - x0 * cell, oy = cy - (y1 - y0 + 1) * cell / 2 - y0 * cell;
    var tile = sprites(Math.round(cell * env.dpr), style)[TID[type]];
    for (i = 0; i < 4; i++) ctx.drawImage(tile, ox + sh[i][0] * cell, oy + sh[i][1] * cell, cell, cell);
  }

  function drawItem(ctx, id, x, y, size) {
    ctx.drawImage(itemSprites(Math.max(2, Math.round(size * env.dpr)))[id], x, y, size, size);
  }

  // ---------- the wall ----------
  function BoardView(cv, o) {
    o = o || {};
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.rows = o.rows || VIS;
    this.sky = o.sky != null ? o.sky : 1.25;
    this.meterOn = !!o.meter;
    this.plain = !!o.plain;
    this.cell = 0; this.mw = 0;
    this.fx = []; this.parts = [];
    this.vis = { ox: 0, oy: 0, ang: 0 };
    this.sh = { x: 0, y: 0, vx: 0, vy: 0 };
    this.koT = 0; this.cracks = null; this.bg = null;
    this.look = o.look || null;      // a fixed look for previews; otherwise the player's current one
    this.rev = -1;
  }
  BoardView.prototype.lookOf = function (k) { return (this.look && this.look[k]) || LOOK[k]; };

  BoardView.prototype.resize = function (cell) {
    this.cell = cell;
    this.mw = this.meterOn ? Math.max(5, Math.round(cell * 0.28)) : 0;
    this.w = COLS * cell + this.mw;
    this.h = Math.round((this.rows + this.sky) * cell);
    sizeCanvas(this.cv, this.w, this.h);
    this.tiles = sprites(Math.max(2, Math.round(cell * env.dpr)), this.lookOf('tile'));
    this.itiles = itemSprites(Math.max(2, Math.round(cell * env.dpr)));
    this.bg = null;
    this.rev = lookRev;
  };

  BoardView.prototype.makeBg = function () {
    var c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    var x = c.getContext('2d'), cell = this.cell, bx = this.mw, by = this.sky * cell, W = COLS * cell, H = this.rows * cell, i;
    x.scale(env.dpr, env.dpr);
    x.fillStyle = theme.wall;
    x.fillRect(0, 0, this.w, this.h + 1);
    paintWall(x, this.lookOf('bg'), { bx: bx, by: by, W: W, H: H, cell: cell, rows: this.rows, plain: this.plain });
    if (this.mw) {
      x.fillStyle = theme.wall;
      x.fillRect(0, 0, this.mw, this.h + 1);
      x.fillStyle = 'rgba(0,0,0,0.28)';
      x.fillRect(0, 0, this.mw, this.h + 1);
    }
    if (this.sky) {
      x.fillStyle = 'rgba(255,255,255,0.06)';
      x.fillRect(bx, 0, W, by);
      x.fillStyle = 'rgba(255,255,255,0.3)';
      for (i = 0; i < W; i += 8) x.fillRect(bx + i, by - 1, 4, 1);
    }
    this.bg = c;
  };

  BoardView.prototype.cellXY = function (x, y) {
    return [this.mw + x * this.cell, this.sky * this.cell + (y - (ROWS - this.rows)) * this.cell];
  };

  BoardView.prototype.kick = function (vx, vy) { if (!env.reduce) { this.sh.vx += vx; this.sh.vy += vy; } };

  BoardView.prototype.addFlash = function (cells, now) { this.fx.push({ k: 'flash', cells: cells, t: now, d: 160 }); };

  BoardView.prototype.addClear = function (rows, colors, now, strong) {
    this.fx.push({ k: 'clear', rows: rows, t: now, d: 260, strong: strong });
    if (env.reduce || this.cell < 9) return;
    var cell = this.cell, kind = this.lookOf('fx'), P = PART[kind] || PART.shard;
    for (var i = 0; i < rows.length; i++) {
      for (var x = 0; x < COLS; x++) {
        if (this.parts.length > 170) return;
        var p = this.cellXY(x, rows[i]), col = colors[i][x] >> 4 ? '#ffffff' : (TILE[colors[i][x] & 15] || '#ffffff');
        if (P.tint) col = mix(col, P.tint[0], P.tint[1]);
        for (var k = 0; k < 2; k++) {
          this.parts.push({
            x: p[0] + cell / 2, y: p[1] + cell / 2, vx: (Math.random() - 0.5) * P.vx, vy: P.vy0 + Math.random() * P.vy, g: P.g, k: kind,
            a: Math.random() * 6, va: (Math.random() - 0.5) * (kind === 'bubble' ? 2 : 16), s: cell * (0.2 + Math.random() * 0.22), c: col,
            life: (kind === 'shard' ? 420 : 620) + Math.random() * 320
          });
        }
      }
    }
  };

  BoardView.prototype.addStreak = function (e, now) {
    if (env.reduce || e.n < 2) return;
    var sh = SHAPES[e.piece][e.rot], cols = {};
    for (var i = 0; i < 4; i++) {
      var cx = e.x + sh[i][0], cy = e.y + sh[i][1];
      if (cols[cx] === undefined || cy < cols[cx]) cols[cx] = cy;
    }
    this.fx.push({ k: 'streak', cols: cols, n: Math.min(e.n, 12), t: now, d: 190 });
  };

  BoardView.prototype.addShine = function (now) { if (!env.reduce && this.cell >= 9) this.fx.push({ k: 'shine', t: now, d: 460 }); };

  BoardView.prototype.addSpark = function (g, now) {
    var c = g.cur;
    if (!c || this.cell < 9) return;
    this.fx.push({ k: 'spark', x: c.x + 1.5, y: c.y + 1.5, t: now, d: 300 });
  };

  BoardView.prototype.addDust = function (x, y, now) {
    if (env.reduce || this.cell < 9) return;
    var p = this.cellXY(x, y), cell = this.cell;
    for (var k = 0; k < 16; k++) {
      this.parts.push({
        x: p[0], y: p[1], vx: (Math.random() - 0.5) * 420, vy: -120 - Math.random() * 320,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 18, s: cell * (0.14 + Math.random() * 0.16), c: TILE[3], life: 500 + Math.random() * 350
      });
    }
  };

  // Rows knocked out from the bottom: shards fly from where they were.
  BoardView.prototype.addCrumble = function (rows, now) {
    this.fx.push({ k: 'wash', t: now, d: 260, c: '255,255,255' });
    if (env.reduce || this.cell < 9) return;
    var cell = this.cell;
    for (var i = 0; i < rows.length; i++) {
      for (var x = 0; x < COLS; x++) {
        if (!rows[i][x] || this.parts.length > 190) continue;
        var p = this.cellXY(x, ROWS - 1 - i);
        this.parts.push({
          x: p[0] + cell / 2, y: p[1] + cell / 2, vx: (Math.random() - 0.5) * 380, vy: -160 - Math.random() * 320,
          a: Math.random() * 6, va: (Math.random() - 0.5) * 16, s: cell * (0.24 + Math.random() * 0.22), c: TILE[rows[i][x] & 15] || '#ffffff', life: 500 + Math.random() * 300
        });
      }
    }
  };
  BoardView.prototype.addWash = function (now, rgb, ms) { this.fx.push({ k: 'wash', t: now, d: ms || 320, c: rgb || '255,255,255' }); };

  BoardView.prototype.knock = function (now) {
    this.koT = now;
    var lines = [], W = COLS * this.cell, H = this.rows * this.cell;
    for (var i = 0; i < 7; i++) {
      var a = Math.random() * 6.283, x = W * (0.35 + Math.random() * 0.3), y = H * (0.3 + Math.random() * 0.3), pts = [[x, y]];
      for (var k = 0; k < 5; k++) {
        a += (Math.random() - 0.5) * 1.1;
        var len = this.cell * (1.2 + Math.random() * 2.4);
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        pts.push([x, y]);
      }
      lines.push(pts);
    }
    this.cracks = lines;
  };

  BoardView.prototype.settle = function (dt) {
    var v = this.vis, k = dt > 0 ? Math.exp(-dt / 30) : 0;
    v.ox *= k; v.oy *= k; v.ang *= k;
    if (v.ox < 0.02 && v.ox > -0.02) v.ox = 0;
    if (v.oy < 0.02 && v.oy > -0.02) v.oy = 0;
    if (v.ang < 0.6 && v.ang > -0.6) v.ang = 0;
    var s = this.sh, t = Math.min(dt, 32) / 1000;
    s.vx += (-340 * s.x - 24 * s.vx) * t; s.vy += (-340 * s.y - 24 * s.vy) * t;
    s.x += s.vx * t; s.y += s.vy * t;
  };

  BoardView.prototype.outline = function (cells, now, strong, label) {
    var ctx = this.ctx, cell = this.cell, top = null, i, p;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, cell * 0.09);
    ctx.setLineDash([cell * 0.3, cell * 0.2]);
    ctx.lineDashOffset = env.reduce ? 0 : -now / 55;
    var pulse = env.reduce ? 0.8 : 0.62 + 0.28 * Math.sin(now / 210);
    ctx.strokeStyle = 'rgba(245,184,46,' + (strong ? pulse : 0.42) + ')';
    ctx.fillStyle = 'rgba(245,184,46,' + (strong ? 0.2 : 0.07) + ')';
    for (i = 0; i < cells.length; i++) {
      p = this.cellXY(cells[i][0], cells[i][1]);
      rr(ctx, p[0] + 2, p[1] + 2, cell - 4, cell - 4, cell * 0.16);
      ctx.fill();
      ctx.stroke();
      if (!top || p[1] < top[1]) top = p;
    }
    ctx.restore();
    if (label && top && cell >= 14) {
      ctx.save();
      ctx.font = '900 ' + Math.round(cell * 0.6) + 'px ' + fontFamily();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var lx = clampN(top[0] + cell / 2, this.mw + cell * 1.2, this.mw + COLS * cell - cell * 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(label, lx + 1, top[1] - 2);
      ctx.fillStyle = '#F5B82E';
      ctx.fillText(label, lx, top[1] - 3);
      ctx.restore();
    }
  };
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }

  BoardView.prototype.draw = function (g, now, o) {
    o = o || {};
    var ctx = this.ctx, cell = this.cell, bx = this.mw, by = this.sky * cell, first = ROWS - this.rows, dpr = env.dpr;
    var W = COLS * cell, H = this.rows * cell, r, x, i, f, p;
    if (this.rev !== lookRev) { this.rev = lookRev; this.tiles = sprites(Math.max(2, Math.round(cell * dpr)), this.lookOf('tile')); this.bg = null; }
    if (!this.bg) this.makeBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var tiles = this.tiles, itiles = this.itiles;
    for (r = first - Math.ceil(this.sky); r < ROWS; r++) {
      var row = g.grid[r], y = by + (r - first) * cell;
      for (x = 0; x < COLS; x++) {
        var v = row[x];
        if (v) ctx.drawImage(v >> 4 ? itiles[v >> 4] : tiles[v & 15], bx + x * cell, y, cell, cell);
      }
    }

    if (o.danger) {
      var hgt = g.stackHeight();
      if (hgt >= 14) {
        var a = Math.min(1, (hgt - 13) / 6) * (env.reduce ? 0.28 : 0.22 + 0.12 * Math.sin(now / 140));
        var dg = ctx.createLinearGradient(0, 0, 0, by + cell * 7);
        dg.addColorStop(0, 'rgba(217,67,47,' + a + ')');
        dg.addColorStop(1, 'rgba(217,67,47,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(bx, 0, W, by + cell * 7);
      }
    }

    if (o.target) this.outline(o.target.cells, now, o.target.strong, o.target.label);

    var c = g.cur;
    if (c) {
      var sh = SHAPES[c.type][c.rot], id = TID[c.type], col = TILE[id];
      if (o.ghost) {
        var gy = g.ghostY();
        if (gy > c.y) {
          ctx.save();
          ctx.strokeStyle = rgba(col, 0.85);
          ctx.fillStyle = rgba(col, 0.15);
          ctx.lineWidth = Math.max(1.2, cell * 0.07);
          for (i = 0; i < 4; i++) {
            p = this.cellXY(c.x + sh[i][0], gy + sh[i][1]);
            rr(ctx, p[0] + 1.5, p[1] + 1.5, cell - 3, cell - 3, cell * 0.16);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      var n = BOX[c.type], v = this.vis, px = bx + (c.x + v.ox) * cell, py = by + (c.y - first + v.oy) * cell, tile = tiles[id];
      ctx.save();
      if (v.ang) {
        ctx.translate(px + n * cell / 2, py + n * cell / 2);
        ctx.rotate(v.ang * Math.PI / 180);
        ctx.translate(-n * cell / 2, -n * cell / 2);
      } else {
        ctx.translate(px, py);
      }
      for (i = 0; i < 4; i++) ctx.drawImage(tile, sh[i][0] * cell, sh[i][1] * cell, cell, cell);
      if (o.lockWash && g.lockTimer > 0 && g.grounded()) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, g.lockTimer / g.lockDelay * 0.5) + ')';
        for (i = 0; i < 4; i++) {
          rr(ctx, sh[i][0] * cell + 1, sh[i][1] * cell + 1, cell - 2, cell - 2, cell * 0.16);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    for (i = this.fx.length - 1; i >= 0; i--) {
      f = this.fx[i];
      var t = (now - f.t) / f.d;
      if (t >= 1) { this.fx.splice(i, 1); continue; }
      if (t < 0) t = 0;
      if (f.k === 'flash') {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * (1 - t)) + ')';
        for (x = 0; x < f.cells.length; x++) {
          p = this.cellXY(f.cells[x][0], f.cells[x][1]);
          rr(ctx, p[0] + 1, p[1] + 1, cell - 2, cell - 2, cell * 0.16);
          ctx.fill();
        }
      } else if (f.k === 'clear') {
        var ww = W * (1 - t * t), hh = cell * (1 - 0.7 * t);
        ctx.fillStyle = f.strong ? 'rgba(255,214,110,' + (0.95 * (1 - t)) + ')' : 'rgba(255,255,255,' + (0.9 * (1 - t)) + ')';
        for (x = 0; x < f.rows.length; x++) {
          p = this.cellXY(0, f.rows[x]);
          ctx.fillRect(bx + (W - ww) / 2, p[1] + (cell - hh) / 2, ww, hh);
        }
      } else if (f.k === 'streak') {
        for (var key in f.cols) {
          p = this.cellXY(+key, f.cols[key]);
          var y0 = p[1] - f.n * cell, sg = ctx.createLinearGradient(0, y0, 0, p[1]);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(1, 'rgba(255,255,255,' + (0.3 * (1 - t)) + ')');
          ctx.fillStyle = sg;
          ctx.fillRect(p[0] + 2, y0, cell - 4, f.n * cell);
        }
      } else if (f.k === 'shine') {
        var e2 = 1 - (1 - t) * (1 - t), sx = bx - W * 0.5 + (W * 1.9) * e2, band = W * 0.34;
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, 0, W, by + H);
        ctx.clip();
        var shg = ctx.createLinearGradient(sx, 0, sx + band, 0);
        shg.addColorStop(0, 'rgba(255,236,170,0)');
        shg.addColorStop(0.5, 'rgba(255,236,170,' + (0.42 * (1 - t * 0.6)) + ')');
        shg.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = shg;
        ctx.transform(1, 0, -0.35, 1, (by + H) * 0.175, 0);
        ctx.fillRect(sx, 0, band, by + H);
        ctx.restore();
      } else if (f.k === 'wash') {
        ctx.fillStyle = 'rgba(' + f.c + ',' + (0.4 * (1 - t)) + ')';
        ctx.fillRect(bx, 0, W, by + H);
      } else if (f.k === 'spark') {
        p = this.cellXY(f.x, f.y);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,224,130,' + (1 - t) + ')';
        ctx.lineWidth = Math.max(1.5, cell * 0.1);
        ctx.beginPath();
        ctx.arc(p[0], p[1], cell * (0.9 + 1.5 * t), 0, 6.283);
        ctx.stroke();
        ctx.restore();
      }
    }

    var ps = this.parts, dts = Math.min(o.dt || 16, 40) / 1000;
    for (i = ps.length - 1; i >= 0; i--) {
      var q = ps[i];
      q.life -= o.dt || 16;
      if (q.life <= 0 || q.y > by + H + 20) { ps.splice(i, 1); continue; }
      q.vy += (q.g == null ? 1100 : q.g) * dts; q.x += q.vx * dts; q.y += q.vy * dts; q.a += q.va * dts;
      ctx.save();
      ctx.globalAlpha = Math.min(1, q.life / 240);
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a);
      drawPart(ctx, q.k, q.s, q.c);
      ctx.restore();
    }

    if (this.mw) {
      var total = 0, ready = 0;
      for (i = 0; i < g.pending.length; i++) { total += g.pending[i].n; if (g.pending[i].t <= 0) ready += g.pending[i].n; }
      total = Math.min(total, this.rows);
      var blink = env.reduce || Math.floor(now / 160) % 2 === 0;
      for (i = 0; i < total; i++) {
        ctx.fillStyle = i < ready ? (blink ? '#FF5A45' : '#FFB3A8') : '#F0A64B';
        rr(ctx, 1, by + (this.rows - 1 - i) * cell + 1, this.mw - 2, cell - 2, 2);
        ctx.fill();
      }
    }

    if (o.shield) {
      var sa = env.reduce ? 0.8 : 0.6 + 0.3 * Math.sin(now / 180);
      ctx.save();
      ctx.strokeStyle = 'rgba(88,170,255,' + sa + ')';
      ctx.lineWidth = Math.max(2, cell * 0.2);
      ctx.strokeRect(bx + ctx.lineWidth / 2, by + ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
      ctx.restore();
    }
    if (o.frost) {
      ctx.fillStyle = 'rgba(190,232,255,0.24)';
      ctx.fillRect(bx, 0, W, by + H);
      if (cell >= 9) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1, cell * 0.07);
        for (i = 0; i < 9; i++) {
          var fx0 = bx + ((i * 37) % 100) / 100 * W, fy0 = by + ((i * 53 + 17) % 100) / 100 * H, fl = cell * (0.5 + (i % 3) * 0.25);
          ctx.beginPath();
          ctx.moveTo(fx0 - fl, fy0); ctx.lineTo(fx0 + fl, fy0);
          ctx.moveTo(fx0 - fl * 0.5, fy0 - fl * 0.87); ctx.lineTo(fx0 + fl * 0.5, fy0 + fl * 0.87);
          ctx.moveTo(fx0 + fl * 0.5, fy0 - fl * 0.87); ctx.lineTo(fx0 - fl * 0.5, fy0 + fl * 0.87);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    if (this.koT) {
      var kt = Math.min(1, (now - this.koT) / 220);
      ctx.fillStyle = 'rgba(160,30,18,' + (0.42 * kt) + ')';
      ctx.fillRect(bx, 0, W, by + H);
      if (this.cracks) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * kt) + ')';
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.lineJoin = 'bevel';
        for (i = 0; i < this.cracks.length; i++) {
          var ln = this.cracks[i], upto = Math.max(2, Math.ceil(ln.length * kt));
          ctx.beginPath();
          for (x = 0; x < upto; x++) ctx[x ? 'lineTo' : 'moveTo'](ln[x][0], ln[x][1]);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  };

  // ---------- sound ----------
  // Recorded clips (see sfxdata.js) with a synthesized fallback for every event, plus looping music from audio/.
  // cfg() returns the live settings: vol and mvol (0-100) and real (use the recorded clips).
  function Sound(cfg) {
    this.cfg = cfg;
    this.ac = null; this.out = null; this.mout = null; this.nb = null;
    this.buf = {}; this.decoding = false;
    this.mwant = ''; this.mname = ''; this.msrc = null; this.mgain = null; this.mcache = {}; this.mload = ''; this.duck = 1;
  }
  function b64buf(b64) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  Sound.prototype.decode = function (ab, ok, bad) {
    var done = false, fail = function () { if (!done) { done = true; if (bad) bad(); } };
    try {
      var p = this.ac.decodeAudioData(ab, function (buf) { if (!done) { done = true; ok(buf); } }, fail);
      if (p && p.catch) p.catch(fail);
    } catch (e) { fail(); }
  };
  Sound.prototype.wake = function () {
    if (!this.ac) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.out = this.ac.createGain();
        this.mout = this.ac.createGain();
        this.out.connect(this.ac.destination);
        this.mout.connect(this.ac.destination);
        this.nb = this.ac.createBuffer(1, Math.floor(this.ac.sampleRate * 0.6), this.ac.sampleRate);
        var d = this.nb.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.vol();
      } catch (e) { this.ac = null; return; }
    }
    if (this.ac.state === 'suspended' && !document.hidden) {
      try {
        var p = this.ac.resume();
        if (p && p.catch) p.catch(function () { /* stays silent until the next tap */ });
      } catch (e) { /* stays silent */ }
    }
    if (!this.decoding && ZZ.SFX) {
      this.decoding = true;
      var self = this;
      Object.keys(ZZ.SFX).forEach(function (name) {
        try { self.decode(b64buf(ZZ.SFX[name].d), function (buf) { self.buf[name] = buf; }); } catch (e) { /* synth covers it */ }
      });
    }
    if (this.mwant && this.mname !== this.mwant) this.music(this.mwant);
  };
  Sound.prototype.vol = function () {
    var c = this.cfg();
    if (this.out) this.out.gain.value = c.vol / 100 * 0.9;
    if (this.mout) this.mout.gain.value = c.mvol / 100 * 0.8 * this.duck;
    if (this.ac && c.mvol > 0 && this.mwant && this.mname !== this.mwant) this.music(this.mwant);
    if (this.ac && c.mvol <= 0 && this.msrc) this.stopMusic();
  };
  Sound.prototype.setDuck = function (v) { this.duck = v; this.vol(); };
  Sound.prototype.hush = function (hidden) {
    if (!this.ac) return;
    try { if (hidden) this.ac.suspend(); else this.ac.resume(); } catch (e) { /* next tap wakes it */ }
  };

  Sound.prototype.tone = function (f, dur, type, vol, f2, at) {
    var ac = this.ac, t = ac.currentTime + (at || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.03);
  };
  Sound.prototype.noise = function (dur, vol, hp, lp, at) {
    var ac = this.ac, t = ac.currentTime + (at || 0), s = ac.createBufferSource(), g = ac.createGain(), a = ac.createBiquadFilter(), b = ac.createBiquadFilter();
    s.buffer = this.nb;
    a.type = 'highpass'; a.frequency.value = hp;
    b.type = 'lowpass'; b.frequency.value = lp;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(a); a.connect(b); b.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.3, dur + 0.03);
  };
  // Play a recorded clip. Returns false when clips are off or not decoded yet, so the caller can synthesize instead.
  Sound.prototype.clip = function (name, vol, rate, at) {
    var b = this.buf[name];
    if (!b || !this.cfg().real) return false;
    var s = this.ac.createBufferSource(), g = this.ac.createGain();
    s.buffer = b;
    if (rate) s.playbackRate.value = rate;
    g.gain.value = vol;
    s.connect(g); g.connect(this.out);
    s.start(this.ac.currentTime + (at || 0));
    return true;
  };

  // ---- music ----
  function getBytes(url, ok, bad) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
      x.onload = function () { if ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength > 2000) ok(x.response); else bad(); };
      x.onerror = bad;
      x.send();
    } catch (e) { bad(); }
  }
  Sound.prototype.stopMusic = function () {
    if (!this.msrc) { this.mname = ''; return; }
    var t = this.ac.currentTime, g = this.mgain, s = this.msrc;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      s.stop(t + 0.35);
    } catch (e) { /* already stopped */ }
    this.msrc = null; this.mgain = null; this.mname = '';
  };
  Sound.prototype.music = function (name) {
    this.mwant = name || '';
    if (!this.ac) return;
    if (this.mname === this.mwant && (this.msrc || !this.mwant)) return;
    this.stopMusic();
    if (!this.mwant || this.cfg().mvol <= 0) return;
    var self = this, want = this.mwant;
    if (this.mcache[want]) return this.startTrack(want, this.mcache[want]);
    if (this.mload === want) return;
    this.mload = want;
    var probe = document.createElement('audio');
    var exts = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'mp3'] : ['mp3', 'ogg'], i = 0;
    (function next() {
      if (i >= exts.length) { if (self.mload === want) self.mload = ''; return; }
      var url = 'audio/' + want + '.' + exts[i++];
      getBytes(url, function (ab) {
        self.decode(ab, function (buf) {
          if (self.mload === want) self.mload = '';
          for (var k in self.mcache) if (k !== 'menu' && k !== want) delete self.mcache[k];
          self.mcache[want] = buf;
          if (self.mwant === want && self.mname !== want) self.startTrack(want, buf);
        }, next);
      }, next);
    })();
  };
  Sound.prototype.startTrack = function (name, buf) {
    if (this.cfg().mvol <= 0) return;
    var ac = this.ac, s = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = buf; s.loop = true;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.45);
    s.connect(g); g.connect(this.mout);
    s.start(t);
    this.msrc = s; this.mgain = g; this.mname = name;
  };

  var SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
  function semis(n) { return Math.pow(2, n / 12); }
  var STEP = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  var LIB = {
    move: function (s) { s.clip('move', 0.28) || s.tone(2100, 0.02, 'sine', 0.035); },
    rot: function (s) { s.clip('rot', 0.6) || s.tone(1250, 0.04, 'triangle', 0.06, 1650); },
    arm: function (s) { if (!s.clip('arm', 0.75)) s.tone(1760, 0.07, 'sine', 0.09); s.tone(2637, 0.11, 'sine', 0.05, null, 0.04); },
    lock: function (s) { if (!s.clip('lock', 0.5)) { s.noise(0.03, 0.1, 2400, 9000); s.tone(520, 0.05, 'sine', 0.07, 300); } },
    hard: function (s) {
      if (s.clip('thud', 0.8)) s.clip('clink', 0.3, 0.9);
      else { s.noise(0.05, 0.17, 1200, 7000); s.tone(190, 0.09, 'sine', 0.15, 85); }
    },
    hold: function (s) { s.clip('hold', 0.4) || s.tone(660, 0.05, 'triangle', 0.05, 880); },
    clear: function (s, lines, combo) {
      var base = Math.min(Math.max(combo || 0, 0), 6), i;
      if (s.buf.glass && s.cfg().real) {
        for (i = 0; i < Math.min(lines, 3); i++) s.clip(i === 1 ? 'glass2' : 'glass', 0.5, semis(STEP[Math.min(base + i, 8)]), i * 0.055);
        if (lines === 4) { s.clip('ring', 0.45); s.clip('glass', 0.5, semis(STEP[Math.min(base + 3, 8)]), 0.16); }
        return;
      }
      for (i = 0; i < lines; i++) {
        s.tone(SCALE[base + i], 0.16, 'sine', 0.1, null, i * 0.055);
        s.tone(SCALE[base + i] * 2, 0.1, 'triangle', 0.03, null, i * 0.055);
      }
      if (lines === 4) s.noise(0.3, 0.05, 6000, 12000, 0.1);
    },
    tspin: function (s, lines, combo) {
      var base = Math.min(Math.max(combo || 0, 0), 4), ch = [0, 2, 4], i;
      if (s.clip('sparkle', 0.6)) { s.clip('ring', 0.3, 0.75, 0.05); s.clip('glass', 0.4, semis(STEP[Math.min(base + lines, 8)]), 0.02); }
      for (i = 0; i < 3; i++) s.tone(SCALE[base + ch[i]] * 1.5, 0.34, 'sine', s.cfg().real ? 0.035 : 0.085, null, i * 0.04);
      if (!s.cfg().real) { s.tone(SCALE[base + 4] * 3, 0.4, 'sine', 0.04, null, 0.12); s.noise(0.35, 0.05, 7000, 14000, 0.02); }
    },
    garbage: function (s) { s.clip('clunk', 0.85); s.tone(110, 0.2, 'sine', 0.18, 52); s.noise(0.13, 0.08, 80, 700); },
    warn: function (s) { s.clip('warn', 0.35) || s.tone(330, 0.05, 'square', 0.03); },
    ko: function (s) { s.clip('fall', 0.8); s.noise(0.34, 0.22, 60, 1500); s.tone(220, 0.42, 'sawtooth', 0.1, 55); },
    count: function (s) { s.clip('count', 0.7) || s.tone(660, 0.1, 'sine', 0.1); },
    go: function (s) { if (!s.clip('go', 0.7)) { s.tone(990, 0.24, 'sine', 0.12); s.tone(1485, 0.24, 'sine', 0.05); } },
    win: function (s) { s.clip('win', 0.7); [0, 2, 4, 7].forEach(function (n, i) { s.tone(SCALE[n], 0.26, 'sine', 0.08, null, 0.1 + i * 0.11); }); },
    lose: function (s) { if (!s.clip('lose', 0.7)) [4, 2, 1, 0].forEach(function (n, i) { s.tone(SCALE[n] / 2, 0.3, 'triangle', 0.09, null, i * 0.13); }); },
    fail: function (s) { s.clip('fail', 0.6) || s.tone(300, 0.22, 'triangle', 0.09, 200); },
    itemGet: function (s) { if (!s.clip('itemGet', 0.7)) { s.tone(880, 0.09, 'sine', 0.1); s.tone(1320, 0.14, 'sine', 0.09, null, 0.08); } },
    itemUse: function (s) { s.clip('itemUse', 0.75) || s.tone(500, 0.25, 'triangle', 0.1, 2000); },
    itemHit: function (s) { s.clip('itemHit', 0.75) || s.tone(1800, 0.25, 'triangle', 0.1, 400); },
    itemTile: function (s) { s.clip('pluck', 0.5) || s.tone(1400, 0.05, 'sine', 0.05); },
    ui: function (s) { s.clip('ui', 0.4) || s.tone(900, 0.03, 'sine', 0.05); },
    undo: function (s) { s.clip('undo', 0.5) || s.tone(660, 0.05, 'triangle', 0.05, 440); },
    tick: function (s) { s.clip('ui', 0.4) || s.tone(880, 0.04, 'sine', 0.05); }
  };
  Sound.prototype.play = function (name, a, b) {
    if (!this.ac || this.cfg().vol <= 0 || !LIB[name]) return;
    try { LIB[name](this, a, b); } catch (e) { /* audio is optional */ }
  };

  // A small still of one look for the shop: a few tiles on a patch of wall.
  var SAMPLE = ['..3...', '.333.6', '55.166', '.55116'];
  function preview(cv, kind, id, w, h) {
    var x = sizeCanvas(cv, w, h), cell = Math.floor(Math.min(w / 6.3, h / 4.3)), i, j;
    var tiles = sprites(Math.max(2, Math.round(cell * env.dpr)), kind === 'tile' ? id : LOOK.tile), ox = Math.round((w - cell * 6) / 2), oy = h - cell * 4 - 3;
    x.fillStyle = theme.wall;
    x.fillRect(0, 0, w, h);
    x.save();
    x.translate(ox - cell * 2, 0);
    paintWall(x, kind === 'bg' ? id : (kind === 'tile' || kind === 'fx' ? LOOK.bg : 'wall'), { bx: 0, by: oy - cell * 16, W: cell * COLS, H: cell * 20, cell: cell, rows: 20, plain: false });
    x.restore();
    for (j = 0; j < 4; j++) for (i = 0; i < 6; i++) {
      var v = +SAMPLE[j].charAt(i);
      if (v) x.drawImage(tiles[v], ox + i * cell, oy + j * cell, cell, cell);
    }
    if (kind === 'fx') {
      var rnd = new ZZ.RNG(9), P = PART[id] || PART.shard, cols = [TILE[3], TILE[5], TILE[6], TILE[1], TILE[4]];
      for (i = 0; i < 14; i++) {
        var c = cols[i % cols.length];
        if (P.tint) c = mix(c, P.tint[0], P.tint[1]);
        x.save();
        x.translate(w * (0.08 + rnd.next() * 0.84), h * (0.08 + rnd.next() * 0.6));
        x.rotate(id === 'bubble' ? 0 : rnd.next() * 6);
        drawPart(x, id, cell * (0.3 + rnd.next() * 0.3), c);
        x.restore();
      }
    }
  }

  ZZ.View = {
    env: env, TILE: TILE, theme: theme, readTheme: readTheme, terrazzo: terrazzo, sprites: sprites, sizeCanvas: sizeCanvas,
    drawPiece: drawPiece, drawItem: drawItem, clearItemSprites: clearItemSprites, BoardView: BoardView, Sound: Sound, mix: mix, rgba: rgba,
    LOOK: LOOK, setLook: setLook, preview: preview
  };
})();
