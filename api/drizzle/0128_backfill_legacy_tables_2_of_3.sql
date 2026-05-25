-- Migration 0128 — Backfill CREATE TABLE for 25 legacy
-- tables (gap #1187 — batch 2 of 3).
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

-- email_campaign_recipients
CREATE TABLE IF NOT EXISTS "email_campaign_recipients" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL,
  "user_id" uuid,
  "email" character varying(255) NOT NULL,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "sent_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "clicked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY (id)
);

-- email_verification_tokens
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_verification_tokens_token_unique" UNIQUE (token)
);

-- feed_posts
CREATE TABLE IF NOT EXISTS "feed_posts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "content" text NOT NULL,
  "link_url" character varying(2000),
  "link_title" character varying(500),
  "link_description" text,
  "link_image_url" character varying(2000),
  "privacy" character varying(50) NOT NULL DEFAULT 'Public'::character varying,
  "media" jsonb DEFAULT '[]'::jsonb,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "subject_type" character varying(32),
  "subject_id" uuid,
  "embed_payload" jsonb,
  CONSTRAINT "feed_posts_pkey" PRIMARY KEY (id)
);

-- feed_post_comments
CREATE TABLE IF NOT EXISTS "feed_post_comments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "feed_post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feed_post_comments_pkey" PRIMARY KEY (id)
);

-- feed_post_likes
CREATE TABLE IF NOT EXISTS "feed_post_likes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "feed_post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feed_post_likes_pkey" PRIMARY KEY (id)
);

-- interviews
CREATE TABLE IF NOT EXISTS "interviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL,
  "scheduled_by" uuid NOT NULL,
  "interviewer_ids" jsonb DEFAULT '[]'::jsonb,
  "type" character varying(50) NOT NULL DEFAULT 'video'::character varying,
  "status" character varying(50) NOT NULL DEFAULT 'scheduled'::character varying,
  "scheduled_at" timestamp with time zone NOT NULL,
  "duration_minutes" integer DEFAULT 60,
  "meeting_url" text,
  "notes" text,
  "feedback" text,
  "rating" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "interviews_pkey" PRIMARY KEY (id)
);

-- subscription_plans
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "slug" character varying(100) NOT NULL,
  "description" text,
  "price_monthly" numeric NOT NULL,
  "price_yearly" numeric,
  "currency" character varying(10) NOT NULL DEFAULT 'USD'::character varying,
  "stripe_price_id_monthly" text,
  "stripe_price_id_yearly" text,
  "features" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscription_plans_slug_unique" UNIQUE (slug)
);

-- subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "stripe_subscription_id" text,
  "stripe_customer_id" text,
  "status" character varying(50) NOT NULL DEFAULT 'active'::character varying,
  "billing_interval" character varying(20) NOT NULL DEFAULT 'monthly'::character varying,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "canceled_at" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE (stripe_subscription_id)
);

-- invoices
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "subscription_id" uuid,
  "stripe_invoice_id" text,
  "status" character varying(50) NOT NULL DEFAULT 'draft'::character varying,
  "total" numeric NOT NULL,
  "currency" character varying(10) NOT NULL DEFAULT 'USD'::character varying,
  "paid_at" timestamp with time zone,
  "due_date" timestamp with time zone,
  "invoice_pdf_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE (stripe_invoice_id)
);

-- invoice_line_items
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" uuid NOT NULL,
  "description" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price" numeric NOT NULL,
  "amount" numeric NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY (id)
);

-- job_alerts
CREATE TABLE IF NOT EXISTS "job_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" character varying(255) NOT NULL,
  "keywords" text,
  "location" character varying(255),
  "job_type" character varying(50),
  "frequency" character varying(50) NOT NULL DEFAULT 'weekly'::character varying,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_alerts_pkey" PRIMARY KEY (id)
);

-- job_items
CREATE TABLE IF NOT EXISTS "job_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "posted_by_user_id" uuid,
  "company_id" uuid,
  "title" character varying(255) NOT NULL,
  "description" text NOT NULL DEFAULT ''::text,
  "company" character varying(255),
  "location" character varying(255),
  "job_type" character varying(50),
  "experience_level" character varying(50),
  "salary_min" numeric,
  "salary_max" numeric,
  "salary_currency" character varying(10) DEFAULT 'USD'::character varying,
  "skills_required" jsonb DEFAULT '[]'::jsonb,
  "sector" character varying(64),
  "details" jsonb DEFAULT '{}'::jsonb,
  "is_remote" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp with time zone,
  "sponsored" boolean NOT NULL DEFAULT false,
  "sponsored_until" timestamp with time zone,
  "sponsored_rank_boost" integer NOT NULL DEFAULT 0,
  "source_url" text,
  "apply_url" text,
  "hero_image_url" text,
  "sentiment_score" integer,
  "body_cleansed_at" timestamp with time zone,
  "body_cleanse_status" character varying(16),
  "screening_question_set_id" uuid,
  "screening_required" character varying(16) NOT NULL DEFAULT 'none'::character varying,
  "source_id" uuid,
  "archived_at" timestamp with time zone,
  "share_permissions" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_items_new_pkey" PRIMARY KEY (id),
  CONSTRAINT "job_items_new_screening_required_check" CHECK (((screening_required)::text = ANY ((ARRAY['none'::character varying, 'optional'::character varying, 'required'::character varying])::text[])))
);

-- job_applications
CREATE TABLE IF NOT EXISTS "job_applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "job_id" uuid,
  "resume_id" uuid,
  "cover_letter" text,
  "status" character varying(50) NOT NULL DEFAULT 'applied'::character varying,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_applications_pkey" PRIMARY KEY (id)
);

-- job_boards
CREATE TABLE IF NOT EXISTS "job_boards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "url" text NOT NULL,
  "api_key" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_boards_pkey" PRIMARY KEY (id)
);

-- job_board_postings
CREATE TABLE IF NOT EXISTS "job_board_postings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "external_job_id" text,
  "status" character varying(50) NOT NULL DEFAULT 'pending'::character varying,
  "posted_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_board_postings_pkey" PRIMARY KEY (id)
);

-- job_preferences
CREATE TABLE IF NOT EXISTS "job_preferences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "desired_title" character varying(255),
  "desired_location" character varying(255),
  "remote_preference" character varying(50),
  "salary_min" numeric,
  "salary_max" numeric,
  "job_types" jsonb DEFAULT '[]'::jsonb,
  "industries" jsonb DEFAULT '[]'::jsonb,
  "skills" jsonb DEFAULT '[]'::jsonb,
  "is_open_to_work" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "job_preferences_user_id_unique" UNIQUE (user_id)
);

-- job_websites
CREATE TABLE IF NOT EXISTS "job_websites" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(255) NOT NULL,
  "url" text NOT NULL,
  "scraping_enabled" boolean NOT NULL DEFAULT false,
  "last_scraped_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "job_websites_pkey" PRIMARY KEY (id)
);

-- magic_link_tokens
CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" character varying(255) NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "redirect" character varying(500) NOT NULL DEFAULT '/dashboard'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "magic_link_tokens_token_key" UNIQUE (token)
);

-- messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "content" text NOT NULL,
  "content_type" character varying(50) NOT NULL DEFAULT 'text'::character varying,
  "is_edited" boolean NOT NULL DEFAULT false,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY (id)
);

-- message_read_receipts
CREATE TABLE IF NOT EXISTS "message_read_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY (id)
);

-- meta_resumes
CREATE TABLE IF NOT EXISTS "meta_resumes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "title" character varying(255) NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "meta_resumes_pkey" PRIMARY KEY (id)
);

-- notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "type" character varying(100) NOT NULL,
  "title" character varying(255) NOT NULL,
  "message" text NOT NULL,
  "data" jsonb,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

-- oauth_accounts
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "provider" character varying(50) NOT NULL,
  "provider_account_id" character varying(255) NOT NULL,
  "email" character varying(255),
  "display_name" character varying(255),
  "avatar_url" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "scope" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY (id)
);

-- password_history
CREATE TABLE IF NOT EXISTS "password_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "password_history_pkey" PRIMARY KEY (id)
);

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "password_reset_tokens_token_unique" UNIQUE (token)
);


-- ─── FOREIGN KEYS ───────────────────────────────────────────────────

-- email_campaign_recipients
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaign_recipients_campaign_id_email_campaigns_id_fk' AND conrelid = '"email_campaign_recipients"'::regclass) THEN
    ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaign_recipients_user_id_users_id_fk' AND conrelid = '"email_campaign_recipients"'::regclass) THEN
    ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- email_verification_tokens
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_verification_tokens_user_id_users_id_fk' AND conrelid = '"email_verification_tokens"'::regclass) THEN
    ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- feed_posts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_posts_user_id_users_id_fk' AND conrelid = '"feed_posts"'::regclass) THEN
    ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- feed_post_comments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_comments_feed_post_id_feed_posts_id_fk' AND conrelid = '"feed_post_comments"'::regclass) THEN
    ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_feed_post_id_feed_posts_id_fk" FOREIGN KEY (feed_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_comments_user_id_users_id_fk' AND conrelid = '"feed_post_comments"'::regclass) THEN
    ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- feed_post_likes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_likes_feed_post_id_feed_posts_id_fk' AND conrelid = '"feed_post_likes"'::regclass) THEN
    ALTER TABLE "feed_post_likes" ADD CONSTRAINT "feed_post_likes_feed_post_id_feed_posts_id_fk" FOREIGN KEY (feed_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_likes_user_id_users_id_fk' AND conrelid = '"feed_post_likes"'::regclass) THEN
    ALTER TABLE "feed_post_likes" ADD CONSTRAINT "feed_post_likes_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- interviews
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interviews_scheduled_by_users_id_fk' AND conrelid = '"interviews"'::regclass) THEN
    ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scheduled_by_users_id_fk" FOREIGN KEY (scheduled_by) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- subscriptions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_subscription_plans_id_fk' AND conrelid = '"subscriptions"'::regclass) THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_users_id_fk' AND conrelid = '"subscriptions"'::regclass) THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- invoices
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_subscription_id_subscriptions_id_fk' AND conrelid = '"invoices"'::regclass) THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_user_id_users_id_fk' AND conrelid = '"invoices"'::regclass) THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- invoice_line_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_items_invoice_id_invoices_id_fk' AND conrelid = '"invoice_line_items"'::regclass) THEN
    ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- job_alerts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_alerts_user_id_users_id_fk' AND conrelid = '"job_alerts"'::regclass) THEN
    ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- job_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_items_new_posted_by_user_id_fkey' AND conrelid = '"job_items"'::regclass) THEN
    ALTER TABLE "job_items" ADD CONSTRAINT "job_items_new_posted_by_user_id_fkey" FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- job_applications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_job_id_job_items_id_fk' AND conrelid = '"job_applications"'::regclass) THEN
    ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_job_items_id_fk" FOREIGN KEY (job_id) REFERENCES job_items(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_user_id_users_id_fk' AND conrelid = '"job_applications"'::regclass) THEN
    ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- job_board_postings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_board_postings_board_id_job_boards_id_fk' AND conrelid = '"job_board_postings"'::regclass) THEN
    ALTER TABLE "job_board_postings" ADD CONSTRAINT "job_board_postings_board_id_job_boards_id_fk" FOREIGN KEY (board_id) REFERENCES job_boards(id) ON DELETE CASCADE;
  END IF;
END $$;

-- job_preferences
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_preferences_user_id_users_id_fk' AND conrelid = '"job_preferences"'::regclass) THEN
    ALTER TABLE "job_preferences" ADD CONSTRAINT "job_preferences_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_conversation_id_conversations_id_fk' AND conrelid = '"messages"'::regclass) THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_id_users_id_fk' AND conrelid = '"messages"'::regclass) THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- message_read_receipts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_read_receipts_message_id_messages_id_fk' AND conrelid = '"message_read_receipts"'::regclass) THEN
    ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_messages_id_fk" FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_read_receipts_user_id_users_id_fk' AND conrelid = '"message_read_receipts"'::regclass) THEN
    ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- meta_resumes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_resumes_user_id_users_id_fk' AND conrelid = '"meta_resumes"'::regclass) THEN
    ALTER TABLE "meta_resumes" ADD CONSTRAINT "meta_resumes_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- notifications
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk' AND conrelid = '"notifications"'::regclass) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- oauth_accounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_accounts_user_id_fkey' AND conrelid = '"oauth_accounts"'::regclass) THEN
    ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- password_history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_history_user_id_users_id_fk' AND conrelid = '"password_history"'::regclass) THEN
    ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- password_reset_tokens
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_users_id_fk' AND conrelid = '"password_reset_tokens"'::regclass) THEN
    ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ─── INDEXES ────────────────────────────────────────────────────────

-- feed_posts
CREATE INDEX IF NOT EXISTS idx_feed_posts_subject ON public.feed_posts USING btree (subject_type, subject_id) WHERE (subject_type IS NOT NULL);

-- job_items
CREATE INDEX IF NOT EXISTS idx_job_items_archived_at_null ON public.job_items USING btree (is_active) WHERE (archived_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_job_items_company ON public.job_items USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_job_items_screening_set ON public.job_items USING btree (screening_question_set_id) WHERE (screening_question_set_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_job_items_sector_active ON public.job_items USING btree (sector, is_active, created_at DESC) WHERE (sector IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_job_items_source_id ON public.job_items USING btree (source_id);
CREATE INDEX IF NOT EXISTS job_items_cleanse_pending_idx ON public.job_items USING btree (body_cleansed_at NULLS FIRST, updated_at) WHERE ((body_cleansed_at IS NULL) OR (body_cleansed_at < updated_at));
