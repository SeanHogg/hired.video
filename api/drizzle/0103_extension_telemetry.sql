-- Migration 0103 — Chrome extension telemetry + interactive-picker captures.
--
-- Backs the new /api/extension/sessions ingestion endpoint and the
-- /admin/extension-telemetry SuperAdmin viewer. Two tables:
--
--   extension_sessions  — one row per side-panel session (parent of events)
--   extension_events    — append-only event log, polymorphic via `kind`
--
-- Anonymous (signed-out) sessions are allowed because the picker is most
-- valuable when detection fails on a site we don't yet handle — and that
-- often happens on the LinkedIn signed-out preview layout. We don't want
-- to lose those captures just because the user hasn't logged in.

CREATE TABLE IF NOT EXISTS "extension_sessions" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_session_id"   uuid NOT NULL UNIQUE,
  "user_id"             uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "extension"           varchar(16) NOT NULL,
  "version"             varchar(32),
  "user_agent"          text,
  "ip_address"          varchar(45),
  "event_count"         integer NOT NULL DEFAULT 0,
  "error_count"         integer NOT NULL DEFAULT 0,
  "picker_capture_count" integer NOT NULL DEFAULT 0,
  "started_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "extension_sessions_user_idx"
  ON "extension_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "extension_sessions_updated_idx"
  ON "extension_sessions" ("updated_at");

CREATE TABLE IF NOT EXISTS "extension_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id"  uuid NOT NULL REFERENCES "extension_sessions"("id") ON DELETE CASCADE,
  "kind"        varchar(32) NOT NULL,
  "url"         text,
  "host"        varchar(255),
  "payload"     jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "extension_events_session_idx"
  ON "extension_events" ("session_id");
CREATE INDEX IF NOT EXISTS "extension_events_kind_idx"
  ON "extension_events" ("kind");
CREATE INDEX IF NOT EXISTS "extension_events_host_idx"
  ON "extension_events" ("host");
CREATE INDEX IF NOT EXISTS "extension_events_created_idx"
  ON "extension_events" ("created_at");
