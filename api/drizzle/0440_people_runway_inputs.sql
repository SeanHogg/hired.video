-- Migration 0440 — runway inputs for headcount planning (TK8 block).
--
-- The headcount-plan summary's `runwayImpactDays` used to wait on an
-- external BI feed (a sister product, retired 2026-10-03). hired.video now
-- computes it natively from two segment-level inputs stored next to the
-- TCO assumptions: cash on hand and current monthly burn (minor units).
-- Nullable: runway stays null until the segment enters them.
--
-- Drizzle SSoT: api/src/db/schema/peopleOpsExt.ts (peopleTcoSettings).
-- Formula: shared/people-ops.ts computeRunwayImpactDays.

ALTER TABLE "people_tco_settings"
  ADD COLUMN IF NOT EXISTS "cash_on_hand_cents" bigint;
ALTER TABLE "people_tco_settings"
  ADD COLUMN IF NOT EXISTS "monthly_burn_cents" bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_tco_settings_runway_nonneg_check') THEN
    ALTER TABLE "people_tco_settings"
      ADD CONSTRAINT "people_tco_settings_runway_nonneg_check"
      CHECK (("cash_on_hand_cents" IS NULL OR "cash_on_hand_cents" >= 0)
         AND ("monthly_burn_cents" IS NULL OR "monthly_burn_cents" >= 0)) NOT VALID;
  END IF;
END $$;
