/**
 * Chrome extension telemetry + interactive-picker captures.
 *
 * Two tables, deliberately separate:
 *
 *   extension_sessions — one row per side-panel session (browser open).
 *     Acts as the parent for all events. A session ends when the user
 *     closes the side panel or the service worker is suspended; the
 *     extension client just stops sending. We don't try to detect end —
 *     `updated_at` is the de-facto last-seen.
 *
 *   extension_events — append-only event log. Polymorphic via `kind`
 *     + JSONB `payload`. Single ingest endpoint accepts batches so the
 *     extension can fire-and-forget on visibilitychange / unload without
 *     blocking the UI.
 *
 * The capture event (`picker_capture`) is the most valuable: it carries
 * the user-confirmed selectors + text + HTML snippets that the SuperAdmin
 * surface distills into a prompt for updating `siteConfigs.ts`. That's
 * how the "interactive mode" turns into automatic detection over time.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const extensionSessions = pgTable(
  "extension_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Client-generated session UUID. Lets a client retry batch posts
    // without producing duplicate sessions; the ingest endpoint upserts
    // on this column.
    clientSessionId: uuid("client_session_id").notNull().unique(),
    // Null for anonymous (not signed-in) sessions — we still capture
    // detection failures so we can improve site coverage for the
    // signed-out preview.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    extension: varchar("extension", { length: 16 }).notNull(), // 'jobseeker' | 'recruiter'
    version: varchar("version", { length: 32 }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    eventCount: integer("event_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    pickerCaptureCount: integer("picker_capture_count").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionUserIdx: index("extension_sessions_user_idx").on(t.userId),
    sessionUpdatedIdx: index("extension_sessions_updated_idx").on(t.updatedAt),
  }),
);

export type ExtensionSession = typeof extensionSessions.$inferSelect;
export type NewExtensionSession = typeof extensionSessions.$inferInsert;

export const extensionEvents = pgTable(
  "extension_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => extensionSessions.id, { onDelete: "cascade" }),
    // Discriminator: 'page_view' | 'detect_attempt' | 'picker_capture' |
    // 'track' | 'error' | 'navigation' | 'manual'. Add new kinds without
    // schema changes — only the admin viewer needs updating.
    kind: varchar("kind", { length: 32 }).notNull(),
    // Originating URL (for page_view + detect_attempt + navigation) —
    // hoisted out of payload so we can filter/group server-side without
    // JSONB extraction.
    url: text("url"),
    host: varchar("host", { length: 255 }),
    // Free-form, kind-specific blob. Shape contract lives in the client
    // (extension-telemetry.ts) and the SA viewer.
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    eventSessionIdx: index("extension_events_session_idx").on(t.sessionId),
    eventKindIdx: index("extension_events_kind_idx").on(t.kind),
    eventHostIdx: index("extension_events_host_idx").on(t.host),
    eventCreatedIdx: index("extension_events_created_idx").on(t.createdAt),
  }),
);

export type ExtensionEvent = typeof extensionEvents.$inferSelect;
export type NewExtensionEvent = typeof extensionEvents.$inferInsert;
