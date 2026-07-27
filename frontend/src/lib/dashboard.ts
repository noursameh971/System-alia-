import { apiFetch } from "./apiClient";
import type { DashboardSummary } from "./types";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}
