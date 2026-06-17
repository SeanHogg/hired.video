import {
  pgTable,
  uniqueIndex,
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

export const jobItems = pgTable("job_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  postedByUserId: uuid("posted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  /** Company this job belongs to. When set, every active member of the
   *  company can manage the job's pipeline / sourcing / etc. via
   *  `requireJobOwner` (see jobOwnership.ts). Nullable for legacy jobs
   *  that pre-date the company association. */
  companyId: uuid("company_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  company: varchar("company", { length: 255 }),
  location: varchar("location", { length: 255 }),
  jobType: varchar("job_type", { length: 50 }),
  experienceLevel: varchar("experience_level", { length: 50 }),
  salaryMin: numeric("salary_min"),
  salaryMax: numeric("salary_max"),
  salaryCurrency: varchar("salary_currency", { length: 10 }).default("USD"),
  skillsRequired: jsonb("skills_required").default([]),
  // AI-resilient sector taxonomy. Slug values + enum lives in
  // `shared/sectors.ts`. Nullable — legacy jobs stay untagged until
  // re-saved through the new picker. Indexed for sector-filtered
  // searches via partial index in migration 0112.
  sector: varchar("sector", { length: 64 }),
  // Structured details extracted by /api/jobs/extract:
  // { responsibilities: string[], requirements: string[],
  //   qualifications: string[], benefits: string[] }
  // Stored as jsonb so JobDetail.tsx can render the sections without
  // re-parsing description markdown.
  details: jsonb("details").default({}),
  isRemote: boolean("is_remote").default(false).notNull(),
  // Where the role is performed (#2069). Canonical kebab vocabulary in
  // shared/work-settings.ts: 'onsite' | 'remote' | 'hybrid'. `is_remote`
  // above is kept as a derived convenience (work_setting === 'remote').
  // Nullable for legacy rows until re-saved (migration 0216 backfills
  // them from is_remote). The two day counts are only meaningful for
  // hybrid — the weekly split, e.g. 2 on-site / 3 remote.
  workSetting: varchar("work_setting", { length: 16 }),
  onsiteDaysPerWeek: integer("onsite_days_per_week"),
  remoteDaysPerWeek: integer("remote_days_per_week"),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Sponsored job listings — paid employer promotion
  sponsored: boolean("sponsored").default(false).notNull(),
  sponsoredUntil: timestamp("sponsored_until", { withTimezone: true }),
  sponsoredRankBoost: integer("sponsored_rank_boost").default(0).notNull(), // added to relevance score
  sourceUrl: text("source_url"),
  // Direct-apply URL extracted from JSON-LD (`directApply` / `url`) or
  // HTML apply-button heuristics. Persisted so /api/jobs/saved can
  // expose it on later views instead of re-deriving-or-losing it.
  applyUrl: text("apply_url"),
  /** Optional cover/hero image rendered on the job card + detail page.
   *  Populated by the shared MediaPicker (upload / stock / AI). */
  heroImageUrl: text("hero_image_url"),
  /** #743 — Optional Studio video project attached to the job (recruiter
   *  pitch / employer brand / job-ad video). Set-null on project delete
   *  so jobs survive video cleanup. The job DTO exposes this id and the
   *  detail page mounts `<StudioVideoSurface mode="lazy" videoId={...}/>`. */
  videoProjectId: uuid("video_project_id"),
  /** Latest sentiment score from the Sentiment Analysis tool run
   *  against this job's description text. Null until the tool has been
   *  run against a SAVED job — pasted-text runs never write here, see
   *  migration 0070_job_sentiment_score.sql. */
  sentimentScore: integer("sentiment_score"),
  // Recruiter sourcing marketplace fields used to live here; they were
  // promoted to their own aggregate at `jobSourcingListings` (1:1 with
  // jobs). See migration `0052_sourcing_aggregate_split.sql` and memory:
  // project_sourcing_aggregate.
  // Body-cleanse cursor (migration 0080). See api/src/workers/job-body-cleanse.ts
  // — null until the cleanse worker has inspected this row. Re-inspected
  // when updatedAt > bodyCleansedAt.
  bodyCleansedAt: timestamp("body_cleansed_at", { withTimezone: true }),
  // cleansed | unchanged | failed — what the last cleanse pass did.
  bodyCleanseStatus: varchar("body_cleanse_status", { length: 16 }),
  // Async video screening attachment. When set, the apply flow auto-creates a
  // `studio_async_interviews` row bound to the new application and lands the
  // candidate on `/interview/:token` after submit. See migration 0120 and
  // routes/interview-question-sets.ts.
  screeningQuestionSetId: uuid("screening_question_set_id"),
  // 'none' | 'optional' | 'required' — drives whether the apply flow blocks
  // submission until the screening starts (required) or just nudges the
  // candidate after applying (optional).
  screeningRequired: varchar("screening_required", { length: 16 }).notNull().default("none"),
  /** Workspace-scoped source attribution (#238). Replaces ad-hoc
   *  free-text source fields once callers migrate; null until a user
   *  picks a source via the editor. FK kept unenforced at the schema
   *  level (workspace_sources lives in another table file). */
  sourceId: uuid("source_id"),
  /** Soft-delete timestamp (#154). When set, this job is hidden from
   *  default lists; "Include archived" toggles surface it back. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Granular field-level share matrix for the hiring-manager portal
   *  (#240). JSONB blob: `{ name: bool, compensation: bool, photo: bool,
   *  ... }`. Null = use the tenant default (currently "share all"). The
   *  HM-portal renderer gates each field against the matrix when set. */
  sharePermissions: jsonb("share_permissions"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // `.$onUpdate` is app-level: Drizzle stamps a fresh Date on every `.update()`
  // through the ORM (defaultNow() only fires on insert, leaving this stale after
  // edits — gap #473). No DB trigger exists for updated_at in this codebase, so
  // the ORM hook is the correct seam; raw SQL updates must still set it manually.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type JobItem = typeof jobItems.$inferSelect;
export type NewJobItem = typeof jobItems.$inferInsert;

export const jobPreferences = pgTable("job_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  desiredTitle: varchar("desired_title", { length: 255 }),
  desiredLocation: varchar("desired_location", { length: 255 }),
  remotePreference: varchar("remote_preference", { length: 50 }),
  salaryMin: numeric("salary_min"),
  salaryMax: numeric("salary_max"),
  jobTypes: jsonb("job_types").default([]),
  industries: jsonb("industries").default([]),
  skills: jsonb("skills").default([]),
  isOpenToWork: boolean("is_open_to_work").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobPreferences = typeof jobPreferences.$inferSelect;
export type NewJobPreferences = typeof jobPreferences.$inferInsert;

export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
  resumeId: uuid("resume_id"),
  coverLetter: text("cover_letter"),
  status: varchar("status", { length: 50 }).default("applied").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;

export const savedJobs = pgTable(
  "saved_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),
    // Job seeker pipeline: tracked → applied → interviewing → offered → accepted
    // Also: cancelled (job removed), rejected, withdrawn (user pulled out), declined (offer declined)
    status: varchar("status", { length: 50 }).default("tracked").notNull(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // (user_id, job_id) uniqueness — without this, JobService.saveJob's
  // `.onConflictDoNothing()` was a no-op (Postgres needs a target index)
  // and every Save click on /jobs inserted a duplicate row. See migration
  // 0077_saved_jobs_unique.sql.
  (t) => [uniqueIndex("uq_saved_jobs_user_job").on(t.userId, t.jobId)],
);

export type SavedJob = typeof savedJobs.$inferSelect;
export type NewSavedJob = typeof savedJobs.$inferInsert;

export const jobAlerts = pgTable("job_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  keywords: text("keywords"),
  location: varchar("location", { length: 255 }),
  jobType: varchar("job_type", { length: 50 }),
  frequency: varchar("frequency", { length: 50 }).default("weekly").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobAlert = typeof jobAlerts.$inferSelect;
export type NewJobAlert = typeof jobAlerts.$inferInsert;

export const jobWebsites = pgTable("job_websites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  scrapingEnabled: boolean("scraping_enabled").default(false).notNull(),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JobWebsite = typeof jobWebsites.$inferSelect;
export type NewJobWebsite = typeof jobWebsites.$inferInsert;
