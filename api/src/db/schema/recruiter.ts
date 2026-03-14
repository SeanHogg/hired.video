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
  poolId: uuid("pool_id").notNull().references(() => recruiterTalentPools.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  notes: text("notes"),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TalentPoolCandidate = typeof talentPoolCandidates.$inferSelect;
export type NewTalentPoolCandidate = typeof talentPoolCandidates.$inferInsert;

export const candidateInteractions = pgTable("candidate_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CandidateInteraction = typeof candidateInteractions.$inferSelect;
export type NewCandidateInteraction = typeof candidateInteractions.$inferInsert;

export const candidateSubmissions = pgTable("candidate_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull(),
  status: varchar("status", { length: 50 }).default("submitted").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CandidateSubmission = typeof candidateSubmissions.$inferSelect;
export type NewCandidateSubmission = typeof candidateSubmissions.$inferInsert;

export const placements = pgTable("placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
  jobId: uuid("job_id"),
  startDate: timestamp("start_date", { withTimezone: true }),
  salary: numeric("salary"),
  fee: numeric("fee"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
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
