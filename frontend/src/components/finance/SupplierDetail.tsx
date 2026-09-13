"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, CircleDollarSign, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { formatPrice } from "@/lib/formatPrice";
import {
  deleteLedgerTransaction,
  exportLedgerEntityStatement,
  getLedgerEntity,
  LEDGER_TRANSACTION_KIND_META,
} from "@/lib/ledger";
import type { LedgerTransaction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from "@/components/dashboard/StatTile";
import { LedgerBalanceTypeBadge, LedgerCategoryBadge } from "./LedgerBadges";
import { remainingBalanceClass } from "./LedgerTable";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { AddChargeModal } from "./AddChargeModal";
import { EditSupplierModal } from "./EditSupplierModal";
import { EditTransactionModal } from "./EditTransactionModal";

function TransactionKindBadge({ kind }: { kind: LedgerTransaction["kind"] }) {
  const { t } = useLocale();
  const meta = LEDGER_TRANSACTION_KIND_META[kind];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
      {t(meta.label)}
    </span>
  );
}

export function SupplierDetail({ entityId }: { entityId: string }) {
  const { brand } = useWorkspace();
  const { t } = useLocale();

  const { data: entity, error, isLoading, mutate } = useSWR(["ledger-entity", entityId], () => getLedgerEntity(entityId));

  const [payingEntity, setPayingEntity] = useState(false);
  const [addingCharge, setAddingCharge] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<LedgerTransaction | null>(null);
  const [exporting, setExporting] = useState(false);

  function refresh() {
    void mutate();
  }

  async function handleExport() {
    if (!entity) return;
    setExporting(true);
    try {
      const blob = await exportLedgerEntityStatement(entity.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `statement-${entity.name.trim().toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to export the statement"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteTransaction() {
    if (!deletingTransaction) return;
    try {
      await deleteLedgerTransaction(deletingTransaction.id);
      toast.success(t("Entry deleted"));
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to delete the entry"));
    } finally {
      setDeletingTransaction(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t("Loading supplier...")} />
      </div>
    );
  }

  if (error || !entity) {
    return (
      <EmptyState
        title={t("Couldn't load this supplier")}
        description={error instanceof ApiError ? error.message : t("It may not exist.")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${brand.code.toLowerCase()}/finance`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("Finance & Expenses")}
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entity.name}</h1>
              <LedgerBalanceTypeBadge balanceType={entity.balanceType} />
              <LedgerCategoryBadge category={entity.category} />
            </div>
            {entity.phone ? (
              <p dir="ltr" className="mt-1 text-end text-sm text-slate-500 dark:text-slate-400 sm:text-start">
                {entity.phone}
              </p>
            ) : null}
            {entity.notes ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entity.notes}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPayingEntity(true)}>
              <CircleDollarSign className="size-3.5" />
              {t("Record Payment")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddingCharge(true)}>
              <Plus className="size-3.5" />
              {t("Add New Bill / Invoice")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingSupplier(true)}>
              <Pencil className="size-3.5" />
              {t("Edit Supplier Info")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
              <Download className="size-3.5" />
              {exporting ? t("Exporting...") : t("Export Statement")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={t("Total Billed")} value={formatPrice(entity.totalBilled)} />
        <StatTile label={t("Amount Paid")} value={formatPrice(entity.amountPaid)} />
        {/* Not StatTile: its value is plain text with a fixed color, and the
            remaining balance needs the same red/emerald-or-settled coloring
            as the Suppliers & Debts Ledger table row (remainingBalanceClass) —
            same reasoning as OrderDetail's Net Profit tile being hand-rolled. */}
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-medium uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">
            {t("Remaining Balance")}
          </p>
          <p className={`mt-2.5 truncate text-2xl font-semibold tracking-tight tabular-nums ${remainingBalanceClass(entity)}`}>
            {formatPrice(entity.remainingBalance)}
          </p>
          <p className="mt-1 truncate text-xs font-normal text-slate-400 dark:text-slate-500">
            {entity.balanceType === "payable" ? t("Owed to suppliers & factories") : t("Held by couriers & clients")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Transaction History")}</h2>

        {entity.transactions.length === 0 ? (
          <EmptyState
            title={t("No transactions yet")}
            description={t('Use "Record Payment" or "Add New Bill / Invoice" above to get started.')}
          />
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-3">{t("Date")}</TableHead>
                  <TableHead className="py-3">{t("Type")}</TableHead>
                  <TableHead className="py-3 text-end">{t("Amount")}</TableHead>
                  <TableHead className="py-3">{t("Due Date")}</TableHead>
                  <TableHead className="py-3">{t("Notes")}</TableHead>
                  <TableHead className="py-3 text-end">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entity.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap py-3 text-slate-700 dark:text-slate-300">
                      {new Date(tx.transactionDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="py-3">
                      <TransactionKindBadge kind={tx.kind} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-end tabular-nums text-slate-700 dark:text-slate-300">
                      {formatPrice(tx.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-slate-500 dark:text-slate-400">
                      {tx.dueDate ? new Date(tx.dueDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate py-3 text-slate-500 dark:text-slate-400">
                      {tx.notes || "—"}
                    </TableCell>
                    <TableCell className="py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingTransaction(tx)}
                          aria-label={t("Edit entry")}
                          title={t("Edit entry")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingTransaction(tx)}
                          aria-label={t("Delete entry")}
                          title={t("Delete entry")}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RecordPaymentModal
        entity={payingEntity ? entity : null}
        onOpenChange={(open) => setPayingEntity(open)}
        onSuccess={refresh}
      />

      <AddChargeModal entity={addingCharge ? entity : null} onOpenChange={(open) => setAddingCharge(open)} onSuccess={refresh} />

      <EditSupplierModal
        entity={editingSupplier ? entity : null}
        onOpenChange={(open) => setEditingSupplier(open)}
        onSuccess={refresh}
      />

      <EditTransactionModal
        transaction={editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        onSuccess={refresh}
      />

      <ConfirmDialog
        open={deletingTransaction !== null}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
        title={t("Delete entry")}
        description={
          deletingTransaction
            ? `${t("This permanently removes")} ${t(LEDGER_TRANSACTION_KIND_META[deletingTransaction.kind].label)} (${formatPrice(deletingTransaction.amount)}).`
            : ""
        }
        confirmLabel={t("Delete")}
        onConfirm={handleDeleteTransaction}
      />
    </div>
  );
}
