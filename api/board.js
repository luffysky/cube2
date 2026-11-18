'use strict';
// Vercel turns this file into the function behind /api/board. All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('board', req, res);
