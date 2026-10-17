import { sql } from "drizzle-orm";
import { pgTable, uuid, text, varchar, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * content_scans — the explicit-content verdict of one content item
 * (migration 0505). Vocabulary + CHECK values: shared/moderation/explicit.ts.
 *
 * One row per (subject_type, subject_id):
 *   video                  id = videos.id   — the gate for the home wall
 *   video_frames           id = videos.id   — vision verdict of the frames the
 *                                             client sampled from one render
 *                                             (input_hash = that render's r2 key)
 *   image                  id = asset URL   — cached per URL; input_hash = sha-256
 *                                             of the bytes, so the same photo at a
 *                                             new URL reuses the verdict
 *   profile                id = users.id    — name + headline shown on the wall
 *   video_personalization  id = users.id    — the "own words" sentence
 *
 * `subject_id` is text (not uuid) because images are keyed by URL. Scan
 * facts live here once instead of as columns on every table. The effective
 * verdict is `coalesce(override_verdict, verdict)`; a rescan with a different
 * input_hash clears the override. Single writer:
 * services/moderation/explicit/contentScanRepository.ts.
 */
export const contentScans = pgTable("content_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: varchar("subject_type", { length: 32 }).notNull(),
  subjectId: text("subject_id").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
  verdict: varchar("verdict", { length: 16 }).notNull(),
  categories: text("categories").array().notNull().default([]),
  reason: text("reason"),
  inputHash: text("input_hash"),
  overrideVerdict: varchar("override_verdict", { length: 16 }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_content_scans_subject").on(t.subjectType, t.subjectId),
  index("idx_content_scans_input_hash").on(t.subjectType, t.inputHash),
  index("idx_content_scans_verdict").on(t.subjectType, t.verdict, t.scannedAt.desc().nullsFirst()),
  index("idx_content_scans_owner").on(t.ownerUserId),
  check("content_scans_subject_type_check", sql`${t.subjectType} IN ('video', 'video_frames', 'image', 'profile', 'video_personalization')`),
  check("content_scans_verdict_check", sql`${t.verdict} IN ('pass', 'block', 'unscreened')`),
  check("content_scans_override_check", sql`${t.overrideVerdict} IS NULL OR ${t.overrideVerdict} IN ('pass', 'block')`),
  index("idx_content_scans_reviewed_by").on(t.reviewedBy),
]);

export type ContentScanRow = typeof contentScans.$inferSelect;
