"use client";

import type { RecentMovementLogItem } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { MOVEMENT_LABEL, MOVEMENT_BADGE_VARIANT } from "@/lib/movementDisplay";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Latest movements for this brand across every type — the Inventory page's fast-scan activity feed. */
export function RecentMovementsLog({ movements }: { movements: RecentMovementLogItem[] }) {
  const { t } = useLocale();

  if (movements.length === 0) {
    return (
      <EmptyState
        title={t("No recent activity")}
        description={t("Movements recorded for this workspace will show up here.")}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("Type")}</TableHead>
            <TableHead>{t("Product")}</TableHead>
            <TableHead>{t("SKU")}</TableHead>
            <TableHead>{t("Qty")}</TableHead>
            <TableHead>{t("User")}</TableHead>
            <TableHead>{t("Time")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Badge variant={MOVEMENT_BADGE_VARIANT[m.movementType] ?? "neutral"}>
                  {t(MOVEMENT_LABEL[m.movementType] ?? m.movementType)}
                </Badge>
              </TableCell>
              <TableCell className="text-slate-700 dark:text-slate-300">
                {m.productName}
                {m.reasonLabel ? <div className="text-xs text-slate-500 dark:text-slate-400">{m.reasonLabel}</div> : null}
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">{m.sku}</TableCell>
              <TableCell className="tabular-nums text-slate-900 dark:text-slate-100">{m.quantity}</TableCell>
              <TableCell className="text-slate-600 dark:text-slate-400">{m.performedByName}</TableCell>
              <TableCell className="text-xs text-slate-400 dark:text-slate-500" title={new Date(m.createdAt).toLocaleString()}>
                {formatRelativeTime(m.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
