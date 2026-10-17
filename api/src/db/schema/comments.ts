/**
 * `comments` — ONE polymorphic comment table (W3-A, migration 0581) replacing
 * booking_comments, feed_post_comments, review_comments and
 * studio_review_comments. Old row ids were carried over, so reply links,
 * URLs and `reactions(subject_type='comment')` keep resolving.
 *
 * `subject_type` / `subject_id` name the thread's owner (registry:
 * shared/engagement-subjects.ts). There is no FK to the subject; the
 * `comments_subject_deleted` triggers (0581) delete a subject's comments
 * when the subject row goes, mirroring the old per-table cascades.
 *
 * Per-surface columns are nullable / defaulted and only meaningful for
 * their surface:
 *   booking_reservation — author_kind ('host' | 'booker')
 *   review              — is_subject_owner, status
 *   studio_project      — author_name, author_email (anonymous share-link
 *                         reviewers have no user), timestamp_sec, resolved
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  real,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { COMMENT_SUBJECT_TYPES, sqlInList } from "../../../../shared/engagement-subjects.js";

const COMMENT_SUBJECT_TYPES_SQL = sql.raw(sqlInList(COMMENT_SUBJECT_TYPES));

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    // Threaded replies; deleting a comment deletes its replies.
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    // Null for anonymous studio share-link reviewers and booking bookers.
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "cascade" }),
    authorKind: varchar("author_kind", { length: 8 }),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    timestampSec: real("timestamp_sec"),
    resolved: boolean("resolved").notNull().default(false),
    isSubjectOwner: boolean("is_subject_owner").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_comments_subject").on(t.subjectType, t.subjectId, t.createdAt.desc().nullsFirst()),
    index("idx_comments_parent_id").on(t.parentId),
    index("idx_comments_author_user_id").on(t.authorUserId),
    check("comments_subject_type_check", sql`${t.subjectType} IN (${COMMENT_SUBJECT_TYPES_SQL})`),
    check("comments_author_kind_check", sql`${t.authorKind} IS NULL OR ${t.authorKind} IN ('host', 'booker')`),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
