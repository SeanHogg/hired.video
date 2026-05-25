-- Migration 0122 — Public events + Coffee meetups + Shared/accountability tasks
-- + AI attendee-matchmaking cache + Open-to-Coffee profile section.
--
-- Bundle: every entry below is one cohesive social-graph initiative landing
-- as a single ROI pass against the Consolidated Gap Register
-- (#1236 events, #1237 coffee, #1238 shared tasks, #1239 attendee matchmaking,
--  #1240 openToCoffee section, #1241 event categories taxonomy, #1242 tasks
--  source_event_id link). Each block is annotated with its gap id so future
--  maintainers can bisect a single feature without untangling the others.
--
-- Design notes (read me before mutating):
--   1. We EXTEND scheduled_events rather than introducing a new `events`
--      aggregate. The discriminator column is the existing `type` (varchar):
--        - 'interview' | 'meeting' | 'review' | 'other' → private calendar
--          items as today (kept on the JSONB `attendees` field; the
--          interview booking flow is untouched).
--        - 'event'  → public/unlisted/private discoverable events.
--        - 'coffee' → accepted 1:1 coffee meetup created when a
--          coffee_requests row is accepted.
--      Only rows with type IN ('event','coffee') participate in the new
--      relational `event_attendees` table. This avoids backfilling all
--      legacy interview attendees while still giving discoverable events
--      a real relational model with capacity / waitlist / check-in.
--   2. `attendee_count` and `waitlist_count` are denormalised on the
--      parent row so feed/card render paths don't need a sub-query per
--      tile. Services update them atomically inside the same
--      transaction as event_attendees / event_waitlist mutations.
--   3. `host_user_id` is distinct from `user_id` (the row creator). The
--      creator may delegate hosting to a different account (e.g. a
--      company workspace, a co-founder). When NULL, host == creator.
--   4. The Stripe / paid-ticketing surface is intentionally absent. See
--      gap #1243 (paid ticketing v2). v1 ships free events only.

-- ─── A. #1236 — scheduled_events: new columns for public events ───────
ALTER TABLE "scheduled_events"
  ADD COLUMN IF NOT EXISTS "visibility"        varchar(16) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS "host_user_id"      uuid REFERENCES "users"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "cover_image_url"   text,
  ADD COLUMN IF NOT EXISTS "capacity"          integer,
  ADD COLUMN IF NOT EXISTS "category"          varchar(48),
  ADD COLUMN IF NOT EXISTS "allows_plus_ones"  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requires_approval" boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "event_format"      varchar(16) NOT NULL DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS "video_provider"    varchar(16),
  ADD COLUMN IF NOT EXISTS "series_id"         uuid,
  ADD COLUMN IF NOT EXISTS "slug"              varchar(80),
  ADD COLUMN IF NOT EXISTS "published_at"      timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelled_at"      timestamptz,
  ADD COLUMN IF NOT EXISTS "attendee_count"    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "waitlist_count"    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "registration_questions" jsonb,
  ADD COLUMN IF NOT EXISTS "matchmaking_enabled" boolean   NOT NULL DEFAULT true;

-- Discovery: public events list + map. Partial index on (type, visibility,
-- start_at) where the row is not cancelled keeps the index hot on the
-- only rows discovery cares about.
CREATE INDEX IF NOT EXISTS "idx_scheduled_events_public_discovery"
  ON "scheduled_events" ("type", "visibility", "start_at")
  WHERE "type" IN ('event', 'coffee')
    AND "visibility" = 'public'
    AND "cancelled_at" IS NULL;

-- Host's events list (dashboard + host tools).
CREATE INDEX IF NOT EXISTS "idx_scheduled_events_host_user_id"
  ON "scheduled_events" ("host_user_id", "start_at")
  WHERE "host_user_id" IS NOT NULL;

-- Recurring series rollup.
CREATE INDEX IF NOT EXISTS "idx_scheduled_events_series_id"
  ON "scheduled_events" ("series_id", "start_at")
  WHERE "series_id" IS NOT NULL;

-- Public shareable URL slug (case-insensitive uniqueness).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_events_slug"
  ON "scheduled_events" (lower("slug"))
  WHERE "slug" IS NOT NULL;

-- ─── B. #1236 — event_attendees (relational RSVP, type IN ('event','coffee'))
-- Replaces JSONB attendees for public events. Interviews/meetings keep
-- the legacy JSONB column — see migration header.
CREATE TABLE IF NOT EXISTS "event_attendees" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"        uuid NOT NULL REFERENCES "scheduled_events"("id") ON DELETE CASCADE,
  "user_id"         uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "guest_email"     varchar(255),
  "guest_name"      varchar(255),
  -- 'going' | 'maybe' | 'declined' | 'waitlist' | 'cancelled'
  "rsvp_status"     varchar(16) NOT NULL DEFAULT 'going',
  -- 'approved' | 'pending' | 'rejected' — gates whether RSVP counts.
  "approval_status" varchar(16) NOT NULL DEFAULT 'approved',
  "plus_one_count"  integer     NOT NULL DEFAULT 0,
  -- Answers to the host's `registration_questions` JSON schema.
  "custom_answers"  jsonb,
  "rsvped_at"       timestamptz NOT NULL DEFAULT now(),
  "checked_in_at"   timestamptz,
  "cancelled_at"    timestamptz,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

-- One RSVP per registered user per event.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_attendees_event_user"
  ON "event_attendees" ("event_id", "user_id")
  WHERE "user_id" IS NOT NULL;

-- Same uniqueness for guest invitees (no account).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_attendees_event_guest_email"
  ON "event_attendees" ("event_id", lower("guest_email"))
  WHERE "guest_email" IS NOT NULL AND "user_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_event_attendees_event_status"
  ON "event_attendees" ("event_id", "rsvp_status");

CREATE INDEX IF NOT EXISTS "idx_event_attendees_user_id"
  ON "event_attendees" ("user_id", "rsvped_at" DESC)
  WHERE "user_id" IS NOT NULL;

-- ─── C. #1236 — event_co_hosts (delegated host permissions) ───────────
CREATE TABLE IF NOT EXISTS "event_co_hosts" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"    uuid NOT NULL REFERENCES "scheduled_events"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "added_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  -- {manageAttendees, editEvent, sendMessages, checkIn, viewAnalytics}
  "permissions" jsonb NOT NULL DEFAULT '{"manageAttendees":true,"editEvent":true,"sendMessages":true,"checkIn":true,"viewAnalytics":true}'::jsonb,
  "accepted_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_co_hosts_event_user"
  ON "event_co_hosts" ("event_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_event_co_hosts_user_id"
  ON "event_co_hosts" ("user_id");

-- ─── D. #1236 — event_waitlist (auto-promote on capacity free) ────────
CREATE TABLE IF NOT EXISTS "event_waitlist" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"    uuid NOT NULL REFERENCES "scheduled_events"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "position"    integer NOT NULL,
  "promoted_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_waitlist_event_user"
  ON "event_waitlist" ("event_id", "user_id");
-- Auto-promote query: ORDER BY position WHERE promoted_at IS NULL.
CREATE INDEX IF NOT EXISTS "idx_event_waitlist_event_position"
  ON "event_waitlist" ("event_id", "position")
  WHERE "promoted_at" IS NULL;

-- ─── E. #1236 — event_reminders_sent (idempotent reminder dispatch log)
-- One row per (event, user, reminder_key) where reminder_key encodes
-- the offset ('1w' | '24h' | '1h' | 'start'). Reminder worker checks
-- existence here before sending so a re-run doesn't double-notify.
CREATE TABLE IF NOT EXISTS "event_reminders_sent" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"     uuid NOT NULL REFERENCES "scheduled_events"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reminder_key" varchar(16) NOT NULL,
  "sent_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_reminders_sent_event_user_key"
  ON "event_reminders_sent" ("event_id", "user_id", "reminder_key");

-- ─── F. #1239 — event_matchmaking (AI attendee-pair score cache) ──────
-- Default-on for every event with matchmaking_enabled=true. Scores are
-- regenerated nightly + on RSVP delta. Per-viewer rows so each attendee
-- gets a personalised ranked list of who to meet.
CREATE TABLE IF NOT EXISTS "event_matchmaking" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"       uuid NOT NULL REFERENCES "scheduled_events"("id") ON DELETE CASCADE,
  "viewer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "match_user_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 0..100 — higher is a stronger suggested intro.
  "score"          integer NOT NULL,
  "reason"         text,
  "generated_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_matchmaking_event_viewer_match"
  ON "event_matchmaking" ("event_id", "viewer_user_id", "match_user_id");
CREATE INDEX IF NOT EXISTS "idx_event_matchmaking_event_viewer_score"
  ON "event_matchmaking" ("event_id", "viewer_user_id", "score" DESC);

-- ─── G. #1238 — shared_task_participants (accountability) ─────────────
-- Tasks gain optional N-user participation. Coffee acceptance creates
-- one task with the requester as owner (existing tasks.user_id) and the
-- recipient as a participant. Either can mark the task complete.
CREATE TABLE IF NOT EXISTS "shared_task_participants" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id"      uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'participant' | 'viewer' — participant can mark complete; viewer cannot.
  "role"         varchar(16) NOT NULL DEFAULT 'participant',
  "added_by"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_at"  timestamptz,
  "completed_at" timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_shared_task_participants_task_user"
  ON "shared_task_participants" ("task_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_shared_task_participants_user_id"
  ON "shared_task_participants" ("user_id");

-- ─── H. #1242 — tasks.source_event_id (event ↔ task linkage) ──────────
-- When an event/coffee is created or accepted, the resulting task carries
-- a back-reference so the Tasks/Events tabs can render the same item in
-- both contexts and cascade cancellation cleanly.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "source_event_id" uuid
    REFERENCES "scheduled_events"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_tasks_source_event_id"
  ON "tasks" ("source_event_id")
  WHERE "source_event_id" IS NOT NULL;

-- ─── I. #1237 — coffee_requests (proposal/accept BEFORE the event row) ─
-- A coffee_request is the lightweight ask. On accept, the service writes:
--   (a) one scheduled_events row with type='coffee'
--   (b) two event_attendees rows (requester + recipient, status='going')
--   (c) one tasks row owned by requester, with source_event_id pointing
--       at (a), plus one shared_task_participants row for the recipient
--   (d) accepted_event_id back on the coffee_request
-- All in one transaction. The shared task is the accountability hook —
-- it appears on both users' Tasks tab until the meetup happens.
CREATE TABLE IF NOT EXISTS "coffee_requests" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requester_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message"           text,
  "proposed_at"       timestamptz,
  "proposed_location" text,
  -- 'in_person' | 'remote'
  "proposed_format"   varchar(16) NOT NULL DEFAULT 'in_person',
  -- 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
  "status"            varchar(16) NOT NULL DEFAULT 'pending',
  "responded_at"      timestamptz,
  "response_message"  text,
  "accepted_event_id" uuid REFERENCES "scheduled_events"("id") ON DELETE SET NULL,
  -- For surfacing on the recipient's profile-section visibility:
  "expires_at"        timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_coffee_requests_recipient_status"
  ON "coffee_requests" ("recipient_user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_coffee_requests_requester_status"
  ON "coffee_requests" ("requester_user_id", "status", "created_at" DESC);
-- Only one open request between the same pair at a time (in this direction).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_coffee_requests_pending_pair"
  ON "coffee_requests" ("requester_user_id", "recipient_user_id")
  WHERE "status" = 'pending';

-- ─── J. #1241 — event_categories (built-in taxonomy + workspace custom)
-- Mirrors workspace_tags pattern (#231): workspace_id NULL → built-in
-- vocabulary visible to every workspace; rows with a workspace_id are
-- per-workspace custom additions. We seed the v1 vocabulary inline.
CREATE TABLE IF NOT EXISTS "event_categories" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid,
  "slug"         varchar(48) NOT NULL,
  "label"        varchar(96) NOT NULL,
  "icon"         varchar(48),
  "color_hex"    varchar(7) NOT NULL DEFAULT '#2563eb',
  "order_index"  integer NOT NULL DEFAULT 0,
  "is_built_in"  boolean NOT NULL DEFAULT false,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_categories_workspace_slug"
  ON "event_categories" ("workspace_id", lower("slug"));

INSERT INTO "event_categories" ("slug", "label", "icon", "color_hex", "order_index", "is_built_in") VALUES
  ('networking',    'Networking',           'users',         '#2563eb',  1, true),
  ('coffee',        'Coffee Chat',          'coffee',        '#a16207',  2, true),
  ('workshop',      'Workshop',             'tool',          '#7c3aed',  3, true),
  ('talk',          'Talk / Presentation',  'mic',           '#0ea5e9',  4, true),
  ('panel',         'Panel Discussion',     'users-round',   '#6366f1',  5, true),
  ('career-fair',   'Career Fair',          'briefcase',     '#10b981',  6, true),
  ('hackathon',     'Hackathon',            'code',          '#db2777',  7, true),
  ('meetup',        'Meetup',               'map-pin',       '#f97316',  8, true),
  ('demo-day',      'Demo Day',             'sparkles',      '#eab308',  9, true),
  ('mixer',         'Mixer / Social',       'party-popper',  '#f472b6', 10, true),
  ('webinar',       'Webinar',              'video',         '#14b8a6', 11, true),
  ('conference',    'Conference',           'building',      '#475569', 12, true),
  ('study-group',   'Study Group',          'book-open',     '#9333ea', 13, true),
  ('volunteer',     'Volunteer / Community', 'heart',        '#dc2626', 14, true)
ON CONFLICT DO NOTHING;
