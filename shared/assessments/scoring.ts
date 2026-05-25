/**
 * Pure scoring logic for predictive assessments.
 *
 * Lives in shared/ so the backend (computing scores at /complete) and
 * the frontend (rendering a preview during the run) can both call it.
 * No DB, no LLM — every input is plain data.
 *
 * Scoring contract:
 *   - agreement_5 / agreement_7  → response value 1..5 (or 1..7)
 *     normalised to a 0..1 score per question, averaged per dimension.
 *     `reverseScored=true` flips the scale.
 *   - multiple_choice            → option.score (0/1 typically),
 *     averaged per dimension.
 *   - forced_choice_pair         → option.score awarded to picked value,
 *     opposing dimension gets 0; aggregated per dimension.
 *
 * Output: scores are 0..1 floats per dimension. A 0.0 means strongly low,
 * 1.0 means strongly high, 0.5 is neutral. The UI converts to percentile-
 * like labels.
 */

import type { AssessmentDescriptor } from "./kinds.js";
import type { AssessmentQuestion } from "./question-banks.js";

export interface AssessmentResponse {
  questionId: string;
  /** For agreement scales: numeric 1..N. For multiple choice / forced choice: option.value. */
  value: string | number;
}

export interface ScoreResult {
  /** Per-dimension 0..1 score. */
  scores: Record<string, number>;
  /** Per-dimension count of questions that contributed. */
  counts: Record<string, number>;
  /** Overall 0..1 — mean of dimension scores, useful for a single headline number. */
  overall: number;
}

function normaliseAgreement(value: number, scale: "agreement_5" | "agreement_7", reverse: boolean): number {
  const max = scale === "agreement_5" ? 5 : 7;
  const clamped = Math.max(1, Math.min(max, value));
  const raw = (clamped - 1) / (max - 1); // 0..1
  return reverse ? 1 - raw : raw;
}

export function computeScore(
  descriptor: AssessmentDescriptor,
  questions: AssessmentQuestion[],
  responses: AssessmentResponse[],
): ScoreResult {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const r of responses) {
    const q = byId.get(r.questionId);
    if (!q) continue;
    let pointsZeroOne = 0;
    if (q.scale === "agreement_5" || q.scale === "agreement_7") {
      const n = typeof r.value === "number" ? r.value : Number(r.value);
      if (!Number.isFinite(n)) continue;
      pointsZeroOne = normaliseAgreement(n, q.scale, !!q.reverseScored);
    } else if (q.scale === "multiple_choice" || q.scale === "forced_choice_pair") {
      const option = q.options?.find((o) => o.value === r.value);
      if (!option) continue;
      pointsZeroOne = Math.max(0, Math.min(1, option.score));
    }
    sums[q.dimension] = (sums[q.dimension] ?? 0) + pointsZeroOne;
    counts[q.dimension] = (counts[q.dimension] ?? 0) + 1;
  }

  const scores: Record<string, number> = {};
  for (const dim of descriptor.dimensions) {
    const count = counts[dim.key] ?? 0;
    const sum = sums[dim.key] ?? 0;
    let raw = count > 0 ? sum / count : 0;
    // The descriptor may mark a dimension `inverse` (we want low to be the
    // desirable pole — Neuroticism flipped to Emotional Stability). The
    // question bank typically pre-handles this via reverseScored, but the
    // dimension-level flag is a backstop so consumers can rely on "higher =
    // better" semantics on the results page.
    if (dim.inverse) raw = 1 - raw;
    scores[dim.key] = Number(raw.toFixed(3));
  }

  const dimKeys = descriptor.dimensions.map((d) => d.key);
  const overall =
    dimKeys.length > 0
      ? Number((dimKeys.reduce((a, k) => a + (scores[k] ?? 0), 0) / dimKeys.length).toFixed(3))
      : 0;

  return { scores, counts, overall };
}

/** Convert a 0..1 score to a percentile-style label for the results page. */
export function scoreBand(score: number): "very-low" | "low" | "average" | "high" | "very-high" {
  if (score < 0.2) return "very-low";
  if (score < 0.4) return "low";
  if (score < 0.6) return "average";
  if (score < 0.8) return "high";
  return "very-high";
}
