// One-line sparkline used to show "stamps of improvement" — every
// recorded run of a measured tool plotted on a 0–100 axis. Stays
// presentation-only so the Career 360 page can render the same shape
// in multiple places without re-implementing the SVG math.

import { cn } from "@/lib/utils";
import type { ScoreHistorySeries } from "@shared/career360-types";

interface Props {
  series: ScoreHistorySeries;
  /** Pixel height; the sparkline always fills its container width. */
  height?: number;
  className?: string;
}

const FILL = "#7c3aed"; // brand-purple

export function ScoreHistorySparkline({ series, height = 56, className }: Props) {
  const points = series.points;
  if (points.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground italic", className)}>
        No runs yet — open the linked tool to record your first score.
      </div>
    );
  }

  const width = 240;
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Single point can't form a line — render as a centered dot.
  if (points.length === 1) {
    const cx = width / 2;
    const cy = padding + innerH * (1 - points[0].score / 100);
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("w-full h-auto", className)}
        preserveAspectRatio="none"
      >
        <circle cx={cx} cy={cy} r={3.5} fill={FILL} />
      </svg>
    );
  }

  const stepX = innerW / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: padding + innerH * (1 - p.score / 100),
    score: p.score,
    recordedAt: p.recordedAt,
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const delta = last.score - first.score;

  return (
    <div className={cn("space-y-1", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
      >
        <path d={path} fill="none" stroke={FILL} strokeWidth={1.5} strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={`${c.recordedAt}-${i}`} cx={c.x} cy={c.y} r={2.5} fill={FILL}>
            <title>
              {new Date(c.recordedAt).toLocaleDateString()}: {c.score}
            </title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{first.score}</span>
        <span
          className={cn(
            "font-medium",
            delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta} pts
        </span>
        <span>{last.score}</span>
      </div>
    </div>
  );
}
