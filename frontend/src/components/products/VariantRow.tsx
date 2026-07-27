"use client";

import { useState } from "react";
import type { ProductVariant } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { QrCodeIcon } from "@/components/layout/icons";
import { QrCodeModal } from "./QrCodeModal";

export function VariantRow({
  variant,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  variant: ProductVariant;
  /** When true, renders a checkbox for batch label printing alongside the single Generate QR action. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3 first:border-t-0 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-3">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Select ${variant.sku} for printing`}
            checked={selected}
            onChange={onToggleSelect}
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{variant.sku}</span>
          <div className="flex flex-wrap gap-1.5">
            {variant.attributes.map((attr) => (
              <Badge key={`${attr.attributeName}-${attr.value}`}>{attr.value}</Badge>
            ))}
            {variant.status !== "active" ? <Badge variant="neutral">{variant.status}</Badge> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {variant.price !== null ? `${variant.price.toFixed(2)} ${variant.currency}` : "No price set"}
        </span>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <QrCodeIcon className="h-4 w-4" />
          Generate QR
        </button>
      </div>

      {qrOpen ? <QrCodeModal sku={variant.sku} onClose={() => setQrOpen(false)} /> : null}
    </div>
  );
}
