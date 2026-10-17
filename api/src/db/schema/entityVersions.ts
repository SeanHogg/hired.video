/**
 * `entity_versions` — ONE polymorphic snapshot-history table (W3-E,
 * migration 0640) replacing resume_versions, article_versions and
 * studio_project_versions. Old row ids were carried over, so version ids in
 * URLs / client state keep resolving.
 *
 * `subject_type` / `subject_id` name the versioned document (registry:
 * shared/entity-version-subjects.ts). There is no FK to the subject; the
 * `entity_versions_subject_deleted` triggers (0640) delete a subject's
 * versions when the subject row goes, mirroring the old per-table cascades.
 *
 * `version_number` increases monotonically per subject (unique). Autosave
 * rows churn (cap + retention enforced by EntityVersionRepository.pruneAutosaves);
 * labelled snapshots live until the subject is deleted.
 *
 * Résumé-only columns (reviewer-proposed drafts, #1946): proposed_by_user_id,
 * review_id, proposal_status — null on every other row.
 *
 * Payloads stay in jsonb: the single-statement INSERT … SELECT snapshot and
 * the one-statement prune both need the payload in-row (see 0640 header).
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import {
  ENTITY_VERSION_SUBJECT_TYPES,
  ENTITY_VERSION_PROPOSAL_STATUSES,
} from "../../../../shared/entity-version-subjects.js";
import { sqlInList } from "../../../../shared/engagement-subjects.js";

const SUBJECT_TYPES_SQL = sql.raw(sqlInList(ENTITY_VERSION_SUBJECT_TYPES));
const PROPOSAL_STATUSES_SQL = sql.raw(sqlInList(ENTITY_VERSION_PROPOSAL_STATUSES));

export const entityVersions = pgTable(
  "entity_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    label: varchar("label", { length: 120 }),
    payload: jsonb("payload").notNull(),
    isAutosave: boolean("is_autosave").default(false).notNull(),
    proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewId: uuid("review_id"),
    proposalStatus: varchar("proposal_status", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_entity_versions_subject_version").on(t.subjectType, t.subjectId, t.versionNumber),
    index("idx_entity_versions_subject").on(t.subjectType, t.subjectId, t.createdAt.desc().nullsFirst()),
    index("idx_entity_versions_user_id").on(t.userId),
    index("idx_entity_versions_proposed_by_user_id").on(t.proposedByUserId),
    index("idx_entity_versions_review").on(t.reviewId).where(sql`review_id IS NOT NULL`),
    check("entity_versions_subject_type_check", sql`${t.subjectType} IN (${SUBJECT_TYPES_SQL})`),
    check(
      "entity_versions_proposal_status_check",
      sql`${t.proposalStatus} IS NULL OR ${t.proposalStatus} IN (${PROPOSAL_STATUSES_SQL})`,
    ),
  ],
);

export type EntityVersion = typeof entityVersions.$inferSelect;
export type NewEntityVersion = typeof entityVersions.$inferInsert;
