-- Migration 0129 — Backfill CREATE TABLE for 25 legacy
-- tables (gap #1187 — batch 3 of 3).
--
-- Every table below was bootstrapped on production by an out-of-tree
-- `drizzle-kit push` before migrations were source-controlled. They
-- never had a CREATE TABLE migration, so fresh-deploy CI relied on the
-- "Push DB schema" step in ci.yml to materialise them — which silently
-- under-applied for some tables (gaps #1204, #1207). This migration
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

-- payment_methods
CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "stripe_payment_method_id" text NOT NULL,
  "type" character varying(50) NOT NULL,
  "last4" character varying(4),
  "brand" character varying(50),
  "expiry_month" integer,
  "expiry_year" integer,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "provider_payment_method_id" text,
  "provider" character varying(24),
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY (id),
  CONSTRAINT "payment_methods_stripe_payment_method_id_unique" UNIQUE (stripe_payment_method_id)
);

-- placements
CREATE TABLE IF NOT EXISTS "placements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recruiter_id" uuid NOT NULL,
  "candidate_id" uuid NOT NULL,
  "company_id" uuid,
  "job_id" uuid,
  "start_date" timestamp with time zone,
  "salary" numeric,
  "fee" numeric,
  "status" character varying(50) NOT NULL DEFAULT 'active'::character varying,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "recruiter_name" character varying(255) NOT NULL DEFAULT ''::character varying,
  "candidate_name" character varying(255) NOT NULL DEFAULT ''::character varying,
  "job_title" character varying(255),
  "company_name" character varying(255),
  "submission_id" uuid,
  "annual_salary" numeric,
  "commission_percentage" numeric NOT NULL DEFAULT '0'::numeric,
  "commission_amount" numeric NOT NULL DEFAULT '0'::numeric,
  "commission_status" character varying(50) NOT NULL DEFAULT 'Pending'::character varying,
  "commission_paid_date" timestamp with time zone,
  "payment_reference" character varying(255),
  "guarantee_period_days" integer,
  "guarantee_end_date" timestamp with time zone,
  "guarantee_met_status" boolean,
  "placement_type_id" uuid,
  CONSTRAINT "placements_pkey" PRIMARY KEY (id)
);

-- postal_zip_codes
CREATE TABLE IF NOT EXISTS "postal_zip_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "city_id" uuid,
  "code" character varying(20) NOT NULL,
  "latitude" character varying(20),
  "longitude" character varying(20),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "postal_zip_codes_pkey" PRIMARY KEY (id)
);

-- profile_views
CREATE TABLE IF NOT EXISTS "profile_views" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "viewed_user_id" uuid NOT NULL,
  "viewer_user_id" uuid,
  "ip_address" character varying(45),
  "user_agent" text,
  "referrer" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profile_views_pkey" PRIMARY KEY (id)
);

-- queue_job_to_process
CREATE TABLE IF NOT EXISTS "queue_job_to_process" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "type" character varying(100) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "priority" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "last_attempt_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "queue_job_to_process_pkey" PRIMARY KEY (id)
);

-- queue_job_to_resume
CREATE TABLE IF NOT EXISTS "queue_job_to_resume" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "resume_id" uuid NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone,
  "result" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "queue_job_to_resume_pkey" PRIMARY KEY (id)
);

-- refresh_tokens
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "refresh_tokens_token_unique" UNIQUE (token)
);

-- refund_requests
CREATE TABLE IF NOT EXISTS "refund_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "invoice_id" uuid,
  "reason" text NOT NULL,
  "amount" numeric,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "refund_requests_pkey" PRIMARY KEY (id)
);

-- request_logs
CREATE TABLE IF NOT EXISTS "request_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "method" character varying(10) NOT NULL,
  "path" text NOT NULL,
  "status_code" integer,
  "duration_ms" integer,
  "user_id" uuid,
  "ip_address" character varying(45),
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "request_logs_pkey" PRIMARY KEY (id)
);

-- resume_information
CREATE TABLE IF NOT EXISTS "resume_information" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "meta_resume_id" uuid,
  "title" character varying(255) NOT NULL,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" character varying(50) NOT NULL DEFAULT 'draft'::character varying,
  "template_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "is_master" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT false,
  "parent_id" uuid,
  "slug" character varying(255),
  "privacy_level" integer NOT NULL DEFAULT 10,
  "diff_percent" integer,
  "sentiment_score" integer,
  "scores" jsonb,
  "archived_at" timestamp with time zone,
  CONSTRAINT "resume_information_pkey" PRIMARY KEY (id)
);

-- resume_templates
CREATE TABLE IF NOT EXISTS "resume_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "description" text,
  "thumbnail_url" text,
  "template_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_public" boolean NOT NULL DEFAULT true,
  "is_premium" boolean NOT NULL DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sectors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_pivot_template" boolean NOT NULL DEFAULT false,
  CONSTRAINT "resume_templates_pkey" PRIMARY KEY (id)
);

-- roles
CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(100) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "roles_name_unique" UNIQUE (name),
  CONSTRAINT "roles_pkey" PRIMARY KEY (id)
);

-- saved_jobs
CREATE TABLE IF NOT EXISTS "saved_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" character varying(50) NOT NULL DEFAULT 'tracked'::character varying,
  "status_changed_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "notes" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "saved_jobs_pkey" PRIMARY KEY (id)
);

-- studio_projects
CREATE TABLE IF NOT EXISTS "studio_projects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "resume_text" text NOT NULL,
  "storyboard" jsonb,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "video_id" uuid,
  "retry_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resume_id" uuid,
  "company_id" uuid,
  "assigned_user_id" uuid,
  "kind" character varying(16) NOT NULL DEFAULT 'scene'::character varying,
  "timeline_spec" jsonb,
  "is_public" boolean NOT NULL DEFAULT false,
  "slug" text DEFAULT NULLIF(lower((storyboard ->> '_slug'::text)), ''::text),
  "is_profile_primary" boolean NOT NULL DEFAULT false,
  "is_featured" boolean NOT NULL DEFAULT false,
  "media_kind" character varying(16) NOT NULL DEFAULT 'video'::character varying,
  "game_state" jsonb,
  "comic_state" jsonb,
  "image_state" jsonb,
  "animation_state" jsonb,
  "cad_state" jsonb,
  CONSTRAINT "studio_projects_kind_check" CHECK (((kind)::text = ANY ((ARRAY['scene'::character varying, 'nle'::character varying])::text[]))),
  CONSTRAINT "studio_projects_media_kind_check" CHECK (((media_kind)::text = ANY ((ARRAY['video'::character varying, 'podcast'::character varying, 'voice'::character varying, 'animation'::character varying, 'game'::character varying, 'comic'::character varying, 'image'::character varying, 'cad'::character varying])::text[]))),
  CONSTRAINT "studio_projects_pkey" PRIMARY KEY (id)
);

-- system_settings
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "key" character varying(255) NOT NULL,
  "value" text,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "system_settings_key_unique" UNIQUE (key),
  CONSTRAINT "system_settings_pkey" PRIMARY KEY (id)
);

-- tasks
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "board_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" character varying(500) NOT NULL,
  "description" text,
  "status" character varying(50) NOT NULL DEFAULT 'todo'::character varying,
  "priority" character varying(50) NOT NULL DEFAULT 'medium'::character varying,
  "position" integer NOT NULL DEFAULT 0,
  "due_date" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "labels" jsonb DEFAULT '[]'::jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source_event_id" uuid,
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id)
);

-- two_factor_codes
CREATE TABLE IF NOT EXISTS "two_factor_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code" character varying(10) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "attempts" integer NOT NULL DEFAULT 0,
  CONSTRAINT "two_factor_codes_pkey" PRIMARY KEY (id)
);

-- usage_records
CREATE TABLE IF NOT EXISTS "usage_records" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "feature_key" character varying(100) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "usage_records_pkey" PRIMARY KEY (id)
);

-- user_company_role_associations
CREATE TABLE IF NOT EXISTS "user_company_role_associations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "role" character varying(100) NOT NULL DEFAULT 'member'::character varying,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_company_role_associations_pkey" PRIMARY KEY (id)
);

-- user_connections
CREATE TABLE IF NOT EXISTS "user_connections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "from_user_id" uuid NOT NULL,
  "to_user_id" uuid NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'Pending'::character varying,
  "request_message" text,
  "response_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_connections_pkey" PRIMARY KEY (id)
);

-- user_engagement_metrics
CREATE TABLE IF NOT EXISTS "user_engagement_metrics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "login_count" integer NOT NULL DEFAULT 0,
  "resume_views" integer NOT NULL DEFAULT 0,
  "job_applications" integer NOT NULL DEFAULT 0,
  "messages_sent" integer NOT NULL DEFAULT 0,
  "videos_created" integer NOT NULL DEFAULT 0,
  "last_active" timestamp with time zone,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_engagement_metrics_pkey" PRIMARY KEY (id)
);

-- user_profiles
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "headline" text,
  "summary" text,
  "location" character varying(255),
  "years_of_experience" integer,
  "open_to_work" boolean NOT NULL DEFAULT false,
  "profile_visibility" character varying(50) NOT NULL DEFAULT 'public'::character varying,
  "custom_url_slug" character varying(100),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "website" character varying(500),
  "phone" character varying(50),
  "linked_in" character varying(500),
  "github" character varying(500),
  "twitter" character varying(500),
  "current_role" character varying(255),
  "current_company" character varying(255),
  "avatar_url" text,
  "open_to_remote" boolean NOT NULL DEFAULT false,
  "salary_currency" character varying(10) DEFAULT 'USD'::character varying,
  "salary_expectation" integer,
  "skills" jsonb DEFAULT '[]'::jsonb,
  "industries" jsonb DEFAULT '[]'::jsonb,
  "preferred_roles" jsonb DEFAULT '[]'::jsonb,
  "featured_until" timestamp with time zone,
  "provides_services" boolean NOT NULL DEFAULT false,
  "billing_full_name" character varying(160),
  "billing_company" character varying(160),
  "billing_line1" character varying(200),
  "billing_line2" character varying(200),
  "billing_city" character varying(100),
  "billing_state" character varying(100),
  "billing_postal_code" character varying(20),
  "billing_country" character varying(2),
  "billing_phone" character varying(40),
  "career_target" jsonb,
  "home_country_id" integer,
  "home_state_id" uuid,
  "home_city_id" uuid,
  "home_postal_code" character varying(20),
  "home_latitude" double precision,
  "home_longitude" double precision,
  "home_radius_km" integer,
  "profile_sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_profiles_user_id_unique" UNIQUE (user_id)
);

-- user_roles
CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_roles_pkey" PRIMARY KEY (id)
);

-- videos
CREATE TABLE IF NOT EXISTS "videos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "resume_id" uuid,
  "title" character varying(255),
  "description" text,
  "status" character varying(50) NOT NULL DEFAULT 'Queued'::character varying,
  "r2_key" text,
  "thumbnail_url" text,
  "youtube_video_id" text,
  "youtube_url" text,
  "storyboard" jsonb,
  "duration" integer,
  "error_message" text,
  "privacy_status" character varying(50) NOT NULL DEFAULT 'unlisted'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "company_id" uuid,
  "is_featured" boolean NOT NULL DEFAULT false,
  CONSTRAINT "videos_pkey" PRIMARY KEY (id)
);

-- watched_resumes
CREATE TABLE IF NOT EXISTS "watched_resumes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "viewer_id" uuid NOT NULL,
  "resume_id" uuid NOT NULL,
  "watched_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "watched_resumes_pkey" PRIMARY KEY (id)
);


-- ─── FOREIGN KEYS ───────────────────────────────────────────────────

-- payment_methods
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_user_id_users_id_fk' AND conrelid = '"payment_methods"'::regclass) THEN
    ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- placements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_candidate_id_users_id_fk' AND conrelid = '"placements"'::regclass) THEN
    ALTER TABLE "placements" ADD CONSTRAINT "placements_candidate_id_users_id_fk" FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_company_id_company_profiles_id_fk' AND conrelid = '"placements"'::regclass) THEN
    ALTER TABLE "placements" ADD CONSTRAINT "placements_company_id_company_profiles_id_fk" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_recruiter_id_users_id_fk' AND conrelid = '"placements"'::regclass) THEN
    ALTER TABLE "placements" ADD CONSTRAINT "placements_recruiter_id_users_id_fk" FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_submission_id_candidate_submissions_id_fk' AND conrelid = '"placements"'::regclass) THEN
    ALTER TABLE "placements" ADD CONSTRAINT "placements_submission_id_candidate_submissions_id_fk" FOREIGN KEY (submission_id) REFERENCES candidate_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- postal_zip_codes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postal_zip_codes_city_id_cities_id_fk' AND conrelid = '"postal_zip_codes"'::regclass) THEN
    ALTER TABLE "postal_zip_codes" ADD CONSTRAINT "postal_zip_codes_city_id_cities_id_fk" FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- profile_views
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_views_viewed_user_id_users_id_fk' AND conrelid = '"profile_views"'::regclass) THEN
    ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewed_user_id_users_id_fk" FOREIGN KEY (viewed_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_views_viewer_user_id_users_id_fk' AND conrelid = '"profile_views"'::regclass) THEN
    ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_user_id_users_id_fk" FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- queue_job_to_resume
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queue_job_to_resume_user_id_users_id_fk' AND conrelid = '"queue_job_to_resume"'::regclass) THEN
    ALTER TABLE "queue_job_to_resume" ADD CONSTRAINT "queue_job_to_resume_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- refresh_tokens
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_id_users_id_fk' AND conrelid = '"refresh_tokens"'::regclass) THEN
    ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- refund_requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_invoice_id_invoices_id_fk' AND conrelid = '"refund_requests"'::regclass) THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_invoice_id_invoices_id_fk" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_resolved_by_users_id_fk' AND conrelid = '"refund_requests"'::regclass) THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_resolved_by_users_id_fk" FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_requests_user_id_users_id_fk' AND conrelid = '"refund_requests"'::regclass) THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- request_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_logs_user_id_users_id_fk' AND conrelid = '"request_logs"'::regclass) THEN
    ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- resume_information
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_information_meta_resume_id_meta_resumes_id_fk' AND conrelid = '"resume_information"'::regclass) THEN
    ALTER TABLE "resume_information" ADD CONSTRAINT "resume_information_meta_resume_id_meta_resumes_id_fk" FOREIGN KEY (meta_resume_id) REFERENCES meta_resumes(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_information_user_id_users_id_fk' AND conrelid = '"resume_information"'::regclass) THEN
    ALTER TABLE "resume_information" ADD CONSTRAINT "resume_information_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- resume_templates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_templates_created_by_users_id_fk' AND conrelid = '"resume_templates"'::regclass) THEN
    ALTER TABLE "resume_templates" ADD CONSTRAINT "resume_templates_created_by_users_id_fk" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- saved_jobs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_jobs_job_id_job_items_id_fk' AND conrelid = '"saved_jobs"'::regclass) THEN
    ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_job_items_id_fk" FOREIGN KEY (job_id) REFERENCES job_items(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_jobs_user_id_users_id_fk' AND conrelid = '"saved_jobs"'::regclass) THEN
    ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- studio_projects
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_projects_assigned_user_id_fkey' AND conrelid = '"studio_projects"'::regclass) THEN
    ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_assigned_user_id_fkey" FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_projects_company_id_fkey' AND conrelid = '"studio_projects"'::regclass) THEN
    ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_projects_resume_id_resume_information_id_fk' AND conrelid = '"studio_projects"'::regclass) THEN
    ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_resume_id_resume_information_id_fk" FOREIGN KEY (resume_id) REFERENCES resume_information(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_projects_user_id_users_id_fk' AND conrelid = '"studio_projects"'::regclass) THEN
    ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- tasks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_board_id_boards_id_fk' AND conrelid = '"tasks"'::regclass) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_boards_id_fk" FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_source_event_id_fkey' AND conrelid = '"tasks"'::regclass) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_event_id_fkey" FOREIGN KEY (source_event_id) REFERENCES scheduled_events(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_id_users_id_fk' AND conrelid = '"tasks"'::regclass) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- two_factor_codes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'two_factor_codes_user_id_users_id_fk' AND conrelid = '"two_factor_codes"'::regclass) THEN
    ALTER TABLE "two_factor_codes" ADD CONSTRAINT "two_factor_codes_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- usage_records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_records_user_id_users_id_fk' AND conrelid = '"usage_records"'::regclass) THEN
    ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_company_role_associations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_company_role_associations_company_id_company_profiles_id_f' AND conrelid = '"user_company_role_associations"'::regclass) THEN
    ALTER TABLE "user_company_role_associations" ADD CONSTRAINT "user_company_role_associations_company_id_company_profiles_id_f" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_company_role_associations_user_id_users_id_fk' AND conrelid = '"user_company_role_associations"'::regclass) THEN
    ALTER TABLE "user_company_role_associations" ADD CONSTRAINT "user_company_role_associations_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_connections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_connections_from_user_id_users_id_fk' AND conrelid = '"user_connections"'::regclass) THEN
    ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_from_user_id_users_id_fk" FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_connections_to_user_id_users_id_fk' AND conrelid = '"user_connections"'::regclass) THEN
    ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_to_user_id_users_id_fk" FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_engagement_metrics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_engagement_metrics_user_id_users_id_fk' AND conrelid = '"user_engagement_metrics"'::regclass) THEN
    ALTER TABLE "user_engagement_metrics" ADD CONSTRAINT "user_engagement_metrics_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_city_id_fkey' AND conrelid = '"user_profiles"'::regclass) THEN
    ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_home_city_id_fkey" FOREIGN KEY (home_city_id) REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_country_id_fkey' AND conrelid = '"user_profiles"'::regclass) THEN
    ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_home_country_id_fkey" FOREIGN KEY (home_country_id) REFERENCES countries(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_state_id_fkey' AND conrelid = '"user_profiles"'::regclass) THEN
    ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_home_state_id_fkey" FOREIGN KEY (home_state_id) REFERENCES state_provinces(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_id_users_id_fk' AND conrelid = '"user_profiles"'::regclass) THEN
    ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_id_roles_id_fk' AND conrelid = '"user_roles"'::regclass) THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_users_id_fk' AND conrelid = '"user_roles"'::regclass) THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- videos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_company_id_fkey' AND conrelid = '"videos"'::regclass) THEN
    ALTER TABLE "videos" ADD CONSTRAINT "videos_company_id_fkey" FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_user_id_users_id_fk' AND conrelid = '"videos"'::regclass) THEN
    ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- watched_resumes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watched_resumes_resume_id_resume_information_id_fk' AND conrelid = '"watched_resumes"'::regclass) THEN
    ALTER TABLE "watched_resumes" ADD CONSTRAINT "watched_resumes_resume_id_resume_information_id_fk" FOREIGN KEY (resume_id) REFERENCES resume_information(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watched_resumes_viewer_id_users_id_fk' AND conrelid = '"watched_resumes"'::regclass) THEN
    ALTER TABLE "watched_resumes" ADD CONSTRAINT "watched_resumes_viewer_id_users_id_fk" FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ─── INDEXES ────────────────────────────────────────────────────────

-- payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_provider_payment_method_id ON public.payment_methods USING btree (provider_payment_method_id);

-- placements
CREATE INDEX IF NOT EXISTS idx_placements_placement_type_id ON public.placements USING btree (placement_type_id);

-- resume_information
CREATE INDEX IF NOT EXISTS idx_resume_information_archived_at_null ON public.resume_information USING btree (user_id) WHERE (archived_at IS NULL);
CREATE INDEX IF NOT EXISTS resume_information_parent_id_idx ON public.resume_information USING btree (parent_id);
CREATE INDEX IF NOT EXISTS resume_information_user_id_idx ON public.resume_information USING btree (user_id);

-- resume_templates
CREATE INDEX IF NOT EXISTS idx_resume_templates_pivot ON public.resume_templates USING btree (is_pivot_template) WHERE (is_pivot_template = true);

-- saved_jobs
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_jobs_user_job ON public.saved_jobs USING btree (user_id, job_id);

-- studio_projects
CREATE INDEX IF NOT EXISTS idx_studio_projects_assigned_user ON public.studio_projects USING btree (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_studio_projects_company ON public.studio_projects USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_studio_projects_is_featured ON public.studio_projects USING btree (updated_at DESC) WHERE (is_featured = true);
CREATE INDEX IF NOT EXISTS idx_studio_projects_kind ON public.studio_projects USING btree (kind);
CREATE INDEX IF NOT EXISTS idx_studio_projects_media_kind ON public.studio_projects USING btree (media_kind) WHERE ((media_kind)::text <> 'video'::text);
CREATE UNIQUE INDEX IF NOT EXISTS studio_projects_slug_unique_idx ON public.studio_projects USING btree (slug) WHERE (slug IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_projects_profile_primary_per_user ON public.studio_projects USING btree (user_id) WHERE (is_profile_primary = true);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_source_event_id ON public.tasks USING btree (source_event_id) WHERE (source_event_id IS NOT NULL);

-- user_profiles
CREATE INDEX IF NOT EXISTS user_profiles_home_city_idx ON public.user_profiles USING btree (home_city_id);
CREATE INDEX IF NOT EXISTS user_profiles_home_country_idx ON public.user_profiles USING btree (home_country_id);
CREATE INDEX IF NOT EXISTS user_profiles_home_state_idx ON public.user_profiles USING btree (home_state_id);

-- videos
CREATE INDEX IF NOT EXISTS idx_videos_company ON public.videos USING btree (company_id);

-- watched_resumes
CREATE UNIQUE INDEX IF NOT EXISTS watched_resumes_viewer_resume_unique ON public.watched_resumes USING btree (viewer_id, resume_id);
