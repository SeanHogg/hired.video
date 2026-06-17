// Career 360 radial visualizer. Renders two concentric rings:
//
//   • outer ring → activity signals (resume, profile, skills, …)
//   • inner ring → career outcomes (callback rate, offer rate, …)
//
// Each segment is colored by health (good / moderate / poor / unknown)
// and is clickable — the consumer decides what happens, so this stays a
// pure presentation component. The arc math is hand-rolled SVG (no
// chart library) so we get exact control of segment shape, hover, and
// label placement, matching the wheel in the design spec.

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type SegmentHealth = "good" | "moderate" | "poor" | "unknown";

export interface WheelSegment {
  id: string;
  label: string;
  health: SegmentHealth;
  /** Free-form score string shown next to the label in tooltips. */
  scoreLabel?: string;
}

interface Props {
  outer: WheelSegment[];
  inner: WheelSegment[];
  onSegmentClick?: (segment: WheelSegment, ring: "outer" | "inner") => void;
  className?: string;
  /** Pixel size of the square SVG. Defaults to 520. */
  size?: number;
}

const HEALTH_FILL: Record<SegmentHealth, string> = {
  good: "#16a34a", // green-600
  moderate: "#f59e0b", // amber-500
  poor: "#dc2626", // red-600
  unknown: "#475569", // slate-600
};

const HEALTH_STROKE: Record<SegmentHealth, string> = {
  good: "#15803d",
  moderate: "#b45309",
  poor: "#991b1b",
  unknown: "#334155",
};

/** English defaults — also the i18next fallbacks so a missing key never
 *  renders a raw key string. */
const HEALTH_LABEL_DEFAULTS: Record<SegmentHealth, string> = {
  good: "Good",
  moderate: "Moderate",
  poor: "Poor",
  unknown: "Not measured",
};

/** Localized health labels (#443). Shared by the wheel's own tooltips AND
 *  the Career 360 page legend so both surfaces stay in sync from one
 *  source — no duplicated literal maps. */
export function useHealthLabels(): Record<SegmentHealth, string> {
  const { t } = useTranslation();
  return {
    good: t("tools.career360.wheel.health.good", HEALTH_LABEL_DEFAULTS.good),
    moderate: t("tools.career360.wheel.health.moderate", HEALTH_LABEL_DEFAULTS.moderate),
    poor: t("tools.career360.wheel.health.poor", HEALTH_LABEL_DEFAULTS.poor),
    unknown: t("tools.career360.wheel.health.unknown", HEALTH_LABEL_DEFAULTS.unknown),
  };
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/** Path for an annular sector (donut wedge) between two radii and two
 *  angles, expressed in radians measured CCW from +x. */
function annularSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

interface RingProps {
  segments: WheelSegment[];
  cx: number;
  cy: number;
  rInner: number;
  rOuter: number;
  onSegmentClick?: (segment: WheelSegment) => void;
  labelFontSize: number;
}

function Ring({ segments, cx, cy, rInner, rOuter, onSegmentClick, labelFontSize }: RingProps) {
  const healthLabels = useHealthLabels();
  if (segments.length === 0) return null;
  const stepRad = (Math.PI * 2) / segments.length;
  // Start at -90° (top of the wheel) so the first segment renders top-right
  // like the design reference.
  const baseRad = -Math.PI / 2;
  const labelRadius = (rInner + rOuter) / 2;

  return (
    <g>
      {segments.map((seg, i) => {
        const start = baseRad + i * stepRad;
        const end = start + stepRad;
        const path = annularSectorPath(cx, cy, rInner, rOuter, start, end);
        const mid = start + stepRad / 2;
        const labelPos = polarToCartesian(cx, cy, labelRadius, mid);
        const interactive = !!onSegmentClick;
        return (
          <g
            key={seg.id}
            className={cn(interactive && "cursor-pointer")}
            onClick={interactive ? () => onSegmentClick(seg) : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSegmentClick(seg);
                    }
                  }
                : undefined
            }
          >
            <title>
              {seg.label}: {healthLabels[seg.health]}
              {seg.scoreLabel ? ` — ${seg.scoreLabel}` : ""}
            </title>
            <path
              d={path}
              fill={HEALTH_FILL[seg.health]}
              stroke={HEALTH_STROKE[seg.health]}
              strokeWidth={1.5}
              className="transition-opacity hover:opacity-80"
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={labelFontSize}
              fontWeight={600}
              fill="#ffffff"
              pointerEvents="none"
              style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}
            >
              {seg.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function CareerHealthWheel({ outer, inner, onSegmentClick, className, size = 520 }: Props) {
  const titleId = useId();
  const cx = size / 2;
  const cy = size / 2;
  const rOuterMax = size * 0.46;
  const rOuterMin = size * 0.32;
  const rInnerMax = size * 0.3;
  const rInnerMin = size * 0.14;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      className={cn("max-w-full", className)}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>Career 360 health wheel</title>
      <Ring
        segments={outer}
        cx={cx}
        cy={cy}
        rInner={rOuterMin}
        rOuter={rOuterMax}
        onSegmentClick={onSegmentClick ? (s) => onSegmentClick(s, "outer") : undefined}
        labelFontSize={Math.max(10, size * 0.022)}
      />
      <Ring
        segments={inner}
        cx={cx}
        cy={cy}
        rInner={rInnerMin}
        rOuter={rInnerMax}
        onSegmentClick={onSegmentClick ? (s) => onSegmentClick(s, "inner") : undefined}
        labelFontSize={Math.max(9, size * 0.02)}
      />
      <circle cx={cx} cy={cy} r={rInnerMin - 4} fill="#0f172a" />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.max(11, size * 0.028)}
        fontWeight={700}
        fill="#ffffff"
      >
        Career
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.max(11, size * 0.028)}
        fontWeight={700}
        fill="#ffffff"
      >
        360
      </text>
    </svg>
  );
}

export const HEALTH_FILL_COLORS = HEALTH_FILL;
