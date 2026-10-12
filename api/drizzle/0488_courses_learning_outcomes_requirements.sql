-- #2068 GAP-1 — structured course `learningOutcomes` + `requirements`.
-- EnergizeLMS parity: today a course only has free-text `summary`/`description`;
-- learners want the "What you'll learn" / "Requirements" bullet lists every
-- marketplace LMS surfaces. Both are stored as JSONB string arrays (ordered
-- bullets), defaulting to an empty array so existing rows + the public-detail
-- projection stay non-null. Idempotent (IF NOT EXISTS).

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS learning_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;
