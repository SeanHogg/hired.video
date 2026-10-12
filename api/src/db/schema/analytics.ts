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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * artifact_views — polymorphic view-event table (migration 0107). Backs
 * the unified creator-stats surface (Gap Register #1019). Replaces the
 * scatter of `resume_views` / `profile_views` / `company_views` /
 * `studio_video_heatmap` over time; legacy tables stay readable during
 * the bake window and get dual-written by handlers in this PR.
 *
 * `artifactKind` is the discriminator (see shared/artifact-views.ts).
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
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("artifact_views_kind_id_idx").on(t.artifactKind, t.artifactId),
    index("artifact_views_owner_idx").on(t.ownerUserId),
    index("artifact_views_viewer_idx").on(t.viewerId),
    index("artifact_views_viewed_at_idx").on(t.viewedAt),
    index("artifact_views_kind_viewed_idx").on(t.artifactKind, t.viewedAt),
    // Creator-stats surface — "my recent views, newest first". The
    // per-column owner index covered lookups but forced a sort.
    index("idx_artifact_views_owner_viewed")
      .on(t.ownerUserId, t.viewedAt.desc())
      .where(sql`${t.ownerUserId} IS NOT NULL`),
  ],
);

export type ArtifactView = typeof artifactViews.$inferSelect;
export type NewArtifactView = typeof artifactViews.$inferInsert;

export const profileViews = pgTable("profile_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  viewedUserId: uuid("viewed_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  viewerUserId: uuid("viewer_user_id").references(() => users.id, { onDelete: "set null" }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProfileView = typeof profileViews.$inferSelect;
export type NewProfileView = typeof profileViews.$inferInsert;

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
]);

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // created_at backs the 30-day retention sweep; (user_id, created_at) backs
  // per-user request history (0495); (route, created_at) backs the per-route
  // usage/error report (0506).
  index("idx_request_logs_created").on(t.createdAt),
  index("idx_request_logs_user_created").on(t.userId, t.createdAt).where(sql`user_id IS NOT NULL`),
  index("idx_request_logs_route_created").on(t.route, t.createdAt).where(sql`route IS NOT NULL`),
]);

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;

export const dashboardMetrics = pgTable("dashboard_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  metricKey: varchar("metric_key", { length: 100 }).notNull(),
  metricValue: jsonb("metric_value").notNull(),
  period: varchar("period", { length: 50 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DashboardMetric = typeof dashboardMetrics.$inferSelect;
export type NewDashboardMetric = typeof dashboardMetrics.$inferInsert;

export const userEngagementMetrics = pgTable("user_engagement_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loginCount: integer("login_count").default(0).notNull(),
  resumeViews: integer("resume_views").default(0).notNull(),
  jobApplications: integer("job_applications").default(0).notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  videosCreated: integer("videos_created").default(0).notNull(),
  lastActive: timestamp("last_active", { withTimezone: true }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserEngagementMetric = typeof userEngagementMetrics.$inferSelect;
export type NewUserEngagementMetric = typeof userEngagementMetrics.$inferInsert;

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
export type NewNotification = typeof notifications.$inferInsert;

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
export type NewMarketingLead = typeof marketingLeads.$inferInsert;

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(false).notNull(),
  rolloutPercentage: integer("rollout_percentage").default(0).notNull(), // 0-100
  conditions: jsonb("conditions").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
