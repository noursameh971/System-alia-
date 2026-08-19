# Deployment Guide (Step 11)

Target architecture:

```
Vercel                              Render or Railway
┌─────────────────────┐            ┌─────────────────────┐      ┌──────────────┐
│ Next.js frontend     │  HTTPS     │ Node/Express backend │      │ PostgreSQL   │
│ (proxy.ts, /login,   │───────────▶│ (JWT auth, RBAC,      │─────▶│ (managed)    │
│  /[brand]/..., etc.) │  fetch()   │  all /api/* routes)   │      │              │
└─────────────────────┘            └─────────────────────┘      └──────────────┘
```

Two independent deployments, one shared secret (`JWT_SECRET`, must be
**identical** on both — see `docs/AUTH.md` for why) and one URL each side
needs to know about the other (`NEXT_PUBLIC_API_URL` on the frontend,
`FRONTEND_URL` on the backend).

## Deployment order

Each step depends on the one before it — don't skip ahead:

1. **Provision PostgreSQL** (Render or Railway) → get a `DATABASE_URL`.
2. **Apply the schema + migrations** to that database (`psql`, from your
   machine or the platform's shell — see below).
3. **Seed the first admin** (`npm run seed:admin`) against that same
   `DATABASE_URL` — there's no admin account until this runs, and no way to
   reach `/dashboard/users` to create one otherwise.
4. **Deploy the backend** (Render or Railway) with its env vars set,
   pointed at that `DATABASE_URL`.
5. **Deploy the frontend** (Vercel), with `NEXT_PUBLIC_API_URL` pointed at
   the backend's live URL from step 4.
6. **Go back and set `FRONTEND_URL`** on the backend to the frontend's real
   Vercel URL from step 5, then redeploy the backend so CORS allows it.
7. **Verify**: hit the backend's `/health`, then log in from the deployed
   frontend and confirm a full round trip (login → land in a brand
   workspace → an API call succeeds).

Step 6 is easy to forget because it loops back to a service you already
deployed — until it's done, the frontend can reach the backend directly in
a browser tab, but every `fetch()` call from frontend JS will fail CORS.

---

## 1–2. Database: provision + schema

**Render**: New → PostgreSQL. Note the **External Database URL** it gives
you (the internal one only resolves from inside Render's network — you
need the external one to run `psql` from your machine in step 2, though the
backend service itself can use either once it's deployed on Render too).

**Railway**: New Project → Database → Add PostgreSQL. Railway exposes
`DATABASE_URL` as a reference variable other services in the same project
can consume directly (`${{Postgres.DATABASE_URL}}`) — see the backend env
var table below.

Either way, once you have a `DATABASE_URL`, apply the schema and every
migration **in order** (this mirrors `backend/README.md`'s local setup —
there is no `drizzle-kit migrate` step here, since `database/migrations/`
is hand-authored SQL, not drizzle-kit-generated):

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/migrations/0001_add_product_sku_sequence.sql
psql "$DATABASE_URL" -f database/migrations/0002_add_order_number_sequence.sql
psql "$DATABASE_URL" -f database/migrations/0003_seed_default_reason_codes.sql
psql "$DATABASE_URL" -f database/migrations/0004_add_users_brand_id.sql
```

(Run from the repo root, or adjust the paths.) If a future change adds a
`0005_...sql`, run it too — always in numeric order.

## 3. Seed the first admin

From your machine, pointed at the same production `DATABASE_URL`:

```bash
cd backend
DATABASE_URL="<the production connection string>" \
  npm run seed:admin -- --email=you@company.com --password=SomethingLong --name="Your Name"
```

This is the only account that exists until you log in and add others from
`/dashboard/users` (see `docs/AUTH.md`). Safe to re-run later to reset a
forgotten admin password.

## 4. Backend — Render or Railway

Both platforms: point them at the repo, set the **root directory to
`backend`** (this is a monorepo — the platform needs to know not to build
from the repo root).

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` (Render calls this "Health Check Path" in the service settings) |

`npm run build` compiles TypeScript to `dist/`; `npm start` runs
`node dist/server.js`. Both platforms set `PORT` for you automatically —
`server.ts` already listens on `process.env.PORT` via `env.ts`, so nothing
to configure there.

### Backend environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Gates the Postgres `ssl` option in `db/client.ts` and refuses to boot if `AUTH_BYPASS`-style flags were ever reintroduced. |
| `DATABASE_URL` | from step 1 | Render: use either connection string it gives you. Railway: reference `${{Postgres.DATABASE_URL}}` so it stays in sync if the DB ever moves. |
| `JWT_SECRET` | a long random string | **Must exactly match** the frontend's `JWT_SECRET` (Vercel, below) — the frontend's `proxy.ts` verifies tokens this backend signs. Generate one with `openssl rand -base64 48`. Never reuse the local-dev placeholder from `.env.example`. |
| `JWT_EXPIRES_IN` | `8h` (or shorter) | How long a session lasts before needing to log in again. Deactivation is already instant regardless of this (see `docs/AUTH.md`'s Step 10 section) — this only bounds a *still-active* user's session length. |
| `CORS_ORIGIN` | `http://localhost:3000` (leave as the default) | Only matters for local dev against a prod-pointed API, which you likely won't do. Safe to leave unset/default. |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Set this **after** step 5, once you know the real Vercel URL — see "Deployment order" above. No trailing slash. |

Postgres SSL: `db/client.ts` already enables
`ssl: { rejectUnauthorized: false }` whenever `NODE_ENV=production`, which
Render/Railway's managed Postgres need (their certificate chain isn't in
Node's default trust store from outside their network). Nothing to
configure — just make sure `NODE_ENV=production` is actually set.

## 5. Frontend — Vercel

Import the repo, set **root directory to `frontend`**. Vercel auto-detects
Next.js — default build command (`next build`) and output are correct,
nothing to override.

### Frontend environment variables

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.onrender.com` (or Railway equivalent) | The backend's live base URL from step 4. `NEXT_PUBLIC_` prefix is required — this is read client-side by `apiClient.ts`. No trailing slash. |
| `JWT_SECRET` | same value as the backend's | **Do not prefix this with `NEXT_PUBLIC_`.** `proxy.ts` (Next's server-side route guard) reads `process.env.JWT_SECRET` to verify the session cookie's signature — prefixing it would bundle the secret into client-side JS and defeat the point entirely. |

Set both for the **Production** environment at minimum; add them to
**Preview** too if you want preview deployments to work against the same
backend (Vercel scopes env vars per-environment).

## 6. Close the loop: CORS

Once Vercel gives you the frontend's real domain, go back to the backend
service and set `FRONTEND_URL` to it, then redeploy (or let the platform's
auto-redeploy-on-env-change pick it up). Until this is set, requests from
the deployed frontend will fail CORS in the browser even though the
backend is otherwise live and reachable — `curl` against it will work fine,
which is a common false signal that "the backend is broken" when it's
actually just this step.

## 7. Verify

```bash
curl https://your-backend.onrender.com/health
# => {"status":"ok"}
```

Then, from the deployed frontend: log in as the seeded admin, confirm you
land in a workspace or the picker, and that at least one API-backed page
(Products, Inventory) loads data — that exercises the full chain (frontend
→ backend CORS/JWT verification → Postgres).

## Redeploying after code changes

Both Vercel and Render/Railway redeploy automatically on a push to the
connected branch by default — no extra steps for ordinary code changes.
Only re-run the `psql` migration steps (§1–2) when a change actually adds a
new file under `database/migrations/`, and only re-run `seed:admin` if you
need to reset a password (§3) — neither is part of the normal deploy flow.
