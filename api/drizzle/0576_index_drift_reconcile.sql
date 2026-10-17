-- Migration 0576 — reconcile index drift between the Drizzle schema and the
-- SQL migrations (scripts/check-migrations.mjs baseline; W1 cleanup).
--
-- 1. migrationOnly — indexes a migration leaves live that the schema does
--    NOT declare, so CI `drizzle-kit push --force` drops them on every deploy
--    and the runner never re-creates them. None of them should exist:
--      * studio_projects_slug_unique_idx (0084/0129/0518) — legacy twin of
--        the declared uq_studio_projects_slug (same key + predicate).
--      * uq_email_marketing_prefs_token (0205) — duplicate of the declared
--        column UNIQUE email_marketing_preferences_token_unique.
--      * uq_live_screening_invites_token (0180) — duplicate of the declared
--        uniq_live_screening_invites_token.
--      * idx_payment_methods_provider_payment_method_id (0125/0129) — on
--        provider_payment_method_id, a column the schema never declared (code
--        stores the provider id in stripe_payment_method_id, which is UNIQUE).
--      * idx_video_heatmap_video (0003) — on studio_video_heatmap.video_id,
--        dropped by 0085 (re-keyed to studio_project_id, which has
--        idx_studio_video_heatmap_project).
--    DROP INDEX IF EXISTS is a no-op wherever push already removed them.
--
-- 2. schemaOnly — indexes the schema declares but no migration creates, so a
--    database built from migrations alone lacks them (push papers over it on
--    deploy only). Created IF NOT EXISTS with the exact schema definitions;
--    each is guarded so a missing table/column or pre-existing duplicate rows
--    raise a NOTICE instead of breaking the deploy (push still creates it).
--
-- Safe to auto-run any number of times.

DROP INDEX IF EXISTS studio_projects_slug_unique_idx;
DROP INDEX IF EXISTS uq_email_marketing_prefs_token;
DROP INDEX IF EXISTS uq_live_screening_invites_token;
DROP INDEX IF EXISTS idx_payment_methods_provider_payment_method_id;
DROP INDEX IF EXISTS idx_video_heatmap_video;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_article_payout_entries_run_article ON article_payout_entries (run_id, article_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: uq_article_payout_entries_run_article not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS creator_youtube_ingests_user_video_uq ON creator_youtube_ingests (user_id, youtube_video_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: creator_youtube_ingests_user_video_uq not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS external_email_accounts_user_provider_email_key ON external_email_accounts (user_id, provider, account_email);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: external_email_accounts_user_provider_email_key not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS external_email_messages_account_message_key ON external_email_messages (account_id, provider_message_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: external_email_messages_account_message_key not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gig_bids_project_status ON gig_bids (project_id, status);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: idx_gig_bids_project_status not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_gig_bids_project_bidder ON gig_bids (project_id, bidder_user_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: uq_gig_bids_project_bidder not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_gig_milestones_project_ordinal ON gig_milestones (project_id, ordinal);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: idx_gig_milestones_project_ordinal not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_stages_recruiter_pipeline_stage ON pipeline_stages (recruiter_user_id, pipeline_key, stage_key);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: uq_pipeline_stages_recruiter_pipeline_stage not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_source ON social_publish_jobs (source);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: idx_social_publish_jobs_source not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_studio_review_comments_parent ON studio_review_comments (parent_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: idx_studio_review_comments_parent not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_studio_review_comments_project ON studio_review_comments (project_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: idx_studio_review_comments_project not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS usage_invoices_user_period_unique ON usage_invoices (user_id, period_start);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: usage_invoices_user_period_unique not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS usage_statements_user_period_unique ON usage_statements (user_id, period_start);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: usage_statements_user_period_unique not created (%)', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS user_badges_user_badge_idx ON user_badges (user_id, badge_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE '0576: user_badges_user_badge_idx not created (%)', SQLERRM;
END $$;
