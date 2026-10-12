import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, text, date, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * theme_calendar_events / theme_calendar_dates — the internal calendar that
 * picks a video's default theme by date (migration 0502, gap #2350). Shapes
 * and rules: shared/theme-calendar (event.ts, pick.ts). SuperAdmin-edited
 * (Studio › Calendar & themes); single writer: services/theme-calendar.
 */
export const themeCalendarEvents = pgTable(
  "theme_calendar_events",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    slug:       varchar("slug", { length: 48 }).notNull(),
    kind:       varchar("kind", { length: 16 }).notNull(),
    /** shared/theme-calendar/event.ts DateRuleSchema. */
    rule:       jsonb("rule").notNull(),
    runupDays:  integer("runup_days").notNull().default(0),
    afterDays:  integer("after_days").notNull().default(0),
    autoPick:   varchar("auto_pick", { length: 16 }).notNull().default("everyone"),
    fits:       text("fits").array().notNull().default([]),
    regions:    text("regions").array().notNull().default([]),
    priority:   integer("priority").notNull().default(300),
    themeId:    varchar("theme_id", { length: 32 }).notNull(),
    tone:       varchar("tone", { length: 16 }).notNull().default("warm"),
    /** LocalizedText { en, es?, "fr-CA"? }. */
    name:       jsonb("name").notNull(),
    line:       jsonb("line"),
    isActive:   boolean("is_active").notNull().default(true),
    isBuiltin:  boolean("is_builtin").notNull().default(false),
    updatedBy:  uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_theme_calendar_events_slug").on(t.slug),
    check("theme_calendar_events_kind_check", sql`${t.kind} IN ('personal','career','holiday','sports','season','offered','custom')`),
    check("theme_calendar_events_runup_days_check", sql`${t.runupDays} BETWEEN 0 AND 120`),
    check("theme_calendar_events_after_days_check", sql`${t.afterDays} BETWEEN 0 AND 180`),
    check("theme_calendar_events_auto_pick_check", sql`${t.autoPick} IN ('everyone','whenFits','never')`),
    check("theme_calendar_events_priority_check", sql`${t.priority} BETWEEN 0 AND 500`),
    check("theme_calendar_events_tone_check", sql`${t.tone} IN ('playful','warm','respectful')`),
  ],
);

export const themeCalendarDates = pgTable(
  "theme_calendar_dates",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    eventId:   uuid("event_id").notNull().references(() => themeCalendarEvents.id, { onDelete: "cascade" }),
    year:      integer("year").notNull(),
    date:      date("date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_theme_calendar_dates_event_year").on(t.eventId, t.year),
    check("theme_calendar_dates_year_check", sql`${t.year} BETWEEN 2000 AND 2100`),
  ],
);
