import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
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

// Scheduled events (interviews, meetings) linked to calendar
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
  type: varchar("type", { length: 50 }).default("interview").notNull(), // interview | meeting | review | other
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // job | application | candidate
  relatedEntityId: uuid("related_entity_id"),
  attendees: jsonb("attendees").default([]), // [{email, name, status}]
  status: varchar("status", { length: 50 }).default("confirmed").notNull(), // confirmed | tentative | cancelled
  reminderMinutes: jsonb("reminder_minutes").default([30, 1440]), // reminder offsets
  syncedToCalendar: boolean("synced_to_calendar").default(false).notNull(),
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
