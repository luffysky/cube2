'use strict';
/* The game and its API on one local port, with a throwaway in-process database.
     node tools/dev-server.js [port]        (default 8770)
   Every start begins with an empty database. For local work and for the browser tests only. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const db = require('../server/db.js');
const app = require('../server/app.js');
db.use(require('./pglite-db.js').make());

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = /^\/api\/([a-z]+)$/.exec(url.pathname);
  if (m) {
    if (app.routes.indexOf(m[1]) < 0) { res.statusCode = 404; return res.end('not found'); }
    return app.handle(m[1], req, res);
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end('no'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  });
});
const port = +process.argv[2] || +process.env.PORT || 8770;
server.listen(port, '127.0.0.1', () => console.log('轉磚 dev server: http://127.0.0.1:' + port + '/  (API with an in-memory database)'));
