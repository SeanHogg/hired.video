-- Migration 0112 — Sector taxonomy across articles, jobs, resume templates,
-- and affiliate specialization.
--
-- Context: hired.video is expanding into AI-resilient verticals (healthcare,
-- legal, government, law enforcement, security, skilled trades, beauty,
-- gig work, politics + campaigns, civic/run-for-office). Today none of the
-- recruitable entities — articles, job_items, resume_templates,
-- affiliate_profiles — carry an industry/sector dimension. Search filters,
-- sector landing pages, the pivot explorer, and affiliate vertical
-- specialization all need ONE shared dimension to key off.
--
-- The single source of truth for the enum + metadata lives in
-- `shared/sectors.ts`. This migration deliberately stores the slug as
-- `varchar` (NOT a CHECK constraint) because:
--   1) Sectors are a CONTENT dimension, not a storage discriminator.
--      Marketing will add verticals (real-estate, education, hospitality,
--      etc.) faster than DB migrations should land.
--   2) The earlier `studio_projects.media_kind` CHECK constraint caused a
--      production drift bug (#963) because the constraint hardcoded the
--      slug list at migration time. We're not repeating that pattern.
--
-- All sector columns are nullable. Existing rows stay untagged until
-- backfilled or re-saved through the new picker.
--
-- Articles: `audience` is the orthogonal authoring vocabulary
-- ('job_seeker' | 'recruiter' | 'pivot' | 'resume_guide' | 'civic'). We
-- keep it as a separate column rather than overloading `category` so the
-- existing free-text `category` field can stay user-defined.

-- ─── Articles ──────────────────────────────────────────────────────────
ALTER TABLE "articles"
  ADD COLUMN IF NOT EXISTS "sector" varchar(64),
  ADD COLUMN IF NOT EXISTS "audience" varchar(32);

CREATE INDEX IF NOT EXISTS "idx_articles_sector_status_published"
  ON "articles" ("sector", "status", "published_at" DESC NULLS LAST)
  WHERE "sector" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_articles_audience_sector"
  ON "articles" ("audience", "sector")
  WHERE "audience" IS NOT NULL;

-- ─── Job items ─────────────────────────────────────────────────────────
ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "sector" varchar(64);

CREATE INDEX IF NOT EXISTS "idx_job_items_sector_active"
  ON "job_items" ("sector", "is_active", "created_at" DESC)
  WHERE "sector" IS NOT NULL;

-- ─── Resume templates ──────────────────────────────────────────────────
-- One template can serve multiple sectors (e.g. the "credentialed
-- professional" template fits healthcare + legal + law enforcement),
-- so we use a jsonb array of sector slugs rather than a single column.
-- `recommendedFor` mirrors the pattern used by job_preferences.industries.
ALTER TABLE "resume_templates"
  ADD COLUMN IF NOT EXISTS "sectors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "is_pivot_template" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_resume_templates_pivot"
  ON "resume_templates" ("is_pivot_template")
  WHERE "is_pivot_template" = true;

-- ─── Affiliate profiles ────────────────────────────────────────────────
-- Affiliates can specialize in 1..N sectors. Vertical-specialist
-- conversion bonuses (tracked in the affiliateTiers `bonusPercentage`
-- field) apply when `affiliate_referrals.landing_sector` matches one of
-- the affiliate's `specialty_sectors`.
ALTER TABLE "affiliate_profiles"
  ADD COLUMN IF NOT EXISTS "specialty_sectors" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Track which sector landing page / article a referral arrived through
-- so vertical conversion analytics + specialist bonuses can be computed.
ALTER TABLE "affiliate_referrals"
  ADD COLUMN IF NOT EXISTS "landing_sector" varchar(64);

CREATE INDEX IF NOT EXISTS "idx_affiliate_referrals_sector"
  ON "affiliate_referrals" ("landing_sector", "created_at" DESC)
  WHERE "landing_sector" IS NOT NULL;

-- Track sector on every click for the click-attribution funnel; lets us
-- compute "healthcare landing page CTR" per affiliate.
--
-- Guarded with a table-exists check because the `affiliate_link_clicks`
-- table was missing from `api/drizzle/` for the lifetime of the schema
-- (fixed in 0114). Without the guard, fresh DBs (and any deploy where
-- the runner re-runs every statement) hit "relation does not exist"
-- here. Production has the column applied to the legacy-pushed table,
-- so this DO block is a no-op there; on a fresh DB it skips quietly
-- and 0114 creates the table with the `landing_sector` column already
-- baked in. See gap #1186 in README for the full root cause.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'affiliate_link_clicks'
  ) THEN
    ALTER TABLE "affiliate_link_clicks"
      ADD COLUMN IF NOT EXISTS "landing_sector" varchar(64);

    CREATE INDEX IF NOT EXISTS "idx_affiliate_link_clicks_sector"
      ON "affiliate_link_clicks" ("landing_sector", "clicked_at" DESC)
      WHERE "landing_sector" IS NOT NULL;
  END IF;
END $migration$;
