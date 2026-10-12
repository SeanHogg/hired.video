/**
 * Calendar sync persistence (POST /api/calendar/sync) — batch-shaped writes
 * for both sync directions so a run costs a fixed number of statements:
 *
 *   push: one `UPDATE … FROM (VALUES …)` stamping every pushed row with its
 *         provider event id (was one UPDATE per event);
 *   pull: one pre-read for dedup, one bulk `UPDATE … FROM (VALUES …)` for
 *         events already mirrored, one multi-row INSERT for new ones (was one
 *         UPDATE/INSERT per pulled event).
 *
 * `scheduled_events` has no unique key on (connection, external id), so this
 * keeps the explicit pre-read dedup instead of ON CONFLICT.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { scheduledEvents } = schema;

export interface PulledCalendarEvent {
  externalEventId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** Stamp pushed rows as synced with their provider event ids — ONE statement. */
export async function markEventsPushed(
  db: Db,
  connectionId: string,
  pushed: ReadonlyArray<{ id: string; externalEventId: string }>,
): Promise<void> {
  if (pushed.length === 0) return;
  const now = new Date();
  const values = sql.join(
    pushed.map((p) => sql`(${p.id}::uuid, ${p.externalEventId}::text)`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE ${scheduledEvents}
    SET synced_to_calendar = true,
        external_event_id = v.ext_id,
        calendar_connection_id = ${connectionId}::uuid,
        updated_at = ${ts(now)}
    FROM (VALUES ${values}) AS v(id, ext_id)
    WHERE ${scheduledEvents.id} = v.id
  `);
}

/**
 * Mirror provider events into scheduled_events: update rows already linked to
 * this connection by external id, insert the rest. Returns how many pulled
 * events were written (updated + inserted), matching the old per-event count.
 */
export async function upsertPulledEvents(
  db: Db,
  userId: string,
  connectionId: string,
  pulled: readonly PulledCalendarEvent[],
): Promise<number> {
  if (pulled.length === 0) return 0;

  const existing = await db
    .select({ id: scheduledEvents.id, externalEventId: scheduledEvents.externalEventId })
    .from(scheduledEvents)
    .where(and(
      eq(scheduledEvents.userId, userId),
      eq(scheduledEvents.calendarConnectionId, connectionId),
      isNotNull(scheduledEvents.externalEventId),
    ))
    .catch(() => [] as Array<{ id: string; externalEventId: string | null }>);
  const byExt = new Map(existing.map((r) => [r.externalEventId, r.id]));

  const updates: Array<{ id: string; ev: PulledCalendarEvent }> = [];
  const inserts: PulledCalendarEvent[] = [];
  for (const ev of pulled) {
    const existingId = byExt.get(ev.externalEventId);
    if (existingId) updates.push({ id: existingId, ev });
    else inserts.push(ev);
  }

  const now = new Date();
  if (updates.length > 0) {
    const values = sql.join(
      updates.map(({ id, ev }) => sql`(
        ${id}::uuid,
        ${ev.title}::varchar,
        ${ev.description}::text,
        ${ts(ev.startAt)},
        ${ts(ev.endAt)},
        ${ev.timezone}::varchar,
        ${ev.location}::text,
        ${ev.meetingUrl}::text
      )`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${scheduledEvents}
      SET title = v.title,
          description = v.description,
          start_at = v.start_at,
          end_at = v.end_at,
          timezone = v.timezone,
          location = v.location,
          meeting_url = v.meeting_url,
          updated_at = ${ts(now)}
      FROM (VALUES ${values})
        AS v(id, title, description, start_at, end_at, timezone, location, meeting_url)
      WHERE ${scheduledEvents.id} = v.id
    `);
  }

  if (inserts.length > 0) {
    await db.insert(scheduledEvents).values(
      inserts.map((ev) => ({
        userId,
        calendarConnectionId: connectionId,
        externalEventId: ev.externalEventId,
        title: ev.title,
        description: ev.description,
        startAt: ev.startAt,
        endAt: ev.endAt,
        timezone: ev.timezone,
        location: ev.location,
        meetingUrl: ev.meetingUrl,
        type: "meeting",
        status: "confirmed",
        syncedToCalendar: true,
        visibility: "private",
      })),
    );
  }

  return updates.length + inserts.length;
}
