/**
 * EventBlastService — host announcement broadcaster.
 *
 * Sends one notification to every approved attendee of an event.
 * Reuses the existing notifications surface; per-channel fanout
 * (in-app + email) lives in the notification service.
 *
 * Authorization: only the host + co-hosts with `sendMessages` permission
 * can blast. Route-level enforcement; the service trusts its caller.
 */
import type { ApiDeps } from "../apiDeps.js";
import { reminderSentKey } from "../../repositories/eventsRepository.js";
import { chunk } from "../../utils/chunk.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";

/** Recipients per emit (one multi-row insert each — well under the 65,535
 *  bind-param ceiling). */
const NOTIFY_CHUNK = 1000;

export type BlastDeps = Pick<ApiDeps, "repos" | "now">;

export class EventBlastService {
  constructor(private readonly deps: BlastDeps) {}

  async canBlast(eventId: string, userId: string): Promise<boolean> {
    const ev = await this.deps.repos.events.findById(eventId);
    if (!ev) return false;
    if (ev.hostUserId === userId || ev.userId === userId) return true;
    const coHosts = await this.deps.repos.events.findCoHostsByEvent(eventId);
    return coHosts.some(
      (c) => c.userId === userId && ((c.permissions as any)?.sendMessages ?? true),
    );
  }

  async send(
    eventId: string,
    actingUserId: string,
    subject: string,
    body: string,
  ): Promise<{ sentTo: number }> {
    if (!(await this.canBlast(eventId, actingUserId))) {
      throw new Error("Forbidden");
    }
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) throw new Error("Not found");

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId, "going");
    // Routed through the one dispatcher (bell row + preference-gated
    // push/email). One multi-row insert per chunk of approved attendees.
    const recipientIds = attendees
      .filter((a) => a.userId && a.approvalStatus === "approved")
      .map((a) => a.userId as string);
    const { actor } = await resolveActor(this.deps, actingUserId);
    for (const part of chunk(recipientIds, NOTIFY_CHUNK)) {
      await emitNotification(this.deps, {
        recipientIds: part,
        type: "event_host_blast",
        actor,
        title: `${event.title}: ${subject}`.slice(0, 240),
        message: body.slice(0, 2000),
        target: { id: eventId, type: "event" },
        url: `/events/${eventId}`,
        extraData: { eventId, hostUserId: actingUserId },
      });
    }
    return { sentTo: recipientIds.length };
  }

  /**
   * Post-event "connect with people you met" prompt. Fired by the
   * reminder worker when an event ends. Idempotent via the existing
   * event_reminders_sent table using key='post_event'.
   */
  async sendPostEventConnectPrompt(eventId: string): Promise<{ sentTo: number }> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) return { sentTo: 0 };

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId, "going");
    // Reuse the reminder dispatch log with a sentinel key so we don't
    // re-prompt on a worker re-run. One already-sent read, one multi-row
    // notification insert, one multi-row record (was 3 queries/attendee).
    // Notify-then-record ordering is preserved: a failed notify records
    // nothing, so the next tick retries.
    const already = await this.deps.repos.events.remindersAlreadySent([eventId], ["post_event"]);
    const userIds: string[] = [];
    for (const a of attendees) {
      if (!a.userId) continue;
      const k = reminderSentKey(eventId, a.userId, "post_event");
      if (already.has(k)) continue;
      already.add(k);
      userIds.push(a.userId);
    }
    if (userIds.length === 0) return { sentTo: 0 };

    for (const part of chunk(userIds, NOTIFY_CHUNK)) {
      await emitNotification(this.deps, {
        recipientIds: part,
        type: "event_post_event_connect",
        actor: null,
        title: `Connect with the people you met at "${event.title}"`,
        message:
          "Tap to send connection requests to attendees you met. You'll earn points for each accepted connection.",
        target: { id: eventId, type: "event" },
        url: `/events/${eventId}`,
        extraData: { eventId, kind: "post_event_connect" },
      });
    }
    for (const part of chunk(userIds, NOTIFY_CHUNK)) {
      await this.deps.repos.events.recordRemindersSent(
        part.map((userId) => ({ eventId, userId, reminderKey: "post_event" })),
      );
    }
    return { sentTo: userIds.length };
  }
}
