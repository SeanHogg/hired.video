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

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export const videoResumes = pgTable("video_resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VideoResume = typeof videoResumes.$inferSelect;
export type NewVideoResume = typeof videoResumes.$inferInsert;

export const youtubeAccounts = pgTable("youtube_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  channelTitle: varchar("channel_title", { length: 255 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type YoutubeAccount = typeof youtubeAccounts.$inferSelect;
export type NewYoutubeAccount = typeof youtubeAccounts.$inferInsert;
