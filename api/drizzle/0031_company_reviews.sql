-- Migration: 0031_company_reviews
--
-- Glassdoor-style company reviews + multi-dimensional ratings. One row
-- per (company_id, user_id); a re-submission updates the existing row
-- via the unique index below. Sub-ratings are kept as columns (not
-- jsonb) so AVG()/COUNT()-by-bucket aggregates can be computed in SQL
-- without parsing JSON. A nullable sub-rating means the reviewer
-- skipped that dimension; it's excluded from that axis's average.
--
-- Premium gating is enforced at the route layer (requirePremium); the
-- table itself accepts writes from any authenticated user once the
-- middleware has cleared. Public list endpoints filter on
-- status='published' so flagged/removed reviews vanish from the page
-- but are retained for audit + author-facing visibility.

CREATE TABLE IF NOT EXISTS company_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id)            ON DELETE CASCADE,

  -- Headline rating, required. CHECK constraint mirrors the route-layer
  -- validation; defence in depth in case a backfill or admin tool ever
  -- writes directly.
  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),

  -- Optional sub-axes. NULL = reviewer skipped this axis.
  culture_rating           smallint CHECK (culture_rating           BETWEEN 1 AND 5),
  leadership_rating        smallint CHECK (leadership_rating        BETWEEN 1 AND 5),
  work_life_balance_rating smallint CHECK (work_life_balance_rating BETWEEN 1 AND 5),
  compensation_rating      smallint CHECK (compensation_rating      BETWEEN 1 AND 5),
  career_growth_rating     smallint CHECK (career_growth_rating     BETWEEN 1 AND 5),
  diversity_rating         smallint CHECK (diversity_rating         BETWEEN 1 AND 5),

  title  varchar(200) NOT NULL,
  pros   text,
  cons   text,
  advice text,

  -- Self-declared, NOT verified.
  employment_status varchar(20),  -- 'current' | 'former'
  job_title         varchar(120),
  location_label    varchar(120),

  status varchar(20) NOT NULL DEFAULT 'published',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Page-load query: list this company's published reviews newest-first.
CREATE INDEX IF NOT EXISTS idx_company_reviews_company
  ON company_reviews (company_id, created_at DESC);

-- "My reviews" / per-user history.
CREATE INDEX IF NOT EXISTS idx_company_reviews_user
  ON company_reviews (user_id, created_at DESC);

-- One review per (company, user). Re-submitting updates the existing
-- row — the route handler does an upsert keyed on this index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_reviews_company_user
  ON company_reviews (company_id, user_id);
