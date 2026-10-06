'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Minimal .env reader (no dependency). Real environment variables win.
function loadDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const bool = (v, fallback) => (v === undefined || v === '' ? fallback : /^(1|true|yes)$/i.test(v));

function loadConfig(env = process.env) {
  const missing = [];
  if (!env.APP_PASSWORD_HASH) missing.push('APP_PASSWORD_HASH');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (32+ characters)');
  if (missing.length) {
    throw new Error(`Missing configuration: ${missing.join(', ')}. Run "npm run setup" to create a .env file.`);
  }
  return {
    port: Number(env.PORT) || 3000,
    ownerHash: env.APP_PASSWORD_HASH,
    clientHash: env.CLIENT_PASSWORD_HASH || '',
    secret: env.SESSION_SECRET,
    sessionMs: (Number(env.SESSION_HOURS) || 12) * 3600 * 1000,
    dataFile: path.resolve(ROOT, env.DATA_FILE || './data/db.json'),
    // Vercel Blob is used automatically when a store is connected (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN),
    // unless STORAGE=file forces the local file.
    storage: env.STORAGE === 'file' ? 'file' : (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN) ? 'blob' : 'file',
    blobPath: env.BLOB_DB_PATH || 'client-kanban/db.json',
    secureCookies: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
    trustProxy: bool(env.TRUST_PROXY, false),
  };
}

module.exports = { loadConfig, loadDotEnv, ROOT };
