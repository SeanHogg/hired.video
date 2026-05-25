-- Migration 0127 — Backfill CREATE TABLE for 25 legacy
-- tables (gap #1187 — batch 1 of 3).
--
-- Every table below was bootstrapped on production by an out-of-tree
-- `drizzle-kit push` before migrations were source-controlled. They
-- never had a CREATE TABLE migration, so fresh-deploy CI relied on the
-- "Push DB schema" step in ci.yml to materialise them — which silently
-- under-applied for some tables (gaps #1204, #1317). This migration
-- closes the gap by giving every legacy table its own idempotent
-- `CREATE TABLE IF NOT EXISTS`, mirroring exactly what production
-- already has (introspected from live `pg_attribute` /
-- `pg_constraint` / `pg_indexes`).
--
-- On production: every CREATE / index / FK is wrapped in IF NOT EXISTS
-- (or an existence DO-block for FKs), so this migration is a pure
-- no-op against an environment that already has the tables. On fresh
-- CI: the tables get created in topological FK order, then FKs and
-- indexes attach.
--
-- Generated once by `scripts/generate-backfill-migrations.mjs`. Do
-- not edit by hand — if a table shape changes, ship the change as a
-- new ALTER migration.

-- ─── CREATE TABLE ───────────────────────────────────────────────────

-- users
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" character varying(255) NOT NULL,
  "name" character varying(255) NOT NULL,
  "password_hash" text,
  "email_verified" boolean NOT NULL DEFAULT false,
  "role" character varying(50) NOT NULL DEFAULT 'job_seeker'::character varying,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_suspended" boolean NOT NULL DEFAULT false,
  "must_change_password" boolean NOT NULL DEFAULT false,
  "mfa_enabled" boolean NOT NULL DEFAULT false,
  "mfa_secret" text,
  "last_login_at" timestamp with time zone,
  "password_changed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "stripe_customer_id" text,
  "is_super_admin" boolean NOT NULL DEFAULT false,
  "session_version" integer NOT NULL DEFAULT 0,
  "is_banned" boolean NOT NULL DEFAULT false,
  "signup_ip" character varying(45),
  "signup_user_agent" text,
  "profile_mode" character varying(16) NOT NULL DEFAULT 'auto'::character varying,
  "external_public_handle" character varying(64),
  "creator_platform_fee_bps_override" integer,
  "deleted_at" timestamp with time zone,
  "do_not_share" boolean NOT NULL DEFAULT false,
  "is_system" boolean NOT NULL DEFAULT false,
  "utm_source" character varying(128),
  "utm_medium" character varying(128),
  "utm_campaign" character varying(128),
  "utm_term" character varying(128),
  "utm_content" character varying(128),
  "landing_referrer" text,
  "resume_forwarding_slug" character varying(48),
  "video_pitch_url" text,
  "video_pitch_set_at" timestamp with time zone,
  "provider_customer_id" text,
  CONSTRAINT "users_email_unique" UNIQUE (email),
  CONSTRAINT "users_external_public_handle_unique" UNIQUE (external_public_handle),
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_profile_mode_check" CHECK (((profile_mode)::text = ANY ((ARRAY['resume'::character varying, 'channel'::character varying, 'auto'::character varying])::text[]))),
  CONSTRAINT "users_stripe_customer_id_key" UNIQUE (stripe_customer_id)
);

-- account_invitations
CREATE TABLE IF NOT EXISTS "account_invitations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" character varying(255) NOT NULL,
  "role" character varying(50) NOT NULL,
  "token" character varying(255) NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "invited_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  CONSTRAINT "account_invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "account_invitations_token_unique" UNIQUE (token)
);

-- account_preferences
CREATE TABLE IF NOT EXISTS "account_preferences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "email_notifications_enabled" boolean NOT NULL DEFAULT true,
  "marketing_emails_enabled" boolean NOT NULL DEFAULT false,
  "job_alert_emails_enabled" boolean NOT NULL DEFAULT true,
  "weekly_digest_enabled" boolean NOT NULL DEFAULT true,
  "theme" character varying(50) NOT NULL DEFAULT 'light'::character varying,
  "language" character varying(10) NOT NULL DEFAULT 'en'::character varying,
  "currency" character varying(10) NOT NULL DEFAULT 'USD'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "extension_settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timezone" character varying(100) NOT NULL DEFAULT 'UTC'::character varying,
  CONSTRAINT "account_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "account_preferences_user_id_unique" UNIQUE (user_id)
);

-- activity_logs
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "action" character varying(100) NOT NULL,
  "entity_type" character varying(100),
  "entity_id" uuid,
  "metadata" jsonb,
  "ip_address" character varying(45),
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY (id)
);

-- ai_chat_sessions
CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "title" character varying(500),
  "model" character varying(100),
  "system_prompt" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY (id)
);

-- ai_chat_messages
CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "role" character varying(20) NOT NULL,
  "content" text NOT NULL,
  "tokens_used" integer,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY (id)
);

-- ai_usage_records
CREATE TABLE IF NOT EXISTS "ai_usage_records" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "model" character varying(100) NOT NULL,
  "feature_key" character varying(100) NOT NULL,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "cost" numeric NOT NULL DEFAULT '0'::numeric,
  "session_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source" character varying(20) NOT NULL DEFAULT 'monthly'::character varying,
  "tool_run_id" uuid,
  CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY (id)
);

-- application_notes
CREATE TABLE IF NOT EXISTS "application_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "is_private" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "application_notes_pkey" PRIMARY KEY (id)
);

-- billing_events
CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "stripe_event_id" text,
  "event_type" character varying(100) NOT NULL,
  "payload" jsonb,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "billing_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE (stripe_event_id)
);

-- boards
CREATE TABLE IF NOT EXISTS "boards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" character varying(255) NOT NULL,
  "description" text,
  "color" character varying(50),
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "boards_pkey" PRIMARY KEY (id)
);

-- company_profiles
CREATE TABLE IF NOT EXISTS "company_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "name" character varying(255) NOT NULL,
  "slug" character varying(100),
  "description" text,
  "website" character varying(500),
  "logo_url" text,
  "industry" character varying(100),
  "size" character varying(50),
  "founded_year" integer,
  "headquarters" jsonb,
  "is_verified" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "featured" boolean NOT NULL DEFAULT false,
  "featured_until" timestamp with time zone,
  "featured_rank_boost" integer NOT NULL DEFAULT 0,
  "tagline" character varying(255),
  "mission" text,
  "vision" text,
  "technologies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "perks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "culture" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "values" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "benefits" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "review_count" integer NOT NULL DEFAULT 0,
  "review_avg_overall" numeric(3,2),
  "contact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "company_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "company_profiles_slug_unique" UNIQUE (slug)
);

-- recruiter_talent_pools
CREATE TABLE IF NOT EXISTS "recruiter_talent_pools" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recruiter_id" uuid NOT NULL,
  "company_id" uuid,
  "name" character varying(255) NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recruiter_talent_pools_pkey" PRIMARY KEY (id)
);

-- talent_pool_candidates
CREATE TABLE IF NOT EXISTS "talent_pool_candidates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "pool_id" uuid,
  "candidate_id" uuid NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'active'::character varying,
  "notes" text,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "recruiter_id" uuid,
  "candidate_name" character varying(255) NOT NULL DEFAULT ''::character varying,
  "candidate_email" character varying(255),
  "candidate_title" character varying(255),
  "candidate_profile_picture" text,
  "pool_name" character varying(255),
  "relationship_strength" character varying(50) NOT NULL DEFAULT 'warm'::character varying,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "current_company" character varying(255),
  "current_title" character varying(255),
  "desired_salary" numeric,
  "preferred_locations" text,
  "last_contacted_at" timestamp with time zone,
  "next_follow_up_at" timestamp with time zone,
  "contact_frequency" character varying(50),
  "source_id" uuid,
  CONSTRAINT "talent_pool_candidates_pkey" PRIMARY KEY (id)
);

-- candidate_interactions
CREATE TABLE IF NOT EXISTS "candidate_interactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recruiter_id" uuid NOT NULL,
  "candidate_id" uuid NOT NULL,
  "type" character varying(50) NOT NULL,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "talent_pool_id" uuid,
  "subject" character varying(255),
  "outcome" text,
  "interaction_date" timestamp with time zone NOT NULL DEFAULT now(),
  "duration_minutes" integer,
  "requires_follow_up" boolean NOT NULL DEFAULT false,
  "follow_up_date" timestamp with time zone,
  CONSTRAINT "candidate_interactions_pkey" PRIMARY KEY (id)
);

-- candidate_submissions
CREATE TABLE IF NOT EXISTS "candidate_submissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recruiter_id" uuid NOT NULL,
  "candidate_id" uuid NOT NULL,
  "job_id" uuid,
  "status" character varying(50) NOT NULL DEFAULT 'Submitted'::character varying,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "candidate_name" character varying(255) NOT NULL DEFAULT ''::character varying,
  "candidate_email" character varying(255),
  "job_title" character varying(255),
  "company_name" character varying(255),
  "resume_id" uuid,
  "cover_letter" text,
  "recruiter_notes" text,
  "proposed_salary" numeric,
  "available_start_date" timestamp with time zone,
  "status_notes" text,
  "interview_date" timestamp with time zone,
  "withdrawal_reason" character varying(255),
  "withdrawal_notes" text,
  "withdrawn_at" timestamp with time zone,
  CONSTRAINT "candidate_submissions_pkey" PRIMARY KEY (id)
);

-- countries
CREATE TABLE IF NOT EXISTS "countries" (
  "id" integer NOT NULL DEFAULT nextval('countries_id_seq'::regclass),
  "name" character varying(255) NOT NULL,
  "iso2" character(2) NOT NULL,
  "iso3" character(3),
  "phone_code" character varying(20),
  "currency" character varying(10),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "countries_iso2_unique" UNIQUE (iso2),
  CONSTRAINT "countries_iso3_unique" UNIQUE (iso3),
  CONSTRAINT "countries_pkey" PRIMARY KEY (id)
);

-- state_provinces
CREATE TABLE IF NOT EXISTS "state_provinces" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "country_id" integer NOT NULL DEFAULT nextval('state_provinces_country_id_seq'::regclass),
  "name" character varying(255) NOT NULL,
  "code" character varying(10),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "state_provinces_pkey" PRIMARY KEY (id)
);

-- cities
CREATE TABLE IF NOT EXISTS "cities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "state_id" uuid NOT NULL,
  "name" character varying(255) NOT NULL,
  "latitude" character varying(20),
  "longitude" character varying(20),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cities_pkey" PRIMARY KEY (id)
);

-- communication_tracking
CREATE TABLE IF NOT EXISTS "communication_tracking" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "type" character varying(50) NOT NULL,
  "channel" character varying(50) NOT NULL,
  "reference_id" uuid,
  "reference_type" character varying(100),
  "status" character varying(50) NOT NULL DEFAULT 'sent'::character varying,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "communication_tracking_pkey" PRIMARY KEY (id)
);

-- company_followers
CREATE TABLE IF NOT EXISTS "company_followers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "company_followers_pkey" PRIMARY KEY (id)
);

-- conversations
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subject" character varying(500),
  "type" character varying(50) NOT NULL DEFAULT 'direct'::character varying,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversations_pkey" PRIMARY KEY (id)
);

-- conversation_participants
CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" character varying(50) NOT NULL DEFAULT 'member'::character varying,
  "joined_at" timestamp with time zone NOT NULL DEFAULT now(),
  "left_at" timestamp with time zone,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY (id)
);

-- dashboard_metrics
CREATE TABLE IF NOT EXISTS "dashboard_metrics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "metric_key" character varying(100) NOT NULL,
  "metric_value" jsonb NOT NULL,
  "period" character varying(50),
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dashboard_metrics_pkey" PRIMARY KEY (id)
);

-- email_templates
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "subject" character varying(500) NOT NULL,
  "html_body" text NOT NULL,
  "text_body" text,
  "variables" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_templates_name_unique" UNIQUE (name),
  CONSTRAINT "email_templates_pkey" PRIMARY KEY (id)
);

-- email_campaigns
CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "template_id" uuid,
  "subject" character varying(500) NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'draft'::character varying,
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_campaigns_pkey" PRIMARY KEY (id)
);


-- ─── FOREIGN KEYS ───────────────────────────────────────────────────

-- account_invitations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_invitations_invited_by_users_id_fk' AND conrelid = '"account_invitations"'::regclass) THEN
    ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_invited_by_users_id_fk" FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- account_preferences
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_preferences_user_id_users_id_fk' AND conrelid = '"account_preferences"'::regclass) THEN
    ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- activity_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_user_id_users_id_fk' AND conrelid = '"activity_logs"'::regclass) THEN
    ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ai_chat_sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_user_id_users_id_fk' AND conrelid = '"ai_chat_sessions"'::regclass) THEN
    ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ai_chat_messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_messages_session_id_ai_chat_sessions_id_fk' AND conrelid = '"ai_chat_messages"'::regclass) THEN
    ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_ai_chat_sessions_id_fk" FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ai_usage_records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_records_session_id_ai_chat_sessions_id_fk' AND conrelid = '"ai_usage_records"'::regclass) THEN
    ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_session_id_ai_chat_sessions_id_fk" FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_records_tool_run_id_fkey' AND conrelid = '"ai_usage_records"'::regclass) THEN
    ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_tool_run_id_fkey" FOREIGN KEY (tool_run_id) REFERENCES tool_runs(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_records_user_id_users_id_fk' AND conrelid = '"ai_usage_records"'::regclass) THEN
    ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- application_notes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_notes_author_id_users_id_fk' AND conrelid = '"application_notes"'::regclass) THEN
    ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_id_users_id_fk" FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- billing_events
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_user_id_users_id_fk' AND conrelid = '"billing_events"'::regclass) THEN
    ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- boards
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boards_user_id_users_id_fk' AND conrelid = '"boards"'::regclass) THEN
    ALTER TABLE "boards" ADD CONSTRAINT "boards_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- company_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_profiles_owner_id_users_id_fk' AND conrelid = '"company_profiles"'::regclass) THEN
    ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_owner_id_users_id_fk" FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- recruiter_talent_pools
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_talent_pools_company_id_company_profiles_id_fk' AND conrelid = '"recruiter_talent_pools"'::regclass) THEN
    ALTER TABLE "recruiter_talent_pools" ADD CONSTRAINT "recruiter_talent_pools_company_id_company_profiles_id_fk" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_talent_pools_recruiter_id_users_id_fk' AND conrelid = '"recruiter_talent_pools"'::regclass) THEN
    ALTER TABLE "recruiter_talent_pools" ADD CONSTRAINT "recruiter_talent_pools_recruiter_id_users_id_fk" FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- talent_pool_candidates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_pool_candidates_candidate_id_users_id_fk' AND conrelid = '"talent_pool_candidates"'::regclass) THEN
    ALTER TABLE "talent_pool_candidates" ADD CONSTRAINT "talent_pool_candidates_candidate_id_users_id_fk" FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_pool_candidates_pool_id_recruiter_talent_pools_id_fk' AND conrelid = '"talent_pool_candidates"'::regclass) THEN
    ALTER TABLE "talent_pool_candidates" ADD CONSTRAINT "talent_pool_candidates_pool_id_recruiter_talent_pools_id_fk" FOREIGN KEY (pool_id) REFERENCES recruiter_talent_pools(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'talent_pool_candidates_recruiter_id_users_id_fk' AND conrelid = '"talent_pool_candidates"'::regclass) THEN
    ALTER TABLE "talent_pool_candidates" ADD CONSTRAINT "talent_pool_candidates_recruiter_id_users_id_fk" FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- candidate_interactions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_interactions_candidate_id_users_id_fk' AND conrelid = '"candidate_interactions"'::regclass) THEN
    ALTER TABLE "candidate_interactions" ADD CONSTRAINT "candidate_interactions_candidate_id_users_id_fk" FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_interactions_recruiter_id_users_id_fk' AND conrelid = '"candidate_interactions"'::regclass) THEN
    ALTER TABLE "candidate_interactions" ADD CONSTRAINT "candidate_interactions_recruiter_id_users_id_fk" FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_interactions_talent_pool_id_talent_pool_candidates_id' AND conrelid = '"candidate_interactions"'::regclass) THEN
    ALTER TABLE "candidate_interactions" ADD CONSTRAINT "candidate_interactions_talent_pool_id_talent_pool_candidates_id" FOREIGN KEY (talent_pool_id) REFERENCES talent_pool_candidates(id) ON DELETE CASCADE;
  END IF;
END $$;

-- candidate_submissions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_submissions_candidate_id_users_id_fk' AND conrelid = '"candidate_submissions"'::regclass) THEN
    ALTER TABLE "candidate_submissions" ADD CONSTRAINT "candidate_submissions_candidate_id_users_id_fk" FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_submissions_recruiter_id_users_id_fk' AND conrelid = '"candidate_submissions"'::regclass) THEN
    ALTER TABLE "candidate_submissions" ADD CONSTRAINT "candidate_submissions_recruiter_id_users_id_fk" FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- state_provinces
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_provinces_country_id_countries_id_fk' AND conrelid = '"state_provinces"'::regclass) THEN
    ALTER TABLE "state_provinces" ADD CONSTRAINT "state_provinces_country_id_countries_id_fk" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- cities
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_state_id_state_provinces_id_fk' AND conrelid = '"cities"'::regclass) THEN
    ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_state_provinces_id_fk" FOREIGN KEY (state_id) REFERENCES state_provinces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- communication_tracking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_tracking_user_id_users_id_fk' AND conrelid = '"communication_tracking"'::regclass) THEN
    ALTER TABLE "communication_tracking" ADD CONSTRAINT "communication_tracking_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- company_followers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_followers_company_id_company_profiles_id_fk' AND conrelid = '"company_followers"'::regclass) THEN
    ALTER TABLE "company_followers" ADD CONSTRAINT "company_followers_company_id_company_profiles_id_fk" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_followers_user_id_users_id_fk' AND conrelid = '"company_followers"'::regclass) THEN
    ALTER TABLE "company_followers" ADD CONSTRAINT "company_followers_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- conversation_participants
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_conversation_id_conversations_id_fk' AND conrelid = '"conversation_participants"'::regclass) THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_user_id_users_id_fk' AND conrelid = '"conversation_participants"'::regclass) THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- email_campaigns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_template_id_email_templates_id_fk' AND conrelid = '"email_campaigns"'::regclass) THEN
    ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_email_templates_id_fk" FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ─── INDEXES ────────────────────────────────────────────────────────

-- users
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON public.users USING btree (is_banned) WHERE (is_banned = true);
CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON public.users USING btree (signup_ip) WHERE (signup_ip IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_utm_campaign ON public.users USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_provider_customer_id ON public.users USING btree (provider_customer_id) WHERE (provider_customer_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_resume_forwarding_slug ON public.users USING btree (lower((resume_forwarding_slug)::text)) WHERE (resume_forwarding_slug IS NOT NULL);
CREATE INDEX IF NOT EXISTS users_external_public_handle_idx ON public.users USING btree (external_public_handle);

-- ai_usage_records
CREATE INDEX IF NOT EXISTS ai_usage_records_tool_run_id_idx ON public.ai_usage_records USING btree (tool_run_id);

-- talent_pool_candidates
CREATE INDEX IF NOT EXISTS idx_talent_pool_candidates_source_id ON public.talent_pool_candidates USING btree (source_id);
