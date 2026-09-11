import { apiFetch } from "./apiClient";
import type { CreateRevenueInput, Revenue, RevenueCategory, UpdateRevenueInput } from "./types";

export interface ListRevenuesParams {
  brandId: string;
  category?: RevenueCategory | null;
  from?: string | null;
  to?: string | null;
}

export function listRevenues(params: ListRevenuesParams): Promise<Revenue[]> {
  const query = new URLSearchParams({ brandId: params.brandId });
  if (params.category) query.set("category", params.category);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return apiFetch<Revenue[]>(`/api/revenues?${query.toString()}`);
}

export function createRevenue(input: CreateRevenueInput): Promise<Revenue> {
  return apiFetch<Revenue>("/api/revenues", { method: "POST", body: JSON.stringify(input) });
}

export function updateRevenue(id: string, input: UpdateRevenueInput): Promise<Revenue> {
  return apiFetch<Revenue>(`/api/revenues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteRevenue(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/revenues/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Display metadata for the four revenue buckets. Labels are the English
 * source strings the dictionary is keyed by, so callers pass them straight
 * to t(). Colors are distinct from EXPENSE_CATEGORY_META's palette so a
 * revenue badge never reads as an expense badge at a glance.
 */
export const REVENUE_CATEGORY_META: Record<RevenueCategory, { label: string; badgeClass: string; hex: string }> = {
  product_sales: {
    label: "Product Sales",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    hex: "#10b981",
  },
  wholesale: {
    label: "Wholesale",
    badgeClass: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    hex: "#14b8a6",
  },
  shipping_income: {
    label: "Shipping Income",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    hex: "#0ea5e9",
  },
  other: {
    label: "Other Income",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    hex: "#94a3b8",
  },
};
