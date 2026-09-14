import { LABEL_HEIGHT_IN, LABEL_WIDTH_IN } from "@/lib/labelDimensions";
import { BarcodeImage } from "./BarcodeImage";

export interface StickerVariant {
  sku: string;
  /**
   * The barcode's actual encoded payload — deliberately NOT the same as
   * `sku` for real variants (see backend/src/modules/qrcode/qrcode.util.ts):
   * a full SKU is too long to print as reliably scannable bars on a small
   * thermal label. `sku` still prints as human-readable text below the
   * barcode; this is only what the scanner reads.
   */
  qrCodeValue: string;
  productName: string;
  color: string;
  size: string;
}

/**
 * One thermal sticker's content — shared by the single-variant quick-print
 * (VariantPrintButton) and the "Print all labels" batch grid
 * (BatchLabelPrintView), so both produce identically formatted labels.
 *
 * Deliberately no price on the sticker — these are inventory/SKU-lookup
 * labels, not price tags.
 *
 * All sizing here is in the same `in` unit as LABEL_WIDTH_IN/LABEL_HEIGHT_IN
 * (labelDimensions.ts, the single source of truth for the physical size) so
 * nothing needs unit conversion, and box-sizing: border-box + zero implicit
 * margin is what keeps padding from ever pushing the box past that exact
 * 4in x 2in footprint onto a second physical label.
 */
export function BarcodeStickerLabel({
  variant,
  breakAfter = false,
}: {
  variant: StickerVariant;
  /** Set on every sticker but the last in a multi-label batch print, so each lands on its own physical label page. */
  breakAfter?: boolean;
}) {
  return (
    <div
      style={{
        width: `${LABEL_WIDTH_IN}in`,
        height: `${LABEL_HEIGHT_IN}in`,
        padding: "0.15in",
        gap: "0.08in",
      }}
      className={`barcode-sticker box-border flex shrink-0 flex-col items-center justify-center overflow-hidden border border-dashed border-slate-300 print:border-none dark:border-slate-700 ${breakAfter ? "print:break-after-page" : ""}`}
    >
      <BarcodeImage value={variant.qrCodeValue} className="w-full max-w-full shrink-0" style={{ height: "0.7in" }} />
      <p
        className="w-full truncate text-center font-mono text-slate-900 print:text-black"
        style={{ fontSize: "0.16in", lineHeight: 1 }}
      >
        {variant.sku}
      </p>
      <p
        className="w-full truncate text-center font-semibold text-slate-900 print:text-black"
        style={{ fontSize: "0.2in", lineHeight: 1 }}
      >
        {variant.productName}
      </p>
      <p
        className="w-full truncate text-center text-slate-600 print:text-black"
        style={{ fontSize: "0.16in", lineHeight: 1 }}
      >
        {variant.color} / {variant.size}
      </p>
    </div>
  );
}
