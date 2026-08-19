"use client";

import { Plus } from "lucide-react";
import type { LowStockItem } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Variants at or below the low-stock threshold — the brand dashboard's
 * reorder warning list, worst (0 stock) first, with a one-click restock
 * action per row.
 *
 * Rows are deliberately dense (py-2, text-xs/sm, small badge and ghost
 * button): the API returns this list unbounded, so at ~20 warnings a
 * comfortable row height is what dragged the whole dashboard's height out.
 * The height cap itself lives on the parent DashboardCard's body rather
 * than here, so the card is the scroll container.
 */
export function LowStockList({ items, onRestock }: { items: LowStockItem[]; onRestock: (item: LowStockItem) => void }) {
  const { t } = useLocale();

  if (items.length === 0) {
    return (
      <EmptyState title={t("Stock levels look healthy")} description={t("Nothing is running low right now.")} />
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((item) => (
        <div key={item.variantId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.productName}</p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
              {[item.color, item.size].filter(Boolean).join(" / ") || item.sku}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={item.stock === 0 ? "danger" : "orange"} size="sm">
              {item.stock === 0 ? t("Out of Stock") : `${item.stock} ${t("left")}`}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              onClick={() => onRestock(item)}
            >
              <Plus className="size-3" />
              {t("Restock")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
