"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DashboardBrandSummary } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { getBrandAccentClass, getBrandInitials } from "@/lib/brandColor";
import { formatPrice } from "@/lib/formatPrice";
import { workspaceHomePath } from "@/lib/routing";

/**
 * One Brand Performance card per workspace — avatar, the three headline
 * numbers, and a share-of-total-stock bar.
 *
 * The bar deliberately shows each brand's share of *company-wide* stock
 * units rather than a per-brand percentage of itself: read down the column,
 * the bars sum to 100%, which is what makes it a distribution rather than
 * three unrelated progress meters.
 *
 * h-full + flex-1 on the cards is what lets this column match the height of
 * the capped Recent Activity card beside it under `items-stretch`, instead
 * of leaving a ragged gap under the shorter of the two.
 */
export function BrandComparison({ brands }: { brands: DashboardBrandSummary[] }) {
  const { t } = useLocale();
  const totalUnits = brands.reduce((sum, brand) => sum + brand.inventoryUnitCount, 0);

  return (
    <div className="flex h-full flex-col gap-4">
      {brands.map((brand) => {
        const share = totalUnits > 0 ? (brand.inventoryUnitCount / totalUnits) * 100 : 0;
        return (
          <Link
            key={brand.id}
            href={workspaceHomePath(brand.code)}
            className="group flex min-h-0 flex-1 flex-col justify-between gap-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-colors hover:border-slate-200 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold tracking-wide text-white ${getBrandAccentClass(brand.code)}`}
              >
                {getBrandInitials(brand.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {brand.name}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {brand.orderCount} {t(brand.orderCount === 1 ? "order" : "orders")}
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500 dark:text-slate-600" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Metric label={t("Inventory value")} value={formatPrice(brand.inventoryValue)} />
              <Metric label={t("Stock units")} value={String(brand.inventoryUnitCount)} />
              <Metric label={t("Revenue")} value={formatPrice(brand.revenue)} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t("Share of total stock")}
                </span>
                <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  {share.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${getBrandAccentClass(brand.code)}`}
                  style={{ width: `${Math.max(share, brand.inventoryUnitCount > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="truncate text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
