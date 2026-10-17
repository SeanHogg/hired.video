import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";



export const talentPoolCandidates = pgTable("talent_pool_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Legacy pool link. `recruiter_talent_pools` was archived in 0545 (no code
   *  read or wrote it); the column is kept, unreferenced, so no row changes. */
  poolId: uuid("pool_id"),
  recruiterId: uuid("recruiter_id").references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateName: varchar("candidate_name", { length: 255 }).default("").notNull(),
  candidateEmail: varchar("candidate_email", { length: 255 }),
  candidateTitle: varchar("candidate_title", { length: 255 }),
  candidateProfilePicture: text("candidate_profile_picture"),
  poolName: varchar("pool_name", { length: 255 }),
  relationshipStrength: varchar("relationship_strength", { length: 50 }).default("warm").notNull(),
  tags: jsonb("tags").default([]).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  notes: text("notes"),
  currentCompany: varchar("current_company", { length: 255 }),
  currentTitle: varchar("current_title", { length: 255 }),
  desiredSalary: numeric("desired_salary"),
  preferredLocations: text("preferred_locations"),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  contactFrequency: varchar("contact_frequency", { length: 50 }),
  /** FK → workspace_sources.id (#238). Origin attribution — was the
   *  candidate inbound, sourced, referred, etc. */
  sourceId: uuid("source_id"),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_talent_pool_candidates_source_id").on(t.sourceId),
  index("idx_talent_pool_candidates_recruiter_added").on(t.recruiterId, t.addedAt.desc().nullsFirst()),
  index("idx_talent_pool_candidates_candidate_id").on(t.candidateId),
]);

export type TalentPoolCandidate = typeof talentPoolCandidates.$inferSelect;
export type NewTalentPoolCandidate = typeof talentPoolCandidates.$inferInsert;

export const candidateInteractions = pgTable("candidate_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  talentPoolId: uuid("talent_pool_id").references(() => talentPoolCandidates.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  notes: text("notes"),
  outcome: text("outcome"),
  interactionDate: timestamp("interaction_date", { withTimezone: true }).defaultNow().notNull(),
  durationMinutes: integer("duration_minutes"),
  requiresFollowUp: boolean("requires_follow_up").default(false).notNull(),
  followUpDate: timestamp("follow_up_date", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_candidate_interactions_candidate_id").on(t.candidateId),
  index("idx_candidate_interactions_recruiter_id").on(t.recruiterId),
  index("idx_candidate_interactions_talent_pool_id").on(t.talentPoolId),
]);

export type CandidateInteraction = typeof candidateInteractions.$inferSelect;
export type NewCandidateInteraction = typeof candidateInteractions.$inferInsert;

export const candidateSubmissions = pgTable("candidate_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateName: varchar("candidate_name", { length: 255 }).default("").notNull(),
  candidateEmail: varchar("candidate_email", { length: 255 }),
  jobId: uuid("job_id"),
  jobTitle: varchar("job_title", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  resumeId: uuid("resume_id"),
  coverLetter: text("cover_letter"),
  recruiterNotes: text("recruiter_notes"),
  proposedSalary: numeric("proposed_salary"),
  availableStartDate: timestamp("available_start_date", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("Submitted").notNull(),
  statusNotes: text("status_notes"),
  interviewDate: timestamp("interview_date", { withTimezone: true }),
  withdrawalReason: varchar("withdrawal_reason", { length: 255 }),
  withdrawalNotes: text("withdrawal_notes"),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_candidate_submissions_recruiter_submitted").on(t.recruiterId, t.submittedAt.desc().nullsFirst()),
  index("idx_candidate_submissions_job_status_submitted").on(t.jobId, t.status, t.submittedAt.desc().nullsFirst()).where(sql`job_id IS NOT NULL`),
  index("idx_candidate_submissions_candidate_id").on(t.candidateId),
]);

export type CandidateSubmission = typeof candidateSubmissions.$inferSelect;
export type NewCandidateSubmission = typeof candidateSubmissions.$inferInsert;

export const placements = pgTable("placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** FK → workspace_job_types.id (#226). Drives the bill / pay /
   *  overtime / fee defaults the commission engine consumes. Nullable
   *  on legacy rows that pre-date the taxonomy. */
  placementTypeId: uuid("placement_type_id"),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recruiterName: varchar("recruiter_name", { length: 255 }).default("").notNull(),
  candidateName: varchar("candidate_name", { length: 255 }).default("").notNull(),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
  jobId: uuid("job_id"),
  jobTitle: varchar("job_title", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  submissionId: uuid("submission_id").references(() => candidateSubmissions.id, { onDelete: "set null" }),
  startDate: timestamp("start_date", { withTimezone: true }),
  salary: numeric("salary"),
  annualSalary: numeric("annual_salary"),
  fee: numeric("fee"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  commissionPercentage: numeric("commission_percentage").default("0").notNull(),
  commissionAmount: numeric("commission_amount").default("0").notNull(),
  /** #227 — explicit fee-mode discriminator. 'flat' reads `feeFlatCents`;
   *  'percent' reads `feePercentBps` × `annualSalary`. Backfilled from
   *  legacy commission_amount/commission_percentage in migration 0178. */
  feeMode: varchar("fee_mode", { length: 8 }).default("percent").notNull(),
  feeFlatCents: integer("fee_flat_cents"),
  feePercentBps: integer("fee_percent_bps"),
  commissionStatus: varchar("commission_status", { length: 50 }).default("Pending").notNull(),
  commissionPaidDate: timestamp("commission_paid_date", { withTimezone: true }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  guaranteePeriodDays: integer("guarantee_period_days"),
  guaranteeEndDate: timestamp("guarantee_end_date", { withTimezone: true }),
  guaranteeMetStatus: boolean("guarantee_met_status"),
  notes: text("notes"),
  // ---- #1349 Phase 3 — back-office extensions ----
  // direct_hire | contract | contract_to_hire — short string kind
  // alongside the FK to workspace_job_types. The FK is the legacy
  // commission-engine-facing taxonomy; this kind is the Bullhorn-lite
  // back-office axis (drives whether timesheets are required).
  placementKind: varchar("placement_kind", { length: 32 }),
  endDate: timestamp("end_date", { withTimezone: true }),
  billRateHourly: numeric("bill_rate_hourly", { precision: 10, scale: 2 }),
  payRateHourly: numeric("pay_rate_hourly", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("USD"),
  burdenPct: numeric("burden_pct", { precision: 5, scale: 2 }),
  poNumber: varchar("po_number", { length: 100 }),
  msaRef: varchar("msa_ref", { length: 100 }),
  // For extension chains: the previous placement this row replaces.
  // Audit trail of "Acme renewed Jane's contract three times" without
  // mutating the original row.
  parentPlacementId: uuid("parent_placement_id"),
  // Contract placements require timesheets; direct-hire does not.
  // Defaults to NULL — service layer derives from placementKind on
  // insert if not set explicitly.
  timesheetRequired: boolean("timesheet_required"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_placements_placement_type_id").on(t.placementTypeId),
  index("idx_placements_parent").on(t.parentPlacementId).where(sql`parent_placement_id IS NOT NULL`),
  index("idx_placements_kind_status").on(t.placementKind, t.status),
  index("idx_placements_recruiter_created").on(t.recruiterId, t.createdAt.desc().nullsFirst()),
  check("placements_fee_mode_chk", sql`${t.feeMode} IN ('flat', 'percent')`),
  index("idx_placements_candidate_id").on(t.candidateId),
  index("idx_placements_company_id").on(t.companyId),
  index("idx_placements_submission_id").on(t.submissionId),
]);

export type Placement = typeof placements.$inferSelect;
export type NewPlacement = typeof placements.$inferInsert;

/** Placement splits across recruiters / sourcers / managers (#228).
 *  Sums to 10_000 bps; validation lives in the service layer. Commission
 *  engine fans out per row so 2 recruiters at 50/50 each see half the
 *  payout in their commission ledger. */
export const placementSplits = pgTable("placement_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  placementId: uuid("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull(),
  /** 'recruiter' | 'sourcer' | 'manager' | custom. */
  ownerType: varchar("owner_type", { length: 24 }).default("recruiter").notNull(),
  percentBps: integer("percent_bps").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_placement_splits_placement_id").on(t.placementId),
  index("idx_placement_splits_owner_user_id").on(t.ownerUserId),
]);
export type PlacementSplit = typeof placementSplits.$inferSelect;
export type NewPlacementSplit = typeof placementSplits.$inferInsert;

/** Per-placement email notification subscriptions (#230). One row per
 *  (placementId × event × userId). Stage events fire from the
 *  PlacementService when status transitions cross 'signed' / 'started'
 *  / 'first_day' / 'guarantee_expires'. */
export const placementNotificationSubscriptions = pgTable("placement_notification_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  placementId: uuid("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  event: varchar("event", { length: 48 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_placement_notif_subs_event").on(t.event),
  // #2305 — legacy UNIQUE (migration 0123_placement_splits_subs_share_perms_merge.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_placement_notif_subs_placement_user_event").on(t.placementId, t.userId, t.event),
]);
export type PlacementNotificationSubscription = typeof placementNotificationSubscriptions.$inferSelect;
export type NewPlacementNotificationSubscription = typeof placementNotificationSubscriptions.$inferInsert;

/** Idempotency log for date-based placement stage events (#230). The daily
 *  sweep records each (placementId × event) it has fired so the /5 cron tick
 *  never re-notifies subscribers for the same event. UNIQUE(placement_id,
 *  event) makes `markEventFired` a single insert-on-conflict. */
export const placementNotificationLog = pgTable(
  "placement_notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placementId: uuid("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 48 }).notNull(),
    firedAt: timestamp("fired_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqPlacementEvent: uniqueIndex("uq_placement_notification_log").on(t.placementId, t.event),
  }),
);
export type PlacementNotificationLogRow = typeof placementNotificationLog.$inferSelect;



export const jobBoardPostings = pgTable("job_board_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull(),
  /** Board the posting went to. Written by routes/exclusive-boards.ts with an
   *  `exclusive_boards.id`; the old FK pointed at the never-used `job_boards`
   *  table (archived in 0545) and rejected those inserts. */
  boardId: uuid("board_id").notNull(),
  externalJobId: text("external_job_id"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // jobsRepository lists a job's postings by job_id.
  index("idx_job_board_postings_job_id").on(t.jobId),
]);

export type JobBoardPosting = typeof jobBoardPostings.$inferSelect;
export type NewJobBoardPosting = typeof jobBoardPostings.$inferInsert;



export const queueJobToProcess = pgTable("queue_job_to_process", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  priority: integer("priority").default(0).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type QueueJobToProcess = typeof queueJobToProcess.$inferSelect;
export type NewQueueJobToProcess = typeof queueJobToProcess.$inferInsert;

// ─── Saved Searches (recruiter Boolean search persistence) ────────────────────

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  query: text("query").notNull().default(""),
  filters: jsonb("filters").default({}).$type<Record<string, unknown>>(),
  searchType: varchar("search_type", { length: 50 }).default("recruiter").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_saved_searches_user_id").on(t.userId),
]);

export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;

// ─── AI Recruiter Agent ───────────────────────────────────────────────────────
// Tracks automated sourcing runs: criteria → scored candidates → outreach drafts.

export const recruiterAgentRuns = pgTable("recruiter_agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id"),
  jobTitle: varchar("job_title", { length: 255 }),
  // Search criteria (skills, location, experienceYears, etc.)
  criteria: jsonb("criteria").default({}).$type<Record<string, unknown>>(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | running | completed | failed
  candidatesFound: integer("candidates_found").default(0).notNull(),
  candidatesScored: integer("candidates_scored").default(0).notNull(),
  // Array of { candidateId, name, email, score, scoreReason, outreachDraft }
  results: jsonb("results").default([]).$type<Array<{
    candidateId: string;
    name: string;
    email?: string;
    score: number;
    scoreReason: string;
    outreachDraft: string;
  }>>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_recruiter_agent_runs_recruiter_id").on(t.recruiterId),
]);

export type RecruiterAgentRun = typeof recruiterAgentRuns.$inferSelect;
export type NewRecruiterAgentRun = typeof recruiterAgentRuns.$inferInsert;

// Scheduled follow-up messages produced by Agent v2's orchestration
// loop. See migration 0117_recruiter_agent_followups.sql for the
// rationale; the worker `recruiter-agent-followup` flips pending rows
// to sent / cancelled on the cron tick.
export const recruiterAgentFollowups = pgTable("recruiter_agent_followups", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => recruiterAgentRuns.id, { onDelete: "cascade" }),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followupKind: varchar("followup_kind", { length: 32 }).notNull(),
  sequenceIndex: integer("sequence_index").default(1).notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  body: text("body").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_recruiter_agent_followups_due").on(t.scheduledFor).where(sql`status = 'pending'`),
  index("idx_recruiter_agent_followups_recruiter").on(t.recruiterId, t.scheduledFor.desc().nullsFirst()),
  index("idx_recruiter_agent_followups_run").on(t.runId, t.sequenceIndex),
  index("idx_recruiter_agent_followups_candidate_id").on(t.candidateId),
]);

export type RecruiterAgentFollowup = typeof recruiterAgentFollowups.$inferSelect;
export type NewRecruiterAgentFollowup = typeof recruiterAgentFollowups.$inferInsert;

// ─── ATS Integration connections ─────────────────────────────────────────────
// Stores OAuth tokens / API keys for Greenhouse, Lever, Workday, etc.

export const atsConnections = pgTable("ats_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // "greenhouse" | "lever" | "workday"
  // API key or OAuth access token. Written encrypted to api_key_enc
  // (services/crypto/credential-columns.ts); api_key is the legacy plaintext
  // column, read only for rows not yet backfilled (0548/0549).
  apiKey: text("api_key"),
  apiKeyEnc: text("api_key_enc"),
  webhookSecret: text("webhook_secret"),
  // Provider-specific config (board token, subdomain, etc.)
  config: jsonb("config").default({}).$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_ats_connections_company_id").on(t.companyId),
]);

export type AtsConnection = typeof atsConnections.$inferSelect;
export type NewAtsConnection = typeof atsConnections.$inferInsert;

// ─── Extracted Profiles (recruiter-private candidate extractions) ────────────
// Stores structured data extracted from candidate profiles (LinkedIn, Indeed, etc.)
// by the recruiter Chrome extension. Private to the recruiter who extracted them.

export const extractedProfiles = pgTable("extracted_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  talentPoolCandidateId: uuid("talent_pool_candidate_id").references(() => talentPoolCandidates.id, { onDelete: "set null" }),
  sourceUrl: text("source_url").notNull(),
  sourceUrlNormalized: varchar("source_url_normalized", { length: 500 }),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  extractedData: jsonb("extracted_data").default({}).notNull().$type<{
    name?: string;
    title?: string;
    company?: string;
    location?: string;
    skills?: string[];
    experience?: Array<{ title?: string; company?: string; duration?: string; description?: string }>;
    education?: Array<{ degree?: string; institution?: string; year?: string }>;
    summary?: string;
    contactInfo?: {
      email?: string;
      phone?: string;
      linkedin?: string;
      github?: string;
      twitter?: string;
      website?: string;
    };
  }>(),
  extractionMethod: varchar("extraction_method", { length: 50 }).default("extension").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_extracted_profiles_recruiter_id").on(t.recruiterId),
  index("idx_extracted_profiles_talent_pool_candidate_id").on(t.talentPoolCandidateId),
]);

export type ExtractedProfile = typeof extractedProfiles.$inferSelect;
export type NewExtractedProfile = typeof extractedProfiles.$inferInsert;

// ─── Recruiter Lists (gap #1360) ─────────────────────────────────────────
// Recruiter-scoped collections of candidates distinct from a job's
// pipeline. `kind` discriminates ordinary lists from prioritised call
// queues so the extension can render them in two separate sections.

export const recruiterLists = pgTable("recruiter_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  kind: varchar("kind", { length: 32 }).default("list").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("recruiter_lists_recruiter_idx").on(t.recruiterId),
]);

export type RecruiterList = typeof recruiterLists.$inferSelect;
export type NewRecruiterList = typeof recruiterLists.$inferInsert;

export const recruiterListMembers = pgTable(
  "recruiter_list_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id").notNull().references(() => recruiterLists.id, { onDelete: "cascade" }),
    talentPoolCandidateId: uuid("talent_pool_candidate_id").notNull().references(() => talentPoolCandidates.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One row per candidate per list. Position can change but membership
    // uniqueness is at the (list, candidate) pair.
    uniqueIndex("uq_recruiter_list_members_pair").on(t.listId, t.talentPoolCandidateId),
    index("recruiter_list_members_candidate_idx").on(t.talentPoolCandidateId),
  ],
);

export type RecruiterListMember = typeof recruiterListMembers.$inferSelect;
export type NewRecruiterListMember = typeof recruiterListMembers.$inferInsert;

// ─── Recruiter Outreach Sequences (gap #1357) ────────────────────────────
// Reusable, recruiter-authored outreach copy organised as ordered steps
// (channel + delay + body). Candidates can be enrolled directly from the
// Chrome extension without first running the sourcing agent — distinct
// from `recruiterAgentFollowups`, which is agent-run-bound.

export const recruiterOutreachSequences = pgTable("recruiter_outreach_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  steps: jsonb("steps").default([]).notNull().$type<Array<{
    channel: "email" | "message" | "sms";
    delayDays: number;
    subject?: string;
    body: string;
    /** Opt this step into AI rewrite of the rendered body at send time
     *  (services/outreach/personalize.ts). Defaults off. */
    aiPersonalize?: boolean;
  }>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("recruiter_outreach_sequences_recruiter_idx").on(t.recruiterId),
]);

export type RecruiterOutreachSequence = typeof recruiterOutreachSequences.$inferSelect;
export type NewRecruiterOutreachSequence = typeof recruiterOutreachSequences.$inferInsert;

export const recruiterOutreachEnrollments = pgTable("recruiter_outreach_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => recruiterOutreachSequences.id, { onDelete: "cascade" }),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  talentPoolCandidateId: uuid("talent_pool_candidate_id").notNull().references(() => talentPoolCandidates.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}).notNull(),
}, (t) => [
  index("recruiter_outreach_enrollments_recruiter_idx").on(t.recruiterId),
  index("recruiter_outreach_enrollments_due_idx").on(t.status, t.nextSendAt).where(sql`status = 'active'`),
  index("idx_recruiter_outreach_enrollments_sequence_id").on(t.sequenceId),
  index("idx_recruiter_outreach_enrollments_talent_pool_candidate_id").on(t.talentPoolCandidateId),
]);

export type RecruiterOutreachEnrollment = typeof recruiterOutreachEnrollments.$inferSelect;
export type NewRecruiterOutreachEnrollment = typeof recruiterOutreachEnrollments.$inferInsert;

// ─── Recruiter Match Scores (cached job ↔ candidate compatibility scores) ────
// Stores the result of scoring a talent-pool candidate against a job.
// Unique constraint on (recruiter, job, candidate) prevents re-scoring.

export const recruiterMatchScores = pgTable("recruiter_match_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull(),
  candidateId: uuid("candidate_id").notNull(), // talent_pool_candidates.id
  candidateName: varchar("candidate_name", { length: 255 }).default("").notNull(),
  jobTitle: varchar("job_title", { length: 255 }).default("").notNull(),
  score: integer("score").notNull(),
  recommendations: text("recommendations"),
  resumeTextHash: varchar("resume_text_hash", { length: 64 }),
  scoredAt: timestamp("scored_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_recruiter_match_scores_recruiter_id").on(t.recruiterId),
]);

export type RecruiterMatchScore = typeof recruiterMatchScores.$inferSelect;
export type NewRecruiterMatchScore = typeof recruiterMatchScores.$inferInsert;

