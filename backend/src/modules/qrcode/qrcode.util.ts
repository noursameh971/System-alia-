import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

// PgTransaction's generic params aren't meaningfully constrainable here; see products.service.ts's identical Tx alias.
type Tx = PgTransaction<any, any, any>;

/**
 * Label payload decision (see docs/ER-DIAGRAM.md): encode a short,
 * sequential, human-typeable code — NOT the variant's SKU — as plain text.
 * Stored on product_variants.qr_code_value and encoded into the printed
 * sticker's Code 128 barcode (see BarcodeStickerLabel.tsx on the frontend).
 *
 * This used to just return the SKU directly — deliberately, per the
 * original reasoning here: the SKU is already a unique, stable, human-
 * readable identifier, so nothing else needs to travel in the code for a
 * lookup. That reasoning was right about uniqueness and readability, but
 * missed a physical constraint: a real SKU (brand+category+sequence+
 * attribute codes) runs 30+ characters, and packed into a small thermal
 * label that prints bars too thin for a real scanner to reliably resolve —
 * confirmed by print-density math and a physical scanner test, even though
 * the SKU-payload barcode rendered and decoded correctly in every software
 * test. A short sequential code (`V000123`) needs a fraction of the
 * modules, so it prints thick, well-spaced, reliably scannable bars, while
 * staying just as unique and just as easy for staff to read/type by hand
 * if a scan fails — the full SKU still prints as text on the label right
 * below the barcode for that same fallback case.
 *
 * getVariantBySku (products.service.ts) matches on *either* this value or
 * the SKU, so already-printed labels using the old SKU-as-payload scheme
 * keep scanning correctly — this is additive, not a breaking migration.
 *
 * Centralized in one function so changing the scheme again later (e.g. a
 * deep link) is still a one-line change.
 */
export async function buildQrPayload(tx: Tx): Promise<string> {
  const result = await tx.execute<{ seq: string }>(sql`select nextval('product_variant_barcode_seq') as seq`);
  const sequence = Number(result.rows[0]?.seq);
  return `V${String(sequence).padStart(6, "0")}`;
}
