-- Migration 0194 — Learning cohorts / classrooms + assignments (#1887/#1888).
--
-- Adds the educator↔student group layer on top of the individual-learner
-- learning vertical (courses/enrollments/SCORM/xAPI/paths/certs, mig 0126):
--
--   learning_cohorts     — a class owned by an educator (creator) or an
--                          employer company. Ownership mirrors the Studio
--                          aggregate (owner_user_id always set = creator;
--                          owner_company_id set for company-owned). Every
--                          mutation routes through canActFor() at the
--                          service layer.
--   cohort_members       — identity-link roster (user / invited_email /
--                          placeholder), mirroring people_employees.
--   learning_assignments — assign a course|path to the whole cohort or one
--                          member, with due date + required flag. Enrollment
--                          fan-out is materialised by AssignmentService so
--                          progress tracking starts immediately.
--
-- Idempotent per drizzle/TEMPLATE.md — CREATE … IF NOT EXISTS, inline
-- CHECKs, gated index creation.

-- ── Cohorts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_cohorts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  name             VARCHAR(200) NOT NULL,
  description      TEXT,
  join_code        VARCHAR(16),
  status           VARCHAR(16) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','archived')),
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_cohorts_owner_user
  ON learning_cohorts (owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_cohorts_owner_company
  ON learning_cohorts (owner_company_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_cohorts_join_code
  ON learning_cohorts (join_code);

-- ── Members (roster) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cohort_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id     UUID NOT NULL REFERENCES learning_cohorts(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  invited_email VARCHAR(320),
  display_name  VARCHAR(200),
  role          VARCHAR(16) NOT NULL DEFAULT 'student'
                  CHECK (role IN ('student','co_educator')),
  status        VARCHAR(16) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('invited','active','removed')),
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort
  ON cohort_members (cohort_id, status);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user
  ON cohort_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_members_cohort_user
  ON cohort_members (cohort_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_members_cohort_email
  ON cohort_members (cohort_id, invited_email);

-- ── Assignments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           UUID NOT NULL REFERENCES learning_cohorts(id) ON DELETE CASCADE,
  member_id           UUID REFERENCES cohort_members(id) ON DELETE CASCADE,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_type        VARCHAR(16) NOT NULL
                        CHECK (subject_type IN ('course','path')),
  subject_id          UUID NOT NULL,
  required            BOOLEAN NOT NULL DEFAULT true,
  due_at              TIMESTAMPTZ,
  status              VARCHAR(16) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_assignments_cohort
  ON learning_assignments (cohort_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_assignments_subject
  ON learning_assignments (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_learning_assignments_member
  ON learning_assignments (member_id);
