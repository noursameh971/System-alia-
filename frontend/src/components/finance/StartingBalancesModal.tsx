"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { saveOpeningBalances, type OpeningBalances } from "@/lib/statements";
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
  startingCash: string;
  ownerCapital: string;
  asOfDate: string;
}

function formFor(current: OpeningBalances): FormState {
  return {
    startingCash: current.isSet ? String(current.startingCash) : "",
    ownerCapital: current.isSet ? String(current.ownerCapital) : "",
    asOfDate: current.asOfDate ?? "",
  };
}

/**
 * "Starting Cash & Capital" — the brand's real bank/cash balance and owner's
 * capital as of a given day, which the Balance Sheet adds to the recorded
 * flows. Distinct from the page header's "Opening Balances", which records
 * supplier/client debts in the Suppliers & Debts ledger.
 */
export function StartingBalancesModal({
  open,
  onOpenChange,
  brandId,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  current: OpeningBalances;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(() => formFor(current));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Re-seed from the latest saved values each time the modal opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(formFor(current));
      setError(undefined);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const startingCash = form.startingCash.trim() ? Number(form.startingCash) : 0;
    const ownerCapital = form.ownerCapital.trim() ? Number(form.ownerCapital) : 0;
    if (Number.isNaN(startingCash) || Number.isNaN(ownerCapital)) {
      setError(t("Enter valid amounts"));
      return;
    }

    setSubmitting(true);
    try {
      await saveOpeningBalances({ brandId, startingCash, ownerCapital, asOfDate: form.asOfDate || null });
      toast.success(t("Starting balances saved"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Starting Cash & Capital")}</DialogTitle>
            <DialogDescription>
              {t("Your real bank/cash balance and the owner's capital on a given day. The Balance Sheet adds every flow recorded from that day on.")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starting-cash">{t("Starting bank / cash balance")} (EGP)</Label>
            <Input
              id="starting-cash"
              type="number"
              step="0.01"
              value={form.startingCash}
              onChange={(e) => setField("startingCash", e.target.value)}
              placeholder="0"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="owner-capital">{t("Owner's starting capital")} (EGP)</Label>
            <Input
              id="owner-capital"
              type="number"
              step="0.01"
              value={form.ownerCapital}
              onChange={(e) => setField("ownerCapital", e.target.value)}
              placeholder="0"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starting-as-of">{t("Balances as of")}</Label>
            <Input
              id="starting-as-of"
              type="date"
              value={form.asOfDate}
              onChange={(e) => setField("asOfDate", e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("Entries before this date are treated as already included in the balances above. Leave empty if these were your balances before the first recorded entry.")}
            </p>
          </div>

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
