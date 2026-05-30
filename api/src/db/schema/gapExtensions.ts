/**
 * Schema extensions added in migration 0178 — kept together so the
 * cross-domain additions don't sprawl across half-a-dozen files.
 *
 *   inbox_seat_addons          — #809  paid extra-inbox slots
 *   outplacement_packages      — #100  employer outplacement product
 *   outplacement_enrollments   — #100  per-seat candidate enrollments
 *   article_payout_runs        — #896  per-period article engagement payout
 *   article_payout_entries     — #896  per-article credit lines
 *   boost_checkouts            — #177  paid boost USD / Campaign $ split
 *   enrichment_provider_calls  — #96   per-attempt upstream call audit
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { boosts } from "./advertising.js";

// ---------------------------------------------------------------------------
// #809 — paid extra-inbox slots above the 3 included with Pro
// ---------------------------------------------------------------------------
export const inboxSeatAddons = pgTable(
  "inbox_seat_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    /** Helcim recurring-plan / Stripe subscription-line ID we mirror updates from. */
    providerSubscriptionId: text("provider_subscription_id"),
    unitPriceCents: integer("unit_price_cents").notNull().default(500),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_inbox_seat_addons_status").on(t.status)],
);

export type InboxSeatAddon = typeof inboxSeatAddons.$inferSelect;
export type NewInboxSeatAddon = typeof inboxSeatAddons.$inferInsert;

// ---------------------------------------------------------------------------
// #100 — outplacement product (B2B employer-paid seats)
// ---------------------------------------------------------------------------
export const outplacementPackages = pgTable(
  "outplacement_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerUserId: uuid("employer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    employerCompanyId: uuid("employer_company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
    seatCount: integer("seat_count").notNull(),
    seatsAssigned: integer("seats_assigned").notNull().default(0),
    durationDays: integer("duration_days").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    providerPaymentId: text("provider_payment_id"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_outplacement_packages_employer").on(t.employerUserId, t.status)],
);

export type OutplacementPackage = typeof outplacementPackages.$inferSelect;
export type NewOutplacementPackage = typeof outplacementPackages.$inferInsert;

export const outplacementEnrollments = pgTable(
  "outplacement_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id").notNull().references(() => outplacementPackages.id, { onDelete: "cascade" }),
    candidateEmail: text("candidate_email").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("invited"),
    completionMetric: jsonb("completion_metric").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_outplacement_enrollments_package_email").on(t.packageId, sql`lower(${t.candidateEmail})`),
    index("idx_outplacement_enrollments_user").on(t.candidateUserId).where(sql`${t.candidateUserId} IS NOT NULL`),
  ],
);

export type OutplacementEnrollment = typeof outplacementEnrollments.$inferSelect;
export type NewOutplacementEnrollment = typeof outplacementEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// #896 — article engagement payout periods + per-article entries
// ---------------------------------------------------------------------------
export const articlePayoutRuns = pgTable(
  "article_payout_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    centsPer1kReadMinutes: integer("cents_per_1k_read_minutes").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    totalCreditedCents: integer("total_credited_cents").notNull().default(0),
    articlesPaid: integer("articles_paid").notNull().default(0),
    ranAt: timestamp("ran_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_article_payout_runs_period").on(t.periodStart, t.periodEnd)],
);

export type ArticlePayoutRun = typeof articlePayoutRuns.$inferSelect;
export type NewArticlePayoutRun = typeof articlePayoutRuns.$inferInsert;

export const articlePayoutEntries = pgTable(
  "article_payout_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => articlePayoutRuns.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").notNull(),
    creatorUserId: uuid("creator_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    qualifyingReadMinutes: integer("qualifying_read_minutes").notNull().default(0),
    qualifyingViewCount: integer("qualifying_view_count").notNull().default(0),
    centsCredited: integer("cents_credited").notNull().default(0),
    ledgerEntryId: uuid("ledger_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_article_payout_entries_run_article").on(t.runId, t.articleId),
    index("idx_article_payout_entries_creator").on(t.creatorUserId),
  ],
);

export type ArticlePayoutEntry = typeof articlePayoutEntries.$inferSelect;
export type NewArticlePayoutEntry = typeof articlePayoutEntries.$inferInsert;

// ---------------------------------------------------------------------------
// #177 — paid boost checkout ledger
// ---------------------------------------------------------------------------
export const boostCheckouts = pgTable(
  "boost_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    boostId: uuid("boost_id").references(() => boosts.id, { onDelete: "set null" }),
    totalCents: integer("total_cents").notNull(),
    campaignDollarsCents: integer("campaign_dollars_cents").notNull().default(0),
    usdCents: integer("usd_cents").notNull().default(0),
    providerPaymentId: text("provider_payment_id"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_boost_checkouts_user").on(t.userId, t.createdAt.desc())],
);

export type BoostCheckout = typeof boostCheckouts.$inferSelect;
export type NewBoostCheckout = typeof boostCheckouts.$inferInsert;

// ---------------------------------------------------------------------------
// #96 — per-attempt enrichment-provider call audit
// ---------------------------------------------------------------------------
export const enrichmentProviderCalls = pgTable(
  "enrichment_provider_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    targetEmail: text("target_email"),
    targetDomain: text("target_domain"),
    ok: boolean("ok").notNull(),
    httpStatus: integer("http_status"),
    creditsConsumed: integer("credits_consumed").notNull().default(0),
    responseExcerpt: text("response_excerpt"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_enrichment_provider_calls_user").on(t.userId, t.createdAt.desc())],
);

export type EnrichmentProviderCall = typeof enrichmentProviderCalls.$inferSelect;
export type NewEnrichmentProviderCall = typeof enrichmentProviderCalls.$inferInsert;
