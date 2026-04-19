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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const metaResumes = pgTable("meta_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MetaResume = typeof metaResumes.$inferSelect;
export type NewMetaResume = typeof metaResumes.$inferInsert;

export const resumeInformation = pgTable("resume_information", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metaResumeId: uuid("meta_resume_id").references(() => metaResumes.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: jsonb("content").notNull().default({}),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  templateId: uuid("template_id"),
  // Resume hierarchy & display fields
  isMaster: boolean("is_master").default(false).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  parentId: uuid("parent_id"),  // self-referential: null = root / variation of parentId
  slug: varchar("slug", { length: 255 }),  // per-user vanity URL segment
  privacyLevel: integer("privacy_level").default(10).notNull(),  // 0=public,1=recruiter,2=connections,10=private
  diffPercent: integer("diff_percent"),  // 0-100, percent difference vs parent; only populated on children
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("resume_information_user_id_idx").on(table.userId),
  index("resume_information_parent_id_idx").on(table.parentId),
]);

export type ResumeInformation = typeof resumeInformation.$inferSelect;
export type NewResumeInformation = typeof resumeInformation.$inferInsert;

export const resumeTemplates = pgTable("resume_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  templateData: jsonb("template_data").notNull().default({}),
  isPublic: boolean("is_public").default(true).notNull(),
  isPremium: boolean("is_premium").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ResumeTemplate = typeof resumeTemplates.$inferSelect;
export type NewResumeTemplate = typeof resumeTemplates.$inferInsert;

export const watchedResumes = pgTable("watched_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  viewerId: uuid("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  watchedAt: timestamp("watched_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WatchedResume = typeof watchedResumes.$inferSelect;
export type NewWatchedResume = typeof watchedResumes.$inferInsert;

// Studio Projects — kept here since they are tightly coupled to resume workflows
export const studioProjects = pgTable("studio_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeText: text("resume_text").notNull(),
  resumeId: uuid("resume_id").references(() => resumeInformation.id, { onDelete: "set null" }),
  storyboard: jsonb("storyboard"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  videoId: uuid("video_id"),
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StudioProject = typeof studioProjects.$inferSelect;
export type NewStudioProject = typeof studioProjects.$inferInsert;
