"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { listReasonCodes } from "@/lib/reasonCodes";
import { createReturn } from "@/lib/returns";
import { ApiError } from "@/lib/apiClient";
import type { OrderDetailItem, ReturnDisposition } from "@/lib/types";
import { useAllBins } from "@/hooks/useAllBins";
import { BinSelect } from "@/components/inventory/BinSelect";

export function ReturnModal({
  item,
  onClose,
  onSuccess,
}: {
  item: OrderDetailItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: reasonCodes } = useSWR(["reason-codes", "return"], () => listReasonCodes("return"), {
    revalidateOnFocus: false,
  });
  const { bins } = useAllBins();

  const [quantity, setQuantity] = useState(String(item.returnableQuantity));
  const [reasonCodeId, setReasonCodeId] = useState("");
  const [disposition, setDisposition] = useState<ReturnDisposition>("restock");
  const [restockBinId, setRestockBinId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > item.returnableQuantity) {
      setError(`Enter a whole number between 1 and ${item.returnableQuantity}.`);
      return;
    }
    if (!reasonCodeId) {
      setError("Select a reason.");
      return;
    }
    if (disposition === "restock" && !restockBinId) {
      setError("Select a bin to restock into.");
      return;
    }

    setSubmitting(true);
    try {
      await createReturn({
        orderItemId: item.id,
        quantity: qty,
        reasonCodeId,
        disposition,
        restockBinId: disposition === "restock" ? restockBinId : undefined,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process return");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Process Return</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</p>
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

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Quantity to return ({item.returnableQuantity} returnable)
            </label>
            <input
              type="number"
              aria-label="Return quantity"
              min={1}
              max={item.returnableQuantity}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Reason</label>
            <select
              aria-label="Return reason"
              value={reasonCodeId}
              onChange={(e) => setReasonCodeId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Select a reason...</option>
              {(reasonCodes ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Disposition</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDisposition("restock")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  disposition === "restock"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Restock
              </button>
              <button
                type="button"
                onClick={() => setDisposition("write_off")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  disposition === "write_off"
                    ? "border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950 dark:text-red-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Write off
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {disposition === "restock"
                ? "Adds the item back into the bin you choose below."
                : "Damaged/unsellable — inventory is not increased."}
            </p>
          </div>

          {disposition === "restock" ? (
            <BinSelect
              label="Restock into bin"
              value={restockBinId}
              onChange={setRestockBinId}
              options={bins.map((b) => ({ id: b.id, label: `${b.zoneCode} / ${b.code}` }))}
            />
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Processing..." : "Process Return"}
          </button>
        </div>
      </form>
    </div>
  );
}
