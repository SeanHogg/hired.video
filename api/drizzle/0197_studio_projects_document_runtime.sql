-- Migration 0197 — `document` canvas runtime + media_kind constraint repair.
--
-- Adds the paged WYSIWYG document runtime (#1912) at the data layer and, per
-- [Full-fix scope], repairs two latent bugs in the same `media_kind` column it
-- touches. Three concerns, all on the media_kind axis (shared/media-kinds.ts):
--
--   1. WIDEN `studio_projects.media_kind` / `studio_templates.media_kind` from
--      varchar(16) → varchar(24). "interactive_comic" is 17 chars and never
--      fit the 16-char column — a latent bug (the value couldn't be stored).
--
--   2. REWRITE the media_kind CHECK on both tables to the FULL current kind
--      set PLUS 'document'. The live CHECK was last set in migration 0107 and
--      only allows through 'cad'; migration 0184 added the cad_3d_state column
--      but never relaxed the CHECK, so 'cad_3d' AND 'interactive_comic'
--      inserts would VIOLATE the constraint. Fixed here.
--
--   3. ADD `studio_projects.document_state` JSONB — the `DocumentState` shape
--      (pages + flow blocks + Widget overlays + theme + page geometry) in
--      frontend/lib/studio/editor-v2/document-state.ts. Mirrors the parallel
--      per-runtime state-column pattern (game_state / image_state / cad_state
--      / cad_3d_state). Null for every non-document project.
--
-- No data backfill — every existing row stays a non-document kind and
-- document_state stays null. Idempotent per drizzle/TEMPLATE.md.

-- 1. Widen media_kind length (gated on current length so re-runs are no-ops).
DO $$
BEGIN
  IF (
    SELECT character_maximum_length FROM information_schema.columns
    WHERE table_name = 'studio_projects' AND column_name = 'media_kind'
  ) < 24 THEN
    EXECUTE 'ALTER TABLE "studio_projects" ALTER COLUMN "media_kind" TYPE varchar(24)';
  END IF;
  IF (
    SELECT character_maximum_length FROM information_schema.columns
    WHERE table_name = 'studio_templates' AND column_name = 'media_kind'
  ) < 24 THEN
    EXECUTE 'ALTER TABLE "studio_templates" ALTER COLUMN "media_kind" TYPE varchar(24)';
  END IF;
END $$;

-- 2. Rewrite the CHECK to the full kind set + 'document'. DROP IF EXISTS → ADD
--    is idempotent (the DROP clears any prior version first). Now includes
--    cad_3d + interactive_comic, which the 0107 CHECK omitted.
ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";
ALTER TABLE "studio_projects"
  ADD CONSTRAINT "studio_projects_media_kind_check"
  CHECK ("media_kind" IN (
    'video', 'podcast', 'voice', 'animation', 'game', 'comic',
    'interactive_comic', 'image', 'cad', 'cad_3d', 'document'
  ));

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
ALTER TABLE "studio_templates"
  ADD CONSTRAINT "studio_templates_media_kind_check"
  CHECK ("media_kind" IN (
    'video', 'podcast', 'voice', 'animation', 'game', 'comic',
    'interactive_comic', 'image', 'cad', 'cad_3d', 'document'
  ));

-- 3. document_state JSONB column for mediaKind='document' projects.
ALTER TABLE "studio_projects"
  ADD COLUMN IF NOT EXISTS "document_state" jsonb;
