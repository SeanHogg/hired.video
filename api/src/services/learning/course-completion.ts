/**
 * Course completion logic — extracted from the
 * `PATCH /api/courses/enrollments/:id/progress` route handler so it
 * can be unit-tested and reused by future code paths (admin
 * "mark-passed" tools, backfill scripts, the learning-path completion
 * fan-out).
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
 *      IS the passing bar. Without this carve-out every text_md-only
 *      course is uncompletable (the user reported exactly this: 4/4
 *      lessons green, course still "in progress").
 *
 * Returns:
 *   - shouldFlipToPassed: true when a previously-not-passed enrollment
 *     would now flip to passed under both rules.
 *   - finalScorePct: averaged percent across scored lessons, or null
 *     when no lesson reported a score.
 *   - passedRequiredCount / requiredCount: counts surfaced for the
 *     caller's audit / progress-bar plumbing.
 */

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

  // Average across lessons that reported BOTH a numeric scoreRaw AND
  // a positive scoreMax. Lessons that didn't ship a quiz never enter
  // the denominator — they don't drag the average to 0%.
  let scoreSum = 0;
  let scoredLessonCount = 0;
  for (const l of input.lessons) {
    const lp = input.progress[l.id];
    if (lp?.scoreRaw != null && typeof lp.scoreMax === "number" && lp.scoreMax > 0) {
      scoreSum += (lp.scoreRaw / lp.scoreMax) * 100;
      scoredLessonCount += 1;
    }
  }
  const finalScorePct = scoredLessonCount > 0 ? Math.round(scoreSum / scoredLessonCount) : null;

  const meetsPassingScore =
    input.passingScorePct == null
    || scoredLessonCount === 0
    || (finalScorePct ?? 0) >= input.passingScorePct;

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
