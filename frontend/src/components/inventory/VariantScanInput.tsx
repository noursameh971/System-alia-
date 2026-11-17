"use client";

import { useRef, useState } from "react";
import { getVariantBySku } from "@/lib/variants";
import { useLocale } from "@/context/LocaleContext";
import { getUsLayoutChar } from "@/lib/physicalKeyboard";
import { ApiError } from "@/lib/apiClient";
import type { VariantLookupResult } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { QrCodeIcon } from "@/components/layout/icons";
import { ProductThumbnail } from "@/components/products/ProductThumbnail";

/**
 * SKU -> variant for this browser session. A scan session is mostly the same
 * few SKUs over and over (500 units of 20 variants), so after the first scan
 * of a label every repeat resolves instantly with no network round-trip.
 */
const resolvedBySku = new Map<string, VariantLookupResult>();
/** Lookups currently in flight, so a burst of the same new SKU shares one request instead of firing one per scan. */
const pendingBySku = new Map<string, Promise<VariantLookupResult>>();

function lookupSku(sku: string): VariantLookupResult | Promise<VariantLookupResult> {
  const cached = resolvedBySku.get(sku);
  if (cached) return cached;
  let pending = pendingBySku.get(sku);
  if (!pending) {
    pending = getVariantBySku(sku)
      .then((found) => {
        resolvedBySku.set(sku, found);
        return found;
      })
      .finally(() => pendingBySku.delete(sku));
    pendingBySku.set(sku, pending);
  }
  return pending;
}

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
  const { t } = useLocale();
  const [sku, setSku] = useState("");
  // The authoritative scan buffer. A scanner types a whole label plus Enter
  // in a few milliseconds; reading `sku` (the last *rendered* value) on
  // Enter could submit a label with its tail missing while the page is busy
  // re-rendering a long queue. The ref is updated synchronously per key, and
  // the state copy only drives what the field displays.
  const bufferRef = useRef("");
  // Count of in-flight lookups, not a boolean — a scanner fires Enter every
  // few hundred ms, far faster than a round-trip, so multiple scans are
  // routinely in flight at once. Never disable the input on this: a
  // disabled <input> drops every keystroke the scanner sends while a prior
  // lookup is pending, which silently eats consecutive scans instead of
  // queueing/bumping them.
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function setBuffer(next: string) {
    bufferRef.current = next;
    setSku(next);
  }

  /** Empties the field synchronously and resolves what was in it — the scanner is already sending the next label. */
  function submitBuffer() {
    const value = bufferRef.current;
    setBuffer("");
    void resolve(value);
  }

  function accept(found: VariantLookupResult) {
    if (expectedBrand && found.brand.id !== expectedBrand.id) {
      setError(`${found.sku} belongs to ${found.brand.name}, not ${expectedBrand.name} — wrong workspace.`);
      return;
    }
    setError(null);
    onResolved(found);
  }

  async function resolve(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const lookup = lookupSku(trimmed);
    // Already-seen SKU: counted immediately, no network, no pending state.
    if (!(lookup instanceof Promise)) {
      accept(lookup);
      return;
    }

    setPendingCount((n) => n + 1);
    try {
      accept(await lookup);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to look up that SKU");
    } finally {
      setPendingCount((n) => n - 1);
    }
  }

  if (variant) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ProductThumbnail imageUrl={variant.imageUrl} name={variant.productName} size={40} />
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
        {t("Scan or type SKU")}
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
          <QrCodeIcon className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            value={sku}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                // Clear synchronously, before the lookup even starts — the
                // scanner is already moving on to the next label and the
                // field must be empty and focused for it, not still holding
                // this scan's text until a network round-trip finishes.
                submitBuffer();
                return;
              }

              // A SKU is always ASCII, but a scanner emulates a physical
              // keyboard — if the OS's active layout is Arabic (or anything
              // non-Latin), the *characters* the browser sees are whatever
              // that layout maps the physical keys to, not what's printed
              // on the barcode ("No variant with SKU ..." on an otherwise
              // valid scan). Reconstruct the intended character from the
              // physical key instead, so the active layout can't matter.
              // Skipped for modifier combos so paste/select-all etc. still
              // work normally.
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              const char = getUsLayoutChar(e);
              if (char !== null) {
                e.preventDefault();
                setBuffer(bufferRef.current + char);
              }
            }}
            placeholder="e.g. ALH-HIJ-00001-BLK-CHF-M"
            className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-3 font-mono text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={submitBuffer}
          disabled={!sku.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pendingCount > 0 ? "..." : t("Find")}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
