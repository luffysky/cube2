'use strict';
// Vercel turns this file into the function behind /.well-known/sync-jwks.json (vercel.json). All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('syncJwks', req, res);
