# Alex Neto - Client Portal

A small, password-protected kanban for an admin (freelancer) to manage projects and share progress with designers and clients.

- **Dashboard** of projects (client, status, due date, progress), with create / edit / archive / delete.
- **Kanban board** per project: Backlog, To do, In progress, In review, Done. Create, edit, delete and move tasks by drag-and-drop **or** the "Move to…" select on each card (keyboard / touch friendly).
- **Client view**: progress, task stages and per-task updates. It never includes private notes.
- **Private notes vs client updates**: each task has a *Client-visible update* (blue, eye icon) and *Private notes* (dashed amber, lock icon, owner only).
- Starts **empty**: no sample data. To try it with demo content, set `SEED_DEMO_DATA=true` before the very first start (it only fills a brand-new, empty database, and never refills one you have emptied).

The server has zero npm dependencies. The UI is React + TypeScript built with Vite and styled with [Halaska UI](https://ui.halaska.com) (`client/src/halaska-kit.jsx`, grayscale accent) set in **Suisse Int'l**. The built UI is committed in `web/`, so you only need Node to run it. Requires Node 18.11+ (developed on Node 19).

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
| `ANTHROPIC_API_KEY` | no | Turns on the **AI assistant** for the admin and designers. Leave unset to keep it off. Optional: `AI_MODEL` (default `claude-sonnet-5-5`) |
| `OLLAMA_MODEL` | no | Runs the **AI assistant** on a model on your own computer through [Ollama](https://ollama.com) (for example `llama3.1`). Optional: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`, this computer only), `AI_PROVIDER` (`anthropic` or `ollama`, to choose when both are set) |
| `TRUST_PROXY` | no | `true` if behind a proxy that sets `X-Forwarded-For` (used for login rate limiting) |

`.env` and `data/` are git-ignored. Never commit them.

## Intro, hero background and demo

- **Intro:** on the first visit of a browser session the page opens with the Alex Neto intro (mark scales in, the name rises word by word, the panel lifts away), the same timeline as alexneto.com (`client/src/intro.ts`, plain Web Animations, no library). `public/boot.js` skips it for the rest of the session and for visitors who prefer reduced motion.
- **Hero background:** the sign-in page has the alexneto.com hero background behind the form: fine drifting lines that bend around the pointer, drawn in the theme's ink colour, paused off-screen and static for reduced motion (`client/src/HeroBackground.tsx`).
- **Sign-in tabs:** **Client** is the default tab, **Designer** the second. The **Demo** button next to **Sign in** opens `/demo`.
- **Demo (`/demo`):** a sample client project, *Website redesign & development* for a fictional studio, with 17 tasks across all five columns, linked tasks, client updates and a conversation. It behaves like a client account (read-only board, comments allowed) but is answered entirely in the browser (`client/src/demo.ts`): no account, no server data, nothing saved, and a reload resets it. The `/demo` page itself grants no access; every real API call still needs a real login.

## Font (Suisse Int'l)

The interface is set in Suisse Int'l (Swiss Typefaces), self-hosted as three WOFF2 cuts, **Regular, Book and Medium only**, in `client/src/assets/fonts/suisse-intl-{regular,book,medium}.woff2`. The app's weights map onto them: 400 and lighter use Regular, 450–599 (labels, buttons, chips) use Book, and 600 and heavier (titles, headings, numbers) use Medium; font synthesis is off so no bold is ever faked. **These licensed files are deliberately not in git** (they are git-ignored), so the public repo doesn't redistribute them; the build copies them to `web/assets/fonts/`, which is also git-ignored but is uploaded when you deploy. A few decorative symbols (▲ ◆ ▼ ✕ ☰) aren't in the font and use the system's. Check that your Suisse licence covers web use before publishing the site.

- **Rebuilding on a machine without the files:** copy the three WOFF2 files into `client/src/assets/fonts/` first (they were made by subsetting the licensed OTFs to Latin + the symbols the UI uses). Without them the build fails.
- **Deploying:** pushes to GitHub do **not** deploy automatically (`vercel.json` turns that off), because a build from git wouldn't contain the font. Deploy with `vercel deploy --prod`; `.vercelignore` makes sure the font is uploaded and secrets are not.

## Accounts and signing in

Creating, editing, archiving and deleting **projects is admin-only**: designers and clients get a 403 from the server, and the buttons aren't shown to them.

There are three kinds of user, each with its own way in:

- **Admin** signs in at **`/admin`** with the admin password (`APP_PASSWORD_HASH`). The admin console lets you create **designer** and **client** accounts, reset their passwords (with a password generator and a one-time reveal), edit which projects a client can see, delete users, and archive or delete any project (deleting asks you to type the project name). The admin also uses the whole app: dashboard, boards, task view, comments, links and attachments.
- **Designers** sign in at `/designer` (a separate page, not linked from the client login) with an email and password.
- **Clients** sign in at `/login` with an email and password. They get the same layout as designers (side menu, project dashboard, boards, the full task view) for **only the projects the admin assigned to them**, but **read-only**: they can look at the board and tasks and **add comments**, nothing else.

An account only works on its own tab, emails are unique across designers and clients, and a client can't open a project that isn't assigned to them. There is no public way to reach the admin sign-in other than knowing `/admin`.

**Protecting the admin account:** the password exists only as a scrypt hash in the environment. Admin sign-in locks after 5 wrong passwords (15 minutes, also with a global limit against distributed guessing), and every admin session is tied to the current password hash, so **changing `APP_PASSWORD_HASH` signs out every existing admin session**. Resetting or deleting a designer or client signs them out immediately.

After signing in, admins and designers get a side menu (all projects, a list of projects, Admin console for the admin, Settings; a drawer on phones). Settings has appearance (system/light/dark), account info and change password for designers.

Clicking a task opens a wide scrollable view with the description, attachments, linked tasks, client update, private notes (admin only), comments and a details panel (status, assignee, priority, due date) that the admin can edit in place.

## Comments: internal or shared with the client

Every comment is either **Internal** (admin and designers only) or **Shared with client**. Admin and designers choose with the **Share with client** checkbox when they post (off by default, so nothing is shared by accident); each comment shows a badge saying which it is. A client's own comments are always shared. Clients see only shared comments, plus the task's description, status, priority, due date, assignee, the client-visible update and links to tasks in their projects. They never see **private notes**, **internal comments** or **internal attachments** (files are internal unless shared), and can't change anything. Authors come from the signed-in account, never from the request. Everyone can delete only their own comments; the admin can delete any.

## Linked tasks

Open a task and use **Link a task** to relate it to any other task, in this or another project: *relates to*, *blocks* / *is blocked by*, *duplicates* / *is duplicated by*. A link is stored once and shown on both tasks with the matching wording. Each open task has its own address (`#/p/<project>/t/<task>`), so links open that task, Back closes it, and **Copy link** shares it. Only the admin can add or remove links. Designers and clients see links only to tasks in projects they can open. Deleting a task or project removes its links.

## Attachments

Open a task and use **Add files** (or drop files) in the Attachments section. Up to 20 files per task, 25 MB each (`ATTACH_MAX_MB`). Executable types (`.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.msi`, `.dll`, `.vbs`, `.ps1`, `.jar`) are refused.

- **Who:** the admin on any task; a designer on tasks assigned to them. Designers can remove only their own uploads and can open files only in projects they can access.
- **Sharing with clients:** every file is **internal** unless shared. Tick **Share new files with the client** before uploading, or use **Share with client / Make internal** on any file. The admin can change any file; a designer only files they uploaded. Clients see (read-only) just the shared files on tasks in their projects and can download them; an internal file doesn't exist for them (404). Clients can't upload, share or delete. Each file shows an *Internal* or *Shared with client* badge to the team.
- **On Vercel** the browser uploads straight to the private Blob store with a short-lived URL signed for exactly one path and size limit, so large files don't pass through (or hit the size cap of) a serverless function. Downloads are authorised by the app and then redirected to a signed URL that expires in 2 minutes. Files are always served as downloads.
- **Locally** files are stored under `data/uploads/` and streamed through the server.
- Uploads that never finish are dropped after an hour; deleting a task or project deletes its files.
- Image thumbnails are shown for PNG, JPEG, GIF and WebP only (never SVG, which can carry scripts).

## Designer logins

Designers sign in at `/designer` with an email and password. The admin creates them in the **Admin console** (name, optional role, login email and a password of 10+ characters) and shares the password privately. A designer can then change it under **Change password**.

What a designer can do, enforced on the server:
- See only projects where a task is assigned to them, never archived ones.
- Add tasks to their projects (no private notes or client updates), edit and move any task in them (title, description, status, priority, due date, assignee; delete them, but never private notes or client updates), and comment on tasks in their projects. The comment author always comes from their login.
- Delete only their own comments.

What they never get: private notes, client share links, the client view, or any create/edit/delete of projects, tasks or team members.

Changing a designer's password or email, removing their login, or deleting them signs them out immediately (sessions are re-checked on every request). Passwords are scrypt hashes; failed sign-ins are rate limited per IP and per email.

## Client accounts

Create a client in **Admin console → Clients**: name, company, login email, a password (or **Generate**), and tick the projects they may see. Edit the ticked projects any time; access changes immediately, archiving a project hides it from its clients, and deleting a client or resetting their password signs them out at once. Each project also still has an unguessable link token used by the admin's **Client view** preview (the old summary page); **More → Reset client link** invalidates it.

Upgrading from the old shared client password: that password (`CLIENT_PASSWORD_HASH`) is no longer used. Create a client account for each client instead.

## Storage

Two backends, chosen automatically:

- **Local file (default for `npm start` / `npm run dev`)**: one JSON file at `DATA_FILE` (default `./data/db.json`), written atomically. A missing file starts as an empty database (sample projects only if `SEED_DEMO_DATA=true`); deleting the file resets everything.
- **Vercel Blob (private store)**: used whenever `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`) is present, which is what connecting a Blob store to the project sets. The whole database is one private JSON blob (`BLOB_DB_PATH`, default `client-kanban/db.json`). Every request reads the latest copy and writes back conditionally on its ETag, so two serverless instances can't overwrite each other: a conflicting write is detected and the step is retried on fresh data. Set `STORAGE=file` to force the file backend.

Set up persistence on Vercel (once):

```bash
vercel storage create client-kanban-data --type blob --access private
vercel storage connect client-kanban-data -e production -y   # OIDC credentials: no long-lived secret
vercel deploy --prod
```

The first request after connecting creates an empty database blob. Back it up by downloading `client-kanban/db.json` from the store (`vercel blob get client-kanban/db.json`). It contains password hashes and private notes, so keep the store private.

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

## AI assistant

Admins and designers get an **AI assistant** button on every project board. It can break a project into tasks, write task descriptions, tidy titles and priorities, and edit existing tasks. It only *proposes* changes: each one is shown with a checkbox, and the browser applies the ticked ones through the normal task API, so a designer's limits (no private notes, no client updates) still hold. The assistant is sent the project, its tasks and the designer names. It is never sent private notes, client updates, comments or attachments. Requests run on the server (`server/ai.js`) after the data transaction ends, are limited to 30 an hour per person, and are switched off until `ANTHROPIC_API_KEY` is set.

## Links

URLs in task descriptions, client updates and comments become clickable links that open in a new tab (Figma links included).

### Using Ollama (on your own computer only)

1. Install Ollama (`brew install ollama`, then `brew services start ollama` to keep it running) and pull a model, for example `ollama pull qwen2.5:7b`. Larger models plan tasks much better than small ones.
2. Add `OLLAMA_MODEL=qwen2.5:7b` (or the model you pulled) to your local `.env` file and run the app with `npm start`. Keep Ollama running.
3. The **AI assistant** button now answers using the local model. Nothing leaves your computer.

Ollama is deliberately limited to `localhost`: a deployed site (Vercel) can't reach your computer, and the app refuses any other Ollama address so a server can never be pointed at an open Ollama by mistake. If both `ANTHROPIC_API_KEY` and `OLLAMA_MODEL` are set, Anthropic is used unless `AI_PROVIDER=ollama`.

## Emerald timesheet (`/emerald`)

A password-protected timesheet for the admin (it uses the admin password, so the admin session also opens it; designers and clients can't). Pick a month, then type the hours worked (quarter hours are fine, for example `1.5`) and a note about what was done for each day. Entries save by themselves. Each week and the month show the hours and the amount at **€30 per hour** (`TIMESHEET_RATE` in `server/validate.js`). Days outside the month and weekends are greyed out. **Print** produces a clean copy (or a PDF). Data lives in the same database as everything else.

## Email notifications

Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified in [Resend](https://resend.com)) to turn on email. Without them nothing is sent in production, and in development each email is printed to the terminal.

| Email | When |
|---|---|
| Welcome | The admin creates a designer or client with *Send a welcome email* ticked. The person gets a link (valid 7 days) to choose their own password, so no password has to be shared. |
| Password reset | *Forgot your password?* on the sign-in pages (`/forgot`). The link works for one hour and once. The answer is the same whether or not the email has an account. |
| Project approved | The admin approves a client's project request. |
| Task due today | A daily job (`/api/cron/reminders`, 07:00 UTC, set in `vercel.json`) emails the assigned designer, and each client of the project, about open tasks due today. Needs `CRON_SECRET` (Vercel sends it automatically). Each task is reminded once per due date. Time zone: `REMINDER_TZ` (default `Europe/Lisbon`). |

Designers and clients can switch reminders and project updates off in **Settings**. Optional: `PUBLIC_URL` (the address used in links; defaults to the Vercel production domain).
