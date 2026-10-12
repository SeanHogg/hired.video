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
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Automated Follow-up Sequences
// A sequence defines a series of timed follow-up messages for a recipient.
// ---------------------------------------------------------------------------
export const followUpSequences = pgTable("follow_up_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_follow_up_sequences_user").on(t.userId),
]);

export type FollowUpSequence = typeof followUpSequences.$inferSelect;
export type NewFollowUpSequence = typeof followUpSequences.$inferInsert;

// Individual steps within a sequence
export const followUpSteps = pgTable("follow_up_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(1),
  delayDays: integer("delay_days").notNull().default(3), // days after previous step
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyTemplate: text("body_template").notNull(), // supports {{name}}, {{company}} placeholders
  channel: varchar("channel", { length: 50 }).default("email").notNull(), // email | message
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

// Tracks enrollment of a recipient in a sequence
export const followUpEnrollments = pgTable("follow_up_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // who enrolled
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  context: jsonb("context").default({}), // extra substitution vars
  status: varchar("status", { length: 50 }).default("active").notNull(), // active | paused | completed | unsubscribed
  currentStep: integer("current_step").default(0).notNull(),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
});

export type FollowUpLog = typeof followUpLogs.$inferSelect;
export type NewFollowUpLog = typeof followUpLogs.$inferInsert;
