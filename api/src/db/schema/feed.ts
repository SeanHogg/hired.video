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

export const feedPosts = pgTable("feed_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  linkUrl: varchar("link_url", { length: 2000 }),
  linkTitle: varchar("link_title", { length: 500 }),
  linkDescription: text("link_description"),
  linkImageUrl: varchar("link_image_url", { length: 2000 }),
  privacy: varchar("privacy", { length: 50 }).default("Public").notNull(), // Public | Recruiter | Connections | Private
  media: jsonb("media").default([]).$type<Array<{
    id: string; mediaType: "Image" | "Video"; mediaUrl: string;
    thumbnailUrl?: string; altText?: string; displayOrder: number;
  }>>(),
  tags: jsonb("tags").default([]).$type<Array<{
    id: string; tagType: "Hashtag" | "Mention"; tagValue: string;
    mentionedUserId?: string; position: number;
  }>>(),
  // Polymorphic surfacing. When non-null, this feed post is a pointer
  // to a reviewable / promotable subject (a review, a video, a resume,
  // …) and the renderer inlines that subject's canonical card. Free-
  // form text posts leave both columns null.
  subjectType: varchar("subject_type", { length: 32 }),
  subjectId: uuid("subject_id"),
  // Cached display data — title, headline rating, excerpt, etc.
  // Recomputed at write time by whichever route emits the post; the
  // feed list query never has to N+1 back to the source table.
  embedPayload: jsonb("embed_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FeedPost = typeof feedPosts.$inferSelect;
export type NewFeedPost = typeof feedPosts.$inferInsert;

export const feedPostLikes = pgTable("feed_post_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedPostId: uuid("feed_post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FeedPostLike = typeof feedPostLikes.$inferSelect;
export type NewFeedPostLike = typeof feedPostLikes.$inferInsert;

export const feedPostComments = pgTable("feed_post_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedPostId: uuid("feed_post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FeedPostComment = typeof feedPostComments.$inferSelect;
export type NewFeedPostComment = typeof feedPostComments.$inferInsert;

export const feedPostReports = pgTable("feed_post_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedPostId: uuid("feed_post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 100 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FeedPostReport = typeof feedPostReports.$inferSelect;
export type NewFeedPostReport = typeof feedPostReports.$inferInsert;
