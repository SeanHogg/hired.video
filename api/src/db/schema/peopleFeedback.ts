/**
 * People Operations — feedback loops (PO-3, PO-6, PO-9): performance
 * reviews, pulse checks, scheduled check-ins and meeting transcripts.
 * Segment-scoped like every people_* table; split out of the former
 * peopleOpsExt.ts (2026-10-17).
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
import { peopleEmployees } from "./peopleOps.js";
import { scoped, stamps } from "./peopleOpsColumns.js";
import type { PulseQuestionDef } from "../../../../shared/people-ops.js";

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
  employeeIdFkIdx: index("idx_people_performance_reviews_employee_id").on(t.employeeId),
  reviewerIdFkIdx: index("idx_people_performance_reviews_reviewer_id").on(t.reviewerId),
  segmentIdFkIdx: index("idx_people_performance_reviews_segment_id").on(t.segmentId),
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
}, (t) => ({
  byActive: index("idx_people_pulse_active").on(t.tenantId, t.segmentId, t.isActive),
  segmentIdFkIdx: index("idx_people_pulse_checks_segment_id").on(t.segmentId),
}));
export type PeoplePulseCheck = typeof peoplePulseChecks.$inferSelect;

export const peoplePulseResponses = pgTable("people_pulse_responses", {
  ...scoped(),
  pulseCheckId: uuid("pulse_check_id").notNull().references(() => peoplePulseChecks.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => peopleEmployees.id, { onDelete: "set null" }),
  responses: jsonb("responses").$type<Record<string, unknown>>().default({}).notNull(),
  sentiment: doublePrecision("sentiment"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byCheck: index("idx_people_pulse_responses_check").on(t.tenantId, t.segmentId, t.pulseCheckId),
  employeeIdFkIdx: index("idx_people_pulse_responses_employee_id").on(t.employeeId),
  pulseCheckIdFkIdx: index("idx_people_pulse_responses_pulse_check_id").on(t.pulseCheckId),
  segmentIdFkIdx: index("idx_people_pulse_responses_segment_id").on(t.segmentId),
}));
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
}, (t) => ({
  byDue: index("idx_people_checkins_due").on(t.tenantId, t.segmentId, t.isActive, t.nextScheduledAt),
  segmentIdFkIdx: index("idx_people_scheduled_check_ins_segment_id").on(t.segmentId),
}));
export type PeopleScheduledCheckIn = typeof peopleScheduledCheckIns.$inferSelect;

export const peopleCheckInResponses = pgTable("people_check_in_responses", {
  ...scoped(),
  checkInId: uuid("check_in_id").notNull().references(() => peopleScheduledCheckIns.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => peopleEmployees.id, { onDelete: "set null" }),
  responses: jsonb("responses").$type<Record<string, unknown>>().default({}).notNull(),
  sentiment: doublePrecision("sentiment"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byCheckIn: index("idx_people_checkin_responses_checkin").on(t.tenantId, t.segmentId, t.checkInId),
  checkInIdFkIdx: index("idx_people_check_in_responses_check_in_id").on(t.checkInId),
  employeeIdFkIdx: index("idx_people_check_in_responses_employee_id").on(t.employeeId),
  segmentIdFkIdx: index("idx_people_check_in_responses_segment_id").on(t.segmentId),
}));
export type PeopleCheckInResponse = typeof peopleCheckInResponses.$inferSelect;

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
}, (t) => ({
  byRecorded: index("idx_people_transcripts_recorded").on(t.tenantId, t.segmentId, t.recordedAt),
  segmentIdFkIdx: index("idx_people_meeting_transcripts_segment_id").on(t.segmentId),
}));
export type PeopleMeetingTranscript = typeof peopleMeetingTranscripts.$inferSelect;
