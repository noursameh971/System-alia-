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
import { ApiError } from "@/lib/apiClient";
import { importOrdersWorkbook } from "@/lib/orders";
import type { ImportOrdersResult } from "@/lib/types";

interface ImportOrdersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSuccess: () => void;
}

export function ImportOrdersModal({ open, onOpenChange, brandId, onSuccess }: ImportOrdersModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportOrdersResult | null>(null);

  function resetForm() {
    setFile(null);
    setResult(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    event.target.value = "";
  }

  async function handleImport() {
    if (!file) {
      toast.error("Choose an .xlsx file first");
      return;
    }

    setSubmitting(true);
    try {
      const outcome = await importOrdersWorkbook(brandId, file);
      setResult(outcome);
      if (outcome.ordersCreated > 0) onSuccess();
      if (outcome.errors.length === 0) {
        toast.success(`Created ${outcome.ordersCreated} order${outcome.ordersCreated === 1 ? "" : "s"}`);
      } else {
        toast.warning(`Imported with ${outcome.errors.length} row error${outcome.errors.length === 1 ? "" : "s"} — see details below`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to import the file");
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
          <DialogTitle>Import orders</DialogTitle>
          <DialogDescription>
            Upload an .xlsx sheet to bulk-create orders. Rows sharing an &ldquo;Order Ref&rdquo; become one order —
            list one SKU/Quantity per line, and leave &ldquo;Order Ref&rdquo; blank on every line after the first to
            continue it. Each group always creates a new order (existing orders aren&apos;t updated by import).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <FileSpreadsheet className="size-8 shrink-0 text-slate-400 dark:text-slate-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {file ? file.name : "No file selected"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">.xlsx only</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
              <Upload className="size-3.5" />
              Choose file
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          </div>

          {result ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-100 px-2 py-2 dark:bg-slate-800">
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{result.totalRows}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Rows</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2 py-2 dark:bg-emerald-950">
                  <p className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{result.ordersCreated}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Orders created</p>
                </div>
                <div className="rounded-lg bg-blue-50 px-2 py-2 dark:bg-blue-950">
                  <p className="text-base font-semibold text-blue-700 dark:text-blue-300">{result.itemsImported}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Items</p>
                </div>
              </div>

              {result.errors.length > 0 ? (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/40">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700 dark:text-red-300">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={submitting || !file}>
            {submitting ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
