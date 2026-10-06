'use strict';
// Vercel entry point: wraps the same request handler used by `npm start`.
// Data lives in the connected Vercel Blob store (private) so it survives restarts and deploys. Without a
// connected store the fallback is /tmp/db.json, which Vercel wipes whenever an instance is recycled.
const { createApp } = require('../server/index');
const { loadConfig } = require('../server/config');

let server;
module.exports = (req, res) => {
  if (!server) {
    server = createApp(loadConfig({ ...process.env, DATA_FILE: process.env.DATA_FILE || '/tmp/db.json', COOKIE_SECURE: 'true', TRUST_PROXY: 'true' })).server;
  }
  server.emit('request', req, res);
};
