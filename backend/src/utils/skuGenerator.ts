/**
 * Builds a variant SKU as {brandCode}-{categoryCode}-{sequence}-{attrCode1}-{attrCode2}...
 * e.g. ALH-HIJ-00007-BLK-M-CHF
 *
 * `sequence` identifies the *product* (all variants of one product share it);
 * the attribute codes at the end differentiate the variants. The sequence
 * itself comes from the Postgres `product_sku_seq` sequence (see
 * database/migrations/) so it stays monotonic under concurrent inserts
 * without needing a stored counter column.
 */
export function buildVariantSku(params: {
  brandCode: string;
  categoryCode: string;
  sequence: number;
  attributeCodes: string[];
}): string {
  const { brandCode, categoryCode, sequence, attributeCodes } = params;
  const paddedSequence = String(sequence).padStart(5, "0");
  const parts = [brandCode, categoryCode, paddedSequence, ...attributeCodes];
  return parts.map((part) => part.trim().toUpperCase()).join("-");
}

/** Order-independent identity for a variant's set of attribute values, used to reject duplicate variants within one product. */
export function attributeSignature(attributeValueIds: string[]): string {
  return [...attributeValueIds].sort().join("|");
}
