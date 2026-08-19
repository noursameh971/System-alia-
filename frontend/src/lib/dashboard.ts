import { apiFetch } from "./apiClient";
import type { BrandDashboardSummary, DashboardSummary } from "./types";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}

/** Backs the brand-scoped /[brand]/dashboard page. */
export function getBrandDashboardSummary(brandId: string): Promise<BrandDashboardSummary> {
  return apiFetch<BrandDashboardSummary>(`/api/dashboard/brand-summary?brandId=${encodeURIComponent(brandId)}`);
}
