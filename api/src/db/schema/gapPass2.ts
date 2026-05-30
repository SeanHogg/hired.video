/**
 * Schema additions for the second multi-gap pass (migration 0180):
 *
 *   gig_projects                — #101  freelance / gig marketplace project posts
 *   gig_bids                    — #101  bidder proposals (cover letter + rate)
 *   gig_milestones              — #101  Stripe-escrow milestones
 *   photoreal_avatar_renders    — #1560 photorealistic avatar render jobs
 *
 * The `game_state` JSONB column lands on `studio_projects` via migration
 * 0180 directly — declared inline on the existing schema file rather than
 * here so the Drizzle type for studio_projects stays in one place. See
 * [studiofeatures.ts]'s studioProjects export.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// #101 — gig marketplace
// ---------------------------------------------------------------------------
export const gigProjects = pgTable(
  "gig_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default([]),
    /** 'fixed' | 'hourly'. */
    budgetKind: varchar("budget_kind", { length: 16 }).notNull().default("fixed"),
    budgetMinCents: integer("budget_min_cents").notNull(),
    budgetMaxCents: integer("budget_max_cents").notNull(),
    estimatedDurationDays: integer("estimated_duration_days"),
    /** 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'. */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    awardedBidId: uuid("awarded_bid_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_gig_projects_owner").on(t.ownerUserId, t.status),
    index("idx_gig_projects_status_created").on(t.status, t.createdAt.desc()),
  ],
);

export type GigProject = typeof gigProjects.$inferSelect;
export type NewGigProject = typeof gigProjects.$inferInsert;

export const gigBids = pgTable(
  "gig_bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => gigProjects.id, { onDelete: "cascade" }),
    bidderUserId: uuid("bidder_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coverLetter: text("cover_letter").notNull(),
    proposedAmountCents: integer("proposed_amount_cents").notNull(),
    proposedDurationDays: integer("proposed_duration_days"),
    /** 'submitted' | 'shortlisted' | 'awarded' | 'rejected' | 'withdrawn'. */
    status: varchar("status", { length: 16 }).notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_gig_bids_project_bidder").on(t.projectId, t.bidderUserId),
    index("idx_gig_bids_project_status").on(t.projectId, t.status),
    index("idx_gig_bids_bidder").on(t.bidderUserId),
  ],
);

export type GigBid = typeof gigBids.$inferSelect;
export type NewGigBid = typeof gigBids.$inferInsert;

export const gigMilestones = pgTable(
  "gig_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => gigProjects.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull().default(0),
    title: varchar("title", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description"),
    /** 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed' | 'released'. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    providerEscrowId: text("provider_escrow_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_gig_milestones_project_ordinal").on(t.projectId, t.ordinal)],
);

export type GigMilestone = typeof gigMilestones.$inferSelect;
export type NewGigMilestone = typeof gigMilestones.$inferInsert;

// ---------------------------------------------------------------------------
// #1560 — photorealistic avatar render jobs
// ---------------------------------------------------------------------------
export const photorealAvatarRenders = pgTable(
  "photoreal_avatar_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 'did' | 'heygen' | 'synthesia' | 'wav2lip_wasm' | … */
    provider: varchar("provider", { length: 32 }).notNull(),
    portraitMediaId: uuid("portrait_media_id"),
    voiceCloneId: uuid("voice_clone_id"),
    scriptText: text("script_text"),
    audioUrl: text("audio_url"),
    outputVideoUrl: text("output_video_url"),
    providerJobId: text("provider_job_id"),
    /** 'queued' | 'rendering' | 'completed' | 'failed'. */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    failureReason: text("failure_reason"),
    durationSeconds: integer("duration_seconds"),
    costCents: integer("cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_photoreal_avatar_renders_owner").on(t.ownerUserId, t.status)],
);

export type PhotorealAvatarRender = typeof photorealAvatarRenders.$inferSelect;
export type NewPhotorealAvatarRender = typeof photorealAvatarRenders.$inferInsert;
