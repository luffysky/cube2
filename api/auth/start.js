'use strict';
// /api/auth/start: "connect to SnowRealm Games" (server/bff.js). All of the work is in server/app.js.
const { handle } = require('../../server/app.js');
module.exports = (req, res) => handle('authStart', req, res);
