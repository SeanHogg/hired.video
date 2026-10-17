import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Hiring & Onboarding — Offer Letters + Onboarding Checklists
// ---------------------------------------------------------------------------
export const offerLetters = pgTable("offer_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateUserId: uuid("candidate_user_id").references(() => users.id, { onDelete: "set null" }),
  candidateName: varchar("candidate_name", { length: 255 }).notNull(),
  candidateEmail: varchar("candidate_email", { length: 255 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  salary: numeric("salary"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  startDate: timestamp("start_date", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  bodyHtml: text("body_html").notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft | sent | viewed | accepted | declined | expired
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signatureData: text("signature_data"), // base64 signature image or e-sign token
  declineReason: text("decline_reason"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("offer_letters_created_by_idx").on(t.createdByUserId, t.createdAt.desc().nullsFirst()),
  index("offer_letters_candidate_idx").on(t.candidateUserId),
]);

export type OfferLetter = typeof offerLetters.$inferSelect;
export type NewOfferLetter = typeof offerLetters.$inferInsert;

// Onboarding checklists assigned to new hires
export const onboardingChecklists = pgTable("onboarding_checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateUserId: uuid("candidate_user_id").references(() => users.id, { onDelete: "set null" }),
  offerLetterId: uuid("offer_letter_id").references(() => offerLetters.id, { onDelete: "set null" }),
  candidateName: varchar("candidate_name", { length: 255 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }),
  startDate: timestamp("start_date", { withTimezone: true }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | in_progress | completed
  // Stored as numeric; default expressed as the string '0' because that's
  // what Drizzle's numeric() builder accepts (Postgres casts it on insert).
  // A CHECK 0..100 lives in migration 0142.
  completionPercentage: numeric("completion_percentage").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("onboarding_checklists_created_by_idx").on(t.createdByUserId, t.createdAt.desc().nullsFirst()),
  index("onboarding_checklists_candidate_idx").on(t.candidateUserId),
  check("onboarding_checklists_completion_pct_range", sql`${t.completionPercentage} IS NULL OR (${t.completionPercentage} >= 0 AND ${t.completionPercentage} <= 100)`),
  index("idx_onboarding_checklists_offer_letter_id").on(t.offerLetterId),
]);

export type OnboardingChecklist = typeof onboardingChecklists.$inferSelect;
export type NewOnboardingChecklist = typeof onboardingChecklists.$inferInsert;

// Individual checklist tasks
export const onboardingTasks = pgTable("onboarding_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  checklistId: uuid("checklist_id").notNull().references(() => onboardingChecklists.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).default("general"), // paperwork | equipment | access | training | intro
  dueDate: timestamp("due_date", { withTimezone: true }),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  sortOrder: numeric("sort_order").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("onboarding_tasks_checklist_idx").on(t.checklistId, t.sortOrder),
  index("idx_onboarding_tasks_completed_by_user_id").on(t.completedByUserId),
]);

export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export type NewOnboardingTask = typeof onboardingTasks.$inferInsert;
