-- Migration 0137 — Seed-course completion fix.
--
-- The five Learning Content Library seed courses from migration 0131
-- were stamped with `passing_score_pct = 70`, but their lessons are
-- pure `text_md` (no quizzes / no scored assessments). The completion
-- handler `PATCH /api/courses/enrollments/:id/progress` was treating
-- the unscored "no lessons returned a score" case as `score = 0 < 70`,
-- so the course never auto-flipped to `passed` and the cert + badge +
-- path-completion fan-out never fired. A learner could green every
-- lesson and still see "in progress" on the rail.
--
-- We applied two fixes for the same root cause in lock-step:
--   1. Backend: `meetsPassingScore` now short-circuits to true when
--      `scoreCount === 0` (no lesson can score → nothing to evaluate).
--      See `api/src/routes/courses.ts` `flipToPassed` calc.
--   2. Data: drop the irrelevant passing-score requirement on the seed
--      courses so the row itself reads "no quiz, complete-to-pass" —
--      this migration. Belt + suspenders with #1.
--
-- A future course that DOES ship a SCORM quiz or knowledge_check should
-- set `passing_score_pct` back to whatever bar the author wants; the
-- backend honours it whenever any lesson actually scores.

UPDATE courses
   SET passing_score_pct = NULL,
       updated_at = NOW()
 WHERE user_id = (md5('learning@hired.video'))::uuid
   AND passing_score_pct IS NOT NULL;

-- Backfill: any existing enrollments that completed every required
-- lesson under the old (broken) gate should retroactively flip to
-- passed so learners see their completed status the next time they
-- open the course. completedAt approximates from updatedAt — we don't
-- have a per-lesson timestamp granular enough to be exact, but
-- updatedAt was last touched when the final lesson hit "passed", so
-- it's the right wall-clock signal.
--
-- We DO NOT auto-issue certs in this backfill — certs are issued via
-- the route handler's CertificateService.issueForEnrollment() which
-- requires the JWT_SECRET binding; a SQL UPDATE can't reach that
-- service. Next time the learner re-opens the course AND completes a
-- (no-op) lesson PATCH, the route's flipToPassed branch will fire and
-- issue the cert. Most learners won't hit this path; if a wave of
-- cert issuance becomes important after the fix lands, a small admin
-- back-fill route can iterate the affected enrollments and call
-- issueForEnrollment per row.

UPDATE course_enrollments ce
   SET passed = TRUE,
       completed_at = COALESCE(completed_at, ce.updated_at, NOW()),
       updated_at = NOW()
  FROM courses c
 WHERE ce.course_id = c.id
   AND c.user_id = (md5('learning@hired.video'))::uuid
   AND ce.passed = FALSE
   AND (
     SELECT COUNT(*) FROM course_lessons cl
      WHERE cl.course_id = c.id AND cl.is_required = TRUE
   ) > 0
   AND (
     SELECT COUNT(*) FROM course_lessons cl
      WHERE cl.course_id = c.id AND cl.is_required = TRUE
   ) = (
     SELECT COUNT(*) FROM course_lessons cl
      WHERE cl.course_id = c.id
        AND cl.is_required = TRUE
        AND ce.progress -> cl.id::text ->> 'status' = 'passed'
   );
