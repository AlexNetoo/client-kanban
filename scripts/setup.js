'use strict';
// Creates .env with hashed passwords and a random session secret.
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
  const owner = await ask('Freelancer password (min 10 chars): ');
  if (owner.length < 10) { console.error('Password too short.'); return rl.close(); }
  const client = await ask('Client password (optional, Enter to skip): ');
  rl.close();
  const lines = [
    `APP_PASSWORD_HASH=${hashPassword(owner)}`,
    `CLIENT_PASSWORD_HASH=${client ? hashPassword(client) : ''}`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}`,
    'PORT=3000',
    'SESSION_HOURS=12',
    '',
  ];
  fs.writeFileSync(envFile, lines.join('\n'), { mode: 0o600 });
  console.log('Wrote .env (passwords stored as scrypt hashes). Start with: npm run dev');
})();
