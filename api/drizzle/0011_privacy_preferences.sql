-- Migration: 0011_privacy_preferences
-- Adds the privacy_preferences table so the Settings → Privacy panel
-- (showEmail / showPhone / showLocation, plus the visibility/messaging
-- toggles) actually persists per user. Previously the GET/PUT /privacy
-- routes returned defaults and discarded writes, so the public-profile
-- contact gating had no source of truth.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "privacy_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_visible_to_public" boolean NOT NULL DEFAULT true,
  "profile_visible_to_recruiters" boolean NOT NULL DEFAULT true,
  "allow_search_engine_indexing" boolean NOT NULL DEFAULT true,
  "show_activity_status" boolean NOT NULL DEFAULT true,
  "show_connections_list" boolean NOT NULL DEFAULT true,
  "allow_direct_messages" boolean NOT NULL DEFAULT true,
  "allow_connection_requests" boolean NOT NULL DEFAULT true,
  "show_email" boolean NOT NULL DEFAULT false,
  "show_phone" boolean NOT NULL DEFAULT false,
  "show_location" boolean NOT NULL DEFAULT false,
  "allow_messaging" boolean NOT NULL DEFAULT true,
  "share_analytics_data" boolean NOT NULL DEFAULT true,
  "share_usage_data" boolean NOT NULL DEFAULT true,
  "allow_data_export" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
