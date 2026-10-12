-- Migration 0084 — Studio project slug uniqueness at the DB layer.
--
-- Before this migration, `ensureUniqueProjectSlug` in studio.ts read the
-- existing slugs and picked a free suffix, but `storyboard._slug` lives
-- inside JSONB with no unique index — two simultaneous saves of the same
-- title could both compute the same suffix and both commit (#687).
--
-- Approach: a generated column + partial unique index. The generated
-- column reads the slug out of the JSONB on every write so the JSON
-- remains the source of truth for old code paths; the partial unique
-- index guarantees there are never two non-null slugs in the table.
-- WHERE slug IS NOT NULL keeps the index narrow so legacy projects that
-- never got a slug don't collide on `NULL`.

ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS slug TEXT
    GENERATED ALWAYS AS (
      NULLIF(LOWER(storyboard ->> '_slug'), '')
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS studio_projects_slug_unique_idx
  ON studio_projects (slug)
  WHERE slug IS NOT NULL;
