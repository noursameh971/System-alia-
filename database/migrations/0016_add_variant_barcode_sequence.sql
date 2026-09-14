-- Short, dense, scanner-friendly code printed in the barcode instead of the
-- full descriptive SKU (see backend/src/modules/qrcode/qrcode.util.ts). A
-- real SKU (brand code + category code + sequence + attribute codes, 30+
-- characters in practice) packed into a small thermal label produces bars
-- too thin to reliably read on a physical scanner, even though it renders
-- and decodes correctly in software (a vector render has no print-head
-- resolution limit; a real thermal printer does). The full SKU still
-- prints as human-readable text on the label — this only changes the
-- barcode's own payload.

CREATE SEQUENCE IF NOT EXISTS product_variant_barcode_seq START 1;

-- Backfill every existing variant that's never been given a distinct
-- barcode value (qr_code_value still equal to sku, the old default) with a
-- fresh short code, so reprinting an already-created product's label also
-- gets the fix, not just newly created variants going forward.
UPDATE product_variants
SET qr_code_value = 'V' || LPAD(nextval('product_variant_barcode_seq')::text, 6, '0')
WHERE qr_code_value = sku;
