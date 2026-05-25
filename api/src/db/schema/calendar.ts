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
import { oauthConnectionColumns } from "./studiofeatures.js";

// ---------------------------------------------------------------------------
// Calendar Integration
// ---------------------------------------------------------------------------

// OAuth tokens for connected calendars (Google, Outlook).
// Reuses `oauthConnectionColumns` for refresh / expiry / scopes / soft-delete /
// timestamps. `accessToken` is declared inline (nullable) because some
// calendar flows use API-key auth instead of full OAuth.
//
// Calendar-specific columns: provider discriminator, provider account ID,
// calendar ID/name, syncEnabled toggle, lastSyncedAt — none are part of the
// shared OAuth shape.
export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // google | outlook | ical
  providerAccountId: text("provider_account_id"),
  accessToken: text("access_token"),
  calendarId: text("calendar_id"), // provider-specific calendar ID
  calendarName: varchar("calendar_name", { length: 255 }),
  syncEnabled: boolean("sync_enabled").default(true).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...oauthConnectionColumns,
});

export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;

// Scheduled events — discriminated by `type`.
//   'interview' | 'meeting' | 'review' | 'other' — private calendar items
//     keep using the legacy JSONB `attendees` field; interview booking
//     flow in calendar.ts route is unchanged.
//   'event'  → public/unlisted/private discoverable events (see /events).
//   'coffee' → 1:1 coffee meetup created on a coffee_request accept.
// Only rows with type IN ('event','coffee') populate the relational
// `event_attendees` / `event_co_hosts` / `event_waitlist` tables in
// schema/events.ts. See migration 0122 for the design rationale.
export const scheduledEvents = pgTable("scheduled_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  calendarConnectionId: uuid("calendar_connection_id").references(() => calendarConnections.id, { onDelete: "set null" }),
  externalEventId: text("external_event_id"), // provider calendar event ID
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  timezone: varchar("timezone", { length: 100 }).default("UTC"),
  location: text("location"),
  meetingUrl: text("meeting_url"), // Zoom, Meet, Teams link
  type: varchar("type", { length: 50 }).default("interview").notNull(), // interview | meeting | review | other | event | coffee
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // job | application | candidate | event_host
  relatedEntityId: uuid("related_entity_id"),
  attendees: jsonb("attendees").default([]), // legacy JSONB — kept for interview/meeting/review/other only
  status: varchar("status", { length: 50 }).default("confirmed").notNull(), // confirmed | tentative | cancelled
  reminderMinutes: jsonb("reminder_minutes").default([30, 1440]), // reminder offsets
  syncedToCalendar: boolean("synced_to_calendar").default(false).notNull(),
  // ─── Public event columns (migration 0122 / gap #1236) ───────────────
  // Defaulted to 'private' so existing calendar rows keep their semantics.
  visibility: varchar("visibility", { length: 16 }).default("private").notNull(), // private | unlisted | public
  hostUserId: uuid("host_user_id").references(() => users.id, { onDelete: "cascade" }),
  coverImageUrl: text("cover_image_url"),
  capacity: integer("capacity"),
  category: varchar("category", { length: 48 }), // event_categories.slug
  allowsPlusOnes: boolean("allows_plus_ones").default(false).notNull(),
  requiresApproval: boolean("requires_approval").default(false).notNull(),
  eventFormat: varchar("event_format", { length: 16 }).default("in_person").notNull(), // in_person | remote | hybrid
  videoProvider: varchar("video_provider", { length: 16 }), // zoom | meet | teams | other
  seriesId: uuid("series_id"),
  slug: varchar("slug", { length: 80 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  attendeeCount: integer("attendee_count").default(0).notNull(),
  waitlistCount: integer("waitlist_count").default(0).notNull(),
  registrationQuestions: jsonb("registration_questions"), // [{key, label, type, required}]
  matchmakingEnabled: boolean("matchmaking_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ScheduledEvent = typeof scheduledEvents.$inferSelect;
export type NewScheduledEvent = typeof scheduledEvents.$inferInsert;

// Availability slots for scheduling
export const availabilitySlots = pgTable("availability_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dayOfWeek: varchar("day_of_week", { length: 10 }).notNull(), // mon | tue | wed | thu | fri | sat | sun
  startTime: varchar("start_time", { length: 8 }).notNull(), // "09:00"
  endTime: varchar("end_time", { length: 8 }).notNull(),   // "17:00"
  timezone: varchar("timezone", { length: 100 }).default("UTC"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type NewAvailabilitySlot = typeof availabilitySlots.$inferInsert;
