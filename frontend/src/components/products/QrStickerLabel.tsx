import { formatPrice } from "@/lib/formatPrice";

export interface StickerVariant {
  sku: string;
  productName: string;
  color: string;
  size: string;
  price: number | null;
  currency: string | null;
}

/**
 * One 50mm x 25mm thermal sticker's content — shared by the single-variant
 * quick-print (VariantPrintButton) and the "Print all QR labels" batch grid
 * (BatchLabelPrintView), so both produce identically formatted labels.
 */
export function QrStickerLabel({
  variant,
  qrUrl,
  breakAfter = false,
}: {
  variant: StickerVariant;
  qrUrl: string | null;
  /** Set on every sticker but the last in a multi-label batch print, so each lands on its own physical 50mm x 25mm page. */
  breakAfter?: boolean;
}) {
  return (
    <div
      className={`qr-sticker flex h-[25mm] w-[50mm] shrink-0 items-center gap-1.5 overflow-hidden border border-dashed border-slate-300 p-1.5 print:border-none dark:border-slate-700 ${breakAfter ? "print:break-after-page" : ""}`}
    >
      {qrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, next/image can't fetch it
        <img src={qrUrl} alt={`QR code for ${variant.sku}`} className="h-[21mm] w-[21mm] shrink-0" />
      ) : (
        <div className="h-[21mm] w-[21mm] shrink-0 bg-slate-100 dark:bg-slate-800" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[7px] font-semibold text-slate-900 print:text-black">{variant.productName}</p>
        <p className="truncate text-[6.5px] text-slate-600 print:text-black">
          {variant.color} / {variant.size}
        </p>
        <p className="truncate text-[7px] font-medium text-slate-900 print:text-black">
          {formatPrice(variant.price, variant.currency)}
        </p>
        <p className="mt-0.5 truncate font-mono text-[7px] text-slate-900 print:text-black">{variant.sku}</p>
      </div>
    </div>
  );
}
