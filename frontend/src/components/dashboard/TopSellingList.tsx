"use client";

import type { TopSellingItem } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPrice } from "@/lib/formatPrice";

/** Ranked list of best-selling variants by units sold. Row density matches LowStockList so the two side-by-side cards read as one system. */
export function TopSellingList({ items }: { items: TopSellingItem[] }) {
  const { t } = useLocale();

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("No sales yet")}
        description={t("Best-selling items will show up here once orders come in.")}
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((item, index) => (
        <div key={item.variantId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.productName}</p>
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                {[item.color, item.size].filter(Boolean).join(" / ") || item.sku}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {item.quantitySold} {t("sold")}
            </p>
            <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{formatPrice(item.revenue)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
