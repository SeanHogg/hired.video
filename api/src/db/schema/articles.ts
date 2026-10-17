/**
 * Creator-authored Articles, FAQs, and Guides.
 *
 * Lifecycle:
 *   draft -> submitted -> published   (SA approved)
 *                      `-> rejected   (SA rejected; revise -> draft)
 *
 * "flagged" + "unlisted" are reserved for post-publish abuse-report moderation
 * (see content_reports). Pre-publish review uses the new statuses above.
 *
 * "kind" lets creators publish three specialisations of the same storage
 * shape: article / faq / guide. Downstream UI filters and admin queue group by
 * kind, but the row schema is identical.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  real,
  boolean,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const ARTICLE_KINDS = ["article", "faq", "guide"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_STATUS = [
  "draft",
  "submitted",
  "published",
  "rejected",
  "unlisted",
  "flagged",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUS)[number];

export const MODERATION_SEVERITY = ["low", "medium", "high", "block"] as const;
export type ModerationSeverity = (typeof MODERATION_SEVERITY)[number];

export interface ModerationFindings {
  profanity: string[];
  racism: string[];
  tosViolations: string[];
  severity: ModerationSeverity;
  rationale?: string;
}

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    bodyMd: text("body_md").default("").notNull(),
    summary: text("summary"),
    coverImageUrl: text("cover_image_url"),
    category: varchar("category", { length: 100 }),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    // AI-resilient sector taxonomy. Slug values + enum lives in
    // `shared/sectors.ts`. Nullable — legacy articles stay untagged
    // until re-saved through the new picker.
    sector: varchar("sector", { length: 64 }),
    // Audience vocabulary orthogonal to category — drives which sector
    // landing page surfaces the article ("for job seekers" vs "for
    // recruiters" vs "pivoting in" vs "resume guide" vs "civic /
    // run-for-office"). See ARTICLE_AUDIENCES in shared/sectors.ts.
    audience: varchar("audience", { length: 32 }),

    kind: varchar("kind", { length: 16 }).default("article").notNull(),

    status: varchar("status", { length: 32 }).default("draft").notNull(),
    submittedForReviewAt: timestamp("submitted_for_review_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    qualityScore: real("quality_score"),
    qualityRationale: text("quality_rationale"),
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),

    moderationScore: real("moderation_score"),
    moderationFindings: jsonb("moderation_findings").$type<ModerationFindings>(),
    moderationScannedAt: timestamp("moderation_scanned_at", { withTimezone: true }),
    moderationScannedBy: uuid("moderation_scanned_by").references(() => users.id, { onDelete: "set null" }),

    viewCount: integer("view_count").default(0).notNull(),
    readMinutes: integer("read_minutes").default(0).notNull(),

    /** #170 — Tiptap (ProseMirror) document JSON. The renderer prefers
     *  bodyJson when present, falling back to bodyMd for legacy rows.
     *  Both shapes are validated server-side at publish time. */
    bodyJson: jsonb("body_json"),
    /** #171 — Median read seconds, recomputed nightly from the
     *  article_engagement rollup. Surfaced in the article card UI as
     *  "X min read" without recomputing on each render. */
    readingTimeSeconds: integer("reading_time_seconds"),
    /** #172/#173 — When TRUE, this article's engagement counts toward
     *  the partner pool. Flipped on publish iff the author has an active
     *  partner-program opt-in AND the article passes #175's moderation
     *  classifier. Frozen on the row to keep distribution math stable. */
    partnerProgramEligible: boolean("partner_program_eligible").default(false).notNull(),
    /** Snapshotted at publish from the writer's active opt-in.
     *  Audit-only — pool math reads weighted engagement, not this BPS. */
    platformFeeBpsAtOptIn: integer("platform_fee_bps_at_opt_in"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_articles_user").on(t.userId, t.createdAt),
    index("idx_articles_status_published").on(t.status, t.publishedAt),
    index("idx_articles_kind_status").on(t.kind, t.status, t.publishedAt),
    // See migration 0112 — sector + audience indexes are partial (NULL
    // filtered) at the DB level. Drizzle doesn't model partial indexes
    // declaratively, so they're declared in SQL only.
    uniqueIndex("uq_articles_user_slug").on(t.userId, t.slug),
    index("idx_articles_review_queue").on(t.submittedForReviewAt).where(sql`status = 'submitted'`),
    index("idx_articles_sector_status_published").on(t.sector, t.status, t.publishedAt.desc().nullsLast()).where(sql`"sector" IS NOT NULL`),
    index("idx_articles_audience_sector").on(t.audience, t.sector).where(sql`"audience" IS NOT NULL`),
    check("articles_status_check", sql`${t.status} IN ('draft', 'submitted_for_review', 'published', 'rejected', 'unlisted', 'flagged')`),
    index("idx_articles_approved_by").on(t.approvedBy),
    index("idx_articles_moderation_scanned_by").on(t.moderationScannedBy),
    index("idx_articles_rejected_by").on(t.rejectedBy),
  ],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

// ===========================================================================
// #170 — Article version history. Mirrors studio_project_versions +
// resume_versions exactly: monotonically increasing version_number per
// parent, autosave rows churn fast (caps enforced in app code), manual
// snapshots persist until the parent is deleted.
// ===========================================================================
export const articleVersions = pgTable(
  "article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    label: varchar("label", { length: 120 }),
    title: varchar("title", { length: 255 }).notNull(),
    bodyMd: text("body_md"),
    bodyJson: jsonb("body_json"),
    isAutosave: boolean("is_autosave").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_article_versions_article").on(t.articleId, t.versionNumber),
    index("idx_article_versions_user_id").on(t.userId),
  ],
);

export type ArticleVersion = typeof articleVersions.$inferSelect;
export type NewArticleVersion = typeof articleVersions.$inferInsert;

// ===========================================================================
// #171 — Article engagement rollup. One row per (article, day). The
// real-time event paths (`read-progress`, `clap`, `share`) upsert into
// this table; the nightly job that drives the partner pool reads it.
// ===========================================================================
export const articleEngagement = pgTable(
  "article_engagement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    readSeconds: integer("read_seconds").default(0).notNull(),
    clapCount: integer("clap_count").default(0).notNull(),
    shareCount: integer("share_count").default(0).notNull(),
    uniqueReaders: integer("unique_readers").default(0).notNull(),
    /** Time spent by viewers without an authenticated session. Tracked
     *  for analytics + abuse detection but EXCLUDED from the partner
     *  pool math (gap #171 — "authenticated real-account users only"). */
    anonymousReadSeconds: integer("anonymous_read_seconds").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_article_engagement_article_day").on(t.articleId, t.day)],
);

export type ArticleEngagement = typeof articleEngagement.$inferSelect;
export type NewArticleEngagement = typeof articleEngagement.$inferInsert;

// Per-user-per-article clap count. Medium-style: a user can clap many
// times for one article, capped at 50 application-side. One row per
// (user, article); the count column is the running total.
export const articleClaps = pgTable(
  "article_claps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    count: integer("count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_article_claps_user_article").on(t.userId, t.articleId),
    index("idx_article_claps_article_id").on(t.articleId),
  ],
);

export type ArticleClap = typeof articleClaps.$inferSelect;
export type NewArticleClap = typeof articleClaps.$inferInsert;

// Append-only share event log.
export const articleShares = pgTable(
  "article_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "twitter" | "linkedin" | "email" | "copy_link" | "rss" */
    channel: varchar("channel", { length: 40 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_article_shares_article").on(t.articleId, t.createdAt),
    index("idx_article_shares_user_id").on(t.userId),
  ],
);

export type ArticleShare = typeof articleShares.$inferSelect;
export type NewArticleShare = typeof articleShares.$inferInsert;

// ===========================================================================
// #173 — Writer opt-in to Partner Program. Latest active row per user
// gates payout eligibility. Older rows preserve consent audit trail.
// ===========================================================================
export const partnerProgramOptIns = pgTable(
  "partner_program_opt_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platformFeeBpsAtOptIn: integer("platform_fee_bps_at_opt_in").default(0).notNull(),
    legalDocsAccepted: jsonb("legal_docs_accepted").$type<string[]>().default([]).notNull(),
    consentAgreedAt: timestamp("consent_agreed_at", { withTimezone: true }).defaultNow().notNull(),
    consentIp: text("consent_ip"),
    consentUa: text("consent_ua"),
    proSubscriptionId: uuid("pro_subscription_id"),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedReason: text("deactivated_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_partner_program_opt_ins_user").on(t.userId, t.createdAt),
    // #2305 — legacy UNIQUE (migration 0137_creator_economy_and_course_authoring.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
    uniqueIndex("uq_partner_program_opt_ins_active_per_user")
      .on(t.userId)
      .where(sql`is_active = TRUE`),
  ],
);

export type PartnerProgramOptIn = typeof partnerProgramOptIns.$inferSelect;
export type NewPartnerProgramOptIn = typeof partnerProgramOptIns.$inferInsert;

// ===========================================================================
// #172 — Partner pool payout periods + per-user distributions.
// Funded at `pool_funding_bps` of paid-subscriber revenue. Cron in
// scheduled.ts closes a period on the 1st of each month, snapshots the
// revenue base, then writes one row per eligible user into partner_payouts.
// ===========================================================================
export const partnerPayoutPeriods = pgTable("partner_payout_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodStart: date("period_start").notNull().unique(),
  periodEnd: date("period_end").notNull(),
  /** 50 = 0.5% (gap #172 default). Stored per-period for adjustment. */
  poolFundingBps: integer("pool_funding_bps").default(50).notNull(),
  subscriberRevenueCents: integer("subscriber_revenue_cents"),
  poolTotalCents: integer("pool_total_cents"),
  totalEngagementScore: real("total_engagement_score"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PartnerPayoutPeriod = typeof partnerPayoutPeriods.$inferSelect;
export type NewPartnerPayoutPeriod = typeof partnerPayoutPeriods.$inferInsert;

export const partnerPayouts = pgTable(
  "partner_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodId: uuid("period_id").notNull().references(() => partnerPayoutPeriods.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    engagementScore: real("engagement_score").notNull(),
    readSeconds: integer("read_seconds").default(0).notNull(),
    claps: integer("claps").default(0).notNull(),
    shares: integer("shares").default(0).notNull(),
    userShareCents: integer("user_share_cents").notNull(),
    holdUntil: timestamp("hold_until", { withTimezone: true }),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    tremendousOrderId: text("tremendous_order_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_partner_payouts_period_user").on(t.periodId, t.userId),
    index("idx_partner_payouts_user_status").on(t.userId, t.status),
  ],
);

export type PartnerPayout = typeof partnerPayouts.$inferSelect;
export type NewPartnerPayout = typeof partnerPayouts.$inferInsert;

/** Running per-user balance for the partner program. Accrues until it
 *  crosses the $50 threshold (#172) then rolls into a payable row. */
export const partnerProgramBalances = pgTable("partner_program_balances", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pendingCents: integer("pending_cents").default(0).notNull(),
  paidCents: integer("paid_cents").default(0).notNull(),
  lastPeriodId: uuid("last_period_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PartnerProgramBalance = typeof partnerProgramBalances.$inferSelect;
export type NewPartnerProgramBalance = typeof partnerProgramBalances.$inferInsert;

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
  (t) => [
    uniqueIndex("uq_article_payout_runs_period").on(t.periodStart, t.periodEnd),
    check("article_payout_runs_status_check", sql`${t.status} IN ('pending', 'running', 'completed', 'failed')`),
  ],
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
