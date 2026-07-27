# Auth & RBAC (Step 7)

## Strategy

One JWT, minted by the Express API on login, carries everything both
enforcement points need: `{ sub, role, brandCode, brandId, exp }`.
`brandCode`/`brandId` are the user's assigned workspace for `warehouse_staff`
and `null` for `admin` (not scoped to a single brand).

**Where the token lives:** a cookie named `alia_session`, written by the
*frontend* (`frontend/src/lib/auth.ts`) after a successful call to
`POST /api/auth/login` — not by the backend. The backend only returns
`{ token, user }` in the JSON response body.

This split matters because frontend and backend are different origins
(different ports locally, likely different domains in production). A cookie
set by the backend on its own domain would not be visible to the Next.js
server/edge in production. Having the frontend own the cookie means:

- **`proxy.ts`** (Next.js's server-side route guard, formerly the
  `middleware.ts` convention) reads it directly, verifies the signature with
  `jose` against `JWT_SECRET`, and enforces route access — no network
  round-trip, no domain mismatch.
- **`apiClient.ts`** reads the same cookie client-side and attaches
  `Authorization: Bearer <token>` on every call to the Express API, which
  verifies it again server-side (`requireAuth` in
  `backend/src/middleware/auth.ts`).

**Tradeoff, stated plainly:** the cookie is *not* `httpOnly`, because
browser JS needs to read it to build the `Authorization` header for direct
cross-origin calls to the Express API. That's a real XSS exposure — no
different from keeping the token in `localStorage`/`sessionStorage`, which
is the common alternative for this "SPA calls a separate API" shape. It's
mitigated by a short `JWT_EXPIRES_IN` (default 8h) and should be paired with
a strict CSP. The fully-hardened version of this architecture proxies every
API call through Next.js Route Handlers, which read a true `httpOnly` cookie
server-side and attach the header themselves — worth doing once the app has
a CSP/security budget, out of scope for this step.

## Enforcement, layered

1. **`proxy.ts`** — redirects unauthenticated requests to `/login`;
   redirects `warehouse_staff` out of any `/[brand]/...` subtree that isn't
   their own; gates `/dashboard` to `admin`. This is route/navigation-level
   only.
2. **Backend `requireAuth`** — every API route verifies the JWT itself.
   Bypassing the frontend entirely (curl, Postman) gets nowhere without a
   valid token.
3. **Backend `requireRole('admin')`** — e.g. `GET /api/dashboard/summary`.
4. **Backend `requireBrandAccess`** — brand-scoped list/create endpoints
   (products, inventory, orders) additionally check that a
   `warehouse_staff` caller's `?brandId=`/body `brandId` matches the brand
   baked into their token, so a valid token for brand A can't be used to
   query brand B's data even by hand-crafting the request.
5. **`GET /api/brands`** — returns only the caller's own brand for
   `warehouse_staff`, so the Workspace Switcher and the `/` picker never
   even list a workspace they can't enter.

Layers 2-5 are what actually matter; layer 1 is UX (don't show a warehouse
staff user a dashboard link and *then* 403 them).

## Data model

`users.brand_id` (nullable UUID FK → `brands.id`) — `NULL` for admins,
required for `warehouse_staff` (enforced in `auth.service.ts#login`, not a DB
constraint, since Postgres can't cleanly express "NULL iff role = admin").
Migration: `database/migrations/0004_add_users_brand_id.sql`.

## Retired

`AUTH_BYPASS` and the `x-mock-user-id`/`x-mock-role` header shortcut are
gone — every request now needs a real, verified JWT.

## User Management (Step 8)

There's no self-registration — accounts are provisioned by an admin.

- **Bootstrapping the first admin**: `backend/src/scripts/seedAdmin.ts`
  (`npm run seed:admin` from `backend/`) hashes a password with bcrypt and
  upserts an `admin` row directly, since there's no admin yet to use the UI.
- **Everyone after that**: the Master Dashboard's "Manage Users" page
  (`/dashboard/users`, gated the same way as `/dashboard` itself — `proxy.ts`
  + `requireRole('admin')`) backed by `GET/POST /api/users`
  (`backend/src/modules/users/`). Creating a `warehouse_staff` account
  requires `brandId`; creating an `admin` account forbids it — enforced by
  `users.schema.ts`'s Zod refine, same rule `auth.service.ts#login` already
  relies on.

## Edit, deactivate & password reset (Step 9)

- `PATCH /api/users/:userId` — partial update of `fullName`/`role`/`brandId`/
  `isActive`. The role/brand pairing is re-validated against the *resulting*
  state even when only one field changes (e.g. an `isActive`-only request
  still gets the existing role checked against the existing brand), in
  `users.service.ts#updateUser`.
- **Self-deactivation is blocked server-side**: `updateUser` takes the
  acting admin's own id and rejects `isActive: false` against that same id
  with a 400, so there's no way to lock every admin out with one click (no
  one left with permission to flip it back). The UI mirrors this by
  disabling that admin's own "Deactivate" button, but the real guard is the
  backend check.
- `PATCH /api/users/:userId/password` — admin-initiated reset, no current-
  password check (this is an admin action on someone else's account, not
  self-service).
- Login already rejected `is_active = false` accounts from Step 8
  (`auth.service.ts#login`). Deactivation used to only take effect on the
  next *login* — see below, Step 10 closes that gap for requests too.

## Instant revocation (Step 10)

The gap called out above — a deactivated user's existing JWT stayed valid
for the rest of `JWT_EXPIRES_IN` (default 8h) since nothing checked it
against current DB state — is closed. `requireAuth`
(`backend/src/middleware/auth.ts`) now does this on **every** request, not
just at login:

1. Verify the JWT signature/expiry (unchanged) — this only proves *who* is
   asking.
2. Look up that user's `role`, `isActive`, and `brandId` fresh from the
   database (one indexed PK lookup, joined to `brands` for the code) and
   use *those* values for `req.user`, not whatever the token claims.
3. Reject with 401 if the row is missing or `isActive` is `false`.

Two things fall out of sourcing authorization state from the DB instead of
the token on every request: deactivating someone now cuts off their very
next API call, not their next login (in a warehouse, "terminated employee
has up to 8h of access" is a real incident, not a theoretical one) — and a
role/brand change via `PATCH /api/users/:userId` also applies immediately,
instead of waiting for the token to expire and be reissued. The tradeoff is
explicit: one extra indexed lookup per request in exchange for no
blocklist, no token versioning, no additional moving parts.
