'use strict';
// Creates .env with the admin password (stored only as a scrypt hash) and a random session secret.
// Designer and client accounts are created later, in the Admin console at /admin.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { hashPassword } = require('../server/auth');

const envFile = path.join(__dirname, '..', '.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  if (fs.existsSync(envFile)) {
    const a = (await ask('.env already exists. Overwrite? (y/N) ')).trim().toLowerCase();
    if (a !== 'y') return rl.close();
  }
  const admin = await ask('Admin password (min 10 chars): ');
  rl.close();
  if (admin.length < 10) { console.error('Password too short.'); return; }
  const lines = [
    `APP_PASSWORD_HASH=${hashPassword(admin)}`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}`,
    'PORT=3000',
    'SESSION_HOURS=12',
    '',
  ];
  fs.writeFileSync(envFile, lines.join('\n'), { mode: 0o600 });
  console.log('Wrote .env (the password is stored as a scrypt hash). Start with: npm run dev, then sign in at /admin');
})();
