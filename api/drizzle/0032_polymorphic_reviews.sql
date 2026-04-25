-- Migration: 0032_polymorphic_reviews
--
-- Consolidate two single-purpose review tables (`company_reviews` from
-- 0031, and `promo_project_reviews` from 0009) into one polymorphic
-- `reviews` + `review_comments` pair, keyed on (subject_type,
-- subject_id, user_id). Sub-ratings + per-type metadata move to jsonb
-- because they vary per subject. The TS descriptor in
-- shared/reviews/subject-descriptors.ts is the source of truth for
-- which keys belong to which subject type.
--
-- Why fold:
--  - Two divergent review patterns were already growing (one per
--    sellable type) — six more were on the roadmap (services,
--    voice clones, resume templates, job templates, …). Fixing now
--    keeps the next six from being one migration each.
--  - Comments need to surface in the dashboard feed; one comments
--    table beats N parallel "X_comments" tables.
--  - Aggregate-cache columns on the parent (e.g. companies.review_count)
--    apply uniformly when the source table is uniform.
--
-- Backfill is in this migration so existing rows (creator marketplace
-- reviews) carry forward unchanged from the user's perspective. The
-- old tables are dropped at the end — the API has been rewritten to
-- read/write from the new tables in the same release.

-- ─── 1. New tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_type varchar(32) NOT NULL,
  subject_id   uuid        NOT NULL,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  title varchar(200) NOT NULL,
  body  text,

  sub_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_verified         boolean    NOT NULL DEFAULT false,
  verification_method varchar(32),

  status varchar(20) NOT NULL DEFAULT 'published',

  submitter_ip_hash varchar(16),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_subject
  ON reviews (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_user
  ON reviews (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reviews_subject_user
  ON reviews (subject_type, subject_id, user_id);

CREATE TABLE IF NOT EXISTS review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  parent_id uuid REFERENCES review_comments(id)  ON DELETE CASCADE,

  body text NOT NULL,

  is_subject_owner boolean NOT NULL DEFAULT false,

  status varchar(20) NOT NULL DEFAULT 'published',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review
  ON review_comments (review_id, created_at);

CREATE INDEX IF NOT EXISTS idx_review_comments_parent
  ON review_comments (parent_id);

-- ─── 2. Backfill from `company_reviews` (0031) ──────────────────────────────
-- Guarded with an information_schema check so this migration is safe
-- to run whether 0031 was actually applied or not — the user may have
-- skipped 0031 and gone straight to 0032.

DO $migration_2$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'company_reviews'
  ) THEN
    INSERT INTO reviews (
      id, subject_type, subject_id, user_id,
      overall_rating, title, body,
      sub_ratings, metadata,
      is_verified, verification_method,
      status, submitter_ip_hash,
      created_at, updated_at
    )
    SELECT
      cr.id,
      'company',
      cr.company_id,
      cr.user_id,
      cr.overall_rating,
      cr.title,
      NULL,
      jsonb_strip_nulls(jsonb_build_object(
        'culture',         cr.culture_rating,
        'leadership',      cr.leadership_rating,
        'workLifeBalance', cr.work_life_balance_rating,
        'compensation',    cr.compensation_rating,
        'careerGrowth',    cr.career_growth_rating,
        'diversity',       cr.diversity_rating
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'pros',             cr.pros,
        'cons',             cr.cons,
        'advice',           cr.advice,
        'employmentStatus', cr.employment_status,
        'jobTitle',         cr.job_title,
        'locationLabel',    cr.location_label
      )),
      false, NULL,
      cr.status, NULL,
      cr.created_at, cr.updated_at
    FROM company_reviews cr
    ON CONFLICT (subject_type, subject_id, user_id) DO NOTHING;
  END IF;
END
$migration_2$;

-- ─── 3. Backfill from `promo_project_reviews` (0009) ────────────────────────
-- Note: promo_project_reviews.is_public = false → status='hidden'.
-- creator_reply / creator_replied_at → first row in review_comments,
-- with is_subject_owner = true.

INSERT INTO reviews (
  id, subject_type, subject_id, user_id,
  overall_rating, title, body,
  sub_ratings, metadata,
  is_verified, verification_method,
  status, submitter_ip_hash,
  created_at, updated_at
)
SELECT
  pr.id,
  'promo_project',
  pr.project_id,
  pr.customer_id,
  pr.rating,
  COALESCE(pr.title, 'Customer review'),
  pr.body,
  jsonb_strip_nulls(jsonb_build_object(
    'communication', pr.communication_score,
    'quality',       pr.quality_score,
    'timeliness',    pr.timeliness_score
  )),
  '{}'::jsonb,
  -- Buyers are inherently verified for promo project reviews — the
  -- old route enforced `project.customer_id = user_id` before insert,
  -- so every row here is a verified-buyer review by construction.
  true, 'was_buyer',
  CASE WHEN pr.is_public THEN 'published' ELSE 'hidden' END,
  NULL,
  pr.created_at, pr.created_at
FROM promo_project_reviews pr
ON CONFLICT (subject_type, subject_id, user_id) DO NOTHING;

-- Surface creator replies as review_comments by the creator.
INSERT INTO review_comments (review_id, user_id, parent_id, body, is_subject_owner, status, created_at, updated_at)
SELECT
  pr.id,
  pr.creator_id,
  NULL,
  pr.creator_reply,
  true,
  'published',
  COALESCE(pr.creator_replied_at, pr.created_at),
  COALESCE(pr.creator_replied_at, pr.created_at)
FROM promo_project_reviews pr
WHERE pr.creator_reply IS NOT NULL AND length(trim(pr.creator_reply)) > 0;

-- ─── 4. Drop legacy tables ──────────────────────────────────────────────────
-- Dropped in the same migration as backfill so nothing in the running
-- code reads from the legacy tables once this migration completes. The
-- /api/companies/:id/reviews* and /api/creators/projects/:id/review
-- routes have been rewritten to target `reviews` in the same release.

DROP TABLE IF EXISTS company_reviews;
DROP TABLE IF EXISTS promo_project_reviews;
