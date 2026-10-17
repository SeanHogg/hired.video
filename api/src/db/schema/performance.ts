import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
  integer,
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

// Individual performance reviews for an employee within a cycle
export const performanceReviews = pgTable("performance_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id").notNull().references(() => performanceCycles.id, { onDelete: "cascade" }),
  revieweeUserId: uuid("reviewee_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | in_progress | submitted | acknowledged
  overallRating: numeric("overall_rating"), // 1-5
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: jsonb("goals").default([]), // array of {goal, status, notes}
  ratings: jsonb("ratings").default({}), // category -> score map
  reviewerNotes: text("reviewer_notes"),
  revieweeResponse: text("reviewee_response"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_performance_reviews_cycle_id").on(t.cycleId),
  index("idx_performance_reviews_reviewee_user_id").on(t.revieweeUserId),
  index("idx_performance_reviews_reviewer_user_id").on(t.reviewerUserId),
]);

export type PerformanceReview = typeof performanceReviews.$inferSelect;
export type NewPerformanceReview = typeof performanceReviews.$inferInsert;

// Goals / OKRs
export const performanceGoals = pgTable("performance_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: uuid("cycle_id").references(() => performanceCycles.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).default("professional"), // professional | personal | team
  targetDate: timestamp("target_date", { withTimezone: true }),
  progressPercentage: integer("progress_percentage").default(0).notNull(),
  status: varchar("status", { length: 50 }).default("in_progress").notNull(), // in_progress | completed | cancelled
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_performance_goals_cycle_id").on(t.cycleId),
  index("idx_performance_goals_user_id").on(t.userId),
]);

export type PerformanceGoal = typeof performanceGoals.$inferSelect;
export type NewPerformanceGoal = typeof performanceGoals.$inferInsert;
