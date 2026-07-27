"use client";

import { useRef, useState } from "react";
import { getVariantBySku } from "@/lib/variants";
import { ApiError } from "@/lib/apiClient";
import type { VariantLookupResult } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { QrCodeIcon } from "@/components/layout/icons";

export function VariantScanInput({
  variant,
  onResolved,
  onClear,
  expectedBrand,
}: {
  variant: VariantLookupResult | null;
  onResolved: (variant: VariantLookupResult) => void;
  onClear: () => void;
  /**
   * When set, a resolved variant belonging to a different brand is
   * rejected with an explicit error instead of being handed to onResolved.
   * This is the actual mechanism behind "strict brand isolation" for
   * scanning: every SKU lookup hits the same by-sku endpoint regardless of
   * brand, so without this check a Noori staff member scanning an Alia
   * Hijab label inside the Noori workspace would silently be allowed to
   * move Alia Hijab stock — exactly the mistake this refactor exists to
   * prevent.
   */
  expectedBrand?: { id: string; name: string };
}) {
  const [sku, setSku] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function resolve(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const found = await getVariantBySku(trimmed);
      if (expectedBrand && found.brand.id !== expectedBrand.id) {
        setError(`${found.sku} belongs to ${found.brand.name}, not ${expectedBrand.name} — wrong workspace.`);
        return;
      }
      onResolved(found);
      setSku("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to look up that SKU");
    } finally {
      setLoading(false);
    }
  }

  if (variant) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{variant.productName}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{variant.sku}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="brand">{variant.brand.name}</Badge>
              {variant.attributes.map((attr) => (
                <Badge key={`${attr.attributeName}-${attr.value}`}>{attr.value}</Badge>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear();
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Scan or type SKU
      </label>
      {/*
        This is intentionally a <div>, not a <form>: every caller (Inbound/
        Outbound/TransferForm) already wraps its whole flow in a <form>, and
        a <form> nested inside a <form> is invalid HTML — it broke hydration
        when this was a <form onSubmit>. Enter-to-submit is wired via
        onKeyDown instead, with stopPropagation so it can't also bubble up
        and trigger the outer form's submit handler.
      */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <QrCodeIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void resolve(sku);
              }
            }}
            placeholder="e.g. ALH-HIJ-00001-BLK-CHF-M"
            disabled={loading}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 font-mono text-sm text-slate-900 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={() => void resolve(sku)}
          disabled={loading || !sku.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "..." : "Find"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
