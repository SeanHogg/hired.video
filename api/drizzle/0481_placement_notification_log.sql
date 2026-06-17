-- Migration 0481 — placement stage-event idempotency log (TK10, #230).
--
-- The date-based placement stage events (started / first_day /
-- guarantee_expires) are fired by the daily cron sweep. Without a fired-log
-- the /5 cron tick would re-notify subscribers every five minutes once a
-- placement's startDate / guaranteeEndDate is reached. This table records
-- each (placement, event) the sweep has already delivered; UNIQUE
-- (placement_id, event) makes the "have we fired this yet?" check a single
-- insert-on-conflict-do-nothing.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS placement_notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id  UUID NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  event         VARCHAR(48) NOT NULL,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_notification_log
  ON placement_notification_log (placement_id, event);
