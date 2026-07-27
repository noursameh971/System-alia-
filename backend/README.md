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
      auth.ts                # requireAuth (JWT) + requireRole/requireBrandAccess (RBAC)
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
| GET    | `/api/reason-codes`                           | any authenticated    | list reason codes, optional `?appliesTo=stock_movement\|return` |
| GET    | `/api/orders`                                 | any authenticated    | list orders, optional `?brandId=`/`?status=`, with item count + total |
| POST   | `/api/orders`                                 | any authenticated    | create an order; decrements inventory for every item in the same transaction |
| GET    | `/api/orders/:orderId`                        | any authenticated    | order detail: items with attributes, price snapshot, returned/returnable quantity |
| GET    | `/api/returns`                                | any authenticated    | list returns, optional `?orderId=` |
| POST   | `/api/returns`                                | any authenticated    | process a return against an order item; restocks inventory only if `disposition: "restock"` |
| GET    | `/api/dashboard/summary`                      | **admin only**        | cross-brand aggregate: revenue/inventory value/orders per brand + totals + recent global stock movements |

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
`orders` row). The Orders & Returns module (below) is the main consumer:
placing an order calls the outbound movement logic with
`referenceType: "order"`, and a restock return calls the return movement
logic with `referenceType: "return"`.

Orders & Returns request shapes:

```json
// POST /api/orders
{
  "brandId": "uuid",
  "customerName": "optional",
  "customerPhone": "optional",
  "customerAddress": "optional",
  "items": [ { "variantId": "uuid", "binId": "uuid", "quantity": 4 } ]
}

// POST /api/returns — restock (must include restockBinId)
{ "orderItemId": "uuid", "quantity": 2, "reasonCodeId": "uuid", "disposition": "restock", "restockBinId": "uuid" }

// POST /api/returns — write-off (restockBinId must be omitted)
{ "orderItemId": "uuid", "quantity": 1, "reasonCodeId": "uuid", "disposition": "write_off" }
```

`requireAuth` expects a `Bearer` JWT (`{ sub, role, brandCode, brandId }`)
signed with `JWT_SECRET` — every route needs a real, verified token; there
is no bypass. See `docs/AUTH.md` (repo root) for the full strategy.

## Auth: first login & adding staff

1. **Seed the first admin** (there's no UI for this — you need one admin
   account before `/dashboard/users` is reachable at all):
   ```bash
   npm run seed:admin -- --email=you@company.com --password=SomethingLong --name="Your Name"
   ```
   Safe to re-run — it upserts on email, so re-running with a new
   `--password` just resets that admin's password.
2. **Log in** via the frontend's `/login` page (calls `POST /api/auth/login`
   below), or directly:
   ```bash
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"you@company.com","password":"SomethingLong"}'
   # => { "success": true, "data": { "token": "...", "user": { ... } } }
   ```
3. **Add everyone else** from the Master Dashboard's "Manage Users" page
   (`/dashboard/users`, admin-only), or directly:
   ```bash
   # GET  /api/users   — list (admin-only)
   # POST /api/users   — create; admin: { fullName, email, password, role: "admin" }
   #                              staff: { fullName, email, password, role: "warehouse_staff", brandId }
   ```

## Orders & Returns: composing one transaction, not two

Placing an order must create the `orders`/`order_items` rows *and* decrement
inventory for every item — and if any item can't be fulfilled, none of it
should happen, order included. The Step 3 stock-movement functions
(`recordOutboundMovement`, `recordReturnMovement`, etc.) each opened their
*own* `db.transaction()`, which made them unusable here: calling one from
inside the order's transaction would mean two independent transactions, and
a failure in the second wouldn't roll back the first.

Step 6 splits every `record*Movement` function into two: an `...InTx`
version that does the actual work against a transaction handle the caller
provides, and the original public function, now a thin wrapper that just
opens its own transaction and calls the `...InTx` version. The
`/api/stock-movements/*` routes still get one transaction per call, same as
before — nothing about their behavior changed. `orders.service.ts` and
`returns.service.ts` call `recordOutboundMovementInTx`/
`recordReturnMovementInTx` directly, passing their *own* `tx`, so:

- **Order creation**: validate brand + every item (variant belongs to this
  brand, has an active price) up front, insert the order, then for each item
  call `recordOutboundMovementInTx` — which throws on insufficient stock,
  aborting the whole transaction. An order with 3 items where the 3rd is out
  of stock leaves *zero* rows behind: not the order, not items 1 and 2's
  inventory decrements, nothing. Verified directly: an order for 9999 units
  correctly 409s and a follow-up inventory check shows the quantity
  untouched — not partially decremented by whichever items would have fit.
- **Returns**: a `restock` return calls `recordReturnMovementInTx` in the
  same transaction as the `returns` row insert; a `write_off` return never
  calls it at all — per the brief, inventory is only ever incremented for
  the `restock` disposition, so a written-off item doesn't silently
  reappear as sellable stock. Every return quantity is also checked against
  `order_item.quantity - (sum of quantities already returned for that item)`
  before anything is written, so over-returning is rejected outright.

## Master Executive Dashboard: the one deliberately cross-brand endpoint

Every other endpoint in this API either takes an optional `brandId` filter
or is inherently variant/order/bin-scoped — nothing forces cross-brand
data together. `GET /api/dashboard/summary` is the single exception: it
exists specifically to give an admin the combined company view, so it's
gated with `requireRole('admin')` at the route (`modules/dashboard/`), not
just hidden in the frontend.

- **Revenue** is `sum(order_items.subtotal)` grouped by brand, excluding
  `status = 'cancelled'` orders — a cancelled order was never actually
  fulfilled revenue.
- **Inventory value** is `sum(inventory.quantity * variant's active price)`
  per brand, `LEFT JOIN`ed against `variant_prices` so a variant with no
  active price still counts its units (contributing 0 to value) instead of
  disappearing from the total.
- **Recent movements** is the latest 20 `stock_movements` rows across
  *both* brands, each joined back to its brand for display — the only
  place in the app a single list intentionally mixes both brands' activity.

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
- **Step 6**: created an order for 5 units (inventory correctly decremented);
  attempted an order for 9999 units and confirmed both the 409 *and* that
  inventory was left completely untouched (proving the whole order rolled
  back, not just the failing item); listed and fetched the order, confirming
  the price snapshot and attributes were correct; processed a `restock`
  return of 2 units and confirmed inventory went back up by exactly 2;
  processed a `write_off` return of 1 unit and confirmed inventory did
  **not** change; attempted to return more than remained returnable (3 more
  when only 2 were left) and got a precise rejection message; confirmed a
  `restock` return submitted without `restockBinId` is rejected by Zod
  before it reaches the database; and read back the variant's full stock
  movement audit trail, confirming exactly three rows — `inbound`,
  `outbound` (referencing the order), `return_in` (referencing the return)
  — with **no row at all** for the write-off, matching the "only restock
  touches inventory" design.
- **Step 7 (Master Dashboard + strict brand isolation)**: seeded a second
  product/stock/order under Noori alongside the existing Alia Hijab data,
  then confirmed `GET /api/dashboard/summary` returned exactly the expected
  combined totals (revenue 750 + 660 = 1410, inventory value 3750 + 2640 =
  6390, 37 total units) with both brands' movements correctly interleaved
  by recency in `recentMovements`; confirmed a `warehouse_staff`-role
  request to the same endpoint is rejected with `403` — the real,
  server-side enforcement behind the frontend's admin-only gate.
