import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The single card shell every dashboard section renders into. Centralising
 * the padding (p-5), border (border-slate-100), shadow, and — most
 * importantly — the *title* typography is what stops each section from
 * drifting into its own font weight and size, which is what made the page
 * read as visually noisy.
 *
 * `bodyClassName` is where a section opts into a height cap: pass e.g.
 * "max-h-[360px] overflow-y-auto pe-1" and only that card's body scrolls,
 * instead of the card growing without bound and stretching the whole page.
 */
export function DashboardCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  /** Right-aligned slot in the header row — a count, a filter, a link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className={CARD_TITLE_CLASS}>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Exported so the few places that need a card-style heading outside a DashboardCard stay on the same scale. */
export const CARD_TITLE_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
