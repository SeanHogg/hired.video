-- Migration: 0015_advertising_tables
-- Backfills the tables declared in src/db/schema/advertising.ts that never
-- received a migration. Only `company_boosts` was migrated previously (0007);
-- `job_boosts` and the campaign/ad-set/ad/enrichment/career-resilience
-- tables were defined in schema but missing in the database, producing
-- `relation "job_boosts" does not exist` at runtime.
-- Idempotent: safe to re-run.

-- ── job_boosts (gap #106) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "job_boosts" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"                   text NOT NULL,
  "user_id"                  text NOT NULL,
  "placement_type"           text NOT NULL,
  "pricing_model"            text NOT NULL,
  "budget_cents"             integer NOT NULL,
  "spent_cents"              integer NOT NULL DEFAULT 0,
  "rate_unit_cents"          integer NOT NULL DEFAULT 500,
  "status"                   text NOT NULL DEFAULT 'active',
  "impressions"              integer NOT NULL DEFAULT 0,
  "clicks"                   integer NOT NULL DEFAULT 0,
  "applications"             integer NOT NULL DEFAULT 0,
  "stripe_payment_intent_id" text,
  "starts_at"                timestamptz NOT NULL DEFAULT now(),
  "ends_at"                  timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_job_boosts_job"    ON "job_boosts"("job_id");
CREATE INDEX IF NOT EXISTS "idx_job_boosts_user"   ON "job_boosts"("user_id");
CREATE INDEX IF NOT EXISTS "idx_job_boosts_status" ON "job_boosts"("status");

-- ── ad_campaigns (gap #108) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ad_campaigns" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      text NOT NULL,
  "name"         text NOT NULL,
  "objective"    text NOT NULL DEFAULT 'TRAFFIC',
  "status"       text NOT NULL DEFAULT 'draft',
  "budget_cents" integer,
  "spent_cents"  integer NOT NULL DEFAULT 0,
  "start_at"     timestamptz,
  "end_at"       timestamptz,
  "notes"        text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_ad_campaigns_user"   ON "ad_campaigns"("user_id");
CREATE INDEX IF NOT EXISTS "idx_ad_campaigns_status" ON "ad_campaigns"("status");

-- ── ad_sets (gap #108/#109) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ad_sets" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id"         text NOT NULL,
  "user_id"             text NOT NULL,
  "name"                text NOT NULL,
  "placement_type"      text NOT NULL DEFAULT 'search_top',
  "pricing_model"       text NOT NULL DEFAULT 'cpc',
  "bid_strategy"        text NOT NULL DEFAULT 'manual',
  "bid_amount_cents"    integer,
  "budget_cents"        integer,
  "spent_cents"         integer NOT NULL DEFAULT 0,
  "targeting_json"      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "frequency_cap_count" integer DEFAULT 5,
  "frequency_cap_hours" integer DEFAULT 24,
  "status"              text NOT NULL DEFAULT 'draft',
  "impressions"         integer NOT NULL DEFAULT 0,
  "clicks"              integer NOT NULL DEFAULT 0,
  "applications"        integer NOT NULL DEFAULT 0,
  "start_at"            timestamptz,
  "end_at"              timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_ad_sets_campaign" ON "ad_sets"("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_ad_sets_user"     ON "ad_sets"("user_id");

-- ── ads (gap #110) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ads" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_set_id"       text NOT NULL,
  "user_id"         text NOT NULL,
  "name"            text NOT NULL,
  "headline"        text NOT NULL,
  "description"     text,
  "cta_text"        text NOT NULL DEFAULT 'Apply Now',
  "cta_url"         text,
  "image_url"       text,
  "video_url"       text,
  "destination_url" text,
  "variant_group"   text,
  "status"          text NOT NULL DEFAULT 'draft',
  "impressions"     integer NOT NULL DEFAULT 0,
  "clicks"          integer NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_ads_ad_set" ON "ads"("ad_set_id");
CREATE INDEX IF NOT EXISTS "idx_ads_user"   ON "ads"("user_id");

-- ── enrichment_credits / enrichment_transactions (gap #96) ─────────────────
CREATE TABLE IF NOT EXISTS "enrichment_credits" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         text NOT NULL UNIQUE,
  "balance"         integer NOT NULL DEFAULT 0,
  "total_purchased" integer NOT NULL DEFAULT 0,
  "total_consumed"  integer NOT NULL DEFAULT 0,
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "enrichment_transactions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        text NOT NULL,
  "type"           text NOT NULL,
  "amount"         integer NOT NULL,
  "balance_after" integer NOT NULL,
  "description"    text,
  "reference_id"   text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_enrichment_tx_user" ON "enrichment_transactions"("user_id");

-- ── career_resilience_reports (gap #103) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "career_resilience_reports" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      text NOT NULL,
  "current_role" text NOT NULL,
  "risk_score"   integer NOT NULL,
  "report_json"  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "share_token"  text UNIQUE,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_career_resilience_user" ON "career_resilience_reports"("user_id");
