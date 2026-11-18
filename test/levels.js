'use strict';
// The computer rivals: seven levels listed from easiest to hardest, the "computer difficulty" setting, ranked staying
// the same for everyone, and the crowd that cheers a win. Needs the static server on 8765.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.env.ZZ_URL || 'http://127.0.0.1:8765/index.html?sw=off';
const OUT = path.join(__dirname, '..', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } }

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  const open = async store => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'zh-TW' });
    if (store) await ctx.addInitScript(s => { try { if (!localStorage.getItem('zhuanzhuan.v2')) localStorage.setItem('zhuanzhuan.v2', s); } catch (e) { /* no storage */ } }, JSON.stringify(store));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(URL); await sleep(400);
    return page;
  };
  const ev = (page, expr) => page.evaluate('(function(){var p=ZZ.peek();var S=p.S;var B=ZZ.Bot;' + expr + '})()');
  const names = page => page.evaluate(() => [...document.querySelectorAll('#sheetCard .lvl')].map(b => b.querySelector('b').textContent + ' ' + b.querySelector('i').textContent));

  // ---------- someone new ----------
  const page = await open();
  await page.click('[data-go="battle"]'); await sleep(200);
  let list = await names(page);
  ok(list.length === 7 && list.map(s => s.split(' ')[0]).join() === '新手,小工,學徒,熟手,師傅,老師傅,宗師', 'seven rivals, easiest first', list);
  ok(/0\.22/.test(list[0]) && /0\.32/.test(list[1]) && /0\.45/.test(list[2]) && /2\.3/.test(list[6]), 'each shows its pace', list);
  ok(await page.evaluate(() => document.querySelector('#sheetCard .lvl[aria-checked="true"] b').textContent) === '新手', 'someone new starts against the gentlest one');
  ok(await page.evaluate(() => !/電腦難度目前/.test(document.getElementById('sheetCard').textContent)), 'no note about the difficulty setting while it is standard');
  await page.screenshot({ path: path.join(OUT, 'lv1-pick.png') });
  // sounds: listen to what gets played
  await page.evaluate(() => { const s = ZZ.peek().sfx, play = s.play.bind(s); window.__snd = []; s.play = function (n, a, b) { window.__snd.push(n); return play(n, a, b); }; });
  await page.click('[data-do="fight"]'); await sleep(3600);
  ok(await ev(page, 'return S.mode === "ai" && S.level === 5 && S.oppName === "新手" && S.bot.cfg.pps === 0.22 && S.bot.cfg.noise === 60'), 'the match is against that level', await ev(page, 'return [S.level, S.oppName, S.bot.cfg.pps, S.bot.cfg.noise]'));
  ok(await ev(page, 'var s = p.sfx; return !!(s.buf.cheer && s.buf.cheer.duration > 3 && s.buf.cheer.duration < 4.2)'), 'the cheer is loaded and about 3.7 s long', await ev(page, 'return p.sfx.buf.cheer ? p.sfx.buf.cheer.duration : null'));
  // win it
  await ev(page, 'S.ko.me = 2; S.me.stats.score = 3000; S.left = 200; return 1'); await sleep(1700);
  ok(await ev(page, 'return S.result') === 1 && (await page.evaluate(() => window.__snd)).indexOf('cheer') >= 0, 'a win is cheered', await page.evaluate(() => window.__snd.slice(-4)));
  const rw = await ev(page, 'return S.reward.parts');
  ok(rw.some(x => x.key === 'win' && x.n === 5), 'beating the gentlest rival pays its own, smaller, prize', rw);
  await page.screenshot({ path: path.join(OUT, 'lv2-win.png') });
  // a draw is not cheered, a loss even less
  await page.evaluate(() => { window.__snd.length = 0; });
  await page.click('[data-do="again"]'); await sleep(3600);
  await ev(page, 'S.left = 200; S.me.stats.sent = 0; S.opp.stats.sent = 0; return 1'); await sleep(1700);
  ok(await ev(page, 'return S.result') === 0 && (await page.evaluate(() => window.__snd)).indexOf('cheer') < 0 && (await page.evaluate(() => window.__snd)).indexOf('win') >= 0, 'a draw gets the little fanfare only', await page.evaluate(() => window.__snd.slice(-4)));
  await page.evaluate(() => { window.__snd.length = 0; });
  await page.click('[data-do="again"]'); await sleep(3600);
  await ev(page, 'S.ko.opp = 3; S.left = 200; return 1'); await sleep(1700);
  ok(await ev(page, 'return S.result') === -1 && (await page.evaluate(() => window.__snd)).indexOf('cheer') < 0 && (await page.evaluate(() => window.__snd)).indexOf('lose') >= 0, 'a loss is not cheered', await page.evaluate(() => window.__snd.slice(-4)));
  await page.click('[data-do="menu"]'); await sleep(300);

  // ---------- the difficulty setting ----------
  await page.click('[data-sheet="settings"]'); await sleep(200);
  ok(await page.evaluate(() => { const s = document.getElementById('sAi'); return s && s.value === '0' && s.options.length === 5 && [...s.options].map(o => o.textContent).join() === '很輕鬆,輕鬆,標準,困難,很困難'; }), 'settings: computer difficulty, five steps, standard to begin with');
  ok(await page.evaluate(() => /排位賽不受影響/.test(document.getElementById('sheetCard').textContent)), 'and it says ranked is not affected');
  const top = await page.evaluate(() => { const c = document.getElementById('sheetCard'), e = document.getElementById('sAi').getBoundingClientRect(); return [c.scrollTop, c.scrollHeight > c.clientHeight + 50, e.top > 0 && e.bottom < innerHeight]; });
  ok(top[0] === 0 && top[1] && top[2], 'the long settings sheet opens at its top, with that choice in view', top);
  await page.screenshot({ path: path.join(OUT, 'lv3-setting.png') });
  await page.selectOption('#sAi', '-2'); await sleep(150);
  ok(await ev(page, 'return p.set.ai') === -2 && await page.evaluate(() => JSON.parse(localStorage.getItem('zhuanzhuan.v2')).set.ai) === -2, 'choosing "very easy" is kept');
  await page.click('[data-do="close"]'); await sleep(150);
  await page.click('[data-go="battle"]'); await sleep(200);
  list = await names(page);
  ok(/0\.13/.test(list[0]) && /0\.27/.test(list[2]) && /1\.38/.test(list[6]), 'the picker shows the slower paces', list);
  ok(await page.evaluate(() => /電腦難度目前調成「很輕鬆」/.test(document.getElementById('sheetCard').textContent)), 'and says why');
  await page.click('[data-level="0"]'); await sleep(100);
  await page.click('[data-do="fight"]'); await sleep(3500);
  ok(await ev(page, 'return S.level === 0 && S.bot.cfg.pps === 0.27 && S.bot.cfg.noise === 34 && S.bot.cfg.depth === B.LEVELS[0].depth'), 'the rival is slower and sloppier, its style unchanged', await ev(page, 'return [S.bot.cfg.pps, S.bot.cfg.noise]'));
  await page.keyboard.press('Escape'); await sleep(150); await page.click('[data-do="menu"]'); await sleep(300);
  // ranked does not listen to it
  await page.click('[data-go="rank"]'); await sleep(200);
  await page.click('[data-do="rankGo"]'); await sleep(3500);
  const want = await ev(page, 'var b = ZZ.Meta.botFor(ZZ.Meta.data.rp, function () { return 0; }); return [b.pps, b.noise]');
  ok(await ev(page, 'return S.mode === "rank" && S.bot.cfg.pps === ' + want[0] + ' && S.bot.cfg.noise === ' + want[1]), 'ranked rivals are the same whatever the setting', [await ev(page, 'return [S.bot.cfg.pps, S.bot.cfg.noise]'), want]);
  ok(want[0] <= 0.32, 'and the first ranked rivals are gentle ones', want);
  await page.keyboard.press('Escape'); await sleep(150); await page.click('[data-do="menu"]'); await sleep(300);
  // harder
  await page.click('[data-sheet="settings"]'); await sleep(200);
  await page.selectOption('#sAi', '2'); await sleep(100);
  await page.click('[data-do="close"]'); await sleep(100);
  await ev(page, 'ZZ.App.begin("battle", { mode: "ai", level: 1, minutes: 1, items: false }); return 1'); await sleep(300);
  ok(await ev(page, 'return S.bot.cfg.pps === 1.05 && S.bot.cfg.noise === 4'), '"very hard" makes the same level faster and sharper', await ev(page, 'return [S.bot.cfg.pps, S.bot.cfg.noise]'));
  await page.keyboard.press('Escape'); await sleep(150); await page.click('[data-do="menu"]'); await sleep(300);
  await page.click('[data-sheet="settings"]'); await sleep(200);
  await page.click('[data-do="defaults"]'); await sleep(200);
  ok(await ev(page, 'return p.set.ai') === 0, '"defaults" puts it back to standard');
  await page.context().close();

  // ---------- someone who was already playing keeps their choice ----------
  const old = await open({ set: {}, save: { best: 0, dojo: 3, level: 1, minutes: 3, tip: 1, items: 0, itip: 0 } });
  await old.click('[data-go="battle"]'); await sleep(200);
  ok(await old.evaluate(() => document.querySelector('#sheetCard .lvl[aria-checked="true"] b').textContent) === '熟手', 'a returning player still has the rival they picked last time');
  await old.context().close();

  ok(!problems.length, 'no page errors', problems);
  await browser.close();
  console.log('level checks: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
