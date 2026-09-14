"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { uploadReceiptFile } from "@/lib/uploads";
import { resolveImageUrl } from "@/lib/images";
import { ApiError } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function filenameFromUrl(url: string): string {
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

/**
 * Receipt/invoice uploader shared by the Add Expense and Add Opening
 * Balance modals — uploads the picked file immediately
 * (POST /api/uploads/receipts) and reports back the resulting URL,
 * replacing the old "paste a URL" text field with a real local-device
 * upload while keeping the same `receiptUrl: string` shape everything
 * downstream (ExpenseTable's "View receipt", the create/update payloads)
 * already expects.
 */
export function ReceiptUploadField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file after removing it
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("File must be 8MB or smaller"));
      return;
    }

    setUploading(true);
    try {
      const result = await uploadReceiptFile(file);
      onChange(result.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Failed to upload file"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="receipt-upload-input">
        {label ?? t("Receipt / Invoice")} <span className="font-normal text-slate-400">({t("optional")})</span>
      </Label>

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
          <FileText className="size-4 shrink-0 text-slate-400" />
          <a
            href={resolveImageUrl(value) ?? value}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="min-w-0 flex-1 truncate text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {filenameFromUrl(value)}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => onChange("")}
            disabled={disabled}
            aria-label={t("Remove")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? t("Uploading...") : t("Upload receipt")}
        </Button>
      )}

      <input
        id="receipt-upload-input"
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
      />
    </div>
  );
}
