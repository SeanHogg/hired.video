/**
 * Theme calendar use cases (gap #2350).
 *
 *   publicEvents()  — the active events every video picks from, cached
 *                     (read-through L1 + KV) until a SuperAdmin edits one.
 *   admin*          — SuperAdmin edits (Studio › Calendar & themes); each
 *                     write is audited and drops the cache.
 *
 * The picking itself is pure and runs in the person's browser
 * (shared/theme-calendar/pick.ts), so personal dates never reach the server.
 */
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { AUDIT_ACTIONS, auditLog } from "../../utils/audit.js";
import { localToday } from "../../../../shared/theme-calendar/dates.js";
import { missingYearlyDates } from "../../../../shared/theme-calendar/pick.js";
import type { ThemeEvent, ThemeEventDate, ThemeEventInput } from "../../../../shared/theme-calendar/event.js";
import * as repo from "./themeCalendarRepository.js";

const PUBLIC_KEY = "theme-calendar:v1:events";
/** Backstop only — every write invalidates. */
const PUBLIC_TTL_SECONDS = 3600;

export class ThemeCalendarError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "SLUG_TAKEN" | "NOT_A_TABLE_EVENT" | "BUILTIN_DELETE",
    message: string,
  ) {
    super(message);
  }
}

function invalidate(): void {
  invalidateCachedKey(PUBLIC_KEY);
}

/** Active events, for the picker and the home page's seasonal row. */
export function publicEvents(): Promise<ThemeEvent[]> {
  return getOrSetCached({
    key: PUBLIC_KEY,
    ttlSeconds: PUBLIC_TTL_SECONDS,
    loader: async () => (await repo.listEvents()).filter((e) => e.isActive),
  });
}

export interface AdminCalendar {
  events: ThemeEvent[];
  /** Yearly-table dates whose run-up starts within 120 days and aren't set. */
  missingDates: { eventId: string; slug: string; year: number }[];
}

/** Every event (live or off) + the "dates need entering" alert. Uncached:
 *  SuperAdmin-only, and the editor needs its own write back at once. */
export async function adminCalendar(today = localToday()): Promise<AdminCalendar> {
  const events = await repo.listEvents();
  const missingDates = missingYearlyDates(events, today).map((m) => ({ eventId: m.event.id, slug: m.event.slug, year: m.year }));
  return { events, missingDates };
}

async function mustFind(id: string): Promise<ThemeEvent> {
  const event = await repo.findEvent(id);
  if (!event) throw new ThemeCalendarError("NOT_FOUND", "Event not found");
  return event;
}

export async function createEvent(input: ThemeEventInput, actorId: string): Promise<ThemeEvent> {
  const id = await repo.insertEvent(input, actorId);
  if (!id) throw new ThemeCalendarError("SLUG_TAKEN", "An event with that id already exists");
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_CREATED, targetType: "theme_calendar_event", targetId: id, metadata: { slug: input.slug } });
  return mustFind(id);
}

export async function updateEvent(id: string, input: ThemeEventInput, actorId: string): Promise<ThemeEvent> {
  if (!(await repo.updateEvent(id, input, actorId))) throw new ThemeCalendarError("NOT_FOUND", "Event not found");
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_UPDATED, targetType: "theme_calendar_event", targetId: id, metadata: { slug: input.slug } });
  return mustFind(id);
}

export async function setEventActive(id: string, isActive: boolean, actorId: string): Promise<ThemeEvent> {
  if (!(await repo.setEventActive(id, isActive, actorId))) throw new ThemeCalendarError("NOT_FOUND", "Event not found");
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_TOGGLED, targetType: "theme_calendar_event", targetId: id, metadata: { isActive } });
  return mustFind(id);
}

export async function deleteEvent(id: string, actorId: string): Promise<void> {
  const event = await mustFind(id);
  if (event.isBuiltin) throw new ThemeCalendarError("BUILTIN_DELETE", "Built-in events can be turned off, not deleted");
  await repo.deleteCustomEvent(id);
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_DELETED, targetType: "theme_calendar_event", targetId: id, metadata: { slug: event.slug } });
}

export async function setEventDate(id: string, date: ThemeEventDate, actorId: string): Promise<ThemeEvent> {
  const event = await mustFind(id);
  if (event.rule.type !== "table") throw new ThemeCalendarError("NOT_A_TABLE_EVENT", "This event's date is worked out automatically");
  await repo.upsertEventDate(id, date);
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_DATE_SET, targetType: "theme_calendar_event", targetId: id, metadata: { ...date } });
  return mustFind(id);
}

export async function removeEventDate(id: string, year: number, actorId: string): Promise<ThemeEvent> {
  await mustFind(id);
  await repo.deleteEventDate(id, year);
  invalidate();
  await auditLog({ actorId, action: AUDIT_ACTIONS.THEME_EVENT_DATE_REMOVED, targetType: "theme_calendar_event", targetId: id, metadata: { year } });
  return mustFind(id);
}
