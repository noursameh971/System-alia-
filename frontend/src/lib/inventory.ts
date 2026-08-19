import { apiFetch } from "./apiClient";
import type {
  BatchMovementInput,
  BatchMovementResult,
  InventoryRow,
  MovementResult,
  RecentMovementLogItem,
  VariantInventoryRow,
} from "./types";

export interface InventoryFilters {
  brandId?: string | null;
  categoryId?: string | null;
  zoneId?: string | null;
  binId?: string | null;
}

function toQueryString(filters: InventoryFilters): string {
  const params = new URLSearchParams();
  if (filters.brandId) params.set("brandId", filters.brandId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.zoneId) params.set("zoneId", filters.zoneId);
  if (filters.binId) params.set("binId", filters.binId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listInventory(filters: InventoryFilters): Promise<InventoryRow[]> {
  return apiFetch<InventoryRow[]>(`/api/inventory${toQueryString(filters)}`);
}

export function getVariantInventory(variantId: string): Promise<VariantInventoryRow[]> {
  return apiFetch<VariantInventoryRow[]>(`/api/inventory/variants/${variantId}`);
}

export interface InboundMovementPayload {
  variantId: string;
  binId: string;
  quantity: number;
  notes?: string;
}

export interface OutboundMovementPayload {
  variantId: string;
  binId: string;
  quantity: number;
  notes?: string;
}

export interface TransferMovementPayload {
  variantId: string;
  fromBinId: string;
  toBinId: string;
  quantity: number;
  notes?: string;
}

export function recordInboundMovement(payload: InboundMovementPayload): Promise<MovementResult> {
  return apiFetch<MovementResult>("/api/stock-movements/inbound", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordOutboundMovement(payload: OutboundMovementPayload): Promise<MovementResult> {
  return apiFetch<MovementResult>("/api/stock-movements/outbound", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordTransferMovement(payload: TransferMovementPayload): Promise<MovementResult> {
  return apiFetch<MovementResult>("/api/stock-movements/transfer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Backs the Inventory page's "Execute Batch Action" button — processes every scanned line item in one transaction. */
export function recordBatchMovement(payload: BatchMovementInput): Promise<BatchMovementResult> {
  return apiFetch<BatchMovementResult>("/api/stock-movements/batch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Backs the Inventory page's "Recent Movements Log". */
export function listRecentMovements(brandId: string, limit = 10): Promise<RecentMovementLogItem[]> {
  return apiFetch<RecentMovementLogItem[]>(`/api/stock-movements/recent?brandId=${encodeURIComponent(brandId)}&limit=${limit}`);
}
