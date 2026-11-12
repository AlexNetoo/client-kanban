'use strict';
// Vercel entry point: wraps the same request handler used by `npm start`.
// Data lives in the connected Vercel Blob store (private) so it survives restarts and deploys. Without a
// connected store the fallback is /tmp/db.json, which Vercel wipes whenever an instance is recycled.
const { createApp } = require('../server/index');
const { loadConfig } = require('../server/config');

let server;
// neto.design was the portal's old address. The portal now lives at portal.alexneto.com, and the old domain sends
// visitors to the main site, alexneto.com (asked for in Nov 2026). The cron and other hosts are unaffected.
const OLD_HOST = /^(www\.)?neto\.design$/i;

module.exports = (req, res) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  if (OLD_HOST.test(host)) {
    res.statusCode = 308;
    res.setHeader('Location', 'https://www.alexneto.com/');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end();
    return;
  }
  if (!server) {
    server = createApp(loadConfig({ ...process.env, DATA_FILE: process.env.DATA_FILE || '/tmp/db.json', COOKIE_SECURE: 'true', TRUST_PROXY: 'true' })).server;
  }
  server.emit('request', req, res);
};
