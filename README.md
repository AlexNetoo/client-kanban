# Project Hub — client kanban

A small, password-protected kanban for an admin (freelancer) to manage projects and share progress with designers and clients.

- **Dashboard** of projects (client, status, due date, progress), with create / edit / archive / delete.
- **Kanban board** per project: Backlog, To do, In progress, In review, Done. Create, edit, delete and move tasks by drag-and-drop **or** the "Move to…" select on each card (keyboard / touch friendly).
- **Client view**: progress, task stages and per-task updates. It never includes private notes.
- **Private notes vs client updates**: each task has a *Client-visible update* (blue, eye icon) and *Private notes* (dashed amber, lock icon, owner only).
- Seeded with four realistic sample projects on first launch.

The server has zero npm dependencies. The UI is React + TypeScript built with Vite and styled with [Halaska UI](https://ui.halaska.com) (`client/src/halaska-kit.jsx`, grayscale accent, Manrope font bundled locally). The built UI is committed in `web/`, so you only need Node to run it. Requires Node 18.11+ (developed on Node 19).

## Setup

```bash
npm run setup   # asks for the admin password, writes .env (hashed) with a random SESSION_SECRET
npm run dev     # http://localhost:3000   (npm start for no file-watching)
npm test        # API/auth tests
npm run build:web   # only after editing client/ : rebuilds the UI into web/
npm run dev:web     # optional Vite dev server on :5173 (proxies /api to :3000)
```

### Environment variables (`.env`, see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD_HASH` | yes | scrypt hash of the **admin** password (sign in at `/admin`) |
| `SESSION_SECRET` | yes | 32+ random chars; signs session cookies |
| `PORT` | no | default `3000` |
| `SESSION_HOURS` | no | session lifetime, default `12` |
| `DATA_FILE` | no | default `./data/db.json` (file backend) |
| `BLOB_STORE_ID` | on Vercel | set by connecting a Blob store; switches storage to Vercel Blob |
| `ATTACH_MAX_MB` | no | max attachment size in MB, default `25` |
| `BLOB_DB_PATH` / `STORAGE` | no | blob pathname (default `client-kanban/db.json`) / `file` to force the file backend |
| `COOKIE_SECURE` | no | defaults to true when `NODE_ENV=production`; keep it on behind HTTPS |
| `TRUST_PROXY` | no | `true` if behind a proxy that sets `X-Forwarded-For` (used for login rate limiting) |

`.env` and `data/` are git-ignored. Never commit them.

## Accounts and signing in

There are three kinds of user, each with its own way in:

- **Admin** signs in at **`/admin`** with the admin password (`APP_PASSWORD_HASH`). The admin console lets you create **designer** and **client** accounts, reset their passwords (with a password generator and a one-time reveal), edit which projects a client can see, delete users, and archive or delete any project (deleting asks you to type the project name). The admin also uses the whole app: dashboard, boards, task view, comments, links and attachments.
- **Designers** sign in at `/login` on the **Designer** tab with an email and password.
- **Clients** sign in at `/login` on the **Client** tab with an email and password. They get the same layout as designers (side menu, project dashboard, boards, the full task view) for **only the projects the admin assigned to them**, but **read-only**: they can look at the board and tasks and **add comments**, nothing else.

An account only works on its own tab, emails are unique across designers and clients, and a client can't open a project that isn't assigned to them. There is no public way to reach the admin sign-in other than knowing `/admin`.

**Protecting the admin account:** the password exists only as a scrypt hash in the environment. Admin sign-in locks after 5 wrong passwords (15 minutes, also with a global limit against distributed guessing), and every admin session is tied to the current password hash, so **changing `APP_PASSWORD_HASH` signs out every existing admin session**. Resetting or deleting a designer or client signs them out immediately.

After signing in, admins and designers get a side menu (all projects, a list of projects, Admin console for the admin, Settings; a drawer on phones). Settings has appearance (system/light/dark), account info and change password for designers.

Clicking a task opens a wide scrollable view with the description, attachments, linked tasks, client update, private notes (admin only), comments and a details panel (status, assignee, priority, due date) that the admin can edit in place.

## Comments: internal or shared with the client

Every comment is either **Internal** (admin and designers only) or **Shared with client**. Admin and designers choose with the **Share with client** checkbox when they post (off by default, so nothing is shared by accident); each comment shows a badge saying which it is. A client's own comments are always shared. Clients see only shared comments, plus the task's description, status, priority, due date, assignee, the client-visible update and links to tasks in their projects. They never see **private notes**, **internal comments** or **attachments**, and can't change anything. Authors come from the signed-in account, never from the request. Everyone can delete only their own comments; the admin can delete any.

## Linked tasks

Open a task and use **Link a task** to relate it to any other task, in this or another project: *relates to*, *blocks* / *is blocked by*, *duplicates* / *is duplicated by*. A link is stored once and shown on both tasks with the matching wording. Each open task has its own address (`#/p/<project>/t/<task>`), so links open that task, Back closes it, and **Copy link** shares it. Only the admin can add or remove links. Designers and clients see links only to tasks in projects they can open. Deleting a task or project removes its links.

## Attachments

Open a task and use **Add files** (or drop files) in the Attachments section. Up to 20 files per task, 25 MB each (`ATTACH_MAX_MB`). Executable types (`.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.msi`, `.dll`, `.vbs`, `.ps1`, `.jar`) are refused.

- **Who:** the admin on any task; a designer on tasks assigned to them. Designers can remove only their own uploads and can open files only in projects they can access. **Clients never see attachments.**
- **On Vercel** the browser uploads straight to the private Blob store with a short-lived URL signed for exactly one path and size limit, so large files don't pass through (or hit the size cap of) a serverless function. Downloads are authorised by the app and then redirected to a signed URL that expires in 2 minutes. Files are always served as downloads.
- **Locally** files are stored under `data/uploads/` and streamed through the server.
- Uploads that never finish are dropped after an hour; deleting a task or project deletes its files.
- Image thumbnails are shown for PNG, JPEG, GIF and WebP only (never SVG, which can carry scripts).

## Designer logins

Designers sign in on the **Designer** tab of the login page with an email and password. The admin creates them in the **Admin console** (name, optional role, login email and a password of 10+ characters) and shares the password privately. A designer can then change it under **Change password**.

What a designer can do, enforced on the server:
- See only projects where a task is assigned to them, never archived ones.
- Move tasks assigned to them between columns (status/position only), and comment on tasks in their projects. The comment author always comes from their login.
- Delete only their own comments.

What they never get: private notes, client share links, the client view, or any create/edit/delete of projects, tasks or team members.

Changing a designer's password or email, removing their login, or deleting them signs them out immediately (sessions are re-checked on every request). Passwords are scrypt hashes; failed sign-ins are rate limited per IP and per email.

## Client accounts

Create a client in **Admin console → Clients**: name, company, login email, a password (or **Generate**), and tick the projects they may see. Edit the ticked projects any time; access changes immediately, archiving a project hides it from its clients, and deleting a client or resetting their password signs them out at once. Each project also still has an unguessable link token used by the admin's **Client view** preview (the old summary page); **More → Reset client link** invalidates it.

Upgrading from the old shared client password: that password (`CLIENT_PASSWORD_HASH`) is no longer used. Create a client account for each client instead.

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

- Sign-out clears the cookie but a copied cookie stays valid until it expires, except that changing the admin password, or resetting/deleting a designer or client, revokes their sessions immediately.
- No email invites or password-reset emails: the admin sets and resets passwords.
- Rate limiting is per process and in memory, so on serverless it is per instance (best effort). The whole database is one document: fine for a freelancer-sized team, not for heavy concurrent writing.
- No real-time sync between browser tabs, no file attachments, no per-client passwords (one client password for all clients; isolation is by link token).
