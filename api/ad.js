'use strict';
// Vercel turns this file into the function behind /api/ad: the rewarded-ad network's signed callback. All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('ad', req, res);
