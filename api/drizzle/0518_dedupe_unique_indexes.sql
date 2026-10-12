-- 0518_dedupe_unique_indexes.sql — gap #2305.
--
-- !! OWNER-GATED (plan decision D2). Do not let CI apply this file until the
-- !! owner has run the duplicate audit against production and approved the
-- !! resolutions below (some DELETE pure-duplicate rows).
--
-- 29 legacy UNIQUE indexes existed only in SQL migrations, so
-- `drizzle-kit push --force` dropped them and duplicates may have accumulated.
-- For each index: resolve every duplicate except the kept row (per-table rule),
-- then CREATE UNIQUE INDEX IF NOT EXISTS with the original definition. Every
-- index is also declared in api/src/db/schema/* under the same name so push
-- keeps it afterwards.
--
-- GENERATED from api/scripts/unique-index-registry.mjs via the
-- reconcile-unique-indexes.mjs builders (losersSql / resolveSql /
-- createIndexSql) — the registry is the single source; regenerate rather than
-- hand-edit. Audit query for D2, per entry:
--   node scripts/reconcile-unique-indexes.mjs --dry-run
--
-- Idempotent: once an index exists its key admits no duplicates, so a re-run
-- resolves zero rows and every CREATE is a no-op.

-- uq_account_locks_active_user (account_locks) — keep: locked_at DESC
UPDATE account_locks SET active = false, unlocked_at = COALESCE(unlocked_at, now()) WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY locked_at DESC, id) AS rn
  FROM account_locks WHERE user_id IS NOT NULL AND (active = true)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_locks_active_user ON account_locks (user_id) WHERE active = true;

-- uq_affiliate_referrals_referred_user (affiliate_referrals) — keep: created_at ASC
UPDATE affiliate_referrals SET referred_user_id = NULL WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY referred_user_id ORDER BY created_at ASC, id) AS rn
  FROM affiliate_referrals WHERE referred_user_id IS NOT NULL AND (referred_user_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_referrals_referred_user ON affiliate_referrals (referred_user_id) WHERE referred_user_id IS NOT NULL;

-- uq_assessment_attempts_user_assessment_attempt (assessment_attempts) — keep: created_at ASC
UPDATE assessment_attempts AS t SET attempt_number = m.mx + l.rn
FROM (SELECT id, user_id, assessment_id, row_number() OVER (PARTITION BY user_id, assessment_id ORDER BY created_at, id) AS rn
      FROM assessment_attempts WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id, assessment_id, attempt_number ORDER BY created_at ASC, id) AS rn
  FROM assessment_attempts WHERE user_id IS NOT NULL AND assessment_id IS NOT NULL AND attempt_number IS NOT NULL
) AS ranked WHERE rn > 1)) AS l,
     (SELECT user_id, assessment_id, max(attempt_number) AS mx FROM assessment_attempts GROUP BY user_id, assessment_id) AS m
WHERE t.id = l.id AND t.user_id = m.user_id AND t.assessment_id = m.assessment_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_attempts_user_assessment_attempt ON assessment_attempts (user_id, assessment_id, attempt_number);

-- uniq_assessment_dimension_norms_kind_dim (assessment_dimension_norms) — keep: recomputed_at DESC
DELETE FROM assessment_dimension_norms WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY assessment_kind, dimension ORDER BY recomputed_at DESC, id) AS rn
  FROM assessment_dimension_norms WHERE assessment_kind IS NOT NULL AND dimension IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_dimension_norms_kind_dim ON assessment_dimension_norms (assessment_kind, dimension);

-- uniq_assessment_runs_user_kind_active (assessment_runs) — keep: updated_at DESC
UPDATE assessment_runs SET status = 'abandoned', updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id, assessment_kind ORDER BY updated_at DESC, id) AS rn
  FROM assessment_runs WHERE user_id IS NOT NULL AND assessment_kind IS NOT NULL AND (status IN ('started', 'in_progress'))
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_runs_user_kind_active ON assessment_runs (user_id, assessment_kind) WHERE status IN ('started', 'in_progress');

-- competencies_company_name_unique (competencies) — keep: created_at ASC
UPDATE competencies SET is_archived = true, archived_at = now(), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY company_id, lower(name) ORDER BY created_at ASC, id) AS rn
  FROM competencies WHERE company_id IS NOT NULL AND (is_archived = FALSE)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS competencies_company_name_unique ON competencies (company_id, lower(name)) WHERE is_archived = FALSE;

-- uq_campaign_recipients_campaign_email (email_campaign_recipients) — keep: created_at ASC
DELETE FROM email_campaign_recipients WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY campaign_id, email ORDER BY created_at ASC, id) AS rn
  FROM email_campaign_recipients WHERE campaign_id IS NOT NULL AND email IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_campaign_email ON email_campaign_recipients (campaign_id, email);

-- uq_email_push_subscriptions_account (email_push_subscriptions) — keep: created_at DESC NULLS LAST
DELETE FROM email_push_subscriptions WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY account_id ORDER BY created_at DESC NULLS LAST, id) AS rn
  FROM email_push_subscriptions WHERE account_id IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_push_subscriptions_account ON email_push_subscriptions (account_id);

-- email_sync_runs_session_unq (email_sync_runs) — keep: started_at ASC
UPDATE email_sync_runs SET sync_session_id = NULL WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY account_id, sync_session_id ORDER BY started_at ASC, id) AS rn
  FROM email_sync_runs WHERE account_id IS NOT NULL AND sync_session_id IS NOT NULL AND (sync_session_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS email_sync_runs_session_unq ON email_sync_runs (account_id, sync_session_id) WHERE sync_session_id IS NOT NULL;

-- uniq_invoices_source_timesheet (invoices) — keep: created_at ASC
UPDATE invoices SET source_timesheet_id = NULL, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY source_timesheet_id ORDER BY created_at ASC, id) AS rn
  FROM invoices WHERE source_timesheet_id IS NOT NULL AND (source_timesheet_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_source_timesheet ON invoices (source_timesheet_id) WHERE source_timesheet_id IS NOT NULL;

-- lists_owner_wishlist_unique_idx (lists) — keep: created_at ASC NULLS LAST
UPDATE lists SET kind = 'custom', updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY owner_user_id ORDER BY created_at ASC NULLS LAST, id) AS rn
  FROM lists WHERE owner_user_id IS NOT NULL AND (kind = 'wishlist')
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS lists_owner_wishlist_unique_idx ON lists (owner_user_id) WHERE kind = 'wishlist';

-- uniq_live_screening_invites_session_candidate (live_screening_invites) — keep: created_at ASC
UPDATE live_screening_invites SET candidate_id = NULL, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY session_id, candidate_id ORDER BY created_at ASC, id) AS rn
  FROM live_screening_invites WHERE session_id IS NOT NULL AND candidate_id IS NOT NULL AND (candidate_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_screening_invites_session_candidate ON live_screening_invites (session_id, candidate_id) WHERE candidate_id IS NOT NULL;

-- uq_oauth_accounts_provider_account (oauth_accounts) — keep: created_at ASC
DELETE FROM oauth_accounts WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY provider, provider_account_id ORDER BY created_at ASC, id) AS rn
  FROM oauth_accounts WHERE provider IS NOT NULL AND provider_account_id IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_accounts_provider_account ON oauth_accounts (provider, provider_account_id);

-- uq_partner_program_opt_ins_active_per_user (partner_program_opt_ins) — keep: created_at DESC
UPDATE partner_program_opt_ins SET is_active = false, deactivated_at = now(), deactivated_reason = 'duplicate_active_reconciled' WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id) AS rn
  FROM partner_program_opt_ins WHERE user_id IS NOT NULL AND (is_active = TRUE)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_program_opt_ins_active_per_user ON partner_program_opt_ins (user_id) WHERE is_active = TRUE;

-- uq_placement_notif_subs_placement_user_event (placement_notification_subscriptions) — keep: created_at ASC
DELETE FROM placement_notification_subscriptions WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY placement_id, user_id, event ORDER BY created_at ASC, id) AS rn
  FROM placement_notification_subscriptions WHERE placement_id IS NOT NULL AND user_id IS NOT NULL AND event IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_notif_subs_placement_user_event ON placement_notification_subscriptions (placement_id, user_id, event);

-- uq_region_waitlist_email_pending (region_waitlist) — keep: created_at ASC
UPDATE region_waitlist SET status = 'duplicate' WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY email ORDER BY created_at ASC, id) AS rn
  FROM region_waitlist WHERE email IS NOT NULL AND (status = 'pending')
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_region_waitlist_email_pending ON region_waitlist (email) WHERE status = 'pending';

-- uq_resume_templates_listing_slug (resume_templates) — keep: created_at ASC
UPDATE resume_templates SET listing_slug = listing_slug || '-' || left(replace(id::text, '-', ''), 8), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY listing_slug ORDER BY created_at ASC, id) AS rn
  FROM resume_templates WHERE listing_slug IS NOT NULL AND (listing_slug IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_templates_listing_slug ON resume_templates (listing_slug) WHERE listing_slug IS NOT NULL;

-- uq_resume_versions_resume_version (resume_versions) — keep: created_at ASC
UPDATE resume_versions AS t SET version_number = m.mx + l.rn
FROM (SELECT id, resume_id, row_number() OVER (PARTITION BY resume_id ORDER BY created_at, id) AS rn
      FROM resume_versions WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY resume_id, version_number ORDER BY created_at ASC, id) AS rn
  FROM resume_versions WHERE resume_id IS NOT NULL AND version_number IS NOT NULL
) AS ranked WHERE rn > 1)) AS l,
     (SELECT resume_id, max(version_number) AS mx FROM resume_versions GROUP BY resume_id) AS m
WHERE t.id = l.id AND t.resume_id = m.resume_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_versions_resume_version ON resume_versions (resume_id, version_number);

-- uq_scheduled_events_slug (scheduled_events) — keep: created_at ASC
UPDATE scheduled_events SET slug = left(slug, 71) || '-' || left(replace(id::text, '-', ''), 8), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY lower(slug) ORDER BY created_at ASC, id) AS rn
  FROM scheduled_events WHERE slug IS NOT NULL AND (slug IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_events_slug ON scheduled_events (lower(slug)) WHERE slug IS NOT NULL;

-- uq_shared_task_participants_task_user (shared_task_participants) — keep: created_at ASC
DELETE FROM shared_task_participants WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY task_id, user_id ORDER BY created_at ASC, id) AS rn
  FROM shared_task_participants WHERE task_id IS NOT NULL AND user_id IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_task_participants_task_user ON shared_task_participants (task_id, user_id);

-- studio_projects_slug_unique_idx (studio_projects) — keep: created_at ASC
UPDATE studio_projects SET slug = left(slug, 111) || '-' || left(replace(id::text, '-', ''), 8), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY slug ORDER BY created_at ASC, id) AS rn
  FROM studio_projects WHERE slug IS NOT NULL AND (slug IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS studio_projects_slug_unique_idx ON studio_projects (slug) WHERE slug IS NOT NULL;

-- uq_tag_assignments_tag_entity (tag_assignments) — keep: created_at ASC
DELETE FROM tag_assignments WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY tag_id, entity_id ORDER BY created_at ASC, id) AS rn
  FROM tag_assignments WHERE tag_id IS NOT NULL AND entity_id IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_assignments_tag_entity ON tag_assignments (tag_id, entity_id);

-- uq_tasks_gig_milestone (tasks) — keep: created_at ASC
UPDATE tasks SET gig_milestone_id = NULL, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY gig_milestone_id ORDER BY created_at ASC, id) AS rn
  FROM tasks WHERE gig_milestone_id IS NOT NULL AND (gig_milestone_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_gig_milestone ON tasks (gig_milestone_id) WHERE gig_milestone_id IS NOT NULL;

-- uniq_tenant_integrations_company_provider_slug (tenant_integrations) — keep: updated_at DESC NULLS LAST
UPDATE tenant_integrations SET slug = left(slug, 55) || '-' || left(replace(id::text, '-', ''), 8), is_active = false, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id, company_id, provider, slug ORDER BY updated_at DESC NULLS LAST, id) AS rn
  FROM tenant_integrations WHERE user_id IS NOT NULL AND company_id IS NOT NULL AND provider IS NOT NULL AND slug IS NOT NULL AND (company_id IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_integrations_company_provider_slug ON tenant_integrations (user_id, company_id, provider, slug) WHERE company_id IS NOT NULL;

-- uniq_tenant_integrations_personal_provider_slug (tenant_integrations) — keep: updated_at DESC NULLS LAST
UPDATE tenant_integrations SET slug = left(slug, 55) || '-' || left(replace(id::text, '-', ''), 8), is_active = false, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY user_id, provider, slug ORDER BY updated_at DESC NULLS LAST, id) AS rn
  FROM tenant_integrations WHERE user_id IS NOT NULL AND provider IS NOT NULL AND slug IS NOT NULL AND (company_id IS NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_integrations_personal_provider_slug ON tenant_integrations (user_id, provider, slug) WHERE company_id IS NULL;

-- uq_users_resume_forwarding_slug (users) — keep: created_at ASC
UPDATE users SET resume_forwarding_slug = NULL, updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY lower((resume_forwarding_slug)::text) ORDER BY created_at ASC, id) AS rn
  FROM users WHERE resume_forwarding_slug IS NOT NULL AND (resume_forwarding_slug IS NOT NULL)
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_resume_forwarding_slug ON users (lower((resume_forwarding_slug)::text)) WHERE resume_forwarding_slug IS NOT NULL;

-- uq_workspace_job_types_workspace_slug (workspace_job_types) — keep: created_at ASC
UPDATE workspace_job_types SET slug = left(slug, 39) || '-' || left(replace(id::text, '-', ''), 8), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY workspace_id, slug ORDER BY created_at ASC, id) AS rn
  FROM workspace_job_types WHERE workspace_id IS NOT NULL AND slug IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_job_types_workspace_slug ON workspace_job_types (workspace_id, slug);

-- uq_workspace_sources_workspace_slug (workspace_sources) — keep: created_at ASC
UPDATE workspace_sources SET slug = left(slug, 39) || '-' || left(replace(id::text, '-', ''), 8) WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY workspace_id, slug ORDER BY created_at ASC, id) AS rn
  FROM workspace_sources WHERE workspace_id IS NOT NULL AND slug IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_sources_workspace_slug ON workspace_sources (workspace_id, slug);

-- uq_workspace_tags_workspace_axis_name (workspace_tags) — keep: created_at ASC
UPDATE workspace_tags SET name = left(name, 55) || '-' || left(replace(id::text, '-', ''), 8), updated_at = now() WHERE id IN (SELECT id FROM (
  SELECT id, row_number() OVER (PARTITION BY workspace_id, axis, lower(name) ORDER BY created_at ASC, id) AS rn
  FROM workspace_tags WHERE workspace_id IS NOT NULL AND axis IS NOT NULL AND name IS NOT NULL
) AS ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_tags_workspace_axis_name ON workspace_tags (workspace_id, axis, lower(name));
