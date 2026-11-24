'use strict';
// Vercel turns this file into the function behind /internal/entitlements/v1/events (vercel.json). All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('entitle', req, res);
