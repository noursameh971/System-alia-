import type { ReactNode } from "react";

const VARIANT_CLASSES = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  brand: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
} as const;

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT_CLASSES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
