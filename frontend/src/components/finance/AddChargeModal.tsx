"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { createLedgerCharge } from "@/lib/ledger";
import { ApiError } from "@/lib/apiClient";
import type { LedgerEntity } from "@/lib/types";
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

/** Local calendar day as YYYY-MM-DD — same reasoning as RecordPaymentModal's todayLocal. */
function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * "Add New Bill / Invoice" on the Supplier Detail page — a new charge
 * against the supplier, adding to Total Billed and the outstanding balance.
 * Same shape as RecordPaymentModal plus an optional due date.
 */
export function AddChargeModal({
  entity,
  onOpenChange,
  onSuccess,
}: {
  /** null closes the modal — same "the prop is the open state" pattern as RecordPaymentModal's entity prop. */
  entity: LedgerEntity | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (entity && seededFor !== entity.id) {
    setAmount("");
    setTransactionDate(todayLocal());
    setDueDate("");
    setNotes("");
    setError(undefined);
    setSeededFor(entity.id);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entity) return;

    const value = Number(amount);
    if (!amount.trim() || Number.isNaN(value) || value <= 0) {
      setError(t("Enter an amount > 0"));
      return;
    }

    setSubmitting(true);
    try {
      await createLedgerCharge(entity.id, {
        amount: value,
        transactionDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(t("Bill added"));
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={entity !== null} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Add New Bill / Invoice")}</DialogTitle>
            <DialogDescription>{entity ? entity.name : null}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="charge-amount">{t("Amount")} (EGP)</Label>
            <Input
              id="charge-amount"
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(undefined);
              }}
              placeholder="0.00"
              disabled={submitting}
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="charge-date">{t("Date")}</Label>
              <Input
                id="charge-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="charge-due-date">
                {t("Due Date")} <span className="font-normal text-slate-400">({t("optional")})</span>
              </Label>
              <Input
                id="charge-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="charge-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <Input
              id="charge-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("e.g. Fabric order #1234")}
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Add New Bill / Invoice")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
