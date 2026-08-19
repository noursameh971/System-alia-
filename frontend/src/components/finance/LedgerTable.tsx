"use client";

import { CircleDollarSign } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { formatPrice } from "@/lib/formatPrice";
import type { LedgerEntity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LedgerBalanceTypeBadge, LedgerCategoryBadge } from "./LedgerBadges";

/**
 * Remaining balance coloring: red for an outstanding payable (money we
 * still owe), emerald for an outstanding receivable (money still owed to
 * us), slate once it's settled or overpaid — a negative remaining balance
 * is a credit, not a debt, so it doesn't get the "danger" treatment either.
 */
function remainingBalanceClass(entity: LedgerEntity): string {
  if (entity.remainingBalance <= 0) return "text-slate-400 dark:text-slate-500";
  return entity.balanceType === "payable"
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";
}

export function LedgerTable({
  entities,
  onRecordPayment,
}: {
  entities: LedgerEntity[];
  onRecordPayment: (entity: LedgerEntity) => void;
}) {
  const { t } = useLocale();

  if (entities.length === 0) {
    return (
      <EmptyState
        title={t("No suppliers or debts recorded yet")}
        description={t('Use "Opening Balances" to add a historical supplier balance or courier COD.')}
      />
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="py-3">{t("Supplier Name")}</TableHead>
            <TableHead className="py-3">{t("Category")}</TableHead>
            <TableHead className="py-3 text-end">{t("Total Billed")}</TableHead>
            <TableHead className="py-3 text-end">{t("Amount Paid")}</TableHead>
            <TableHead className="py-3 text-end">{t("Remaining Balance")}</TableHead>
            <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entities.map((entity) => (
            <TableRow key={entity.id}>
              <TableCell className="py-3">
                <p className="font-medium text-slate-900 dark:text-slate-100">{entity.name}</p>
                <div className="mt-1">
                  <LedgerBalanceTypeBadge balanceType={entity.balanceType} />
                </div>
              </TableCell>
              <TableCell className="py-3">
                <LedgerCategoryBadge category={entity.category} />
              </TableCell>
              <TableCell className="whitespace-nowrap py-3 text-end tabular-nums text-slate-700 dark:text-slate-300">
                {formatPrice(entity.totalBilled)}
              </TableCell>
              <TableCell className="whitespace-nowrap py-3 text-end tabular-nums text-slate-700 dark:text-slate-300">
                {formatPrice(entity.amountPaid)}
              </TableCell>
              <TableCell className={`whitespace-nowrap py-3 text-end font-semibold tabular-nums ${remainingBalanceClass(entity)}`}>
                {formatPrice(entity.remainingBalance)}
              </TableCell>
              <TableCell className="py-3 text-end">
                <Button variant="outline" size="sm" onClick={() => onRecordPayment(entity)}>
                  <CircleDollarSign className="size-3.5" />
                  {t("Record Payment")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
