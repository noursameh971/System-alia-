import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** Optional primary CTA rendered under the description — e.g. "Add user". */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
