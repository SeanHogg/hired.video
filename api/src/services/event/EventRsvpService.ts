/**
 * EventRsvpService — RSVP, approval, capacity, waitlist auto-promote.
 *
 * Boundary: only orchestrates state changes that involve attendee + parent
 * event counters. Notifications are dispatched here so RSVP-related side
 * effects stay together in one place.
 *
 * Capacity logic (computeOutcome in shared/events.ts):
 *   • capacity == null               → always 'going'
 *   • requesterAlreadyGoing          → 'going' (idempotent flip)
 *   • attendeeCount >= capacity      → 'waitlist'
 *
 * Approval logic:
 *   • event.requiresApproval == true → status='going' but approvalStatus
 *     starts 'pending'; host approves before it counts toward capacity.
 */
import type { ApiDeps } from "../apiDeps.js";
import type { RsvpInput } from "../../../../shared/events.js";
import { computeRsvpOutcome } from "../../../../shared/events.js";
import type { EventAttendeeRow, EventRow } from "../../repositories/eventsRepository.js";

export type EventRsvpDeps = Pick<ApiDeps, "repos" | "now">;

export interface RsvpOutcome {
  attendee: EventAttendeeRow;
  outcome: "going" | "waitlist" | "pending" | "declined" | "cancelled";
}

export class EventRsvpService {
  constructor(private readonly deps: EventRsvpDeps) {}

  /** Idempotent RSVP. Returns the resulting attendee row + the effective
   *  outcome the UI should show. */
  async rsvp(eventId: string, userId: string, input: RsvpInput): Promise<RsvpOutcome | null> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) return null;
    if (event.cancelledAt) return null;

    const existing = await this.deps.repos.events.findAttendee(eventId, userId);

    // ─── Decline / cancel paths ────────────────────────────────────────
    if (input.status === "declined" || input.status === "cancelled") {
      if (!existing) {
        // Recording a fresh decline keeps the host's attendee inbox tidy.
        const attendee = await this.deps.repos.events.upsertAttendee({
          eventId,
          userId,
          rsvpStatus: input.status,
          approvalStatus: "approved",
          plusOneCount: 0,
          cancelledAt: this.deps.now(),
        });
        return { attendee, outcome: input.status };
      }
      // If we're cancelling a 'going' RSVP, decrement the counter.
      if (existing.rsvpStatus === "going" && existing.approvalStatus === "approved") {
        await this.deps.repos.events.bumpAttendeeCount(eventId, -1);
        // Promote next from waitlist (if any).
        await this.promoteFromWaitlist(event);
      }
      const attendee = await this.deps.repos.events.upsertAttendee({
        eventId,
        userId,
        rsvpStatus: input.status,
        approvalStatus: existing.approvalStatus,
        plusOneCount: 0,
        cancelledAt: this.deps.now(),
      });
      return { attendee, outcome: input.status };
    }

    // ─── 'maybe' is recorded without counting ──────────────────────────
    if (input.status === "maybe") {
      const attendee = await this.deps.repos.events.upsertAttendee({
        eventId,
        userId,
        rsvpStatus: "maybe",
        approvalStatus: "approved",
        plusOneCount: input.plusOneCount,
        customAnswers: input.customAnswers ?? null,
      });
      return { attendee, outcome: "going" }; // UI treats maybe like a soft going
    }

    // ─── 'going' path with capacity + approval ────────────────────────
    const alreadyGoing = Boolean(
      existing && existing.rsvpStatus === "going" && existing.approvalStatus === "approved",
    );
    const computed = computeRsvpOutcome(event.capacity, event.attendeeCount, alreadyGoing);

    const approvalStatus = event.requiresApproval ? "pending" : "approved";

    if (computed === "waitlist") {
      const attendee = await this.deps.repos.events.upsertAttendee({
        eventId,
        userId,
        rsvpStatus: "waitlist",
        approvalStatus: "approved",
        plusOneCount: input.plusOneCount,
        customAnswers: input.customAnswers ?? null,
      });
      const position = await this.deps.repos.events.nextWaitlistPosition(eventId);
      await this.deps.repos.events.insertWaitlist({ eventId, userId, position });
      await this.deps.repos.events.bumpWaitlistCount(eventId, +1);

      await this.notifyHost(event, userId, "event_rsvp_waitlist", "joined the waitlist");
      return { attendee, outcome: "waitlist" };
    }

    const attendee = await this.deps.repos.events.upsertAttendee({
      eventId,
      userId,
      rsvpStatus: "going",
      approvalStatus,
      plusOneCount: input.plusOneCount,
      customAnswers: input.customAnswers ?? null,
    });

    if (!alreadyGoing && approvalStatus === "approved") {
      await this.deps.repos.events.bumpAttendeeCount(eventId, +1);
    }

    const tag = approvalStatus === "pending" ? "event_rsvp_pending" : "event_rsvp_going";
    const verb = approvalStatus === "pending" ? "requested to RSVP" : "RSVP'd 'going'";
    await this.notifyHost(event, userId, tag, verb);

    return { attendee, outcome: approvalStatus === "pending" ? "pending" : "going" };
  }

  /** Host approves a pending RSVP. */
  async approve(eventId: string, attendeeId: string, actingUserId: string): Promise<boolean> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) return false;
    if (!(await this.canManageAttendees(event, actingUserId))) return false;

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId);
    const target = attendees.find((a) => a.id === attendeeId);
    if (!target) return false;
    if (target.approvalStatus === "approved") return true; // idempotent

    await this.deps.repos.events.upsertAttendee({
      ...target,
      approvalStatus: "approved",
    } as any);
    await this.deps.repos.events.bumpAttendeeCount(eventId, +1);

    if (target.userId) {
      await this.deps.repos.notifications.insertNotification({
        userId: target.userId,
        type: "event_rsvp_approved",
        title: `RSVP approved: ${event.title}`,
        message: `You're approved to attend "${event.title}".`,
        data: { eventId } as any,
      } as any);
    }
    return true;
  }

  async reject(eventId: string, attendeeId: string, actingUserId: string): Promise<boolean> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) return false;
    if (!(await this.canManageAttendees(event, actingUserId))) return false;

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId);
    const target = attendees.find((a) => a.id === attendeeId);
    if (!target) return false;

    await this.deps.repos.events.upsertAttendee({
      ...target,
      approvalStatus: "rejected",
    } as any);

    if (target.userId) {
      await this.deps.repos.notifications.insertNotification({
        userId: target.userId,
        type: "event_rsvp_rejected",
        title: `RSVP not approved: ${event.title}`,
        message: `The host couldn't approve your RSVP to "${event.title}".`,
        data: { eventId } as any,
      } as any);
    }
    return true;
  }

  /** Promote one user from waitlist → going if there's a free seat. */
  async promoteFromWaitlist(event: EventRow): Promise<void> {
    if (event.capacity == null) return;
    const live = await this.deps.repos.events.findById(event.id);
    if (!live) return;
    if (live.attendeeCount >= live.capacity!) return;

    const next = await this.deps.repos.events.findNextWaitlisted(event.id);
    if (!next) return;

    const existing = await this.deps.repos.events.findAttendee(event.id, next.userId);
    if (existing) {
      await this.deps.repos.events.upsertAttendee({
        ...existing,
        rsvpStatus: "going",
        approvalStatus: "approved",
      } as any);
    } else {
      await this.deps.repos.events.upsertAttendee({
        eventId: event.id,
        userId: next.userId,
        rsvpStatus: "going",
        approvalStatus: "approved",
      });
    }
    await this.deps.repos.events.markWaitlistPromoted(next.id);
    await this.deps.repos.events.bumpAttendeeCount(event.id, +1);
    await this.deps.repos.events.bumpWaitlistCount(event.id, -1);

    await this.deps.repos.notifications.insertNotification({
      userId: next.userId,
      type: "event_waitlist_promoted",
      title: `You're in: ${event.title}`,
      message: `A spot opened up — you're now confirmed for "${event.title}".`,
      data: { eventId: event.id } as any,
    } as any);
  }

  /** Mark a user checked-in at the door. */
  async checkIn(eventId: string, attendeeId: string, actingUserId: string): Promise<boolean> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event) return false;
    if (!(await this.canManageAttendees(event, actingUserId))) return false;

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId);
    const target = attendees.find((a) => a.id === attendeeId);
    if (!target) return false;
    if (target.checkedInAt) return true;

    await this.deps.repos.events.upsertAttendee({
      ...target,
      checkedInAt: this.deps.now(),
    } as any);
    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async canManageAttendees(event: EventRow, userId: string): Promise<boolean> {
    if (event.hostUserId === userId || event.userId === userId) return true;
    const coHosts = await this.deps.repos.events.findCoHostsByEvent(event.id);
    return coHosts.some(
      (c) => c.userId === userId && ((c.permissions as any)?.manageAttendees ?? true),
    );
  }

  private async notifyHost(
    event: EventRow,
    rsvperUserId: string,
    type: string,
    verb: string,
  ): Promise<void> {
    const hostId = event.hostUserId ?? event.userId;
    if (!hostId || hostId === rsvperUserId) return;
    const rsvper = await this.deps.repos.users.findById(rsvperUserId);
    const rsvperName =
      (rsvper as any)?.profile?.displayName ||
      [(rsvper as any)?.firstName, (rsvper as any)?.lastName].filter(Boolean).join(" ") ||
      (rsvper as any)?.email ||
      "Someone";
    await this.deps.repos.notifications.insertNotification({
      userId: hostId,
      type,
      title: `${rsvperName} ${verb}`,
      message: `${rsvperName} ${verb} for "${event.title}".`,
      data: { eventId: event.id, rsvperUserId } as any,
    } as any);
  }
}
