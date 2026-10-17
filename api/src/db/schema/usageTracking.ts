/**
 * usage_sessions + usage_events — page/session/event analytics behind the
 * "who is active, engage them" surface (#2043-2046). Distinct from
 * usage_ledger (billing meter, schema/usage.ts).
 *
 * A visitor exists before login (visitor_id cookie); on auth the session links
 * to user_id, retaining the pre-signup journey. Events reference the Feature
 * Registry key where applicable so usage rolls up by the same per-role/
 * per-feature vocabulary.
 *
 * See migration 0215_usage_tracking.sql + shared/usage.ts for the wire shape.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const usageSessions = pgTable(
  "usage_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: varchar("visitor_id", { length: 64 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    isAuthenticated: boolean("is_authenticated").default(false).notNull(),
    role: varchar("role", { length: 50 }),
    entryPath: text("entry_path"),
    referrer: text("referrer"),
    utmSource: varchar("utm_source", { length: 200 }),
    utmMedium: varchar("utm_medium", { length: 200 }),
    utmCampaign: varchar("utm_campaign", { length: 200 }),
    country: varchar("country", { length: 8 }),
    userAgent: text("user_agent"),
    // Denormalised latest activity so the presence read hits one table.
    lastEventType: varchar("last_event_type", { length: 32 }),
    lastPath: text("last_path"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_usage_sessions_visitor").on(t.visitorId),
    index("idx_usage_sessions_last_seen").on(t.lastSeen),
    index("idx_usage_sessions_user").on(t.userId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => usageSessions.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    path: text("path"),
    featureKey: varchar("feature_key", { length: 200 }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_usage_events_session").on(t.sessionId),
    index("idx_usage_events_type_time").on(t.type, t.occurredAt),
    index("idx_usage_events_feature").on(t.featureKey),
    // Retention sweep age axis (0541).
    index("idx_usage_events_occurred").on(t.occurredAt),
  ],
);

export type UsageSession = typeof usageSessions.$inferSelect;
export type NewUsageSession = typeof usageSessions.$inferInsert;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
