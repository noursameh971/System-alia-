"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocale } from "@/context/LocaleContext";
import { EXPENSE_CATEGORY_META } from "@/lib/expenses";
import { formatPrice } from "@/lib/formatPrice";
import { EXPENSE_CATEGORIES, type MonthlyExpensePoint } from "@/lib/types";
import { ChartTooltip } from "@/components/dashboard/charts/ChartTooltip";

const AXIS_COLOR = "#94a3b8"; // slate-400 — legible on both light and dark page backgrounds.

function compactNumber(value: number): string {
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

/** "2026-07" -> "Jul 26". Built from the parts rather than `new Date("2026-07")`, which some engines parse as UTC and render as the previous month in negative-offset timezones. */
function monthLabel(month: string): string {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/**
 * Stacked monthly expense breakdown. Stacked rather than grouped because
 * the question this chart answers is "what did we spend this month, and on
 * what" — the stack total is itself meaningful, which six side-by-side bars
 * wouldn't show.
 *
 * dir="ltr" for the same reason as RankedBarChart: recharts computes every
 * SVG coordinate LTR, and an inherited `direction: rtl` retargets the text
 * anchors and drags axis labels off their ticks.
 */
export function ExpenseBreakdownChart({ data }: { data: MonthlyExpensePoint[] }) {
  const { t } = useLocale();

  const rows = data.map((point) => ({
    name: monthLabel(point.month),
    ...Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, point.categories[category]])),
  }));

  return (
    <div dir="ltr" className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={AXIS_COLOR} strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey="name"
            stroke={AXIS_COLOR}
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: AXIS_COLOR, strokeOpacity: 0.3 }}
          />
          <YAxis stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} width={52} tickFormatter={compactNumber} />
          <Tooltip
            content={<ChartTooltip valueFormatter={(value) => formatPrice(value)} />}
            cursor={{ fill: AXIS_COLOR, fillOpacity: 0.08 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {EXPENSE_CATEGORIES.map((category, index) => (
            <Bar
              key={category}
              dataKey={category}
              stackId="expenses"
              name={t(EXPENSE_CATEGORY_META[category].label)}
              fill={EXPENSE_CATEGORY_META[category].hex}
              // Only the topmost series in the stack gets rounded corners,
              // otherwise every segment rounds and the stack looks segmented.
              radius={index === EXPENSE_CATEGORIES.length - 1 ? [6, 6, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
