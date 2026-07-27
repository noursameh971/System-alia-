"use client";

import { useEffect, useState } from "react";
import { fetchVariantQrCodeObjectUrl } from "@/lib/products";
import { Spinner } from "@/components/ui/Spinner";

export interface PrintableVariant {
  sku: string;
  productName: string;
  attributes: { attributeName: string; value: string }[];
}

/**
 * Batch thermal-sticker printing: fetches one QR PNG per selected variant
 * (same endpoint the single-sticker QrCodeModal uses) and lays them out as
 * a grid of fixed-size labels sized for standard 2in x 1in thermal stock.
 * Each label is `break-inside-avoid` so the browser's print pagination
 * never splits one sticker across two pages — beyond that, actual paper/
 * media size is whatever the thermal printer's OS print queue is already
 * configured for, same as any other print job.
 */
export function BatchLabelPrintView({ variants, onClose }: { variants: PrintableVariant[]; onClose: () => void }) {
  const [urlsBySku, setUrlsBySku] = useState<Map<string, string>>(new Map());
  const [failedSkus, setFailedSkus] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    async function loadAll() {
      const entries = await Promise.all(
        variants.map(async (v) => {
          try {
            const url = await fetchVariantQrCodeObjectUrl(v.sku);
            createdUrls.push(url);
            return [v.sku, url] as const;
          } catch {
            return [v.sku, null] as const;
          }
        }),
      );
      if (cancelled) {
        createdUrls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setUrlsBySku(new Map(entries.filter(([, url]) => url !== null) as [string, string][]));
      setFailedSkus(new Set(entries.filter(([, url]) => url === null).map(([sku]) => sku)));
      setLoading(false);
    }

    void loadAll();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // variants is a snapshot taken when the print view opens — re-running
    // this on every parent re-render would refetch and thrash object URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-900/50 print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-xl print:hidden dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Print Labels</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {variants.length} label{variants.length === 1 ? "" : "s"} &middot; 2in &times; 1in thermal stock
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Print
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 print:hidden">
            <Spinner label="Generating labels..." />
          </div>
        ) : (
          <div id="batch-label-print-area" className="print-area">
            <div className="flex flex-wrap justify-center gap-3 rounded-xl bg-white p-4 print:justify-start print:gap-2 print:rounded-none print:p-0 dark:bg-slate-900 print:dark:bg-white">
              {variants.map((v) => {
                const url = urlsBySku.get(v.sku);
                const failed = failedSkus.has(v.sku);
                return (
                  <div
                    key={v.sku}
                    className="flex h-[1in] w-[2in] shrink-0 items-center gap-2 break-inside-avoid border border-dashed border-slate-300 p-2 print:border-slate-400 dark:border-slate-700"
                  >
                    {failed ? (
                      <div className="flex h-full w-[0.9in] shrink-0 items-center justify-center text-center text-[9px] text-red-600">
                        QR failed
                      </div>
                    ) : url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, next/image can't fetch it
                      <img src={url} alt={`QR code for ${v.sku}`} className="h-[0.9in] w-[0.9in] shrink-0" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-semibold leading-tight text-slate-900 print:text-black">
                        {v.productName}
                      </p>
                      <p className="truncate text-[8px] leading-tight text-slate-600 print:text-black">
                        {v.attributes.map((a) => a.value).join(" / ")}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] font-medium text-slate-900 print:text-black">
                        {v.sku}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
