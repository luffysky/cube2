'use strict';
// Vercel Cron calls this once a day (vercel.json). All of the work is in server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('cron', req, res);
