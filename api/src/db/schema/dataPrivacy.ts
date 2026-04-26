/**
 * GDPR / CCPA / UK-DPA compliance rails for the sourcing layer.
 *
 * `data_subject_requests` covers the full set of rights enumerated by
 * GDPR Art.15-21 plus CCPA §1798.105 — access, erasure, rectification,
 * portability, objection, opt-out. Public submission, SuperAdmin
 * processing. Request body is hashed-email-keyed so we can match against
 * sourced_people without storing the raw address on an index.
 *
 * `data_suppression_list` is the post-erasure shield: once a subject
 * has requested erasure (or marked themselves opted-out via marketing),
 * their identifiers are recorded here. Every ingestion job MUST consult
 * this list before persisting a sourced person, and the resolver MUST
 * refuse lookups against suppressed identifiers.
 */

import {
  pgTable, uuid, text, varchar, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const dataSubjectRequests = pgTable("data_subject_requests", {
  id:                          uuid("id").primaryKey().defaultRandom(),
  requestType:                 varchar("request_type", { length: 24 }).notNull(),
  subjectEmail:                varchar("subject_email", { length: 320 }).notNull(),
  subjectEmailHash:            varchar("subject_email_hash", { length: 64 }).notNull(),
  identifiers:                 jsonb("identifiers").notNull().default([] as any),
  jurisdiction:                varchar("jurisdiction", { length: 32 }),
  notes:                       text("notes"),
  status:                      varchar("status", { length: 32 }).notNull().default("pending"),
  verificationToken:           varchar("verification_token", { length: 64 }),
  verificationCompletedAt:     timestamp("verification_completed_at", { withTimezone: true }),
  processedBy:                 uuid("processed_by"),
  processedAt:                 timestamp("processed_at", { withTimezone: true }),
  resultSummary:               text("result_summary"),
  createdAt:                   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:                   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dsr_email_hash_idx").on(t.subjectEmailHash),
  index("dsr_status_idx").on(t.status),
  index("dsr_created_idx").on(t.createdAt),
]);

export const dataSuppressionList = pgTable("data_suppression_list", {
  id:               uuid("id").primaryKey().defaultRandom(),
  identifierType:   varchar("identifier_type", { length: 32 }).notNull(),
  identifierValue:  varchar("identifier_value", { length: 512 }).notNull(),
  identifierHash:   varchar("identifier_hash", { length: 64 }),
  reason:           varchar("reason", { length: 32 }).notNull(),
  sourceDsrId:      uuid("source_dsr_id").references(() => dataSubjectRequests.id, { onDelete: "set null" }),
  addedBy:          uuid("added_by"),
  notes:            text("notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("suppression_unique_idx").on(t.identifierType, t.identifierValue),
  index("suppression_hash_idx").on(t.identifierHash),
]);

export type DataSubjectRequestRow = typeof dataSubjectRequests.$inferSelect;
export type DataSubjectRequestInsert = typeof dataSubjectRequests.$inferInsert;
export type DataSuppressionRow = typeof dataSuppressionList.$inferSelect;
export type DataSuppressionInsert = typeof dataSuppressionList.$inferInsert;
