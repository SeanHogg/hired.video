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
    index("idx_feed_posts_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
    index("idx_feed_posts_global_created").on(t.createdAt.desc().nullsFirst()).where(sql`privacy = 'Public'`),
    index("idx_feed_posts_repost_of").on(t.repostOfId).where(sql`repost_of_id IS NOT NULL`),
  ],
);

export type FeedPost = typeof feedPosts.$inferSelect;
export type NewFeedPost = typeof feedPosts.$inferInsert;

/**
 * Hashtags of a feed post, one row per distinct lowercased hashtag (migration
 * 0616). Promoted out of `feed_posts.tags` (whose Hashtag entries the tag
 * filter + trending read used to unnest with jsonb_array_elements on every
 * call). Workspace taxonomies (`workspace_tags`) do not fit: those are
 * per-workspace, colored recruiter labels; hashtags are global free text.
 * Maintained by repositories/feedPostTagsRepository.ts on every post write
 * that sets `tags`; `created_at` copies the post's so the trending window
 * reads this table alone.
 */
export const feedPostTags = pgTable(
  "feed_post_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => feedPosts.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_feed_post_tags_post_tag").on(t.postId, t.tag),
    index("idx_feed_post_tags_tag_created").on(t.tag, t.createdAt.desc().nullsFirst()),
    index("idx_feed_post_tags_created").on(t.createdAt.desc().nullsFirst()),
  ],
);

export type FeedPostTag = typeof feedPostTags.$inferSelect;

