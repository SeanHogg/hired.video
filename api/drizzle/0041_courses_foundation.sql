-- Migration: Courses / SCORM / Certifications foundation (#160)
--
-- Build strategy: see "Training Materials & SCORM — Build Strategy" in README.
-- ~80% of the authoring surface comes from Studio reuse (storyboard generator,
-- scenes, voiceover, captions, brand kits, chapters, thumbnails, hook
-- optimizer, review comments, heatmap, forms, async interviews, skills demos,
-- skill assessments). This migration adds the missing course→module→lesson
-- hierarchy + enrolment + certificate schema.
--
-- Out of scope here: SCORM 1.2/2004 player runtime (#161 — see scorm-again),
-- xAPI emitter (#161 sub), LMS connectors (#200), in-video knowledge-check
-- formType repurpose (#201). Those bolt on to this schema.

-- 1. Courses
CREATE TABLE IF NOT EXISTS courses (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug                VARCHAR(255) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  summary             TEXT,
  description         TEXT,
  cover_image_url     TEXT,
  category            VARCHAR(100),
  tags                JSONB        NOT NULL DEFAULT '[]'::jsonb,
  difficulty          VARCHAR(32),                          -- beginner | intermediate | advanced
  estimated_minutes   INTEGER,

  -- draft | published | unlisted | flagged
  status              VARCHAR(32)  NOT NULL DEFAULT 'draft',
  published_at        TIMESTAMPTZ,

  -- Pricing per-sale (95/5 to creator + CC fee to buyer per #156). Snapshotted
  -- at publish time onto enrolment rows so future fee changes don't affect
  -- already-purchased enrolments.
  price_cents         INTEGER      NOT NULL DEFAULT 0,
  price_visible       BOOLEAN      NOT NULL DEFAULT TRUE,
  platform_fee_bps    INTEGER      NOT NULL DEFAULT 500,    -- 5% snapshotted at publish

  -- Cert config — courses optionally issue a verifiable cert on completion
  -- (#165). passing_score_pct is the threshold on the final assessment.
  issues_certificate  BOOLEAN      NOT NULL DEFAULT FALSE,
  passing_score_pct   INTEGER,                              -- 0..100; null when no cert

  -- Aggregate stats — denormalised for fast list/marketplace rendering.
  enrollment_count    INTEGER      NOT NULL DEFAULT 0,
  completion_count    INTEGER      NOT NULL DEFAULT 0,
  average_rating      REAL,                                 -- 0..5, null until first review
  rating_count        INTEGER      NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_user
  ON courses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_status_published
  ON courses (status, published_at DESC)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_user_slug
  ON courses (user_id, slug);

-- 2. Modules — chapters within a course
CREATE TABLE IF NOT EXISTS course_modules (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  summary     TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course
  ON course_modules (course_id, sort_order);

-- 3. Lessons — leaf content. Polymorphic source: an existing Studio video,
-- an uploaded SCORM package (#161 — runtime via scorm-again), or an external
-- URL (mostly for v1 imports).
CREATE TABLE IF NOT EXISTS course_lessons (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id            UUID         REFERENCES course_modules(id) ON DELETE CASCADE,
  title                VARCHAR(255) NOT NULL,
  summary              TEXT,

  -- studio_video | scorm_package | external_url | text_md
  source_type          VARCHAR(32)  NOT NULL,
  -- One of these is set based on source_type.
  studio_project_id    TEXT,                               -- studio_video
  scorm_manifest_url   TEXT,                               -- scorm_package — R2 URL of imsmanifest.xml after upload extraction
  scorm_entry_url      TEXT,                               -- scorm_package — R2 URL of the launchable resource
  scorm_version        VARCHAR(16),                        -- "1.2" | "2004_1" | "2004_2" | "2004_3" | "2004_4"
  external_url         TEXT,                               -- external_url
  body_md              TEXT,                               -- text_md

  estimated_minutes    INTEGER,
  is_required          BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Optional in-video knowledge check (#201 — repurposed studio_video_forms)
  knowledge_check_form_id  UUID,
  sort_order           INTEGER      NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course
  ON course_lessons (course_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_course_lessons_module
  ON course_lessons (module_id, sort_order);

-- 4. Enrolments — one per (user, course). Per-lesson progress lives in JSONB
-- so v1 doesn't need a lessons-per-enrollment table; we promote to a real
-- table if/when reporting requirements demand it.
CREATE TABLE IF NOT EXISTS course_enrollments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  enrolled_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,

  -- Shape: { [lesson_id]: { status: 'not_started'|'in_progress'|'passed'|'failed',
  --                          scoreRaw, scoreMax, timeSpentSec, lastSeenAt } }
  -- SCORM lessons populate via /api/courses/scorm/:enrollmentId/commit;
  -- Studio-video lessons populate via the heatmap tracker on watch-complete.
  progress            JSONB        NOT NULL DEFAULT '{}'::jsonb,

  final_score_pct     INTEGER,
  passed              BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Payment snapshot for paid courses (95/5 split). null for free courses.
  payment_ref         TEXT,
  paid_amount_cents   INTEGER,
  paid_at             TIMESTAMPTZ,
  platform_fee_cents  INTEGER,                                -- snapshot of 5% at purchase
  creator_cut_cents   INTEGER,                                -- snapshot of 95% at purchase

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_user
  ON course_enrollments (user_id, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_course
  ON course_enrollments (course_id, enrolled_at DESC);

-- One active enrolment per (user, course). Re-enrolment after completion is
-- discouraged in v1 (the existing row records both attempts) — if/when we
-- need cohort-style re-enrolment, drop this and add `cohort_id`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_enrollments_user_course
  ON course_enrollments (user_id, course_id);

-- 5. Certificates — issued on passing the course final.
-- Public verify URL is /verify/:cert_number. signed_payload is an Ed25519
-- (preferred) or JWT signature over { certNumber, courseId, userId, issuedAt,
-- recipientName, courseTitle } so the verify page can prove authenticity
-- without a DB hit.
CREATE TABLE IF NOT EXISTS course_certificates (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     UUID         NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  course_id         UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  cert_number       VARCHAR(64)  NOT NULL UNIQUE,           -- short human-readable, e.g. HV-2026-A1B2C3D4
  issued_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,                            -- some cert programs have expiry
  signed_payload    TEXT         NOT NULL,

  -- Snapshot at issue time so renaming the course or the user later doesn't
  -- mutate the certificate's content.
  course_title      VARCHAR(255) NOT NULL,
  recipient_name    VARCHAR(255) NOT NULL,

  -- Optional bridge to third-party cert providers (Accredible / Credly) for
  -- buyers who require those badges. null when self-issued.
  external_provider VARCHAR(64),
  external_id       TEXT,

  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_certificates_user
  ON course_certificates (user_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_certificates_course
  ON course_certificates (course_id, issued_at DESC);
