export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {sublabel ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p> : null}
    </div>
  );
}
