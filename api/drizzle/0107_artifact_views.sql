-- Migration 0107 — Polymorphic artifact_views for unified creator stats.
--
-- Backs the creator-stats parity work (Gap Register #1019). Today each
-- artifact has its own view-tracking table with a slightly different shape:
--
--   studio_video_heatmap  — per-second engagement, ip_country, viewer_email
--   resume_views          — basic (viewer_id, ip_hash, referrer, user_agent)
--   profile_views         — basic, with RAW ip_address (legacy)
--   company_views         — basic
--
-- Articles, jobs, studio templates, and services have NO view-event table.
-- A unified creator dashboard that rolls views up across "all your stuff"
-- can't sit on top of that shape — one polymorphic table lets a single
-- GROUP BY produce per-kind + per-artifact aggregates in one query.
--
-- This migration:
--   1) Adds artifact_views with engagement (jsonb), ip_country, etc.
--   2) Backfills every existing per-entity table into it.
--   3) Leaves the old tables intact for one bake window — readers stay on
--      them, writes dual-route (handlers updated in this PR). The follow-up
--      gap drops the legacy tables once all readers are confirmed migrated.

CREATE TABLE IF NOT EXISTS "artifact_views" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic discriminator. Keep in sync with ArtifactKind in
  -- shared/artifact-views.ts so the frontend + backend agree on the
  -- enum surface.
  "artifact_kind"        varchar(32) NOT NULL,
  "artifact_id"          uuid NOT NULL,

  -- Owner of the artifact at view time, denormalized so the creator
  -- rollup endpoint can `WHERE owner_user_id = $me` without joining
  -- back to every entity table per kind.
  "owner_user_id"        uuid REFERENCES "users"("id") ON DELETE SET NULL,

  -- Viewer. NULL = anonymous. Some legacy rows stored a text viewer_id
  -- (video heatmap) for non-uuid sources — those are dropped during
  -- backfill rather than coerced, since the rollup only cares about
  -- "did some viewer see this" and anonymous-bucketing is the right
  -- fallback.
  "viewer_id"            uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "viewer_email"         text,
  "viewer_company"       text,

  -- Anonymity-preserving IP hash (sha256 + daily salt). Never the raw IP.
  "ip_hash"              varchar(64),
  -- ISO-3166 alpha-2. "ZZ" = unknown. Derived server-side from the
  -- Cloudflare CF-IPCountry header at insert time (no client geolocation).
  "ip_country"           varchar(2),

  "referrer"             text,
  "user_agent"           text,

  -- Engagement bucket array. Length + interpretation depends on unit:
  --   's' (video, audio): one entry per second, value = watched? (0/1)
  --   '%' (resume, article, profile, job, …): 100 buckets, value =
  --       scroll-depth reached count (1 if the viewer scrolled past that
  --       % of the page).
  "engagement"           jsonb,
  "engagement_unit"      varchar(4) NOT NULL DEFAULT 's',
  "total_engagement_sec" integer NOT NULL DEFAULT 0,
  -- 0..1 for video % watched, 0..1 for static % scrolled.
  "percent_consumed"     real NOT NULL DEFAULT 0,
  -- Index into engagement[] where the viewer dropped off.
  "drop_off_bucket"      integer,

  "viewed_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "artifact_views_kind_id_idx"
  ON "artifact_views" ("artifact_kind", "artifact_id");
CREATE INDEX IF NOT EXISTS "artifact_views_owner_idx"
  ON "artifact_views" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "artifact_views_viewer_idx"
  ON "artifact_views" ("viewer_id");
CREATE INDEX IF NOT EXISTS "artifact_views_viewed_at_idx"
  ON "artifact_views" ("viewed_at");
CREATE INDEX IF NOT EXISTS "artifact_views_kind_viewed_idx"
  ON "artifact_views" ("artifact_kind", "viewed_at");

-- Backfill — resume_views ─────────────────────────────────────────────
-- Joins back to resume_information to recover the owner for the rollup
-- denormalization. ON CONFLICT not needed (fresh table, no PK collisions).
INSERT INTO "artifact_views" (
  "artifact_kind", "artifact_id", "owner_user_id",
  "viewer_id", "ip_hash", "referrer", "user_agent",
  "engagement_unit", "viewed_at"
)
SELECT
  'resume',
  rv."resume_id",
  ri."user_id",
  rv."viewer_id",
  rv."ip_hash",
  rv."referrer",
  rv."user_agent",
  '%',
  rv."viewed_at"
FROM "resume_views" rv
LEFT JOIN "resume_information" ri ON ri."id" = rv."resume_id";

-- Backfill — profile_views ────────────────────────────────────────────
-- Legacy table stored RAW ip_address in varchar(45); convert to NULL on
-- backfill (raw IP can't be reconstructed into a hash without the daily
-- salt that was current at view time). The migration accepts the
-- lossiness — historical geographic data is preserved in ip_country=NULL
-- which the analytics endpoints render as "ZZ" anyway.
INSERT INTO "artifact_views" (
  "artifact_kind", "artifact_id", "owner_user_id",
  "viewer_id", "referrer", "user_agent",
  "engagement_unit", "viewed_at"
)
SELECT
  'profile',
  pv."viewed_user_id",
  pv."viewed_user_id",
  pv."viewer_user_id",
  pv."referrer",
  pv."user_agent",
  '%',
  pv."created_at"
FROM "profile_views" pv;

-- Backfill — company_views ────────────────────────────────────────────
INSERT INTO "artifact_views" (
  "artifact_kind", "artifact_id", "owner_user_id",
  "viewer_id", "ip_hash", "referrer", "user_agent",
  "engagement_unit", "viewed_at"
)
SELECT
  'company',
  cv."company_id",
  cp."owner_user_id",
  cv."viewer_id",
  cv."ip_hash",
  cv."referrer",
  cv."user_agent",
  '%',
  cv."viewed_at"
FROM "company_views" cv
LEFT JOIN "company_profiles" cp ON cp."id" = cv."company_id";

-- Backfill — studio_video_heatmap ─────────────────────────────────────
-- Video is the richest shape: per-second engagement array, drop_off,
-- viewer_email, viewer_company, ip_country. Coerce viewer_id (text in
-- legacy table) to uuid where possible, NULL otherwise — see header.
INSERT INTO "artifact_views" (
  "artifact_kind", "artifact_id", "owner_user_id",
  "viewer_id", "viewer_email", "viewer_company",
  "ip_country", "referrer", "user_agent",
  "engagement", "engagement_unit",
  "total_engagement_sec", "percent_consumed", "drop_off_bucket",
  "viewed_at"
)
SELECT
  'video',
  svh."studio_project_id",
  sp."user_id",
  CASE
    WHEN svh."viewer_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN svh."viewer_id"::uuid
    ELSE NULL
  END,
  svh."viewer_email",
  svh."viewer_company",
  svh."ip_country",
  svh."referrer",
  svh."user_agent",
  svh."seconds_watched",
  's',
  svh."total_watch_time_sec",
  COALESCE(svh."percent_watched", 0) / 100.0,
  svh."drop_off_second",
  svh."created_at"
FROM "studio_video_heatmap" svh
LEFT JOIN "studio_projects" sp ON sp."id" = svh."studio_project_id";
