-- Migration 0130 — Backfill CREATE TABLE for 28 legacy
-- tables that were declared in schema/ but never bootstrapped to any
-- database (gap #1187 — part 2 of 2; part 1 = 0127-0129 introspected
-- from live DB).
--
-- These tables only appeared as Drizzle pgTable declarations. No prior
-- migration created them, and the production DB doesn't have them
-- either — they were planned features that never reached the schema
-- push step, leaving the application referencing tables that didn't
-- exist. This migration creates them fresh with the exact shape the
-- pgTable declarations expect.
--
-- Every CREATE / index / FK is IF NOT EXISTS / DO-block-guarded so
-- production (which lacks all these tables) just creates them, and any
-- environment that has partial state stays consistent.
--
-- Generated once by `scripts/generate-absent-table-migrations.mjs`.
-- Do not edit by hand — schema changes ship as new ALTER migrations.

-- ─── CREATE TABLE ───────────────────────────────────────────────────

-- feature_flags
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "rollout_percentage" integer NOT NULL DEFAULT 0,
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- marketing_leads
CREATE TABLE IF NOT EXISTS "marketing_leads" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "company" varchar(255),
  "source" varchar(100) DEFAULT 'website',
  "status" varchar(50) DEFAULT 'new',
  "notes" text,
  "metadata" jsonb,
  "converted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- api_keys
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "key_prefix" varchar(12) NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- assessment_attempts
CREATE TABLE IF NOT EXISTS "assessment_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'in_progress',
  "answers" jsonb DEFAULT '{}'::jsonb,
  "grading_results" jsonb,
  "raw_score" integer,
  "total_points" integer,
  "percentage_score" numeric,
  "passed" boolean,
  "ai_feedback" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "submitted_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "graded_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- skill_assessments
CREATE TABLE IF NOT EXISTS "skill_assessments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "slug" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "skill_category" varchar(100) NOT NULL,
  "difficulty" varchar(50) NOT NULL DEFAULT 'intermediate',
  "time_limit_minutes" integer DEFAULT 30,
  "questions" jsonb DEFAULT '[]'::jsonb,
  "passing_score" integer NOT NULL DEFAULT 70,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- answer_cache
CREATE TABLE IF NOT EXISTS "answer_cache" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "question_hash" varchar(64) NOT NULL,
  "question_text" text NOT NULL,
  "question_category" varchar(100),
  "answer" text NOT NULL,
  "times_used" integer NOT NULL DEFAULT 1,
  "last_used_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "answer_cache_user_question" UNIQUE ("user_id", "question_hash")
);

-- application_form_answers
CREATE TABLE IF NOT EXISTS "application_form_answers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "job_id" uuid,
  "saved_job_id" uuid,
  "resume_id" uuid,
  "source_url" text,
  "ats_provider" varchar(50),
  "form_fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "job_description" text,
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- company_subscriptions
CREATE TABLE IF NOT EXISTS "company_subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "plan_tier" varchar(50) NOT NULL DEFAULT 'starter',
  "seat_count" integer NOT NULL DEFAULT 1,
  "price_per_seat_cents" integer NOT NULL DEFAULT 4900,
  "stripe_subscription_id" text,
  "stripe_customer_id" text,
  "status" varchar(50) NOT NULL DEFAULT 'active',
  "billing_interval" varchar(20) NOT NULL DEFAULT 'monthly',
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- employer_branding_pages
CREATE TABLE IF NOT EXISTS "employer_branding_pages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "hero_video_url" text,
  "hero_headline" varchar(200),
  "hero_subtitle" text,
  "culture_statement" text,
  "values" jsonb DEFAULT '[]'::jsonb,
  "perks" jsonb DEFAULT '[]'::jsonb,
  "media_gallery" jsonb DEFAULT '[]'::jsonb,
  "team_highlights" jsonb DEFAULT '[]'::jsonb,
  "awards_and_recognition" jsonb DEFAULT '[]'::jsonb,
  "primary_color" varchar(20) DEFAULT '#2563eb',
  "is_published" boolean NOT NULL DEFAULT false,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- feed_post_reports
CREATE TABLE IF NOT EXISTS "feed_post_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "feed_post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "reason" varchar(100) NOT NULL,
  "details" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- follow_up_enrollments
CREATE TABLE IF NOT EXISTS "follow_up_enrollments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "sequence_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "recipient_email" varchar(255) NOT NULL,
  "recipient_name" varchar(255),
  "recipient_user_id" uuid,
  "context" jsonb DEFAULT '{}'::jsonb,
  "status" varchar(50) NOT NULL DEFAULT 'active',
  "current_step" integer NOT NULL DEFAULT 0,
  "next_send_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- follow_up_logs
CREATE TABLE IF NOT EXISTS "follow_up_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "enrollment_id" uuid NOT NULL,
  "step_id" uuid,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" varchar(50) NOT NULL DEFAULT 'sent',
  "error_message" text
);

-- follow_up_sequences
CREATE TABLE IF NOT EXISTS "follow_up_sequences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- follow_up_steps
CREATE TABLE IF NOT EXISTS "follow_up_steps" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "sequence_id" uuid NOT NULL,
  "step_order" integer NOT NULL DEFAULT 1,
  "delay_days" integer NOT NULL DEFAULT 3,
  "subject" varchar(500) NOT NULL,
  "body_template" text NOT NULL,
  "channel" varchar(50) NOT NULL DEFAULT 'email',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ats_connections
CREATE TABLE IF NOT EXISTS "ats_connections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "provider" varchar(50) NOT NULL,
  "api_key" text,
  "webhook_secret" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_sync_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- business_phone_numbers
CREATE TABLE IF NOT EXISTS "business_phone_numbers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "phone_number" varchar(20) NOT NULL,
  "friendly_name" varchar(100),
  "signalwire_phone_sid" text,
  "forwarding_number" varchar(20),
  "voicemail_enabled" boolean NOT NULL DEFAULT true,
  "dnd_schedule" jsonb,
  "greeting_text" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- call_logs
CREATE TABLE IF NOT EXISTS "call_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "phone_number_id" uuid NOT NULL,
  "direction" text NOT NULL,
  "caller_number" varchar(20) NOT NULL,
  "called_number" varchar(20) NOT NULL,
  "duration_seconds" integer NOT NULL DEFAULT 0,
  "recording_url" text,
  "status" text NOT NULL,
  "signalwire_call_sid" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- job_board_sources
CREATE TABLE IF NOT EXISTS "job_board_sources" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "url" text NOT NULL,
  "type" varchar(50) NOT NULL DEFAULT 'rss',
  "api_key" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "schedule" varchar(100) DEFAULT '0 * * * *',
  "created_by_user_id" uuid,
  "scope" varchar(50) NOT NULL DEFAULT 'global',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- job_board_sync_log
CREATE TABLE IF NOT EXISTS "job_board_sync_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "source_id" uuid NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "status" varchar(50) NOT NULL DEFAULT 'running',
  "fetched" integer NOT NULL DEFAULT 0,
  "inserted" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "errors" integer NOT NULL DEFAULT 0,
  "error_message" text
);

-- performance_cycles
CREATE TABLE IF NOT EXISTS "performance_cycles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "created_by_user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "type" varchar(50) NOT NULL DEFAULT 'quarterly',
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- performance_goals
CREATE TABLE IF NOT EXISTS "performance_goals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "cycle_id" uuid,
  "title" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(100) DEFAULT 'professional',
  "target_date" timestamp with time zone,
  "progress_percentage" integer NOT NULL DEFAULT 0,
  "status" varchar(50) NOT NULL DEFAULT 'in_progress',
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- performance_reviews
CREATE TABLE IF NOT EXISTS "performance_reviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "cycle_id" uuid NOT NULL,
  "reviewee_user_id" uuid NOT NULL,
  "reviewer_user_id" uuid NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "overall_rating" numeric,
  "strengths" text,
  "areas_for_improvement" text,
  "goals" jsonb DEFAULT '[]'::jsonb,
  "ratings" jsonb DEFAULT '{}'::jsonb,
  "reviewer_notes" text,
  "reviewee_response" text,
  "submitted_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- phone_balance_transactions
CREATE TABLE IF NOT EXISTS "phone_balance_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "balance_cents_after" integer NOT NULL,
  "description" text,
  "reference_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- phone_balances
CREATE TABLE IF NOT EXISTS "phone_balances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "balance_cents" integer NOT NULL DEFAULT 0,
  "auto_top_up_enabled" boolean NOT NULL DEFAULT false,
  "auto_top_up_threshold_cents" integer NOT NULL DEFAULT 500,
  "auto_top_up_amount_cents" integer NOT NULL DEFAULT 2000,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pb_user_unique" UNIQUE ("user_id")
);

-- saved_searches
CREATE TABLE IF NOT EXISTS "saved_searches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "query" text NOT NULL DEFAULT '',
  "filters" jsonb DEFAULT '{}'::jsonb,
  "search_type" varchar(50) NOT NULL DEFAULT 'recruiter',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- sms_messages
CREATE TABLE IF NOT EXISTS "sms_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "phone_number_id" uuid NOT NULL,
  "direction" text NOT NULL,
  "from_number" varchar(20) NOT NULL,
  "to_number" varchar(20) NOT NULL,
  "body" text NOT NULL,
  "status" text NOT NULL,
  "signalwire_sms_sid" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- webauthn_challenges
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "challenge" text NOT NULL,
  "type" varchar(20) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- webauthn_credentials
CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "credential_id" text NOT NULL,
  "public_key" text NOT NULL,
  "aaguid" varchar(36),
  "algorithm" integer NOT NULL DEFAULT -7,
  "sign_count" integer NOT NULL DEFAULT 0,
  "name" varchar(100) NOT NULL DEFAULT 'My Passkey',
  "is_backed_up" boolean NOT NULL DEFAULT false,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);


-- ─── FOREIGN KEYS ───────────────────────────────────────────────────


-- ─── INDEXES ────────────────────────────────────────────────────────

-- business_phone_numbers
CREATE INDEX IF NOT EXISTS "bpn_user_idx" ON "business_phone_numbers" ("user_id");
CREATE INDEX IF NOT EXISTS "bpn_number_idx" ON "business_phone_numbers" ("phone_number");

-- call_logs
CREATE INDEX IF NOT EXISTS "cl_user_idx" ON "call_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "cl_number_idx" ON "call_logs" ("phone_number_id");
CREATE INDEX IF NOT EXISTS "cl_created_idx" ON "call_logs" ("created_at");

-- phone_balance_transactions
CREATE INDEX IF NOT EXISTS "pbt_user_idx" ON "phone_balance_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "pbt_created_idx" ON "phone_balance_transactions" ("created_at");

-- sms_messages
CREATE INDEX IF NOT EXISTS "sms_user_idx" ON "sms_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "sms_number_idx" ON "sms_messages" ("phone_number_id");
CREATE INDEX IF NOT EXISTS "sms_created_idx" ON "sms_messages" ("created_at");
