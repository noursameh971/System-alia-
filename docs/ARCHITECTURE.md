# Architecture Decisions — Step 1

## Tech Stack

| Layer      | Choice                                                        |
|------------|-----------------------------------------------------------------|
| Frontend   | Next.js (React), responsive web app — used on desktop and mobile/tablet browsers by warehouse staff for QR scanning via device camera |
| Backend    | Node.js                                                        |
| Database   | PostgreSQL (managed, e.g. Render/Railway)                      |
| Deployment | Vercel (frontend), Render/Railway (backend + Postgres)         |
| Integrations | None at this phase — fully standalone                        |

## Multi-Brand Architecture

- **Approach**: `brand_id` foreign key on `products` (not separate schemas/databases). Keeps reporting simple (single `JOIN`/`GROUP BY brand_id` for cross-brand totals) and makes adding a 3rd/4th brand a data change, not a schema migration.
- **Isolation model**: every SKU is brand-exclusive at the `products` level; the shared warehouse means inventory, stock movements, and orders are brand-scoped transitively through the variant → product → brand chain, not by physically separating locations.
- **Access**: Admins see all brands. Warehouse staff see both brands' stock with a UI-level filter/toggle — no row-level security needed for v1, since there's no brand the staff role is blocked from seeing. RBAC is enforced via `users.role` (`admin` | `warehouse_staff`).

## Catalog & Variants

- **Categories are shared taxonomy** (not brand-scoped) so "total revenue by category" can roll up across both brands. Brand exclusivity is enforced at the product level instead.
- **Variant dimensions (Color, Size, Material)** are modeled via `attributes` / `attribute_values` / `variant_attribute_values` rather than fixed columns, so a future 4th dimension (e.g., "Style") doesn't require a schema change.
- **SKU generation** happens in the application layer (not a DB trigger) for flexibility: `{brand.code}-{category.code}-{sequence}-{attribute codes...}`. The uniqueness of a variant's attribute *combination* within a product is validated in the application before insert, since Postgres can't natively express "unique set of joined rows" without a computed signature — flagged in `schema.sql` as a code comment.

## Warehouse & Inventory

- Hierarchy: `warehouses` → `warehouse_zones` → `warehouse_bins`, one shared warehouse today, structure supports more later.
- `inventory` holds live on-hand quantity per `(variant_id, bin_id)` pair — this is the number the UI reads for "how much do we have."
- `stock_movements` is the append-only audit ledger — every inbound, outbound, transfer, return, and manual adjustment is a row here with who/when/why. `inventory.quantity` is a derived/maintained total, kept in sync by the application (or a future trigger) whenever a movement is recorded.

## Orders, Returns & Pricing

- `orders` / `order_items` capture outbound sales; each `order_item` snapshots `unit_price_at_sale` so historical orders aren't affected by later price changes.
- `returns` link back to the originating `order_item`, require a `reason_code`, and force a `disposition` of `restock` (requires a `restock_bin_id`) or `write_off` (no bin).
- `variant_prices` is append-only: a new price = new row + close out the old one (`effective_to = now()`). Only one row per variant may have `effective_to IS NULL` (enforced by a partial unique index).

## Explicitly deferred (not built in Step 1 — flag if any of these should move up)

- Supplier/purchase-order management — inbound movements currently just record quantity + optional notes, no dedicated supplier entity.
- Multi-warehouse / multi-location beyond the single shared warehouse.
- Row-level brand permissions (not needed since staff can see both brands).
- E-commerce/POS integration (Shopify, etc.) — noted as standalone for now.
