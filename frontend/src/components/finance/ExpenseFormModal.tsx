"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";
import { createExpense, updateExpense, EXPENSE_CATEGORY_META, EXPENSE_PAYMENT_LABEL } from "@/lib/expenses";
import { ApiError } from "@/lib/apiClient";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type Expense,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@/lib/types";
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
  title: string;
  amount: string;
  category: ExpenseCategory;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  receiptUrl: string;
  notes: string;
}

function blankForm(): FormState {
  return {
    title: "",
    amount: "",
    category: "marketing",
    expenseDate: todayLocal(),
    paymentMethod: "cash",
    receiptUrl: "",
    notes: "",
  };
}

function formFor(expense: Expense): FormState {
  return {
    title: expense.title,
    amount: String(expense.amount),
    category: expense.category,
    expenseDate: expense.expenseDate,
    paymentMethod: expense.paymentMethod,
    receiptUrl: expense.receiptUrl ?? "",
    notes: expense.notes ?? "",
  };
}

/** Handles both "+ Add Expense" and the table's row-level Edit — one form, since the fields are identical and only the submit target differs. */
export function ExpenseFormModal({
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
  editing: Expense | null;
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
    if (!form.title.trim()) next.title = t("Title is required");

    const amount = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(amount) || amount <= 0) next.amount = t("Enter an amount > 0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expenseDate)) next.expenseDate = t("Pick a date");

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        expenseDate: form.expenseDate,
        receiptUrl: form.receiptUrl.trim(),
        notes: form.notes.trim(),
      };

      if (editing) {
        await updateExpense(editing.id, payload);
        toast.success(t("Expense updated"));
      } else {
        await createExpense({ brandId, ...payload });
        toast.success(t("Expense added"));
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
            <DialogTitle>{editing ? t("Edit expense") : t("Add expense")}</DialogTitle>
            <DialogDescription>
              {t("Recorded against this workspace and counted in Net Profit straight away.")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-title">{t("Title")}</Label>
            <Input
              id="expense-title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder={t("e.g. Instagram ad campaign")}
              disabled={submitting}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? <p className="text-xs text-red-600 dark:text-red-400">{errors.title}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-amount">{t("Amount")} (EGP)</Label>
              <Input
                id="expense-amount"
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
              <Label htmlFor="expense-category">{t("Category")}</Label>
              <Select
                id="expense-category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value as ExpenseCategory)}
                disabled={submitting}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(EXPENSE_CATEGORY_META[category].label)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-date">{t("Date")}</Label>
              <Input
                id="expense-date"
                type="date"
                value={form.expenseDate}
                onChange={(e) => setField("expenseDate", e.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errors.expenseDate)}
              />
              {errors.expenseDate ? <p className="text-xs text-red-600 dark:text-red-400">{errors.expenseDate}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-payment">{t("Payment method")}</Label>
              <Select
                id="expense-payment"
                value={form.paymentMethod}
                onChange={(e) => setField("paymentMethod", e.target.value as ExpensePaymentMethod)}
                disabled={submitting}
              >
                {EXPENSE_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(EXPENSE_PAYMENT_LABEL[method])}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-receipt">
              {t("Receipt URL")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            {/* dir="ltr" so a pasted URL doesn't render with its scheme flipped to the far side of the field in Arabic. */}
            <Input
              id="expense-receipt"
              dir="ltr"
              value={form.receiptUrl}
              onChange={(e) => setField("receiptUrl", e.target.value)}
              placeholder="https://..."
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-notes">
              {t("Notes")} <span className="font-normal text-slate-400">({t("optional")})</span>
            </Label>
            <textarea
              id="expense-notes"
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
              {submitting ? t("Saving...") : editing ? t("Save changes") : t("Add expense")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
