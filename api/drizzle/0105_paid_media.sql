-- Migration: 0105_paid_media
-- External ad-platform integration (Meta, Google, LinkedIn, TikTok, Bing).
--
-- See src/db/schema/paidmedia.ts for the authoritative shape + comments.
-- Distinct from the internal `ad_campaigns`/`ad_sets`/`ads` boost tables
-- in 0015 — those describe on-platform promotion; these describe campaigns
-- that run on third-party ad networks.
--
-- Idempotent: safe to re-run.

-- ── paid_media_connections ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_connections" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                  text NOT NULL,
  "company_id"               uuid,
  "platform"                 varchar(16) NOT NULL,
  "external_user_id"         text,
  "external_user_handle"     text,
  "access_token_enc"         text NOT NULL,
  "refresh_token_enc"        text,
  "access_token_expires_at"  timestamptz,
  "scopes"                   text NOT NULL DEFAULT '',
  "status"                   varchar(24) NOT NULL DEFAULT 'active',
  "last_synced_at"           timestamptz,
  "last_error"               text,
  "created_at"               timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"               timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_connections_owner"
  ON "paid_media_connections"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_connections_platform"
  ON "paid_media_connections"("platform");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_connection_workspace_platform"
  ON "paid_media_connections"("user_id", "company_id", "platform");

-- ── paid_media_accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_accounts" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id"       uuid NOT NULL REFERENCES "paid_media_connections"("id") ON DELETE CASCADE,
  "user_id"             text NOT NULL,
  "company_id"          uuid,
  "platform"            varchar(16) NOT NULL,
  "external_account_id" text NOT NULL,
  "name"                text NOT NULL,
  "currency_code"       varchar(8),
  "time_zone"           varchar(64),
  "is_primary"          boolean NOT NULL DEFAULT false,
  "status"              varchar(24) NOT NULL DEFAULT 'active',
  "metadata"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"          timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_accounts_owner"
  ON "paid_media_accounts"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_accounts_connection"
  ON "paid_media_accounts"("connection_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_account_external"
  ON "paid_media_accounts"("platform", "external_account_id", "connection_id");

-- ── paid_media_campaigns ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_campaigns" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             text NOT NULL,
  "company_id"          uuid,
  "name"                text NOT NULL,
  "objective"           varchar(32) NOT NULL DEFAULT 'TRAFFIC',
  "status"              varchar(24) NOT NULL DEFAULT 'draft',
  "budget_cents"        bigint,
  "daily_budget_cents"  bigint,
  "spent_cents"         bigint NOT NULL DEFAULT 0,
  "currency_code"       varchar(8) NOT NULL DEFAULT 'USD',
  "start_at"            timestamptz,
  "end_at"              timestamptz,
  "subject_type"        varchar(32),
  "subject_id"          uuid,
  "notes"               text,
  "metadata"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"          timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_campaigns_owner"
  ON "paid_media_campaigns"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_campaigns_status"
  ON "paid_media_campaigns"("status");
CREATE INDEX IF NOT EXISTS "idx_paid_media_campaigns_subject"
  ON "paid_media_campaigns"("subject_type", "subject_id");

-- ── paid_media_ad_sets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_ad_sets" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id"              uuid NOT NULL REFERENCES "paid_media_campaigns"("id") ON DELETE CASCADE,
  "user_id"                  text NOT NULL,
  "company_id"               uuid,
  "name"                     text NOT NULL,
  "status"                   varchar(24) NOT NULL DEFAULT 'draft',
  "bid_strategy"             varchar(32) NOT NULL DEFAULT 'AUTO',
  "bid_amount_cents"         bigint,
  "optimization_goal"        varchar(32) NOT NULL DEFAULT 'LINK_CLICKS',
  "daily_budget_cents"       bigint,
  "lifetime_budget_cents"    bigint,
  "targeting"                jsonb NOT NULL DEFAULT '{}'::jsonb,
  "frequency_cap_impressions" integer,
  "frequency_cap_hours"      integer,
  "start_at"                 timestamptz,
  "end_at"                   timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"               timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_ad_sets_campaign"
  ON "paid_media_ad_sets"("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_ad_sets_owner"
  ON "paid_media_ad_sets"("user_id", "company_id");

-- ── paid_media_creatives (must come before ads.creative_id FK) ────────────
CREATE TABLE IF NOT EXISTS "paid_media_creatives" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             text NOT NULL,
  "company_id"          uuid,
  "name"                text NOT NULL,
  "format"              varchar(24) NOT NULL DEFAULT 'single_image',
  "headline"            text,
  "primary_text"        text,
  "description"         text,
  "cta_text"            varchar(32) NOT NULL DEFAULT 'LEARN_MORE',
  "asset_url"           text,
  "asset_thumbnail_url" text,
  "studio_project_id"   uuid,
  "assets"              jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"          timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_creatives_owner"
  ON "paid_media_creatives"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_creatives_studio_project"
  ON "paid_media_creatives"("studio_project_id");

-- ── paid_media_ads ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_ads" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_set_id"       uuid NOT NULL REFERENCES "paid_media_ad_sets"("id") ON DELETE CASCADE,
  "user_id"         text NOT NULL,
  "company_id"      uuid,
  "name"            text NOT NULL,
  "status"          varchar(24) NOT NULL DEFAULT 'draft',
  "creative_id"     uuid REFERENCES "paid_media_creatives"("id") ON DELETE SET NULL,
  "destination_url" text NOT NULL,
  "utm_source"      text,
  "utm_medium"      text,
  "utm_campaign"    text,
  "utm_content"     text,
  "utm_term"        text,
  "variant_group"   varchar(16),
  "created_at"      timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_ads_ad_set"
  ON "paid_media_ads"("ad_set_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_ads_owner"
  ON "paid_media_ads"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_ads_creative"
  ON "paid_media_ads"("creative_id");

-- ── paid_media_platform_refs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_platform_refs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform"            varchar(16) NOT NULL,
  "account_id"          uuid NOT NULL REFERENCES "paid_media_accounts"("id") ON DELETE CASCADE,
  "resource_kind"       varchar(16) NOT NULL,
  "internal_id"         uuid NOT NULL,
  "external_id"         text NOT NULL,
  "external_parent_id"  text,
  "sync_status"         varchar(24) NOT NULL DEFAULT 'pending',
  "last_synced_at"      timestamptz,
  "last_error"          text,
  "created_at"          timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"          timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_ref_internal_account"
  ON "paid_media_platform_refs"("internal_id", "resource_kind", "account_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_refs_external"
  ON "paid_media_platform_refs"("platform", "external_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_refs_account"
  ON "paid_media_platform_refs"("account_id");

-- ── paid_media_sync_runs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_sync_runs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          text,
  "company_id"       uuid,
  "platform"         varchar(16) NOT NULL,
  "account_id"       uuid,
  "direction"        varchar(8) NOT NULL,
  "operation"        varchar(32) NOT NULL,
  "resource_kind"    varchar(16),
  "internal_id"      uuid,
  "external_id"      text,
  "idempotency_key"  text,
  "request_payload"  jsonb,
  "response_payload" jsonb,
  "success"          boolean NOT NULL,
  "error_code"       text,
  "error_message"    text,
  "duration_ms"      integer,
  "created_at"       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_sync_runs_platform"
  ON "paid_media_sync_runs"("platform", "created_at");
CREATE INDEX IF NOT EXISTS "idx_paid_media_sync_runs_internal"
  ON "paid_media_sync_runs"("internal_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_sync_idempotency"
  ON "paid_media_sync_runs"("platform", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- ── paid_media_insights ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_insights" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform"      varchar(16) NOT NULL,
  "account_id"    uuid NOT NULL REFERENCES "paid_media_accounts"("id") ON DELETE CASCADE,
  "resource_kind" varchar(16) NOT NULL,
  "internal_id"   uuid,
  "external_id"   text NOT NULL,
  "date"          varchar(10) NOT NULL,
  "impressions"   bigint NOT NULL DEFAULT 0,
  "clicks"        bigint NOT NULL DEFAULT 0,
  "spend_cents"   bigint NOT NULL DEFAULT 0,
  "conversions"   bigint NOT NULL DEFAULT 0,
  "video_views"   bigint NOT NULL DEFAULT 0,
  "raw_metrics"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at"    timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_insights_day"
  ON "paid_media_insights"("platform", "external_id", "resource_kind", "date");
CREATE INDEX IF NOT EXISTS "idx_paid_media_insights_internal"
  ON "paid_media_insights"("internal_id", "date");
CREATE INDEX IF NOT EXISTS "idx_paid_media_insights_account"
  ON "paid_media_insights"("account_id", "date");

-- ── paid_media_pixels ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_pixels" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                     text NOT NULL,
  "company_id"                  uuid,
  "meta_pixel_id"               text,
  "google_ads_conversion_id"    text,
  "google_ads_conversion_label" text,
  "ga4_measurement_id"          text,
  "linkedin_partner_id"         text,
  "tiktok_pixel_id"             text,
  "bing_uet_tag_id"             text,
  "meta_capi_token_enc"         text,
  "tiktok_access_token_enc"     text,
  "linkedin_capi_token_enc"     text,
  "bing_uet_api_token_enc"      text,
  "ga4_api_secret_enc"          text,
  "verified"                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                  timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"                  timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_paid_media_pixels_workspace"
  ON "paid_media_pixels"("user_id", "company_id");

-- ── paid_media_conversions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_conversions" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"              text,
  "workspace_user_id"    text,
  "workspace_company_id" uuid,
  "event_name"           varchar(64) NOT NULL,
  "event_time"           timestamptz NOT NULL DEFAULT NOW(),
  "value_cents"          bigint,
  "currency_code"        varchar(8) NOT NULL DEFAULT 'USD',
  "fbclid"               text,
  "gclid"                text,
  "li_fat_id"            text,
  "ttclid"               text,
  "msclkid"              text,
  "email_hashed"         text,
  "phone_hashed"         text,
  "external_id_hashed"   text,
  "ip_address"           varchar(64),
  "user_agent"           text,
  "source_url"           text,
  "properties"           jsonb NOT NULL DEFAULT '{}'::jsonb,
  "delivery_results"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_conversions_workspace"
  ON "paid_media_conversions"("workspace_user_id", "workspace_company_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_conversions_user"
  ON "paid_media_conversions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_paid_media_conversions_event"
  ON "paid_media_conversions"("event_name", "event_time");

-- ── paid_media_audiences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "paid_media_audiences" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       text NOT NULL,
  "company_id"    uuid,
  "name"          text NOT NULL,
  "description"   text,
  "source_kind"   varchar(24) NOT NULL,
  "source_spec"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "size_estimate" integer,
  "created_at"    timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_paid_media_audiences_owner"
  ON "paid_media_audiences"("user_id", "company_id");
