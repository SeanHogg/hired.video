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

export const jobItems = pgTable("job_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  postedByUserId: uuid("posted_by_user_id").references(() => users.id, { onDelete: "set null" }),
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
  isRemote: boolean("is_remote").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const savedJobs = pgTable("saved_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
