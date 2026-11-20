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
  var TIERS = ['地基', '石牆', '塔樓', '城堡', '要塞', '天空城', '通天塔'];
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
  // ---------- holiday looks: 30 holidays, each with a tile, a wall, a theme, a clear effect and a set ----------
  // One line per holiday: its names (zh-Hant, en, ja, ko), and what view.js and style.css draw from (the tile's seven
  // colours and mark, the wall's gradient and stamped mark, the theme's floor and wall, the effect's shape and tint).
  var FESTIVE = [
    { id: 'cny', n: ['春節', 'Lunar New Year', '旧正月', '설날'], pal: ['#FFE8B0', '#E8392E', '#F5B82E', '#C62828', '#FF7043', '#D84315', '#FFC107'], mark: 'lantern', wall: [['#B71C1C', '#5D0A0A'], 'lantern', 'rgba(255,200,60,0.35)'], th: ['#2A0A0A', '#120404', 1], fx: ['spark', '#FFD54A', 0.6] },
    { id: 'lantern', n: ['元宵', 'Lantern Festival', '元宵節', '정월대보름'], pal: ['#FFE0B2', '#FF8A65', '#FFB74D', '#F06292', '#FFD54F', '#FF7043', '#BA68C8'], mark: 'lantern', wall: [['#1A2350', '#0B1030'], 'lantern', 'rgba(255,150,70,0.45)'], th: ['#121733', '#060918', 1], fx: ['ring', '#FFB74D', 0.6] },
    { id: 'valentine', n: ['情人節', "Valentine's Day", 'バレンタイン', '밸런타인데이'], pal: ['#FFE4EC', '#FF4F7B', '#FF8FB1', '#E91E63', '#FF6F91', '#C2185B', '#F48FB1'], mark: 'heart', wall: [['#E35A84', '#9C1C45'], 'heart', 'rgba(255,255,255,0.3)'], th: ['#FBE3EA', '#5A1530', 0], fx: ['heart', '#FF4F7B', 0.6] },
    { id: 'whiteday', n: ['白色情人節', 'White Day', 'ホワイトデー', '화이트데이'], pal: ['#FFFFFF', '#E3F2FD', '#FFF8E1', '#E1F5FE', '#FCE4EC', '#EDE7F6', '#E8F5E9'], mark: 'heart', wall: [['#9CC6E8', '#5A8FBF'], 'heart', 'rgba(255,255,255,0.5)'], th: ['#EEF5FB', '#23405E', 0], fx: ['diamond', '#FFFFFF', 0.7] },
    { id: 'easter', n: ['復活節', 'Easter', 'イースター', '부활절'], pal: ['#FFF9C4', '#B2EBF2', '#F8BBD0', '#C5E1A5', '#D1C4E9', '#FFE0B2', '#B3E5FC'], mark: 'egg', wall: [['#B8E6C8', '#7CC9A0'], 'egg', 'rgba(255,255,255,0.5)'], th: ['#EEF9EE', '#264D33', 0], fx: ['confetti', '#FFFFFF', 0.35] },
    { id: 'hanami', n: ['賞櫻', 'Cherry blossoms', 'お花見', '벚꽃놀이'], pal: ['#FFF0F4', '#FFC1D3', '#FFD9E3', '#F8A5C2', '#FFE3EC', '#F59BB8', '#FCD5E5'], mark: 'blossom', wall: [['#BFE3F7', '#F6C3D4'], 'blossom', 'rgba(255,255,255,0.6)'], th: ['#FDF0F4', '#5A2B3C', 0], fx: ['blossom', '#FFD1DE', 0.75] },
    { id: 'hina', n: ['女兒節', "Girls' Day", 'ひな祭り', '히나마쓰리'], pal: ['#FFF3E0', '#FF9EB5', '#FFCC80', '#A5D6A7', '#F48FB1', '#FFAB91', '#CE93D8'], mark: 'ribbon', wall: [['#F7C6D0', '#E58FA6'], 'blossom', 'rgba(255,255,255,0.45)'], th: ['#FCECEF', '#5C2A36', 0], fx: ['petal', '#FFB3C7', 0.6] },
    { id: 'kids', n: ['兒童節', "Children's Day", 'こどもの日', '어린이날'], pal: ['#FFFDE7', '#FF5252', '#FFD740', '#40C4FF', '#69F0AE', '#FF6E40', '#B388FF'], mark: 'star', wall: [['#7FD3FF', '#3BA3E8'], 'star', 'rgba(255,255,255,0.4)'], th: ['#E8F6FF', '#163E5C', 0], fx: ['confetti', null, 0] },
    { id: 'mother', n: ['母親節', "Mother's Day", '母の日', '어머니날'], pal: ['#FFEBEE', '#EF5350', '#F48FB1', '#E57373', '#FFCDD2', '#D81B60', '#F06292'], mark: 'blossom', wall: [['#F4B6C2', '#D9798F'], 'heart', 'rgba(255,255,255,0.4)'], th: ['#FDEEF1', '#5B1F2C', 0], fx: ['petal', '#E53950', 0.5] },
    { id: 'dragonboat', n: ['端午', 'Dragon Boat Festival', '端午の節句', '단오'], pal: ['#F1F8E9', '#7CB342', '#C5E1A5', '#2E7D32', '#AED581', '#558B2F', '#81C784'], mark: 'leaf', wall: [['#2E7D6B', '#164A3E'], 'leaf', 'rgba(180,240,190,0.25)'], th: ['#E6F2EA', '#173A2C', 0], fx: ['leaf', '#7CB342', 0.6] },
    { id: 'father', n: ['父親節', "Father's Day", '父の日', '아버지날'], pal: ['#E3F2FD', '#1E88E5', '#90CAF9', '#1565C0', '#64B5F6', '#0D47A1', '#B0BEC5'], mark: 'star', wall: [['#1F3A60', '#0E1D33'], 'star', 'rgba(150,200,255,0.25)'], th: ['#121E30', '#060C16', 1], fx: ['ring', '#64B5F6', 0.6] },
    { id: 'qixi', n: ['七夕', 'Qixi', '七夕', '칠석'], pal: ['#EDE7F6', '#7E57C2', '#B39DDB', '#5E35B1', '#9575CD', '#4527A0', '#F48FB1'], mark: 'star', wall: [['#2A1B5C', '#120A2E'], 'star', 'rgba(255,240,180,0.4)'], th: ['#18122E', '#090616', 1], fx: ['star', '#C5B3FF', 0.6] },
    { id: 'midautumn', n: ['中秋', 'Mid-Autumn', '中秋節', '추석'], pal: ['#FFF8E1', '#FFB300', '#FFE082', '#F57C00', '#FFCA28', '#E65100', '#FFD180'], mark: 'moon', wall: [['#1B2A4A', '#0A1226'], 'moon', 'rgba(255,224,130,0.5)'], th: ['#141C30', '#070B16', 1], fx: ['ring', '#FFE082', 0.6] },
    { id: 'halloween', n: ['萬聖節', 'Halloween', 'ハロウィン', '핼러윈'], pal: ['#FFE0B2', '#FF8F00', '#7E57C2', '#F57C00', '#9CCC65', '#6A1B9A', '#FFB300'], mark: 'pumpkin', wall: [['#3A1C4A', '#140A1C'], 'pumpkin', 'rgba(255,143,0,0.35)'], th: ['#1E1226', '#0A0510', 1], fx: ['smoke', '#9C6ADE', 0.6] },
    { id: 'thanks', n: ['感恩節', 'Thanksgiving', '感謝祭', '추수감사절'], pal: ['#FFF3E0', '#D84315', '#FFB74D', '#8D6E63', '#FF8A65', '#6D4C41', '#FFCC80'], mark: 'leaf', wall: [['#B5652F', '#6E3714'], 'leaf', 'rgba(255,200,120,0.3)'], th: ['#F6EADF', '#43250F', 0], fx: ['leaf', '#E67E22', 0.6] },
    { id: 'xmas', n: ['聖誕節', 'Christmas', 'クリスマス', '크리스마스'], pal: ['#FFFFFF', '#D32F2F', '#FFD54F', '#2E7D32', '#E53935', '#1B5E20', '#C8E6C9'], mark: 'tree', wall: [['#1B4D2E', '#0B2416'], 'flake', 'rgba(255,255,255,0.5)'], th: ['#10241A', '#04100A', 1], fx: ['snow', '#FFFFFF', 0.7] },
    { id: 'newyear', n: ['跨年', "New Year's Eve", '年越し', '새해 전야'], pal: ['#FFF8E1', '#FFD54F', '#E0E0E0', '#FFC107', '#B0BEC5', '#FFB300', '#90A4AE'], mark: 'firework', wall: [['#0F1024', '#020208'], 'firework', 'rgba(255,215,90,0.4)'], th: ['#0E0F1E', '#030308', 1], fx: ['confetti', '#FFD54F', 0.5] },
    { id: 'songkran', n: ['潑水節', 'Songkran', 'ソンクラーン', '송크란'], pal: ['#E0F7FA', '#26C6DA', '#80DEEA', '#0097A7', '#4DD0E1', '#00838F', '#B2EBF2'], mark: 'drop', wall: [['#5ED3E8', '#1B8FB3'], 'drop', 'rgba(255,255,255,0.4)'], th: ['#E6F7FA', '#0E3D47', 0], fx: ['bubble', '#80DEEA', 0.5] },
    { id: 'diwali', n: ['排燈節', 'Diwali', 'ディワリ', '디왈리'], pal: ['#FFF3E0', '#FF6F00', '#FFCA28', '#D81B60', '#FF8F00', '#AD1457', '#FFD54F'], mark: 'flame', wall: [['#5A0E3A', '#260418'], 'flame', 'rgba(255,170,40,0.45)'], th: ['#260A1A', '#10030A', 1], fx: ['spark', '#FFB300', 0.6] },
    { id: 'stpatrick', n: ['聖派翠克節', "St Patrick's Day", '聖パトリックの日', '성 패트릭의 날'], pal: ['#F1F8E9', '#43A047', '#A5D6A7', '#2E7D32', '#66BB6A', '#1B5E20', '#C5E1A5'], mark: 'clover', wall: [['#3E9E57', '#1E5E30'], 'clover', 'rgba(255,255,255,0.3)'], th: ['#EAF5EC', '#183E22', 0], fx: ['leaf', '#43A047', 0.7] },
    { id: 'fireworks', n: ['夏日煙火', 'Summer fireworks', '花火大会', '불꽃놀이'], pal: ['#FFFFFF', '#FF5252', '#FFD740', '#448AFF', '#69F0AE', '#FF4081', '#E040FB'], mark: 'firework', wall: [['#0E1636', '#040714'], 'firework', 'rgba(255,120,200,0.4)'], th: ['#0D1328', '#040610', 1], fx: ['spark', null, 0] },
    { id: 'snowfest', n: ['雪祭', 'Snow festival', '雪まつり', '눈 축제'], pal: ['#FFFFFF', '#B3E5FC', '#E1F5FE', '#81D4FA', '#ECEFF1', '#4FC3F7', '#CFD8DC'], mark: 'flake', wall: [['#CFE6F5', '#8DB8DB'], 'flake', 'rgba(255,255,255,0.7)'], th: ['#EEF5FA', '#1C3550', 0], fx: ['snow', '#E1F5FE', 0.8] },
    { id: 'teacher', n: ['教師節', "Teachers' Day", '教師の日', '스승의 날'], pal: ['#F1F8E9', '#AED581', '#FFF59D', '#80CBC4', '#FFCC80', '#90CAF9', '#F48FB1'], mark: 'shine', wall: [['#2F4F3E', '#1A2E24'], 'star', 'rgba(255,255,255,0.22)'], th: ['#1C2A22', '#0B140F', 1], fx: ['spark', '#FFFFFF', 0.6] },
    { id: 'harvest', n: ['豐收祭', 'Harvest festival', '収穫祭', '수확제'], pal: ['#FFF8E1', '#F9A825', '#FFE082', '#9E9D24', '#FFD54F', '#827717', '#FFCC80'], mark: 'leaf', wall: [['#E8C25A', '#B08A24'], 'leaf', 'rgba(110,80,10,0.22)'], th: ['#FAF2DA', '#3F3410', 0], fx: ['leaf', '#F9A825', 0.6] },
    { id: 'carnival', n: ['嘉年華', 'Carnival', 'カーニバル', '카니발'], pal: ['#FFFFFF', '#FF1744', '#FFEA00', '#00E676', '#2979FF', '#D500F9', '#FF9100'], mark: 'star', wall: [['#4A1D7A', '#1E0A38'], 'star', 'rgba(255,234,0,0.35)'], th: ['#1E1030', '#0B0516', 1], fx: ['confetti', null, 0] },
    { id: 'earth', n: ['地球日', 'Earth Day', 'アースデイ', '지구의 날'], pal: ['#E8F5E9', '#43A047', '#4FC3F7', '#2E7D32', '#29B6F6', '#1B5E20', '#81C784'], mark: 'leaf', wall: [['#2C7FB8', '#2E8B57'], 'leaf', 'rgba(255,255,255,0.25)'], th: ['#E6F3EE', '#163A2E', 0], fx: ['leaf', '#4CAF50', 0.6] },
    { id: 'graduation', n: ['畢業季', 'Graduation', '卒業シーズン', '졸업 시즌'], pal: ['#ECEFF1', '#1A237E', '#FFD54F', '#283593', '#FFCA28', '#3949AB', '#B0BEC5'], mark: 'star', wall: [['#1A237E', '#0B1040'], 'star', 'rgba(255,213,79,0.35)'], th: ['#11163A', '#05081A', 1], fx: ['confetti', '#FFD54F', 0.45] },
    { id: 'birthday', n: ['生日派對', 'Birthday party', '誕生日パーティー', '생일 파티'], pal: ['#FFF8E1', '#FF8A80', '#FFD180', '#80D8FF', '#B9F6CA', '#EA80FC', '#FFFF8D'], mark: 'gift', wall: [['#FFD6E8', '#C6B3FF'], 'gift', 'rgba(255,255,255,0.5)'], th: ['#FBF0FA', '#3E2A5C', 0], fx: ['confetti', null, 0] },
    { id: 'school', n: ['開學季', 'Back to school', '新学期', '개학 시즌'], pal: ['#FFFDE7', '#F44336', '#FFEB3B', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0'], mark: 'dots', wall: [['#F4F7FB', '#E2E9F3'], 'star', 'rgba(60,110,200,0.25)'], th: ['#F2F5FA', '#1D2F4F', 0], fx: ['note', '#FFFFFF', 0.4] },
    { id: 'winter', n: ['冬至', 'Winter solstice', '冬至', '동지'], pal: ['#FFFFFF', '#F8BBD0', '#FFE0E9', '#ECEFF1', '#F48FB1', '#FFF3F6', '#E1BEE7'], mark: 'dots', wall: [['#2B3A5C', '#121B30'], 'flake', 'rgba(255,255,255,0.45)'], th: ['#172036', '#080D1A', 1], fx: ['snow', '#FFE0E9', 0.7] }
  ];
  // Where each holiday is shown (by the region the player picked; 'all' everywhere, and 'other' sees every holiday),
  // and which are on sale now. The rest show as "not open yet". Christmas first, then the Lunar New Year.
  var FEST_RG = {
    cny: ['tw', 'hk', 'mo', 'cn', 'kr', 'my', 'sg'], lantern: ['tw', 'hk', 'mo', 'cn', 'my', 'sg'], dragonboat: ['tw', 'hk', 'mo', 'cn', 'my', 'sg'],
    qixi: ['tw', 'hk', 'mo', 'cn', 'jp', 'kr'], midautumn: ['tw', 'hk', 'mo', 'cn', 'kr', 'my', 'sg'], winter: ['tw', 'hk', 'mo', 'cn'], teacher: ['tw', 'kr', 'sg', 'my'],
    hanami: ['jp', 'kr', 'tw'], hina: ['jp'], whiteday: ['jp', 'kr', 'tw'], kids: ['jp', 'kr', 'tw', 'hk', 'mo', 'cn'], snowfest: ['jp', 'kr'],
    thanks: ['us'], stpatrick: ['uk', 'us', 'au'], easter: ['uk', 'us', 'au', 'sg'], diwali: ['my', 'sg', 'uk'], songkran: ['my', 'sg'], harvest: ['uk', 'au', 'kr'],
    valentine: ['all'], halloween: ['all'], xmas: ['all'], newyear: ['all'], birthday: ['all'], fireworks: ['all'], earth: ['all'], graduation: ['all'], school: ['all'], carnival: ['all'], mother: ['all'], father: ['all']
  };
  var FEST_OPEN = ['xmas'];
  FESTIVE.forEach(function (f) { f.rg = FEST_RG[f.id] || ['all']; f.open = FEST_OPEN.indexOf(f.id) >= 0; });
  function festLocked(it) { return !!(it && it.fest && FEST_OPEN.indexOf(it.id) < 0); }
  // shown for a region: everything for 'other' or no answer, otherwise the holidays of everywhere and of that region
  function festShown(id, region) { var r = FEST_RG[id] || ['all']; return !region || region === 'other' || r.indexOf('all') >= 0 || r.indexOf(region) >= 0; }
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
      { id: 'sakura', name: '櫻花磚', price: 900 },
      { id: 'heart', name: '愛心糖', price: 1000 },
      { id: 'pearl', name: '珍珠奶霜', price: 1200 },
      { id: 'ribbon', name: '蝴蝶結', price: 900 },
      { id: 'macaron', name: '馬卡龍', price: 900 },
      { id: 'jade', name: '玉石', price: 1100 },
      { id: 'gold', name: '金箔', price: 1500 },
      { id: 'ice', name: '冰塊', price: 1000 },
      { id: 'lava', name: '熔岩', price: 1200 },
      { id: 'star', name: '星星', price: 700 },
      { id: 'dot', name: '圓點', price: 600 },
      { id: 'stripe', name: '條紋糖', price: 600 },
      { id: 'check', name: '格紋', price: 600 },
      { id: 'cloud', name: '雲朵', price: 800 },
      { id: 'leaf', name: '葉子', price: 700 },
      { id: 'paper', name: '和紙', price: 700 },
      { id: 'metal', name: '鐵板', price: 900 },
      { id: 'cookie', name: '餅乾', price: 800 },
      { id: 'galaxy', name: '銀河', price: 1300 },
      { id: 'mono', name: '黑白', price: 500 },
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
      { id: 'sakurasky', name: '櫻花雨', price: 900 },
      { id: 'heartpink', name: '粉紅愛心', price: 900 },
      { id: 'lace', name: '蕾絲', price: 1000 },
      { id: 'peach', name: '蜜桃漸層', price: 700 },
      { id: 'ocean', name: '深海', price: 800 },
      { id: 'forest', name: '森林', price: 800 },
      { id: 'snow', name: '雪夜', price: 800 },
      { id: 'sunset', name: '夕陽', price: 700 },
      { id: 'aurora', name: '極光', price: 1100 },
      { id: 'desert', name: '沙丘', price: 700 },
      { id: 'brickwall', name: '紅磚牆', price: 600 },
      { id: 'wood', name: '木地板', price: 600 },
      { id: 'checker', name: '棋盤', price: 500 },
      { id: 'stripes', name: '斜紋', price: 500 },
      { id: 'circuit', name: '電路板', price: 900 },
      { id: 'graph', name: '方格紙', price: 500 },
      { id: 'galaxy', name: '星雲', price: 1100 },
      { id: 'rain', name: '雨夜', price: 700 },
      { id: 'lavender', name: '薰衣草', price: 700 },
      { id: 'mint', name: '薄荷', price: 600 },
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
      { id: 'market', name: '夜市', price: 1000 },
      { id: 'peach', name: '蜜桃', price: 800 },
      { id: 'rose', name: '玫瑰', price: 900 },
      { id: 'lilac', name: '紫丁香', price: 800 },
      { id: 'cotton', name: '棉花糖', price: 900 },
      { id: 'ocean', name: '深海', price: 900 },
      { id: 'forest', name: '森林', price: 800 },
      { id: 'snow', name: '雪國', price: 800 },
      { id: 'sunset', name: '夕陽', price: 900 },
      { id: 'lavender', name: '薰衣草', price: 800 },
      { id: 'mint', name: '薄荷', price: 700 },
      { id: 'coffee', name: '咖啡', price: 700 },
      { id: 'lemon', name: '檸檬', price: 700 },
      { id: 'ruby', name: '紅寶石', price: 1000 },
      { id: 'sky', name: '晴空', price: 700 },
      { id: 'sand', name: '沙灘', price: 700 },
      { id: 'graphite', name: '石墨', price: 700 },
      { id: 'midnight', name: '午夜', price: 900 },
      { id: 'aurora', name: '極光', price: 1100 },
      { id: 'candyland', name: '糖果樂園', price: 900 },
      { id: 'jade', name: '玉石', price: 900 },
      { id: 'gold', name: '黃金', price: 1300 },
      { id: 'cocoa', name: '可可', price: 800 },
      { id: 'berry', name: '莓果', price: 800 }
    ],
    fx: [
      { id: 'shard', name: '碎磚', price: 0 },
      { id: 'star', name: '星屑', price: 600 },
      { id: 'bubble', name: '泡泡', price: 600 },
      { id: 'petal', name: '花瓣', price: 800 },
      { id: 'heart', name: '愛心', price: 800 },
      { id: 'blossom', name: '櫻花', price: 900 },
      { id: 'snow', name: '雪花', price: 800 },
      { id: 'coin', name: '金幣雨', price: 1200 },
      { id: 'note', name: '音符', price: 700 },
      { id: 'confetti', name: '彩帶', price: 800 },
      { id: 'diamond', name: '鑽石', price: 1300 },
      { id: 'ring', name: '光圈', price: 700 },
      { id: 'leaf', name: '落葉', price: 700 },
      { id: 'spark', name: '火花', price: 800 },
      { id: 'smoke', name: '輕煙', price: 600 }
    ],
    set: [
      { id: 'market', name: '霓虹夜市', parts: { tile: 'neon', bg: 'neongrid', theme: 'market', fx: 'star' } },
      { id: 'qinghua', name: '青花瓷', parts: { tile: 'glass', bg: 'blueprint', theme: 'qinghua', fx: 'bubble' } },
      { id: 'kiln', name: '窯邊紅磚', parts: { tile: 'brick', bg: 'dusk', theme: 'kiln', fx: 'shard' } },
      { id: 'washitsu', name: '和室', parts: { tile: 'wood', bg: 'tatami', theme: 'matcha', fx: 'petal' } },
      { id: 'candy', name: '糖果屋', parts: { tile: 'candy', bg: 'night', theme: 'sakura', fx: 'bubble' } },
      { id: 'sakuragirl', name: '櫻花少女', parts: { tile: 'sakura', bg: 'sakurasky', theme: 'sakura', fx: 'blossom' } },
      { id: 'sweetheart', name: '甜心少女', parts: { tile: 'heart', bg: 'heartpink', theme: 'rose', fx: 'heart' } },
      { id: 'princess', name: '粉紅公主', parts: { tile: 'pearl', bg: 'lace', theme: 'cotton', fx: 'diamond' } },
      { id: 'deepsea', name: '深海探險', parts: { tile: 'ice', bg: 'ocean', theme: 'ocean', fx: 'bubble' } },
      { id: 'forest', name: '森林小屋', parts: { tile: 'leaf', bg: 'forest', theme: 'forest', fx: 'leaf' } },
      { id: 'snow', name: '雪國', parts: { tile: 'cloud', bg: 'snow', theme: 'snow', fx: 'snow' } },
      { id: 'sunset', name: '夕陽海岸', parts: { tile: 'stripe', bg: 'sunset', theme: 'sunset', fx: 'spark' } },
      { id: 'aurora', name: '極光之夜', parts: { tile: 'galaxy', bg: 'aurora', theme: 'aurora', fx: 'star' } },
      { id: 'palace', name: '黃金宮殿', parts: { tile: 'gold', bg: 'desert', theme: 'gold', fx: 'coin' } },
      { id: 'cafe', name: '巷口咖啡', parts: { tile: 'cookie', bg: 'wood', theme: 'coffee', fx: 'note' } },
      { id: 'lab', name: '電路實驗室', parts: { tile: 'metal', bg: 'circuit', theme: 'graphite', fx: 'ring' } },
      { id: 'stationery', name: '文具店', parts: { tile: 'paper', bg: 'graph', theme: 'lemon', fx: 'confetti' } },
      { id: 'soda', name: '薄荷汽水', parts: { tile: 'dot', bg: 'mint', theme: 'mint', fx: 'bubble' } },
      { id: 'lavender', name: '薰衣草田', parts: { tile: 'macaron', bg: 'lavender', theme: 'lavender', fx: 'petal' } },
      { id: 'volcano', name: '火山口', parts: { tile: 'lava', bg: 'brickwall', theme: 'ruby', fx: 'smoke' } }
    ]
  };
  // the holiday looks join the catalogue: one of each kind and a set per holiday
  FESTIVE.forEach(function (f) {
    CATALOG.tile.push({ id: f.id, name: f.n[0], price: 1000, fest: true });
    CATALOG.bg.push({ id: f.id, name: f.n[0], price: 900, fest: true });
    CATALOG.theme.push({ id: f.id, name: f.n[0], price: 900, fest: true });
    CATALOG.fx.push({ id: f.id, name: f.n[0], price: 900, fest: true });
    CATALOG.set.push({ id: f.id, name: f.n[0], fest: true, parts: { tile: f.id, bg: f.id, theme: f.id, fx: f.id } });
  });
  // their names in every language: the holiday's name and the kind of look
  if (ZZ.L) (function () {
    var KIND_WORD = { tile: ['方塊', 'tiles', 'ブロック', '블록'], bg: ['牆面', 'wall', '壁', '벽'], theme: ['', 'theme', 'テーマ', '테마'], fx: ['特效', 'effect', 'エフェクト', '이펙트'], set: ['整套', 'set', 'セット', '세트'] }, add = {};
    FESTIVE.forEach(function (f) {
      ['tile', 'bg', 'theme', 'fx', 'set'].forEach(function (k) {
        add['c.' + k + '.' + f.id] = [0, 1, 2, 3].map(function (li) { var w = KIND_WORD[k][li]; return w ? f.n[li] + (li === 1 || li === 3 ? ' ' : '') + w : f.n[li]; });
      });
    });
    ZZ.L.add(add);
  })();
  var KINDS = ['tile', 'bg', 'theme', 'fx'];
  var KIND_NAME = { tile: '方塊', bg: '牆面', theme: '主題', fx: '消行特效', set: '整套風格' };
  // what each of the 200 items costs in the shop (engine.js ITEMS; the first seven keep their old prices)
  var ITEM_PRICE = ZZ.ITEMS.map(function (d) { return d ? d.price : 0; });
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
    { id: 'item', need: 3, coin: 30, on: function (m) { return m.itemsUsed || 0; } },
    { id: 'win5', need: 5, coin: 120, on: function (m) { return m.battle && m.result > 0 ? 1 : 0; } },
    { id: 'play10', need: 10, coin: 120, on: function (m) { return m.battle ? 1 : 0; } },
    { id: 'tst', need: 1, coin: 80, on: function (m) { return m.stats.tst; } },
    { id: 'lines', need: 100, coin: 60, on: function (m) { return m.stats.lines; } },
    { id: 'pieces', need: 300, coin: 50, on: function (m) { return m.stats.pieces; } },
    { id: 'combo8', need: 1, coin: 70, on: function (m) { return m.stats.maxCombo >= 8 ? 1 : 0; } },
    { id: 'score50', need: 1, coin: 100, on: function (m) { return m.stats.score >= 50000 ? 1 : 0; } },
    { id: 'ko3', need: 1, coin: 60, on: function (m) { return m.battle && m.ko >= 3 ? 1 : 0; } },
    { id: 'clean', need: 1, coin: 80, on: function (m) { return m.battle && m.result > 0 && m.koOpp === 0 ? 1 : 0; } },
    { id: 'hard', need: 1, coin: 90, on: function (m) { return m.mode === 'ai' && m.level >= 4 && m.result > 0 ? 1 : 0; } },
    { id: 'ghost', need: 1, coin: 40, on: function (m) { return m.mode === 'ghost' ? 1 : 0; } },
    { id: 'online', need: 1, coin: 60, on: function (m) { return m.mode === 'net' ? 1 : 0; } },
    { id: 'bigsend', need: 1, coin: 70, on: function (m) { return m.battle && m.stats.sent >= 20 ? 1 : 0; } },
    { id: 'sprint90', need: 1, coin: 90, on: function (m) { return m.mode === 'sprint' && m.result > 0 && m.ms < 90000 ? 1 : 0; } },
    { id: 'box', need: 3, coin: 30, ev: 'box', on: function () { return 0; } },
    { id: 'wheel', need: 1, coin: 20, ev: 'wheel', on: function () { return 0; } },
    { id: 'wx', need: 2, coin: 50, ev: 'wx', on: function () { return 0; } },
    // level jobs
    { id: 'lv3', cat: 'lvl', need: 3, coin: 60, ev: 'lvl', on: function () { return 0; } },
    { id: 'lvNew', cat: 'lvl', need: 1, coin: 50, ev: 'lvlNew', on: function () { return 0; } },
    { id: 'lvStar', cat: 'lvl', need: 1, coin: 70, ev: 'lvl3s', on: function () { return 0; } },
    { id: 'lvStars', cat: 'lvl', need: 5, coin: 80, ev: 'lvlStars', on: function () { return 0; } },
    { id: 'lvEndless', cat: 'lvl', need: 5, coin: 90, ev: 'endless', max: true, on: function () { return 0; } },
    { id: 'lvCustom', cat: 'lvl', need: 1, coin: 40, ev: 'custom', on: function () { return 0; } }
  ];
  // Jobs come in waves of five. Finish a wave (every job claimed) and the next one can be drawn at once; after the
  // second, the third waits twelve hours. Three waves a day at most, and a new day starts again from the first.
  // Every job here is an ordinary one (cat 'gen'); level jobs join when the levels mode does.
  var WAVE = { size: 5, max: 3, wait: 12 * 3600000 };
  // a wave: three everyday jobs and two level jobs
  function pickWave(day, wave) {
    var rnd = new ZZ.RNG(day * 2654435761 + wave * 40503), jobs = [];
    var gen = JOBS.filter(function (j) { return j.cat !== 'lvl'; }).map(function (j) { return j.id; }), lvl = JOBS.filter(function (j) { return j.cat === 'lvl'; }).map(function (j) { return j.id; });
    for (var i = 0; i < WAVE.size; i++) { var pool = i < WAVE.size - 2 ? gen : lvl; jobs.push({ id: pool.splice(Math.floor(rnd.next() * pool.length), 1)[0], n: 0, paid: false }); }
    return jobs;
  }
  var LOGIN = [20, 30, 40, 50, 60, 80, 120];
  function job(id) { for (var i = 0; i < JOBS.length; i++) if (JOBS[i].id === id) return JOBS[i]; return null; }

  // ---------- level and titles ----------
  // The level is a second ladder, apart from ranked: every match in every mode earns experience, and it never goes down.
  // The first levels come quickly (60 xp, a couple of matches); each one after needs 20 more.
  var LV_MAX = 100;
  function lvNeed(l) { return 60 + 20 * (l - 1); }
  function levelOf(xp) {
    var l = 1, left = Math.max(0, Math.floor(xp || 0));
    while (l < LV_MAX && left >= lvNeed(l)) { left -= lvNeed(l); l++; }
    return { lv: l, into: l < LV_MAX ? left : 0, need: l < LV_MAX ? lvNeed(l) : 0, top: l >= LV_MAX };
  }
  function lvCoins(l) { return 30 + 5 * l; }      // paid on reaching level l
  // Titles a player can wear next to the name. Level titles come with the level; the others are earned once and kept.
  // hour(): the hour of day in the game's own time zone (for the night owl).
  function hourNow() { return new Date(Meta.now() + TZ * 60000).getUTCHours(); }
  var TITLES = [
    { id: 'lv1', lv: 1 }, { id: 'lv10', lv: 10 }, { id: 'lv20', lv: 20 }, { id: 'lv35', lv: 35 }, { id: 'lv50', lv: 50 }, { id: 'lv75', lv: 75 }, { id: 'lv100', lv: 100 },
    { id: 'tst', on: function (m) { return m.battle && m.stats.tst > 0; } },
    { id: 'combo10', on: function (m) { return m.stats.maxCombo >= 10; } },
    { id: 'clean', on: function (m) { return m.battle && m.result > 0 && m.koOpp === 0 && m.ms >= 60000; } },
    { id: 'quad100', tot: function (d) { return d.tot.quads >= 100; } },
    { id: 'night', on: function (m) { var h = hourNow(); return m.result > 0 && h < 4; } },
    { id: 'duo', tot: function (d) { return d.tot.duo >= 20; } },
    { id: 'street', tot: function (d) { return d.tot.qbest >= 5; } },
    { id: 'member', sub: true }
  ];
  function titleDef(id) { for (var i = 0; i < TITLES.length; i++) if (TITLES[i].id === id) return TITLES[i]; return null; }

  // ---------- state ----------
  function blank() {
    return {
      v: 1, coins: 200, name: '', rp: 0, peak: 0, season: '', rgames: 0, streak: 0,
      xp: 0, titles: [], title: '',
      owned: { tile: [], bg: [], theme: [], fx: [] },
      equip: { tile: 'glaze', bg: 'wall', theme: 'auto', fx: 'shard' },
      items: ITEM_PRICE.map(function () { return 0; }), bring: [],
      sub: { until: 0, demo: true },
      custom: { tile: false, bg: false, dim: 45 },
      daily: { day: 0, jobs: [], wave: 1, waveNext: 0, login: 0, streak: 0, win: 0, draws: 0, ads: 0, wheel: 0, slot: 0 },
      box: { n: 0, last: null }, wheel: { n: 0, last: null }, slot: { n: 0, last: null }, lv: { stars: '', endless: 0, wx: 0, wxs: 0, wxr: 0 },
      tot: { games: 0, wins: 0, best: 0, sprint: 0, tspins: 0, sent: 0, kos: 0, coins: 0, online: 0, quads: 0, duo: 0, qstreak: 0, qbest: 0 },
      first: { drills: [], openers: [] },
      note: null
    };
  }
  var Meta = {
    data: blank(), now: function () { return Date.now(); }, onChange: null, store: null, onOp: null, quiet: 0, TZ: TZ,
    TIERS: TIERS, CATALOG: CATALOG, KINDS: KINDS, KIND_NAME: KIND_NAME, ITEM_PRICE: ITEM_PRICE, ITEM_KINDS: ITEM_PRICE.length - 1, FESTIVE: FESTIVE, FEST_OPEN: FEST_OPEN, festShown: festShown, BRING_MAX: BRING_MAX, JOBS: JOBS, LOGIN: LOGIN, PLAN: PLAN,
    SUB_BOOST: SUB_BOOST, rankOf: rankOf, rpDelta: rpDelta, botFor: botFor, find: find,
    TITLES: TITLES, LV_MAX: LV_MAX, levelOf: levelOf, lvCoins: lvCoins
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
    while (d.items.length < ITEM_PRICE.length) d.items.push(0);
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
    // the first wave of the day, picked by the date so everyone gets the same set
    d.day = day; d.jobs = pickWave(day, 1); d.wave = 1; d.waveNext = 0; d.draws = 0; d.ads = 0; d.wheel = 0; d.slot = 0;
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
      return { i: i, id: j.id, cat: def.cat || 'gen', need: def.need, coin: def.coin, n: Math.min(j.n, def.need), done: j.n >= def.need, paid: j.paid };
    });
  };
  Meta.jobsReady = function () { return Meta.jobs().filter(function (j) { return j.done && !j.paid; }).length; };
  Meta.claimJob = function (i) {
    var j = Meta.data.daily.jobs[i], def = j && job(j.id);
    if (!j || !def || j.paid || j.n < def.need) return 0;
    j.paid = true;
    Meta.earn(def.coin);
    // the second wave done: the third opens twelve hours from now
    var d = Meta.data.daily;
    if ((d.wave | 0) === 2 && d.jobs.every(function (x) { return x.paid; })) d.waveNext = Meta.now() + WAVE.wait;
    emit('job', [j.id]);
    return def.coin;
  };
  Meta.WAVE = WAVE; Meta.pickWave = pickWave;
  // where the waves stand: which one, whether the next can be drawn now, and from when
  Meta.waveInfo = function () {
    Meta.rollDay();
    var d = Meta.data.daily, w = d.wave | 0 || 1, all = d.jobs.length > 0 && d.jobs.every(function (x) { return x.paid; });
    var at = w === 2 ? d.waveNext || 0 : 0;
    return { wave: w, max: WAVE.max, done: all, last: w >= WAVE.max, at: at, can: all && w < WAVE.max && Meta.now() >= at };
  };
  Meta.nextWave = function () {
    var wi = Meta.waveInfo();
    if (!wi.can) return { ok: false, why: !wi.done ? 'unfinished' : wi.last ? 'none' : 'wait' };
    var d = Meta.data.daily;
    d.wave = wi.wave + 1; d.jobs = pickWave(d.day, d.wave); d.waveNext = 0;
    Meta.save();
    emit('wave', []);
    return { ok: true, wave: d.wave };
  };
  // progress from things other than matches (opening boxes, the wheel)
  function jobEvent(kind, n) {
    Meta.data.daily.jobs.forEach(function (j) { var def = job(j.id); if (def && def.ev === kind && !j.paid && j.n < def.need) j.n = Math.min(def.need, def.max ? Math.max(j.n, n) : j.n + n); });
  }
  // ---------- levels ----------
  // stars: one character per numbered level, '0' to '3'; a level opens when the one before has a star
  Meta.lvStars = function (n) { return +(Meta.data.lv.stars.charAt(n - 1) || 0); };
  Meta.lvOpen = function (n) { return n >= 1 && n <= 1000 && (n === 1 || Meta.lvStars(n - 1) > 0); };
  Meta.lvTotal = function () { var s = Meta.data.lv.stars, t = 0; for (var i = 0; i < s.length; i++) t += +s.charAt(i); return t; };
  // a numbered level finished in so many pieces: the stars are worked out here (the same on the server)
  Meta.levelClear = function (n, pieces) {
    var Lv = ZZ.Levels;
    n = Math.floor(+n); pieces = Math.floor(+pieces);
    if (!Lv || !Meta.lvOpen(n) || !(pieces >= 1)) return { ok: false, why: 'no' };
    var lv = Lv.level(n);
    if (pieces > Lv.limitOf(lv)) return { ok: false, why: 'no' };
    var st = Lv.stars(lv, pieces), had = Meta.lvStars(n), d = Meta.data, coins = 0;
    if (!had) coins += 20 + Math.floor(n / 25) * 5;          // the first clear
    if (st > had) {
      coins += (st - had) * 10;
      var s = d.lv.stars; while (s.length < n) s += '0';
      d.lv.stars = s.slice(0, n - 1) + st + s.slice(n);
    }
    if (coins) { d.coins += coins; d.tot.coins += coins; }
    jobEvent('lvl', 1);
    if (!had) jobEvent('lvlNew', 1);
    if (st === 3) jobEvent('lvl3s', 1);
    if (st > had) jobEvent('lvlStars', st - had);
    Meta.save();
    emit('lvl', [n, pieces]);
    return { ok: true, stars: st, had: had, coins: coins };
  };
  // an endless run reached this stage
  Meta.endlessDone = function (stage) {
    stage = Math.max(0, Math.min(999, Math.floor(+stage) || 0));
    var d = Meta.data, best = stage > d.lv.endless;
    if (best) d.lv.endless = stage;
    jobEvent('endless', stage);
    Meta.save();
    emit('endless', [stage]);
    return { ok: true, best: best };
  };
  // a weather run (挑戰大自然) ended: sec survived, lines cleared, score; practice runs (one kind of weather) pay nothing
  Meta.wxDone = function (sec, lines, score, practice) {
    sec = Math.max(0, Math.min(3600, Math.floor(+sec) || 0));
    lines = Math.max(0, Math.min(sec * 5 + 8, Math.floor(+lines) || 0));
    score = Math.max(0, Math.min(sec * 3000 + 5000, Math.floor(+score) || 0));
    practice = !!practice;
    var d = Meta.data, out = { ok: true, coins: 0, best: false, bestSec: false };
    if (!practice) {
      if (score > d.lv.wx) { d.lv.wx = score; out.best = true; }
      if (sec > d.lv.wxs) { d.lv.wxs = sec; out.bestSec = true; }
      if (sec >= 20) out.coins = Meta.earn(Math.min(60, Math.floor(sec / 20) + Math.floor(lines / 4)));
    }
    jobEvent('wx', 1);
    Meta.save();
    emit('wx', [sec, lines, score, practice ? 1 : 0]);
    return out;
  };
  // a weather battle ended (result 1 won, 0 drawn, -1 lost; net: against a real player): the storm points go up or down
  Meta.wxBattle = function (result, net) {
    result = result > 0 ? 1 : result < 0 ? -1 : 0;
    var d = Meta.data, before = d.lv.wxr, delta = result > 0 ? (net ? 25 : 15) : result === 0 ? 5 : -10;
    d.lv.wxr = Math.max(0, Math.min(99999, before + delta));
    jobEvent('wx', 1);
    Meta.save();
    emit('wxb', [result, net ? 1 : 0]);
    return { ok: true, before: before, after: d.lv.wxr, delta: d.lv.wxr - before };
  };
  Meta.customPlayed = function () { jobEvent('custom', 1); Meta.save(); emit('custom', []); return { ok: true }; };
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
  Meta.level = function () { return levelOf(Meta.data.xp); };
  Meta.hasTitle = function (id) {
    var t = titleDef(id);
    if (!t) return false;
    if (t.lv) return Meta.level().lv >= t.lv;
    if (t.sub) return Meta.isSub();
    return Meta.data.titles.indexOf(id) >= 0;
  };
  // the title on show: the one picked, or else the highest level title reached
  Meta.titleNow = function () {
    var d = Meta.data;
    if (d.title && Meta.hasTitle(d.title)) return d.title;
    for (var i = TITLES.length - 1; i >= 0; i--) if (TITLES[i].lv && Meta.hasTitle(TITLES[i].id)) return TITLES[i].id;
    return 'lv1';
  };
  Meta.wearTitle = function (id) {
    if (typeof id !== 'string' || (id && !Meta.hasTitle(id))) return false;
    if (Meta.data.title === id) return true;
    Meta.data.title = id;
    Meta.save();
    emit('title', [id]);
    return true;
  };
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
    if (festLocked(it)) return 'locked';
    if (it.rank != null) return rankOf(Math.max(Meta.data.peak, Meta.data.rp)).tier >= it.rank ? 'ok' : (Meta.isSub() ? 'ok' : 'rank');
    return Meta.isSub() ? 'ok' : 'buy';
  };
  Meta.canUse = function (kind, id) { return Meta.state(kind, id) === 'ok'; };
  Meta.buy = function (kind, id) {
    var it = find(kind, id);
    if (!it || it.sub || it.rank != null || !it.price) return { ok: false, why: 'no' };
    if (Meta.owns(kind, id)) return { ok: false, why: 'have' };
    if (festLocked(it)) return { ok: false, why: 'locked' };
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
    if (festLocked(st)) return { ok: false, why: 'locked' };
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
    d.bring = d.bring.filter(function (id) { return id >= 1 && id < ITEM_PRICE.length; }).slice(0, BRING_MAX);
    d.lv.stars = String(d.lv.stars || '').replace(/[^0-3]/g, '').slice(0, 1000);
    d.lv.endless = Math.max(0, Math.min(999, Math.floor(+d.lv.endless) || 0));
    d.lv.wx = Math.max(0, Math.floor(+d.lv.wx) || 0);
    d.lv.wxs = Math.max(0, Math.min(3600, Math.floor(+d.lv.wxs) || 0));
    d.lv.wxr = Math.max(0, Math.min(99999, Math.floor(+d.lv.wxr) || 0));
  };

  // ---------- items carried into a match ----------
  // ---------- treasure boxes ----------
  // Free draws every day: 5, or 10 for members; what is not used is gone at midnight. Each draw opens one box, and the
  // box's grade is drawn first, then what is inside. All the odds are in BOX and are shown to players as they are.
  // Where a cloud save is linked, the draw happens on the server only: the page sends
  // the request and shows what the server's answer says was in the box, so nobody can see a result coming or redo one.
  var DRAWS = { free: 5, sub: 10 };
  var BOX = [
    { id: 'wood', p: 60, prizes: [{ p: 70, kind: 'items', n: 1 }, { p: 30, kind: 'coins', n: 40 }] },
    { id: 'iron', p: 28, prizes: [{ p: 60, kind: 'items', n: 2 }, { p: 25, kind: 'coins', n: 120 }, { p: 15, kind: 'look', max: 600 }] },
    { id: 'gold', p: 10, prizes: [{ p: 50, kind: 'items', n: 3, coins: 100 }, { p: 50, kind: 'look', max: 900 }] },
    { id: 'gem', p: 2, prizes: [{ p: 70, kind: 'look', max: 99999 }, { p: 30, kind: 'items', n: 5, coins: 500 }] }
  ];
  Meta.BOX = BOX; Meta.DRAWS = DRAWS;
  // ---------- the wheel and the slot machine ----------
  // Like the boxes: drawn by the server when there is a cloud save, odds published in the game, every draw kept.
  // The wheel is free once a day (twice for members). The slot costs coins, a few a day at most, and pays back a
  // little less than it takes on average, so it uses up spare coins rather than making them.
  var WHEEL = [
    { id: 'c20', p: 30, give: { coins: 20 } },
    { id: 'c50', p: 22, give: { coins: 50 } },
    { id: 'item1', p: 15, give: { items: 1 } },
    { id: 'box1', p: 10, give: { box: 1 } },
    { id: 'c100', p: 12, give: { coins: 100 } },
    { id: 'item3', p: 6, give: { items: 3 } },
    { id: 'c300', p: 4, give: { coins: 300 } },
    { id: 'c1000', p: 1, give: { coins: 1000 } }
  ];
  var WHEEL_FREE = { free: 1, sub: 2 };
  var SLOT = { cost: 50, perDay: 20, outs: [
    { id: 'lose', p: 48.5, give: {} },
    { id: 'pair', p: 35, give: { coins: 60 } },
    { id: 'gold1', p: 10, give: { items: 1 } },
    { id: 'three', p: 4, give: { coins: 250 } },
    { id: 'gold2', p: 2, give: { coins: 150 } },
    { id: 'gold3', p: 0.5, give: { coins: 1000 } }
  ] };
  Meta.WHEEL = WHEEL; Meta.WHEEL_FREE = WHEEL_FREE; Meta.SLOT = SLOT;
  function randItem() { return 1 + Math.floor(Meta.rand() * Meta.ITEM_KINDS) % Meta.ITEM_KINDS; }
  function give(g) {
    var d = Meta.data, got = [], i;
    if (g.coins) { d.coins += g.coins; d.tot.coins += g.coins; got.push({ kind: 'coins', n: g.coins }); }
    for (i = 0; i < (g.items || 0); i++) { var id = randItem(); d.items[id] = Math.min(99, (d.items[id] | 0) + 1); got.push({ kind: 'item', id: id }); }
    if (g.box) { d.daily.draws = Math.max(0, d.daily.draws - g.box); got.push({ kind: 'box', n: g.box }); }
    return got;
  }
  Meta.wheelLeft = function () { Meta.rollDay(); return Math.max(0, (Meta.isSub() ? WHEEL_FREE.sub : WHEEL_FREE.free) - (Meta.data.daily.wheel | 0)); };
  Meta.slotLeft = function () { Meta.rollDay(); return Math.max(0, SLOT.perDay - (Meta.data.daily.slot | 0)); };
  function wheelNow() {
    if (Meta.wheelLeft() < 1) return { ok: false, why: 'none' };
    var d = Meta.data, seg = pick(WHEEL, Meta.rand());
    d.daily.wheel = (d.daily.wheel | 0) + 1;
    jobEvent('wheel', 1);
    var got = give(seg.give);
    d.wheel.n++; d.wheel.last = { n: d.wheel.n, at: Meta.now(), seg: seg.id, got: got };
    Meta.save();
    return { ok: true, seg: seg.id, got: got };
  }
  function slotNow() {
    if (Meta.slotLeft() < 1) return { ok: false, why: 'none' };
    if (!Meta.spend(SLOT.cost)) return { ok: false, why: 'poor', n: SLOT.cost - Meta.data.coins };
    var d = Meta.data, out = pick(SLOT.outs, Meta.rand());
    d.daily.slot = (d.daily.slot | 0) + 1;
    var got = give(out.give);
    d.slot.n++; d.slot.last = { n: d.slot.n, at: Meta.now(), out: out.id, got: got };
    Meta.save();
    return { ok: true, out: out.id, got: got };
  }
  Meta.spinWheel = function () {
    if (Meta.wheelLeft() < 1) return { ok: false, why: 'none' };
    if (!here()) { emit('wheel', []); return { ok: true, pending: true }; }
    var r = wheelNow(); if (r.ok) emit('wheel', []); return r;
  };
  Meta.pullSlot = function () {
    if (Meta.slotLeft() < 1) return { ok: false, why: 'none' };
    if (Meta.data.coins < SLOT.cost) return { ok: false, why: 'poor', n: SLOT.cost - Meta.data.coins };
    if (!here()) { emit('slot', []); return { ok: true, pending: true }; }
    var r = slotNow(); if (r.ok) emit('slot', []); return r;
  };
  // ---------- watching an ad for coins ----------
  // A reward is only ever paid by the server: either the ad network's signed callback says the ad was watched (see
  // server/ads.js), or a member claims the same reward without an ad. Both share one daily count.
  var ADS = { coins: 15, perDay: 30 };
  Meta.ADS = ADS;
  Meta.adsLeft = function () { Meta.rollDay(); return Math.max(0, ADS.perDay - (Meta.data.daily.ads | 0)); };
  function grantAd() {
    if (Meta.adsLeft() < 1) return { ok: false, why: 'none' };
    var d = Meta.data;
    d.daily.ads = (d.daily.ads | 0) + 1;
    d.coins += ADS.coins; d.tot.coins += ADS.coins;
    Meta.save();
    return { ok: true, n: ADS.coins };
  }
  // a member takes the reward without an ad; with a cloud save the server does it (the page only asks)
  Meta.adFree = function () {
    if (!Meta.isSub()) return { ok: false, why: 'sub' };
    if (Meta.adsLeft() < 1) return { ok: false, why: 'none' };
    if (!here()) { emit('adFree', []); return { ok: true, pending: true }; }
    var r = grantAd();
    if (r.ok) emit('adFree', []);
    return r;
  };
  // changes only the server may make: never in Meta.OPS, so a page cannot send them
  var SERVER_RUN = { adGrant: function () { return grantAd(); } };
  Meta.runServer = function (k) {
    if (!SERVER_RUN.hasOwnProperty(k)) return { ok: false, why: 'op' };
    Meta.quiet++;
    try { return SERVER_RUN[k](); } finally { Meta.quiet--; }
  };
  // Meta.remote(): set by the page's cloud code, true while a cloud save is linked (the server does the drawing then)
  function here() { return !(typeof Meta.remote === 'function' && Meta.remote()); }
  Meta.rand = function () { return Math.random(); };
  Meta.drawsLeft = function () { Meta.rollDay(); return Math.max(0, (Meta.isSub() ? DRAWS.sub : DRAWS.free) - Meta.data.daily.draws); };
  function pick(list, r) { var at = r * 100; for (var i = 0; i < list.length; i++) { at -= list[i].p; if (at < 0) return list[i]; } return list[list.length - 1]; }
  // what one draw gives: [{ kind: 'item', id } | { kind: 'coins', n } | { kind: 'look', k, id } ]
  function openBox() {
    var d = Meta.data, box = pick(BOX, Meta.rand()), prize = pick(box.prizes, Meta.rand()), got = [], i;
    if (prize.kind === 'look') {
      var pool = [];
      KINDS.forEach(function (k) { CATALOG[k].forEach(function (it) { if (it.price > 0 && it.price <= prize.max && !festLocked(it) && !Meta.owns(k, it.id)) pool.push({ k: k, id: it.id, price: it.price }); }); });
      if (pool.length) { var one = pool[Math.floor(Meta.rand() * pool.length) % pool.length]; d.owned[one.k].push(one.id); got.push({ kind: 'look', k: one.k, id: one.id }); }
      else got.push({ kind: 'coins', n: Math.round(prize.max >= 99999 ? 800 : prize.max / 2) });      // owns everything that could come: coins instead
    } else if (prize.kind === 'items') {
      for (i = 0; i < prize.n; i++) got.push({ kind: 'item', id: randItem() });
      if (prize.coins) got.push({ kind: 'coins', n: prize.coins });
    } else got.push({ kind: 'coins', n: prize.n });
    got.forEach(function (g) {
      if (g.kind === 'item') d.items[g.id] = Math.min(99, d.items[g.id] + 1);
      if (g.kind === 'coins') { d.coins += g.n; d.tot.coins += g.n; }
    });
    return { grade: box.id, got: got };
  }
  // n boxes at once (1 to what is left today). Returns { ok, pending } where the server will do it.
  Meta.draw = function (n) {
    n = Math.max(1, Math.min(10, Math.floor(+n || 1)));
    if (Meta.drawsLeft() < n) return { ok: false, why: 'none' };
    if (!here()) { emit('draw', [n]); return { ok: true, pending: true }; }
    var res = drawNow(n);
    emit('draw', [n]);
    return res;
  };
  function drawNow(n) {
    var d = Meta.data, out = [];
    if (Meta.drawsLeft() < n) return { ok: false, why: 'none' };
    for (var i = 0; i < n; i++) { d.daily.draws++; out.push(openBox()); }
    jobEvent('box', n);
    d.box.n++; d.box.last = { n: d.box.n, at: Meta.now(), boxes: out };
    d.tot.draws = (d.tot.draws || 0) + n;
    Meta.save();
    return { ok: true, boxes: out };
  }
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
  // titles earned by this match and the ones whose counts it just reached (only titles not held yet)
  function earnTitles(m) {
    var d = Meta.data, got = [];
    TITLES.forEach(function (t) {
      if (t.lv || t.sub || d.titles.indexOf(t.id) >= 0) return;
      if ((t.on && t.on(m)) || (t.tot && t.tot(d))) { d.titles.push(t.id); got.push(t.id); }
    });
    return got;
  }
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
      team: mode === 'net' && m.team === true, quick: mode === 'net' && m.quick === true,
      // which online room it was played in and how many seats it had, so the reports of one match can be put together
      room: mode === 'net' && typeof m.room === 'string' && /^[A-Z0-9]{5}$/.test(m.room) ? m.room : '', seats: mode === 'net' ? int(m.seats, 2, 8) : 1,
      ko: sprint ? 0 : int(m.ko, 0, 60), koOpp: sprint ? 0 : int(m.koOpp, 0, 60), itemsUsed: sprint ? 0 : int(m.itemsUsed, 0, 60),
      ms: ms, time: sprint ? ms : 0,
      stats: {
        score: cap(st.score, 3000, 5000), sent: sprint ? 0 : cap(st.sent, 6, 20), spins: cap(st.spins, 1.5, 4), minis: cap(st.minis, 1.5, 4),
        xspins: cap(st.xspins, 1.5, 4), tst: cap(st.tst, 1, 2), quads: cap(st.quads, 1, 3), maxCombo: int(st.maxCombo, 0, 40), lines: cap(st.lines, 5, 8), pieces: cap(st.pieces, 6, 10)
      }
    };
  };
  // m: { mode: 'ai'|'rank'|'ghost'|'net'|'sprint', result: 1|0|-1, level, stats, ko, koOpp, itemsUsed, ms }
  // tape: the proof that goes to the server with the result (see replay.js); it plays no part in the sums here
  Meta.finish = function (m, tape) {
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
    // experience: something for every match, more for winning and for playing well; a level up pays coins
    var xp = m.battle ? 20 + (m.result > 0 ? 15 : m.result === 0 ? 8 : 0) + Math.min(15, Math.floor(sc / 1500)) : m.result > 0 ? 25 : 10, was = levelOf(d.xp);
    d.xp += xp;
    var now = levelOf(d.xp);
    out.xp = xp; out.level = { from: was.lv, to: now.lv, into: now.into, need: now.need, top: now.top };
    for (var l = was.lv + 1; l <= now.lv; l++) { var lc = lvCoins(l); parts.push({ key: 'lvup', n: lc, lv: l }); out.coins += lc; }
    d.tot.quads += st.quads || 0;
    if (m.mode === 'net' && m.team && m.result > 0) d.tot.duo++;
    if (m.mode === 'net' && m.quick) { d.tot.qstreak = m.result > 0 ? d.tot.qstreak + 1 : 0; d.tot.qbest = Math.max(d.tot.qbest, d.tot.qstreak); }
    out.titles = earnTitles(m);
    d.coins += out.coins; d.tot.coins += out.coins;
    Meta.save();
    delete m.battle;
    emit('fin', tape ? [m, tape] : [m]);
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
  // an item number exactly as it should be: a whole number for one of the items, nothing clamped into range
  function itemId(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 1 && v < ITEM_PRICE.length; }
  function yes(v) { return v ? { ok: true } : { ok: false, why: 'no' }; }
  function str(v) { return typeof v === 'string' && v.length <= 24 ? v : ''; }
  var RUN = {
    // a draw on the page while the server keeps the cloud save does nothing here: the server's answer brings the boxes
    wheel: function () { if (!here()) return yes(Meta.wheelLeft() >= 1); var r = wheelNow(); return r.ok ? { ok: true, out: r } : { ok: false, why: r.why }; },
    slot: function () { if (!here()) return yes(Meta.slotLeft() >= 1 && Meta.data.coins >= SLOT.cost); var r = slotNow(); return r.ok ? { ok: true, out: r } : { ok: false, why: r.why }; },
    adFree: function () { if (!here()) return yes(Meta.isSub() && Meta.adsLeft() >= 1); var r = Meta.adFree(); return r.ok ? { ok: true } : { ok: false, why: r.why }; },
    draw: function (a) { if (!here()) return yes(Meta.drawsLeft() >= 1); var r = drawNow(Math.max(1, Math.min(10, Math.floor(+a[0] || 1)))); return r.ok ? { ok: true, out: r } : { ok: false, why: r.why }; },
    title: function (a) { return yes(Meta.wearTitle(typeof a[0] === 'string' ? a[0].slice(0, 20) : '')); },
    fin: function (a) { return { ok: true, out: Meta.finish(a[0] && typeof a[0] === 'object' ? a[0] : {}) }; },
    buy: function (a) { return KINDS.indexOf(a[0]) < 0 ? yes(0) : Meta.buy(a[0], str(a[1])); },
    set: function (a) { return Meta.buySet(str(a[0])); },
    item: function (a) { return itemId(a[0]) ? Meta.buyItem(a[0]) : yes(0); },
    wear: function (a) { return yes(Meta.equip(a[0], str(a[1]))); },
    wset: function (a) { return yes(Meta.equipSet(str(a[0]))); },
    bring: function (a) { return yes(itemId(a[0]) && Meta.toggleBring(a[0])); },
    take: function () { Meta.takeBring(); return yes(1); },
    login: function () { return yes(Meta.claimLogin()); },
    job: function (a) { return yes(Meta.claimJobId(str(a[0]))); },
    wave: function () { return Meta.nextWave(); },
    lvl: function (a) { var r = Meta.levelClear(a[0], a[1]); return r.ok ? { ok: true, out: r } : r; },
    endless: function (a) { return Meta.endlessDone(a[0]); },
    custom: function () { return Meta.customPlayed(); },
    wx: function (a) { return Meta.wxDone(a[0], a[1], a[2], a[3] === 1); },
    wxb: function (a) { return Meta.wxBattle(a[0], a[1] === 1); },
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
