'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
// Every 整套風格 (set) keeps its blocks clearly apart from its wall: for each of the seven piece colours, the colour
// difference (CIE ΔE) and the brightness ratio against the wall's average colour. Needs the static server on 8790.
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: process.env.DARK ? 'dark' : 'light' });
  const p = await c.newPage(); p.on('pageerror', e => console.log('err', e.message));
  await p.goto((process.env.ZZ_BASE || 'http://127.0.0.1:8790/') + 'index.html?sw=off&lang=zh-Hant'); await p.waitForTimeout(800);
  const res = await p.evaluate(async (only) => {
    const M = ZZ.Meta, V = ZZ.View, out = [];
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b_) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b_);
    const lab = (r, g, b_) => { let R = lin(r), G = lin(g), B = lin(b_); let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]);
    const avg = (d, mask) => { let r = 0, g = 0, bb = 0, n = 0, ls = []; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; if (mask && !mask(i)) continue; r += d[i]; g += d[i + 1]; bb += d[i + 2]; n++; ls.push(lum(d[i], d[i + 1], d[i + 2])); } ls.sort((a, b3) => a - b3); return { c: [r / n, g / n, bb / n], lo: ls[Math.floor(ls.length * 0.1)], hi: ls[Math.floor(ls.length * 0.9)] }; };
    const sets = M.CATALOG.set.filter(s => !only || only.includes(s.id));
    for (const st of sets) {
      M.data.equip.tile = st.parts.tile; M.data.equip.bg = st.parts.bg; M.data.equip.theme = st.parts.theme; M.data.equip.fx = st.parts.fx;
      ZZ.App.applyLook();
      const W = 320, H = 400, cv = document.createElement('canvas');
      V.preview(cv, { tile: '__none__', bg: st.parts.bg }, W, H);
      // background only: preview with an empty tile set is not possible, so read the area above the sample stack
      const x = cv.getContext('2d'); const bd = x.getImageData(0, 0, cv.width, Math.floor(cv.height * 0.45)).data;
      const bg = avg(bd); const bl = lab(...bg.c), bL = lum(...bg.c);
      const sp = V.sprites(40, st.parts.tile); const per = [];
      for (let k = 1; k <= 8; k++) { if (!sp[k]) continue; const sx = sp[k].getContext('2d').getImageData(0, 0, sp[k].width, sp[k].height).data; const t = avg(sx); const tL = lum(...t.c); per.push({ k, de: Math.round(dE(lab(...t.c), bl)), cr: +((Math.max(tL, bL) + 0.05) / (Math.min(tL, bL) + 0.05)).toFixed(2) }); }
      const minDe = Math.min(...per.slice(0, 7).map(q => q.de)), minCr = Math.min(...per.slice(0, 7).map(q => q.cr)), lowCount = per.slice(0, 7).filter(q => q.de < 25).length;
      out.push({ id: st.id, name: st.name, parts: st.parts, bg: bg.c.map(Math.round), bgSpread: +(bg.hi - bg.lo).toFixed(3), minDe, minCr, lowCount, per });
    }
    return out;
  }, process.env.ONLY ? process.env.ONLY.split(',') : null);
  let fail = 0;
  for (const r of res) if (r.minDe < 25 || r.minCr < 1.8) { fail++; console.log('FAIL', r.id, r.name, 'ΔE', r.minDe, 'ratio', r.minCr); }
  console.log('set contrast checks: ' + (res.length - fail) + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
