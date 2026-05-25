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
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const recruiterTalentPools = pgTable("recruiter_talent_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RecruiterTalentPool = typeof recruiterTalentPools.$inferSelect;
export type NewRecruiterTalentPool = typeof recruiterTalentPools.$inferInsert;

export const talentPoolCandidates = pgTable("talent_pool_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  poolId: uuid("pool_id").references(() => recruiterTalentPools.id, { onDelete: "set null" }),
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
});

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
});

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
});

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
  commissionStatus: varchar("commission_status", { length: 50 }).default("Pending").notNull(),
  commissionPaidDate: timestamp("commission_paid_date", { withTimezone: true }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  guaranteePeriodDays: integer("guarantee_period_days"),
  guaranteeEndDate: timestamp("guarantee_end_date", { withTimezone: true }),
  guaranteeMetStatus: boolean("guarantee_met_status"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Placement = typeof placements.$inferSelect;
export type NewPlacement = typeof placements.$inferInsert;

export const jobBoards = pgTable("job_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  apiKey: text("api_key"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobBoard = typeof jobBoards.$inferSelect;
export type NewJobBoard = typeof jobBoards.$inferInsert;

export const jobBoardPostings = pgTable("job_board_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull(),
  boardId: uuid("board_id").notNull().references(() => jobBoards.id, { onDelete: "cascade" }),
  externalJobId: text("external_job_id"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobBoardPosting = typeof jobBoardPostings.$inferSelect;
export type NewJobBoardPosting = typeof jobBoardPostings.$inferInsert;

export const queueJobToResume = pgTable("queue_job_to_resume", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull(),
  resumeId: uuid("resume_id").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type QueueJobToResume = typeof queueJobToResume.$inferSelect;
export type NewQueueJobToResume = typeof queueJobToResume.$inferInsert;

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
});

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
});

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
});

export type RecruiterAgentFollowup = typeof recruiterAgentFollowups.$inferSelect;
export type NewRecruiterAgentFollowup = typeof recruiterAgentFollowups.$inferInsert;

// ─── ATS Integration connections ─────────────────────────────────────────────
// Stores OAuth tokens / API keys for Greenhouse, Lever, Workday, etc.

export const atsConnections = pgTable("ats_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // "greenhouse" | "lever" | "workday"
  // API key or OAuth access token (encrypted at rest by the hosting platform)
  apiKey: text("api_key"),
  webhookSecret: text("webhook_secret"),
  // Provider-specific config (board token, subdomain, etc.)
  config: jsonb("config").default({}).$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    contactInfo?: { email?: string; phone?: string; linkedin?: string };
  }>(),
  extractionMethod: varchar("extraction_method", { length: 50 }).default("extension").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ExtractedProfile = typeof extractedProfiles.$inferSelect;
export type NewExtractedProfile = typeof extractedProfiles.$inferInsert;

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
});

export type RecruiterMatchScore = typeof recruiterMatchScores.$inferSelect;
export type NewRecruiterMatchScore = typeof recruiterMatchScores.$inferInsert;

