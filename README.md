# Project Hub — client kanban

A small, password-protected kanban for a freelancer to manage projects and share progress with clients.

- **Dashboard** of projects (client, status, due date, progress), with create / edit / archive / delete.
- **Kanban board** per project: Backlog, To do, In progress, In review, Done. Create, edit, delete and move tasks by drag-and-drop **or** the "Move to…" select on each card (keyboard / touch friendly).
- **Client view**: progress, task stages and per-task updates. It never includes private notes.
- **Private notes vs client updates**: each task has a *Client-visible update* (blue, eye icon) and *Private notes* (dashed amber, lock icon, owner only).
- Seeded with four realistic sample projects on first launch.

The server has zero npm dependencies. The UI is React + TypeScript built with Vite and styled with [Halaska UI](https://ui.halaska.com) (`client/src/halaska-kit.jsx`, grayscale accent, Manrope font bundled locally). The built UI is committed in `web/`, so you only need Node to run it. Requires Node 18.11+ (developed on Node 19).

## Setup

```bash
npm run setup   # asks for passwords, writes .env (hashed) with a random SESSION_SECRET
npm run dev     # http://localhost:3000   (npm start for no file-watching)
npm test        # API/auth tests
npm run build:web   # only after editing client/ : rebuilds the UI into web/
npm run dev:web     # optional Vite dev server on :5173 (proxies /api to :3000)
```

### Environment variables (`.env`, see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD_HASH` | yes | scrypt hash of the freelancer password (full access) |
| `SESSION_SECRET` | yes | 32+ random chars; signs session cookies |
| `CLIENT_PASSWORD_HASH` | no | scrypt hash of a client password (read-only). Without it clients cannot sign in |
| `PORT` | no | default `3000` |
| `SESSION_HOURS` | no | session lifetime, default `12` |
| `DATA_FILE` | no | default `./data/db.json` (file backend) |
| `BLOB_STORE_ID` | on Vercel | set by connecting a Blob store; switches storage to Vercel Blob |
| `BLOB_DB_PATH` / `STORAGE` | no | blob pathname (default `client-kanban/db.json`) / `file` to force the file backend |
| `COOKIE_SECURE` | no | defaults to true when `NODE_ENV=production`; keep it on behind HTTPS |
| `TRUST_PROXY` | no | `true` if behind a proxy that sets `X-Forwarded-For` (used for login rate limiting) |

`.env` and `data/` are git-ignored. Never commit them.

## Signing in and navigating

The login page has three tabs: **Freelancer** (the owner password), **Client** (the client password) and **Designer** (email + password). A password only works on its own tab. After signing in, freelancers and designers get a side menu (All projects, a list of projects, Team for the freelancer, Settings; it becomes a drawer on phones). Clients only see the project link they were given. Settings has appearance (system/light/dark, remembered in the browser), account info and, for designers, change password.

Clicking a task opens a wide scrollable view with the description, client update, private notes (freelancer only), comments and a details panel (status, assignee, priority, due date) that the freelancer can edit in place.

## Designer logins

Designers sign in on the **Designer** tab of the login page with an email and password. The freelancer creates them in **Team** (name, optional role, login email and a password of 10+ characters) and shares the password privately. A designer can then change it under **Change password**.

What a designer can do, enforced on the server:
- See only projects where a task is assigned to them, never archived ones.
- Move tasks assigned to them between columns (status/position only), and comment on tasks in their projects. The comment author always comes from their login.
- Delete only their own comments.

What they never get: private notes, client share links, the client view, or any create/edit/delete of projects, tasks or team members.

Changing a designer's password or email, removing their login, or deleting them signs them out immediately (sessions are re-checked on every request). Passwords are scrypt hashes; failed sign-ins are rate limited per IP and per email.

## Sharing with clients

Open a project → **Client view** → **More → Copy client link**. Give the client the link and the client password.
Each link carries an unguessable token for one project; a client session can open only links it is given and cannot call any owner endpoint, so clients cannot see each other's projects. **More → Reset client link** invalidates a link. Archiving a project also hides it from clients.

The owner password also opens client views (shown with a preview banner).

## Storage

Two backends, chosen automatically:

- **Local file (default for `npm start` / `npm run dev`)**: one JSON file at `DATA_FILE` (default `./data/db.json`), written atomically. The seed is created if the file doesn't exist; delete it to reseed.
- **Vercel Blob (private store)**: used whenever `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`) is present, which is what connecting a Blob store to the project sets. The whole database is one private JSON blob (`BLOB_DB_PATH`, default `client-kanban/db.json`). Every request reads the latest copy and writes back conditionally on its ETag, so two serverless instances can't overwrite each other: a conflicting write is detected and the step is retried on fresh data. Set `STORAGE=file` to force the file backend.

Set up persistence on Vercel (once):

```bash
vercel storage create client-kanban-data --type blob --access private
vercel storage connect client-kanban-data -e production -y   # OIDC credentials: no long-lived secret
vercel deploy --prod
```

The first request after connecting creates the blob with the sample data. Back it up by downloading `client-kanban/db.json` from the store (`vercel blob get client-kanban/db.json`). It contains password hashes and private notes, so keep the store private.

## Security notes

- Server-side checks on every `/api/*` route (401 unauthenticated, 403 wrong role). App pages redirect to `/login` without a session; only the login assets are public.
- Passwords: scrypt with per-hash salt, constant-time comparison. Session: HMAC-signed, HttpOnly, SameSite=Strict cookie with absolute expiry; sign-out clears it.
- Login is rate limited per IP (10 failures / 15 min, in memory).
- Mutations require same-origin and JSON; CSP forbids inline scripts (inline styles are allowed because the UI kit styles components inline); React escapes all rendered text.

## Layout

```
server/   index.js (routes, static, auth guard) · auth.js · store.js · validate.js · seed.js · config.js
client/   React + TS source (Vite). src/halaska-kit.jsx is the UI kit; views: Dashboard, Board, ClientView, dialogs
web/      built UI served by the server (generated by `npm run build:web`, committed)
api/      Vercel entry (wraps the same server)
scripts/  setup.js      test/  api.test.js
```

## Limitations

- Freelancer and client sessions are stateless: sign-out clears the cookie but a copied cookie stays valid until it expires (rotate `SESSION_SECRET` to revoke all). Designer sessions are revoked immediately (see above).
- No email invites or password-reset emails: the freelancer sets and resets designer passwords.
- Rate limiting is per process and in memory, so on serverless it is per instance (best effort). The whole database is one document: fine for a freelancer-sized team, not for heavy concurrent writing.
- No real-time sync between browser tabs, no file attachments, no per-client passwords (one client password for all clients; isolation is by link token).
