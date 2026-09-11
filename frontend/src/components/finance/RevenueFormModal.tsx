"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { createRevenue, updateRevenue, REVENUE_CATEGORY_META } from "@/lib/revenues";
import { ApiError } from "@/lib/apiClient";
import { REVENUE_CATEGORIES, type Revenue, type RevenueCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

interface FormState {
  source: string;
  amount: string;
  category: RevenueCategory;
  revenueDate: string;
  notes: string;
}

function blankForm(): FormState {
  return {
    source: "",
    amount: "",
    category: "product_sales",
    revenueDate: todayLocal(),
    notes: "",
  };
}

function formFor(revenue: Revenue): FormState {
  return {
    source: revenue.source,
    amount: String(revenue.amount),
    category: revenue.category,
    revenueDate: revenue.revenueDate,
    notes: revenue.notes ?? "",
  };
}

/** Handles both "+ Add Revenue" and the table's row-level Edit — one form, since the fields are identical and only the submit target differs. Mirrors ExpenseFormModal. */
export function RevenueFormModal({
  open,
  onOpenChange,
  brandId,
  editing,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** null = create mode. */
  editing: Revenue | null;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<FormState>(() => (editing ? formFor(editing) : blankForm()));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Re-seed at render time when the modal is pointed at a different record —
  // React's documented "reset state when a prop changes" pattern, which this
  // codebase uses instead of a syncing effect (react-hooks/set-state-in-effect).
  const [seededFor, setSeededFor] = useState<string | null>(editing?.id ?? null);
  if (open && seededFor !== (editing?.id ?? null)) {
    setForm(editing ? formFor(editing) : blankForm());
    setErrors({});
    setSeededFor(editing?.id ?? null);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.source.trim()) next.source = t("Source is required");

    const amount = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(amount) || amount <= 0) next.amount = t("Enter an amount > 0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.revenueDate)) next.revenueDate = t("Pick a date");

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        source: form.source.trim(),
        category: form.category,
        amount: Number(form.amount),
        revenueDate: form.revenueDate,
        notes: form.notes.trim(),
      };

      if (editing) {
        await updateRevenue(editing.id, payload);
        toast.success(t("Revenue updated"));
      } else {
        await createRevenue({ brandId, ...payload });
        toast.success(t("Revenue added"));
      }

      onSuccess();
      onOpenChange(false);
      setForm(blankForm());
      setSeededFor(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? t("Edit revenue") : t("Add revenue")}</DialogTitle>
            <DialogDescription>
              {t("Recorded against this workspace and counted in Gross Revenue and Net Profit straight away.")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revenue-source">{t("Source")}</Label>
            <Input
              id="revenue-source"
              value={form.source}
              onChange={(e) => setField("source", e.target.value)}
              placeholder={t("e.g. Wholesale order — Cairo Boutique")}
              disabled={submitting}
              aria-invalid={Boolean(errors.source)}
            />
            {errors.source ? <p className="text-xs text-red-600 dark:text-red-400">{errors.source}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="revenue-amount">{t("Amount")} (EGP)</Label>
              <Input
                id="revenue-amount"
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="revenue-category">{t("Category")}</Label>
              <Select
                id="revenue-category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value as RevenueCategory)}
                disabled={submitting}
              >
                {REVENUE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(REVENUE_CATEGORY_META[category].label)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revenue-date">{t("Date")}</Label>
            <Input
              id="revenue-date"
              type="date"
              value={form.revenueDate}
              onChange={(e) => setField("revenueDate", e.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errors.revenueDate)}
            />
            {errors.revenueDate ? <p className="text-xs text-red-600 dark:text-red-400">{errors.revenueDate}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revenue-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <textarea
              id="revenue-notes"
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
              {submitting ? t("Saving...") : editing ? t("Save changes") : t("Add revenue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
