import type { DashboardMovement } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getBrandAccentClass } from "@/lib/brandColor";

const MOVEMENT_LABEL: Record<string, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  transfer: "Transfer",
  return_in: "Return",
  adjustment: "Adjustment",
};

const MOVEMENT_VARIANT: Record<string, "success" | "warning" | "brand" | "neutral"> = {
  inbound: "success",
  outbound: "warning",
  transfer: "brand",
  return_in: "success",
  adjustment: "neutral",
};

/** Most recent stock movements across BOTH brands — the one place that's deliberately not brand-scoped. */
export function RecentMovementsList({ movements }: { movements: DashboardMovement[] }) {
  if (movements.length === 0) {
    return <EmptyState title="No recent activity" description="Stock movements across both brands will show up here." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {movements.map((m) => (
        <div
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5 text-sm last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-label={m.brand.name}
              title={m.brand.name}
              className={`h-2 w-2 shrink-0 rounded-full ${getBrandAccentClass(m.brand.code)}`}
            />
            <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{m.sku}</span>
            <span className="truncate text-slate-700 dark:text-slate-300">{m.productName}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "neutral"}>
              {MOVEMENT_LABEL[m.movementType] ?? m.movementType}
            </Badge>
            <span className="tabular-nums text-slate-900 dark:text-slate-100">{m.quantity}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date(m.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
