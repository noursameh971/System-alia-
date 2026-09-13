"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { updateLedgerTransaction, LEDGER_TRANSACTION_KIND_META } from "@/lib/ledger";
import { ApiError } from "@/lib/apiClient";
import type { LedgerTransaction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormState {
  amount: string;
  transactionDate: string;
  dueDate: string;
  notes: string;
}

function formFor(tx: LedgerTransaction): FormState {
  return {
    amount: String(tx.amount),
    transactionDate: tx.transactionDate,
    dueDate: tx.dueDate ?? "",
    notes: tx.notes ?? "",
  };
}

/**
 * Editing (or adjusting) one row in a supplier's transaction history —
 * amount, date, due date, and notes. The transaction's kind (opening
 * balance / charge / payment) is shown read-only: changing it would corrupt
 * what Total Billed / Amount Paid mean, so it's never sent to the backend.
 */
export function EditTransactionModal({
  transaction,
  onOpenChange,
  onSuccess,
}: {
  /** null closes the modal — same "the prop is the open state" pattern used across this module's modals. */
  transaction: LedgerTransaction | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(() => (transaction ? formFor(transaction) : { amount: "", transactionDate: "", dueDate: "", notes: "" }));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [seededFor, setSeededFor] = useState<string | null>(transaction?.id ?? null);
  if (transaction && seededFor !== transaction.id) {
    setForm(formFor(transaction));
    setError(undefined);
    setSeededFor(transaction.id);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!transaction) return;

    const value = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(value) || value <= 0) {
      setError(t("Enter an amount > 0"));
      return;
    }

    setSubmitting(true);
    try {
      await updateLedgerTransaction(transaction.id, {
        amount: value,
        transactionDate: form.transactionDate,
        dueDate: form.dueDate || null,
        notes: form.notes.trim(),
      });
      toast.success(t("Entry updated"));
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Edit entry")}</DialogTitle>
            <DialogDescription>
              {transaction ? t(LEDGER_TRANSACTION_KIND_META[transaction.kind].label) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-amount">{t("Amount")} (EGP)</Label>
            <Input
              id="tx-amount"
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={form.amount}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, amount: e.target.value }));
                setError(undefined);
              }}
              disabled={submitting}
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-date">{t("Date")}</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.transactionDate}
                onChange={(e) => setForm((prev) => ({ ...prev, transactionDate: e.target.value }))}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-due-date">
                {t("Due Date")} <span className="font-normal text-slate-400">({t("optional")})</span>
              </Label>
              <Input
                id="tx-due-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <Input
              id="tx-notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
