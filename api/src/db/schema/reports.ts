/**
 * Content abuse reports (#152). Polymorphic target — `entityType` discriminator
 * matches the convention used by `reviews.subject_type` and `feed.subject_type`.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

// The single source of truth for these enums lives in
// `shared/moderation.ts` so the frontend dialog picker and the backend
// validator can't drift. Re-export here so existing callers don't have
// to rewire their imports.
export {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportEntityType,
  type ReportReason,
  type ReportStatus,
} from "../../../../shared/moderation.js";

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    // Snapshot of the entity's owner at report time. Nullable because the
    // owner resolver may not have a row for every entity kind (e.g. system
    // articles), and because legacy rows (#152 pre-#641) were inserted
    // before this column existed.
    entityOwnerId: uuid("entity_owner_id").references(() => users.id, { onDelete: "set null" }),
    reason: varchar("reason", { length: 32 }).notNull(),
    notes: text("notes"),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_content_reports_target").on(t.entityType, t.entityId),
    index("idx_content_reports_status").on(t.status, t.createdAt),
    index("idx_content_reports_reporter").on(t.reporterId, t.createdAt),
    index("idx_content_reports_owner").on(t.entityOwnerId, t.createdAt),
    uniqueIndex("uq_content_reports_active")
      .on(t.reporterId, t.entityType, t.entityId)
      .where(sql`${t.status} IN ('pending', 'reviewing')`),
  ],
);

export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
