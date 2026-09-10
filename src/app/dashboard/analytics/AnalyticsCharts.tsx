"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRID = "var(--color-grid)";
const AXIS = "var(--color-axis)";
const MUTED = "var(--color-muted)";

export type UploadPoint = { day: string; label: string; uploads: number };

/**
 * Uploads per day over the last 30 days.
 *
 * A column chart, not a line: this is a count of discrete events per bucket,
 * and a line between them would imply a continuous quantity that was measured
 * in between. One series, so no legend — the heading names it.
 */
export function UploadActivity({ data }: { data: UploadPoint[] }) {
  const total = data.reduce((sum, d) => sum + d.uploads, 0);

  if (total === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium">No scans in the last 30 days</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
          Upload or re-scan a project and its activity shows up here.
        </p>
      </div>
    );
  }

  // Only every fifth tick is labelled: 30 dates side by side collide.
  const ticks = data.filter((_, index) => index % 5 === 0).map((d) => d.label);

  return (
    <ResponsiveContainer width="100%" height={180}>
      {/* Right margin leaves room for the final column: with maxBarSize the
          last bar is centred on the axis end and would otherwise be clipped
          in half by the plot edge. */}
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="label"
          ticks={ticks}
          stroke={AXIS}
          strokeWidth={1}
          tickLine={false}
          tick={{ fill: MUTED, fontSize: 11 }}
          interval={0}
        />
        <YAxis
          stroke={AXIS}
          strokeWidth={1}
          tickLine={false}
          tick={{ fill: MUTED, fontSize: 11 }}
          width={28}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--color-accent-soft)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as UploadPoint;
            return (
              <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
                <p className="font-medium">{point.label}</p>
                <p className="mt-0.5 text-muted">
                  {point.uploads} {point.uploads === 1 ? "scan" : "scans"}
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="uploads"
          fill="var(--color-series-1)"
          // 4px rounded cap, square at the baseline.
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
