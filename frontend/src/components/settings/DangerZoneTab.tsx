"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { resetSystemData } from "@/lib/settings";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "./SettingsCard";

const CONFIRMATION_WORD = "RESET";

/** Settings > "Danger Zone" — an irreversible, system-wide wipe of transactional history. Gated behind two independent confirmations (typed word + explicit acknowledgement) so it can't be triggered by a stray click. */
export function DangerZoneTab() {
  const { t } = useLocale();
  const router = useRouter();
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = typedConfirmation === CONFIRMATION_WORD && acknowledged && !submitting;

  async function handleReset() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await resetSystemData();
      toast.success(t("All transactional data has been cleared."));
      setTypedConfirmation("");
      setAcknowledged(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to reset data"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SettingsCard
        title={t("Reset All Data")}
        description={t("Permanently wipes every workspace's transactional history across the entire system. This cannot be undone.")}
        className="border-red-200 dark:border-red-900/60"
      >
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="text-sm text-red-800 dark:text-red-300">
            <p className="font-medium">{t("This will permanently delete, for every brand:")}</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-red-700 dark:text-red-400">
              <li>{t("All orders and returns")}</li>
              <li>{t("All stock movements and on-hand inventory counts")}</li>
              <li>{t("All expenses and supplier/debt ledger transactions")}</li>
            </ul>
            <p className="mt-1.5">
              {t("Products, brands, staff accounts, and settings are kept — only transactional history is cleared.")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="danger-zone-confirm-word">
            {t('Type "RESET" to confirm')}
          </Label>
          <Input
            id="danger-zone-confirm-word"
            value={typedConfirmation}
            onChange={(e) => setTypedConfirmation(e.target.value)}
            disabled={submitting}
            placeholder={CONFIRMATION_WORD}
            className="max-w-xs"
            autoComplete="off"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 select-none dark:text-slate-300">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 size-4 rounded border-slate-300 accent-red-600"
          />
          {t("I understand this action is permanent and cannot be undone.")}
        </label>

        <div>
          <Button
            type="button"
            onClick={() => void handleReset()}
            disabled={!canSubmit}
            className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 dark:bg-red-600 dark:text-white dark:hover:bg-red-500"
          >
            {submitting ? t("Resetting...") : t("Reset All Data")}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
