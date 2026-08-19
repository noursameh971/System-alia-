"use client";

import type { DashboardMovement } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { getBrandAccentClass } from "@/lib/brandColor";
import { MOVEMENT_LABEL, movementIcon, movementIconClass } from "@/lib/movementDisplay";
import { formatActivityTime } from "@/lib/formatActivityTime";

/**
 * Most recent stock movements across BOTH brands — the one place that's
 * deliberately not brand-scoped, hence the brand dot on every row.
 *
 * Rows carry no border/background of their own: the parent card owns the
 * chrome and the height cap, so this list can be dropped into a scroll
 * container without doubling up borders.
 */
export function RecentMovementsList({ movements }: { movements: DashboardMovement[] }) {
  const { t } = useLocale();

  if (movements.length === 0) {
    return (
      <EmptyState
        title={t("No recent activity")}
        description={t("Stock movements across both brands will show up here.")}
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {movements.map((movement) => {
        const Icon = movementIcon(movement.movementType);
        return (
          <div key={movement.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${movementIconClass(movement.movementType)}`}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  aria-label={movement.brand.name}
                  title={movement.brand.name}
                  className={`size-1.5 shrink-0 rounded-full ${getBrandAccentClass(movement.brand.code)}`}
                />
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {movement.productName}
                </p>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {t(MOVEMENT_LABEL[movement.movementType] ?? movement.movementType)}
                <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                <span className="font-mono">{movement.sku}</span>
              </p>
            </div>

            <div className="shrink-0 text-end">
              <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {movement.quantity}
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-400"
                title={new Date(movement.createdAt).toLocaleString()}
              >
                {formatActivityTime(movement.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
