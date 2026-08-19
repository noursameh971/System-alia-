-- Product Images: one image per product (shared across all its variants,
-- same as name/category — see products.service.ts's updateProductVariant,
-- which already treats name/category as product-level fields). Nullable —
-- products without an image fall back to a generated initials avatar in
-- the UI, no placeholder file needed on disk.

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
