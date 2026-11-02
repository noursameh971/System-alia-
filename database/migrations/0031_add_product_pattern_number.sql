-- Adds an optional, manually-entered pattern number ("رقم الباترون") to
-- products, so staff can find a product by the number used on the shop
-- floor. Purely a catalog/search field: SKUs and QR code values are still
-- generated exactly as before and never read this column.
-- See backend/src/db/schema/catalog.ts for the typed Drizzle definition.

ALTER TABLE products ADD COLUMN IF NOT EXISTS pattern_number varchar(50);

-- Unique per brand when set. NULLs never collide in a Postgres unique
-- index, so products without a pattern number are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS products_brand_id_pattern_number_key ON products(brand_id, pattern_number);
