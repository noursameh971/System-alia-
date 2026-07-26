"use client";

import { useEffect, useState } from "react";
import { fetchVariantQrCodeObjectUrl } from "@/lib/products";
import { ApiError } from "@/lib/apiClient";
import { Spinner } from "@/components/ui/Spinner";

export function QrCodeModal({ sku, onClose }: { sku: string; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    fetchVariantQrCodeObjectUrl(sku)
      .then((created) => {
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        url = created;
        setObjectUrl(created);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to generate QR code");
        }
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sku]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4 print:bg-white"
      onClick={onClose}
    >
      <div
        id="qr-print-area"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between print:hidden">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">QR Sticker</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          {error ? (
            <p className="py-8 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, next/image can't fetch it
            <img src={objectUrl} alt={`QR code for ${sku}`} className="h-56 w-56" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center">
              <Spinner label="Generating..." />
            </div>
          )}
          <p className="font-mono text-xs text-slate-400 print:text-black">{sku}</p>
        </div>

        {objectUrl ? (
          <div className="mt-5 flex gap-2 print:hidden">
            <a
              href={objectUrl}
              download={`${sku}.png`}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-indigo-500"
            >
              Download
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Print
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
