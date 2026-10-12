-- 0183 — SCORM bundle close-out (gap-register pass for SCORM Open items):
--   #1400 / build-strategy "External LRS forwarding"  external_lrs_targets
--   build-strategy "Course payment / cart wiring"     course_checkouts
--
-- Both tables sit on top of the existing courses + xapi_statements
-- foundation. Enterprise xAPI mirroring + paid-course enrolment were the
-- last two structural gaps in the SCORM build strategy; everything else
-- in the bundle (cert revocation endpoint, LMS OAuth callbacks, SCORM
-- export pipeline, ScormPlayer a11y + iframe theme postMessage) lands
-- via app code only, no schema change.

BEGIN;

-- ---------------------------------------------------------------------------
-- external_lrs_targets — per-user xAPI forwarding endpoints. Every row
-- written to xapi_statements is mirrored to each active target for that
-- user (services/learning/lrs-forwarder.ts). Errors per-target are
-- persisted on the row + never bubble to the API path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_lrs_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  auth_mode varchar(16) NOT NULL DEFAULT 'none',
  auth_token text,
  custom_headers jsonb,
  active boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_lrs_user_active
  ON external_lrs_targets(user_id, active);

-- ---------------------------------------------------------------------------
-- course_checkouts — paid-enrolment ledger. Mirrors boost_checkouts but
-- scoped to courses: a pending row pre-allocates the total + split, the
-- existing /api/payment provider collects USD, the confirm-payment route
-- (POST /api/course-checkout/:id/confirm-payment) flips the row to `paid`
-- and creates the matching course_enrollments row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES course_enrollments(id) ON DELETE SET NULL,
  total_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  creator_cut_cents integer NOT NULL DEFAULT 0,
  provider_payment_id text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  refunded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_checkouts_user
  ON course_checkouts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_course_checkouts_course
  ON course_checkouts(course_id, created_at);

-- Partial unique index: at most one pending checkout per (user, course).
-- A refresh that fires /start again returns the existing pending row,
-- and the constraint catches a race where two POSTs land at once. Once
-- the row flips to paid/expired/refunded, the constraint releases so a
-- future re-purchase mints a fresh row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_checkouts_pending_user_course
  ON course_checkouts(user_id, course_id)
  WHERE status = 'pending';

COMMIT;
