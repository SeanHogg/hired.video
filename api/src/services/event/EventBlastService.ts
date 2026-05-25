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
    let count = 0;
    for (const a of attendees) {
      if (!a.userId) continue;
      if (a.approvalStatus !== "approved") continue;
      await this.deps.repos.notifications.insertNotification({
        userId: a.userId,
        type: "event_host_blast",
        title: `${event.title}: ${subject}`.slice(0, 240),
        message: body.slice(0, 2000),
        data: { eventId, hostUserId: actingUserId } as any,
      } as any);
      count++;
    }
    return { sentTo: count };
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
    let count = 0;
    for (const a of attendees) {
      if (!a.userId) continue;
      // Reuse the reminder dispatch log with a sentinel key so we don't
      // re-prompt on a worker re-run.
      const already = await this.deps.repos.events.reminderAlreadySent(
        eventId,
        a.userId,
        "post_event",
      );
      if (already) continue;

      await this.deps.repos.notifications.insertNotification({
        userId: a.userId,
        type: "event_post_event_connect",
        title: `Connect with the people you met at "${event.title}"`,
        message:
          "Tap to send connection requests to attendees you met. You'll earn points for each accepted connection.",
        data: { eventId, kind: "post_event_connect" } as any,
      } as any);

      await this.deps.repos.events.recordReminderSent({
        eventId,
        userId: a.userId,
        reminderKey: "post_event",
      });
      count++;
    }
    return { sentTo: count };
  }
}
