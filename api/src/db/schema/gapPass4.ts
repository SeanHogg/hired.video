/**
 * Schema additions for the fourth multi-gap pass (migration 0182):
 *
 *   job_view_events       — #863 per-view geo / referrer / source for jobs
 *   company_view_events   — #863 same shape for company profiles
 *   take_home_invites     — #1386 candidate-facing magic-link delivery
 *
 * NOTE: `content_reports_v2` (#152) was superseded by the canonical
 * `content_reports` table + ModerationService (`schema/reports.ts`). Its
 * route + Drizzle schema were removed in the #1835 pass (the legacy route
 * shadowed the canonical one at `/api/reports`). The physical table is left
 * orphaned pending a data-archive migration — see Gap Register #1835.
 *
 * The `users.persona` column (#104) lives on the existing users schema —
 * declared inline there; no Drizzle table addition.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";

export const jobViewEvents = pgTable(
  "job_view_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    viewerUserId: uuid("viewer_user_id"),
    countryCode: varchar("country_code", { length: 2 }),
    region: varchar("region", { length: 64 }),
    referrer: text("referrer"),
    source: varchar("source", { length: 32 }).default("organic"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_job_view_events_job_created").on(t.jobId, t.createdAt.desc())],
);

export const companyViewEvents = pgTable(
  "company_view_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    viewerUserId: uuid("viewer_user_id"),
    countryCode: varchar("country_code", { length: 2 }),
    region: varchar("region", { length: 64 }),
    referrer: text("referrer"),
    source: varchar("source", { length: 32 }).default("organic"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_company_view_events_company_created").on(t.companyId, t.createdAt.desc())],
);


export const takeHomeInvites = pgTable(
  "take_home_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id").notNull(),
    candidateEmail: varchar("candidate_email", { length: 255 }).notNull(),
    candidateName: varchar("candidate_name", { length: 255 }),
    inviteToken: varchar("invite_token", { length: 64 }).notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submissionId: uuid("submission_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_take_home_invites_stage").on(t.stageId),
    check("take_home_invites_status_check", sql`${t.status} IN ('pending', 'started', 'submitted', 'expired')`),
  ],
);

export type TakeHomeInvite = typeof takeHomeInvites.$inferSelect;
export type NewTakeHomeInvite = typeof takeHomeInvites.$inferInsert;
