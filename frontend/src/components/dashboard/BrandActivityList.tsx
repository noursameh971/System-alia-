"use client";

import type { BrandRecentMovement } from "@/lib/types";
import { useLocale } from "@/context/LocaleContext";
import { MOVEMENT_LABEL, MOVEMENT_BADGE_VARIANT } from "@/lib/movementDisplay";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Recent stock movements for one brand — compact, scannable rows with color-coded action badges, sharing its palette with the Inventory page's Recent Movements Log. */
export function BrandActivityList({ movements }: { movements: BrandRecentMovement[] }) {
  const { t } = useLocale();

  if (movements.length === 0) {
    return (
      <EmptyState
        title={t("No recent activity")}
        description={t("Stock movements for this brand will show up here.")}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="py-2.5">{t("Action")}</TableHead>
            <TableHead className="py-2.5">{t("Product")}</TableHead>
            <TableHead className="py-2.5">{t("SKU")}</TableHead>
            <TableHead className="py-2.5">{t("Qty")}</TableHead>
            <TableHead className="py-2.5 text-end">{t("When")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="py-2">
                <Badge variant={MOVEMENT_BADGE_VARIANT[m.movementType] ?? "neutral"}>
                  {t(MOVEMENT_LABEL[m.movementType] ?? m.movementType)}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[220px] truncate py-2 text-slate-700 dark:text-slate-300">{m.productName}</TableCell>
              <TableCell className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{m.sku}</TableCell>
              <TableCell className="py-2 tabular-nums text-slate-900 dark:text-slate-100">{m.quantity}</TableCell>
              <TableCell className="py-2 text-end text-xs text-slate-400 dark:text-slate-500" title={new Date(m.createdAt).toLocaleString()}>
                {formatRelativeTime(m.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
