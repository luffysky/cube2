'use strict';
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let html = src('index.template.html');
const parts = { CSS: 'style.css', ENGINE: 'engine.js', HANS: 'hans-map.js', I18N: 'i18n.js', BOT: 'bot.js', DRILLS: 'drills.js', OPENERS: 'openers.js', META: 'meta.js',
  SFX: 'sfxdata.js', VIEW: 'view.js', REPLAY: 'replay.js', UI: 'ui.js', NET: 'net.js', MODES: 'modes.js', SHOP: 'shop.js' };
for (const [k, f] of Object.entries(parts)) {
  const body = src(f);
  if (body.includes('</script')) throw new Error(f + ' contains a closing script tag');
  const mark = '/*__' + k + '__*/';
  if (!html.includes(mark)) throw new Error('missing marker ' + mark);
  html = html.split(mark).join(body.trim());
}
// The page is written to the project root so GitHub Pages can serve the repository as it is. Music sits beside it in audio/.
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('built index.html', (html.length / 1024).toFixed(1) + ' KB');
