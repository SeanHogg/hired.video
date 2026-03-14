import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

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
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export const requestLogs = pgTable("request_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: varchar("method", { length: 10 }).notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  messageseSent: integer("messages_sent").default(0).notNull(),
  videosCreated: integer("videos_created").default(0).notNull(),
  lastActive: timestamp("last_active", { withTimezone: true }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserEngagementMetric = typeof userEngagementMetrics.$inferSelect;
export type NewUserEngagementMetric = typeof userEngagementMetrics.$inferInsert;
