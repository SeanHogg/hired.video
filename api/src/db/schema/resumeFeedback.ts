/**
 * Resume feedback & career coaching (#1946).
 *
 * Two tables compose the review aggregate:
 *   resume_reviews             — one feedback engagement on one subject (a
 *                                résumé today; a job / article next — #2254)
 *                                between an owner and a reviewer
 *   resume_review_annotations  — sticky notes / highlights / comments, the
 *                                feedback layer kept OUT of the resume's
 *                                DocumentState so it never prints
 *
 * Full draft proposals reuse `resume_versions` (proposed_by_user_id / review_id
 * / proposal_status columns) rather than a parallel table — the owner accepts a
 * proposal through the existing version-restore path.
 *
 * Enums + the anchor / suggested-edit shapes are the single source of truth in
 * `shared/resume-feedback.ts`; the CHECK constraints below mirror them.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { resumeInformation } from "./resumes.js";
import { serviceInquiries } from "./services.js";
import type {
  AnnotationAnchor,
  SuggestedEdit,
} from "../../../../shared/resume-feedback.js";

// ---------------------------------------------------------------------------
// resume_reviews — the review session aggregate.
// ---------------------------------------------------------------------------
export const resumeReviews = pgTable(
  "resume_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // What the review is about (#2254, migration 0513) — the canonical
    // polymorphic pair; values: shared/resume-feedback.ts REVIEW_SUBJECT_TYPES
    // (CHECK resume_reviews_subject_type_check). `subjectId` is nullable at
    // the column level only so `drizzle-kit push` never has to add a NOT NULL
    // column to a populated table; the service always writes it and 0513
    // backfilled every existing row.
    subjectType: varchar("subject_type", { length: 16 }).notNull().default("resume"),
    subjectId: uuid("subject_id"),
    // The typed FK for a résumé subject (= subjectId, CHECK
    // resume_reviews_resume_subject_check); null for any other kind. Keeps the
    // cascade when the résumé is deleted.
    resumeId: uuid("resume_id").references(() => resumeInformation.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Null until a link-invite is claimed by an authenticated user; set
    // immediately for a direct user invite.
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewerEmail: varchar("reviewer_email", { length: 320 }),
    // Display name for the reviewer — captured at invite time (from the chosen
    // contact) or by an external guest when they open the link, so the owner can
    // attribute feedback to a person even when there's no platform account.
    reviewerName: varchar("reviewer_name", { length: 160 }),
    // Unguessable token gating link access (self-share + coach). Generated
    // once at create time.
    shareToken: varchar("share_token", { length: 64 }).notNull(),

    source: varchar("source", { length: 16 }).notNull().default("self_share"), // self_share | coaching
    // Set when source='coaching' — binds the paid engagement that spawned this.
    coachingInquiryId: uuid("coaching_inquiry_id").references(() => serviceInquiries.id, { onDelete: "set null" }),

    title: varchar("title", { length: 160 }),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending|active|submitted|completed|cancelled
    message: text("message"),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_resume_reviews_resume").on(t.resumeId),
    index("idx_resume_reviews_subject_created").on(t.subjectType, t.subjectId, t.createdAt.desc().nullsFirst()),
    index("idx_resume_reviews_owner_created").on(t.ownerId, t.createdAt),
    index("idx_resume_reviews_reviewer_created").on(t.reviewerId, t.createdAt),
    uniqueIndex("uq_resume_reviews_share_token").on(t.shareToken),
    // Migration 0513's CHECKs, declared so `drizzle-kit push` keeps them.
    check("resume_reviews_subject_type_check", sql`${t.subjectType} IN ('resume', 'job', 'article')`),
    check("resume_reviews_resume_subject_check", sql`${t.subjectType} <> 'resume' OR ${t.resumeId} = ${t.subjectId}`),
    check("resume_reviews_source_check", sql`${t.source} IN ('self_share', 'coaching')`),
    check("resume_reviews_status_check", sql`${t.status} IN ('pending', 'active', 'submitted', 'completed', 'cancelled')`),
    index("idx_resume_reviews_coaching_inquiry_id").on(t.coachingInquiryId),
  ],
);

export type ResumeReview = typeof resumeReviews.$inferSelect;
export type NewResumeReview = typeof resumeReviews.$inferInsert;

// ---------------------------------------------------------------------------
// resume_review_annotations — sticky notes / highlights / comments.
// ---------------------------------------------------------------------------
export const resumeReviewAnnotations = pgTable(
  "resume_review_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id").notNull().references(() => resumeReviews.id, { onDelete: "cascade" }),
    // Usually the reviewer; the owner can reply, so it's a soft link.
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),

    kind: varchar("kind", { length: 16 }).notNull(), // sticky_note | highlight | comment
    body: text("body").notNull(),
    color: varchar("color", { length: 16 }),
    status: varchar("status", { length: 16 }).notNull().default("open"), // open|accepted|dismissed|resolved

    // Denormalised page id (also inside `anchor` for canvas notes) so a
    // page-scoped fetch can index without unpacking jsonb.
    pageId: varchar("page_id", { length: 64 }),
    // Discriminated AnnotationAnchor (canvas | content | general).
    anchor: jsonb("anchor").$type<AnnotationAnchor>().notNull(),
    // Optional inline content change the owner accepts per-item.
    suggestedEdit: jsonb("suggested_edit").$type<SuggestedEdit>(),

    // Threaded replies.
    parentAnnotationId: uuid("parent_annotation_id").references((): AnyPgColumn => resumeReviewAnnotations.id, { onDelete: "cascade" }),

    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_resume_annotations_review_created").on(t.reviewId, t.createdAt),
    index("idx_resume_annotations_parent").on(t.parentAnnotationId),
    check("resume_annotations_kind_check", sql`${t.kind} IN ('sticky_note', 'highlight', 'comment')`),
    check("resume_annotations_status_check", sql`${t.status} IN ('open', 'accepted', 'dismissed', 'resolved')`),
    index("idx_resume_review_annotations_author_id").on(t.authorId),
    index("idx_resume_review_annotations_resolved_by_user_id").on(t.resolvedByUserId),
  ],
);

export type ResumeReviewAnnotation = typeof resumeReviewAnnotations.$inferSelect;
export type NewResumeReviewAnnotation = typeof resumeReviewAnnotations.$inferInsert;
