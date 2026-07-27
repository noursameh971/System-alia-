"use client";

import { useEffect, useRef, useState } from "react";
import { useAllBins } from "@/hooks/useAllBins";
import { useVariantStock } from "@/hooks/useVariantStock";
import { useWorkspace } from "@/context/WorkspaceContext";
import { recordTransferMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import type { VariantLookupResult } from "@/lib/types";
import { VariantScanInput } from "./VariantScanInput";
import { BinSelect } from "./BinSelect";
import { QuantityInput } from "./QuantityInput";
import { MovementStatusBanner, type MovementStatus } from "./MovementStatusBanner";

export function TransferForm() {
  const { brand } = useWorkspace();
  const { bins } = useAllBins();
  const [variant, setVariant] = useState<VariantLookupResult | null>(null);
  const { stock, isLoading: stockLoading, refresh: refreshStock } = useVariantStock(variant?.id ?? null);
  const [fromBinId, setFromBinId] = useState("");
  const [toBinId, setToBinId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  const fromBinRef = useRef<HTMLSelectElement>(null);
  const toBinRef = useRef<HTMLSelectElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const stockedBins = stock.filter((row) => row.quantity > 0);

  useEffect(() => {
    if (variant && !stockLoading) fromBinRef.current?.focus();
  }, [variant, stockLoading]);

  useEffect(() => {
    if (fromBinId) toBinRef.current?.focus();
  }, [fromBinId]);

  useEffect(() => {
    if (toBinId) qtyRef.current?.focus();
  }, [toBinId]);

  function reset() {
    setVariant(null);
    setFromBinId("");
    setToBinId("");
    setQuantity("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !fromBinId || !toBinId) return;
    if (fromBinId === toBinId) {
      setStatus({ kind: "error", message: "Source and destination bins must be different." });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setStatus({ kind: "error", message: "Enter a whole number quantity greater than 0." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const result = await recordTransferMovement({ variantId: variant.id, fromBinId, toBinId, quantity: qty });
      const from = stock.find((b) => b.binId === fromBinId);
      const to = bins.find((b) => b.id === toBinId);
      setStatus({
        kind: "success",
        message: `Moved ${qty} from ${from ? `${from.zoneCode}/${from.binCode}` : "source"} to ${
          to ? `${to.zoneCode}/${to.code}` : "destination"
        }. (${result.fromBinQuantityAfter} left at source, ${result.toBinQuantityAfter} now at destination.)`,
      });
      // See OutboundForm's identical comment: invalidates the cached
      // per-bin stock for this variant before the next scan.
      await refreshStock();
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as { available?: number; requested?: number } | undefined;
        setStatus({
          kind: "error",
          message:
            details?.available !== undefined
              ? `Only ${details.available} available in the source bin (you asked for ${details.requested}).`
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
      <p className="text-sm text-slate-500 dark:text-slate-400">Move stock between bins.</p>

      <VariantScanInput variant={variant} onResolved={setVariant} onClear={reset} expectedBrand={brand} />

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
              ref={fromBinRef}
              label="From bin"
              value={fromBinId}
              onChange={setFromBinId}
              options={stockedBins.map((b) => ({
                id: b.binId,
                label: `${b.zoneCode} / ${b.binCode} — ${b.quantity} in stock`,
              }))}
            />
            <BinSelect
              ref={toBinRef}
              label="To bin"
              value={toBinId}
              onChange={setToBinId}
              options={bins
                .filter((b) => b.id !== fromBinId)
                .map((b) => ({ id: b.id, label: `${b.zoneCode} / ${b.code}` }))}
            />
            <QuantityInput ref={qtyRef} value={quantity} onChange={setQuantity} />

            <button
              type="submit"
              disabled={submitting || !fromBinId || !toBinId || !quantity}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Recording..." : "Record Transfer"}
            </button>
          </>
        )
      ) : null}

      <MovementStatusBanner status={status} />
    </form>
  );
}
