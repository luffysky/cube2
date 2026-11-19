// Vercel turns this file into the function behind /api/ws, which holds WebSocket connections open for online
// matches (see server/ws.js). Anything that is not a WebSocket gets a short answer.
// This one file is an ES module because that is the form Vercel's WebSocket support is documented for: the default
// export is the server itself. (Written the CommonJS way, plain requests arrived here but upgrades never did.)
import http from 'node:http';
import lane from '../server/ws.js';

const server = http.createServer((req, res) => {
  res.statusCode = 426;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: false, why: 'websocket' }));
});
lane.attach(server);
export default server;
