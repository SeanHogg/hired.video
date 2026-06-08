// Maps a freshly-built Career 360 plan into the shared tool-run shape so
// every plan build/refresh is recorded under toolId "career-360" and
// shows up in the tool's header "View History" sheet with a readiness
// sparkline.
//
// Career 360's "run" is the gap-and-roadmap computation: each
// select / custom-target / refresh produces a SelectedTarget. We derive a
// 0-100 "target readiness" score from the open gaps (fewer + lower
// severity = higher readiness) so the history sparkline trends up as the
// seeker closes gaps and re-runs — mirroring how the scored tools chart
// their own progress under the wheel.

import type { NormalizedToolRunResult } from "@/lib/tools/types";
import type { Gap, SelectedTarget } from "@shared/career360-types";

/** Per-gap readiness penalty by severity. A high-severity gap costs the
 *  most; closing it (so it drops out of the next plan) raises the score. */
const SEVERITY_PENALTY: Record<Gap["severity"], number> = {
  high: 20,
  medium: 10,
  low: 4,
};

/** Severity → result-panel recommendation tier, reusing the shared
 *  NormalizedToolRunResult vocabulary so ToolRunResultPanel colours
 *  Career 360 gaps the same way it colours every other tool's findings. */
const SEVERITY_TO_RECOMMENDATION: Record<Gap["severity"], "critical" | "important" | "minor"> = {
  high: "critical",
  medium: "important",
  low: "minor",
};

/** 0-100 readiness toward the chosen target. Starts at 100 and subtracts
 *  a per-gap penalty scaled by severity, floored at 0. A plan with no open
 *  gaps reads 100; a plan thick with high-severity gaps trends toward 0.
 *  Re-running after closing gaps raises the score — exactly what the
 *  history sparkline charts. */
export function computeTargetReadiness(gaps: Gap[]): number {
  const penalty = gaps.reduce(
    (sum, gap) => sum + (SEVERITY_PENALTY[gap.severity] ?? 0),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

export interface Career360RunRecord {
  score: number;
  summary: string;
  result: NormalizedToolRunResult;
}

/** Build the persisted tool-run payload for a freshly computed plan. */
export function buildCareer360RunRecord(target: SelectedTarget): Career360RunRecord {
  const score = computeTargetReadiness(target.gaps);
  const seniority = target.seniority ? ` (${target.seniority})` : "";
  const gapCount = target.gaps.length;
  const summary = `${target.title}${seniority} — ${score}/100 readiness, ${gapCount} open gap${gapCount === 1 ? "" : "s"}`;

  // Worst-first so the result panel leads with the most urgent gaps.
  const ordered = [...target.gaps].sort(
    (a, b) => (SEVERITY_PENALTY[b.severity] ?? 0) - (SEVERITY_PENALTY[a.severity] ?? 0),
  );

  return {
    score,
    summary,
    result: {
      overallScore: score,
      summary: `Plan toward ${target.title}${seniority} on a ${target.timelineMonths}-month horizon.`,
      weaknesses: ordered.map((gap) => gap.label),
      recommendations: ordered.map((gap) => ({
        category: SEVERITY_TO_RECOMMENDATION[gap.severity],
        title: gap.label,
        description: gap.suggestedActions[0],
      })),
      extras: [
        { label: "Target", value: `${target.title}${seniority}` },
        { label: "Timeline", value: `${target.timelineMonths} months` },
        { label: "Open gaps", value: String(gapCount) },
        { label: "Roadmap steps", value: String(target.roadmap.length) },
      ],
      raw: { targetId: target.id },
    },
  };
}
