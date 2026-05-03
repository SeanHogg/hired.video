/**
 * ChartRenderer — single canonical chart visualisation used by every
 * studio surface that draws data: the Data Analysis intake preview,
 * the scene element renderer in the live storyboard, and (via SVG
 * rasterisation) the export-time canvas pipeline.
 *
 * Self-contained per the DRY rule:
 *   • Owns its own data parsing (via the shared `parseChartData`).
 *   • Owns its empty / unparseable-input fallback so callers don't
 *     have to early-return null themselves.
 *   • Owns the recharts wiring so a future swap (e.g. to a tiny
 *     custom canvas renderer) lands in one file.
 *
 * Sized to its container — the parent decides how big the chart is via
 * the wrapper's width/height. The component fills 100% of both axes.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CHART_COLORS,
  parseChartData,
  type ChartFormat,
} from "@/lib/studio/chart-data";
import type { ChartType } from "@/types/video-script";

interface ChartRendererProps {
  chartType: ChartType;
  /** Raw data string — same format the user pasted/uploaded. The renderer
   *  parses internally so callers don't have to pre-process. */
  data: string;
  /** Optional format hint to skip auto-detect. */
  format?: ChartFormat;
  /** Optional palette override. Falls back to DEFAULT_CHART_COLORS. */
  colors?: string[];
  /** Optional title rendered above the chart surface. */
  title?: string;
  className?: string;
}

export default function ChartRenderer({
  chartType,
  data,
  format,
  colors,
  title,
  className,
}: ChartRendererProps) {
  const parsed = parseChartData(data, format);
  const palette = colors && colors.length > 0 ? colors : DEFAULT_CHART_COLORS;

  if (parsed.rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center w-full h-full text-xs text-muted-foreground border border-dashed rounded",
          className,
        )}
      >
        <p>No data to plot yet</p>
        <p className="text-[10px]">Paste CSV / TSV / JSON in the Data sample field</p>
      </div>
    );
  }

  const labelKey = parsed.keys[0];
  const seriesKeys = parsed.keys
    .slice(1)
    // Numeric series only — string columns can't be plotted.
    .filter((k) => parsed.rows.some((r) => typeof r[k] === "number"));

  // Pie can only show a single numeric series; we use the first one.
  const pieSeries = seriesKeys[0];

  const inner = (() => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={parsed.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey={labelKey} stroke="currentColor" tick={{ fontSize: 11 }} />
            <YAxis stroke="currentColor" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={palette[i % palette.length]} />
            ))}
          </BarChart>
        );
      case "line":
        return (
          <LineChart data={parsed.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey={labelKey} stroke="currentColor" tick={{ fontSize: 11 }} />
            <YAxis stroke="currentColor" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={palette[i % palette.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        );
      case "pie":
        return pieSeries ? (
          <PieChart>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie
              data={parsed.rows}
              dataKey={pieSeries}
              nameKey={labelKey}
              outerRadius="70%"
              label={{ fontSize: 11 }}
            >
              {parsed.rows.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : null;
      case "scatter":
        // Scatter expects {x, y} numeric pairs. Use the first numeric
        // column as Y, falling back to the row index for X if there's
        // no numeric label column.
        return (
          <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis
              type={typeof parsed.rows[0]?.[labelKey] === "number" ? "number" : "category"}
              dataKey={labelKey}
              stroke="currentColor"
              tick={{ fontSize: 11 }}
            />
            <YAxis type="number" stroke="currentColor" tick={{ fontSize: 11 }} />
            <ZAxis range={[60, 60]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((k, i) => (
              <Scatter key={k} name={k} data={parsed.rows} fill={palette[i % palette.length]} />
            ))}
          </ScatterChart>
        );
    }
  })();

  return (
    <div className={cn("flex flex-col w-full h-full", className)}>
      {title && (
        <div className="text-xs font-semibold text-foreground mb-1 truncate">{title}</div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {inner ?? <div />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
