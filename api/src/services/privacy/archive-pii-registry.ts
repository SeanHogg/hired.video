/**
 * Archive erasure registry — every archived table that holds per-user data,
 * and how its rows link to a user. "Archived" means moved into the `archive`
 * schema, or (pre-Wave-3) renamed to `public.*_archived` (entries with
 * `schema: "public"`).
 *
 * Wave 3 migrations are archive-first: legacy tables move with
 * `ALTER TABLE … SET SCHEMA archive` and dropped columns are copied into
 * `archive.*_NNNN` tables. Those copies still hold personal data, so the
 * account-erasure path (`eraseArchivedUserData`, called from `deleteAccount`)
 * walks this list and deletes the leaving user's rows from each one.
 *
 * Guard: src/db/__tests__/archive-pii-registry.test.ts parses
 * api/drizzle/*.sql and fails when an archive table is in neither list below,
 * or when a user-id-shaped column is not covered. A new archive migration
 * must add its tables here (or to ARCHIVE_TABLES_WITHOUT_USER_DATA).
 *
 * Order matters: an entry whose `via` parent is another archive table must
 * come BEFORE that parent, so the parent rows still exist when the child is
 * matched through them (the test enforces this).
 */

/** Link through a parent table: rows whose `column` is the `parentKey` of a
 *  parent row owned by the user (any of `parentUserColumns` = user id). */
export interface ArchivePiiVia {
  readonly column: string;
  readonly parentSchema: "public" | "archive";
  readonly parentTable: string;
  readonly parentKey: string;
  readonly parentUserColumns: readonly string[];
}

export interface ArchivePiiEntry {
  /** Table name; lives in `archive` unless `schema` says otherwise. */
  readonly table: string;
  /** Default "archive"; "public" only for renamed `*_archived` tables. */
  readonly schema?: "archive" | "public";
  /** Columns holding a users.id directly; a row matches if ANY equals the user. */
  readonly userColumns: readonly string[];
  /** Columns holding the deleting user's OWN email address (author / account
   *  owner — never a recipient someone else typed); matched case-insensitively
   *  against the email read before the users row is anonymized. */
  readonly emailColumns?: readonly string[];
  /** Indirect links for tables whose user is only reachable via a parent. */
  readonly via?: readonly ArchivePiiVia[];
}

const TALENT_POOL_CANDIDATE: Omit<ArchivePiiVia, "column"> = {
  parentSchema: "public",
  parentTable: "talent_pool_candidates",
  parentKey: "id",
  parentUserColumns: ["candidate_id"],
};

export const ARCHIVE_PII_REGISTRY: readonly ArchivePiiEntry[] = [
  // 0545 — orphan tables
  { table: "role_permission_overrides", userColumns: ["created_by"] },
  { table: "profile_views", userColumns: ["viewed_user_id", "viewer_user_id"] },
  { table: "user_engagement_metrics", userColumns: ["user_id"] },
  { table: "usage_records", userColumns: ["user_id"] },
  {
    table: "email_push_subscriptions",
    userColumns: [],
    via: [{ column: "account_id", parentSchema: "archive", parentTable: "external_email_accounts", parentKey: "id", parentUserColumns: ["user_id"] }],
  },
  { table: "integration_runs", userColumns: ["user_id"] },
  {
    table: "application_notes",
    userColumns: ["author_id"],
    via: [{ column: "application_id", parentSchema: "public", parentTable: "job_applications", parentKey: "id", parentUserColumns: ["user_id"] }],
  },
  { table: "paid_media_audiences", userColumns: ["user_id"] },
  { table: "queue_job_to_resume", userColumns: ["user_id"] },
  { table: "recruiter_talent_pools", userColumns: ["recruiter_id"] },

  // 0585 — legacy view tables
  { table: "resume_views", userColumns: ["viewer_id"] },
  { table: "company_views", userColumns: ["viewer_id"] },
  { table: "job_view_events", userColumns: ["viewer_user_id"] },
  { table: "company_view_events", userColumns: ["viewer_user_id"] },
  { table: "video_analytics", userColumns: ["user_id"] },

  // 0586 — comments
  { table: "booking_comments", userColumns: ["author_user_id"] },
  { table: "feed_post_comments", userColumns: ["user_id"] },
  { table: "review_comments", userColumns: ["user_id"] },
  // Guest comments have no author_user_id — only the author's own email.
  { table: "studio_review_comments", userColumns: ["author_user_id"], emailColumns: ["author_email"] },

  // 0587 — reactions
  { table: "feed_post_likes", userColumns: ["user_id"] },
  { table: "feed_comment_reactions", userColumns: ["user_id"] },
  { table: "article_claps", userColumns: ["user_id"] },

  // 0588 — shares
  { table: "candidate_resume_shares", userColumns: ["shared_by_user_id"] },
  { table: "pitch_deck_shares", userColumns: ["shared_by_user_id"] },
  { table: "pipeline_share_links", userColumns: ["created_by_user_id"] },
  { table: "studio_review_links", userColumns: ["user_id"] },
  { table: "reference_shares", userColumns: ["owner_user_id"] },
  { table: "game_play_invites", userColumns: ["created_by", "restrict_to_user_id"] },

  // 0589 — reports
  { table: "feed_post_reports", userColumns: ["user_id"] },

  // 0590 / 0595 — wallets (W3-B). The snapshot's owner_id is a user id or a
  // company id; matching it against a user id only ever hits that user's rows.
  { table: "wallet_backfill_0590", userColumns: ["owner_id"] },
  { table: "user_token_balance", userColumns: ["user_id"] },
  { table: "enrichment_credits", userColumns: ["user_id"] },
  { table: "enrichment_transactions", userColumns: ["user_id"] },
  { table: "campaign_dollars_balance", userColumns: ["user_id"] },
  { table: "campaign_dollars_transactions", userColumns: ["user_id"] },
  { table: "partner_program_balances", userColumns: ["user_id"] },
  { table: "user_points_balance", userColumns: ["user_id", "suspended_by"] },
  { table: "points_ledger", userColumns: ["user_id"] },
  { table: "phone_balances", userColumns: ["user_id"] },
  { table: "phone_balance_transactions", userColumns: ["user_id"] },

  // 0595 — one-time auth tokens + per-user settings (W3-B)
  { table: "two_factor_codes", userColumns: ["user_id"] },
  { table: "email_verification_tokens", userColumns: ["user_id"] },
  { table: "password_reset_tokens", userColumns: ["user_id"] },
  { table: "magic_link_tokens", userColumns: [], emailColumns: ["email"] },
  { table: "account_preferences", userColumns: ["user_id"] },
  { table: "privacy_preferences", userColumns: ["user_id"] },
  { table: "cookie_preferences", userColumns: ["user_id"] },

  // 0601 — provider connections (OAuth tokens)
  { table: "oauth_accounts", userColumns: ["user_id"], emailColumns: ["email"] },
  { table: "calendar_connections", userColumns: ["user_id"] },
  { table: "youtube_accounts", userColumns: ["user_id"], emailColumns: ["email"] },
  { table: "lms_connectors", userColumns: ["user_id"] },
  { table: "company_integrations", userColumns: ["connected_by_user_id"] },
  { table: "tenant_integrations", userColumns: ["user_id"] },
  { table: "paid_media_connections", userColumns: ["user_id"] },
  { table: "social_connections", userColumns: ["user_id"] },
  { table: "managed_accounts", userColumns: ["connected_by_user_id"] },
  // After email_push_subscriptions, which is matched through it.
  { table: "external_email_accounts", userColumns: ["user_id"], emailColumns: ["account_email"] },

  // 0611 — studio project legacy state (document/résumé content)
  {
    table: "studio_projects_legacy_state",
    userColumns: [],
    via: [{ column: "project_id", parentSchema: "public", parentTable: "studio_projects", parentKey: "id", parentUserColumns: ["user_id"] }],
  },

  // 0622 — saved_jobs lifecycle columns
  { table: "saved_jobs_lifecycle_0622", userColumns: ["user_id"] },

  // 0623 — copied identity columns
  { table: "placements_recruiter_name_0623", userColumns: ["recruiter_id"] },
  {
    table: "recruiter_match_scores_names_0623",
    userColumns: [],
    via: [
      { column: "id", parentSchema: "public", parentTable: "recruiter_match_scores", parentKey: "id", parentUserColumns: ["recruiter_id"] },
      { column: "candidate_id", ...TALENT_POOL_CANDIDATE },
    ],
  },

  // 0625 — recruiter lists (members before their list)
  {
    table: "recruiter_list_members",
    userColumns: [],
    via: [
      { column: "list_id", parentSchema: "archive", parentTable: "recruiter_lists", parentKey: "id", parentUserColumns: ["recruiter_id"] },
      { column: "talent_pool_candidate_id", ...TALENT_POOL_CANDIDATE },
    ],
  },
  { table: "recruiter_lists", userColumns: ["recruiter_id"] },

  // 0630 — role single store
  { table: "user_roles", userColumns: ["user_id"] },
  { table: "users_role_pre_0630", userColumns: ["user_id"] },

  // 0632 — legacy profile columns
  { table: "user_profiles_legacy_0632", userColumns: ["user_id"] },
  { table: "job_preferences_legacy_0632", userColumns: ["user_id"] },
  { table: "users_persona_0632", userColumns: ["user_id"] },

  // 0635 — performance goals / reviews
  { table: "performance_goals", userColumns: ["user_id"] },
  { table: "performance_reviews", userColumns: ["reviewee_user_id", "reviewer_user_id"] },

  // 0637 — recruiter outreach
  {
    table: "recruiter_outreach_enrollments",
    userColumns: ["recruiter_id"],
    via: [{ column: "talent_pool_candidate_id", ...TALENT_POOL_CANDIDATE }],
  },
  { table: "recruiter_outreach_sequences", userColumns: ["recruiter_id"] },

  // 0641 — version tables
  { table: "resume_versions", userColumns: ["user_id", "proposed_by_user_id"] },
  { table: "article_versions", userColumns: ["user_id"] },
  { table: "studio_project_versions", userColumns: ["user_id"] },

  // 0482 — orphaned shadow report table, renamed in place (not moved to archive)
  { table: "content_reports_v2_archived", schema: "public", userColumns: ["reporter_user_id", "resolved_by_user_id"] },
];

/** Email columns on archived tables that do NOT hold the deleting user's own
 *  address ("table.column" → why). The row is still erased through the
 *  table's user link (the sharer); the guard test requires every email-shaped
 *  column to be either an `emailColumns` entry or reviewed here. */
export const ARCHIVE_EMAIL_COLUMNS_NOT_THE_USER: Readonly<Record<string, string>> = {
  "candidate_resume_shares.recipient_email": "address the sharer typed for a recipient; row erased via shared_by_user_id",
  "pitch_deck_shares.recipient_email": "address the sharer typed for a recipient; row erased via shared_by_user_id",
  "reference_shares.shared_with_email": "address the owner typed for a recipient; row erased via owner_user_id",
  "privacy_preferences.show_email": "boolean visibility flag (show my email on my profile), not an email address",
};

/** Archive tables reviewed and found to hold no per-user data (table → why).
 *  Erasure leaves them alone; the guard test still requires every archive
 *  table to be classified in one of the two lists. */
export const ARCHIVE_TABLES_WITHOUT_USER_DATA: Readonly<Record<string, string>> = {
  dashboard_metrics: "platform-wide metric aggregates (metric_key/value/period)",
  workspace_compliance_policy: "per-workspace (company) policy settings",
  workspace_email_safety_policy: "per-workspace (company) email tier settings",
  integration_credentials: "platform integration env-var names, keyed by integration_id",
  job_websites: "reference data: scraped job sites",
  postal_zip_codes: "reference data: postal codes",
  job_boards: "reference data: job boards",
  feature_flags: "platform feature flags",
  ats_connections: "company-scoped ATS credentials (company_id only)",
  roles: "role catalog (name/description)",
  company_token_balance: "company-scoped AI token pool (company_id only; 0595)",
};
