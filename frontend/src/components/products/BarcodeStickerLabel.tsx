import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "@/lib/labelDimensions";
import { BarcodeImage } from "./BarcodeImage";

export interface StickerVariant {
  sku: string;
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
 * LABEL_WIDTH_MM/LABEL_HEIGHT_MM (labelDimensions.ts) is the single source
 * of truth for the physical size; it must stay in sync with the @page rule
 * in globals.css (see the comment there for why that can't just import it).
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
        width: `${LABEL_WIDTH_MM}mm`,
        height: `${LABEL_HEIGHT_MM}mm`,
        padding: "0.8mm",
        gap: "0.4mm",
      }}
      className={`barcode-sticker box-border flex shrink-0 flex-col items-center justify-center overflow-hidden border border-dashed border-slate-300 print:border-none dark:border-slate-700 ${breakAfter ? "print:break-after-page" : ""}`}
    >
      <BarcodeImage value={variant.sku} className="w-full max-w-full shrink-0" style={{ height: "8mm" }} />
      <p
        className="w-full truncate text-center font-mono text-slate-900 print:text-black"
        style={{ fontSize: "2.3mm", lineHeight: 1 }}
      >
        {variant.sku}
      </p>
      <p
        className="w-full truncate text-center font-semibold text-slate-900 print:text-black"
        style={{ fontSize: "2.6mm", lineHeight: 1 }}
      >
        {variant.productName}
      </p>
      <p
        className="w-full truncate text-center text-slate-600 print:text-black"
        style={{ fontSize: "2.3mm", lineHeight: 1 }}
      >
        {variant.color} / {variant.size}
      </p>
    </div>
  );
}
