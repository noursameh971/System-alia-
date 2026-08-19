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
 * Display metadata for the six fashion-brand expense buckets. Labels are the
 * English source strings the dictionary is keyed by, so callers pass them
 * straight to t(). Colors are shared by the category badge and the stacked
 * chart so a bucket reads as the same color in both.
 */
export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; badgeClass: string; hex: string }
> = {
  marketing: {
    label: "Marketing & Ads",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    hex: "#8b5cf6",
  },
  salaries: {
    label: "Salaries",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    hex: "#3b82f6",
  },
  production: {
    label: "Production & Fabric",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    hex: "#10b981",
  },
  packaging: {
    label: "Packaging & Shipping",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    hex: "#f59e0b",
  },
  rent: {
    label: "Rent & Utilities",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    hex: "#f43f5e",
  },
  misc: {
    label: "Misc/Software",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    hex: "#94a3b8",
  },
};

export const EXPENSE_PAYMENT_LABEL: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  instapay: "InstaPay",
  other: "Other",
};
