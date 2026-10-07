import { apiFetch, apiFetchBlob, apiFetchUpload } from "./apiClient";
import type {
  CreateExpenseInput,
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  FinanceSummary,
  ImportFinanceResult,
  UpdateExpenseInput,
} from "./types";

export interface ListExpensesParams {
  brandId: string;
  category?: ExpenseCategory | null;
  from?: string | null;
  to?: string | null;
}

export function listExpenses(params: ListExpensesParams): Promise<Expense[]> {
  const query = new URLSearchParams({ brandId: params.brandId });
  if (params.category) query.set("category", params.category);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return apiFetch<Expense[]>(`/api/expenses?${query.toString()}`);
}

export function getFinanceSummary(brandId: string): Promise<FinanceSummary> {
  return apiFetch<FinanceSummary>(`/api/expenses/summary?brandId=${encodeURIComponent(brandId)}`);
}

export function createExpense(input: CreateExpenseInput): Promise<Expense> {
  return apiFetch<Expense>("/api/expenses", { method: "POST", body: JSON.stringify(input) });
}

export function updateExpense(id: string, input: UpdateExpenseInput): Promise<Expense> {
  return apiFetch<Expense>(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteExpense(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function exportExpensesWorkbook(brandId: string): Promise<Blob> {
  return apiFetchBlob(`/api/expenses/export?brandId=${encodeURIComponent(brandId)}`);
}

/** Drives both the Expenses and Suppliers & Debts Ledger importers off whichever sheets the uploaded workbook actually has — see the backend's importFinanceWorkbook for the sheet-detection rules. */
export function importExpensesWorkbook(brandId: string, file: File): Promise<ImportFinanceResult> {
  return apiFetchUpload<ImportFinanceResult>(`/api/expenses/import?brandId=${encodeURIComponent(brandId)}`, file);
}

/**
 * Display metadata for the fashion-brand expense buckets. Labels are the
 * English source strings the dictionary is keyed by, so callers pass them
 * straight to t().
 *
 * `color` is a CSS variable (defined in globals.css, with separate light
 * and dark steps) rather than a hex, so the stacked breakdown chart follows
 * the color scheme. The eight values are a validated categorical palette
 * in a fixed order: every pair of neighboring segments in the stack stays
 * distinguishable under red-green colorblindness (the common forms) and
 * normal vision, in both modes. Adding a ninth category means re-running that validation, not
 * picking a new color by eye. Badge tints follow the same hue families.
 */
export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; badgeClass: string; color: string }
> = {
  marketing: {
    label: "Marketing & Ads",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    color: "var(--chart-expense-marketing)",
  },
  salaries: {
    label: "Salaries",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    color: "var(--chart-expense-salaries)",
  },
  production: {
    label: "Production & Fabric",
    badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    color: "var(--chart-expense-production)",
  },
  packaging: {
    label: "Fulfillment & Packing",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    color: "var(--chart-expense-packaging)",
  },
  rent: {
    label: "Rent & Utilities",
    badgeClass: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
    color: "var(--chart-expense-rent)",
  },
  professional_fees: {
    label: "Legal & Professional Fees",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    color: "var(--chart-expense-professional-fees)",
  },
  logistics: {
    label: "Logistics & Transport",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    color: "var(--chart-expense-logistics)",
  },
  misc: {
    label: "Misc/Software",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    color: "var(--chart-expense-misc)",
  },
};

export const EXPENSE_PAYMENT_LABEL: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  instapay: "InstaPay",
  other: "Other",
};
