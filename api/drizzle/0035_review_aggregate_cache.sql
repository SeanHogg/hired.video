-- Migration: 0035_review_aggregate_cache
--
-- Phase D of the polymorphic content rollout. Cache the headline
-- review aggregate (count + avg) on each parent row so list/card
-- queries (directory pages, OG cards, header stats) don't re-scan
-- the `reviews` table per render. The cache is recomputed in the
-- API on every review write/delete by `recomputeAggregateCache()`
-- in api/src/routes/reviews.ts.
--
-- Subjects covered here:
--   - company_profiles            ← new columns (this migration)
--   - creator_profiles            ← already has averageRating /
--                                   ratingCount from migration 0009;
--                                   the recompute hook now writes
--                                   to those existing columns from
--                                   the polymorphic `reviews` table.
--
-- Other subject types (resume, video, voice_clone, service) will get
-- their own cache columns when their rating UI ships — adding them
-- piecemeal keeps each migration focused.

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS review_avg_overall numeric(3,2);

-- Backfill from any reviews already present (the 0032 backfill from
-- legacy company_reviews into the polymorphic table runs first).
UPDATE company_profiles cp
SET
  review_count = sub.cnt,
  review_avg_overall = sub.avg
FROM (
  SELECT
    subject_id,
    count(*)::int           AS cnt,
    avg(overall_rating)::numeric(3,2) AS avg
  FROM reviews
  WHERE subject_type = 'company' AND status = 'published'
  GROUP BY subject_id
) sub
WHERE cp.id = sub.subject_id;

-- Backfill creator_profiles from the polymorphic reviews. Mirrors
-- the legacy recompute that lived in the old POST /projects/:id/review
-- handler — that endpoint is now 410'd, so this migration restores
-- the cache to a correct state in case any reviews were created
-- after the route went away.
UPDATE creator_profiles cf
SET
  average_rating = sub.avg,
  rating_count   = sub.cnt
FROM (
  SELECT
    pp.creator_id,
    count(*)::int                     AS cnt,
    avg(r.overall_rating)::numeric(3,2) AS avg
  FROM reviews r
  INNER JOIN promo_projects pp ON pp.id = r.subject_id
  WHERE r.subject_type = 'promo_project' AND r.status = 'published'
  GROUP BY pp.creator_id
) sub
WHERE cf.user_id = sub.creator_id;
