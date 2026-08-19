"use client";

import useSWR from "swr";
import { listCategories } from "@/lib/categories";
import { useAllBins } from "@/hooks/useAllBins";

export interface StockFilterState {
  categoryId: string | null;
  zoneId: string | null;
  binId: string | null;
}

const SELECT_CLASSES =
  "w-full rounded-lg border border-slate-300 py-2 px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function StockFilters({
  filters,
  onChange,
}: {
  filters: StockFilterState;
  onChange: (next: StockFilterState) => void;
}) {
  const { data: categories } = useSWR("categories", listCategories, { revalidateOnFocus: false });
  const { bins } = useAllBins();

  const zones = Array.from(new Map(bins.map((b) => [b.zoneId, { id: b.zoneId, code: b.zoneCode }])).values());
  const binsInZone = filters.zoneId ? bins.filter((b) => b.zoneId === filters.zoneId) : bins;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Category</label>
        <select
          aria-label="Category filter"
          value={filters.categoryId ?? ""}
          onChange={(e) => onChange({ ...filters, categoryId: e.target.value || null })}
          className={SELECT_CLASSES}
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Zone</label>
        <select
          aria-label="Zone filter"
          value={filters.zoneId ?? ""}
          onChange={(e) => onChange({ ...filters, zoneId: e.target.value || null, binId: null })}
          className={SELECT_CLASSES}
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              Zone {z.code}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Bin</label>
        <select
          aria-label="Bin filter"
          value={filters.binId ?? ""}
          onChange={(e) => onChange({ ...filters, binId: e.target.value || null })}
          className={SELECT_CLASSES}
        >
          <option value="">All bins</option>
          {binsInZone.map((b) => (
            <option key={b.id} value={b.id}>
              {b.zoneCode} / {b.code}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
