-- Adds a manual, per-brand display order to products so the Products page
-- can support drag/up-down reordering instead of always sorting by name.
-- See backend/src/db/schema/catalog.ts for the typed Drizzle definition.

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: give every existing product a stable, unique-per-brand sort_order
-- matching today's default name ordering, so the very first manual reorder
-- has real, distinct values to swap between instead of every row sharing 0.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY name, created_at) - 1 AS rn
  FROM products
)
UPDATE products SET sort_order = ranked.rn
FROM ranked
WHERE products.id = ranked.id;

CREATE INDEX IF NOT EXISTS ix_products_brand_sort_order ON products(brand_id, sort_order);
