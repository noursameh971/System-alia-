"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPrice } from "@/lib/formatPrice";
import { useLocale } from "@/context/LocaleContext";
import { ChartTooltip } from "./ChartTooltip";

// slate-400 — legible against both the light and dark page backgrounds, since
// this SVG chart can't pick up the `dark:` Tailwind variants the rest of the
// page uses. Same convention as BrandComparisonChart.
const AXIS_COLOR = "#94a3b8";

export interface FinancialBreakdownPoint {
  name: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

function compactNumber(value: number): string {
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

/**
 * Grouped bar chart — Revenue / Expenses (production cost + shipping) / Net
 * Profit — per category (a brand, for the Executive dashboard, or a day, for
 * a single brand's trend). Fixed metric-identity colors (not brand-hashed,
 * unlike BrandComparisonChart's Revenue bar) since these three series mean
 * the same thing regardless of which brand or day they're for.
 */
export function FinancialBreakdownChart({ data }: { data: FinancialBreakdownPoint[] }) {
  const { t } = useLocale();

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="financial-revenue-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="financial-expenses-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
            <linearGradient id="financial-profit-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={AXIS_COLOR} strokeOpacity={0.2} vertical={false} />
          <XAxis dataKey="name" stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={{ stroke: AXIS_COLOR, strokeOpacity: 0.3 }} />
          <YAxis
            stroke={AXIS_COLOR}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compactNumber}
          />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatPrice(v)} />} cursor={{ fill: AXIS_COLOR, fillOpacity: 0.08 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name={t("Revenue")} fill="url(#financial-revenue-gradient)" radius={[8, 8, 0, 0]} />
          <Bar dataKey="expenses" name={t("Expenses")} fill="url(#financial-expenses-gradient)" radius={[8, 8, 0, 0]} />
          <Bar dataKey="netProfit" name={t("Net Profit")} fill="url(#financial-profit-gradient)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
