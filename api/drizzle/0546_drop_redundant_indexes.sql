-- 0546_drop_redundant_indexes.sql
--
-- W1-D data-model hygiene (architecture remediation 2026-10-17).
--
-- Drops non-unique, non-partial btree indexes that another NON-partial index
-- on the same table already covers — either an identical/longer composite
-- whose leading columns match, or a UNIQUE index/constraint on the same
-- columns. Every lookup they served is served by the covering index, and each
-- one costs a write on every INSERT/UPDATE. Found by
--   node --import tsx scripts/find-unindexed-fks.ts   (Redundant indexes)
--
-- Plus idx_async_interviews_token: a plain index on invite_token duplicating
-- the partial idx_async_interviews_token_active (WHERE invite_token IS NOT
-- NULL) — every `invite_token = $1` lookup implies NOT NULL, so the partial
-- serves it with a smaller index.
--
-- Kept on purpose: partial indexes (different row set, e.g.
-- resume_information_user_id_idx vs the archived_at IS NULL composite,
-- idx_notifications_user_unread) and every UNIQUE index — no ON CONFLICT
-- target or unique constraint is touched.
--
-- Each was removed from api/src/db/schema in the same change; push drops it
-- first on deploy, so this file is the record + fallback.

DROP INDEX IF EXISTS idx_boosts_subject;
DROP INDEX IF EXISTS calibration_submissions_session_idx;
DROP INDEX IF EXISTS cl_user_idx;
DROP INDEX IF EXISTS candidate_resume_shares_token_idx;
DROP INDEX IF EXISTS company_views_company_id_idx;
DROP INDEX IF EXISTS competency_levels_competency_idx;
DROP INDEX IF EXISTS content_audiences_entity_idx;
DROP INDEX IF EXISTS idx_feed_comment_reactions_comment;
DROP INDEX IF EXISTS inbox_action_runs_message_idx;
DROP INDEX IF EXISTS idx_interview_sessions_share_token;
DROP INDEX IF EXISTS idx_legal_acceptances_user;
DROP INDEX IF EXISTS idx_legal_documents_kind;
DROP INDEX IF EXISTS list_items_list_idx;
DROP INDEX IF EXISTS idx_nle_media_sources_user;
DROP INDEX IF EXISTS idx_nle_media_tags_source;
DROP INDEX IF EXISTS idx_oauth_accounts_provider_account;
DROP INDEX IF EXISTS idx_paid_media_connections_owner;
DROP INDEX IF EXISTS idx_partner_connections_partner;
DROP INDEX IF EXISTS idx_payout_profiles_user;
DROP INDEX IF EXISTS pitch_deck_candidates_deck_id_idx;
DROP INDEX IF EXISTS pitch_deck_shares_token_idx;
DROP INDEX IF EXISTS idx_promo_revisions_project;
DROP INDEX IF EXISTS recruiter_list_members_list_idx;
DROP INDEX IF EXISTS idx_resume_match_scores_user;
DROP INDEX IF EXISTS idx_role_feature_access_role;
DROP INDEX IF EXISTS scorecard_submissions_interview_idx;
DROP INDEX IF EXISTS screening_requests_token_idx;
DROP INDEX IF EXISTS sms_user_idx;
DROP INDEX IF EXISTS idx_studio_project_publications_project;
DROP INDEX IF EXISTS idx_studio_project_subjects_project;
DROP INDEX IF EXISTS idx_review_comments_project;
DROP INDEX IF EXISTS idx_studio_templates_slug;
DROP INDEX IF EXISTS idx_studio_voice_clone_licenses_user;
DROP INDEX IF EXISTS idx_studio_voice_clones_slug;
DROP INDEX IF EXISTS idx_template_licenses_user;
DROP INDEX IF EXISTS usage_invoices_user_idx;
DROP INDEX IF EXISTS usage_statements_user_idx;
DROP INDEX IF EXISTS idx_async_interviews_token;
