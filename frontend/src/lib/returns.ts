import { apiFetch } from "./apiClient";
import type { CreatedReturn, ReturnDisposition, ReturnListItem } from "./types";

export function listReturns(orderId?: string): Promise<ReturnListItem[]> {
  const query = orderId ? `?orderId=${orderId}` : "";
  return apiFetch<ReturnListItem[]>(`/api/returns${query}`);
}

export interface CreateReturnInput {
  orderItemId: string;
  quantity: number;
  reasonCodeId: string;
  disposition: ReturnDisposition;
  restockBinId?: string;
  notes?: string;
}

export function createReturn(payload: CreateReturnInput): Promise<CreatedReturn> {
  return apiFetch<CreatedReturn>("/api/returns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
