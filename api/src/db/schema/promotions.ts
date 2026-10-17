import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { studioProjects } from "./resumes.js";
import { studioProjectRenderVariants } from "./renderVariants.js";

/**
 * promotion_submissions — Lane A promotion queue (migration 0497, #2046).
 * See shared/promotions.ts for the platform/status vocabulary.
 */
export const promotionSubmissions = pgTable(
  "promotion_submissions",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    projectId:    uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    submittedBy:  uuid("submitted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform:     varchar("platform", { length: 16 }).notNull(),
    status:       varchar("status", { length: 16 }).notNull().default("pending"),
    title:        varchar("title", { length: 100 }).notNull(),
    description:  text("description").notNull().default(""),
    reviewedBy:   uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt:   timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    externalId:   text("external_id"),
    externalUrl:  text("external_url"),
    lastError:    text("last_error"),
    screeningVerdict: varchar("screening_verdict", { length: 16 }).notNull().default("unscreened"),
    screeningNotes:   text("screening_notes"),
    /** The fitted cut to publish (migration 0522, #2045); null = the master render. */
    renderVariantId:  uuid("render_variant_id").references(() => studioProjectRenderVariants.id, { onDelete: "set null" }),
    createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_promotion_submissions_open")
      .on(t.projectId, t.platform)
      .where(sql`status IN ('pending', 'failed')`),
    index("idx_promotion_submissions_status_created").on(t.status, t.createdAt.desc().nullsFirst()),
    index("idx_promotion_submissions_project").on(t.projectId, t.createdAt.desc().nullsFirst()),
    index("idx_promotion_submissions_variant").on(t.renderVariantId),
    check("promotion_submissions_platform_check", sql`${t.platform} IN ('youtube', 'tiktok', 'instagram', 'x', 'facebook')`),
    check("promotion_submissions_status_check", sql`${t.status} IN ('pending', 'published', 'failed', 'rejected')`),
    check("promotion_submissions_screening_verdict_check", sql`${t.screeningVerdict} IN ('pass', 'flag', 'block', 'unscreened')`),
    index("idx_promotion_submissions_reviewed_by").on(t.reviewedBy),
    index("idx_promotion_submissions_submitted_by").on(t.submittedBy),
  ],
);

export type PromotionSubmissionRow = typeof promotionSubmissions.$inferSelect;
export type PromotionSubmissionInsert = typeof promotionSubmissions.$inferInsert;
