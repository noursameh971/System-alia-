import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Sparkline } from "./charts/Sparkline";

const UP_COLOR = "#059669"; // emerald-600
const DOWN_COLOR = "#dc2626"; // red-600
const FLAT_COLOR = "#94a3b8"; // slate-400

const ICON_COLOR_CLASSES = {
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
} as const;

type IconColor = keyof typeof ICON_COLOR_CLASSES;

interface Trend {
  direction: "up" | "down" | "flat";
  percent: number;
}

function computeTrend(data?: number[]): Trend | null {
  if (!data || data.length < 2) return null;
  const first = data[0]!;
  const last = data[data.length - 1]!;
  if (first === 0 && last === 0) return { direction: "flat", percent: 0 };
  if (first === 0) return { direction: "up", percent: 100 };
  const percent = ((last - first) / Math.abs(first)) * 100;
  if (percent > 0.5) return { direction: "up", percent };
  if (percent < -0.5) return { direction: "down", percent };
  return { direction: "flat", percent };
}

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  /** Icon badge in the top-left — omitted entirely for callers (e.g. the executive dashboard) that don't pass one. */
  icon?: LucideIcon;
  /** Tints the icon badge to match what the metric means (e.g. rose for expenses, emerald for profit) — defaults to indigo. */
  iconColor?: IconColor;
  /** Oldest-to-newest series for the sparkline + trend %; omitted hides both. */
  trendData?: number[];
  /**
   * "flat" drops the border/shadow for tiles nested inside another card
   * (e.g. the Financial Overview group) — a bordered card inside a bordered
   * card reads as a boxing error, not as hierarchy.
   */
  variant?: "card" | "flat";
}

export function StatTile({
  label,
  value,
  sublabel,
  icon: Icon,
  iconColor = "indigo",
  trendData,
  variant = "card",
}: StatTileProps) {
  const trend = computeTrend(trendData);
  const trendColor = trend?.direction === "up" ? UP_COLOR : trend?.direction === "down" ? DOWN_COLOR : FLAT_COLOR;

  return (
    <div
      className={
        variant === "flat"
          ? "min-w-0 rounded-lg bg-slate-50/70 p-4 dark:bg-slate-950/40"
          : "min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      }
    >
      {/* The label wraps rather than truncates: at 11px uppercase, two short
          lines read fine, whereas "INVENTORY VAL…" does not. The sparkline is
          shrink-0 so it never claims space the label needs first. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_COLOR_CLASSES[iconColor]}`}>
              <Icon className="size-4" />
            </span>
          ) : null}
          <p className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
        </div>
        {trendData && trendData.length > 1 ? <Sparkline data={trendData} color={trendColor} /> : null}
      </div>

      <p className="mt-2.5 truncate text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </p>

      {trend && trend.direction !== "flat" ? (
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {trend.direction === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(trend.percent).toFixed(0)}%
          </span>
          {sublabel ? <p className="truncate text-xs font-normal text-slate-400 dark:text-slate-500">{sublabel}</p> : null}
        </div>
      ) : sublabel ? (
        <p className="mt-1 truncate text-xs font-normal text-slate-400 dark:text-slate-500">{sublabel}</p>
      ) : null}
    </div>
  );
}
