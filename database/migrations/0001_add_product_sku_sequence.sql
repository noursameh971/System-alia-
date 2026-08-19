-- Step 2 addition: a plain monotonic sequence used to generate the
-- {sequence} portion of a variant SKU at product-creation time
-- (see backend/src/modules/products/products.service.ts).
--
-- This does NOT alter any table from the Step 1 schema (database/schema.sql)
-- -- it only adds a new sequence object. The number is embedded directly in
-- generated SKU strings and is not stored as its own column anywhere.

CREATE SEQUENCE IF NOT EXISTS product_sku_seq;
