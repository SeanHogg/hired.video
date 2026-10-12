-- Migration: 0022_resume_sentiment_and_views
--
-- Two additions that let us retire the legacy API shim's fake placeholder
-- fields (sentimentScore: 0, views: 0) with real persisted data:
--
-- 1. resume_information.sentiment_score — latest score written by the
--    sentiment analysis tool when run against the resume. Null until the
--    tool has been run.
--
-- 2. resume_views — per-view event log. Each row is one view by an
--    authenticated user (viewer_id) or anonymous visitor (viewer_id NULL,
--    ip_hash for dedup). The aggregate count surfaced on the resume row
--    is derived from this table, not a denormalised counter, so analytics
--    like "views per day" or "per-viewer attribution" stay available.
--
-- Also enforces the one-watch-per-viewer invariant via a unique index on
-- watched_resumes(viewer_id, resume_id); duplicate POST /watch/:id calls
-- are now idempotent at the DB level instead of relying on an app-side
-- existence check.

ALTER TABLE "resume_information"
  ADD COLUMN IF NOT EXISTS "sentiment_score" integer;

CREATE TABLE IF NOT EXISTS "resume_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" uuid NOT NULL REFERENCES "resume_information"("id") ON DELETE CASCADE,
  "viewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_hash" varchar(64),
  "referrer" text,
  "user_agent" text,
  "viewed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "resume_views_resume_id_idx"
  ON "resume_views" ("resume_id");

CREATE INDEX IF NOT EXISTS "resume_views_viewed_at_idx"
  ON "resume_views" ("viewed_at");

CREATE UNIQUE INDEX IF NOT EXISTS "watched_resumes_viewer_resume_unique"
  ON "watched_resumes" ("viewer_id", "resume_id");
