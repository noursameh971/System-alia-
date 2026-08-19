"use client";

import { forwardRef } from "react";
import { useLocale } from "@/context/LocaleContext";

export interface BinOption {
  id: string;
  label: string;
  disabled?: boolean;
}

interface BinSelectProps {
  label: string;
  options: BinOption[];
  value: string;
  onChange: (binId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const BinSelect = forwardRef<HTMLSelectElement, BinSelectProps>(function BinSelect(
  { label, options, value, onChange, disabled, placeholder = "Select a bin..." },
  ref,
) {
  const { t } = useLocale();

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t(label)}</label>
      <select
        ref={ref}
        aria-label={t(label)}
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">{options.length === 0 ? t("No bins available") : t(placeholder)}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});
