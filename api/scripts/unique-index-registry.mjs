/**
 * Legacy UNIQUE indexes that were created only by SQL migrations (gap #2305).
 *
 * `drizzle-kit push --force` drops every index a schema table doesn't
 * declare, and the SQL runner never re-applies a migration, so these may be
 * missing in a deployed DB — and duplicate rows may have accumulated while
 * they were gone. `reconcile-unique-indexes.mjs` runs before push: for each
 * entry it resolves duplicates, then creates the index if missing. Every
 * entry is ALSO declared in src/db/schema/* under the same name so push keeps
 * it afterwards.
 *
 * Entry contract (pure data — no user input reaches this SQL):
 *   name      index name (must match the schema declaration)
 *   table     table name
 *   columns   the index key list, verbatim SQL (expressions allowed)
 *   where     partial-index predicate, or null
 *   keyNotNull  columns that must be non-null for a row to be able to
 *             conflict (Postgres treats NULLs as distinct, so rows with a NULL
 *             key never collide — and must not be "resolved")
 *   keep      ORDER BY for the partition: the FIRST row is kept
 *   resolve   SQL applied to the losing rows; `{losers}` expands to a
 *             subquery returning their ids. Prefer non-destructive
 *             resolutions (deactivate / unlink / rename / renumber); DELETE
 *             only rows that are pure duplicates with no unique content.
 *
 * Deliberately NOT listed (no action needed):
 *   uq_email_marketing_prefs_token  — duplicates the schema's `.unique()` on token
 *   uq_live_screening_invites_token — duplicates uniq_live_screening_invites_token
 *   uq_users_provider_customer_id   — column no longer exists in the schema
 */

/** `col` → `left(col, maxLen-9) || '-' || <8 hex chars of id>`: unique per row. */
function suffixWithId(col, maxLen) {
  return `${col} = left(${col}, ${maxLen - 9}) || '-' || left(replace(id::text, '-', ''), 8)`;
}

/** Renumber losers above the group's current max so no value collides. */
function renumber(table, col, groupCols) {
  const g = groupCols.join(", ");
  const join = groupCols.map((c) => `t.${c} = m.${c}`).join(" AND ");
  return `UPDATE ${table} AS t SET ${col} = m.mx + l.rn
FROM (SELECT id, ${g}, row_number() OVER (PARTITION BY ${g} ORDER BY created_at, id) AS rn
      FROM ${table} WHERE id IN ({losers})) AS l,
     (SELECT ${g}, max(${col}) AS mx FROM ${table} GROUP BY ${g}) AS m
WHERE t.id = l.id AND ${join}`;
}

export const LEGACY_UNIQUE_INDEXES = Object.freeze([
  {
    name: "uq_account_locks_active_user",
    table: "account_locks",
    columns: "user_id",
    where: "active = true",
    keyNotNull: ["user_id"],
    keep: "locked_at DESC",
    resolve: "UPDATE account_locks SET active = false, unlocked_at = COALESCE(unlocked_at, now()) WHERE id IN ({losers})",
  },
  {
    // First-touch attribution wins; later rows keep their history but drop the link.
    name: "uq_affiliate_referrals_referred_user",
    table: "affiliate_referrals",
    columns: "referred_user_id",
    where: "referred_user_id IS NOT NULL",
    keyNotNull: ["referred_user_id"],
    keep: "created_at ASC",
    resolve: "UPDATE affiliate_referrals SET referred_user_id = NULL WHERE id IN ({losers})",
  },
  {
    name: "uq_assessment_attempts_user_assessment_attempt",
    table: "assessment_attempts",
    columns: "user_id, assessment_id, attempt_number",
    where: null,
    keyNotNull: ["user_id", "assessment_id", "attempt_number"],
    keep: "created_at ASC",
    resolve: renumber("assessment_attempts", "attempt_number", ["user_id", "assessment_id"]),
  },
  {
    // Derived data — the norms worker recomputes it; keep the freshest.
    name: "uniq_assessment_dimension_norms_kind_dim",
    table: "assessment_dimension_norms",
    columns: "assessment_kind, dimension",
    where: null,
    keyNotNull: ["assessment_kind", "dimension"],
    keep: "recomputed_at DESC",
    resolve: "DELETE FROM assessment_dimension_norms WHERE id IN ({losers})",
  },
  {
    name: "uniq_assessment_runs_user_kind_active",
    table: "assessment_runs",
    columns: "user_id, assessment_kind",
    where: "status IN ('started', 'in_progress')",
    keyNotNull: ["user_id", "assessment_kind"],
    keep: "updated_at DESC",
    resolve: "UPDATE assessment_runs SET status = 'abandoned', updated_at = now() WHERE id IN ({losers})",
  },
  {
    name: "competencies_company_name_unique",
    table: "competencies",
    columns: "company_id, lower(name)",
    where: "is_archived = FALSE",
    keyNotNull: ["company_id"],
    keep: "created_at ASC",
    resolve: "UPDATE competencies SET is_archived = true, archived_at = now(), updated_at = now() WHERE id IN ({losers})",
  },
  {
    name: "uq_campaign_recipients_campaign_email",
    table: "email_campaign_recipients",
    columns: "campaign_id, email",
    where: null,
    keyNotNull: ["campaign_id", "email"],
    keep: "created_at ASC",
    resolve: "DELETE FROM email_campaign_recipients WHERE id IN ({losers})",
  },
  {
    name: "email_sync_runs_session_unq",
    table: "email_sync_runs",
    columns: "account_id, sync_session_id",
    where: "sync_session_id IS NOT NULL",
    keyNotNull: ["account_id", "sync_session_id"],
    keep: "started_at ASC",
    resolve: "UPDATE email_sync_runs SET sync_session_id = NULL WHERE id IN ({losers})",
  },
  {
    // Money: never delete an invoice — unlink the duplicate from the timesheet.
    name: "uniq_invoices_source_timesheet",
    table: "invoices",
    columns: "source_timesheet_id",
    where: "source_timesheet_id IS NOT NULL",
    keyNotNull: ["source_timesheet_id"],
    keep: "created_at ASC",
    resolve: "UPDATE invoices SET source_timesheet_id = NULL, updated_at = now() WHERE id IN ({losers})",
  },
  {
    // Extra wishlists become ordinary lists — their items are preserved.
    name: "lists_owner_wishlist_unique_idx",
    table: "lists",
    columns: "owner_user_id",
    where: "kind = 'wishlist'",
    keyNotNull: ["owner_user_id"],
    keep: "created_at ASC NULLS LAST",
    resolve: "UPDATE lists SET kind = 'custom', updated_at = now() WHERE id IN ({losers})",
  },
  {
    name: "uniq_live_screening_invites_session_candidate",
    table: "live_screening_invites",
    columns: "session_id, candidate_id",
    where: "candidate_id IS NOT NULL",
    keyNotNull: ["session_id", "candidate_id"],
    keep: "created_at ASC",
    resolve: "UPDATE live_screening_invites SET candidate_id = NULL, updated_at = now() WHERE id IN ({losers})",
  },
  {
    // One provider identity → one link. Login resolves by this key, so a
    // duplicate is a dead row; keep the first link (the account that has
    // been signing in with it).
    name: "uq_oauth_accounts_provider_account",
    table: "oauth_accounts",
    columns: "provider, provider_account_id",
    where: null,
    keyNotNull: ["provider", "provider_account_id"],
    keep: "created_at ASC",
    resolve: "DELETE FROM oauth_accounts WHERE id IN ({losers})",
  },
  {
    name: "uq_partner_program_opt_ins_active_per_user",
    table: "partner_program_opt_ins",
    columns: "user_id",
    where: "is_active = TRUE",
    keyNotNull: ["user_id"],
    keep: "created_at DESC",
    resolve:
      "UPDATE partner_program_opt_ins SET is_active = false, deactivated_at = now(), deactivated_reason = 'duplicate_active_reconciled' WHERE id IN ({losers})",
  },
  {
    name: "uq_placement_notif_subs_placement_user_event",
    table: "placement_notification_subscriptions",
    columns: "placement_id, user_id, event",
    where: null,
    keyNotNull: ["placement_id", "user_id", "event"],
    keep: "created_at ASC",
    resolve: "DELETE FROM placement_notification_subscriptions WHERE id IN ({losers})",
  },
  {
    name: "uq_region_waitlist_email_pending",
    table: "region_waitlist",
    columns: "email",
    where: "status = 'pending'",
    keyNotNull: ["email"],
    keep: "created_at ASC",
    resolve: "UPDATE region_waitlist SET status = 'duplicate' WHERE id IN ({losers})",
  },
  {
    name: "uq_resume_versions_resume_version",
    table: "resume_versions",
    columns: "resume_id, version_number",
    where: null,
    keyNotNull: ["resume_id", "version_number"],
    keep: "created_at ASC",
    resolve: renumber("resume_versions", "version_number", ["resume_id"]),
  },
  {
    name: "uq_scheduled_events_slug",
    table: "scheduled_events",
    columns: "lower(slug)",
    where: "slug IS NOT NULL",
    keyNotNull: ["slug"],
    keep: "created_at ASC",
    resolve: `UPDATE scheduled_events SET ${suffixWithId("slug", 80)}, updated_at = now() WHERE id IN ({losers})`,
  },
  {
    name: "uq_shared_task_participants_task_user",
    table: "shared_task_participants",
    columns: "task_id, user_id",
    where: null,
    keyNotNull: ["task_id", "user_id"],
    keep: "created_at ASC",
    resolve: "DELETE FROM shared_task_participants WHERE id IN ({losers})",
  },
  {
    name: "uq_tag_assignments_tag_entity",
    table: "tag_assignments",
    columns: "tag_id, entity_id",
    where: null,
    keyNotNull: ["tag_id", "entity_id"],
    keep: "created_at ASC",
    resolve: "DELETE FROM tag_assignments WHERE id IN ({losers})",
  },
  {
    name: "uq_tasks_gig_milestone",
    table: "tasks",
    columns: "gig_milestone_id",
    where: "gig_milestone_id IS NOT NULL",
    keyNotNull: ["gig_milestone_id"],
    keep: "created_at ASC",
    resolve: "UPDATE tasks SET gig_milestone_id = NULL, updated_at = now() WHERE id IN ({losers})",
  },
  {
    // Credentials rows: keep the most recently updated connection active;
    // older duplicates are deactivated and renamed, never deleted.
    name: "uniq_tenant_integrations_company_provider_slug",
    table: "tenant_integrations",
    columns: "user_id, company_id, provider, slug",
    where: "company_id IS NOT NULL",
    keyNotNull: ["user_id", "company_id", "provider", "slug"],
    keep: "updated_at DESC NULLS LAST",
    resolve: `UPDATE tenant_integrations SET ${suffixWithId("slug", 64)}, is_active = false, updated_at = now() WHERE id IN ({losers})`,
  },
  {
    name: "uniq_tenant_integrations_personal_provider_slug",
    table: "tenant_integrations",
    columns: "user_id, provider, slug",
    where: "company_id IS NULL",
    keyNotNull: ["user_id", "provider", "slug"],
    keep: "updated_at DESC NULLS LAST",
    resolve: `UPDATE tenant_integrations SET ${suffixWithId("slug", 64)}, is_active = false, updated_at = now() WHERE id IN ({losers})`,
  },
  {
    // An inbound mail-forwarding address: a renamed slug would silently route
    // mail somewhere new, so the duplicate is cleared and the user re-picks.
    name: "uq_users_resume_forwarding_slug",
    table: "users",
    columns: "lower((resume_forwarding_slug)::text)",
    where: "resume_forwarding_slug IS NOT NULL",
    keyNotNull: ["resume_forwarding_slug"],
    keep: "created_at ASC",
    resolve: "UPDATE users SET resume_forwarding_slug = NULL, updated_at = now() WHERE id IN ({losers})",
  },
  {
    name: "uq_workspace_job_types_workspace_slug",
    table: "workspace_job_types",
    columns: "workspace_id, slug",
    where: null,
    keyNotNull: ["workspace_id", "slug"],
    keep: "created_at ASC",
    resolve: `UPDATE workspace_job_types SET ${suffixWithId("slug", 48)}, updated_at = now() WHERE id IN ({losers})`,
  },
  {
    name: "uq_workspace_sources_workspace_slug",
    table: "workspace_sources",
    columns: "workspace_id, slug",
    where: null,
    keyNotNull: ["workspace_id", "slug"],
    keep: "created_at ASC",
    resolve: `UPDATE workspace_sources SET ${suffixWithId("slug", 48)} WHERE id IN ({losers})`,
  },
  {
    name: "uq_workspace_tags_workspace_axis_name",
    table: "workspace_tags",
    columns: "workspace_id, axis, lower(name)",
    where: null,
    keyNotNull: ["workspace_id", "axis", "name"],
    keep: "created_at ASC",
    resolve: `UPDATE workspace_tags SET ${suffixWithId("name", 64)}, updated_at = now() WHERE id IN ({losers})`,
  },
]);
