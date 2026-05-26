-- Migration 0134 — Interviewer certification gate (#1384).
--
-- Adds an optional FK from `scorecard_templates` to `courses` so a
-- template can require the evaluator hold an active certificate from
-- a specific learning path before they're allowed to submit a
-- scorecard against it. Closes the "Greenhouse + Mosaic.io" parity
-- gap natively — no third-party LMS integration.

ALTER TABLE scorecard_templates
  ADD COLUMN IF NOT EXISTS required_certification_course_id UUID
    REFERENCES courses(id) ON DELETE SET NULL;
