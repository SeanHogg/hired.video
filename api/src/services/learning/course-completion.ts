/**
 * Course completion logic — extracted from the
 * `PATCH /api/courses/enrollments/:id/progress` route handler so it
 * can be unit-tested and reused by future code paths (admin
 * "mark-passed" tools, backfill scripts, the learning-path completion
 * fan-out).
 *
 * Score math routes through `services/learning/scoring.ts` (gap #1606
 * seam) — `aggregateBasisPoints` for the average and a basis-point
 * comparison instead of float-percent. This kills the rounding-bug
 * class where `scoreRaw / scoreMax * 100` drifted under round() and a
 * passing learner got denied at the gate.
 *
 * Rules:
 *   1. Every lesson marked `is_required = true` must have its
 *      enrollment-progress entry at `status === "passed"`. Optional
 *      lessons are ignored. A course with NO required lessons can
 *      never pass — there's no completion bar defined.
 *   2. If the course defines a `passing_score_pct`, the average of
 *      reported lesson scores must meet or exceed it — BUT only when
 *      at least one lesson actually reported a score. A text_md /
 *      studio_video course with no quizzes has nothing to evaluate
 *      against the score, so the completion-of-required-lessons signal
 *      IS the passing bar.
 */

import { aggregateBasisPoints } from "./scoring.js";

export interface LessonForCompletion {
  id: string;
  isRequired: boolean;
}

export interface LessonProgressForCompletion {
  status?: string;
  scoreRaw?: number;
  scoreMax?: number;
}

export interface CourseCompletionInput {
  wasPassed: boolean;
  passingScorePct: number | null;
  lessons: ReadonlyArray<LessonForCompletion>;
  progress: Readonly<Record<string, LessonProgressForCompletion>>;
}

export interface CourseCompletionResult {
  shouldFlipToPassed: boolean;
  finalScorePct: number | null;
  passedRequiredCount: number;
  requiredCount: number;
  meetsPassingScore: boolean;
  allRequiredPassed: boolean;
  scoredLessonCount: number;
}

export function evaluateCourseCompletion(input: CourseCompletionInput): CourseCompletionResult {
  const required = input.lessons.filter((l) => l.isRequired);
  const passedRequired = required.filter((l) => input.progress[l.id]?.status === "passed");
  const requiredCount = required.length;
  const passedRequiredCount = passedRequired.length;
  const allRequiredPassed = requiredCount > 0 && passedRequiredCount === requiredCount;

  // Route the per-lesson score aggregation through the shared scoring
  // seam (#1606). `aggregateBasisPoints` returns 0..10000 (representing
  // 0.00%..100.00%) and skips lessons whose progress entry has no
  // numeric scoreRaw — same carve-out semantics as the previous
  // inline averaging but with integer-stable comparison math.
  const scoredLessons = input.lessons
    .map((l) => {
      const lp = input.progress[l.id];
      if (lp?.scoreRaw == null || typeof lp.scoreMax !== "number" || lp.scoreMax <= 0) return null;
      return { scoreRaw: lp.scoreRaw, scoreMin: 0, scoreMax: lp.scoreMax };
    })
    .filter((x): x is { scoreRaw: number; scoreMin: number; scoreMax: number } => x !== null);

  const scoredLessonCount = scoredLessons.length;
  const aggregateBp = aggregateBasisPoints(scoredLessons);
  // finalScorePct is the integer percent surfaced to callers; rounding
  // the basis-points value drops one decimal but matches the existing
  // shape (Math.round(scoreSum / scoredLessonCount)).
  const finalScorePct = aggregateBp == null ? null : Math.round(aggregateBp / 100);

  const meetsPassingScore =
    input.passingScorePct == null
    || scoredLessonCount === 0
    || (aggregateBp != null && aggregateBp >= input.passingScorePct * 100);

  const shouldFlipToPassed = !input.wasPassed && allRequiredPassed && meetsPassingScore;

  return {
    shouldFlipToPassed,
    finalScorePct,
    passedRequiredCount,
    requiredCount,
    meetsPassingScore,
    allRequiredPassed,
    scoredLessonCount,
  };
}
