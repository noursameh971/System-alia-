"use client";

import { useRef, type ChangeEvent } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";

interface ProductImageInputProps {
  /** Object URL of a staged file, the typed URL, or the existing product's resolved image — whichever is currently "the" image, for the live preview. */
  previewUrl: string | null;
  urlValue: string;
  onUrlChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

/** URL text field + file picker with a live preview, shared by the Add and Edit product modals. The parent owns which mode "wins" (see AddProductModal/ProductFormModal) — this component just reports raw input changes. */
export function ProductImageInput({ previewUrl, urlValue, onUrlChange, onFileSelect, disabled }: ProductImageInputProps) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onFileSelect(event.target.files?.[0] ?? null);
    event.target.value = ""; // allow re-selecting the same file after removing it
  }

  function handleRemove() {
    onUrlChange("");
    onFileSelect(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t("Product image")}</Label>
      <p className="text-xs text-slate-400 dark:text-slate-500">{t("Image URL or upload a file")}</p>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/uploaded/staged-file URL, next/image can't handle these
            <img src={previewUrl} alt={t("Preview")} className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* dir="ltr" so a pasted URL doesn't render with its scheme
              visually flipped to the far side of the field in Arabic — URLs
              are always LTR regardless of interface language. */}
          <Input
            dir="ltr"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://..."
            disabled={disabled}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
              <Upload className="size-3.5" />
              {t("Upload file")}
            </Button>
            {previewUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={disabled}>
                <X className="size-3.5" />
                {t("Remove")}
              </Button>
            ) : null}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
}
