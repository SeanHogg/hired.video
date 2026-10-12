-- Migration 0529: publications unique includes render_variant_id (#2300 R14)
-- Split out of 0528 so the additive posting-agent columns can ship without
-- waiting on this swap. drizzle-kit push / ensure-unique-constraints will
-- also try to create this from studioPublications.ts — run the audit
-- BEFORE the next push, not only before applying this SQL.
--
-- @owner-gated
-- The unique-constraint swap fails if duplicate (project_id, destination,
-- render_variant_id) rows exist. Do not apply until the owner has run the
-- duplicate-audit query below and it returns 0 rows:
--
--   SELECT project_id, destination, render_variant_id, COUNT(*) AS n
--   FROM studio_project_publications
--   GROUP BY 1, 2, 3
--   HAVING COUNT(*) > 1;
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS / pg_constraint guards.
-- Name and NULLS NOT DISTINCT match unique() in studioPublications.ts so
-- ensure-unique-constraints / drizzle-kit push do not rewrite it after
-- this migration lands.
-- Add the new constraint first so a failure leaves the old index in place.
-- No BEGIN/COMMIT — the runner applies statement by statement.

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT project_id, destination, render_variant_id
      FROM studio_project_publications
      GROUP BY 1, 2, 3
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'uq_studio_project_publications_proj_dest_variant: duplicate (project_id, destination, render_variant_id) rows exist — run the duplicate-audit query in 0529_publications_variant_unique.sql';
  END IF;
END $mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_studio_project_publications_proj_dest_variant'
  ) THEN
    ALTER TABLE studio_project_publications
      ADD CONSTRAINT uq_studio_project_publications_proj_dest_variant
      UNIQUE NULLS NOT DISTINCT (project_id, destination, render_variant_id);
  END IF;
END $mig$;

DROP INDEX IF EXISTS uq_studio_project_publications_proj_dest;
