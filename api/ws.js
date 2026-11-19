'use strict';
// Vercel turns this file into the function behind /api/ws, which holds WebSocket connections open for online
// matches (see server/ws.js). Anything that is not a WebSocket gets a short answer.
const http = require('http');
const server = http.createServer((req, res) => {
  res.statusCode = 426;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: false, why: 'websocket' }));
});
require('../server/ws.js').attach(server);
module.exports = server;
