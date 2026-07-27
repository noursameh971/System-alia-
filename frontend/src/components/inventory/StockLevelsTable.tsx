"use client";

import { useState } from "react";
import useSWR from "swr";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listInventory } from "@/lib/inventory";
import { ApiError } from "@/lib/apiClient";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StockFilters, type StockFilterState } from "./StockFilters";

export function StockLevelsTable() {
  const { brand } = useWorkspace();
  const [filters, setFilters] = useState<StockFilterState>({ categoryId: null, zoneId: null, binId: null });

  const {
    data: rows,
    error,
    isLoading,
  } = useSWR(["inventory", brand.id, filters], () => listInventory({ brandId: brand.id, ...filters }));

  return (
    <div className="flex flex-col gap-4">
      <StockFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading stock levels..." />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load stock levels"
          description={error instanceof ApiError ? error.message : "Check that the backend API is running."}
        />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          title="No stock found"
          description="Nothing matches the current filters, or no inbound movements have been recorded yet."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {rows.map((row) => (
            <div
              key={`${row.variantId}-${row.binId}`}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.productName}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{row.sku}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{row.category.name}</Badge>
                  {row.attributes.map((attr) => (
                    <Badge key={`${attr.attributeName}-${attr.value}`}>{attr.value}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {row.zoneCode} / {row.binCode}
                </span>
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    row.quantity > 0 ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {row.quantity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
