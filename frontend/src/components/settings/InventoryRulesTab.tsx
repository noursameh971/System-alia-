"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useLocale } from "@/context/LocaleContext";
import { updateSettings } from "@/lib/settings";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsCard, SettingsField } from "./SettingsCard";

/** Settings > "Inventory Rules" — the app-wide Low Stock threshold. */
export function InventoryRulesTab() {
  const { t } = useLocale();
  const { settings, isLoading: settingsLoading, mutate: mutateSettings } = useAppSettings();

  const [threshold, setThreshold] = useState("5");
  const [thresholdInitialized, setThresholdInitialized] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);

  if (settings && !thresholdInitialized) {
    setThreshold(String(settings.lowStockThreshold));
    setThresholdInitialized(true);
  }

  async function handleSaveThreshold(e: FormEvent) {
    e.preventDefault();
    const value = Number(threshold);
    if (!Number.isInteger(value) || value < 0) {
      toast.error(t("Enter a whole number, 0 or more"));
      return;
    }
    setSavingThreshold(true);
    try {
      await updateSettings({ lowStockThreshold: value });
      void mutateSettings();
      toast.success(t("Low stock threshold saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to save threshold"));
    } finally {
      setSavingThreshold(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SettingsCard
        as="form"
        onSubmit={handleSaveThreshold}
        title={t("Low Stock Alert Threshold")}
        description={t("Variants at or under this many units on hand are flagged Low Stock across the Dashboard and Stock Levels table.")}
        footer={
          <Button type="submit" disabled={savingThreshold || settingsLoading}>
            {savingThreshold ? t("Saving...") : t("Save changes")}
          </Button>
        }
      >
        <SettingsField
          label={t("Threshold")}
          htmlFor="low-stock-threshold"
          hint={t("Applies organization-wide, not per workspace.")}
          className="max-w-xs"
        >
          {settingsLoading ? (
            <Spinner label={t("Loading...")} />
          ) : (
            <div className="flex items-center gap-2">
              <Input
                id="low-stock-threshold"
                type="number"
                min={0}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                disabled={savingThreshold}
                className="w-24"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">{t("units")}</span>
            </div>
          )}
        </SettingsField>
      </SettingsCard>
    </div>
  );
}
