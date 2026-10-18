/**
 * Job Board Scraper / Extraction Engine (#86)
 *
 * Replaces the legacy Hangfire-based job board poller.
 * Super-admins configure sources globally; companies/recruiters can add
 * their own private sources (API key or RSS/JSON URL).
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Job board source configuration
// ---------------------------------------------------------------------------
export const jobBoardSources = pgTable("job_board_sources", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Human-readable name, e.g. "Indeed RSS – Software Engineering" */
  name: varchar("name", { length: 255 }).notNull(),

  /** Feed URL (RSS, JSON endpoint, or scrape target) */
  url: text("url").notNull(),

  /** "rss" | "json_api" | "html" */
  type: varchar("type", { length: 50 }).default("rss").notNull(),

  /** Optional API key / bearer token stored encrypted in the field */
  apiKey: text("api_key"),

  /** jsonb config: { selector, pagination, headers, mapping, ... } */
  config: jsonb("config").default({}),

  /** Cron expression, e.g. "0 * * * *" (every hour). Null = disabled. */
  schedule: varchar("schedule", { length: 100 }).default("0 * * * *"),

  /** Global sources: created by super-admin (createdByUserId = null). */
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

  /** Scope: "global" (admin), "company" (employer), "recruiter" (personal) */
  scope: varchar("scope", { length: 50 }).default("global").notNull(),

  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_job_board_sources_created_by_user_id").on(t.createdByUserId),
]);

export type JobBoardSource = typeof jobBoardSources.$inferSelect;
export type NewJobBoardSource = typeof jobBoardSources.$inferInsert;

// ---------------------------------------------------------------------------
// Sync log — one row per cron run
// ---------------------------------------------------------------------------
export const jobBoardSyncLog = pgTable("job_board_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => jobBoardSources.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("running").notNull(), // running | success | error
  fetched: integer("fetched").default(0).notNull(),
  inserted: integer("inserted").default(0).notNull(),
  skipped: integer("skipped").default(0).notNull(), // duplicates
  errors: integer("errors").default(0).notNull(),
  errorMessage: text("error_message"),
}, (t) => [
  index("idx_job_board_sync_log_source_id").on(t.sourceId),
  index("idx_job_board_sync_log_started_at").on(t.startedAt),
]);

export type JobBoardSyncLog = typeof jobBoardSyncLog.$inferSelect;
export type NewJobBoardSyncLog = typeof jobBoardSyncLog.$inferInsert;
