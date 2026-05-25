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
} from "drizzle-orm/pg-core";
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
});

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
});

export type LiveScreeningInvite = typeof liveScreeningInvites.$inferSelect;
export type NewLiveScreeningInvite = typeof liveScreeningInvites.$inferInsert;
