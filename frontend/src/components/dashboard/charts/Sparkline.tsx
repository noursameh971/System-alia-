"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Tiny axis-less trend line for a KPI card — not meant to be read precisely, just to show shape/direction at a glance. */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const gradientId = useId();
  const points = data.map((value, i) => ({ i, value }));

  return (
    <div className="h-8 w-14 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 1, left: 1, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
