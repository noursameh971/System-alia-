import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  brand: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
} as const;

const SIZE_CLASSES = {
  default: "px-2.5 py-0.5 text-xs",
  /** For dense list rows where a full-size badge visually outweighs the row's own text. */
  sm: "px-1.5 py-0 text-[10px]",
} as const;

export function Badge({
  children,
  variant = "neutral",
  size = "default",
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
