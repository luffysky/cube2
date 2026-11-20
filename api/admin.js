'use strict';
// /internal/admin/v1/* (rewritten here by vercel.json). All of the work is in server/admin.js and server/app.js.
const { handle } = require('../server/app.js');
module.exports = (req, res) => handle('admin', req, res);
