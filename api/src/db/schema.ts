import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  uuid,
  integer,
} from "drizzle-orm/pg-core";

// ============================================================================
// USERS
// ============================================================================

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  role: varchar("role", { length: 50 }).default("job_seeker").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================================
// RESUMES
// ============================================================================

export const resumes = pgTable("resumes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  // Full resume content stored as JSONB (JSON Resume schema)
  content: jsonb("content").notNull().default({}),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;

// ============================================================================
// JOBS
// ============================================================================

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  company: varchar("company", { length: 255 }).notNull().default(""),
  location: varchar("location", { length: 255 }).notNull().default(""),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

// ============================================================================
// VIDEOS
// ============================================================================

export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  status: varchar("status", { length: 50 }).default("Queued").notNull(),
  // R2 object key for the temporary video file
  r2Key: text("r2_key"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  // AI-generated storyboard JSON
  storyboard: jsonb("storyboard"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

// ============================================================================
// STUDIO PROJECTS
// ============================================================================

export const studioProjects = pgTable("studio_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Raw resume text submitted by the user
  resumeText: text("resume_text").notNull(),
  // AI-generated storyboard returned by OpenRouter
  storyboard: jsonb("storyboard"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  // Reference to the resulting video row, if published
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
  // Retry counter for publish attempts
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StudioProject = typeof studioProjects.$inferSelect;
export type NewStudioProject = typeof studioProjects.$inferInsert;
