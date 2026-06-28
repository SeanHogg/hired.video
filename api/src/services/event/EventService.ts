/**
 * EventService — public event lifecycle (create / publish / update /
 * cancel / list / resolve).
 *
 * Lives next to the calendar surface but stays out of the interview
 * booking flow. Operates on scheduled_events rows where type IN
 * ('event','coffee') via EventsRepository (which enforces that filter
 * on every method).
 *
 * Dependencies:
 *   • repos.events           — events aggregate
 *   • repos.users            — to hydrate host display names/avatars
 *   • repos.contentLocations — origin geo tag set on create/update
 *   • geocoder               — free-text location → lat/lng resolve
 *   • now / randomHex        — deterministic factories
 */
import type { ApiDeps } from "../apiDeps.js";
import type {
  CreateEventInput,
  EventVisibility,
  ResolvedEvent,
  UpdateEventInput,
} from "../../../../shared/events.js";
import { generateEventSlug } from "../../../../shared/events.js";
import type { EventRow, EventInsert, EventPatch } from "../../repositories/eventsRepository.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";

export type EventDeps = Pick<ApiDeps, "repos" | "geocoder" | "now" | "randomHex">;

export class EventService {
  constructor(private readonly deps: EventDeps) {}

  /**
   * Create a new event row. Caller sets `publish=true` to flip
   * publishedAt on the spot, otherwise the row is a draft.
   *
   * Geo tags: if `input.geo` is provided we call LocationService.setForEntity
   * after the insert. We do NOT inject LocationService here to keep this
   * service free of cyclic imports; route handlers call setForEntity
   * explicitly after this returns.
   */
  async create(
    userId: string,
    input: CreateEventInput,
  ): Promise<EventRow> {
    const slug = input.slug ?? generateEventSlug(input.title);

    const insert: EventInsert = {
      userId,
      hostUserId: userId,
      title: input.title,
      description: input.description ?? null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      timezone: input.timezone,
      location: input.location ?? null,
      meetingUrl: input.meetingUrl ?? null,
      type: input.type,
      visibility: input.visibility,
      eventFormat: input.eventFormat,
      videoProvider: input.videoProvider ?? null,
      category: input.category ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      capacity: input.capacity ?? null,
      allowsPlusOnes: input.allowsPlusOnes,
      requiresApproval: input.requiresApproval,
      matchmakingEnabled: input.matchmakingEnabled,
      slug,
      registrationQuestions: input.registrationQuestions ?? null,
      publishedAt: input.publish ? this.deps.now() : null,
      status: "confirmed",
      attendees: [],
      syncedToCalendar: false,
    };

    const row = await this.deps.repos.events.insert(insert);

    // Co-host invitations land as event_co_hosts rows immediately;
    // accepted_at stays NULL until the co-host accepts in-app.
    for (const coHostUserId of input.coHostUserIds ?? []) {
      if (coHostUserId === userId) continue; // host can't co-host themselves
      await this.deps.repos.events.insertCoHost({
        eventId: row.id,
        userId: coHostUserId,
        addedBy: userId,
      });
    }

    bumpSearchVersion();
    return row;
  }

  async update(
    eventId: string,
    actingUserId: string,
    input: UpdateEventInput,
  ): Promise<EventRow | null> {
    const existing = await this.deps.repos.events.findById(eventId);
    if (!existing) return null;
    if (!(await this.canEdit(existing, actingUserId))) return null;

    const patch: EventPatch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.startAt !== undefined) patch.startAt = new Date(input.startAt);
    if (input.endAt !== undefined) patch.endAt = new Date(input.endAt);
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.location !== undefined) patch.location = input.location;
    if (input.meetingUrl !== undefined) patch.meetingUrl = input.meetingUrl;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.eventFormat !== undefined) patch.eventFormat = input.eventFormat;
    if (input.videoProvider !== undefined) patch.videoProvider = input.videoProvider;
    if (input.category !== undefined) patch.category = input.category;
    if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl;
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.allowsPlusOnes !== undefined) patch.allowsPlusOnes = input.allowsPlusOnes;
    if (input.requiresApproval !== undefined) patch.requiresApproval = input.requiresApproval;
    if (input.matchmakingEnabled !== undefined) patch.matchmakingEnabled = input.matchmakingEnabled;
    if (input.registrationQuestions !== undefined) patch.registrationQuestions = input.registrationQuestions;
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.publish) patch.publishedAt = this.deps.now();
    if (input.cancelled) patch.cancelledAt = this.deps.now();

    const updated = await this.deps.repos.events.update(eventId, patch);
    bumpSearchVersion();
    return updated;
  }

  async cancel(eventId: string, actingUserId: string): Promise<EventRow | null> {
    const existing = await this.deps.repos.events.findById(eventId);
    if (!existing) return null;
    if (!(await this.canEdit(existing, actingUserId))) return null;
    const cancelled = await this.deps.repos.events.update(eventId, { cancelledAt: this.deps.now() });
    bumpSearchVersion();
    return cancelled;
  }

  /** Hydrate a row into the wire-shaped ResolvedEvent. */
  async resolve(row: EventRow, viewerUserId: string | null): Promise<ResolvedEvent> {
    const [host, coHosts, viewerRsvp] = await Promise.all([
      row.hostUserId ? this.deps.repos.users.findById(row.hostUserId) : Promise.resolve(null),
      this.deps.repos.events.findCoHostsByEvent(row.id),
      viewerUserId ? this.deps.repos.events.findAttendee(row.id, viewerUserId) : Promise.resolve(null),
    ]);

    const coHostUsers = await Promise.all(
      coHosts.map((c) => this.deps.repos.users.findById(c.userId)),
    );

    const viewerIsHost = Boolean(viewerUserId && (row.hostUserId === viewerUserId || row.userId === viewerUserId));
    const viewerIsCoHost = Boolean(
      viewerUserId && coHosts.some((c) => c.userId === viewerUserId),
    );

    return {
      id: row.id,
      type: row.type as "event" | "coffee",
      visibility: (row.visibility as EventVisibility) ?? "private",
      eventFormat: (row.eventFormat as "in_person" | "remote" | "hybrid") ?? "in_person",
      title: row.title,
      description: row.description,
      slug: row.slug,
      category: row.category,
      coverImageUrl: row.coverImageUrl,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      timezone: row.timezone,
      location: row.location,
      meetingUrl: row.meetingUrl,
      videoProvider: row.videoProvider as any,
      capacity: row.capacity,
      attendeeCount: row.attendeeCount,
      waitlistCount: row.waitlistCount,
      allowsPlusOnes: row.allowsPlusOnes,
      requiresApproval: row.requiresApproval,
      matchmakingEnabled: row.matchmakingEnabled,
      hostUserId: row.hostUserId ?? row.userId,
      hostName: host ? this.displayName(host) : null,
      hostAvatarUrl: (host as any)?.avatarUrl ?? null,
      // #1260 — verified-account signal for the host card check.
      hostIsVerified: Boolean((host as any)?.emailVerified),
      coHosts: coHosts.map((c, i) => ({
        userId: c.userId,
        name: coHostUsers[i] ? this.displayName(coHostUsers[i]!) : null,
        avatarUrl: (coHostUsers[i] as any)?.avatarUrl ?? null,
      })),
      registrationQuestions: (row.registrationQuestions as any) ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      viewerRsvp: viewerRsvp
        ? {
            status: viewerRsvp.rsvpStatus as any,
            approvalStatus: viewerRsvp.approvalStatus as any,
            plusOneCount: viewerRsvp.plusOneCount,
          }
        : null,
      viewerIsHost,
      viewerIsCoHost,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /** Host + co-hosts with editEvent permission can mutate the event. */
  private async canEdit(row: EventRow, userId: string): Promise<boolean> {
    if (row.hostUserId === userId || row.userId === userId) return true;
    const coHosts = await this.deps.repos.events.findCoHostsByEvent(row.id);
    return coHosts.some(
      (c) => c.userId === userId && ((c.permissions as any)?.editEvent ?? true),
    );
  }

  private displayName(user: any): string | null {
    return (
      user?.profile?.displayName ||
      user?.profile?.firstName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.email ||
      null
    );
  }
}
