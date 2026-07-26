# Backend — Multi-Brand Inventory & Order Management System

Node.js + Express + TypeScript API, PostgreSQL via Drizzle ORM.

## Folder structure

```
backend/
  src/
    config/
      env.ts               # loads & validates process.env with zod
    db/
      client.ts             # pg Pool + Drizzle instance (the DB connection file)
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
      auth.ts                # requireAuth (JWT) + requireRole (RBAC)
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
    utils/
      apiError.ts
      apiResponse.ts
      asyncHandler.ts
      skuGenerator.ts
    app.ts                    # express app assembly (middleware + routes)
    server.ts                 # process entrypoint (listen, graceful shutdown)
  drizzle.config.ts
  package.json
  tsconfig.json
  .env.example
```

Each future domain (warehouse, inventory, stock-movements, orders, returns,
auth, users) gets its own folder under `modules/` following the same
`routes -> controller -> service -> schema` shape as `products/`.

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

## Endpoints implemented in Step 2

| Method | Path                                   | Auth                | Description |
|--------|-----------------------------------------|----------------------|-------------|
| GET    | `/health`                                | none                  | liveness check |
| POST   | `/api/products`                          | admin                | create a product + all its variants in one DB transaction |
| GET    | `/api/products/variants/:sku/qr-code`    | any authenticated    | printable PNG QR sticker for a variant |

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

`requireAuth` expects a `Bearer` JWT (`{ sub: userId, role: "admin" | "warehouse_staff" }`)
signed with `JWT_SECRET`. Login/token issuance is a separate future auth
module — this step only guards routes that need a known caller.

## Verification

This module was smoke-tested end-to-end against a real local PostgreSQL 16
instance before committing: schema + migration applied, a product created
with two variants via `POST /api/products` (confirmed both variants share
one SKU sequence number and get distinct attribute suffixes), the QR PNG
endpoint fetched and confirmed to be a valid 300x300 PNG, and the RBAC guard
(non-admin → 403) and duplicate-variant guard (same attribute combination
twice in one request → 400 before any DB write) both verified.
