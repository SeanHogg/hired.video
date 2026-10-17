/**
 * People Operations — objectives & team metrics (PO-5, PO-7): strategic
 * objectives with outcomes + milestones, company milestones, weekly syncs and
 * team-metric scorecards. Segment-scoped like every people_* table; split out
 * of the former peopleOpsExt.ts (2026-10-17).
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { scoped, stamps } from "./peopleOpsColumns.js";

// ── Strategic Objectives & Milestones (PO-5) ─────────────────────────────────
export const peopleStrategicObjectives = pgTable("people_strategic_objectives", {
  ...scoped(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 24 }).notNull().default("strategic"),
  timeframe: varchar("timeframe", { length: 16 }).notNull().default("quarterly"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  priority: integer("priority").notNull().default(1),
  ownerId: uuid("owner_id"),
  progress: integer("progress").notNull().default(0),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({
  byStatus: index("idx_people_objectives_status").on(t.tenantId, t.segmentId, t.status),
  segmentIdFkIdx: index("idx_people_strategic_objectives_segment_id").on(t.segmentId),
}));
export type PeopleStrategicObjective = typeof peopleStrategicObjectives.$inferSelect;

export const peopleObjectiveOutcomes = pgTable("people_objective_outcomes", {
  ...scoped(),
  objectiveId: uuid("objective_id").notNull().references(() => peopleStrategicObjectives.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  targetValue: doublePrecision("target_value"),
  currentValue: doublePrecision("current_value"),
  unit: varchar("unit", { length: 40 }),
  status: varchar("status", { length: 16 }).notNull().default("not_started"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  ...stamps(),
}, (t) => ({
  byObjective: index("idx_people_outcomes_objective").on(t.tenantId, t.segmentId, t.objectiveId),
  objectiveIdFkIdx: index("idx_people_objective_outcomes_objective_id").on(t.objectiveId),
  segmentIdFkIdx: index("idx_people_objective_outcomes_segment_id").on(t.segmentId),
}));
export type PeopleObjectiveOutcome = typeof peopleObjectiveOutcomes.$inferSelect;

export const peopleObjectiveMilestones = pgTable("people_objective_milestones", {
  ...scoped(),
  objectiveId: uuid("objective_id").notNull().references(() => peopleStrategicObjectives.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...stamps(),
}, (t) => ({
  byObjective: index("idx_people_obj_milestones_objective").on(t.tenantId, t.segmentId, t.objectiveId),
  objectiveIdFkIdx: index("idx_people_objective_milestones_objective_id").on(t.objectiveId),
  segmentIdFkIdx: index("idx_people_objective_milestones_segment_id").on(t.segmentId),
}));
export type PeopleObjectiveMilestone = typeof peopleObjectiveMilestones.$inferSelect;

export const peopleCompanyMilestones = pgTable("people_company_milestones", {
  ...scoped(),
  objectiveId: uuid("objective_id"),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 24 }).notNull().default("product"),
  targetDate: timestamp("target_date", { withTimezone: true }),
  completedDate: timestamp("completed_date", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("not_started"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  progress: integer("progress").notNull().default(0),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({
  byStatus: index("idx_people_company_milestones_status").on(t.tenantId, t.segmentId, t.status),
  segmentIdFkIdx: index("idx_people_company_milestones_segment_id").on(t.segmentId),
}));
export type PeopleCompanyMilestone = typeof peopleCompanyMilestones.$inferSelect;

// ── Weekly Syncs (PO-7) ──────────────────────────────────────────────────────
export const peopleWeeklySyncs = pgTable("people_weekly_syncs", {
  ...scoped(),
  title: varchar("title", { length: 200 }).notNull(),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  duration: integer("duration").notNull().default(60),
  status: varchar("status", { length: 16 }).notNull().default("scheduled"),
  meetingLink: text("meeting_link"),
  agenda: jsonb("agenda").$type<{ title: string; description?: string; order: number; status?: string }[]>().default([]).notNull(),
  metrics: jsonb("metrics").$type<{ name: string; value: number; unit?: string; trend?: string }[]>().default([]).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({
  byDate: index("idx_people_syncs_date").on(t.tenantId, t.segmentId, t.scheduledDate),
  segmentIdFkIdx: index("idx_people_weekly_syncs_segment_id").on(t.segmentId),
}));
export type PeopleWeeklySync = typeof peopleWeeklySyncs.$inferSelect;

// ── Team-metric Scorecards (PO-7) — distinct from recruiting scorecards ───────
export const peopleScorecards = pgTable("people_scorecards", {
  ...scoped(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 16 }).notNull().default("kpi"),
  metrics: jsonb("metrics").$type<{ id: string; name: string; unit?: string; targetValue?: number; order: number }[]>().default([]).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({
  byCategory: index("idx_people_scorecards_category").on(t.tenantId, t.segmentId, t.category),
  segmentIdFkIdx: index("idx_people_scorecards_segment_id").on(t.segmentId),
}));
export type PeopleScorecard = typeof peopleScorecards.$inferSelect;

export const peopleScorecardSnapshots = pgTable("people_scorecard_snapshots", {
  ...scoped(),
  scorecardId: uuid("scorecard_id").notNull().references(() => peopleScorecards.id, { onDelete: "cascade" }),
  period: timestamp("period", { withTimezone: true }).notNull(),
  values: jsonb("values").$type<Record<string, number>>().default({}).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byScorecard: index("idx_people_scorecard_snapshots").on(t.tenantId, t.segmentId, t.scorecardId, t.period),
  scorecardIdFkIdx: index("idx_people_scorecard_snapshots_scorecard_id").on(t.scorecardId),
  segmentIdFkIdx: index("idx_people_scorecard_snapshots_segment_id").on(t.segmentId),
}));
export type PeopleScorecardSnapshot = typeof peopleScorecardSnapshots.$inferSelect;
