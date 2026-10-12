-- Migration: mark service offerings owned by hired.video itself.
--
-- A "platform service" is one of the canonical offerings hired.video lists
-- in the marketplace as a recruiting funnel. Viewers who click these on
-- /search get an "Enroll in Creator Program" CTA (instead of the standard
-- "Request quote" lead-gen flow used for user-listed services).
--
-- The flag is admin-managed; default false.

ALTER TABLE service_offerings
  ADD COLUMN IF NOT EXISTS is_platform_service BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_service_offerings_platform
  ON service_offerings (is_platform_service)
  WHERE is_platform_service = TRUE;
