-- Migration 0104 — drop the hand-listed `media_kind` CHECK constraints on
-- both `studio_projects` and `studio_templates`.
--
-- Per Consolidated Gap Register #960 (the bundled root-cause fix for the
-- deploy failure on migration 0099): every prior media_kind constraint
-- (0099 / 0100 / 0101 / 0102) hand-listed the MediaKind union as a SQL
-- string literal. That duplicated the canonical `MEDIA_KINDS` const in
-- `@shared/media-kinds.ts` and required a new migration on every kind
-- addition. The drift bit on 2026-05-22: production rows carried 'game'
-- / 'comic' / 'image' (kinds added via the application path before the
-- corresponding constraint-expand migration ran from scratch), so the
-- 4-kind CHECK in 0099 could not be (re-)added to a fresh DB seeded with
-- production data.
--
-- Single source of truth going forward: `MEDIA_KINDS` in
-- `@shared/media-kinds.ts`. Every API write boundary parses incoming
-- payloads with `z.enum(MEDIA_KINDS)` — see e.g.
-- [routes/studio.ts:1287](api/src/routes/studio.ts) where
-- `mediaKind: z.enum(MEDIA_KINDS).optional()` gates POST /api/studio.
-- Adding a kind = one entry in `MEDIA_KINDS`. No SQL migration needed;
-- the DB column stays `varchar(16) DEFAULT 'video' NOT NULL`.
--
-- Trade-off accepted: a malformed direct-SQL write or a future API route
-- that forgets Zod could insert an unknown string. The Zod boundary is
-- the application-layer guard; any path that skips it is a bug to fix
-- at the route, not a constraint to keep duplicated.

ALTER TABLE "studio_projects"
  DROP CONSTRAINT IF EXISTS "studio_projects_media_kind_check";

ALTER TABLE "studio_templates"
  DROP CONSTRAINT IF EXISTS "studio_templates_media_kind_check";
