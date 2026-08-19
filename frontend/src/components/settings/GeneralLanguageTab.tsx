"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Image as ImageIcon, Languages, Upload } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useLocale } from "@/context/LocaleContext";
import { updateSettings } from "@/lib/settings";
import { getBrandProfile, updateBrandProfile, uploadBrandLogo } from "@/lib/brands";
import { resolveImageUrl } from "@/lib/images";
import { ApiError } from "@/lib/apiClient";
import type { AppLocale } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/Spinner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SettingsCard, SettingsField } from "./SettingsCard";

const CURRENCIES = [
  { code: "EGP", label: "Egyptian Pound" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "AED", label: "UAE Dirham" },
] as const;

/**
 * Settings > "General & Language" — the org-wide language + currency
 * defaults, plus this workspace's business name and logo. Scoped to the
 * current [brand] route, so there's no brand picker.
 */
export function GeneralLanguageTab() {
  const { brand } = useWorkspace();
  const { t, locale, setLocale } = useLocale();
  const { settings, isLoading: settingsLoading, mutate: mutateSettings } = useAppSettings();
  const {
    data: profile,
    isLoading: profileLoading,
    mutate: mutateProfile,
  } = useSWR(["brand-profile", brand.id], () => getBrandProfile(brand.id));

  const [currency, setCurrency] = useState("EGP");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);

  if (settings && !currencyInitialized) {
    setCurrency(settings.defaultCurrency);
    setCurrencyInitialized(true);
  }

  const [name, setName] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (profile && profileKey !== profile.id) {
    setName(profile.name);
    setReceiptNotes(profile.receiptNotes ?? "");
    setProfileKey(profile.id);
  }

  // Object URLs are a manual-allocation API — without this the blob stays
  // pinned in memory for the life of the document every time a logo is picked.
  useEffect(() => {
    if (!localLogoPreview) return;
    return () => URL.revokeObjectURL(localLogoPreview);
  }, [localLogoPreview]);

  /**
   * Language applies the moment it's clicked rather than on Save — the whole
   * point of the control is to *see* the app flip to RTL Arabic, and making
   * that wait behind a save button means judging the choice blind. Save then
   * persists it as the org-wide default for everyone else.
   */
  function handleLanguageChange(next: AppLocale) {
    setLocale(next);
  }

  async function handleSaveGeneral(e: FormEvent) {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await updateSettings({ defaultLanguage: locale, defaultCurrency: currency.trim().toUpperCase() });
      void mutateSettings();
      toast.success(t("Settings saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSavingGeneral(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Business name is required");
      return;
    }
    setSavingProfile(true);
    try {
      await updateBrandProfile(brand.id, { name: name.trim(), receiptNotes: receiptNotes.trim() });
      void mutateProfile();
      toast.success(t("Brand profile saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save brand profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLogoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    // Swap the preview to the local blob first so the tile updates on the
    // same frame as the file picker closing, instead of after the round trip.
    setLocalLogoPreview(URL.createObjectURL(file));
    setUploadingLogo(true);
    try {
      await uploadBrandLogo(brand.id, file);
      await mutateProfile();
      toast.success(t("Logo updated"));
    } catch (err) {
      setLocalLogoPreview(null); // upload failed — fall back to whatever is stored
      toast.error(err instanceof ApiError ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  const logoPreview = localLogoPreview ?? resolveImageUrl(profile?.logoUrl);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SettingsCard
        as="form"
        onSubmit={handleSaveGeneral}
        title={t("Language & Region")}
        description={t("Applies to everyone in this organization.")}
        footer={
          <Button type="submit" disabled={savingGeneral || settingsLoading}>
            {savingGeneral ? t("Saving...") : t("Save changes")}
          </Button>
        }
      >
        <SettingsField
          label={t("Language")}
          hint={t("Switches instantly for you. Saving makes it the default for the whole organization.")}
        >
          <SegmentedControl
            ariaLabel={t("Language")}
            value={locale}
            onChange={handleLanguageChange}
            options={[
              { value: "en", label: "English", hint: "LTR" },
              { value: "ar", label: "العربية", hint: "RTL" },
            ]}
            className="max-w-sm"
          />
        </SettingsField>

        <SettingsField
          label={t("Currency")}
          htmlFor="settings-currency"
          hint={t("Used for all prices, costs, and financial reports.")}
        >
          {settingsLoading ? (
            <Spinner label="Loading..." />
          ) : (
            <Select
              id="settings-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={savingGeneral}
              wrapperClassName="max-w-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {t(c.label)}
                </option>
              ))}
            </Select>
          )}
        </SettingsField>

        <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3.5 py-3 dark:bg-slate-950/50">
          <Languages className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t("Arabic switches the entire interface to right-to-left, including navigation, tables, and forms.")}
          </p>
        </div>
      </SettingsCard>

      {profileLoading ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading brand profile..." />
        </div>
      ) : (
        <SettingsCard
          as="form"
          onSubmit={handleSaveProfile}
          title={t("Brand Identity")}
          description={t("The name and logo shown in the header, receipts, and printed labels.")}
          footer={
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? t("Saving...") : t("Save changes")}
            </Button>
          }
        >
          <SettingsField label={t("Brand Name")} htmlFor="brand-name" className="max-w-sm">
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} disabled={savingProfile} />
          </SettingsField>

          <SettingsField label={t("Logo")} hint={t("Square images work best. PNG or SVG, up to 2 MB.")}>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: preview or uploaded URL, neither of which next/image can optimize
                  <img src={logoPreview} alt={brand.name} className="size-full object-contain" />
                ) : (
                  <ImageIcon className="size-7 text-slate-300 dark:text-slate-600" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                <Upload className="size-3.5" />
                {uploadingLogo ? t("Uploading...") : logoPreview ? t("Replace logo") : t("Upload logo")}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </div>
          </SettingsField>

          <SettingsField
            label={t("Receipt Header Notes")}
            htmlFor="brand-receipt-notes"
            hint={t("Printed under the brand name on every receipt — e.g. return policy or tax number.")}
          >
            <textarea
              id="brand-receipt-notes"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              disabled={savingProfile}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition-colors focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:border-slate-500 dark:focus-visible:ring-slate-100/10"
            />
          </SettingsField>
        </SettingsCard>
      )}
    </div>
  );
}
