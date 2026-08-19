"use client";

interface ChartTooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadEntry[];
  label?: string;
  valueFormatter?: (value: number) => string;
}

/** Shared recharts custom tooltip — a small shadcn-styled card (rounded, bordered, shadow, dark-mode aware) instead of recharts' default inline-styled box, used across every dashboard chart for a consistent look. */
export function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-32 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
      {label ? <p className="mb-1 font-medium text-slate-900 dark:text-slate-100">{label}</p> : null}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => (
          <div key={entry.dataKey != null ? String(entry.dataKey) : (entry.name ?? i)} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              {entry.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} /> : null}
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {valueFormatter && typeof entry.value === "number" ? valueFormatter(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
