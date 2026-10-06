# Project Hub — client kanban

A small, password-protected kanban for a freelancer to manage projects and share progress with clients.

- **Dashboard** of projects (client, status, due date, progress), with create / edit / archive / delete.
- **Kanban board** per project: Backlog, To do, In progress, In review, Done. Create, edit, delete and move tasks by drag-and-drop **or** the "Move to…" select on each card (keyboard / touch friendly).
- **Client view**: progress, task stages and per-task updates. It never includes private notes.
- **Private notes vs client updates**: each task has a *Client-visible update* (blue, eye icon) and *Private notes* (dashed amber, lock icon, owner only).
- Seeded with four realistic sample projects on first launch.

Zero npm dependencies. Requires Node 18.11+ (developed on Node 19).

## Setup

```bash
npm run setup   # asks for passwords, writes .env (hashed) with a random SESSION_SECRET
npm run dev     # http://localhost:3000   (npm start for no file-watching)
npm test        # API/auth tests
```

### Environment variables (`.env`, see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD_HASH` | yes | scrypt hash of the freelancer password (full access) |
| `SESSION_SECRET` | yes | 32+ random chars; signs session cookies |
| `CLIENT_PASSWORD_HASH` | no | scrypt hash of a client password (read-only). Without it clients cannot sign in |
| `PORT` | no | default `3000` |
| `SESSION_HOURS` | no | session lifetime, default `12` |
| `DATA_FILE` | no | default `./data/db.json` |
| `COOKIE_SECURE` | no | defaults to true when `NODE_ENV=production`; keep it on behind HTTPS |
| `TRUST_PROXY` | no | `true` if behind a proxy that sets `X-Forwarded-For` (used for login rate limiting) |

`.env` and `data/` are git-ignored. Never commit them.

## Sharing with clients

Open a project → **Client view** → **More → Copy client link**. Give the client the link and the client password.
Each link carries an unguessable token for one project; a client session can open only links it is given and cannot call any owner endpoint, so clients cannot see each other's projects. **More → Reset client link** invalidates a link. Archiving a project also hides it from clients.

The owner password also opens client views (shown with a preview banner).

## Storage

A single JSON file (`DATA_FILE`), written atomically (temp file + rename). The seed is created if the file doesn't exist; delete the file to reseed. Suitable for one freelancer and tens of projects. On hosts with ephemeral disks (e.g. serverless), point `DATA_FILE` at a persistent volume or swap `server/store.js` for a database.

## Security notes

- Server-side checks on every `/api/*` route (401 unauthenticated, 403 wrong role). App pages redirect to `/login` without a session; only the login assets are public.
- Passwords: scrypt with per-hash salt, constant-time comparison. Session: HMAC-signed, HttpOnly, SameSite=Strict cookie with absolute expiry; sign-out clears it.
- Login is rate limited per IP (10 failures / 15 min, in memory).
- Mutations require same-origin and JSON; CSP forbids inline scripts/styles; all UI text is rendered via `textContent`.

## Layout

```
server/   index.js (routes, static, auth guard) · auth.js · store.js · validate.js · seed.js · config.js
web/      login.html · index.html · css/styles.css · js/{app,dashboard,board,client,dialogs,dom,api,login}.js
scripts/  setup.js      test/  api.test.js
```

## Limitations

- Sessions are stateless: sign-out clears the cookie but a copied cookie stays valid until it expires (rotate `SESSION_SECRET` to revoke all).
- Rate limiting is per process and in memory; single-process storage (no concurrent writers).
- No real-time sync between browser tabs, no file attachments, no per-client passwords (one client password for all clients; isolation is by link token).
