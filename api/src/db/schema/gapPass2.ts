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
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    check("gig_projects_budget_kind_check", sql`${t.budgetKind} IN ('fixed', 'hourly')`),
    check("gig_projects_budget_min_cents_check", sql`${t.budgetMinCents} >= 0`),
    check("gig_projects_budget_max_cents_check", sql`${t.budgetMaxCents} >= 0`),
    check("gig_projects_status_check", sql`${t.status} IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')`),
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
    check("gig_bids_proposed_amount_cents_check", sql`${t.proposedAmountCents} >= 0`),
    check("gig_bids_status_check", sql`${t.status} IN ('submitted', 'shortlisted', 'awarded', 'rejected', 'withdrawn')`),
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
  (t) => [
    index("idx_gig_milestones_project_ordinal").on(t.projectId, t.ordinal),
    check("gig_milestones_amount_cents_check", sql`${t.amountCents} >= 0`),
    check("gig_milestones_status_check", sql`${t.status} IN ('pending', 'in_progress', 'submitted', 'approved', 'disputed', 'released')`),
  ],
);

export type GigMilestone = typeof gigMilestones.$inferSelect;
export type NewGigMilestone = typeof gigMilestones.$inferInsert;

// ---------------------------------------------------------------------------
// #1768 — Gig milestone dispute resolution.
//
// When the poster and the awarded creator disagree on a milestone's delivery,
// either party opens a dispute (milestone → 'disputed', frozen from the normal
// approve/release flow). Both sides append evidence/comments to a timeline; a
// platform mediator (SuperAdmin) decides the escrow direction — 'release' pays
// the creator, 'refund' returns the milestone to the poster — which closes the
// dispute and unfreezes the milestone into its terminal state. Mirrors the
// moderation timeline pattern (append-only events + a single decision row).
// ---------------------------------------------------------------------------
export const gigDisputes = pgTable(
  "gig_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    milestoneId: uuid("milestone_id").notNull().references(() => gigMilestones.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => gigProjects.id, { onDelete: "cascade" }),
    openedByUserId: uuid("opened_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    /** 'open' | 'resolved' | 'cancelled'. */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    /** Mediator's escrow direction once resolved: 'release' | 'refund'. */
    resolution: varchar("resolution", { length: 16 }),
    resolutionNote: text("resolution_note"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_gig_disputes_milestone").on(t.milestoneId),
    index("idx_gig_disputes_project").on(t.projectId),
    // At most one OPEN dispute per milestone — re-opening requires the prior to
    // be resolved/cancelled first.
    uniqueIndex("uq_gig_disputes_open_per_milestone")
      .on(t.milestoneId)
      .where(sql`${t.status} = 'open'`),
  ],
);

export type GigDispute = typeof gigDisputes.$inferSelect;
export type NewGigDispute = typeof gigDisputes.$inferInsert;

export const gigDisputeEvents = pgTable(
  "gig_dispute_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disputeId: uuid("dispute_id").notNull().references(() => gigDisputes.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 'evidence' | 'comment' | 'decision'. */
    kind: varchar("kind", { length: 16 }).notNull(),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<Array<{ url: string; name?: string }>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_gig_dispute_events_dispute").on(t.disputeId, t.createdAt)],
);

export type GigDisputeEvent = typeof gigDisputeEvents.$inferSelect;
export type NewGigDisputeEvent = typeof gigDisputeEvents.$inferInsert;

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
  (t) => [
    index("idx_photoreal_avatar_renders_owner").on(t.ownerUserId, t.status),
    check("photoreal_avatar_renders_status_check", sql`${t.status} IN ('queued', 'rendering', 'completed', 'failed')`),
  ],
);

export type PhotorealAvatarRender = typeof photorealAvatarRenders.$inferSelect;
export type NewPhotorealAvatarRender = typeof photorealAvatarRenders.$inferInsert;
