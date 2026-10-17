import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
  boolean,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  // VIDEO_STATUSES (shared/statuses.ts); lowercase since migration 0620.
  status: varchar("status", { length: 50 }).default("queued").notNull(),
  r2Key: text("r2_key"),
  // Render carries the hired.video watermark (migration 0497). Set at upload.
  branded: boolean("branded").notNull().default(false),
  thumbnailUrl: text("thumbnail_url"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  storyboard: jsonb("storyboard"),
  duration: integer("duration"),
  errorMessage: text("error_message"),
  // Visibility lives on a single varchar column ("public" | "unlisted" |
  // "private"). The redundant `is_public` boolean was removed in
  // migration 0086 because its writes (PATCH visibility) and a writer
  // that bypassed it (the publish-insert in studio.ts) drifted apart,
  // and the channel / homepage feeds filtered on different fields,
  // showing different videos on the two surfaces.
  privacyStatus: varchar("privacy_status", { length: 50 })
    .default("unlisted")
    .notNull(),
  /** The owner can keep a public video off the home page's wall and
   *  discovery (migration 0504). Writer: services/studio/home-wall.ts. */
  showOnHome: boolean("show_on_home").notNull().default(true),
  // The legacy `is_featured` flag was dropped in migration 0460 (gap
  // #754). The homepage carousel now sources from
  // `studio_projects.is_featured` (migration 0091) because v2-NLE
  // projects render live off `timelineSpec` and never have a `videos`
  // row. Featured rows feed GET /api/studio/videos/featured.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_videos_company").on(t.companyId),
  index("idx_videos_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
  check("videos_status_check", sql`${t.status} IN ('queued', 'processing', 'completed', 'failed')`),
]);

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

// `video_resumes` was dropped in migration 0062 — it was never read or
// written by any code path. Video-to-entity associations now live on
// videos.resumeId (single FK, many videos per resume) and on
// studio_project_subjects (polymorphic many-to-many for projects).

// YouTube channel connections live in provider_connections (purpose
// "youtube", W3-C migration 0600).