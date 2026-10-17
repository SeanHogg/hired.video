/**
 * EngagementHeatmap — per-second (or per-percent) viewer-retention bars
 * with a drop-off marker. Used by <MetricsPanel/> when the metrics
 * payload carries a `heatmap` array (videos today; scroll-depth
 * resumes/articles in the future — see Consolidated Gap Register).
 */

import { useMemo } from "react";

import { TrendingDown } from "lucide-react";
import { formatDurationMinSec } from "@/lib/format";


interface Props {
  heatmap: number[];
  dropOffSecond: number | null;
  durationSec: number;
  /** Axis label unit. "s" = seconds (videos), "%" = scroll-percent. */
  unit?: "s" | "%";
}

export default function EngagementHeatmap({
  heatmap,
  dropOffSecond,
  durationSec,
  unit = "s",
}: Props) {
  const maxVal = useMemo(() => Math.max(...heatmap, 1), [heatmap]);

  if (heatmap.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No engagement data available yet.
      </p>
    );
  }

  const axisEndLabel = unit === "%" ? "100%" : formatDurationMinSec(durationSec);
  const axisStartLabel = unit === "%" ? "0%" : "0s";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{axisStartLabel}</span>
        <span>{axisEndLabel}</span>
      </div>

      <div className="relative flex items-end gap-px h-32">
        {heatmap.map((val, i) => {
          const pct = (val / maxVal) * 100;
          const isDropOff = dropOffSecond !== null && i === dropOffSecond;
          return (
            <div
              key={i}
              className="flex-1 min-w-0 group relative"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute bottom-0 w-full rounded-t-[1px] transition-colors ${
                  isDropOff ? "bg-red-500" : "bg-primary/70 group-hover:bg-primary"
                }`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />

              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="rounded bg-popover px-2 py-1 text-[10px] shadow-md border whitespace-nowrap text-popover-foreground">
                  {i}
                  {unit}: {Math.round(val)}% viewers
                </div>
              </div>
            </div>
          );
        })}

        {dropOffSecond !== null && dropOffSecond < heatmap.length && (
          <div
            className="absolute bottom-0 top-0 w-px bg-red-500 pointer-events-none"
            style={{ left: `${(dropOffSecond / heatmap.length) * 100}%` }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap">
              <TrendingDown className="h-3 w-3" />
              Drop-off {dropOffSecond}
              {unit}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary/70" />
          Viewers (%)
        </span>
        {dropOffSecond !== null && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
            Top drop-off
          </span>
        )}
      </div>
    </div>
  );
}
