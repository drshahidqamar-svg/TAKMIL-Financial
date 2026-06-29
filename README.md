# TAKMIL — Financial Command Centre · Backend (PostgreSQL)

Cloud sync, logins, and role-based access for the TAKMIL financial model — added
without changing the approved frontend (one `<script>` tag aside). Built to match
your existing stack: **Node + PostgreSQL on Railway**.

---

## What you get

- **Logins** — email + password, hashed storage, signed session token (httpOnly cookie).
- **Roles** — `admin` (everything + manage team), `editor` (read/write), `viewer` (read-only UI).
- **Cloud sync** — the model lives in Postgres and is shared by the team. The
  frontend's old "save to browser" is transparently swapped for "save to cloud,"
  auto-saving 1.5s after any change, exactly as before.
- **Conflict protection** — atomic compare-and-set on a revision number. If two
  people save at once, the second gets a clear "reload first" message instead of
  silently overwriting.
- **Versions** — named server-side snapshots of the whole model, restorable.
- **Audit trail** — every save/restore logged server-side (who + when).

---

## How this differs from a from-scratch app

The whole financial model is stored as **one `JSONB` document**, not normalized
tables. That's deliberate: it mirrors exactly what the frontend already serializes
(`serializeD()`), so the backend was a drop-in for the old localStorage layer and
needs no data migration. Postgres handles JSONB very well, and you can query
inside it later if you ever want to.

The service also **serves its own frontend** from `public/` — one Railway service,
same domain for app + API, so no CORS and cookie auth "just works."

---

## Deploy on Railway

1. **Push this folder to a Git repo** (GitHub/GitLab) and create a Railway project
   from it — or `railway up` from the Railway CLI.

2. **Add the PostgreSQL plugin** to the project (New → Database → PostgreSQL).
   Railway exposes its connection string as `${{ Postgres.DATABASE_URL }}`.

3. **Set service Variables** on the app service:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
   | `JWT_SECRET` | a long random string (see below) |
   | `SECURE_COOKIES` | `true` |
   | `SEED_ADMIN_EMAIL` | your admin email |
   | `SEED_ADMIN_PASSWORD` | a strong temporary password |
   | `SEED_ADMIN_NAME` | your name |
   | `TOKEN_TTL` | `7d` (optional) |

   > Don't set `PORT` — Railway injects it automatically and the app reads it.

   Generate a secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. **Deploy.** On boot the app runs the schema migration and creates the admin +
   shared workspace automatically. Railway's build runs `npm install`; start
   command is `npm start` (from package.json).

5. Open the Railway URL, sign in with your seed admin, and **change the password
   immediately** (avatar menu → Change password). Then add teammates via
   avatar menu → Manage team.

The first time an editor/admin loads the app, the current default model is pushed
to Postgres as the starting point.

---

## Run locally

Needs Node 18+ and a Postgres you can reach.

```bash
npm install
cp .env.example .env     # set DATABASE_URL + JWT_SECRET
npm start                # runs migration + seed, then serves on :3000
```

`npm run migrate` runs the schema migration on its own if you ever want to.

---

## How it connects to the frontend

The approved `index.html` is served as-is from `public/`. The only change is one
line before `</body>`:

```html
<script src="takmil-cloud.js"></script>
```

`takmil-cloud.js` (the client bridge) gates the app behind login, overrides the
app's `saveToStorage` / `loadFromStorage` / `scheduleSave` to talk to the server
instead of localStorage (reusing the app's own `serializeD()` / `restoreD()`),
adds the user menu + admin team panel, and locks the UI to read-only for viewers.
Nothing in the financial logic changes. Because the cloud document is the same
shape as the old localStorage blob, an exported JSON backup imports cleanly.

---

## API reference

Auth via the `takmil_token` httpOnly cookie or `Authorization: Bearer <token>`.

### Auth
| Method | Path | Role | Body |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{email,password}` |
| POST | `/api/auth/logout` | any | — |
| GET | `/api/auth/me` | any | — |
| POST | `/api/auth/change-password` | any | `{currentPassword,newPassword}` |

### Model
| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| GET | `/api/model` | any | — | `{doc, rev, updated_at, canWrite}` |
| PUT | `/api/model` | editor/admin | `{doc, baseRev}` | `409` if `baseRev` is stale |
| GET | `/api/model/audit` | any | — | Last 200 entries |
| GET | `/api/model/snapshots` | any | — | List versions |
| POST | `/api/model/snapshots` | editor/admin | `{label,description,doc?}` | Create |
| GET | `/api/model/snapshots/:id` | any | — | Fetch one |
| POST | `/api/model/snapshots/:id/restore` | editor/admin | — | Restore |

### Team (admin only)
| Method | Path | Body |
|---|---|---|
| GET | `/api/users` | — |
| POST | `/api/users` | `{email,name,password,role}` |
| PATCH | `/api/users/:id` | `{role?,name?,active?}` |
| POST | `/api/users/:id/reset-password` | `{newPassword}` |

---

## Project layout

```
takmil-backend/
├─ package.json           pg, express, jsonwebtoken, bcryptjs…
├─ .env.example
├─ src/
│  ├─ server.js           Express app + static hosting + async boot
│  ├─ db.js               Postgres pool + JSONB schema migration
│  ├─ seed.js             migration + first-run admin/workspace
│  ├─ middleware/auth.js  tokens + role gates
│  └─ routes/
│     ├─ auth.js          login / logout / me / password
│     ├─ users.js         team management (admin)
│     └─ model.js         model load/save (atomic lock), snapshots, audit
└─ public/
   ├─ index.html          the approved frontend (+1 script tag)
   └─ takmil-cloud.js      the client bridge
```

## Backups

Use Railway's Postgres backups, or `pg_dump` against `DATABASE_URL` like any of
your other apps — same workflow you already have.
