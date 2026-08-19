"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. the language's endonym under its English name. */
  hint?: string;
}

/**
 * iOS-style segmented control — a single bordered track with one raised
 * "thumb" marking the selection. Direction-agnostic by construction (flex +
 * logical padding), so it reads correctly in RTL without a second variant.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-slate-950 dark:text-indigo-300 dark:ring-indigo-900"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-950/40 dark:hover:text-slate-200",
            )}
          >
            <span className="block">{option.label}</span>
            {option.hint ? (
              <span
                className={cn(
                  "mt-0.5 block text-xs font-normal",
                  selected ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500",
                )}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
