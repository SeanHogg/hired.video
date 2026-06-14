/**
 * SpeedometerGauge — a pure, role-agnostic half-dial gauge.
 *
 * Renders a 180° red→green track, level boundary notches, a needle at
 * the current score, an optional benchmark marker ("aim for here"), and
 * the score in the hub. It knows nothing about roles or data — callers
 * pass a normalized {@link GaugeModel} (see lib/dashboard/gauge.ts), so
 * the same component drives the job-seeker, creator, employer and
 * gamification dials. Hand-rolled SVG (no chart lib) mirrors the
 * approach in CareerHealthWheel for exact control of the needle + ticks.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { GaugeModel } from "@/lib/dashboard/gauge";

interface Props {
  model: GaugeModel;
  className?: string;
}

// viewBox geometry. Width/height fixed; the SVG scales to its container.
const W = 260;
const H = 172;
const CX = 130;
const CY = 140;
const R = 110;
const TRACK_WIDTH = 16;

/** Map a 0–100 score to its dial angle in degrees (180° left → 360° right). */
function scoreToDeg(score: number): number {
  return 180 + (Math.max(0, Math.min(100, score)) / 100) * 180;
}

function polar(radius: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function scoreColor(score: number): string {
  if (score < 40) return "#ef4444"; // red-500
  if (score < 70) return "#f59e0b"; // amber-500
  return "#16a34a"; // green-600
}

export function SpeedometerGauge({ model, className }: Props) {
  const gradientId = useId();
  const titleId = useId();
  const { score, benchmark, benchmarkLabel = "Target", levels } = model;

  const left = polar(R, 180);
  const right = polar(R, 360);
  const trackPath = `M ${left.x} ${left.y} A ${R} ${R} 0 0 1 ${right.x} ${right.y}`;

  // Needle as a slim triangle from the hub to the score angle.
  const needleDeg = scoreToDeg(score);
  const tip = polar(R - TRACK_WIDTH, needleDeg);
  const baseL = polar(7, needleDeg + 90);
  const baseR = polar(7, needleDeg - 90);

  const firstLevel = levels[0];
  const lastLevel = levels[levels.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className={cn("max-w-[320px] mx-auto block", className)}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {model.title}: {score} out of 100
        {benchmark != null ? ` (${benchmarkLabel}: ${benchmark})` : ""}
      </title>

      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>

      {/* Track */}
      <path
        d={trackPath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={TRACK_WIDTH}
        strokeLinecap="round"
        opacity={0.9}
      />

      {/* Level boundary notches (skip the 0 baseline). */}
      {levels
        .filter((l) => l.min > 0 && l.min < 100)
        .map((l) => {
          const a = scoreToDeg(l.min);
          const p1 = polar(R - TRACK_WIDTH / 2 - 1, a);
          const p2 = polar(R + TRACK_WIDTH / 2 + 1, a);
          return (
            <line
              key={l.min}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#ffffff"
              strokeWidth={2}
              opacity={0.7}
            />
          );
        })}

      {/* Benchmark marker — a contrasting tick just outside the track. */}
      {benchmark != null && (
        <g>
          <title>
            {benchmarkLabel}: {benchmark}
          </title>
          <line
            x1={polar(R - TRACK_WIDTH / 2, scoreToDeg(benchmark)).x}
            y1={polar(R - TRACK_WIDTH / 2, scoreToDeg(benchmark)).y}
            x2={polar(R + TRACK_WIDTH / 2 + 8, scoreToDeg(benchmark)).x}
            y2={polar(R + TRACK_WIDTH / 2 + 8, scoreToDeg(benchmark)).y}
            stroke="#0f172a"
            className="dark:[stroke:#e2e8f0]"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Needle + hub */}
      <polygon
        points={`${tip.x},${tip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`}
        fill="currentColor"
        className="text-foreground"
      />
      <circle cx={CX} cy={CY} r={9} fill="currentColor" className="text-foreground" />
      <circle cx={CX} cy={CY} r={4} fill="#ffffff" />

      {/* Score readout in the hub area */}
      <text
        x={CX}
        y={CY - 34}
        textAnchor="middle"
        fontSize={34}
        fontWeight={800}
        fill={scoreColor(score)}
      >
        {score}
      </text>
      {model.caption && (
        <text
          x={CX}
          y={CY - 14}
          textAnchor="middle"
          fontSize={11}
          fill="currentColor"
          className="text-muted-foreground"
        >
          {model.caption}
        </text>
      )}

      {/* End labels — first / last tier names at the dial extremes. */}
      <text
        x={left.x - 2}
        y={left.y + 16}
        textAnchor="start"
        fontSize={10}
        fontWeight={600}
        fill="currentColor"
        className="text-muted-foreground"
      >
        {firstLevel.name}
      </text>
      <text
        x={right.x + 2}
        y={right.y + 16}
        textAnchor="end"
        fontSize={10}
        fontWeight={600}
        fill="currentColor"
        className="text-muted-foreground"
      >
        {lastLevel.name}
      </text>
    </svg>
  );
}

export default SpeedometerGauge;
