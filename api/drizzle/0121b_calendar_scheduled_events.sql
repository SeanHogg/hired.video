-- Migration 0121b — create the `calendar_connections`, `scheduled_events`,
-- `availability_slots` base tables that schema/calendar.ts declares.
--
-- Why this exists
-- ---------------
-- The calendar tables never had a CREATE TABLE migration; the original
-- rollout relied on `drizzle-kit push` to materialise them. That push
-- step has been silently failing to land these tables (probably blocked
-- by an unrelated push error earlier in the schema list — see Gap
-- Register), so when migration 0122_events_coffee_shared_tasks.sql tries
-- to ALTER `scheduled_events`, every statement aborts with `relation
-- "scheduled_events" does not exist` and the 0122 file never gets
-- recorded as applied. Adding the missing CREATE statements here — one
-- file dedicated to making the table inventory match the schema — turns
-- 0122's idempotent ALTERs into successful no-ops on its next replay.
--
-- This file sorts BEFORE every `0122_*.sql` because file order in the
-- runner is plain `Array.sort()` on filenames and `0121b_` < `0122_`.
--
-- Column shape is the union of the legacy calendar fields and the public
-- event fields that migration 0122 adds. Doing both here keeps the
-- migration self-contained on fresh databases — 0122 still re-runs and
-- its `ADD COLUMN IF NOT EXISTS` statements no-op against the already-
-- present columns.

-- ─── calendar_connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "calendar_connections" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider"            varchar(50) NOT NULL,
  "provider_account_id" text,
  "access_token"        text,
  "calendar_id"         text,
  "calendar_name"       varchar(255),
  "sync_enabled"        boolean NOT NULL DEFAULT true,
  "last_synced_at"      timestamptz,
  -- oauthConnectionColumns (shared OAuth lifecycle shape).
  "refresh_token"       text,
  "token_expires_at"    timestamptz,
  "scopes"              text,
  "is_active"           boolean NOT NULL DEFAULT true,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

-- ─── scheduled_events ─────────────────────────────────────────────────
-- Discriminated by `type` — see migration 0122 header for the contract
-- between legacy private items ('interview' | 'meeting' | …) and the
-- new public-event flow ('event' | 'coffee').
CREATE TABLE IF NOT EXISTS "scheduled_events" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "calendar_connection_id"   uuid REFERENCES "calendar_connections"("id") ON DELETE SET NULL,
  "external_event_id"        text,
  "title"                    varchar(500) NOT NULL,
  "description"              text,
  "start_at"                 timestamptz NOT NULL,
  "end_at"                   timestamptz NOT NULL,
  "timezone"                 varchar(100) DEFAULT 'UTC',
  "location"                 text,
  "meeting_url"              text,
  "type"                     varchar(50) NOT NULL DEFAULT 'interview',
  "related_entity_type"      varchar(50),
  "related_entity_id"        uuid,
  "attendees"                jsonb DEFAULT '[]'::jsonb,
  "status"                   varchar(50) NOT NULL DEFAULT 'confirmed',
  "reminder_minutes"         jsonb DEFAULT '[30, 1440]'::jsonb,
  "synced_to_calendar"       boolean NOT NULL DEFAULT false,
  -- Public-event columns (mirror migration 0122 / gap #1236). 0122's
  -- ADD COLUMN IF NOT EXISTS statements will no-op on these.
  "visibility"               varchar(16) NOT NULL DEFAULT 'private',
  "host_user_id"             uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "cover_image_url"          text,
  "capacity"                 integer,
  "category"                 varchar(48),
  "allows_plus_ones"         boolean NOT NULL DEFAULT false,
  "requires_approval"        boolean NOT NULL DEFAULT false,
  "event_format"             varchar(16) NOT NULL DEFAULT 'in_person',
  "video_provider"           varchar(16),
  "series_id"                uuid,
  "slug"                     varchar(80),
  "published_at"             timestamptz,
  "cancelled_at"             timestamptz,
  "attendee_count"           integer NOT NULL DEFAULT 0,
  "waitlist_count"           integer NOT NULL DEFAULT 0,
  "registration_questions"   jsonb,
  "matchmaking_enabled"      boolean NOT NULL DEFAULT true,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

-- ─── availability_slots ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "availability_slots" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day_of_week"  varchar(10) NOT NULL,
  "start_time"   varchar(8) NOT NULL,
  "end_time"     varchar(8) NOT NULL,
  "timezone"     varchar(100) DEFAULT 'UTC',
  "is_active"    boolean NOT NULL DEFAULT true,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
