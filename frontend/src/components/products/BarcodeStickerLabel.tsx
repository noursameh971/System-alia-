import { formatPrice } from "@/lib/formatPrice";
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "@/lib/labelDimensions";
import { BarcodeImage } from "./BarcodeImage";

export interface StickerVariant {
  sku: string;
  productName: string;
  color: string;
  size: string;
  price: number | null;
  currency: string | null;
}

/**
 * One thermal sticker's content — shared by the single-variant quick-print
 * (VariantPrintButton) and the "Print all labels" batch grid
 * (BatchLabelPrintView), so both produce identically formatted labels.
 *
 * Portrait layout (barcode on top, details stacked below) to match how this
 * label stock actually feeds through the printer — a landscape layout on a
 * portrait-fed roll printed sideways and bled across the label boundary.
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
      style={{ width: `${LABEL_WIDTH_MM}mm`, height: `${LABEL_HEIGHT_MM}mm` }}
      className={`barcode-sticker box-border flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden border border-dashed border-slate-300 p-1 print:border-none dark:border-slate-700 ${breakAfter ? "print:break-after-page" : ""}`}
    >
      <BarcodeImage value={variant.sku} className="h-[9mm] w-full max-w-full shrink-0" />
      <p className="w-full truncate text-center font-mono text-[7px] text-slate-900 print:text-black">
        {variant.sku}
      </p>
      <p className="w-full truncate text-center text-[7.5px] font-semibold text-slate-900 print:text-black">
        {variant.productName}
      </p>
      <p className="w-full truncate text-center text-[7px] text-slate-600 print:text-black">
        {variant.color} / {variant.size}
      </p>
      <p className="w-full truncate text-center text-[8px] font-bold text-slate-900 print:text-black">
        {formatPrice(variant.price, variant.currency)}
      </p>
    </div>
  );
}
