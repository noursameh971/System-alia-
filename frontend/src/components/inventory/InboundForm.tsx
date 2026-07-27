"use client";

import { useEffect, useRef, useState } from "react";
import { useAllBins } from "@/hooks/useAllBins";
import { useWorkspace } from "@/context/WorkspaceContext";
import { recordInboundMovement } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import type { VariantLookupResult } from "@/lib/types";
import { VariantScanInput } from "./VariantScanInput";
import { BinSelect } from "./BinSelect";
import { QuantityInput } from "./QuantityInput";
import { MovementStatusBanner, type MovementStatus } from "./MovementStatusBanner";

export function InboundForm() {
  const { brand } = useWorkspace();
  const { bins } = useAllBins();
  const [variant, setVariant] = useState<VariantLookupResult | null>(null);
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<MovementStatus | null>(null);

  const binRef = useRef<HTMLSelectElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (variant) binRef.current?.focus();
  }, [variant]);

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
      const result = await recordInboundMovement({ variantId: variant.id, binId, quantity: qty });
      const bin = bins.find((b) => b.id === binId);
      setStatus({
        kind: "success",
        message: `Added ${qty} to ${bin ? `${bin.zoneCode}/${bin.code}` : "bin"}. Now ${result.toBinQuantityAfter} on hand there.`,
      });
      reset();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Failed to record movement" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">Stock entering the warehouse (e.g. new purchase).</p>

      <VariantScanInput variant={variant} onResolved={setVariant} onClear={reset} expectedBrand={brand} />

      {variant ? (
        <>
          <BinSelect
            ref={binRef}
            label="Destination bin"
            value={binId}
            onChange={setBinId}
            options={bins.map((b) => ({ id: b.id, label: `${b.zoneCode} / ${b.code}` }))}
          />
          <QuantityInput ref={qtyRef} value={quantity} onChange={setQuantity} />

          <button
            type="submit"
            disabled={submitting || !binId || !quantity}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Recording..." : "Record Inbound"}
          </button>
        </>
      ) : null}

      <MovementStatusBanner status={status} />
    </form>
  );
}
