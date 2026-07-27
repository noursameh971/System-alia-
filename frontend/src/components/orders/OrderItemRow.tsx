"use client";

import { useVariantStock } from "@/hooks/useVariantStock";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { VariantLookupResult } from "@/lib/types";
import { VariantScanInput } from "@/components/inventory/VariantScanInput";
import { BinSelect } from "@/components/inventory/BinSelect";
import { QuantityInput } from "@/components/inventory/QuantityInput";

export interface OrderItemState {
  variant: VariantLookupResult | null;
  binId: string;
  quantity: string;
}

export function OrderItemRow({
  item,
  onChange,
  onRemove,
  canRemove,
}: {
  item: OrderItemState;
  onChange: (next: OrderItemState) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { brand } = useWorkspace();
  const { stock, isLoading: stockLoading } = useVariantStock(item.variant?.id ?? null);
  const stockedBins = stock.filter((row) => row.quantity > 0);

  const lineTotal = item.variant?.price != null && item.quantity ? item.variant.price * Number(item.quantity) : null;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <VariantScanInput
            variant={item.variant}
            onResolved={(variant) => onChange({ ...item, variant, binId: "" })}
            onClear={() => onChange({ variant: null, binId: "", quantity: "" })}
            expectedBrand={brand}
          />
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove item"
            className="mt-1 shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Remove
          </button>
        ) : null}
      </div>

      {item.variant ? (
        stockLoading ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Checking stock levels...</p>
        ) : item.variant.price === null ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            This variant has no price set — it can&apos;t be sold until one is added.
          </p>
        ) : stockedBins.length === 0 ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            No stock recorded for this variant in any bin.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <BinSelect
              label="Bin"
              value={item.binId}
              onChange={(binId) => onChange({ ...item, binId })}
              options={stockedBins.map((b) => ({
                id: b.binId,
                label: `${b.zoneCode} / ${b.binCode} — ${b.quantity} in stock`,
              }))}
            />
            <QuantityInput value={item.quantity} onChange={(quantity) => onChange({ ...item, quantity })} />
            <p className="text-sm text-slate-500 dark:text-slate-400 sm:pb-2.5">
              {lineTotal !== null ? `${lineTotal.toFixed(2)} ${item.variant.currency}` : "—"}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
