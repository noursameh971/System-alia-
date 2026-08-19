import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.ComponentProps<"select"> {
  /**
   * Width/layout classes for the positioning wrapper. Width MUST go here,
   * not on `className` — the chevron is absolutely positioned against this
   * wrapper, so constraining only the inner <select> leaves the chevron
   * stranded at the far edge of the wrapper's full-width block box.
   * `className` still styles the <select> itself (height, text size, etc.).
   */
  wrapperClassName?: string;
}

function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        className={cn(
          "flex h-9 w-full appearance-none rounded-md border border-slate-200 bg-white py-1 ps-3 pe-8 text-sm text-slate-900 shadow-xs transition-colors",
          "outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-950/5",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:border-slate-500 dark:focus-visible:ring-slate-100/10",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export { Select };
