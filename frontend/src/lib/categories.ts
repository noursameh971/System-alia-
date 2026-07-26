import { apiFetch } from "./apiClient";
import type { Category } from "./types";

export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/categories");
}
