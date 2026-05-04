/**
 * Shared score schemas — single source of truth for the analytical
 * scores the resume tools persist on a resume row, and (via Phase 3)
 * the sentiment score persisted on a job row.
 *
 * Imported by:
 *   • API: shared/resume.ts (extends ResumeSchema with `scores`)
 *   • API: routes/resume-scorer.ts + routes/resume-optimizer.ts
 *     (validate persistence input)
 *   • Frontend: components/tools/ResumeScoreBadges.tsx (renders)
 *
 * These represent persisted analytical results, not the per-tool
 * response shapes (see tool-schemas.ts for those — different concern,
 * different schema).
 */

import { z } from "zod";

const ScoreField = z.number().min(0).max(100);

/**
 * The persistent JSONB blob on resume_information.scores. Every field
 * is optional — a row may have just an ATS score (optimizer ran), just
 * ATS + content + keyword + format + overall (full optimizer run), or
 * everything (full scorer run). Sentiment lives on its own column —
 * see resume_information.sentiment_score.
 */
export const ResumeScoresSchema = z.object({
  overall: ScoreField.optional(),
  ats: ScoreField.optional(),
  content: ScoreField.optional(),
  keyword: ScoreField.optional(),
  format: ScoreField.optional(),
  impact: ScoreField.optional(),
});

export type ResumeScores = z.infer<typeof ResumeScoresSchema>;
