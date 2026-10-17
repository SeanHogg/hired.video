/**
 * People Operations — planning & automation (PO-10, TA-4..6): workflow
 * triggers/executions, talent-cost (TCO) settings, role definitions +
 * headcount plans, and PTO requests. Segment-scoped like every people_*
 * table; split out of the former peopleOpsExt.ts (2026-10-17).
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
import { peopleEmployees } from "./peopleOps.js";
import { scoped, stamps } from "./peopleOpsColumns.js";

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
}, (t) => ({
  byActive: index("idx_people_workflow_triggers_active").on(t.tenantId, t.segmentId, t.isActive),
  segmentIdFkIdx: index("idx_people_workflow_triggers_segment_id").on(t.segmentId),
}));
export type PeopleWorkflowTrigger = typeof peopleWorkflowTriggers.$inferSelect;

export const peopleWorkflowExecutions = pgTable("people_workflow_executions", {
  ...scoped(),
  triggerId: uuid("trigger_id").notNull().references(() => peopleWorkflowTriggers.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  results: jsonb("results").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
}, (t) => ({
  byTrigger: index("idx_people_workflow_exec_trigger").on(t.tenantId, t.segmentId, t.triggerId, t.startedAt),
  segmentIdFkIdx: index("idx_people_workflow_executions_segment_id").on(t.segmentId),
  triggerIdFkIdx: index("idx_people_workflow_executions_trigger_id").on(t.triggerId),
}));
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
  segmentIdFkIdx: index("idx_people_tco_settings_segment_id").on(t.segmentId),
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
}, (t) => ({
  byActive: index("idx_people_roles_active").on(t.tenantId, t.segmentId, t.isActive),
  segmentIdFkIdx: index("idx_people_role_definitions_segment_id").on(t.segmentId),
}));
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
}, (t) => ({
  byStatus: index("idx_people_headcount_status").on(t.tenantId, t.segmentId, t.status),
  segmentIdFkIdx: index("idx_people_headcount_plans_segment_id").on(t.segmentId),
}));
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
  employeeIdFkIdx: index("idx_people_pto_requests_employee_id").on(t.employeeId),
  segmentIdFkIdx: index("idx_people_pto_requests_segment_id").on(t.segmentId),
}));
export type PeoplePtoRequest = typeof peoplePtoRequests.$inferSelect;
