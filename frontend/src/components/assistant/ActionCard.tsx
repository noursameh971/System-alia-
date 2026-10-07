"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Check, Link2, ReceiptText, X, type LucideIcon } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { confirmAssistantAction, rejectAssistantAction, type AssistantAction, type AssistantActionStatus } from "@/lib/assistant";
import { EXPENSE_CATEGORY_META, EXPENSE_PAYMENT_LABEL } from "@/lib/expenses";
import { formatPrice } from "@/lib/formatPrice";
import { REVENUE_CATEGORY_META } from "@/lib/revenues";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, REVENUE_CATEGORIES, type Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ReceiptThumb } from "./ReceiptThumb";

type FieldKind = "text" | "amount" | "date" | "expenseCategory" | "revenueCategory" | "paymentMethod";
interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** May be left empty. An emptied optional field isn't sent: the card can't clear a value, only change it. */
  optional?: boolean;
}

/** What the card shows and lets the admin edit — the same fields the server's per-kind overrides schema accepts. */
const FIELDS: Record<AssistantAction["toolName"], FieldSpec[]> = {
  propose_expense: [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "title", label: "Title", kind: "text" },
    { key: "category", label: "Category", kind: "expenseCategory" },
    { key: "paymentMethod", label: "Payment method", kind: "paymentMethod" },
    { key: "expenseDate", label: "Date", kind: "date" },
  ],
  propose_revenue: [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "source", label: "Source", kind: "text" },
    { key: "category", label: "Category", kind: "revenueCategory" },
    { key: "revenueDate", label: "Date", kind: "date" },
  ],
  propose_supplier_bill: [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "transactionDate", label: "Invoice date", kind: "date" },
    { key: "dueDate", label: "Due date", kind: "date", optional: true },
    { key: "notes", label: "Notes", kind: "text", optional: true },
  ],
};

const KIND: Record<AssistantAction["toolName"], { title: string; saved: string; icon: LucideIcon; iconClass: string }> = {
  propose_expense: { title: "Expense draft", saved: "Expense saved", icon: ArrowUpCircle, iconClass: "text-rose-500" },
  propose_revenue: { title: "Revenue draft", saved: "Revenue saved", icon: ArrowDownCircle, iconClass: "text-emerald-600" },
  propose_supplier_bill: { title: "Supplier bill draft", saved: "Supplier bill saved", icon: ReceiptText, iconClass: "text-amber-600" },
};

const STATUS_STYLE: Record<AssistantActionStatus, { label: string; className: string }> = {
  proposed: { label: "Awaiting confirmation", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  executed: { label: "Saved", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Cancelled", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  failed: { label: "Couldn't save", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function ActionCard({
  action,
  brands,
  onChange,
}: {
  action: AssistantAction;
  brands: Brand[];
  onChange: (action: AssistantAction) => void;
}) {
  const { t } = useLocale();
  const { mutate } = useSWRConfig();
  const fields = FIELDS[action.toolName];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, asString(action.payload[field.key])])),
  );
  const [submitting, setSubmitting] = useState<"confirm" | "reject" | null>(null);

  const editable = action.status === "proposed";
  const kind = KIND[action.toolName];
  const brand = brands.find((candidate) => candidate.id === action.brandId);
  const receiptUrl = typeof action.payload.receiptUrl === "string" && action.payload.receiptUrl ? action.payload.receiptUrl : null;
  const supplier = action.display?.supplier;
  const supplierId = typeof action.payload.ledgerEntityId === "string" ? action.payload.ledgerEntityId : null;
  const status = STATUS_STYLE[action.status];

  function displayValue(field: FieldSpec, raw: string): string {
    switch (field.kind) {
      case "amount":
        return formatPrice(Number(raw));
      case "expenseCategory":
        return t(EXPENSE_CATEGORY_META[raw as keyof typeof EXPENSE_CATEGORY_META]?.label ?? raw);
      case "revenueCategory":
        return t(REVENUE_CATEGORY_META[raw as keyof typeof REVENUE_CATEGORY_META]?.label ?? raw);
      case "paymentMethod":
        return t(EXPENSE_PAYMENT_LABEL[raw as keyof typeof EXPENSE_PAYMENT_LABEL] ?? raw);
      default:
        return raw || "—";
    }
  }

  /** Only what the admin actually changed, typed the way the server's schema expects. */
  function overrides(): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const field of fields) {
      const original = asString(action.payload[field.key]);
      const current = values[field.key] ?? "";
      if (current === original || (field.optional && !current.trim())) continue;
      changed[field.key] = field.kind === "amount" ? Number(current) : current;
    }
    return changed;
  }

  function refreshFinanceData() {
    // The Finance page (and dashboard) read these through SWR; revalidate
    // everything so a confirmed entry shows up without a reload.
    void mutate(() => true);
  }

  async function confirm() {
    setSubmitting("confirm");
    try {
      const result = await confirmAssistantAction(action.id, overrides());
      onChange(result.action);
      toast.success(t(kind.saved));
      refreshFinanceData();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("Something went wrong — please try again");
      toast.error(message);
      // 409 means the action left "proposed" (expired, failed, already
      // confirmed elsewhere) — reflect that instead of offering Confirm again.
      const nextStatus = err instanceof ApiError ? (err.details as { status?: AssistantActionStatus } | undefined)?.status : undefined;
      if (nextStatus) onChange({ ...action, status: nextStatus, error: nextStatus === "failed" ? message : action.error });
    } finally {
      setSubmitting(null);
    }
  }

  async function reject() {
    setSubmitting("reject");
    try {
      onChange(await rejectAssistantAction(action.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setSubmitting(null);
    }
  }

  function renderInput(field: FieldSpec) {
    const common = {
      id: `${action.id}-${field.key}`,
      value: values[field.key] ?? "",
      disabled: submitting !== null,
      onChange: (event: { target: { value: string } }) => setValues((previous) => ({ ...previous, [field.key]: event.target.value })),
    };
    const assumed = action.assumedFields.includes(field.key);
    const ring = assumed ? "border-amber-400 dark:border-amber-500" : undefined;
    switch (field.kind) {
      case "amount":
        return <Input {...common} type="number" min="0" step="0.01" inputMode="decimal" className={cn("h-8 tabular-nums", ring)} />;
      case "date":
        return <Input {...common} type="date" className={cn("h-8", ring)} />;
      case "expenseCategory":
        return (
          <Select {...common} className={cn("h-8", ring)}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(EXPENSE_CATEGORY_META[category].label)}
              </option>
            ))}
          </Select>
        );
      case "revenueCategory":
        return (
          <Select {...common} className={cn("h-8", ring)}>
            {REVENUE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(REVENUE_CATEGORY_META[category].label)}
              </option>
            ))}
          </Select>
        );
      case "paymentMethod":
        return (
          <Select {...common} className={cn("h-8", ring)}>
            {EXPENSE_PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(EXPENSE_PAYMENT_LABEL[method])}
              </option>
            ))}
          </Select>
        );
      default:
        return <Input {...common} dir="auto" className={cn("h-8", ring)} />;
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <kind.icon className={cn("size-4", kind.iconClass)} aria-hidden />
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(kind.title)}</span>
        {brand ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {brand.code}
          </span>
        ) : null}
        <span className={cn("ms-auto rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>{t(status.label)}</span>
      </div>

      {action.toolName === "propose_supplier_bill" && supplier ? (
        <p dir="auto" className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          {supplier}
        </p>
      ) : null}

      <div className="flex items-start gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
          {fields.map((field) => {
            const assumed = action.assumedFields.includes(field.key);
            return (
              <div key={field.key} className="contents">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <label htmlFor={`${action.id}-${field.key}`}>{t(field.label)}</label>
                  {assumed && editable ? (
                    <span
                      className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      title={t("The assistant filled this in — check it")}
                    >
                      {t("Assumed")}
                    </span>
                  ) : null}
                </dt>
                <dd className="min-w-0">
                  {editable ? (
                    renderInput(field)
                  ) : (
                    <span dir="auto" className="text-slate-800 dark:text-slate-200">
                      {displayValue(field, values[field.key] ?? "")}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        {receiptUrl ? (
          <ReceiptThumb
            url={receiptUrl}
            contentType={/\.pdf$/i.test(receiptUrl) ? "application/pdf" : "image/*"}
            className="h-28 w-20"
          />
        ) : null}
      </div>

      {action.toolName === "propose_expense" && supplierId ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          <span dir="auto">
            {t("Also recorded as a payment toward this supplier's balance")}
            {supplier ? `: ${supplier}` : ""}
          </span>
        </p>
      ) : null}
      {action.toolName === "propose_supplier_bill" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          {t("Adds to what we owe this supplier — not an expense until you pay it")}
        </p>
      ) : null}
      {action.status === "failed" && action.error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{action.error}</p> : null}

      {editable ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reject} disabled={submitting !== null}>
            <X className="size-3.5" />
            {t("Cancel")}
          </Button>
          <Button type="button" size="sm" onClick={confirm} disabled={submitting !== null || !values.amount}>
            <Check className="size-3.5" />
            {submitting === "confirm" ? t("Saving...") : t("Confirm")}
          </Button>
        </div>
      ) : action.status === "executed" && brand ? (
        <div className="mt-2 text-end">
          {action.toolName === "propose_supplier_bill" && supplierId ? (
            <Link
              href={`/${brand.code.toLowerCase()}/finance/suppliers/${supplierId}`}
              className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
            >
              {t("View supplier")}
            </Link>
          ) : (
            <Link href={`/${brand.code.toLowerCase()}/finance`} className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">
              {t("View in Finance")}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
