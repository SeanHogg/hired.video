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
import type { ApiDeps } from "../apiDeps.js";
import { REMINDER_KEYS, REMINDER_OFFSETS_MIN } from "../../../../shared/events.js";
import {
  reminderSentKey,
  type EventReminderSentInsert,
} from "../../repositories/eventsRepository.js";
import type { NotificationInsert } from "../../repositories/notificationsRepository.js";
import { chunk } from "../../utils/chunk.js";

export type ReminderDeps = Pick<ApiDeps, "repos" | "now">;

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
    const eventsRepo = this.deps.repos.events;
    let scanned = 0;
    let sent = 0;
    let skipped = 0;

    // 1) Events per reminder window (one small query per key — fixed 4).
    const windowMs = 10 * 60 * 1000;
    const perKey = await Promise.all(
      REMINDER_KEYS.map(async (key) => {
        const target = new Date(now.getTime() + REMINDER_OFFSETS_MIN[key] * 60 * 1000);
        const events = await eventsRepo.findEventsStartingBetween(
          new Date(target.getTime() - windowMs),
          new Date(target.getTime() + windowMs),
        );
        return { key, events };
      }),
    );
    const allEventIds = perKey.flatMap((p) => p.events.map((e) => e.id));
    for (const p of perKey) scanned += p.events.length;
    if (allEventIds.length === 0) return { scanned, sent, skipped };

    // 2) Attendees for every in-window event + 3) already-sent tuples —
    //    one query each (was one attendee query per event and one
    //    already-sent probe per attendee).
    const [attendeesByEvent, alreadySent] = await Promise.all([
      eventsRepo.findApprovedGoingAttendeeIds(allEventIds),
      eventsRepo.remindersAlreadySent(allEventIds, [...REMINDER_KEYS]),
    ]);

    const notifications: NotificationInsert[] = [];
    const sentRows: EventReminderSentInsert[] = [];
    for (const { key, events } of perKey) {
      for (const ev of events) {
        for (const userId of attendeesByEvent.get(ev.id) ?? []) {
          const tupleKey = reminderSentKey(ev.id, userId, key);
          if (alreadySent.has(tupleKey)) {
            skipped++;
            continue;
          }
          // Guard against the same tuple twice in one run (overlapping windows).
          alreadySent.add(tupleKey);
          notifications.push({
            userId,
            type: `event_reminder_${key}`,
            title: this.reminderTitle(key, ev.title),
            message: this.reminderMessage(key, ev.title, ev.startAt),
            data: { eventId: ev.id, reminderKey: key },
          } as NotificationInsert);
          sentRows.push({ eventId: ev.id, userId, reminderKey: key });
          sent++;
        }
      }
    }

    // 4) Notify, THEN record (same ordering as before: a failed notify
    //    leaves nothing recorded so the next tick retries). One multi-row
    //    insert each.
    for (const part of chunk(notifications, 1000)) {
      await this.deps.repos.notifications.insertNotifications(part);
    }
    for (const part of chunk(sentRows, 1000)) {
      await eventsRepo.recordRemindersSent(part);
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
