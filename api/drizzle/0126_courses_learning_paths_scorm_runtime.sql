-- Migration: Learning pathways (DAG prerequisites) + SCORM runtime + xAPI LRS
-- + employer authoring + gamification badges for the training loop.
--
-- Closes README "Training Materials & SCORM — Build Strategy" gaps:
--   #161 — SCORM 1.2 player runtime (CMI state persistence) + xAPI emitter
--   #165 — verifiable certificate issuance (the prereq schema; the route
--          ships in api/src/routes/verify.ts in the same change)
--   sub-of-#160 — learning path / prerequisite chaining (DAG, per the
--          design decision recorded in project_learning_pathways memory)
--
-- Authoring eligibility (project_creator_persona_model + project_pricing_seats):
--   creator program OR employer role — employers publish internal training
--   without becoming creators. courses.is_employer_authored just records
--   which path the row came through so we can scope marketplace listings.

-- 1. courses gain an authoring-origin flag --------------------------------
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_employer_authored BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Course prerequisite DAG ----------------------------------------------
--
-- Edge list: (course_id, prerequisite_course_id) where the prerequisite
-- must be passed before the course unlocks. Cycle detection lives in
-- LearningPathService.assertNoCycle() — Postgres won't enforce DAG-ness,
-- so the service layer rejects insertions that would create a cycle.
CREATE TABLE IF NOT EXISTS course_prerequisites (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prerequisite_course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT course_prereq_no_self CHECK (course_id <> prerequisite_course_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_prerequisites_edge
  ON course_prerequisites (course_id, prerequisite_course_id);

CREATE INDEX IF NOT EXISTS idx_course_prerequisites_prereq
  ON course_prerequisites (prerequisite_course_id);

-- 3. Learning paths -------------------------------------------------------
--
-- A path is a named collection of courses. The DAG above defines unlock
-- order; the path just supplies a curated display sequence and its own
-- enrollment + completion signal (so "Front-End Track" path completion
-- is a distinct gamification event from any single course passing).
CREATE TABLE IF NOT EXISTS learning_paths (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug                VARCHAR(255) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  summary             TEXT,
  description         TEXT,
  cover_image_url     TEXT,
  category            VARCHAR(100),
  tags                JSONB        NOT NULL DEFAULT '[]'::jsonb,
  difficulty          VARCHAR(32),

  -- draft | published | unlisted
  status              VARCHAR(32)  NOT NULL DEFAULT 'draft',
  published_at        TIMESTAMPTZ,

  -- Issued on completion of every required course in the path. The path
  -- cert is separate from per-course certs; both can be issued.
  issues_certificate  BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Authoring path tag (mirrors courses.is_employer_authored).
  is_employer_authored BOOLEAN     NOT NULL DEFAULT FALSE,

  enrollment_count    INTEGER      NOT NULL DEFAULT 0,
  completion_count    INTEGER      NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_paths_user
  ON learning_paths (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_paths_status_published
  ON learning_paths (status, published_at DESC)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_paths_user_slug
  ON learning_paths (user_id, slug);

-- 4. Path → course join (ordered curated sequence) ------------------------
--
-- display_order is the curated order shown in the path UI; the actual
-- *unlock* order is computed from course_prerequisites (DAG topo). These
-- two can disagree — the path author may want to teach Course C before
-- Course B even though B has no prerequisite (e.g., easier on-ramp).
CREATE TABLE IF NOT EXISTS learning_path_courses (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id       UUID         NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id     UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_required   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_path_courses_edge
  ON learning_path_courses (path_id, course_id);

CREATE INDEX IF NOT EXISTS idx_learning_path_courses_path
  ON learning_path_courses (path_id, display_order);

CREATE INDEX IF NOT EXISTS idx_learning_path_courses_course
  ON learning_path_courses (course_id);

-- 5. Learning path enrollments (one per user, per path) -------------------
CREATE TABLE IF NOT EXISTS learning_path_enrollments (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id      UUID         NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_path_enrollments_user
  ON learning_path_enrollments (user_id, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_path_enrollments_path
  ON learning_path_enrollments (path_id, enrolled_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_path_enrollments_user_path
  ON learning_path_enrollments (user_id, path_id);

-- 6. SCORM CMI state persistence (#161 runtime) ---------------------------
--
-- One row per (enrollment, lesson). cmi holds the full SCORM 1.2 or 2004
-- data model (cmi.core.lesson_status, cmi.core.score.raw, cmi.suspend_data,
-- cmi.interactions.*, cmi.objectives.*) — opaque blob; the scorm-again
-- client owns the schema. completion_status / score_raw are denormalised
-- copies so we can roll up course progress without parsing the blob on
-- every PATCH /enrollments/:id/progress call.
CREATE TABLE IF NOT EXISTS scorm_cmi_states (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id      UUID         NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  lesson_id          UUID         NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  scorm_version      VARCHAR(16)  NOT NULL,                 -- "1.2" | "2004_1..4"
  cmi                JSONB        NOT NULL DEFAULT '{}'::jsonb,
  completion_status  VARCHAR(32),                            -- not_attempted | incomplete | completed | passed | failed
  score_raw          REAL,
  score_min          REAL,
  score_max          REAL,
  total_time_sec     INTEGER      NOT NULL DEFAULT 0,
  suspend_data       TEXT,                                   -- promoted out of cmi for fast resume
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scorm_cmi_enrollment_lesson
  ON scorm_cmi_states (enrollment_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_scorm_cmi_lesson
  ON scorm_cmi_states (lesson_id, updated_at DESC);

-- 7. xAPI / Tin Can statements (internal LRS) -----------------------------
--
-- Statements live here long-term so the analytics dashboard can roll up
-- "viewed", "completed", "passed", "scored" events across non-SCORM
-- lessons too (the Studio-video lesson player emits xAPI on heatmap
-- completion). External LRS forwarding (per project_enterprise_roadmap)
-- bolts on later: we mirror our writes to whatever URL the enterprise
-- customer configures.
CREATE TABLE IF NOT EXISTS xapi_statements (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id   UUID         REFERENCES course_enrollments(id) ON DELETE SET NULL,
  lesson_id       UUID         REFERENCES course_lessons(id) ON DELETE SET NULL,
  course_id       UUID         REFERENCES courses(id) ON DELETE SET NULL,
  -- Verb URIs are the xAPI standard (e.g. http://adlnet.gov/expapi/verbs/completed)
  verb_id         VARCHAR(255) NOT NULL,
  verb_display    VARCHAR(80),                                -- short name for analytics
  object_id       VARCHAR(255) NOT NULL,                      -- typically the lesson URN
  object_type     VARCHAR(40)  NOT NULL DEFAULT 'Activity',
  result_score    REAL,
  result_success  BOOLEAN,
  -- Full statement preserved for replay / external-LRS forwarding.
  statement       JSONB        NOT NULL,
  stored_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xapi_user_stored
  ON xapi_statements (user_id, stored_at DESC);

CREATE INDEX IF NOT EXISTS idx_xapi_enrollment
  ON xapi_statements (enrollment_id, stored_at DESC);

CREATE INDEX IF NOT EXISTS idx_xapi_verb
  ON xapi_statements (verb_id, stored_at DESC);

-- 8. Gamification badge seeds for the training loop ----------------------
--
-- Award triggers wired in api/src/domains/gamification/badge-engine.ts:
--   first_lesson_passed       → on first `lesson.completed` action
--   first_course_passed       → on first `course.passed` action
--   courses_completed_5       → on 5th `course.passed` action
--   first_certificate_earned  → on first `certificate.earned` action
--   first_path_completed      → on first `learning.path.completed` action
--   instructor_first_course   → awarded by route layer when an authored
--                                course publishes for the first time
INSERT INTO badges (slug, name, description, tier, icon_key, points_reward, roles, is_repeatable) VALUES
  ('first_lesson_passed',      'Eager Learner',     'Completed your first course lesson.',          'bronze', 'book-open',   25,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('first_course_passed',      'Graduate',          'Passed your first course.',                    'silver', 'graduation-cap', 100, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('courses_completed_5',      'Lifelong Learner',  'Passed five courses.',                         'gold',   'graduation-cap', 500, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('first_certificate_earned', 'Certified',         'Earned your first verifiable certificate.',    'silver', 'award',       150, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('first_path_completed',     'Trailblazer',       'Completed your first learning pathway.',       'gold',   'route',       300, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('instructor_first_course',  'Instructor',        'Published your first course as an author.',    'silver', 'mic',         100, '["job_seeker","recruiter","employer"]'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;
