import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * YouTube video imported by a creator into their public channel.
 * Source-of-truth row for the channel page's "Videos" tab when the
 * user's `profile_mode` resolves to `channel`. The eventual
 * `creator_content` view will UNION these with native videos so
 * recruiter search hits one index regardless of where the clip lives.
 */
export const creatorYoutubeIngests = pgTable(
  "creator_youtube_ingests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    youtubeVideoId: varchar("youtube_video_id", { length: 32 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title"),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    channelName: text("channel_name"),
    channelUrl: text("channel_url"),
    durationSec: integer("duration_sec"),
    displayOrder: integer("display_order").default(0).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userVideoUq: uniqueIndex("creator_youtube_ingests_user_video_uq").on(
      t.userId,
      t.youtubeVideoId,
    ),
    creatorYoutubeIngestsUserIdx: index("creator_youtube_ingests_user_idx").on(t.userId, t.isHidden, t.ingestedAt.desc().nullsFirst()),
  }),
);

export type CreatorYoutubeIngest = typeof creatorYoutubeIngests.$inferSelect;
export type NewCreatorYoutubeIngest = typeof creatorYoutubeIngests.$inferInsert;
