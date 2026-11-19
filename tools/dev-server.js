'use strict';
/* The game and its API on one local port, with a throwaway in-process database.
     node tools/dev-server.js [port]        (default 8770)
   Every start begins with an empty database. For local work and for the browser tests only. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const db = require('../server/db.js');
const app = require('../server/app.js');
db.use(require('./pglite-db.js').make());

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = /^\/api\/([a-z]+)$/.exec(url.pathname);
  if (m && m[1] === 'ws') { res.statusCode = 426; return res.end('websocket'); }
  if (m) {
    if (app.routes.indexOf(m[1]) < 0) { res.statusCode = 404; return res.end('not found'); }
    return app.handle(m[1], req, res);
  }
  // for the browser tests: what the database holds right now (this server only ever runs on a developer's machine)
  if (url.pathname === '/_dev/state') {
    const rows = sql => db.get().query(sql).then(r => r, () => []);
    return Promise.all([
      rows("SELECT id, name, ver, (state->>'coins')::int AS coins, (state->'tot'->>'games')::int AS games FROM zz.players ORDER BY made, id"),
      rows('SELECT code, cardinality(ks) > 1 AS paired, cardinality(ks) AS seats, cap, exp FROM zz.rooms ORDER BY code'),
      rows('SELECT room, dst, src, n, body FROM zz.post ORDER BY room, dst, src, n')
    ]).then(([players, rooms, mail]) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ players, rooms, mail })); });
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end('no'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    // the same content policy the real site sends, so the browser tests run under it too
    try { const csp = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers.find(h => h.key === 'Content-Security-Policy'); if (csp && !/[?&]csp=off/.test(req.url)) res.setHeader('Content-Security-Policy', csp.value); } catch (e) { /* no policy yet */ }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  });
});
require('../server/ws.js').attach(server, { path: '/api/ws' });      // the WebSocket lane for online matches
const port = +process.argv[2] || +process.env.PORT || 8770;
server.listen(port, '127.0.0.1', () => console.log('轉磚 dev server: http://127.0.0.1:' + port + '/  (API with an in-memory database)'));
