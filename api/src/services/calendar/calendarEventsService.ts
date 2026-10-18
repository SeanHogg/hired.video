/**
 * Calendar events + availability use cases behind /api/calendar: the user's
 * own scheduled events (CRUD), weekly availability windows, interview-slot
 * proposals and interview booking (#28). Ownership is enforced in the
 * repository queries (`… AND user_id = $user`); a miss is a 404 DomainError.
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos } from "../../repositories/index.js";
import {
  HiringPipelineRepository,
  type AvailabilitySlotRow,
  type ScheduledEventInsert,
  type ScheduledEventRow,
} from "../../repositories/hiringPipelineRepository.js";
import { CalendarConnections, type SyncableCalendar } from "../provider-connections/calendar-connections.js";
import { emitNotification } from "../notifications/notificationService.js";
import { syncCalendar } from "./calendarSyncService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function events(db = getDb()): HiringPipelineRepository {
  return new HiringPipelineRepository(db);
}

const eventNotFound = () => new DomainError(404, "NOT_FOUND", "Event not found");

// ─── Events ──────────────────────────────────────────────────────────────────

export function listCalendarEvents(
  userId: string,
  range: { from: Date; to: Date; limit: number },
): Promise<ScheduledEventRow[]> {
  return events().findScheduledEventsForUser(userId, range);
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location?: string;
  meetingUrl?: string;
  type: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  attendees: Array<{ email: string; name?: string; status?: string }>;
  reminderMinutes: number[];
}

export function createCalendarEvent(userId: string, body: CreateCalendarEventInput): Promise<ScheduledEventRow> {
  return events().insertScheduledEvent({
    userId,
    title: body.title,
    description: body.description,
    startAt: new Date(body.startAt),
    endAt: new Date(body.endAt),
    timezone: body.timezone,
    location: body.location,
    meetingUrl: body.meetingUrl,
    type: body.type,
    relatedEntityType: body.relatedEntityType,
    relatedEntityId: body.relatedEntityId,
    attendees: body.attendees,
    reminderMinutes: body.reminderMinutes,
    status: "confirmed",
    syncedToCalendar: false,
  } as ScheduledEventInsert);
}

export async function getCalendarEvent(userId: string, id: string): Promise<ScheduledEventRow> {
  const event = await events().findScheduledEventForUser(id, userId);
  if (!event) throw eventNotFound();
  return event;
}

/** Loose PATCH body — only truthy / defined fields are applied (legacy contract). */
export interface UpdateCalendarEventInput {
  title?: string;
  startAt?: string;
  endAt?: string;
  location?: string | null;
  meetingUrl?: string | null;
  status?: string;
  attendees?: unknown;
}

export async function updateCalendarEvent(
  userId: string,
  id: string,
  body: UpdateCalendarEventInput,
): Promise<ScheduledEventRow> {
  const updates: Partial<ScheduledEventInsert> = { updatedAt: new Date() };
  if (body.title) updates.title = body.title;
  if (body.startAt) updates.startAt = new Date(body.startAt);
  if (body.endAt) updates.endAt = new Date(body.endAt);
  if (body.location !== undefined) updates.location = body.location;
  if (body.meetingUrl !== undefined) updates.meetingUrl = body.meetingUrl;
  if (body.status) updates.status = body.status;
  if (body.attendees) updates.attendees = body.attendees;

  const updated = await events().updateScheduledEventForUser(id, userId, updates);
  if (!updated) throw eventNotFound();
  return updated;
}

export async function deleteCalendarEvent(userId: string, id: string): Promise<void> {
  if (!(await events().deleteScheduledEventForUser(id, userId))) throw eventNotFound();
}

// ─── Availability ────────────────────────────────────────────────────────────

export function listAvailability(userId: string): Promise<AvailabilitySlotRow[]> {
  return events().findAvailabilityForUser(userId);
}

export function createAvailabilitySlot(
  userId: string,
  body: { dayOfWeek: string; startTime: string; endTime: string; timezone: string },
): Promise<AvailabilitySlotRow> {
  return events().createAvailabilitySlot({ userId, ...body });
}

export async function deleteAvailabilitySlot(userId: string, id: string): Promise<void> {
  if (!(await events().deleteAvailabilitySlotForUser(id, userId))) {
    throw new DomainError(404, "NOT_FOUND", "Availability slot not found");
  }
}

// ─── Interview scheduling (#28) ──────────────────────────────────────────────

export interface ProposedSlot {
  start: string;
  end: string;
  dayOfWeek: string;
}

const MAX_PROPOSED_SLOTS = 20;
const DEFAULT_HOURS = [9, 10, 11, 14, 15, 16];

/** Long weekday name ("monday") — the `dayOfWeek` the response has always carried. */
const longDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
/** Short key ("mon") — how availability_slots.day_of_week is stored. */
const shortDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();

/**
 * Proposes open interview slots over the next `daysAhead` days from the
 * user's active availability windows, falling back to weekday business hours
 * when none are configured. Returns at most 20 slots.
 */
export async function proposeInterviewSlots(
  userId: string,
  duration: number,
  daysAhead: number,
): Promise<ProposedSlot[]> {
  const availability = await events().findAvailabilityForUser(userId).catch(() => [] as AvailabilitySlotRow[]);
  const stepMs = duration * 60 * 1000;
  const slots: ProposedSlot[] = [];
  const now = new Date();

  for (let d = 1; d <= daysAhead; d++) {
    const date = new Date(now.getTime() + d * DAY_MS);
    const key = shortDay(date);
    const dayWindows = availability.filter((a) => a.isActive && a.dayOfWeek.toLowerCase() === key);
    for (const window of dayWindows) {
      const [startH, startM] = String(window.startTime ?? "09:00").split(":").map(Number);
      const [endH, endM] = String(window.endTime ?? "17:00").split(":").map(Number);

      let cursor = new Date(date);
      cursor.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(date);
      windowEnd.setHours(endH, endM, 0, 0);

      while (cursor.getTime() + stepMs <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + stepMs);
        slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString(), dayOfWeek: longDay(date) });
        cursor = slotEnd;
      }
    }
  }

  // If no availability configured, return default business hours slots.
  if (!slots.length) {
    for (let d = 1; d <= daysAhead; d++) {
      const date = new Date(now.getTime() + d * DAY_MS);
      const dayNum = date.getDay();
      if (dayNum === 0 || dayNum === 6) continue; // skip weekends
      for (const hour of DEFAULT_HOURS) {
        const start = new Date(date);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + stepMs);
        slots.push({ start: start.toISOString(), end: end.toISOString(), dayOfWeek: longDay(date) });
      }
    }
  }

  return slots.slice(0, MAX_PROPOSED_SLOTS);
}

export interface BookInterviewInput {
  slot: { start: string; end: string };
  candidateId?: string;
  jobTitle?: string;
  notes?: string;
}

export interface BookInterviewResult {
  event: ScheduledEventRow;
  synced: boolean;
  /** Background push to the first connected calendar — hand to waitUntil. */
  backgroundSync: Promise<unknown> | null;
}

/** Create the interview event, kick off a calendar sync, notify the candidate. */
export async function bookInterview(userId: string, input: BookInterviewInput): Promise<BookInterviewResult> {
  const db = getDb();
  const event = await events(db).insertScheduledEvent({
    userId,
    title: `Interview: ${input.jobTitle ?? "Candidate"}`,
    description: input.notes ?? null,
    startAt: new Date(input.slot.start),
    endAt: new Date(input.slot.end),
    type: "interview",
    attendees: input.candidateId ? [input.candidateId] : [],
    syncedToCalendar: false,
  });

  const connections = await new CalendarConnections(db).listActive(userId).catch(() => [] as SyncableCalendar[]);
  const backgroundSync = connections.length
    ? syncCalendar(userId, connections[0]).catch(() => undefined)
    : null;

  if (input.candidateId) {
    await emitNotification(
      { repos: buildRepos(db) },
      {
        recipientIds: [input.candidateId],
        type: "interview_scheduled",
        actor: null,
        title: "Interview Scheduled",
        message: `An interview has been scheduled for ${new Date(input.slot.start).toLocaleString()}. Check your calendar.`,
        extraData: { eventId: event.id, jobTitle: input.jobTitle },
      },
    ).catch(() => undefined);
  }

  return { event, synced: connections.length > 0, backgroundSync };
}
