/**
 * Page → video embed registry (#1860).
 *
 * Maps a marketing-page route (pathname) to the Studio video a SuperAdmin
 * published onto it. The public resolver reads the active row for a path;
 * the shared <MarketingPageVideo> component renders it. One row per path
 * (upserted), `isActive` toggles publish/unpublish.
 *
 * Migration 0192.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { studioProjects } from "./resumes.js";
import { videos } from "./videos.js";

export const pageEmbedVideos = pgTable("page_embed_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  pathname: varchar("pathname", { length: 512 }).notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
  placement: varchar("placement", { length: 24 }).notNull().default("hero"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_page_embed_videos_path").on(t.pathname),
  index("idx_page_embed_videos_created_by").on(t.createdBy),
  index("idx_page_embed_videos_project_id").on(t.projectId),
  index("idx_page_embed_videos_video_id").on(t.videoId),
]);

export type PageEmbedVideo = typeof pageEmbedVideos.$inferSelect;
export type NewPageEmbedVideo = typeof pageEmbedVideos.$inferInsert;
