/**
 * theme_calendar_events / theme_calendar_dates data access (migration 0502).
 * The only module that touches these tables; use cases go through it.
 */
import { asc, eq, inArray, and } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { themeCalendarDates, themeCalendarEvents } from "../../db/schema/themeCalendar.js";
import {
  DateRuleSchema,
  LocalizedTextSchema,
  type ThemeEvent,
  type ThemeEventDate,
  type ThemeEventInput,
} from "../../../../shared/theme-calendar/event.js";

type EventRow = typeof themeCalendarEvents.$inferSelect;

/** Every event (the calendar is small: ~60 built-ins plus custom ones). */
export const EVENT_LIST_LIMIT = 500;

function toEvent(row: EventRow, dates: ThemeEventDate[]): ThemeEvent | null {
  // jsonb columns are re-validated so a hand-edited row can't crash a reader.
  const rule = DateRuleSchema.safeParse(row.rule);
  const name = LocalizedTextSchema.safeParse(row.name);
  const line = row.line == null ? null : LocalizedTextSchema.safeParse(row.line);
  if (!rule.success || !name.success || (line && !line.success)) return null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind as ThemeEvent["kind"],
    rule: rule.data,
    runupDays: row.runupDays,
    afterDays: row.afterDays,
    autoPick: row.autoPick as ThemeEvent["autoPick"],
    fits: row.fits as ThemeEvent["fits"],
    regions: row.regions,
    priority: row.priority,
    themeId: row.themeId as ThemeEvent["themeId"],
    tone: row.tone as ThemeEvent["tone"],
    name: name.data,
    line: line && line.success ? line.data : null,
    isActive: row.isActive,
    isBuiltin: row.isBuiltin,
    dates,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function datesFor(eventIds: string[], db: Db): Promise<Map<string, ThemeEventDate[]>> {
  const out = new Map<string, ThemeEventDate[]>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select()
    .from(themeCalendarDates)
    .where(inArray(themeCalendarDates.eventId, eventIds))
    .orderBy(asc(themeCalendarDates.year));
  for (const r of rows) {
    const list = out.get(r.eventId) ?? [];
    list.push({ year: r.year, date: r.date });
    out.set(r.eventId, list);
  }
  return out;
}

/** All events with their yearly dates (two queries, no N+1). */
export async function listEvents(db: Db = getDb()): Promise<ThemeEvent[]> {
  const rows = await db.select().from(themeCalendarEvents).orderBy(asc(themeCalendarEvents.slug)).limit(EVENT_LIST_LIMIT);
  const dates = await datesFor(rows.map((r) => r.id), db);
  return rows.map((r) => toEvent(r, dates.get(r.id) ?? [])).filter((e): e is ThemeEvent => e !== null);
}

export async function findEvent(id: string, db: Db = getDb()): Promise<ThemeEvent | null> {
  const [row] = await db.select().from(themeCalendarEvents).where(eq(themeCalendarEvents.id, id)).limit(1);
  if (!row) return null;
  return toEvent(row, (await datesFor([row.id], db)).get(row.id) ?? []);
}

function columnsOf(input: ThemeEventInput) {
  return {
    slug: input.slug,
    kind: input.kind,
    rule: input.rule,
    runupDays: input.runupDays,
    afterDays: input.afterDays,
    autoPick: input.autoPick,
    fits: [...input.fits],
    regions: [...input.regions],
    priority: input.priority,
    themeId: input.themeId,
    tone: input.tone,
    name: input.name,
    line: input.line,
    isActive: input.isActive,
  };
}

/** A taken slug is a no-op that returns null. */
export async function insertEvent(input: ThemeEventInput, actorId: string, db: Db = getDb()): Promise<string | null> {
  const [row] = await db
    .insert(themeCalendarEvents)
    .values({ ...columnsOf(input), isBuiltin: false, updatedBy: actorId })
    .onConflictDoNothing()
    .returning({ id: themeCalendarEvents.id });
  return row?.id ?? null;
}

export async function updateEvent(id: string, input: ThemeEventInput, actorId: string, db: Db = getDb()): Promise<boolean> {
  const rows = await db
    .update(themeCalendarEvents)
    .set({ ...columnsOf(input), updatedBy: actorId, updatedAt: new Date() })
    .where(eq(themeCalendarEvents.id, id))
    .returning({ id: themeCalendarEvents.id });
  return rows.length > 0;
}

export async function setEventActive(id: string, isActive: boolean, actorId: string, db: Db = getDb()): Promise<boolean> {
  const rows = await db
    .update(themeCalendarEvents)
    .set({ isActive, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(themeCalendarEvents.id, id))
    .returning({ id: themeCalendarEvents.id });
  return rows.length > 0;
}

/** Only custom events can be deleted; built-ins are turned off instead. */
export async function deleteCustomEvent(id: string, db: Db = getDb()): Promise<boolean> {
  const rows = await db
    .delete(themeCalendarEvents)
    .where(and(eq(themeCalendarEvents.id, id), eq(themeCalendarEvents.isBuiltin, false)))
    .returning({ id: themeCalendarEvents.id });
  return rows.length > 0;
}

export async function upsertEventDate(eventId: string, d: ThemeEventDate, db: Db = getDb()): Promise<void> {
  await db
    .insert(themeCalendarDates)
    .values({ eventId, year: d.year, date: d.date })
    .onConflictDoUpdate({ target: [themeCalendarDates.eventId, themeCalendarDates.year], set: { date: d.date } });
}

export async function deleteEventDate(eventId: string, year: number, db: Db = getDb()): Promise<void> {
  await db
    .delete(themeCalendarDates)
    .where(and(eq(themeCalendarDates.eventId, eventId), eq(themeCalendarDates.year, year)));
}
