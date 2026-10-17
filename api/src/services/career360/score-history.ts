/** Career 360 per-tool score history (sparklines under the wheel) from `tool_runs`. */

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ScoreHistorySeries } from "../../../../shared/career360-types.js";

const { toolRuns } = schema;

// Tool ids whose `tool_runs.score` we plot as a sparkline under the
// wheel. Stays in one place so adding a new "scored" tool is one line.
const SCORED_TOOL_IDS = [
  "ai-resume-scorer",
  "resume-optimizer",
  "profile-audit",
  "sentiment-analysis",
  "job-resume-match",
] as const;

const TOOL_LABELS: Record<(typeof SCORED_TOOL_IDS)[number], string> = {
  "ai-resume-scorer": "Resume Score",
  "resume-optimizer": "Resume Optimizer",
  "profile-audit": "Profile Audit",
  "sentiment-analysis": "Sentiment",
  "job-resume-match": "Job Match",
};

export async function loadScoreHistory(userId: string): Promise<ScoreHistorySeries[]> {
  const db = getDb();
  const rows = await db
    .select({
      toolId: toolRuns.toolId,
      score: toolRuns.score,
      createdAt: toolRuns.createdAt,
    })
    .from(toolRuns)
    .where(
      and(
        eq(toolRuns.userId, userId),
        isNotNull(toolRuns.score),
        inArray(toolRuns.toolId, SCORED_TOOL_IDS as readonly string[] as string[]),
      ),
    )
    .orderBy(desc(toolRuns.createdAt))
    .limit(120);

  const grouped = new Map<string, { recordedAt: string; score: number }[]>();
  for (const row of rows) {
    if (row.score == null) continue;
    const numericScore =
      typeof row.score === "string" ? Number.parseFloat(row.score) : Number(row.score);
    if (!Number.isFinite(numericScore)) continue;
    const series = grouped.get(row.toolId) ?? [];
    series.push({
      recordedAt: (row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt)),
      score: clampScore(numericScore),
    });
    grouped.set(row.toolId, series);
  }

  return Array.from(grouped.entries()).map(([toolId, points]) => ({
    toolId,
    label:
      TOOL_LABELS[toolId as keyof typeof TOOL_LABELS] ?? toolId,
    // DB returned newest-first; sparkline reads chronological L→R.
    points: points
      .slice()
      .reverse()
      .map((p) => ({ toolId, recordedAt: p.recordedAt, score: p.score })),
  }));
}

function clampScore(n: number): number {
  if (n > 100) return 100;
  if (n < 0) return 0;
  return Math.round(n);
}
