import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  real,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { ARTIFACT_VIEW_EVENT_TYPES } from "../../../../shared/artifact-views.js";

/** `'view', 'listing_view', …` — the CHECK list, from the shared registry. */
const ARTIFACT_VIEW_EVENT_TYPES_SQL = sql.raw(ARTIFACT_VIEW_EVENT_TYPES.map((v) => `'${v}'`).join(", "));

/**
 * artifact_views — THE polymorphic view/engagement event table (migration
 * 0107; W3-A 0580 folded resume_views, company_views, job_view_events,
 * company_view_events and video_analytics into it — those are archived by
 * 0585). Backs the unified creator-stats surface (Gap Register #1019),
 * résumé / company view counts, listing traffic and studio CTA rollups.
 *
 * `artifactKind` is the discriminator (see shared/artifact-views.ts).
 * `eventType` separates the streams (view | listing_view | player_view |
 * impression | cta_click | share — ARTIFACT_VIEW_EVENT_TYPES); every reader
 * filters on it so streams never double-count.
 * `engagement` + `engagementUnit` cover both per-second (video, audio)
 * and per-percent (resume, article, profile, …) shapes in one column.
 */
export const artifactViews = pgTable(
  "artifact_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactKind: varchar("artifact_kind", { length: 32 }).notNull(),
    artifactId: uuid("artifact_id").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewerId: uuid("viewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewerEmail: text("viewer_email"),
    viewerCompany: text("viewer_company"),
    ipHash: varchar("ip_hash", { length: 64 }),
    ipCountry: varchar("ip_country", { length: 2 }),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    engagement: jsonb("engagement"),
    engagementUnit: varchar("engagement_unit", { length: 4 })
      .notNull()
      .default("s"),
    totalEngagementSec: integer("total_engagement_sec").notNull().default(0),
    percentConsumed: real("percent_consumed").notNull().default(0),
    dropOffBucket: integer("drop_off_bucket"),
    eventType: varchar("event_type", { length: 16 }).notNull().default("view"),
    /** listing_view: acquisition source ("organic", "boost", …). */
    source: varchar("source", { length: 32 }),
    /** listing_view: edge region (cf region header). */
    region: varchar("region", { length: 64 }),
    /** Studio playback events: ad campaign attribution (write-only). */
    campaignId: text("campaign_id"),
    /** Studio playback events: free-form client metadata (write-only). */
    metadata: jsonb("metadata"),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Every per-artifact read: (kind, id, stream) + newest-first / windowed.
    // Replaced artifact_views_kind_id_idx (a prefix of it) in 0580.
    index("idx_artifact_views_kind_id_event_viewed").on(
      t.artifactKind,
      t.artifactId,
      t.eventType,
      t.viewedAt.desc().nullsFirst(),
    ),
    // Retention sweep of the listing_view stream (0580).
    index("idx_artifact_views_event_viewed").on(t.eventType, t.viewedAt),
    index("artifact_views_owner_idx").on(t.ownerUserId),
    index("artifact_views_viewer_idx").on(t.viewerId),
    index("artifact_views_viewed_at_idx").on(t.viewedAt),
    index("artifact_views_kind_viewed_idx").on(t.artifactKind, t.viewedAt),
    // Creator-stats surface — "my recent views, newest first". The
    // per-column owner index covered lookups but forced a sort.
    index("idx_artifact_views_owner_viewed")
      .on(t.ownerUserId, t.viewedAt.desc())
      .where(sql`${t.ownerUserId} IS NOT NULL`),
    check("artifact_views_event_type_check", sql`${t.eventType} IN (${ARTIFACT_VIEW_EVENT_TYPES_SQL})`),
  ],
);

export type NewArtifactView = typeof artifactViews.$inferInsert;



export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // created_at leads so the retention sweep's ctid batch is an index range scan (0495).
  index("idx_activity_logs_created").on(t.createdAt),
  index("idx_activity_logs_user_id").on(t.userId),
]);


export const requestLogs = pgTable("request_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: varchar("method", { length: 10 }).notNull(),
  path: text("path").notNull(),
  // Matched Hono route pattern (e.g. /api/resumes/:id) — groups requests by
  // feature, which the raw id-bearing path cannot (0506).
  route: varchar("route", { length: 255 }),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  // Deployed Worker version (CF_VERSION_METADATA.id) that served the request.
  releaseId: varchar("release_id", { length: 64 }),
  // `error.code` / `error._source` ("file:line") of a 4xx/5xx JSON envelope.
  errorCode: varchar("error_code", { length: 100 }),
  errorSource: text("error_source"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  // How many requests this row stands for: 1 when always-logged (non-GET,
  // 4xx/5xx, slow), N for a 1-in-N sampled successful GET (0540). Every
  // aggregate over request_logs multiplies by it.
  sampleWeight: integer("sample_weight").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // created_at backs the 30-day retention sweep; (user_id, created_at) backs
  // per-user request history (0495); (route, created_at) backs the per-route
  // usage/error report (0506).
  index("idx_request_logs_created").on(t.createdAt),
  index("idx_request_logs_user_created").on(t.userId, t.createdAt).where(sql`user_id IS NOT NULL`),
  index("idx_request_logs_route_created").on(t.route, t.createdAt).where(sql`route IS NOT NULL`),
]);






export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false).notNull(),
  // #1605 followup: index added in 0161 for user/created + partial on unread.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 0161 user feed + unread-count partial; created_at backs the 90-day retention sweep (0495).
  index("idx_notifications_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
  index("idx_notifications_user_unread").on(t.userId).where(sql`is_read = false`),
  index("idx_notifications_created").on(t.createdAt),
]);

export type Notification = typeof notifications.$inferSelect;

export const marketingLeads = pgTable("marketing_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  source: varchar("source", { length: 100 }).default("website"),
  status: varchar("status", { length: 50 }).default("new"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketingLead = typeof marketingLeads.$inferSelect;
