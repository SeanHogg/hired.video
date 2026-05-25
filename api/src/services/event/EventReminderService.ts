/**
 * EventReminderService — fires the 1w / 24h / 1h / start reminder cadence
 * for upcoming public events. Designed to be triggered by a scheduled
 * worker (Cloudflare cron) every ~10 minutes; idempotent via
 * `event_reminders_sent` so re-runs don't double-notify.
 *
 * For each (event, attendee, reminder_key) tuple where the event starts
 * within the key's window AND no row already exists in event_reminders_sent,
 * insert a notification + record the sent row.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { ApiDeps } from "../apiDeps.js";
import { REMINDER_KEYS, REMINDER_OFFSETS_MIN } from "../../../../shared/events.js";
import { schema } from "../../db/index.js";

export type ReminderDeps = Pick<ApiDeps, "repos" | "now">;

const { scheduledEvents, eventAttendees } = schema;

interface ReminderRunResult {
  scanned: number;
  sent: number;
  skipped: number;
}

export class EventReminderService {
  constructor(private readonly deps: ReminderDeps) {}

  /**
   * Scan for events whose start time falls inside any of the reminder
   * windows. Returns counters for ops visibility.
   *
   * Window per key: events that start in [offset - 10min, offset + 10min]
   * relative to "now". The 10-minute jitter matches the worker cadence;
   * the `event_reminders_sent` unique constraint guards the rest.
   */
  async runCadence(_db: any): Promise<ReminderRunResult> {
    const now = this.deps.now();
    let scanned = 0;
    let sent = 0;
    let skipped = 0;

    for (const key of REMINDER_KEYS) {
      const offsetMin = REMINDER_OFFSETS_MIN[key];
      const windowMs = 10 * 60 * 1000;
      const target = new Date(now.getTime() + offsetMin * 60 * 1000);
      const from = new Date(target.getTime() - windowMs);
      const to = new Date(target.getTime() + windowMs);

      // Use the underlying db handle from the events repo. The repo
      // doesn't expose it as a public method; we use raw drizzle here
      // because the cadence query is broad and join-heavy.
      const db = (this.deps.repos.events as any).db;
      if (!db) continue;

      const eventsInWindow = await db
        .select({
          id: scheduledEvents.id,
          title: scheduledEvents.title,
          startAt: scheduledEvents.startAt,
        })
        .from(scheduledEvents)
        .where(
          and(
            inArray(scheduledEvents.type, ["event", "coffee"]),
            isNull(scheduledEvents.cancelledAt),
            gte(scheduledEvents.startAt, from),
            lte(scheduledEvents.startAt, to),
          ),
        );

      scanned += eventsInWindow.length;

      for (const ev of eventsInWindow) {
        const attendees = await db
          .select({ userId: eventAttendees.userId })
          .from(eventAttendees)
          .where(
            and(
              eq(eventAttendees.eventId, ev.id),
              eq(eventAttendees.rsvpStatus, "going"),
              eq(eventAttendees.approvalStatus, "approved"),
            ),
          );

        for (const a of attendees) {
          if (!a.userId) continue;
          const already = await this.deps.repos.events.reminderAlreadySent(
            ev.id,
            a.userId,
            key,
          );
          if (already) {
            skipped++;
            continue;
          }

          await this.deps.repos.notifications.insertNotification({
            userId: a.userId,
            type: `event_reminder_${key}`,
            title: this.reminderTitle(key, ev.title),
            message: this.reminderMessage(key, ev.title, ev.startAt),
            data: { eventId: ev.id, reminderKey: key } as any,
          } as any);

          await this.deps.repos.events.recordReminderSent({
            eventId: ev.id,
            userId: a.userId,
            reminderKey: key,
          });
          sent++;
        }
      }
    }

    return { scanned, sent, skipped };
  }

  private reminderTitle(key: string, title: string): string {
    switch (key) {
      case "1w":
        return `Next week: ${title}`;
      case "24h":
        return `Tomorrow: ${title}`;
      case "1h":
        return `Starting in 1 hour: ${title}`;
      case "start":
        return `Starting now: ${title}`;
      default:
        return title;
    }
  }

  private reminderMessage(key: string, title: string, startAt: Date): string {
    const when = startAt.toLocaleString();
    switch (key) {
      case "1w":
        return `"${title}" is one week away — ${when}.`;
      case "24h":
        return `"${title}" is tomorrow at ${startAt.toLocaleTimeString()}.`;
      case "1h":
        return `"${title}" starts in an hour at ${startAt.toLocaleTimeString()}.`;
      case "start":
        return `"${title}" is starting now.`;
      default:
        return when;
    }
  }
}
