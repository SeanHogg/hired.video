-- 0610_studio_projects_state.sql
--
-- W3-D1 (architecture remediation 2026-10-17). studio_projects carried ten
-- mutually exclusive per-kind JSONB state columns; they collapse into ONE
-- `state` jsonb whose shape media_kind decides (shared/studio-project-state.ts):
--
--   video / podcast / voice / comic / interactive_comic -> timeline_spec
--   animation -> animation_state   game -> game_state      image -> image_state
--   cad -> cad_state               cad_3d -> cad_3d_state  document -> document_state
--
-- Kept as their own columns (genuine pairs, not per-kind state):
--   * storyboard — save-draft meta for EVERY kind (+ the V1 script for
--     kind='scene'); coexists with `state` on every row.
--   * interactive_comic_state — a Comic+ project saves BOTH its page
--     CanvasState (Timeline JSON -> `state`) AND this branch graph.
-- comic_state was never written by any code path (comic projects author via
-- timeline_spec); it is left frozen, not mapped.
--
-- Queried JSONB keys promoted to typed columns:
--   storyboard->>'_rev'                 -> revision  (optimistic concurrency)
--   storyboard->>'_name'                -> name
--   storyboard->>'_purpose'             -> purpose   (indexed; CHECK from shared/studio-purposes.ts)
--   timeline_spec->'_meta'->>'bakedHash' -> baked_hash (the JSON key stays: the
--                                          frontend freshness check reads it)
--
-- Never drops data: the legacy columns stay (frozen, still declared in the
-- schema so `drizzle-kit push --force`, which runs BEFORE this file, cannot
-- drop them first); 0611 snapshots them into the archive schema. Idempotent:
-- every backfill only fills a still-empty target.

ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS state jsonb;
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS name varchar(200);
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS purpose varchar(32);
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS baked_hash text;

-- 1. state = the column the row's media kind owns.
UPDATE studio_projects
SET state = CASE media_kind
    WHEN 'animation' THEN animation_state
    WHEN 'game'      THEN game_state
    WHEN 'image'     THEN image_state
    WHEN 'cad'       THEN cad_state
    WHEN 'cad_3d'    THEN cad_3d_state
    WHEN 'document'  THEN document_state
    ELSE timeline_spec
  END
WHERE state IS NULL
  AND CASE media_kind
    WHEN 'animation' THEN animation_state
    WHEN 'game'      THEN game_state
    WHEN 'image'     THEN image_state
    WHEN 'cad'       THEN cad_state
    WHEN 'cad_3d'    THEN cad_3d_state
    WHEN 'document'  THEN document_state
    ELSE timeline_spec
  END IS NOT NULL;

-- 2. baked_hash mirrors state._meta.bakedHash.
UPDATE studio_projects
SET baked_hash = state->'_meta'->>'bakedHash'
WHERE baked_hash IS NULL
  AND jsonb_typeof(state) = 'object'
  AND coalesce(state->'_meta'->>'bakedHash', '') <> '';

-- 3. revision from storyboard._rev (non-negative int; anything else stays 0).
UPDATE studio_projects
SET revision = (storyboard->>'_rev')::integer
WHERE revision = 0
  AND jsonb_typeof(storyboard) = 'object'
  AND storyboard->>'_rev' ~ '^[0-9]{1,9}$';

-- 4. name from storyboard._name.
UPDATE studio_projects
SET name = left(storyboard->>'_name', 200)
WHERE name IS NULL
  AND jsonb_typeof(storyboard) = 'object'
  AND coalesce(storyboard->>'_name', '') <> '';

-- 5. purpose from storyboard._purpose — only values the CHECK admits; any
--    other legacy value stays in the storyboard JSON untouched.
UPDATE studio_projects
SET purpose = storyboard->>'_purpose'
WHERE purpose IS NULL
  AND jsonb_typeof(storyboard) = 'object'
  AND storyboard->>'_purpose' IN ('basic', 'resume', 'job_ad', 'company_promo', 'recruiter_brand', 'product_launch', 'personal_brand', 'course_lesson', 'pitch');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_projects_purpose_check') THEN
    ALTER TABLE studio_projects
      ADD CONSTRAINT studio_projects_purpose_check
      CHECK (purpose IN ('basic', 'resume', 'job_ad', 'company_promo', 'recruiter_brand', 'product_launch', 'personal_brand', 'course_lesson', 'pitch')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_projects_purpose ON studio_projects (purpose);
