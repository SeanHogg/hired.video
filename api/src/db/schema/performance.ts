import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Performance Management
// ---------------------------------------------------------------------------

// Performance review cycles (quarterly, annual, etc.)
export const performanceCycles = pgTable("performance_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(), // e.g. "Q1 2026 Review"
  type: varchar("type", { length: 50 }).default("quarterly").notNull(), // quarterly | annual | mid-year | probationary
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // draft | active | completed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_performance_cycles_created_by_user_id").on(t.createdByUserId),
]);

export type PerformanceCycle = typeof performanceCycles.$inferSelect;
export type NewPerformanceCycle = typeof performanceCycles.$inferInsert;

// Goals and reviews live in the segment-scoped People Ops engine
// (people_goals / people_performance_reviews, cycle_id -> performance_cycles).
// The user-scoped performance_goals / performance_reviews were merged into
// them and archived (migrations 0634/0635).
