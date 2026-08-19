"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS_COLOR = "#94a3b8"; // slate-400

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export interface RankedBarChartItem {
  key: string;
  name: string;
  value: number;
}

/**
 * Horizontal "top N" bar chart — shared by Top Selling Items (units sold)
 * and Top Stocked Variants (units on hand), which are the same chart shape
 * over different metrics.
 */
export function RankedBarChart({
  items,
  seriesLabel,
  valueSuffix,
  color,
  limit = 8,
}: {
  items: RankedBarChartItem[];
  seriesLabel: string;
  valueSuffix: string;
  color: string;
  limit?: number;
}) {
  // reverse: recharts' vertical category axis renders top-to-bottom in data
  // order, so without this the #1 item would end up at the bottom.
  const data = [...items]
    .slice(0, limit)
    .reverse()
    .map((item) => ({ name: truncate(item.name, 22), fullName: item.name, value: item.value }));

  return (
    // dir="ltr" is deliberate and applies in Arabic too: recharts computes
    // every SVG coordinate LTR, but an inherited `direction: rtl` retargets
    // the <text> anchors, which drags the category labels out from under
    // their axis and on top of the bars. Bars and numbers read the same
    // either way, and Arabic label text still shapes RTL via the Unicode
    // bidi algorithm within its own run.
    <div dir="ltr" className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={AXIS_COLOR} strokeOpacity={0.2} horizontal={false} />
          <XAxis type="number" allowDecimals={false} stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={130} />
          <Tooltip
            formatter={(value) => [`${value} ${valueSuffix}`, seriesLabel]}
            labelFormatter={(label, payload) => payload[0]?.payload.fullName ?? label}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Bar dataKey="value" name={seriesLabel} radius={[0, 4, 4, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
