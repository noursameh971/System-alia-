"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardBrandSummary } from "@/lib/types";
import { getBrandGradientHex } from "@/lib/brandColor";
import { ChartTooltip } from "./ChartTooltip";

// slate-400 — legible against both the light and dark page backgrounds, since
// this SVG chart can't pick up the `dark:` Tailwind variants the rest of the
// page uses.
const AXIS_COLOR = "#94a3b8";
const INVENTORY_GRADIENT: [string, string] = ["#38bdf8", "#6366f1"]; // sky -> indigo — vivid but brand-neutral

function formatEGP(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} EGP`;
}

function compactNumber(value: number): string {
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

/**
 * Grouped bar chart, two bars per brand: Revenue (a vivid two-stop gradient,
 * deterministic per brand — the same visual identity as that brand's avatar
 * elsewhere in the app) and Inventory Value (a fixed vivid sky->indigo
 * gradient, since it isn't a brand-identity metric but still shouldn't read
 * as a dull, washed-out series next to Revenue's brand colors). The
 * Executive Hub's headline "visual chart" comparing brands side by side.
 */
export function BrandComparisonChart({ brands }: { brands: DashboardBrandSummary[] }) {
  const data = brands.map((b) => ({
    name: b.name,
    code: b.code,
    Revenue: b.revenue,
    "Inventory Value": b.inventoryValue,
  }));

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {data.map((entry) => {
              const [from, to] = getBrandGradientHex(entry.code);
              return (
                <linearGradient key={entry.code} id={`revenue-gradient-${entry.code}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              );
            })}
            <linearGradient id="inventory-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INVENTORY_GRADIENT[0]} />
              <stop offset="100%" stopColor={INVENTORY_GRADIENT[1]} />
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
          <Tooltip content={<ChartTooltip valueFormatter={formatEGP} />} cursor={{ fill: AXIS_COLOR, fillOpacity: 0.08 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Revenue" radius={[8, 8, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.code} fill={`url(#revenue-gradient-${entry.code})`} />
            ))}
          </Bar>
          <Bar dataKey="Inventory Value" radius={[8, 8, 0, 0]} fill="url(#inventory-gradient)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
