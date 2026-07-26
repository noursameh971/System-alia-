import QRCode from "qrcode";

/**
 * QR payload decision (see docs/ER-DIAGRAM.md): encode the variant's SKU as
 * plain text, not a JSON blob and not the raw variant UUID.
 *
 *  - The SKU is already a unique, stable identifier for the variant
 *    (product_variants.sku UNIQUE), so nothing else needs to travel in the
 *    code for a lookup — the scanning client calls
 *    GET /api/variants/sku/:sku to resolve it to the full variant record.
 *  - Plain text keeps the QR's data density low, which matters at small
 *    sticker print sizes — a JSON object with sku + variantId roughly
 *    doubles the payload and pushes the code to a denser module grid that's
 *    more failure-prone with a phone camera under warehouse lighting.
 *  - Human-readable: if a sticker is smudged or a scan fails, staff can read
 *    the SKU straight off the label and type it in.
 *
 * This is centralized in one function so switching to, say, a deep link
 * (`https://staff.example.com/scan/{sku}`) later is a one-line change.
 */
export function buildQrPayload(sku: string): string {
  return sku;
}

const COMMON_QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  width: 300,
} as const;

/** PNG buffer suitable for saving/printing a physical sticker. */
export async function generateVariantQrPng(sku: string): Promise<Buffer> {
  return QRCode.toBuffer(buildQrPayload(sku), { ...COMMON_QR_OPTIONS, type: "png" });
}

/** Data URL suitable for inline <img src> preview in the frontend. */
export async function generateVariantQrDataUrl(sku: string): Promise<string> {
  return QRCode.toDataURL(buildQrPayload(sku), COMMON_QR_OPTIONS);
}
