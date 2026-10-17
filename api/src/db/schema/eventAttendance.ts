/**
 * Public events extension to `scheduled_events`.
 *
 * The parent row lives in calendar.ts (scheduledEvents). Rows there with
 * type IN ('event', 'coffee') participate in these auxiliary tables:
 *   • event_attendees      — relational RSVP (replaces JSONB attendees
 *                            for public events; interviews still use the
 *                            legacy JSONB column on scheduledEvents).
 *   • event_co_hosts       — delegated host permissions on a single event.
 *   • event_waitlist       — auto-promote when capacity frees up.
 *   • event_reminders_sent — idempotent dispatch log for the reminder
 *                            cadence (1w / 24h / 1h / start). The worker
 *                            checks existence before sending so re-runs
 *                            don't double-notify.
 *   • event_matchmaking    — AI-ranked introductions cache (default-on
 *                            per event, recomputed nightly + on RSVP).
 *   • event_categories     — built-in + per-workspace event taxonomy.
 *
 * See migration 0122_events_coffee_shared_tasks.sql for storage layout.
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
import { scheduledEvents } from "./calendar.js";

export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduledEvents.id, { onDelete: "cascade" }),
    // Either userId (registered) or guest_email (invited by email) is set.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestEmail: varchar("guest_email", { length: 255 }),
    guestName: varchar("guest_name", { length: 255 }),
    // going | maybe | declined | waitlist | cancelled
    rsvpStatus: varchar("rsvp_status", { length: 16 }).default("going").notNull(),
    // approved | pending | rejected — gates whether RSVP counts toward capacity.
    approvalStatus: varchar("approval_status", { length: 16 }).default("approved").notNull(),
    plusOneCount: integer("plus_one_count").default(0).notNull(),
    customAnswers: jsonb("custom_answers"),
    rsvpedAt: timestamp("rsvped_at", { withTimezone: true }).defaultNow().notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_attendees_event_user")
      .on(t.eventId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex("uq_event_attendees_event_guest_email")
      .on(t.eventId, sql`lower(${t.guestEmail})`)
      .where(sql`${t.guestEmail} IS NOT NULL AND ${t.userId} IS NULL`),
    index("idx_event_attendees_event_status").on(t.eventId, t.rsvpStatus),
    index("idx_event_attendees_user_id").on(t.userId, t.rsvpedAt),
  ],
);

export type EventAttendee = typeof eventAttendees.$inferSelect;
export type NewEventAttendee = typeof eventAttendees.$inferInsert;

export const eventCoHosts = pgTable(
  "event_co_hosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduledEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    permissions: jsonb("permissions").default({
      manageAttendees: true,
      editEvent: true,
      sendMessages: true,
      checkIn: true,
      viewAnalytics: true,
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_co_hosts_event_user").on(t.eventId, t.userId),
    index("idx_event_co_hosts_user_id").on(t.userId),
    index("idx_event_co_hosts_added_by").on(t.addedBy),
  ],
);

export type EventCoHost = typeof eventCoHosts.$inferSelect;
export type NewEventCoHost = typeof eventCoHosts.$inferInsert;

export const eventWaitlist = pgTable(
  "event_waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduledEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_waitlist_event_user").on(t.eventId, t.userId),
    index("idx_event_waitlist_event_position")
      .on(t.eventId, t.position)
      .where(sql`${t.promotedAt} IS NULL`),
    index("idx_event_waitlist_user_id").on(t.userId),
  ],
);

export type EventWaitlistRow = typeof eventWaitlist.$inferSelect;
export type NewEventWaitlistRow = typeof eventWaitlist.$inferInsert;

export const eventRemindersSent = pgTable(
  "event_reminders_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduledEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Offset key: '1w' | '24h' | '1h' | 'start'. Worker checks existence
    // before send so a re-run won't double-notify.
    reminderKey: varchar("reminder_key", { length: 16 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_reminders_sent_event_user_key").on(
      t.eventId,
      t.userId,
      t.reminderKey,
    ),
    index("idx_event_reminders_sent_user_id").on(t.userId),
  ],
);

export type EventReminderSent = typeof eventRemindersSent.$inferSelect;
export type NewEventReminderSent = typeof eventRemindersSent.$inferInsert;

export const eventMatchmaking = pgTable(
  "event_matchmaking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduledEvents.id, { onDelete: "cascade" }),
    viewerUserId: uuid("viewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matchUserId: uuid("match_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reason: text("reason"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_matchmaking_event_viewer_match").on(
      t.eventId,
      t.viewerUserId,
      t.matchUserId,
    ),
    index("idx_event_matchmaking_event_viewer_score").on(
      t.eventId,
      t.viewerUserId,
      t.score,
    ),
    index("idx_event_matchmaking_match_user_id").on(t.matchUserId),
    index("idx_event_matchmaking_viewer_user_id").on(t.viewerUserId),
  ],
);

export type EventMatchmakingRow = typeof eventMatchmaking.$inferSelect;
export type NewEventMatchmakingRow = typeof eventMatchmaking.$inferInsert;

export const eventCategories = pgTable(
  "event_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id"), // NULL = built-in
    slug: varchar("slug", { length: 48 }).notNull(),
    label: varchar("label", { length: 96 }).notNull(),
    icon: varchar("icon", { length: 48 }),
    colorHex: varchar("color_hex", { length: 7 }).default("#2563eb").notNull(),
    orderIndex: integer("order_index").default(0).notNull(),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("uq_event_categories_workspace_slug").on(
      t.workspaceId,
      sql`lower(${t.slug})`,
    ),
  ],
);

export type EventCategory = typeof eventCategories.$inferSelect;
export type NewEventCategory = typeof eventCategories.$inferInsert;
