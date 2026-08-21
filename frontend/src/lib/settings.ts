import { apiFetch } from "./apiClient";
import type { AppSettings, UpdateSettingsInput } from "./types";

export function getSettings(): Promise<AppSettings> {
  return apiFetch<AppSettings>("/api/settings");
}

/** Backs the Settings page's "General & Localization" tab's save action. */
export function updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
  return apiFetch<AppSettings>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Settings > Danger Zone. The server re-checks the literal "RESET" confirmation independently — this isn't just a client-side gate. */
export function resetSystemData(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/settings/reset-data", {
    method: "POST",
    body: JSON.stringify({ confirmation: "RESET" }),
  });
}
