import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  smallint,
  bigint,
  date,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { studioProjects } from "./resumes.js";
import { studioProjectRenderVariants } from "./renderVariants.js";
import { studioProjectPublications } from "./studioPublications.js";
import { promotionSubmissions } from "./promotions.js";
import { feedPosts } from "./feed.js";

/**
 * social_publish_jobs — the scheduled-post queue (migration 0524, #2047).
 * One row = one post of one project to one destination at a set time. See
 * shared/social-publish-jobs.ts for the destination / lane / status
 * vocabulary and services/distribution/ for the drainer.
 */
export const socialPublishJobs = pgTable(
  "social_publish_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    destination: varchar("destination", { length: 16 }).notNull(),
    lane: varchar("lane", { length: 8 }).notNull(),
    /** The fitted cut to post (#2045); null = the master. Stale → the master. */
    renderVariantId: uuid("render_variant_id").references(() => studioProjectRenderVariants.id, { onDelete: "set null" }),
    caption: text("caption").notNull().default(""),
    /** The per-network choices the user made (TikTok / YouTube settings). */
    postSettings: jsonb("post_settings").$type<Record<string, unknown> | null>(),
    /** Agent draft the user must post by hand (TikTok pre-audit, YouTube
     *  daily cap). Promoted from `post_settings.postYourself` (migration 0614). */
    postYourself: boolean("post_yourself").notNull().default(false),
    /** Caption source for agent posts: 'ai' or 'template'. */
    captionSource: varchar("caption_source", { length: 8 }),
    /** Job source: user-scheduled vs AI agent. */
    source: varchar("source", { length: 8 }).notNull().default("user"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("scheduled"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    publicationId: uuid("publication_id").references(() => studioProjectPublications.id, { onDelete: "set null" }),
    promotionSubmissionId: uuid("promotion_submission_id").references(() => promotionSubmissions.id, { onDelete: "set null" }),
    feedPostId: uuid("feed_post_id").references(() => feedPosts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_social_publish_jobs_status_run_at").on(t.status, t.runAt),
    index("idx_social_publish_jobs_creator_scheduled").on(t.createdBy, t.scheduledAt.desc().nullsFirst()),
    index("idx_social_publish_jobs_project").on(t.projectId),
    index("idx_social_publish_jobs_variant").on(t.renderVariantId),
    index("idx_social_publish_jobs_publication").on(t.publicationId),
    index("idx_social_publish_jobs_promotion").on(t.promotionSubmissionId),
    index("idx_social_publish_jobs_feed_post").on(t.feedPostId),
    index("idx_social_publish_jobs_source").on(t.source),
    uniqueIndex("uq_social_publish_jobs_open")
      .on(t.projectId, t.destination, t.lane)
      .where(sql`status IN ('scheduled', 'running')`),
    check(
      "social_publish_jobs_destination_check",
      sql`${t.destination} IN ('youtube', 'tiktok', 'instagram', 'x', 'facebook', 'linkedin', 'feed')`,
    ),
    check("social_publish_jobs_lane_check", sql`${t.lane} IN ('self', 'managed')`),
    check(
      "social_publish_jobs_status_check",
      sql`${t.status} IN ('scheduled', 'running', 'done', 'failed', 'cancelled', 'draft', 'expired')`,
    ),
    check("social_publish_jobs_source_check", sql`${t.source} IN ('user', 'agent')`),
    check(
      "social_publish_jobs_caption_source_check",
      sql`${t.captionSource} IS NULL OR ${t.captionSource} IN ('ai', 'template')`,
    ),
  ],
);

export type SocialPublishJobRow = typeof socialPublishJobs.$inferSelect;
export type SocialPublishJobInsert = typeof socialPublishJobs.$inferInsert;

/**
 * external_post_metrics — one snapshot per (publication, UTC day) of the
 * counts a network reported for a post (migration 0525, #2048). Null counts
 * = not reported (unknown), never zero.
 */
export const externalPostMetrics = pgTable(
  "external_post_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => studioProjectPublications.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_external_post_metrics_pub_date").on(t.publicationId, t.metricDate)],
);

export type ExternalPostMetricsRow = typeof externalPostMetrics.$inferSelect;

/**
 * posting_agent_settings — AI Posting Agent settings per user (#2300).
 * One row per user, created when they first configure the agent.
 */
export const postingAgentSettings = pgTable(
  "posting_agent_settings",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    mode: varchar("mode", { length: 8 }).notNull().default("approve"),
    cadence: varchar("cadence", { length: 8 }).notNull().default("steady"),
    postMinute: smallint("post_minute").notNull().default(720),
    destinations: varchar("destinations", { length: 16 }).array().notNull().default(sql`ARRAY['feed']::varchar(16)[]`),
    quietStartMinute: smallint("quiet_start_minute").notNull().default(1260),
    quietEndMinute: smallint("quiet_end_minute").notNull().default(480),
    emailDigest: boolean("email_digest").notNull().default(true),
    nextPlanAt: timestamp("next_plan_at", { withTimezone: true }),
    pausedReason: varchar("paused_reason", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_posting_agent_settings_enabled_next_plan").on(t.enabled, t.nextPlanAt).where(sql`enabled = true`),
    check("posting_agent_settings_mode_check", sql`${t.mode} IN ('approve', 'auto')`),
    check("posting_agent_settings_cadence_check", sql`${t.cadence} IN ('light', 'steady', 'daily')`),
    check("posting_agent_settings_paused_reason_check", sql`${t.pausedReason} IN ('user', 'plan', 'admin')`),
  ],
);

export type PostingAgentSettingsRow = typeof postingAgentSettings.$inferSelect;
export type PostingAgentSettingsInsert = typeof postingAgentSettings.$inferInsert;
