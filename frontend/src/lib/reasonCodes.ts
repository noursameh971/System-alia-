import { apiFetch } from "./apiClient";
import type { ReasonCode } from "./types";

export function listReasonCodes(appliesTo?: "stock_movement" | "return"): Promise<ReasonCode[]> {
  const query = appliesTo ? `?appliesTo=${appliesTo}` : "";
  return apiFetch<ReasonCode[]>(`/api/reason-codes${query}`);
}
