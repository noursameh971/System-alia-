import { apiFetch, apiFetchBlob } from "./apiClient";
import type {
  CashFlowSummary,
  CreateOpeningBalanceInput,
  LedgerEntity,
  LedgerBalanceType,
  LedgerEntityCategory,
  RecordPaymentInput,
} from "./types";

export function listLedgerEntities(brandId: string): Promise<LedgerEntity[]> {
  return apiFetch<LedgerEntity[]>(`/api/ledger/entities?brandId=${encodeURIComponent(brandId)}`);
}

export function getCashFlowSummary(brandId: string): Promise<CashFlowSummary> {
  return apiFetch<CashFlowSummary>(`/api/ledger/summary?brandId=${encodeURIComponent(brandId)}`);
}

export function createOpeningBalance(input: CreateOpeningBalanceInput): Promise<LedgerEntity> {
  return apiFetch<LedgerEntity>("/api/ledger/opening-balance", { method: "POST", body: JSON.stringify(input) });
}

export function recordLedgerPayment(entityId: string, input: RecordPaymentInput): Promise<LedgerEntity> {
  return apiFetch<LedgerEntity>(`/api/ledger/entities/${encodeURIComponent(entityId)}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function exportLedgerWorkbook(brandId: string): Promise<Blob> {
  return apiFetchBlob(`/api/ledger/export?brandId=${encodeURIComponent(brandId)}`);
}

/**
 * Display metadata for the four supplier categories the spec names, plus a
 * catch-all "Other" so an entity always has somewhere to go. Labels are the
 * English source strings the dictionary is keyed by, so callers pass them
 * straight to t().
 */
export const LEDGER_CATEGORY_META: Record<LedgerEntityCategory, { label: string; badgeClass: string }> = {
  fabric: { label: "Fabric", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  stitching: { label: "Stitching", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  packaging: { label: "Packaging", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  courier: { label: "Courier", badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  other: { label: "Other", badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export const LEDGER_BALANCE_TYPE_META: Record<LedgerBalanceType, { label: string; badgeClass: string }> = {
  payable: { label: "Payable", badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  receivable: { label: "Receivable", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
};
