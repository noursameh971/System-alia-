"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { importExpensesWorkbook } from "@/lib/expenses";
import type { ImportFinanceResult, ImportSectionResult } from "@/lib/types";

/** One "Created / Skipped [/ errors]" block, reused for both the Expenses and Ledger sections since they're the same shape. */
function ImportSection({ title, result }: { title: string; result: ImportSectionResult }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 px-2 py-2 dark:bg-emerald-950">
          <p className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{result.created}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("Created")}</p>
        </div>
        <div className="rounded-lg bg-slate-100 px-2 py-2 dark:bg-slate-800">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{result.skipped}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("Skipped")}</p>
        </div>
      </div>
      {result.errors.length > 0 ? (
        <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/40">
          {result.errors.map((message, index) => (
            <p key={index} className="text-xs text-red-700 dark:text-red-300">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ImportExpensesModal({
  open,
  onOpenChange,
  brandId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportFinanceResult | null>(null);

  function resetForm() {
    setFile(null);
    setResult(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    event.target.value = ""; // allow re-picking the same file after a failed run
  }

  async function handleImport() {
    if (!file) return;

    setSubmitting(true);
    try {
      const outcome = await importExpensesWorkbook(brandId, file);
      setResult(outcome);

      const totalCreated = (outcome.expenses?.created ?? 0) + (outcome.ledger?.created ?? 0);
      const totalErrors = (outcome.expenses?.errors.length ?? 0) + (outcome.ledger?.errors.length ?? 0);
      if (totalCreated > 0) onSuccess();

      if (totalErrors === 0) {
        toast.success(`${t("Imported")} ${totalCreated} ${t(totalCreated === 1 ? "record" : "records")}`);
      } else {
        toast.warning(`${t("Imported with")} ${totalErrors} ${t("row errors — see details below")}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to import the file"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Import expenses")}</DialogTitle>
          <DialogDescription>
            {t(
              "Upload an .xlsx with a sheet named \"Expenses\" and/or \"Ledger\". Expenses needs Date, Title, Category, Amount, and Payment Method columns; Ledger needs Entity/Supplier Name, Category, Type, and an amount column. Exported files re-import cleanly.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <FileSpreadsheet className="size-8 shrink-0 text-slate-400 dark:text-slate-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {file ? file.name : t("No file selected")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">.xlsx</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
              <Upload className="size-3.5" />
              {t("Choose file")}
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          </div>

          {result ? (
            <div className="flex flex-col gap-3">
              {result.expenses ? <ImportSection title={t("Expenses")} result={result.expenses} /> : null}
              {result.ledger ? <ImportSection title={t("Suppliers & Debts Ledger")} result={result.ledger} /> : null}
              {!result.expenses && !result.ledger ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('No "Expenses" or "Ledger" sheet was found in that file.')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {result ? t("Close") : t("Cancel")}
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={submitting || !file}>
            {submitting ? t("Importing...") : t("Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
