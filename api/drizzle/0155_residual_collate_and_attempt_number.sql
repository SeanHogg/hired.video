-- #1607 + #1611 residuals.
--
--   1. event_attendees.lower(guest_email) — `lower()` in Postgres is
--      locale-sensitive for non-ASCII (e.g. Turkish dotless ı). Email
--      local parts CAN contain non-ASCII per RFC 6532, so the case-fold
--      should be locale-stable. Re-create the partial unique with the
--      `COLLATE "C"` (byte-wise) hint inside the lower() call.
--   2. assessment_attempts — pick multi-attempt-with-attempt_number as
--      the canonical shape and add the uniqueness gate. (Was blocked
--      on a product call per #1611; assessments aren't in the active
--      feature list, so picking the more flexible shape now is safe.)

-- ---------------------------------------------------------------------------
-- event_attendees — drop + recreate the partial unique with COLLATE "C".
-- The DROP-and-recreate is the only way to change the index expression.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS uq_event_attendees_event_guest_email;

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendees_event_guest_email
  ON event_attendees (event_id, (lower(guest_email COLLATE "C")))
  WHERE guest_email IS NOT NULL AND user_id IS NULL;

-- ---------------------------------------------------------------------------
-- assessment_attempts — add attempt_number + unique constraint.
-- Default attempt_number = 1 backfills cleanly; future retries pick the
-- next int. (user_id, assessment_id, attempt_number) is unique so an
-- accidental double-submit of the same attempt fails fast.
-- ---------------------------------------------------------------------------

ALTER TABLE assessment_attempts
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_attempts_user_assessment_attempt
  ON assessment_attempts (user_id, assessment_id, attempt_number);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_attempts_attempt_number_positive') THEN
    ALTER TABLE assessment_attempts
      ADD CONSTRAINT assessment_attempts_attempt_number_positive
      CHECK (attempt_number >= 1) NOT VALID;
  END IF;
END $$;
