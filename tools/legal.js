'use strict';
// Builds the regional privacy policies and terms (legal/<region>/privacy.html and terms.html) from the shared text
// in each language (legal/src/<doc>.<lang>.html) and each region's additions (legal/src/regions.js).
// Every page says plainly that it is a draft waiting for a lawyer. Run by build.js.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const REGIONS = require('../legal/src/regions.js');
const DATE = { 'zh-Hant': '2026 年 11 月 20 日', 'zh-Hans': '2026 年 11 月 20 日', en: '20 November 2026', ja: '2026 年 11 月 20 日', ko: '2026년 11월 20일' };
const W = {
  'zh-Hant': { privacy: '隱私政策', terms: '服務條款', back: '回到遊戲', draft: '<strong>草稿</strong>：這是依「{0}」法律撰寫的初稿，尚待律師審閱；標示【待確認】的地方還沒定案。正式版本以審閱後公布的為準。', regions: '其他地區的版本', updated: '更新', site: '轉磚對戰', law: '適用：{0}', also: '另見' },
  en: { privacy: 'Privacy policy', terms: 'Terms of service', back: 'Back to the game', draft: '<strong>Draft</strong>: written for {0} and waiting for review by a lawyer; anything marked [TO CONFIRM] is not settled yet. The reviewed version, once published, is the one that counts.', regions: 'Versions for other regions', updated: 'updated', site: 'Zhuan Zhuan Battle', law: 'Written for: {0}', also: 'See also' },
  ja: { privacy: 'プライバシーポリシー', terms: '利用規約', back: 'ゲームに戻る', draft: '<strong>草案</strong>：日本の法令（{0}ほか）に合わせて作成した草案で、弁護士の確認前です。【要確認】の箇所は未確定です。確認後に公表するものを正式版とします。', regions: 'ほかの地域の版', updated: '更新', site: '轉磚', law: '準拠：{0}', also: 'あわせて' },
  ko: { privacy: '개인정보 처리방침', terms: '이용약관', back: '게임으로 돌아가기', draft: '<strong>초안</strong>: 대한민국 법령({0} 등)에 맞춰 작성한 초안으로, 변호사 검토 전입니다. 【검토 필요】로 표시한 부분은 아직 확정되지 않았습니다. 검토 후 공개하는 것을 정식본으로 합니다.', regions: '다른 지역 버전', updated: '개정', site: '轉磚', law: '적용 법령: {0}', also: '함께 보기' }
};

function hansOf() {
  global.window = global; global.document = undefined;
  const ZZ = require('../src/engine.js');
  require('../src/hans-map.js'); require('../src/i18n.js');
  return s => s.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : ZZ.L.hans(p)).join('');      // only the text, never the markup
}
const STYLE = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/)[0]
  .replace('</style>', '.draft { background: var(--panel); border: 2px dashed var(--gold); border-radius: 10px; padding: .8rem 1rem; margin: 0 0 1.5rem; }\n.regions { display: flex; flex-wrap: wrap; gap: .4rem .9rem; padding: 0; list-style: none; font-size: .93rem; }\n.regions [aria-current] { font-weight: 700; text-decoration: none; color: var(--ink); }\n</style>');
const FONTS = { 'zh-Hant': '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei"', 'zh-Hans': '"PingFang SC", "Noto Sans SC", "Microsoft YaHei"', en: '', ja: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic"', ko: '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic"' };

function page(r, doc, hans) {
  const lang = r.lang, base = lang === 'zh-Hans' ? 'zh-Hant' : lang, w = W[base];
  let body = fs.readFileSync(path.join(ROOT, 'legal', 'src', doc + '.' + base + '.html'), 'utf8');
  body = body.replace(/href="CREDITS\.md"/g, 'href="../../CREDITS.md"').replace(/href="\.\/"/g, 'href="../../"');
  body += (r[doc] || '');
  const nav = '<ul class="regions">' + REGIONS.map(x => '<li><a href="../' + x.code + '/' + doc + '.html"' + (x.code === r.code ? ' aria-current="page"' : '') + '>' + x.name + '</a></li>').join('') + '</ul>';
  const other = doc === 'privacy' ? 'terms' : 'privacy';
  let html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${w.site}｜${w[doc]}${/^zh|^ja/.test(lang) ? '（' + r.name + '）' : ' (' + r.name + ')'}</title>
<link rel="icon" href="../../favicon.ico" sizes="48x48">
${STYLE.replace('"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", ', FONTS[lang] ? FONTS[lang] + ', ' : '')}
</head>
<body>
<main>
<a class="back" href="../../">${w.back}</a>
<h1>${w[doc]}</h1>
<p class="when">${w.site} · 斯諾瑞姆工作室（SnowRealm）· ${r.name} · ${DATE[lang]} ${w.updated}</p>
<p class="draft">${w.draft.replace('{0}', r.law)}</p>
${body}
<hr>
<p>${w.also}：<a href="${other}.html">${w[other]}</a></p>
<h2>${w.regions}</h2>
${nav}
</main>
</body>
</html>
`;
  if (lang === 'zh-Hans') html = hans(html).replace(/斯诺瑞姆工作室/g, '斯諾瑞姆工作室');
  return html;
}
function build() {
  const hans = hansOf(), out = [];
  for (const r of REGIONS) {
    const dir = path.join(ROOT, 'legal', r.code);
    fs.mkdirSync(dir, { recursive: true });
    for (const doc of ['privacy', 'terms']) { fs.writeFileSync(path.join(dir, doc + '.html'), page(r, doc, hans)); out.push(r.code + '/' + doc); }
  }
  return out;
}
// The main pages (privacy.html, terms.html: Taiwan, in Traditional Chinese and English) are rebuilt from the same
// shared text, so they never drift from the regional ones, and list the other regions' versions.
function root() {
  for (const doc of ['privacy', 'terms']) {
    const f = path.join(ROOT, doc + '.html'), s = fs.readFileSync(f, 'utf8');
    const head = s.slice(0, s.indexOf('<p class="when">')), when = s.match(/<p class="when">[^<]*<\/p>/)[0];
    const enHead = s.match(/<div lang="en">\s*<h1>[^<]*<\/h1>\s*<p class="when">[^<]*<\/p>/)[0];
    const zh = fs.readFileSync(path.join(ROOT, 'legal', 'src', doc + '.zh-Hant.html'), 'utf8').trim();
    const en = fs.readFileSync(path.join(ROOT, 'legal', 'src', doc + '.en.html'), 'utf8').trim();
    const nav = REGIONS.filter(x => x.code !== 'tw').map(x => '<li><a href="legal/' + x.code + '/' + doc + '.html">' + x.name + '</a></li>').join('');
    const out = head + when + '\n\n' + zh + '\n\n<h2 id="regions">其他地區的版本 · Other regions</h2>\n<p>本頁是臺灣版（附英文）。其他地區依當地法律另寫了版本（初稿，尚待律師審閱）：<span lang="en"> This page is the version for Taiwan. Versions written for other regions (drafts awaiting legal review):</span></p>\n<ul class="regions">' + nav + '</ul>\n\n<hr>\n\n' + enHead + '\n' + en + '\n</div>\n</main>\n</body>\n</html>\n';
    fs.writeFileSync(f, out.replace('</style>', s.includes('.regions {') ? '</style>' : '.regions { display: flex; flex-wrap: wrap; gap: .4rem .9rem; padding: 0; list-style: none; }\n</style>'));
  }
}
module.exports = { build, root, REGIONS };
if (require.main === module) { root(); console.log('legal: ' + build().length + ' pages'); }
