"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one card shell every Settings section uses — title/description header,
 * body, and an optional right-aligned footer bar for the Save button. Having
 * a single component (rather than each tab hand-rolling border/padding
 * classes) is what keeps the three tabs visually identical.
 */
export function SettingsCard({
  title,
  description,
  footer,
  children,
  className,
  as = "div",
  onSubmit,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "div" | "form";
  onSubmit?: (event: React.FormEvent) => void;
}) {
  const Wrapper = as;
  return (
    <Wrapper
      onSubmit={onSubmit}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">{children}</div>

      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          {footer}
        </div>
      ) : null}
    </Wrapper>
  );
}

/** Label + optional helper text above a control, so every field in Settings has the same vertical rhythm. */
export function SettingsField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}
