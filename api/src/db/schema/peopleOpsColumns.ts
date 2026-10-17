/**
 * Shared column sets for the segment-scoped People Operations tables
 * (peopleObjectives.ts, peopleFeedback.ts, peoplePlanning.ts). Every such
 * table is scoped to (tenant_id, segment_id); sub-collections are JSON to keep
 * the table count sane while preserving the spec's functionality.
 *
 * Not re-exported from the schema barrel — helpers, not tables.
 */
import { uuid, timestamp } from "drizzle-orm/pg-core";
import { peopleTenants, peopleSegments } from "./peopleOps.js";

export const scoped = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => peopleTenants.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").notNull().references(() => peopleSegments.id, { onDelete: "cascade" }),
});

export const stamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
