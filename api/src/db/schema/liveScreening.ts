/**
 * ZipIntro-style live screening — see migration 0118 for the rationale.
 * Recruiter declares a window + slot length, the scheduler partitions
 * the window into back-to-back slots, and invites land in
 * live_screening_invites with their assigned slot + a tokenised public
 * accept URL.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";

export const liveScreeningSessions = pgTable("live_screening_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruiterId: uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  slotMinutes: integer("slot_minutes").default(8).notNull(),
  meetingUrl: text("meeting_url"),
  criteria: jsonb("criteria").default({}).notNull().$type<Record<string, unknown>>(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_live_screening_sessions_recruiter").on(t.recruiterId, t.startTime.desc().nullsFirst()),
  index("idx_live_screening_sessions_status_window").on(t.status, t.startTime),
  check("live_screening_sessions_slot_minutes_check", sql`${t.slotMinutes} BETWEEN 3 AND 60`),
]);

export type LiveScreeningSession = typeof liveScreeningSessions.$inferSelect;
export type NewLiveScreeningSession = typeof liveScreeningSessions.$inferInsert;

export const liveScreeningInvites = pgTable("live_screening_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => liveScreeningSessions.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => users.id, { onDelete: "set null" }),
  candidateName: varchar("candidate_name", { length: 255 }).notNull(),
  candidateEmail: varchar("candidate_email", { length: 255 }),
  slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
  slotEnd: timestamp("slot_end", { withTimezone: true }).notNull(),
  inviteToken: varchar("invite_token", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  responseNotes: text("response_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uniq_live_screening_invites_token").on(t.inviteToken),
  index("idx_live_screening_invites_session_slot").on(t.sessionId, t.slotStart),
  // #2305 — legacy UNIQUE (migration 0118_live_screening_sessions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uniq_live_screening_invites_session_candidate")
    .on(t.sessionId, t.candidateId)
    .where(sql`candidate_id IS NOT NULL`),
]);

export type LiveScreeningInvite = typeof liveScreeningInvites.$inferSelect;
export type NewLiveScreeningInvite = typeof liveScreeningInvites.$inferInsert;
