'use strict';
// Vercel entry point: wraps the same request handler used by `npm start`.
// Vercel's filesystem is read-only except /tmp, so data lives in /tmp/db.json:
// it is reseeded whenever the function instance is recycled. Fine for a demo,
// not for real client data (see README).
const { createApp } = require('../server/index');
const { loadConfig } = require('../server/config');

let server;
module.exports = (req, res) => {
  if (!server) {
    server = createApp(loadConfig({ ...process.env, DATA_FILE: process.env.DATA_FILE || '/tmp/db.json', COOKIE_SECURE: 'true', TRUST_PROXY: 'true' })).server;
  }
  server.emit('request', req, res);
};
