/**
 * Retention policy table — the data half of the generic retention sweep
 * (services/maintenance/retention-sweep.ts holds the runner + SQL builder).
 * Split out so the table can grow without pushing the runner past the file
 * size budget; retention-sweep.ts re-exports both names, so callers keep
 * importing from there.
 *
 * Adding a row here is a load-bearing change: review the table's audit
 * + product semantics before extending (see the header of retention-sweep.ts
 * for the tables that are deliberately excluded).
 */

import { SHARE_LINK_ORPHAN_SQL } from "../../db/schema/shareLinks.js";

export interface RetentionPolicy {
  /** Postgres table name (NOT the Drizzle TS export name). */
  table: string;
  /** Timestamptz column(s) used as the "age" axis. created_at for
   *  append-only logs, updated_at / last_hit_at for LRU caches. With more
   *  than one column a row is expired when ANY of them is past the window
   *  (NULLs never match) — e.g. sessions: revoked OR expired long ago. */
  ageColumns: readonly string[];
  /** Rows older than this many days are deleted. */
  retentionDays: number;
  /** Optional static SQL predicate ANDed with the age test — scopes the
   *  policy to a slice of the table (e.g. guest users only). Literal from
   *  this file only; never user input. Correlated subqueries refer to the
   *  swept row by the bare table name (the batch's inner SELECT is
   *  unaliased) and must alias every table they read. */
  scope?: string;
  /** Rows deleted per DELETE statement. Bounds any single statement
   *  (lock duration, WAL burst, neon-http response time); the runner
   *  issues as many batches as the time budget allows. */
  batchSize: number;
}

/**
 * Recruiter agent runs that are safe to age out: terminal, no follow-up
 * still waiting to send (recruiter_agent_followups.run_id cascades, so
 * deleting the run would silently drop the scheduled message), and — for a
 * completed run tied to a job — superseded by a newer completed run for
 * the same recruiter + job, because live-screen auto-match reads the
 * LATEST completed run per job (findLatestCompletedAgentRunForJob) with no
 * age limit.
 */
export const RECRUITER_AGENT_RUN_RETENTION_SCOPE =
  "status IN ('completed', 'failed')" +
  " AND NOT EXISTS (SELECT 1 FROM recruiter_agent_followups f" +
  " WHERE f.run_id = recruiter_agent_runs.id AND f.status = 'pending')" +
  " AND (status <> 'completed' OR job_id IS NULL OR EXISTS (" +
  "SELECT 1 FROM recruiter_agent_runs newer" +
  " WHERE newer.recruiter_id = recruiter_agent_runs.recruiter_id" +
  " AND newer.job_id = recruiter_agent_runs.job_id" +
  " AND newer.status = 'completed'" +
  " AND newer.completed_at > recruiter_agent_runs.completed_at))";

/**
 * Ended impersonation sessions that no admin_audit_log row still points at.
 * admin_audit_log.impersonation_session_id is a NO ACTION FK, so deleting a
 * referenced session would fail the whole batch; the audit row's own
 * 365-day policy releases the session first.
 */
export const IMPERSONATION_SESSION_RETENTION_SCOPE =
  "NOT EXISTS (SELECT 1 FROM admin_audit_log a" +
  " WHERE a.impersonation_session_id = impersonation_sessions.id)";

/**
 * Single source of truth for retention windows. Justifications inline.
 *
 * Every single-column `ageColumns` entry needs an index leading with that
 * column (migrations 0495 + 0652 added the missing ones) — the batch's
 * ORDER BY … LIMIT must be an index range scan, not a full-table sort.
 * A scoped policy's index may be partial with the scope as its predicate.
 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  // AI scratchpad + tool history — users can re-run; 90 days covers the
  // "look up what I did last quarter" use case.
  // Tool runs made in a studio session (studio_project_id set, mig 0510)
  // live as long as the session — FK cascade removes them with it.
  { table: "tool_runs",         ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000, scope: "studio_project_id IS NULL" },
  { table: "ai_chat_messages",  ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Vendor API call logs — operational telemetry; 30 days for debugging
  // recent failures, beyond that it's just storage cost.
  { table: "profile_sync_runs", ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "worker_runs",       ageColumns: ["started_at"], retentionDays: 30, batchSize: 5000 },

  // Request-level telemetry — 30 days matches typical Worker log retention.
  { table: "request_logs",      ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "activity_logs",     ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Extension session/event telemetry. Sessions are LRU (`updated_at`)
  // so an active reconnect resets the clock; events use creation time.
  { table: "extension_sessions", ageColumns: ["updated_at"], retentionDays: 14, batchSize: 5000 },
  { table: "extension_events",   ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },

  // Mapbox geocoder cache is a true LRU — eviction by last_hit_at, not
  // creation date. A row that's still being hit weekly stays forever.
  { table: "geocoder_cache",     ageColumns: ["last_hit_at"], retentionDays: 90, batchSize: 5000 },

  // Notifications — once a user has dismissed an old notification or
  // the platform-wide retention window passes, drop. 90 days matches
  // the "unread badge would have been seen by now" assumption. Stale
  // unread notifications also drop so the table stays bounded — if
  // the user hasn't read it in 90 days, the notification is dead.
  { table: "notifications",      ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Auth sessions (services/auth/sessions.ts) — every login, refresh
  // rotation and revoke leaves a row behind and nothing ever deleted them.
  // A row is dead once it was revoked or passed its absolute expiry; the
  // 30-day grace keeps recently revoked/rotated rows for the device list
  // and refresh-token reuse forensics. Live sessions (revoked_at NULL,
  // expires_at in the future) can never match.
  { table: "sessions",           ageColumns: ["revoked_at", "expires_at"], retentionDays: 30, batchSize: 5000 },

  // admin_audit_log — 365d (SOC 2 floor for admin-action retention).
  // Beyond a year, the row is unlikely to be referenced by an active
  // compliance review. #1613 deferred the cold-storage archive path —
  // when that lands, this retention becomes "delete after S3 export
  // confirms." Today it's a straight delete.
  { table: "admin_audit_log",    ageColumns: ["created_at"], retentionDays: 365, batchSize: 5000 },

  // Unclaimed guest accounts (mig 0496) — a signed-out visitor's silent
  // identity. The guest JWT lives 30 days (GUEST_TOKEN_TTL); after that
  // nobody can sign back into it, so the account and everything it owns
  // (FK cascade) is dead. Claimed guests are deleted at adoption.
  { table: "users",              ageColumns: ["created_at"], retentionDays: 30, batchSize: 500, scope: "is_guest" },

  // First-party usage analytics (mig 0490s). The longest /admin/insights
  // traffic window is 90 days (shared/usage.ts TRAFFIC_WINDOW_DAYS), so 95
  // keeps every window whole. Sessions are LRU by last_seen (deleting one
  // cascades its events); long-lived visitor sessions keep only recent events.
  { table: "usage_events",       ageColumns: ["occurred_at"], retentionDays: 95, batchSize: 5000 },
  { table: "usage_sessions",     ageColumns: ["last_seen"],   retentionDays: 95, batchSize: 2000 },

  // Raw job/company listing-traffic events (artifact_views event_type
  // 'listing_view'; were job_view_events / company_view_events until W3-A
  // 0580) — every reader windows them to 30 days
  // (repositories/listingViewsRepository.ts) and no counter cache is
  // recomputed from them, so 180 days is pure headroom. Only that stream is
  // swept; idx_artifact_views_event_viewed backs the scoped age scan.
  { table: "artifact_views",     ageColumns: ["viewed_at"], retentionDays: 180, batchSize: 5000, scope: "event_type = 'listing_view'" },

  // Security telemetry. bot_block_events backs the 7/30-day admin
  // security charts; login_events backs brute-force / risk windows (hours
  // to days) and the per-user sign-in history.
  { table: "bot_block_events",   ageColumns: ["created_at"], retentionDays: 30,  batchSize: 5000 },
  { table: "login_events",       ageColumns: ["created_at"], retentionDays: 180, batchSize: 5000 },

  // One-time auth tokens/codes of every purpose (auth_tokens, W3-B 0591) —
  // dead the moment they expire (every row carries an expiry; used rows
  // expire too). One day of grace keeps a just-expired link explainable in
  // support. idx_auth_tokens_expires backs the age scan.
  { table: "auth_tokens",               ageColumns: ["expires_at"], retentionDays: 1, batchSize: 5000 },

  // Share links whose subject is gone (W3-A, mig 0583). share_links is
  // polymorphic, so the per-kind FK cascades the six old tables had (deck,
  // résumé, job, project, owner deleted → links deleted) are done
  // immediately by AFTER DELETE triggers on each subject table (mig 0650);
  // this policy is only the backstop for anything a trigger missed.
  // retentionDays 0 = any age; the scope is the whole test. The table is
  // small (one row per link a person minted) — no created_at index needed.
  { table: "share_links",       ageColumns: ["created_at"], retentionDays: 0, batchSize: 1000, scope: SHARE_LINK_ORPHAN_SQL },

  // ── Write-heavy logs added 2026-10-17 (indexes: mig 0652) ──────────────

  // Per-view watch heatmaps (#122). Readers sample the latest 500 views per
  // project (services/studio/video-heatmap.ts MAX_VIEWS) for the heatmap
  // summary + hook-optimizer diagnosis; nothing totals the raw rows for a
  // lifetime count (view totals live in artifact_views 'video'). 180 days
  // keeps a long-running video's sample well inside the window.
  { table: "studio_video_heatmap",     ageColumns: ["created_at"], retentionDays: 180, batchSize: 2000 },

  // Enrichment vendor call audit (services/enrichment) — write-only debug /
  // cost telemetry; no quota or credit window reads it back.
  { table: "enrichment_provider_calls", ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Recruiter sourcing-agent runs — 90 days, but only runs nothing still
  // depends on (see RECRUITER_AGENT_RUN_RETENTION_SCOPE). Stuck
  // pending/running rows are left alone.
  { table: "recruiter_agent_runs",     ageColumns: ["created_at"], retentionDays: 90, batchSize: 1000, scope: RECRUITER_AGENT_RUN_RETENTION_SCOPE },

  // Inbox L2 action audit rows. Read only as the "recent runs" list; the
  // (message_id, action_id) unique key is audit dedupe for re-posted chunks,
  // which happen within minutes — the dispatcher never consults old runs.
  { table: "inbox_action_runs",        ageColumns: ["created_at"], retentionDays: 90, batchSize: 5000 },

  // Sync-run ledgers — operational telemetry like profile_sync_runs.
  //   - email_sync_runs: the Sync History sheet lists the latest 10; the
  //     session-id unique key only dedupes chunk retries within one sync.
  //   - paid_media_sync_runs: the (platform, idempotency_key) key pairs a
  //     pending async report ('report:<id>') with its finisher
  //     ('report-done:<id>'). The pending row is always older, so the
  //     oldest-first sweep removes it no later than its finisher and a
  //     finished report can never reopen.
  //   - job_board_sync_log: per-source history list (latest N).
  { table: "email_sync_runs",          ageColumns: ["started_at"], retentionDays: 30, batchSize: 5000 },
  { table: "paid_media_sync_runs",     ageColumns: ["created_at"], retentionDays: 30, batchSize: 5000 },
  { table: "job_board_sync_log",       ageColumns: ["started_at"], retentionDays: 30, batchSize: 5000 },

  // Account locks released 30+ days ago (services/auth/lock.ts flips
  // active=false + stamps unlocked_at on unlock, including the lazy unlock
  // of an expired brute-force lock). active=true rows — permanent or still
  // timed — never match the scope.
  { table: "account_locks",            ageColumns: ["unlocked_at"], retentionDays: 30, batchSize: 5000, scope: "active = false" },

  // Email-change requests live 1 hour (REQUEST_TTL_MS); consumed ones expire
  // too. 30 days past expiry, every row is dead — a pending request still
  // inside its TTL can never match.
  { table: "email_change_requests",    ageColumns: ["expires_at"], retentionDays: 30, batchSize: 5000 },

  // Ended SuperAdmin impersonation sessions. An admin action, so 365 days
  // to match admin_audit_log's SOC 2 floor (not 180); ended_at IS NULL rows
  // never match the age test. Role switches cascade.
  { table: "impersonation_sessions",   ageColumns: ["ended_at"], retentionDays: 365, batchSize: 1000, scope: IMPERSONATION_SESSION_RETENTION_SCOPE },

  // Finished work-queue rows. Only terminal statuses: queue_job_to_process
  // is pending → processing → completed | failed (exhausted retries);
  // social_publish_jobs failed | cancelled | expired. updated_at is the
  // terminal transition time (cancelled agent drafts and expired drafts
  // carry no completed_at). social 'done' is NOT swept: done rows are the
  // agent's clip history (listAgentClipHistory — no re-posting the same
  // clip), the hub's post history and the pre-0526 poster fallback. Failed /
  // cancelled jobs can be retried from the hub; 30 days is the retry window.
  { table: "queue_job_to_process",     ageColumns: ["updated_at"], retentionDays: 30, batchSize: 5000, scope: "status IN ('completed', 'failed')" },
  { table: "social_publish_jobs",      ageColumns: ["updated_at"], retentionDays: 30, batchSize: 2000, scope: "status IN ('failed', 'cancelled', 'expired')" },

  // Deliberately NOT here (W1-B review, 2026-10-17):
  //   - artifact_views streams other than listing_view: lifetime counts
  //     are computed by COUNT(*) over the raw rows (profile totalViews,
  //     resume / company view counts, studio CTA counts, and
  //     counter-recompute's articles.view_count), so pruning would silently
  //     shrink them. They need a lifetime rollup column first.
  //   - article_engagement: already the per-(article, day) rollup that the
  //     partner pool + engagement payout read.
  //   - job_items: the scraper never deactivates or expires the rows it
  //     inserts, so an "inactive scraped job" policy would match nothing;
  //     it needs a scraper-side expiry first.
  //   - xAPI / LRS statements: learning records.
  //   - affiliate_link_clicks: the affiliate dashboard's click total and
  //     conversion rate are COUNT(*) over every click
  //     (affiliatesRepository.countClicks), and signup attribution back-links
  //     unconverted clicks with no age bound — pruning would shrink the
  //     lifetime total and inflate the conversion rate. Needs a lifetime
  //     click counter first.
  //   - message_read_receipts: the receipt IS the read state — deleting one
  //     flips an old message back to unread (unread badges, "seen" ticks).
] as const;
