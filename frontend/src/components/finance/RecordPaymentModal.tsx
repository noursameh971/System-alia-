"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { recordLedgerPayment } from "@/lib/ledger";
import { formatPrice } from "@/lib/formatPrice";
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

/** Local calendar day as YYYY-MM-DD — toISOString() would use UTC and pre-fill yesterday for anyone west of Greenwich after 00:00 local. */
function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * The Suppliers & Debts Ledger table's row-level "Record Payment" action.
 * Direction is implied by the entity (payable = we're paying out,
 * receivable = we're collecting) rather than asked again here — see
 * ledger.service.ts's recordPayment.
 */
export function RecordPaymentModal({
  entity,
  onOpenChange,
  onSuccess,
}: {
  /** null closes the modal — same "the prop is the open state" pattern as ProductFormModal's editing prop. */
  entity: LedgerEntity | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (entity && seededFor !== entity.id) {
    setAmount(entity.remainingBalance > 0 ? entity.remainingBalance.toFixed(2) : "");
    setTransactionDate(todayLocal());
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
      await recordLedgerPayment(entity.id, { amount: value, transactionDate, notes: notes.trim() || undefined });
      toast.success(t("Payment recorded"));
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
            <DialogTitle>{t("Record Payment")}</DialogTitle>
            <DialogDescription>
              {entity ? (
                <>
                  {entity.name} · {t("Remaining Balance")}:{" "}
                  <span className="font-semibold tabular-nums">{formatPrice(entity.remainingBalance)}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">{t("Amount")} (EGP)</Label>
            <Input
              id="payment-amount"
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-date">{t("Date")}</Label>
            <Input
              id="payment-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <Input
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("e.g. Bank transfer ref #1234")}
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Record Payment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
