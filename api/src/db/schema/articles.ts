/**
 * Creator-authored Articles, FAQs, and Guides.
 *
 * Lifecycle:
 *   draft -> submitted -> published   (SA approved)
 *                      `-> rejected   (SA rejected; revise -> draft)
 *
 * "flagged" + "unlisted" are reserved for post-publish abuse-report moderation
 * (see content_reports). Pre-publish review uses the new statuses above.
 *
 * "kind" lets creators publish three specialisations of the same storage
 * shape: article / faq / guide. Downstream UI filters and admin queue group by
 * kind, but the row schema is identical.
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

export const ARTICLE_KINDS = ["article", "faq", "guide"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_STATUS = [
  "draft",
  "submitted",
  "published",
  "rejected",
  "unlisted",
  "flagged",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUS)[number];

export const MODERATION_SEVERITY = ["low", "medium", "high", "block"] as const;
export type ModerationSeverity = (typeof MODERATION_SEVERITY)[number];

export interface ModerationFindings {
  profanity: string[];
  racism: string[];
  tosViolations: string[];
  severity: ModerationSeverity;
  rationale?: string;
}

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
    // AI-resilient sector taxonomy. Slug values + enum lives in
    // `shared/sectors.ts`. Nullable — legacy articles stay untagged
    // until re-saved through the new picker.
    sector: varchar("sector", { length: 64 }),
    // Audience vocabulary orthogonal to category — drives which sector
    // landing page surfaces the article ("for job seekers" vs "for
    // recruiters" vs "pivoting in" vs "resume guide" vs "civic /
    // run-for-office"). See ARTICLE_AUDIENCES in shared/sectors.ts.
    audience: varchar("audience", { length: 32 }),

    kind: varchar("kind", { length: 16 }).default("article").notNull(),

    status: varchar("status", { length: 32 }).default("draft").notNull(),
    submittedForReviewAt: timestamp("submitted_for_review_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    qualityScore: real("quality_score"),
    qualityRationale: text("quality_rationale"),
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),

    moderationScore: real("moderation_score"),
    moderationFindings: jsonb("moderation_findings").$type<ModerationFindings>(),
    moderationScannedAt: timestamp("moderation_scanned_at", { withTimezone: true }),
    moderationScannedBy: uuid("moderation_scanned_by").references(() => users.id, { onDelete: "set null" }),

    viewCount: integer("view_count").default(0).notNull(),
    readMinutes: integer("read_minutes").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_articles_user").on(t.userId, t.createdAt),
    index("idx_articles_status_published").on(t.status, t.publishedAt),
    index("idx_articles_kind_status").on(t.kind, t.status, t.publishedAt),
    // See migration 0112 — sector + audience indexes are partial (NULL
    // filtered) at the DB level. Drizzle doesn't model partial indexes
    // declaratively, so they're declared in SQL only.
    uniqueIndex("uq_articles_user_slug").on(t.userId, t.slug),
  ],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
