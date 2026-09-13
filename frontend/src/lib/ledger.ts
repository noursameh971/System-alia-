import { apiFetch, apiFetchBlob } from "./apiClient";
import type {
  CashFlowSummary,
  CreateChargeInput,
  CreateOpeningBalanceInput,
  LedgerEntity,
  LedgerEntityDetail,
  LedgerBalanceType,
  LedgerEntityCategory,
  LedgerTransaction,
  LedgerTransactionKind,
  RecordPaymentInput,
  UpdateLedgerEntityInput,
  UpdateLedgerTransactionInput,
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

/** The Supplier Detail page's main data source. */
export function getLedgerEntity(entityId: string): Promise<LedgerEntityDetail> {
  return apiFetch<LedgerEntityDetail>(`/api/ledger/entities/${encodeURIComponent(entityId)}`);
}

/** "Edit Supplier Info". */
export function updateLedgerEntity(entityId: string, input: UpdateLedgerEntityInput): Promise<LedgerEntity> {
  return apiFetch<LedgerEntity>(`/api/ledger/entities/${encodeURIComponent(entityId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** "Add New Bill / Invoice". */
export function createLedgerCharge(entityId: string, input: CreateChargeInput): Promise<LedgerEntity> {
  return apiFetch<LedgerEntity>(`/api/ledger/entities/${encodeURIComponent(entityId)}/charges`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** "Export Statement" on the Supplier Detail page — this supplier's own history, not the whole ledger. */
export function exportLedgerEntityStatement(entityId: string): Promise<Blob> {
  return apiFetchBlob(`/api/ledger/entities/${encodeURIComponent(entityId)}/export`);
}

/** Editing/adjusting one row in a supplier's transaction history. */
export function updateLedgerTransaction(transactionId: string, input: UpdateLedgerTransactionInput): Promise<LedgerTransaction> {
  return apiFetch<LedgerTransaction>(`/api/ledger/transactions/${encodeURIComponent(transactionId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteLedgerTransaction(transactionId: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/ledger/transactions/${encodeURIComponent(transactionId)}`, {
    method: "DELETE",
  });
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

/** Display metadata for a transaction history row's kind, on the Supplier Detail page. */
export const LEDGER_TRANSACTION_KIND_META: Record<LedgerTransactionKind, { label: string; badgeClass: string }> = {
  opening_balance: { label: "Opening Balance", badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  charge: { label: "Charge", badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  payment: { label: "Payment", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
};
