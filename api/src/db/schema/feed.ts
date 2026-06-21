import { sql } from "drizzle-orm";
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

export const feedPosts = pgTable(
  "feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // Post kind discriminator (gap #1828): 'text' | 'video' | 'article'.
    // "article" posts render long-form; the composer's mode now persists here
    // instead of being a throwaway UI label.
    kind: varchar("kind", { length: 16 }).default("text").notNull(),
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
    // Reshare / repost (migration 0203). When set, this row is a repost of
    // another feed_posts row; `content` (if any) is the quote commentary.
    // Self-ref FK is ON DELETE SET NULL so deleting an original leaves the
    // reshare standing rather than cascade-deleting it.
    repostOfId: uuid("repost_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_feed_posts_subject")
      .on(t.subjectType, t.subjectId, t.createdAt.desc())
      .where(sql`${t.subjectType} IS NOT NULL`),
  ],
);

export type FeedPost = typeof feedPosts.$inferSelect;
export type NewFeedPost = typeof feedPosts.$inferInsert;

export const feedPostLikes = pgTable(
  "feed_post_likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedPostId: uuid("feed_post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Professional reaction type (migration 0218). A plain "like" was casual;
    // the feed now supports a richer set (like / celebrate / support /
    // insightful / curious / funny) defined in shared/feed-reactions.ts.
    // Default 'like' so legacy rows read as a Like. One reaction per
    // (post, user) — changing your reaction UPDATEs this row.
    reactionType: varchar("reaction_type", { length: 24 }).default("like").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One reaction per (post, user). DB-enforced so the optimistic UI dedup
    // can't be defeated by concurrent double-clicks.
    uniqueIndex("uq_feed_post_likes_post_user").on(t.feedPostId, t.userId),
  ],
);

export type FeedPostLike = typeof feedPostLikes.$inferSelect;
export type NewFeedPostLike = typeof feedPostLikes.$inferInsert;

// Comment reactions (migration 0218) — same professional reaction set as
// posts (shared/feed-reactions.ts), one reaction per (comment, user).
export const feedCommentReactions = pgTable(
  "feed_comment_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id").notNull().references(() => feedPostComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reactionType: varchar("reaction_type", { length: 24 }).default("like").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_feed_comment_reactions_comment_user").on(t.commentId, t.userId),
    index("idx_feed_comment_reactions_comment").on(t.commentId),
  ],
);

export type FeedCommentReaction = typeof feedCommentReactions.$inferSelect;
export type NewFeedCommentReaction = typeof feedCommentReactions.$inferInsert;

export const feedPostComments = pgTable(
  "feed_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedPostId: uuid("feed_post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_feed_post_comments_post_created").on(t.feedPostId, t.createdAt.desc()),
  ],
);

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
