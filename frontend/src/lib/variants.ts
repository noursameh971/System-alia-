import { apiFetch } from "./apiClient";
import type { VariantLookupResult } from "./types";

/** Resolves a scanned/typed SKU (the QR payload) to full variant details. */
export function getVariantBySku(sku: string): Promise<VariantLookupResult> {
  return apiFetch<VariantLookupResult>(`/api/products/variants/by-sku/${encodeURIComponent(sku)}`);
}
