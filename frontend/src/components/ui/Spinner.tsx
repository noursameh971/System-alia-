export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-700 dark:border-t-indigo-400" />
      {label}
    </div>
  );
}
