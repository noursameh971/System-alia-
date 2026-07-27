import Link from "next/link";
import type { DashboardBrandSummary } from "@/lib/types";
import { getBrandAccentClass } from "@/lib/brandColor";

/** Per-brand revenue bar (simple width-percentage comparison, no charting library) plus a stats breakdown, each row linking into that brand's workspace. */
export function BrandComparison({ brands }: { brands: DashboardBrandSummary[] }) {
  const maxRevenue = Math.max(...brands.map((b) => b.revenue), 1);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">By brand</h2>
      </div>
      {brands.map((b) => (
        <Link
          key={b.id}
          href={`/${b.code.toLowerCase()}/products`}
          className="block border-b border-slate-100 bg-white px-4 py-4 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white ${getBrandAccentClass(b.code)}`}
              >
                {b.code}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{b.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {b.orderCount} order{b.orderCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex gap-6 text-right text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Revenue</p>
                <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {b.revenue.toFixed(2)} EGP
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Inventory value</p>
                <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {b.inventoryValue.toFixed(2)} EGP
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Units in stock</p>
                <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {b.inventoryUnitCount}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${getBrandAccentClass(b.code)}`}
              style={{ width: `${Math.max((b.revenue / maxRevenue) * 100, b.revenue > 0 ? 2 : 0)}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
