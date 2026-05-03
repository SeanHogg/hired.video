import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Company-ownership: when set, the video is owned by the company and
  // userId is the editor/last-actor. Mirrors studio_projects.companyId.
  // See migration 0058_studio_company_ownership.sql.
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id"),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("Queued").notNull(),
  r2Key: text("r2_key"),
  thumbnailUrl: text("thumbnail_url"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  storyboard: jsonb("storyboard"),
  duration: integer("duration"),
  errorMessage: text("error_message"),
  privacyStatus: varchar("privacy_status", { length: 50 }).default("unlisted"),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

// `video_resumes` was dropped in migration 0062 — it was never read or
// written by any code path. Video-to-entity associations now live on
// videos.resumeId (single FK, many videos per resume) and on
// studio_project_subjects (polymorphic many-to-many for projects).

// `youtubeAccounts` lives in `studiofeatures.ts` — that definition has the
// extra googleId / displayName / email columns that youtubeAccountRepository
// expects. Re-exported via the schema barrel from there.
