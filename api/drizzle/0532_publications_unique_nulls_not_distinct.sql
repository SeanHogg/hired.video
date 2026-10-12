-- Migration 0532: keep uq_studio_project_publications_proj_dest_variant NULLS NOT DISTINCT
-- studioPublications.ts no longer declares .nullsNotDistinct(): drizzle-kit 0.31
-- introspects every unique constraint as nullsNotDistinct=false, so the
-- declaration made push drop + re-add the constraint on every deploy and stop on
-- its "truncate studio_project_publications?" prompt (no TTY in CI).
--
-- The schema now declares the plain constraint, so on a fresh database push
-- creates it WITHOUT NULLS NOT DISTINCT and 0529 skips it (the name already
-- exists). This upgrades it in place. Where 0529 already applied it (prod),
-- this is a no-op.
--
-- Duplicate guard: the upgrade fails on duplicate (project_id, destination,
-- NULL render_variant_id) rows. It raises instead of deleting anything.
-- Idempotent: gated on pg_constraint + pg_index.indnullsnotdistinct (PG15+).
-- No BEGIN/COMMIT — the runner applies statement by statement; the DO block is
-- one statement, so the drop + re-add is atomic.

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_index i ON i.indexrelid = c.conindid
    WHERE c.conname = 'uq_studio_project_publications_proj_dest_variant'
      AND NOT i.indnullsnotdistinct
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM studio_project_publications
      GROUP BY project_id, destination, render_variant_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'uq_studio_project_publications_proj_dest_variant: duplicate (project_id, destination, render_variant_id) rows exist — dedupe before upgrading to NULLS NOT DISTINCT';
    END IF;

    ALTER TABLE studio_project_publications
      DROP CONSTRAINT uq_studio_project_publications_proj_dest_variant;
    ALTER TABLE studio_project_publications
      ADD CONSTRAINT uq_studio_project_publications_proj_dest_variant
      UNIQUE NULLS NOT DISTINCT (project_id, destination, render_variant_id);
  END IF;
END $mig$;
