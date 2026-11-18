'use strict';
// Vercel turns this file into the function behind /api/rpc. All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('rpc', req, res);
