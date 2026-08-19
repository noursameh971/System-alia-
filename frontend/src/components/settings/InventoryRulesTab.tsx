"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useLocale } from "@/context/LocaleContext";
import { updateSettings, listShippingRates, upsertShippingRate, deleteShippingRate } from "@/lib/settings";
import { formatPrice } from "@/lib/formatPrice";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsCard, SettingsField } from "./SettingsCard";

/** Settings > "Inventory Rules" — the app-wide Low Stock threshold and this workspace's default shipping fee per city. */
export function InventoryRulesTab() {
  const { brand } = useWorkspace();
  const { t } = useLocale();
  const { settings, isLoading: settingsLoading, mutate: mutateSettings } = useAppSettings();

  const [threshold, setThreshold] = useState("5");
  const [thresholdInitialized, setThresholdInitialized] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);

  if (settings && !thresholdInitialized) {
    setThreshold(String(settings.lowStockThreshold));
    setThresholdInitialized(true);
  }

  const [city, setCity] = useState("");
  const [rate, setRate] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: rates,
    isLoading: ratesLoading,
    mutate: mutateRates,
  } = useSWR(["shipping-rates", brand.id], () => listShippingRates(brand.id));

  async function handleSaveThreshold(e: FormEvent) {
    e.preventDefault();
    const value = Number(threshold);
    if (!Number.isInteger(value) || value < 0) {
      toast.error("Enter a whole number, 0 or more");
      return;
    }
    setSavingThreshold(true);
    try {
      await updateSettings({ lowStockThreshold: value });
      void mutateSettings();
      toast.success(t("Low stock threshold saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save threshold");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function handleAddRate(e: FormEvent) {
    e.preventDefault();
    if (!city.trim()) {
      toast.error("Enter a city name");
      return;
    }
    const value = Number(rate);
    if (Number.isNaN(value) || value < 0) {
      toast.error("Enter a rate of 0 or more");
      return;
    }
    setSubmittingRate(true);
    try {
      await upsertShippingRate({ brandId: brand.id, city: city.trim(), rate: value });
      setCity("");
      setRate("");
      void mutateRates();
      toast.success(t("Shipping rate saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save shipping rate");
    } finally {
      setSubmittingRate(false);
    }
  }

  async function handleDeleteRate(id: string, cityName: string) {
    setDeletingId(id);
    try {
      await deleteShippingRate(id);
      void mutateRates();
      toast.success(`${cityName} ${t("shipping rate removed")}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove shipping rate");
    } finally {
      setDeletingId(null);
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
            <Spinner label="Loading..." />
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

      <SettingsCard
        title={t("Default Shipping Rates")}
        description={`${t("Per-city shipping fee pre-filled on new orders for")} ${brand.name}.`}
      >
        <form onSubmit={handleAddRate} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
            <Label htmlFor="shipping-city" className="text-xs">
              {t("City")}
            </Label>
            <Input
              id="shipping-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cairo"
              disabled={submittingRate}
              className="sm:w-44"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shipping-rate" className="text-xs">
              {t("Rate")}
            </Label>
            <Input
              id="shipping-rate"
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
              disabled={submittingRate}
              className="w-28"
            />
          </div>
          <Button type="submit" disabled={submittingRate}>
            <Plus className="size-4" />
            {t("Add")}
          </Button>
        </form>

        {ratesLoading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading shipping rates..." />
          </div>
        ) : !rates || rates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t("No shipping rates set yet.")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("City")}</TableHead>
                  <TableHead className="text-end">{t("Rate")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{r.city}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatPrice(r.rate)}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDeleteRate(r.id, r.city)}
                        disabled={deletingId === r.id}
                        aria-label={`Remove shipping rate for ${r.city}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
