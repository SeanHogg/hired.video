-- 0580_artifact_views_merge.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17): fold every
-- per-feature view/event table into the polymorphic artifact_views table.
--
--   resume_views         -> artifact_views kind 'resume',  event_type 'view'
--   company_views        -> artifact_views kind 'company', event_type 'view'
--   job_view_events      -> artifact_views kind 'job',     event_type 'listing_view'
--   company_view_events  -> artifact_views kind 'company', event_type 'listing_view'
--   video_analytics      -> artifact_views kind = project media_kind,
--                           event_type player_view | impression | cta_click | share
--   profile_views        -> already archived by 0545 (its rows were copied by 0107).
--
-- `event_type` keeps the streams apart (registry: ARTIFACT_VIEW_EVENT_TYPES in
-- shared/artifact-views.ts). Every pre-0580 row is a 'view'.
--
-- resume_views / company_views: 0107 already copied their rows and every view
-- since was dual-written (server GET -> legacy table + an artifact_views row
-- with engagement NULL; client beacons always carry engagement). The résumé /
-- company `viewCount` now reads those server-recorded rows, so the backfill
-- here only tops up any résumé / company whose legacy count is higher than
-- its mirrored count (a dual-write that failed), keeping every count
-- identical. Re-running inserts nothing (the counts then match).
--
-- Old row ids are carried over, so every INSERT is idempotent on the PK.
-- The legacy tables move to the archive schema in 0585 (never dropped).
-- `drizzle-kit push` runs before this file and has usually already added the
-- columns / indexes / CHECK declared in schema/analytics.ts; every statement
-- here is guarded so it is a no-op then.

-- ── Columns ───────────────────────────────────────────────────────────────────
ALTER TABLE "artifact_views" ADD COLUMN IF NOT EXISTS "event_type" varchar(16) NOT NULL DEFAULT 'view';
ALTER TABLE "artifact_views" ADD COLUMN IF NOT EXISTS "source" varchar(32);
ALTER TABLE "artifact_views" ADD COLUMN IF NOT EXISTS "region" varchar(64);
ALTER TABLE "artifact_views" ADD COLUMN IF NOT EXISTS "campaign_id" text;
ALTER TABLE "artifact_views" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifact_views_event_type_check') THEN
    ALTER TABLE "artifact_views" ADD CONSTRAINT "artifact_views_event_type_check"
      CHECK ("event_type" IN ('view', 'listing_view', 'player_view', 'impression', 'cta_click', 'share')) NOT VALID;
  END IF;
END $$;

-- ── Indexes (declared in schema/analytics.ts) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_artifact_views_kind_id_event_viewed"
  ON "artifact_views" ("artifact_kind", "artifact_id", "event_type", "viewed_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_artifact_views_event_viewed"
  ON "artifact_views" ("event_type", "viewed_at");
-- A prefix of idx_artifact_views_kind_id_event_viewed.
DROP INDEX IF EXISTS "artifact_views_kind_id_idx";

-- ── job_view_events / company_view_events -> listing_view ─────────────────────
-- viewer_user_id had no FK; artifact_views.viewer_id references users, so a
-- deleted viewer becomes NULL (anonymous).
INSERT INTO "artifact_views" (
  "id", "artifact_kind", "artifact_id", "event_type", "viewer_id",
  "ip_country", "region", "referrer", "source", "user_agent",
  "engagement_unit", "viewed_at"
)
SELECT
  e."id", 'job', e."job_id", 'listing_view', u."id",
  e."country_code", e."region", e."referrer", e."source", e."user_agent",
  '%', e."created_at"
FROM "job_view_events" e
LEFT JOIN "users" u ON u."id" = e."viewer_user_id"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "artifact_views" (
  "id", "artifact_kind", "artifact_id", "event_type", "viewer_id",
  "ip_country", "region", "referrer", "source", "user_agent",
  "engagement_unit", "viewed_at"
)
SELECT
  e."id", 'company', e."company_id", 'listing_view', u."id",
  e."country_code", e."region", e."referrer", e."source", e."user_agent",
  '%', e."created_at"
FROM "company_view_events" e
LEFT JOIN "users" u ON u."id" = e."viewer_user_id"
ON CONFLICT ("id") DO NOTHING;

-- ── video_analytics -> studio playback events ─────────────────────────────────
-- Only the four producer events exist (shared/studio-analytics-events.ts); any
-- other value was never read and stays in the archived table. user_id was
-- text: kept only when it is a live user's uuid.
INSERT INTO "artifact_views" (
  "id", "artifact_kind", "artifact_id", "owner_user_id", "event_type", "viewer_id",
  "referrer", "campaign_id", "metadata", "viewed_at"
)
SELECT
  va."id",
  sp."media_kind",
  va."studio_project_id",
  sp."user_id",
  CASE va."event" WHEN 'view' THEN 'player_view' ELSE va."event" END,
  u."id",
  va."referrer",
  va."campaign_id",
  va."metadata",
  va."created_at"
FROM "video_analytics" va
JOIN "studio_projects" sp ON sp."id" = va."studio_project_id"
-- CASE guards the cast: AND operands have no guaranteed evaluation order.
LEFT JOIN "users" u
  ON u."id" = CASE
    WHEN va."user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN va."user_id"::uuid
  END
WHERE va."event" IN ('view', 'impression', 'cta_click', 'share')
ON CONFLICT ("id") DO NOTHING;

-- ── resume_views / company_views -> top up server-recorded 'view' rows ────────
INSERT INTO "artifact_views" (
  "id", "artifact_kind", "artifact_id", "owner_user_id", "viewer_id",
  "ip_hash", "referrer", "user_agent", "engagement_unit", "viewed_at"
)
SELECT
  rv."id", 'resume', rv."resume_id", ri."user_id", rv."viewer_id",
  rv."ip_hash", rv."referrer", rv."user_agent", '%', rv."viewed_at"
FROM (
  SELECT r.*, row_number() OVER (PARTITION BY r."resume_id" ORDER BY r."viewed_at", r."id") AS rn
  FROM "resume_views" r
) rv
JOIN "resume_information" ri ON ri."id" = rv."resume_id"
LEFT JOIN (
  SELECT "artifact_id", count(*) AS n
  FROM "artifact_views"
  WHERE "artifact_kind" = 'resume' AND "event_type" = 'view' AND "engagement" IS NULL
  GROUP BY "artifact_id"
) m ON m."artifact_id" = rv."resume_id"
WHERE rv.rn > coalesce(m.n, 0)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "artifact_views" (
  "id", "artifact_kind", "artifact_id", "owner_user_id", "viewer_id",
  "ip_hash", "referrer", "user_agent", "engagement_unit", "viewed_at"
)
SELECT
  cv."id", 'company', cv."company_id", cp."owner_id", cv."viewer_id",
  cv."ip_hash", cv."referrer", cv."user_agent", '%', cv."viewed_at"
FROM (
  SELECT c.*, row_number() OVER (PARTITION BY c."company_id" ORDER BY c."viewed_at", c."id") AS rn
  FROM "company_views" c
) cv
JOIN "company_profiles" cp ON cp."id" = cv."company_id"
LEFT JOIN (
  SELECT "artifact_id", count(*) AS n
  FROM "artifact_views"
  WHERE "artifact_kind" = 'company' AND "event_type" = 'view' AND "engagement" IS NULL
  GROUP BY "artifact_id"
) m ON m."artifact_id" = cv."company_id"
WHERE cv.rn > coalesce(m.n, 0)
ON CONFLICT ("id") DO NOTHING;
