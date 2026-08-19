"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { createOpeningBalance, LEDGER_CATEGORY_META } from "@/lib/ledger";
import { ApiError } from "@/lib/apiClient";
import { LEDGER_BALANCE_TYPES, LEDGER_ENTITY_CATEGORIES, type LedgerBalanceType, type LedgerEntityCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormState {
  entityName: string;
  category: LedgerEntityCategory;
  balanceType: LedgerBalanceType;
  amount: string;
  dueDate: string;
  notes: string;
}

function blankForm(): FormState {
  return { entityName: "", category: "fabric", balanceType: "payable", amount: "", dueDate: "", notes: "" };
}

/**
 * "Opening Balances" — records a historical debt for a supplier/courier/
 * client that predates this system, or tops up an existing one. Always
 * creates an opening_balance transaction; it never edits an entity's
 * existing balance directly, so the ledger stays an append-only history
 * instead of a value someone can silently overwrite.
 */
export function OpeningBalanceModal({
  open,
  onOpenChange,
  brandId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(blankForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function resetForm() {
    setForm(blankForm());
    setErrors({});
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.entityName.trim()) next.entityName = t("Entity/Supplier name is required");
    const amount = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(amount) || amount <= 0) next.amount = t("Enter an amount > 0");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await createOpeningBalance({
        brandId,
        entityName: form.entityName.trim(),
        category: form.category,
        balanceType: form.balanceType,
        amount: Number(form.amount),
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success(t("Opening balance recorded"));
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("Opening Balances")}</DialogTitle>
            <DialogDescription>
              {t("Record a historical debt or credit that predates this system — a supplier balance carried forward, or COD a courier is still holding.")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opening-entity-name">{t("Entity/Supplier Name")}</Label>
            <Input
              id="opening-entity-name"
              value={form.entityName}
              onChange={(e) => setField("entityName", e.target.value)}
              placeholder={t("e.g. Al-Nasr Fabrics")}
              disabled={submitting}
              aria-invalid={Boolean(errors.entityName)}
            />
            {errors.entityName ? <p className="text-xs text-red-600 dark:text-red-400">{errors.entityName}</p> : null}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("An existing entity with this name is reused rather than duplicated.")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("Type")}</Label>
            <SegmentedControl
              ariaLabel={t("Type")}
              value={form.balanceType}
              onChange={(value) => setField("balanceType", value)}
              options={LEDGER_BALANCE_TYPES.map((type) => ({
                value: type,
                label: t(type === "payable" ? "Payable" : "Receivable"),
                hint: t(type === "payable" ? "We owe them" : "They owe us"),
              }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening-category">{t("Category")}</Label>
              <Select
                id="opening-category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value as LedgerEntityCategory)}
                disabled={submitting}
              >
                {LEDGER_ENTITY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(LEDGER_CATEGORY_META[category].label)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening-amount">{t("Amount")} (EGP)</Label>
              <Input
                id="opening-amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                aria-invalid={Boolean(errors.amount)}
              />
              {errors.amount ? <p className="text-xs text-red-600 dark:text-red-400">{errors.amount}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opening-due-date">
              {t("Due Date")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <Input
              id="opening-due-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opening-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <textarea
              id="opening-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              disabled={submitting}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition-colors focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Saving...") : t("Save opening balance")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
