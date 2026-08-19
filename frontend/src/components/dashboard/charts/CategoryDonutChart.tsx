"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryValueItem } from "@/lib/types";
import { formatPrice } from "@/lib/formatPrice";
import { EmptyState } from "@/components/ui/EmptyState";

// Cycles through the app's existing accent hues (same family as
// lib/brandColor.ts's palette) rather than recharts' garish defaults.
const PALETTE = ["#4f46e5", "#059669", "#d97706", "#e11d48", "#0d9488", "#7c3aed", "#2563eb", "#65a30d"];

/** Donut of inventory value by category, with a value + share-of-total legend since a bare donut can't be read precisely. */
export function CategoryDonutChart({ items }: { items: CategoryValueItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="No categorized stock yet" description="Inventory value by category will show up here." />;
  }

  const data = items.map((item, i) => ({
    name: item.categoryName,
    value: item.inventoryValue,
    color: PALETTE[i % PALETTE.length]!,
  }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-64 w-full min-w-0 shrink-0 sm:w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2} strokeWidth={0}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatPrice(Number(value))}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-h-64 sm:overflow-y-auto">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="truncate text-slate-700 dark:text-slate-300">{entry.name}</span>
            </div>
            <div className="shrink-0 text-end">
              <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatPrice(entry.value)}</span>
              <span className="ms-1.5 text-xs text-slate-400 dark:text-slate-500">
                {total > 0 ? `${((entry.value / total) * 100).toFixed(0)}%` : "0%"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
