# Backend — Multi-Brand Inventory & Order Management System

Node.js + Express + TypeScript API, PostgreSQL via Drizzle ORM.

## Folder structure

```
backend/
  src/
    config/
      env.ts               # loads & validates process.env with zod
    db/
      client.ts               # pg Pool + Drizzle instance (the DB connection file)
      inventoryOperations.ts  # atomic increment/decrement of on-hand quantity (see Concurrency below)
      schema/                # Drizzle table definitions, one file per domain
        enums.ts
        users.ts
        brands.ts
        catalog.ts           # categories, products, attributes, variants
        pricing.ts           # variant_prices (versioned)
        warehouse.ts          # warehouses -> zones -> bins
        inventory.ts
        stockMovements.ts    # + reason_codes
        orders.ts             # orders, order_items
        returns.ts
        index.ts              # re-exports everything
    middleware/
      auth.ts                # requireAuth (JWT, or AUTH_BYPASS dev shortcut) + requireRole (RBAC)
      validate.ts             # zod request-body validation
      errorHandler.ts         # central error -> HTTP response mapping
    modules/                  # one folder per business domain
      products/
        products.routes.ts
        products.controller.ts
        products.service.ts   # the create-product-with-variants transaction
        products.schema.ts    # zod input schema
      qrcode/
        qrcode.util.ts        # QR generation utility
      warehouse/               # warehouses, zones, bins (config/setup)
        warehouse.routes.ts
        warehouse.controller.ts
        warehouse.service.ts
        warehouse.schema.ts
      stock-movements/          # inbound / outbound / transfer / return_in
        stockMovements.routes.ts
        stockMovements.controller.ts
        stockMovements.service.ts   # the transactional movement + inventory logic
        stockMovements.schema.ts
      inventory/                 # read-only: current on-hand quantity per variant
        inventory.routes.ts
        inventory.controller.ts
        inventory.service.ts
    utils/
      apiError.ts
      apiResponse.ts
      asyncHandler.ts
      skuGenerator.ts
      pgErrors.ts              # maps Postgres unique-violation errors to clean 409s
    app.ts                    # express app assembly (middleware + routes)
    server.ts                 # process entrypoint (listen, graceful shutdown)
  drizzle.config.ts
  package.json
  tsconfig.json
  .env.example
```

Each future domain (orders, returns, auth, users) gets its own folder under
`modules/` following the same `routes -> controller -> service -> schema`
shape as the modules above.

## ORM choice: Drizzle (not Prisma or raw Knex/pg)

The Step 1 schema (`database/schema.sql`) leans on several PostgreSQL
features that matter for correctness here:

- a **partial unique index** (`variant_prices`: only one active price row
  per variant)
- a multi-branch **CHECK constraint** (`stock_movements`: which of
  `from_bin_id`/`to_bin_id` must be set depends on `movement_type`)
- a **generated/stored column** (`order_items.subtotal`)

Drizzle's schema builder expresses all three natively in TypeScript
(`uniqueIndex().where(...)`, `check(...)`, `.generatedAlwaysAs(...)`), so the
type-safe query layer and the actual constraints stay in the same file and
can't drift apart. Prisma's schema language doesn't support partial indexes
or multi-column CHECK constraints declaratively — you'd end up hand-editing
raw SQL migrations anyway, at which point Prisma's main advantage (a fully
declarative schema) is already given up. Plain `pg`/Knex would work but
throws away compile-time type safety across ~18 interrelated tables, which
matters more here than the (small) learning curve Drizzle adds.

**Source of truth split**: `database/schema.sql` (hand-authored, reviewed in
Step 1) remains canonical for the *initial* schema. `src/db/schema/*.ts` is a
type-safe mirror of that same schema, used for queries. `drizzle-kit` is
wired up (`drizzle.config.ts`) to generate migrations for *future* schema
changes only — running `db:generate` against an empty `database/migrations/`
folder would otherwise re-emit the whole initial schema and create a second,
redundant source of truth.

## Setup

```bash
cd backend
npm install
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, etc.

# Apply the schema to a fresh database (once):
psql "$DATABASE_URL" -f ../database/schema.sql
psql "$DATABASE_URL" -f ../database/migrations/0001_add_product_sku_sequence.sql

npm run dev                # tsx watch — http://localhost:4000
```

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build        # compile to dist/
npm start             # run compiled dist/server.js
npm run db:generate   # drizzle-kit: generate a migration from schema changes
npm run db:studio     # drizzle-kit: browse the DB in a local GUI
```

## Endpoints

| Method | Path                                        | Auth               | Description |
|--------|----------------------------------------------|----------------------|-------------|
| GET    | `/health`                                     | none                  | liveness check |
| GET    | `/api/brands`                                 | any authenticated    | list brands (backs the frontend's brand toggle) |
| GET    | `/api/categories`                             | any authenticated    | list categories (shared taxonomy across brands) |
| GET    | `/api/products`                               | any authenticated    | list products (optional `?brandId=`), variants/attributes/price inlined |
| POST   | `/api/products`                               | admin                | create a product + all its variants in one DB transaction |
| GET    | `/api/products/variants/by-sku/:sku`          | any authenticated    | resolve a scanned/typed SKU to a variant (backs the movement forms' scan input) |
| GET    | `/api/products/variants/:sku/qr-code`         | any authenticated    | printable PNG QR sticker for a variant |
| GET    | `/api/warehouses`                             | any authenticated    | list warehouses |
| POST   | `/api/warehouses`                             | admin                | create a warehouse |
| GET    | `/api/warehouses/:warehouseId/zones`          | any authenticated    | list zones in a warehouse |
| POST   | `/api/warehouses/:warehouseId/zones`          | admin                | create a zone |
| GET    | `/api/warehouses/zones/:zoneId/bins`          | any authenticated    | list bins in a zone |
| POST   | `/api/warehouses/zones/:zoneId/bins`          | admin                | create a bin |
| POST   | `/api/stock-movements/inbound`                | any authenticated    | stock entering a bin (from nothing) |
| POST   | `/api/stock-movements/outbound`               | any authenticated    | stock leaving a bin (sale/shipping) |
| POST   | `/api/stock-movements/transfer`               | any authenticated    | move stock bin → bin |
| POST   | `/api/stock-movements/returns`                | any authenticated    | stock coming back into a bin (`return_in`) |
| GET    | `/api/stock-movements/variants/:variantId`    | any authenticated    | audit trail for a variant, newest first |
| GET    | `/api/inventory/variants/:variantId`          | any authenticated    | current on-hand quantity per bin for a variant |
| GET    | `/api/inventory`                              | any authenticated    | list current stock across all variants/bins, filterable by `brandId`/`categoryId`/`zoneId`/`binId` — the Inventory dashboard's data source |

`POST /api/products` request shape:

```json
{
  "brandId": "uuid",
  "categoryId": "uuid",
  "name": "Classic Chiffon Hijab",
  "description": "optional",
  "variants": [
    { "attributeValueIds": ["uuid-black", "uuid-m", "uuid-chiffon"], "price": 150.00 }
  ]
}
```

Stock movement request shapes:

```json
// POST /api/stock-movements/inbound
{ "variantId": "uuid", "binId": "uuid", "quantity": 20, "referenceType": "purchase" }

// POST /api/stock-movements/outbound
{ "variantId": "uuid", "binId": "uuid", "quantity": 5, "referenceType": "order", "referenceId": "uuid" }

// POST /api/stock-movements/transfer
{ "variantId": "uuid", "fromBinId": "uuid", "toBinId": "uuid", "quantity": 6 }

// POST /api/stock-movements/returns
{ "variantId": "uuid", "binId": "uuid", "quantity": 2, "reasonCodeId": "uuid" }
```

`referenceType`/`referenceId` are optional free-form pointers (e.g. to an
`orders` row) — the `returns` table itself (linking a movement back to a
specific order/order_item with a restock-vs-write-off decision) is part of
the future Orders & Returns module; when it ships it calls
`recordReturnMovement` under the hood and passes `referenceType: "return"`.

`requireAuth` expects a `Bearer` JWT (`{ sub: userId, role: "admin" | "warehouse_staff" }`)
signed with `JWT_SECRET` — **unless `AUTH_BYPASS=true`**, see below.

## Dev-only auth bypass (temporary)

Real login/token issuance doesn't exist yet, so to exercise these APIs from
Postman set `AUTH_BYPASS=true` in `.env`. Every request is then treated as
an authenticated user with **no token required at all**:

- Default identity: `role: admin`, `id: 00000000-0000-0000-0000-000000000001`.
- Override per-request with headers: `x-mock-role: warehouse_staff` to test
  RBAC-restricted routes as staff, `x-mock-user-id: <uuid>` to attribute
  writes to a different seeded user.
- Because `created_by`/`performed_by` columns are `NOT NULL` foreign keys
  into `users`, a row with id `00000000-0000-0000-0000-000000000001` must
  exist locally, e.g.:
  ```sql
  INSERT INTO users (id, full_name, email, password_hash, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Mock Admin', 'mock-admin@test.local', 'x', 'admin');
  ```

**This must not reach production.** `env.ts` refuses to boot if
`AUTH_BYPASS=true` and `NODE_ENV=production`, and the server logs a loud
warning on startup whenever it's on. Delete the branch in
`middleware/auth.ts` (`applyMockAuth` and the `if (env.AUTH_BYPASS)` check)
once the real auth module ships.

## Concurrency & data integrity in stock movements

Every movement (`inbound`, `outbound`, `transfer`, `return_in`) runs inside
one `db.transaction()`: the `inventory` quantity update(s) and the
`stock_movements` audit-log insert either all commit or all roll back
together — there's no window where the audit ledger and the on-hand count
can disagree.

The part that actually prevents two concurrent requests from corrupting
stock is in `db/inventoryOperations.ts`, and it deliberately avoids the
naive pattern:

```ts
// UNSAFE — don't do this:
const row = await db.select(...).where(...);      // read
if (row.quantity >= qty) {
  await db.update(inventory).set({ quantity: row.quantity - qty })...; // write
}
```

That has a race window between the `SELECT` and the `UPDATE`: two concurrent
requests can both read `quantity = 10`, both decide "yes, 7 is available",
and both write — final quantity ends up `10 - 7 = 3` instead of `10 - 14 =
-4`, i.e. 7 units vanish without ever being negative, or worse, the second
write can win outright and undo the first (a classic lost update).

Instead, both the read (the availability check) and the write happen in a
**single SQL statement**:

```sql
UPDATE inventory
SET quantity = quantity - $qty
WHERE variant_id = $variantId AND bin_id = $binId AND quantity >= $qty
RETURNING quantity;
```

Postgres takes a row-level lock as part of evaluating and applying this
statement. If a second `UPDATE` targets the same `(variant_id, bin_id)` row
while the first is still in flight, it **blocks** until the first commits or
rolls back, then re-evaluates its own `WHERE quantity >= $qty` against the
now-current value — not the value that was current when it started
executing. So of two concurrent requests for the last unit, one succeeds and
the other's `WHERE` clause fails outright (0 rows affected), which the code
turns into a clean `409 Insufficient stock`. Incrementing (inbound/return/
transfer-destination) uses the equivalent atomic-upsert form,
`INSERT ... ON CONFLICT (variant_id, bin_id) DO UPDATE SET quantity =
inventory.quantity + $qty`, so the same guarantee holds for the very first
unit ever received into a bin (no pre-existing row to lock).

This was verified empirically, not just reasoned about: two `outbound`
requests for 7 units each were fired at the same instant against a bin
holding 11. One returned `201` (`quantity_after: 4`), the other returned
`409` reporting `available: 4` — proof its `WHERE` clause was checked
against the *post-first-request* value, not a stale read — and the bin's
final quantity was exactly 4, never negative, never double-decremented.

## Verification

Both Step 2 and Step 3 modules were smoke-tested end-to-end against a real
local PostgreSQL 16 instance before committing (schema + migrations
applied, server run with `AUTH_BYPASS=true`, requests fired via `curl`):

- **Step 2**: a product created with two variants via `POST /api/products`
  (confirmed both variants share one SKU sequence number and get distinct
  attribute suffixes), the QR PNG endpoint fetched and confirmed to be a
  valid 300×300 PNG, RBAC (non-admin → 403) and the duplicate-variant guard
  (same attribute combination twice in one request → 400 before any write).
- **Step 3**: warehouse → zone → bin created; duplicate bin code → clean
  409 (not a raw 500 — this caught and fixed a real bug where the Postgres
  error code lives on `err.cause.code`, not `err.code`, under
  drizzle-orm's node-postgres driver); a full inbound → outbound → transfer
  → return sequence produced exactly the expected quantities at each bin;
  an oversized outbound request correctly rejected with `409` and the
  actual available quantity; the audit trail (`GET
  /api/stock-movements/variants/:variantId`) showed all four movements in
  order; and the concurrency race described above was run for real and
  produced the exact expected outcome.
