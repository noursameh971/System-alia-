"use client";

import { useEffect, useRef, useState } from "react";
import { useVariantStock } from "@/hooks/useVariantStock";
import { recordOutboundMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import type { VariantLookupResult } from "@/lib/types";
import { VariantScanInput } from "./VariantScanInput";
import { BinSelect } from "./BinSelect";
import { QuantityInput } from "./QuantityInput";
import { MovementStatusBanner, type MovementStatus } from "./MovementStatusBanner";

export function OutboundForm() {
  const [variant, setVariant] = useState<VariantLookupResult | null>(null);
  const { stock, isLoading: stockLoading, refresh: refreshStock } = useVariantStock(variant?.id ?? null);
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  const binRef = useRef<HTMLSelectElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const stockedBins = stock.filter((row) => row.quantity > 0);

  useEffect(() => {
    if (variant && !stockLoading) binRef.current?.focus();
  }, [variant, stockLoading]);

  useEffect(() => {
    if (binId) qtyRef.current?.focus();
  }, [binId]);

  function reset() {
    setVariant(null);
    setBinId("");
    setQuantity("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !binId) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setStatus({ kind: "error", message: "Enter a whole number quantity greater than 0." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const result = await recordOutboundMovement({ variantId: variant.id, binId, quantity: qty });
      const bin = stock.find((b) => b.binId === binId);
      setStatus({
        kind: "success",
        message: `Removed ${qty} from ${bin ? `${bin.zoneCode}/${bin.binCode}` : "bin"}. ${result.fromBinQuantityAfter} left there.`,
      });
      // Invalidate the cached per-bin stock for this variant so a quick
      // re-scan of the same SKU (a very likely next action) shows the fresh
      // count instead of what was cached before this movement.
      await refreshStock();
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as { available?: number; requested?: number } | undefined;
        setStatus({
          kind: "error",
          message:
            details?.available !== undefined
              ? `Only ${details.available} available in that bin (you asked for ${details.requested}).`
              : err.message,
        });
      } else {
        setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Failed to record movement" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">Stock leaving the warehouse (sale/shipping).</p>

      <VariantScanInput variant={variant} onResolved={setVariant} onClear={reset} />

      {variant ? (
        stockLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking stock levels...</p>
        ) : stockedBins.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            No stock recorded for this variant in any bin.
          </p>
        ) : (
          <>
            <BinSelect
              ref={binRef}
              label="Source bin"
              value={binId}
              onChange={setBinId}
              options={stockedBins.map((b) => ({
                id: b.binId,
                label: `${b.zoneCode} / ${b.binCode} — ${b.quantity} in stock`,
              }))}
            />
            <QuantityInput ref={qtyRef} value={quantity} onChange={setQuantity} />

            <button
              type="submit"
              disabled={submitting || !binId || !quantity}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Recording..." : "Record Outbound"}
            </button>
          </>
        )
      ) : null}

      <MovementStatusBanner status={status} />
    </form>
  );
}
