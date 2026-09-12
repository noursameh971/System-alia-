/**
 * Label payload decision (see docs/ER-DIAGRAM.md): encode the variant's SKU
 * as plain text, not a JSON blob and not the raw variant UUID. Stored on
 * product_variants.qr_code_value and encoded into the printed sticker's
 * Code 128 barcode (see BarcodeStickerLabel.tsx on the frontend).
 *
 *  - The SKU is already a unique, stable identifier for the variant
 *    (product_variants.sku UNIQUE), so nothing else needs to travel in the
 *    code for a lookup — the scanning client calls
 *    GET /api/variants/sku/:sku to resolve it to the full variant record.
 *  - Plain text keeps the payload short, which matters at small sticker
 *    print sizes — a JSON object with sku + variantId would need a wider
 *    barcode (or a denser QR module grid) to stay scannable.
 *  - Human-readable: if a sticker is smudged or a scan fails, staff can read
 *    the SKU straight off the label and type it in.
 *
 * This is centralized in one function so switching to, say, a deep link
 * (`https://staff.example.com/scan/{sku}`) later is a one-line change.
 */
export function buildQrPayload(sku: string): string {
  return sku;
}
