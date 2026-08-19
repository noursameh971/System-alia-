import { apiFetch } from "./apiClient";
import type { AppSettings, ShippingRate, UpdateSettingsInput, UpsertShippingRateInput } from "./types";

export function getSettings(): Promise<AppSettings> {
  return apiFetch<AppSettings>("/api/settings");
}

/** Backs the Settings page's "General & Localization" and "Inventory & Operations" tabs' save actions. */
export function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  return apiFetch<AppSettings>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listShippingRates(brandId?: string | null): Promise<ShippingRate[]> {
  const query = brandId ? `?brandId=${encodeURIComponent(brandId)}` : "";
  return apiFetch<ShippingRate[]>(`/api/settings/shipping-rates${query}`);
}

/** Insert-or-update by (brandId, city) — the Inventory & Operations tab's shipping-rate row editor. */
export function upsertShippingRate(input: UpsertShippingRateInput): Promise<ShippingRate> {
  return apiFetch<ShippingRate>("/api/settings/shipping-rates", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteShippingRate(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/settings/shipping-rates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
