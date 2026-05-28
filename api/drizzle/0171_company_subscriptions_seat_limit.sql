-- Gap #1678 — seat soft-cap + owner-confirm prompt. Adds the authorized
-- paid-seat ceiling. An employee invite that would push committed seats
-- (active employees + pending employee invites) past this requires the owner
-- to confirm the extra $9.95/seat, which raises the limit. Idempotent.

ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS seat_limit integer NOT NULL DEFAULT 0;

-- Backfill: existing companies must not be retroactively over-limit. Seed the
-- authorized ceiling to whatever they're already billed for (seat_count) so
-- their current members keep working; new seats beyond that prompt.
UPDATE company_subscriptions
SET seat_limit = seat_count
WHERE seat_limit = 0 AND seat_count > 0;
