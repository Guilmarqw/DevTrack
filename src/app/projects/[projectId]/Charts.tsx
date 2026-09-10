"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// --- shared chrome -------------------------------------------------------

const GRID = "var(--color-grid)";
const AXIS = "var(--color-axis)";
const MUTED = "var(--color-muted)";
const SURFACE = "var(--color-surface)";

const axisProps = {
  stroke: AXIS,
  strokeWidth: 1,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
} as const;

function TooltipShell({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; color?: string }>;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            {row.color && (
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-muted">{row.label}</span>
            <span className="tabular ml-auto">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString();

/**
 * Direct-labels only the final point. Recharts hands label renderers loose
 * coordinates (`string | number | undefined`), so they are narrowed here once
 * rather than at each call site.
 */
type LabelRenderProps = {
  x?: string | number;
  y?: string | number;
  index?: number;
};

function endpointLabel(lastIndex: number, text: string) {
  return function EndpointLabel({ x, y, index }: LabelRenderProps) {
    if (index !== lastIndex || x === undefined || y === undefined) {
      return <g />;
    }
    return (
      <text
        x={Number(x) + 8}
        y={Number(y) + 4}
        fill={MUTED}
        fontSize={11}
        className="tabular"
      >
        {text}
      </text>
    );
  };
}

// --- language mix --------------------------------------------------------

export type LanguageRow = {
  language: string;
  bytes: number;
  lines: number;
  color: string;
  percent: number;
};

/**
 * Part-to-whole for one snapshot, as a single horizontal 100% stacked bar.
 *
 * Not a pie: with seven-plus classes a pie's slices become unreadable and
 * close values impossible to compare. Horizontal also lets long language
 * names sit in the legend without rotation.
 *
 * Built from divs rather than Recharts — a one-row stacked bar is a flex
 * container, and hand-rolling it makes the mandated 2px surface gaps between
 * segments exact instead of fighting a chart library's padding model.
 */
export function LanguageMix({ rows }: { rows: LanguageRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted">
        No languages were detected in the latest snapshot.
      </p>
    );
  }

  return (
    <div>
      {/* The bar. 20px tall (under the 24px cap), rounded data-ends, and a 2px
          surface-coloured gap doing the separating rather than borders. */}
      <div
        className="flex h-5 w-full overflow-hidden rounded"
        role="img"
        aria-label={rows
          .map((r) => `${r.language} ${r.percent.toFixed(1)}%`)
          .join(", ")}
      >
        {rows.map((row, index) => (
          <div
            key={row.language}
            title={`${row.language} — ${row.percent.toFixed(1)}%`}
            onMouseEnter={() => setHovered(row.language)}
            onMouseLeave={() => setHovered(null)}
            className="h-full transition-opacity"
            style={{
              width: `${row.percent}%`,
              backgroundColor: row.color,
              marginLeft: index === 0 ? 0 : 2,
              opacity: hovered && hovered !== row.language ? 0.45 : 1,
            }}
          />
        ))}
      </div>

      {/* Legend — always present for two or more series, so identity never
          rests on colour alone. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map((row) => (
          <li
            key={row.language}
            onMouseEnter={() => setHovered(row.language)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-1.5 text-xs"
            style={{ opacity: hovered && hovered !== row.language ? 0.45 : 1 }}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span>{row.language}</span>
            <span className="tabular text-muted">
              {row.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The table twin. Required, not optional: three light-mode slots sit under 3:1
 * contrast on white, so every value has to be readable without relying on the
 * colour or on a hover tooltip.
 */
export function LanguageTable({ rows }: { rows: LanguageRow[] }) {
  if (rows.length === 0) return null;

  return (
    <table className="mt-4 w-full text-xs">
      <caption className="sr-only">
        Language breakdown for the latest snapshot
      </caption>
      <thead>
        <tr className="border-b border-line text-left text-faint">
          <th scope="col" className="py-1.5 font-medium">
            Language
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Lines
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Bytes
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.language} className="border-b border-line last:border-0">
            <th scope="row" className="py-1.5 text-left font-normal">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                {row.language}
              </span>
            </th>
            <td className="tabular py-1.5 text-right text-muted">
              {fmt(row.lines)}
            </td>
            <td className="tabular py-1.5 text-right text-muted">
              {fmt(row.bytes)}
            </td>
            <td className="tabular py-1.5 text-right">
              {row.percent.toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- time series ---------------------------------------------------------

export type TrendPoint = {
  label: string;
  fullLabel: string;
  lines: number;
  files: number;
  completionPct: number;
};

/**
 * Lines of code across snapshots. One series, so no legend box — the heading
 * says what is plotted. The end point is direct-labelled; the axis and the
 * crosshair tooltip carry the rest.
 *
 * Deliberately a separate chart from completion below. Plotting LOC and a
 * percentage on one plot would need two y-scales, and the alignment between
 * two scales is arbitrary — it invents a correlation that is not in the data.
 */
export function LocTrend({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="text-xs text-muted">
        A trend needs at least two snapshots. Re-upload this project to add one.
      </p>
    );
  }

  const last = data[data.length - 1];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 44, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          width={52}
          tickFormatter={fmt}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as TrendPoint;
            return (
              <TooltipShell
                title={point.fullLabel}
                rows={[
                  {
                    label: "Lines",
                    value: fmt(point.lines),
                    color: "var(--color-series-1)",
                  },
                  { label: "Files", value: fmt(point.files) },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="lines"
          stroke="var(--color-series-1)"
          strokeWidth={2}
          // A wash, not a saturated block.
          fill="var(--color-series-1)"
          fillOpacity={0.1}
          // >=8px marker with a 2px surface ring so it stays legible on the line.
          dot={{ r: 4, fill: "var(--color-series-1)", stroke: SURFACE, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "var(--color-series-1)", stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
          label={endpointLabel(data.length - 1, fmt(last.lines))}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Completion across snapshots. Its own chart and its own 0-100 axis. */
export function CompletionTrend({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="text-xs text-muted">
        A trend needs at least two snapshots.
      </p>
    );
  }

  const last = data[data.length - 1];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 44, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          width={40}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as TrendPoint;
            return (
              <TooltipShell
                title={point.fullLabel}
                rows={[
                  {
                    label: "Complete",
                    value: `${point.completionPct.toFixed(0)}%`,
                    color: "var(--color-series-3)",
                  },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="completionPct"
          stroke="var(--color-series-3)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: "var(--color-series-3)", stroke: SURFACE, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "var(--color-series-3)", stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
          label={endpointLabel(
            data.length - 1,
            `${last.completionPct.toFixed(0)}%`,
          )}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
