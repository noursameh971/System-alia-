import { apiFetch } from "./apiClient";
import type { Brand } from "./types";

export function listBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>("/api/brands");
}
