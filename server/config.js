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

/**
 * AI assistant (optional). Provider "anthropic" needs ANTHROPIC_API_KEY. Provider "ollama" talks to a model on this computer:
 * set OLLAMA_MODEL (and OLLAMA_BASE_URL if it isn't http://localhost:11434). Ollama is only allowed on a loopback address,
 * so a deployed site can never be pointed at an open Ollama server by mistake. With neither set the assistant is off.
 */
function aiConfig(env) {
  const off = { provider: '', enabled: false };
  const provider = env.AI_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OLLAMA_MODEL ? 'ollama' : '');
  if (provider === 'anthropic') {
    return { provider, enabled: !!env.ANTHROPIC_API_KEY, key: env.ANTHROPIC_API_KEY || '', model: env.AI_MODEL || 'claude-sonnet-5-5', baseUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '') };
  }
  if (provider === 'ollama') {
    // "localhost" can resolve to IPv6 first while Ollama listens on IPv4 only, so it is mapped to 127.0.0.1
    const baseUrl = (env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '').replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, '$1127.0.0.1');
    let host = '';
    try { host = new URL(baseUrl).hostname; } catch { /* invalid */ }
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) { console.warn('OLLAMA_BASE_URL must point at this computer (localhost). The AI assistant is off.'); return off; }
    return { provider, enabled: !!env.OLLAMA_MODEL, model: env.OLLAMA_MODEL || '', baseUrl };
  }
  return off;
}

/**
 * Email (optional). RESEND_API_KEY + EMAIL_FROM send real email through Resend. PUBLIC_URL is the address used in email links
 * (on Vercel it falls back to the project's production domain). CRON_SECRET protects the daily reminder job.
 */
function mailConfig(env) {
  const fromVercel = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
  const apiKey = env.RESEND_API_KEY || '';
  const production = env.NODE_ENV === 'production' || !!env.VERCEL;
  return {
    mode: apiKey && env.EMAIL_FROM ? 'resend' : production ? 'off' : 'log',
    apiKey, from: env.EMAIL_FROM || '',
    publicUrl: (env.PUBLIC_URL || fromVercel).replace(/\/+$/, ''),
    cronSecret: env.CRON_SECRET || '',
    timeZone: env.REMINDER_TZ || 'Europe/Lisbon',
  };
}

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
    attachMaxBytes: (Number(env.ATTACH_MAX_MB) || 25) * 1024 * 1024,
    seedDemo: env.SEED_DEMO_DATA === 'true', // opt-in: fills an EMPTY database with sample projects, tasks and designers
    blobPath: env.BLOB_DB_PATH || 'client-kanban/db.json',
    secureCookies: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
    trustProxy: bool(env.TRUST_PROXY, false),
    // The /emerald timesheet is its own small site with its own sign-in. It uses the admin password unless EMERALD_PASSWORD_HASH is set.
    emeraldHash: env.EMERALD_PASSWORD_HASH || '',
    ai: aiConfig(env),
    mail: mailConfig(env),
  };
}

module.exports = { mailConfig, aiConfig, loadConfig, loadDotEnv, ROOT };
