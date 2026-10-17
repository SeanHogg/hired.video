import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { talentPoolCandidates } from "./recruiter.js";
import { FOLLOW_UP_SEQUENCE_KINDS } from "../../../../shared/follow-up-sequences.js";

const FOLLOW_UP_SEQUENCE_KINDS_SQL = sql.raw(FOLLOW_UP_SEQUENCE_KINDS.map((v) => `'${v}'`).join(", "));

// ---------------------------------------------------------------------------
// Sequence engine (ONE engine since migration 0636)
// A sequence defines a series of timed messages for a recipient. `kind`
// separates nurture drips (/api/followups) from recruiter outreach
// cadences (/api/recruiter/sequences — formerly recruiter_outreach_*).
// ---------------------------------------------------------------------------
export const followUpSequences = pgTable("follow_up_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** nurture | recruiter_outreach — shared/follow-up-sequences.ts */
  kind: varchar("kind", { length: 24 }).default("nurture").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_follow_up_sequences_user").on(t.userId),
  check("follow_up_sequences_kind_check", sql`${t.kind} IN (${FOLLOW_UP_SEQUENCE_KINDS_SQL})`),
]);

export type FollowUpSequence = typeof followUpSequences.$inferSelect;
export type NewFollowUpSequence = typeof followUpSequences.$inferInsert;

// Individual steps within a sequence
export const followUpSteps = pgTable("follow_up_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1), // 1-based
  delayDays: integer("delay_days").notNull().default(3), // days after previous step
  /** Optional for recruiter outreach steps (sender falls back to a default). */
  subject: varchar("subject", { length: 500 }),
  bodyTemplate: text("body_template").notNull(), // supports {{name}}, {{company}} placeholders
  channel: varchar("channel", { length: 50 }).default("email").notNull(), // email | message | sms
  // When true, the sender runs the rendered body through the AI personalization
  // layer (services/outreach/personalize.ts) before delivery. Defaults false so
  // existing steps keep their deterministic-template behaviour. Migration 0213.
  aiPersonalize: boolean("ai_personalize").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_follow_up_steps_sequence").on(t.sequenceId),
]);

export type FollowUpStep = typeof followUpSteps.$inferSelect;
export type NewFollowUpStep = typeof followUpSteps.$inferInsert;

// Tracks enrollment of a recipient in a sequence. The recipient is either a
// raw email (nurture) or a talent-pool candidate (recruiter outreach — the
// address/name/company are read from the candidate at send time).
export const followUpEnrollments = pgTable("follow_up_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // who enrolled
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  talentPoolCandidateId: uuid("talent_pool_candidate_id").references(() => talentPoolCandidates.id, { onDelete: "cascade" }),
  context: jsonb("context").default({}), // extra substitution vars
  status: varchar("status", { length: 50 }).default("active").notNull(), // active | paused | completed | unsubscribed | cancelled
  currentStep: integer("current_step").default(0).notNull(),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_follow_up_enrollments_recipient_user_id").on(t.recipientUserId),
  index("idx_follow_up_enrollments_user_id").on(t.userId),
  index("idx_follow_up_enrollments_talent_pool_candidate_id").on(t.talentPoolCandidateId),
  index("idx_follow_up_enrollments_due").on(t.status, t.nextSendAt).where(sql`status = 'active'`),
  // One enrollment per candidate per sequence (NULL candidate = nurture rows,
  // never conflict). Leads with sequence_id, so it also serves that FK.
  uniqueIndex("uq_follow_up_enrollments_sequence_candidate").on(t.sequenceId, t.talentPoolCandidateId),
  check(
    "follow_up_enrollments_recipient_check",
    sql`${t.recipientEmail} IS NOT NULL OR ${t.talentPoolCandidateId} IS NOT NULL`,
  ),
]);

export type FollowUpEnrollment = typeof followUpEnrollments.$inferSelect;
export type NewFollowUpEnrollment = typeof followUpEnrollments.$inferInsert;

// Log of sent follow-up messages
export const followUpLogs = pgTable("follow_up_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => followUpEnrollments.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").references(() => followUpSteps.id, { onDelete: "set null" }),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("sent").notNull(), // sent | failed | opened | clicked
  errorMessage: text("error_message"),
}, (t) => [
  index("idx_follow_up_logs_enrollment_id").on(t.enrollmentId),
  index("idx_follow_up_logs_step_id").on(t.stepId),
]);

export type FollowUpLog = typeof followUpLogs.$inferSelect;
export type NewFollowUpLog = typeof followUpLogs.$inferInsert;
