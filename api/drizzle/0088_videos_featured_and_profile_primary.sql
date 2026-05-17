-- 0088 — Featured-video + profile-primary singletons.
--
-- Two new singletons, both enforced via partial unique indexes (Postgres
-- only counts NULL/false rows once because the WHERE clause excludes
-- them, so the "only one true" constraint is DB-enforced):
--
--   videos.is_featured                  — global SA-curated hero video on
--                                         the homepage. Exactly 0 or 1
--                                         row is_featured=true. Set via
--                                         PATCH /api/admin/studio/
--                                         videos/:id/featured (SA only).
--
--   studio_projects.is_profile_primary  — per-user "THE video resume on
--                                         my profile" pointer. Set when
--                                         the user clicks Publish to
--                                         Profile from the studio
--                                         ellipsis. Atomically rolls off
--                                         any sibling primary in the
--                                         same transaction.
--
-- Closes gap-register #723/#724/#725 (publish/unpublish semantics) and
-- adds the homepage-featured flag the user requested for /admin/studio.
--
-- Idempotency follows the 0086 pattern: every ALTER uses `IF NOT EXISTS`
-- / `IF EXISTS` so re-runs are no-ops until the migration ledger (#697)
-- lands.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Singleton enforcement: at most one row may have is_featured=true.
-- Partial index = no impact on the millions of false rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_videos_is_featured_singleton
  ON videos ((is_featured))
  WHERE is_featured = true;

ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS is_profile_primary boolean NOT NULL DEFAULT false;

-- Singleton per user: at most one project per (user_id) may be
-- is_profile_primary=true. A user with no published profile video has
-- zero true rows and the index entry is omitted entirely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_projects_profile_primary_per_user
  ON studio_projects (user_id)
  WHERE is_profile_primary = true;

-- Backfill: for every user with at least one status='published' project,
-- promote their most-recently-published one to primary. Without this,
-- existing publishers would have an empty profile slot until they
-- re-clicked Publish.
WITH ranked AS (
  SELECT id,
         user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
  FROM studio_projects
  WHERE status = 'published'
)
UPDATE studio_projects sp
SET is_profile_primary = true
FROM ranked r
WHERE sp.id = r.id
  AND r.rn = 1
  AND sp.is_profile_primary = false;
