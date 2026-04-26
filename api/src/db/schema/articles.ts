/**
 * Creator-authored Articles (#170 foundation)
 *
 * Foundation only — engagement tracking, claps, Partner Program payouts deferred.
 * The static editorial blog (frontend/data/blog-posts.ts) is unaffected.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    bodyMd: text("body_md").default("").notNull(),
    summary: text("summary"),
    coverImageUrl: text("cover_image_url"),
    category: varchar("category", { length: 100 }),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    status: varchar("status", { length: 32 }).default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    qualityScore: real("quality_score"),
    qualityRationale: text("quality_rationale"),
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),

    viewCount: integer("view_count").default(0).notNull(),
    readMinutes: integer("read_minutes").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_articles_user").on(t.userId, t.createdAt),
    index("idx_articles_status_published").on(t.status, t.publishedAt),
    uniqueIndex("uq_articles_user_slug").on(t.userId, t.slug),
  ],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export const ARTICLE_STATUS = ["draft", "published", "unlisted", "flagged"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUS)[number];
