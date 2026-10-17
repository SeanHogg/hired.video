/**
 * Polymorphic review + comment system.
 *
 * One `reviews` table covers every reviewable subject (companies,
 * marketplace services, voice clones, promo projects, …). The
 * (subject_type, subject_id, user_id) tuple is unique, so a re-submit
 * upserts. Sub-rating axes and free-form metadata are stored in jsonb
 * because they vary per subject_type — see
 * [shared/reviews/subject-descriptors.ts](../../../../shared/reviews/subject-descriptors.ts)
 * for the type registry that drives both validation and form rendering.
 *
 * `review_comments` is threaded via `parent_id` so users can carry on
 * a discussion under a review (the "feed item" experience). Owners of
 * the underlying subject are flagged with `is_subject_owner` so the UI
 * can highlight their replies.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  smallint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Discriminator + foreign-id pair. NOT a real FK — the target
    // table varies per subjectType. The route layer enforces that
    // `subject_id` actually exists in the table the descriptor names.
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Headline rating, required for every subject type. 1..5.
    overallRating: smallint("overall_rating").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    // Optional single-body field for subjects that don't use pros/cons.
    body: text("body"),

    // Sub-rating axes — keys depend on the subject descriptor.
    //   { culture: 4, leadership: 5, ... }   (company)
    //   { quality: 5, value: 4, ... }        (voice_clone)
    subRatings: jsonb("sub_ratings").$type<Record<string, number>>().default({}).notNull(),

    // Subject-specific metadata. Schema declared in the descriptor.
    //   { employmentStatus, jobTitle, locationLabel, ... }   (company)
    //   { useCase, ... }                                     (voice_clone)
    //   { pros, cons, advice, ... }                          (company body sections)
    metadata: jsonb("metadata").$type<Record<string, string | null>>().default({}).notNull(),

    // Reviewer verification badge. Computed at write time per the
    // descriptor's verification rule. Null = no badge ever shown.
    isVerified: boolean("is_verified").notNull().default(false),
    verificationMethod: varchar("verification_method", { length: 32 }), // "email_domain" | "was_buyer" | null

    // Moderation. Excluded reviews are still stored so authors see why
    // they're hidden but never appear on public lists / aggregates.
    status: varchar("status", { length: 20 }).notNull().default("published"),

    // Anti-spam. Hash of submitter IP + daily salt — same scheme used
    // for company_views. Lets us throttle "1 NEW review per day per IP"
    // without storing the raw address.
    submitterIpHash: varchar("submitter_ip_hash", { length: 16 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_reviews_subject").on(t.subjectType, t.subjectId, t.createdAt),
    index("idx_reviews_user").on(t.userId, t.createdAt),
    // One review per (subject, user). Re-submit upserts.
    uniqueIndex("uniq_reviews_subject_user").on(t.subjectType, t.subjectId, t.userId),
    check("reviews_overall_rating_check", sql`${t.overallRating} BETWEEN 1 AND 5`),
    check("reviews_subject_type_check", sql`${t.subjectType} IN ('company', 'promo_project', 'service', 'voice_clone', 'article', 'resume_template', 'video_template', 'course', 'certification')`),
    check("reviews_overall_rating_range", sql`${t.overallRating} BETWEEN 1 AND 5`),
    check("reviews_status_check", sql`${t.status} IN ('published', 'hidden', 'removed')`),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export const reviewComments = pgTable(
  "review_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Self-FK for threading. Top-level comments have parentId = null.
    parentId: uuid("parent_id").references((): AnyPgColumn => reviewComments.id, {
      onDelete: "cascade",
    }),

    body: text("body").notNull(),

    // True when this comment is by the owner of the underlying
    // subject (e.g. company owner replying to a review of their
    // company). Computed at write time from the descriptor.
    isSubjectOwner: boolean("is_subject_owner").notNull().default(false),

    status: varchar("status", { length: 20 }).notNull().default("published"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_review_comments_review").on(t.reviewId, t.createdAt),
    index("idx_review_comments_parent").on(t.parentId),
    index("idx_review_comments_user_id").on(t.userId),
  ],
);

export type ReviewComment = typeof reviewComments.$inferSelect;
export type NewReviewComment = typeof reviewComments.$inferInsert;
