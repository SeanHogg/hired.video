/**
 * People Operations — extended surfaces (PO-3, PO-5..PO-11, TA-4..6). Split
 * from peopleOps.ts to keep each file readable. Same conventions: every table
 * is segment-scoped (tenant_id, segment_id), sub-collections are JSON to keep
 * the table count sane while preserving the spec's functionality.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  doublePrecision,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { peopleTenants, peopleSegments, peopleEmployees } from "./peopleOps.js";
import type { PulseQuestionDef } from "../../../../shared/people-ops.js";

const scoped = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => peopleTenants.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").notNull().references(() => peopleSegments.id, { onDelete: "cascade" }),
});
const stamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
}, (t) => ({ byStatus: index("idx_people_objectives_status").on(t.tenantId, t.segmentId, t.status) }));
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
}, (t) => ({ byObjective: index("idx_people_outcomes_objective").on(t.tenantId, t.segmentId, t.objectiveId) }));
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
}, (t) => ({ byObjective: index("idx_people_obj_milestones_objective").on(t.tenantId, t.segmentId, t.objectiveId) }));
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
}, (t) => ({ byStatus: index("idx_people_company_milestones_status").on(t.tenantId, t.segmentId, t.status) }));
export type PeopleCompanyMilestone = typeof peopleCompanyMilestones.$inferSelect;

// ── Performance Reviews (PO-3) — segment + roster-employee scoped ─────────────
export const peoplePerformanceReviews = pgTable("people_performance_reviews", {
  ...scoped(),
  employeeId: uuid("employee_id").notNull().references(() => peopleEmployees.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => peopleEmployees.id, { onDelete: "set null" }),
  reviewType: varchar("review_type", { length: 16 }).notNull().default("quarterly"),
  status: varchar("status", { length: 16 }).notNull().default("scheduled"),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
  completedDate: timestamp("completed_date", { withTimezone: true }),
  periodLabel: varchar("period_label", { length: 60 }),
  rating: doublePrecision("rating"),
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  comments: text("comments"),
  ...stamps(),
}, (t) => ({
  byEmployee: index("idx_people_reviews_employee").on(t.tenantId, t.segmentId, t.employeeId),
  byStatus: index("idx_people_reviews_status").on(t.tenantId, t.segmentId, t.status),
}));
export type PeoplePerformanceReview = typeof peoplePerformanceReviews.$inferSelect;

// ── Pulse Checks (PO-6) ──────────────────────────────────────────────────────
export const peoplePulseChecks = pgTable("people_pulse_checks", {
  ...scoped(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  frequency: varchar("frequency", { length: 16 }).notNull().default("weekly"),
  questions: jsonb("questions").$type<PulseQuestionDef[]>().default([]).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({ byActive: index("idx_people_pulse_active").on(t.tenantId, t.segmentId, t.isActive) }));
export type PeoplePulseCheck = typeof peoplePulseChecks.$inferSelect;

export const peoplePulseResponses = pgTable("people_pulse_responses", {
  ...scoped(),
  pulseCheckId: uuid("pulse_check_id").notNull().references(() => peoplePulseChecks.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => peopleEmployees.id, { onDelete: "set null" }),
  responses: jsonb("responses").$type<Record<string, unknown>>().default({}).notNull(),
  sentiment: doublePrecision("sentiment"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byCheck: index("idx_people_pulse_responses_check").on(t.tenantId, t.segmentId, t.pulseCheckId) }));
export type PeoplePulseResponse = typeof peoplePulseResponses.$inferSelect;

// ── Scheduled Check-ins (PO-6) — cron-driven ─────────────────────────────────
export const peopleScheduledCheckIns = pgTable("people_scheduled_check_ins", {
  ...scoped(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  frequency: varchar("frequency", { length: 16 }).notNull().default("weekly"),
  dayOfWeek: integer("day_of_week"),
  time: varchar("time", { length: 8 }).notNull().default("09:00"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  questions: jsonb("questions").$type<PulseQuestionDef[]>().default([]).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({ byDue: index("idx_people_checkins_due").on(t.tenantId, t.segmentId, t.isActive, t.nextScheduledAt) }));
export type PeopleScheduledCheckIn = typeof peopleScheduledCheckIns.$inferSelect;

export const peopleCheckInResponses = pgTable("people_check_in_responses", {
  ...scoped(),
  checkInId: uuid("check_in_id").notNull().references(() => peopleScheduledCheckIns.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => peopleEmployees.id, { onDelete: "set null" }),
  responses: jsonb("responses").$type<Record<string, unknown>>().default({}).notNull(),
  sentiment: doublePrecision("sentiment"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byCheckIn: index("idx_people_checkin_responses_checkin").on(t.tenantId, t.segmentId, t.checkInId) }));
export type PeopleCheckInResponse = typeof peopleCheckInResponses.$inferSelect;

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
}, (t) => ({ byDate: index("idx_people_syncs_date").on(t.tenantId, t.segmentId, t.scheduledDate) }));
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
}, (t) => ({ byCategory: index("idx_people_scorecards_category").on(t.tenantId, t.segmentId, t.category) }));
export type PeopleScorecard = typeof peopleScorecards.$inferSelect;

export const peopleScorecardSnapshots = pgTable("people_scorecard_snapshots", {
  ...scoped(),
  scorecardId: uuid("scorecard_id").notNull().references(() => peopleScorecards.id, { onDelete: "cascade" }),
  period: timestamp("period", { withTimezone: true }).notNull(),
  values: jsonb("values").$type<Record<string, number>>().default({}).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScorecard: index("idx_people_scorecard_snapshots").on(t.tenantId, t.segmentId, t.scorecardId, t.period) }));
export type PeopleScorecardSnapshot = typeof peopleScorecardSnapshots.$inferSelect;

// ── Meeting Intelligence (PO-9) ──────────────────────────────────────────────
export const peopleMeetingTranscripts = pgTable("people_meeting_transcripts", {
  ...scoped(),
  title: varchar("title", { length: 300 }).notNull(),
  meetingType: varchar("meeting_type", { length: 24 }).notNull().default("meeting"),
  transcript: text("transcript").notNull(),
  summary: text("summary"),
  keyPoints: jsonb("key_points").$type<string[]>(),
  actionItems: jsonb("action_items").$type<string[]>(),
  decisions: jsonb("decisions").$type<string[]>(),
  participants: jsonb("participants").$type<string[]>().default([]).notNull(),
  duration: integer("duration"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  ...stamps(),
}, (t) => ({ byRecorded: index("idx_people_transcripts_recorded").on(t.tenantId, t.segmentId, t.recordedAt) }));
export type PeopleMeetingTranscript = typeof peopleMeetingTranscripts.$inferSelect;

// ── Workflow Automation (PO-10) ──────────────────────────────────────────────
export const peopleWorkflowTriggers = pgTable("people_workflow_triggers", {
  ...scoped(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  triggerType: varchar("trigger_type", { length: 16 }).notNull().default("manual"),
  conditions: jsonb("conditions").$type<Record<string, unknown>>().default({}).notNull(),
  actions: jsonb("actions").$type<{ type: string; config: Record<string, unknown>; order: number }[]>().default([]).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({ byActive: index("idx_people_workflow_triggers_active").on(t.tenantId, t.segmentId, t.isActive) }));
export type PeopleWorkflowTrigger = typeof peopleWorkflowTriggers.$inferSelect;

export const peopleWorkflowExecutions = pgTable("people_workflow_executions", {
  ...scoped(),
  triggerId: uuid("trigger_id").notNull().references(() => peopleWorkflowTriggers.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  results: jsonb("results").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
}, (t) => ({ byTrigger: index("idx_people_workflow_exec_trigger").on(t.tenantId, t.segmentId, t.triggerId, t.startedAt) }));
export type PeopleWorkflowExecution = typeof peopleWorkflowExecutions.$inferSelect;

// ── Talent-cost: TCO settings (TA-4) ─────────────────────────────────────────
export const peopleTcoSettings = pgTable("people_tco_settings", {
  ...scoped(),
  payrollTaxesPct: doublePrecision("payroll_taxes_pct").notNull().default(0.08),
  benefitsPct: doublePrecision("benefits_pct").notNull().default(0.25),
  perksPct: doublePrecision("perks_pct").notNull().default(0.07),
  overheadPct: doublePrecision("overhead_pct").notNull().default(0.07),
  /** Runway inputs (0440) — null until the segment enters them. */
  cashOnHandCents: bigint("cash_on_hand_cents", { mode: "number" }),
  monthlyBurnCents: bigint("monthly_burn_cents", { mode: "number" }),
  ...stamps(),
}, (t) => ({
  uqSegment: uniqueIndex("uq_people_tco_segment").on(t.tenantId, t.segmentId),
  runwayNonnegCheck: check("people_tco_settings_runway_nonneg_check", sql`(${t.cashOnHandCents} IS NULL OR ${t.cashOnHandCents} >= 0) AND (${t.monthlyBurnCents} IS NULL OR ${t.monthlyBurnCents} >= 0)`),
}));
export type PeopleTcoSettings = typeof peopleTcoSettings.$inferSelect;

// ── Headcount Planning (TA-5) ────────────────────────────────────────────────
export const peopleRoleDefinitions = pgTable("people_role_definitions", {
  ...scoped(),
  title: varchar("title", { length: 200 }).notNull(),
  department: varchar("department", { length: 120 }).notNull().default(""),
  level: varchar("level", { length: 60 }),
  baseSalaryCents: bigint("base_salary_cents", { mode: "number" }).notNull().default(0),
  equityShares: integer("equity_shares"),
  isActive: boolean("is_active").notNull().default(true),
  ...stamps(),
}, (t) => ({ byActive: index("idx_people_roles_active").on(t.tenantId, t.segmentId, t.isActive) }));
export type PeopleRoleDefinition = typeof peopleRoleDefinitions.$inferSelect;

export const peopleHeadcountPlans = pgTable("people_headcount_plans", {
  ...scoped(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  fiscalYear: varchar("fiscal_year", { length: 12 }),
  totalHeadcount: integer("total_headcount").notNull().default(0),
  totalCostCents: bigint("total_cost_cents", { mode: "number" }).notNull().default(0),
  departmentBreakdown: jsonb("department_breakdown").$type<Record<string, number>>().default({}).notNull(),
  plannedHires: jsonb("planned_hires").$type<Record<string, unknown>[]>().default([]).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  createdBy: uuid("created_by").notNull(),
  ...stamps(),
}, (t) => ({ byStatus: index("idx_people_headcount_status").on(t.tenantId, t.segmentId, t.status) }));
export type PeopleHeadcountPlan = typeof peopleHeadcountPlans.$inferSelect;

// ── PTO (TA-6) ───────────────────────────────────────────────────────────────
export const peoplePtoRequests = pgTable("people_pto_requests", {
  ...scoped(),
  employeeId: uuid("employee_id").notNull().references(() => peopleEmployees.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 16 }).notNull().default("vacation"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  days: doublePrecision("days").notNull().default(1),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  notes: text("notes"),
  ...stamps(),
}, (t) => ({
  byEmployee: index("idx_people_pto_employee").on(t.tenantId, t.segmentId, t.employeeId),
  byStatus: index("idx_people_pto_status").on(t.tenantId, t.segmentId, t.status),
}));
export type PeoplePtoRequest = typeof peoplePtoRequests.$inferSelect;
