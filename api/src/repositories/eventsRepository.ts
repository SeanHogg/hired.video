/**
 * EventsRepository — public-event aggregate.
 *
 * Owns reads/writes for scheduled_events rows where type IN ('event',
 * 'coffee') plus all auxiliary tables in schema/events.ts:
 *   • event_attendees       — relational RSVP
 *   • event_co_hosts        — delegated host permissions
 *   • event_waitlist        — capacity overflow
 *   • event_reminders_sent  — idempotent reminder dispatch log
 *   • event_matchmaking     — AI introduction score cache
 *   • event_categories      — built-in + per-workspace taxonomy
 *
 * Boundary: this repo does NOT touch the legacy interview/meeting/review/
 * other rows on scheduled_events (those are owned by HiringPipelineRepository
 * + calendar.ts routes). Every read here filters on type IN ('event',
 * 'coffee') to keep the two surfaces from colliding.
 *
 * See migration 0122_events_coffee_shared_tasks.sql for storage layout.
 */
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  scheduledEvents,
  eventAttendees,
  eventCoHosts,
  eventWaitlist,
  eventRemindersSent,
  eventMatchmaking,
  eventCategories,
} = schema;

export type DbLike = any;

export type EventRow = typeof scheduledEvents.$inferSelect;
export type EventInsert = typeof scheduledEvents.$inferInsert;
export type EventPatch = Partial<EventInsert>;

export type EventAttendeeRow = typeof eventAttendees.$inferSelect;
export type EventAttendeeInsert = typeof eventAttendees.$inferInsert;

export type EventCoHostRow = typeof eventCoHosts.$inferSelect;
export type EventCoHostInsert = typeof eventCoHosts.$inferInsert;

export type EventWaitlistRow = typeof eventWaitlist.$inferSelect;
export type EventWaitlistInsert = typeof eventWaitlist.$inferInsert;

export type EventReminderSentRow = typeof eventRemindersSent.$inferSelect;
export type EventReminderSentInsert = typeof eventRemindersSent.$inferInsert;

export type EventMatchmakingRow = typeof eventMatchmaking.$inferSelect;
export type EventMatchmakingInsert = typeof eventMatchmaking.$inferInsert;

export type EventCategoryRow = typeof eventCategories.$inferSelect;

export interface EventSearchOptions {
  scope: "upcoming" | "past" | "all";
  fromDate?: Date;
  toDate?: Date;
  category?: string;
  format?: "in_person" | "remote" | "hybrid";
  hostUserId?: string;
  /** Optional id allowlist (from LocationService.applyLocationFilter). */
  idAllowlist?: string[];
  /** Free-text contains match against title/description. */
  q?: string;
  visibility?: "public" | "unlisted" | "private";
  limit: number;
  offset: number;
}

export interface IEventsRepository {
  // ── Event CRUD ─────────────────────────────────────────────────────
  findById(id: string): Promise<EventRow | null>;
  findBySlug(slug: string): Promise<EventRow | null>;
  insert(input: EventInsert): Promise<EventRow>;
  update(id: string, patch: EventPatch): Promise<EventRow | null>;
  search(opts: EventSearchOptions): Promise<EventRow[]>;
  countSearch(opts: EventSearchOptions): Promise<number>;
  listForHost(userId: string, scope: "upcoming" | "past" | "all"): Promise<EventRow[]>;

  // ── Attendees ──────────────────────────────────────────────────────
  findAttendee(eventId: string, userId: string): Promise<EventAttendeeRow | null>;
  findAttendeesByEvent(eventId: string, status?: string): Promise<EventAttendeeRow[]>;
  findAttendingEventsForUser(userId: string, scope: "upcoming" | "past" | "all"): Promise<EventAttendeeRow[]>;
  upsertAttendee(input: EventAttendeeInsert): Promise<EventAttendeeRow>;
  updateAttendeeStatus(id: string, status: string, cancelledAt?: Date | null): Promise<void>;
  countAttendees(eventId: string, status?: string): Promise<number>;

  // ── Co-hosts ───────────────────────────────────────────────────────
  findCoHostsByEvent(eventId: string): Promise<EventCoHostRow[]>;
  findCoHostsByEvents(eventIds: string[]): Promise<Map<string, EventCoHostRow[]>>;
  isCoHost(eventId: string, userId: string): Promise<boolean>;
  insertCoHost(input: EventCoHostInsert): Promise<void>;
  removeCoHost(eventId: string, userId: string): Promise<void>;

  // ── Waitlist ───────────────────────────────────────────────────────
  insertWaitlist(input: EventWaitlistInsert): Promise<void>;
  findNextWaitlisted(eventId: string): Promise<EventWaitlistRow | null>;
  markWaitlistPromoted(id: string): Promise<void>;
  nextWaitlistPosition(eventId: string): Promise<number>;

  // ── Reminders ──────────────────────────────────────────────────────
  reminderAlreadySent(eventId: string, userId: string, key: string): Promise<boolean>;
  recordReminderSent(input: EventReminderSentInsert): Promise<void>;

  // ── Matchmaking ────────────────────────────────────────────────────
  topMatchesForViewer(eventId: string, viewerUserId: string, limit?: number): Promise<EventMatchmakingRow[]>;
  upsertMatch(input: EventMatchmakingInsert): Promise<void>;

  // ── Categories ─────────────────────────────────────────────────────
  listCategories(workspaceId?: string | null): Promise<EventCategoryRow[]>;

  // ── Denormalised counter helpers (atomic) ──────────────────────────
  bumpAttendeeCount(eventId: string, delta: number): Promise<void>;
  bumpWaitlistCount(eventId: string, delta: number): Promise<void>;
}

export class EventsRepository implements IEventsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ─── Event CRUD ────────────────────────────────────────────────────

  async findById(id: string): Promise<EventRow | null> {
    const [row] = await this.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.id, id), this.eventTypeFilter()))
      .limit(1);
    return (row as EventRow | undefined) ?? null;
  }

  async findBySlug(slug: string): Promise<EventRow | null> {
    const [row] = await this.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(sql`lower(${scheduledEvents.slug})`, slug.toLowerCase()), this.eventTypeFilter()))
      .limit(1);
    return (row as EventRow | undefined) ?? null;
  }

  async insert(input: EventInsert): Promise<EventRow> {
    const [row] = await this.db
      .insert(scheduledEvents)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as EventRow;
  }

  async update(id: string, patch: EventPatch): Promise<EventRow | null> {
    const [row] = await this.db
      .update(scheduledEvents)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(scheduledEvents.id, id), this.eventTypeFilter()))
      .returning();
    return (row as EventRow | undefined) ?? null;
  }

  async search(opts: EventSearchOptions): Promise<EventRow[]> {
    const where = this.buildSearchWhere(opts);
    return (await this.db
      .select()
      .from(scheduledEvents)
      .where(where)
      .orderBy(opts.scope === "past" ? desc(scheduledEvents.startAt) : asc(scheduledEvents.startAt))
      .limit(opts.limit)
      .offset(opts.offset)) as EventRow[];
  }

  async countSearch(opts: EventSearchOptions): Promise<number> {
    const where = this.buildSearchWhere(opts);
    const [row] = await this.db
      .select({ n: count() })
      .from(scheduledEvents)
      .where(where);
    return Number((row as any)?.n ?? 0);
  }

  async listForHost(userId: string, scope: "upcoming" | "past" | "all"): Promise<EventRow[]> {
    const conditions = [this.eventTypeFilter(), or(eq(scheduledEvents.hostUserId, userId), eq(scheduledEvents.userId, userId))!];
    const now = this.now();
    if (scope === "upcoming") conditions.push(gte(scheduledEvents.startAt, now));
    if (scope === "past") conditions.push(lte(scheduledEvents.startAt, now));
    return (await this.db
      .select()
      .from(scheduledEvents)
      .where(and(...conditions))
      .orderBy(scope === "past" ? desc(scheduledEvents.startAt) : asc(scheduledEvents.startAt))) as EventRow[];
  }

  // ─── Attendees ─────────────────────────────────────────────────────

  async findAttendee(eventId: string, userId: string): Promise<EventAttendeeRow | null> {
    const [row] = await this.db
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId)))
      .limit(1);
    return (row as EventAttendeeRow | undefined) ?? null;
  }

  async findAttendeesByEvent(eventId: string, status?: string): Promise<EventAttendeeRow[]> {
    const where = status
      ? and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.rsvpStatus, status))
      : eq(eventAttendees.eventId, eventId);
    return (await this.db
      .select()
      .from(eventAttendees)
      .where(where)
      .orderBy(asc(eventAttendees.rsvpedAt))) as EventAttendeeRow[];
  }

  async findAttendingEventsForUser(
    userId: string,
    scope: "upcoming" | "past" | "all",
  ): Promise<EventAttendeeRow[]> {
    // Service layer joins these against scheduledEvents for time filter.
    // We only return attendee rows here; the join + filter is in the service
    // because Drizzle's typed join shape is awkward to expose generically.
    const rows = (await this.db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, userId),
          eq(eventAttendees.rsvpStatus, "going"),
          isNull(eventAttendees.cancelledAt),
        ),
      )
      .orderBy(desc(eventAttendees.rsvpedAt))) as EventAttendeeRow[];
    void scope;
    return rows;
  }

  async upsertAttendee(input: EventAttendeeInsert): Promise<EventAttendeeRow> {
    // Unique constraint handles the upsert; we do a manual upsert pattern
    // for portability across PG versions.
    if (input.userId) {
      const existing = await this.findAttendee(input.eventId!, input.userId);
      if (existing) {
        const [row] = await this.db
          .update(eventAttendees)
          .set({
            rsvpStatus: input.rsvpStatus ?? existing.rsvpStatus,
            approvalStatus: input.approvalStatus ?? existing.approvalStatus,
            plusOneCount: input.plusOneCount ?? existing.plusOneCount,
            customAnswers: input.customAnswers ?? existing.customAnswers,
            cancelledAt: input.cancelledAt ?? null,
            updatedAt: this.now(),
          } as any)
          .where(eq(eventAttendees.id, existing.id))
          .returning();
        return row as EventAttendeeRow;
      }
    }
    const [row] = await this.db
      .insert(eventAttendees)
      .values({ ...input, updatedAt: this.now() } as any)
      .returning();
    return row as EventAttendeeRow;
  }

  async updateAttendeeStatus(id: string, status: string, cancelledAt?: Date | null): Promise<void> {
    await this.db
      .update(eventAttendees)
      .set({ rsvpStatus: status, cancelledAt: cancelledAt ?? null, updatedAt: this.now() } as any)
      .where(eq(eventAttendees.id, id));
  }

  async countAttendees(eventId: string, status?: string): Promise<number> {
    const where = status
      ? and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.rsvpStatus, status))
      : eq(eventAttendees.eventId, eventId);
    const [row] = await this.db.select({ n: count() }).from(eventAttendees).where(where);
    return Number((row as any)?.n ?? 0);
  }

  // ─── Co-hosts ──────────────────────────────────────────────────────

  async findCoHostsByEvent(eventId: string): Promise<EventCoHostRow[]> {
    return (await this.db
      .select()
      .from(eventCoHosts)
      .where(eq(eventCoHosts.eventId, eventId))) as EventCoHostRow[];
  }

  async findCoHostsByEvents(eventIds: string[]): Promise<Map<string, EventCoHostRow[]>> {
    const out = new Map<string, EventCoHostRow[]>();
    if (!eventIds.length) return out;
    const rows = (await this.db
      .select()
      .from(eventCoHosts)
      .where(inArray(eventCoHosts.eventId, eventIds))) as EventCoHostRow[];
    for (const r of rows) {
      const list = out.get(r.eventId) ?? [];
      list.push(r);
      out.set(r.eventId, list);
    }
    return out;
  }

  async isCoHost(eventId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: eventCoHosts.id })
      .from(eventCoHosts)
      .where(and(eq(eventCoHosts.eventId, eventId), eq(eventCoHosts.userId, userId)))
      .limit(1);
    return Boolean(row);
  }

  async insertCoHost(input: EventCoHostInsert): Promise<void> {
    await this.db.insert(eventCoHosts).values(input as any).onConflictDoNothing();
  }

  async removeCoHost(eventId: string, userId: string): Promise<void> {
    await this.db
      .delete(eventCoHosts)
      .where(and(eq(eventCoHosts.eventId, eventId), eq(eventCoHosts.userId, userId)));
  }

  // ─── Waitlist ──────────────────────────────────────────────────────

  async insertWaitlist(input: EventWaitlistInsert): Promise<void> {
    await this.db.insert(eventWaitlist).values(input as any).onConflictDoNothing();
  }

  async findNextWaitlisted(eventId: string): Promise<EventWaitlistRow | null> {
    const [row] = await this.db
      .select()
      .from(eventWaitlist)
      .where(and(eq(eventWaitlist.eventId, eventId), isNull(eventWaitlist.promotedAt)))
      .orderBy(asc(eventWaitlist.position))
      .limit(1);
    return (row as EventWaitlistRow | undefined) ?? null;
  }

  async markWaitlistPromoted(id: string): Promise<void> {
    await this.db
      .update(eventWaitlist)
      .set({ promotedAt: this.now() } as any)
      .where(eq(eventWaitlist.id, id));
  }

  async nextWaitlistPosition(eventId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, eventId));
    return Number((row as any)?.n ?? 0) + 1;
  }

  // ─── Reminders ─────────────────────────────────────────────────────

  async reminderAlreadySent(eventId: string, userId: string, key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: eventRemindersSent.id })
      .from(eventRemindersSent)
      .where(
        and(
          eq(eventRemindersSent.eventId, eventId),
          eq(eventRemindersSent.userId, userId),
          eq(eventRemindersSent.reminderKey, key),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async recordReminderSent(input: EventReminderSentInsert): Promise<void> {
    await this.db.insert(eventRemindersSent).values(input as any).onConflictDoNothing();
  }

  // ─── Matchmaking ───────────────────────────────────────────────────

  async topMatchesForViewer(
    eventId: string,
    viewerUserId: string,
    limit = 10,
  ): Promise<EventMatchmakingRow[]> {
    return (await this.db
      .select()
      .from(eventMatchmaking)
      .where(and(eq(eventMatchmaking.eventId, eventId), eq(eventMatchmaking.viewerUserId, viewerUserId)))
      .orderBy(desc(eventMatchmaking.score))
      .limit(Math.min(50, Math.max(1, limit)))) as EventMatchmakingRow[];
  }

  async upsertMatch(input: EventMatchmakingInsert): Promise<void> {
    await this.db
      .insert(eventMatchmaking)
      .values(input as any)
      .onConflictDoUpdate({
        target: [eventMatchmaking.eventId, eventMatchmaking.viewerUserId, eventMatchmaking.matchUserId],
        set: { score: input.score, reason: input.reason, generatedAt: this.now() },
      });
  }

  // ─── Categories ────────────────────────────────────────────────────

  async listCategories(workspaceId?: string | null): Promise<EventCategoryRow[]> {
    const where = workspaceId
      ? or(isNull(eventCategories.workspaceId), eq(eventCategories.workspaceId, workspaceId))!
      : isNull(eventCategories.workspaceId);
    return (await this.db
      .select()
      .from(eventCategories)
      .where(where)
      .orderBy(asc(eventCategories.orderIndex), asc(eventCategories.label))) as EventCategoryRow[];
  }

  // ─── Denormalised counters ─────────────────────────────────────────

  async bumpAttendeeCount(eventId: string, delta: number): Promise<void> {
    await this.db
      .update(scheduledEvents)
      .set({
        attendeeCount: sql`GREATEST(0, ${scheduledEvents.attendeeCount} + ${delta})`,
        updatedAt: this.now(),
      } as any)
      .where(eq(scheduledEvents.id, eventId));
  }

  async bumpWaitlistCount(eventId: string, delta: number): Promise<void> {
    await this.db
      .update(scheduledEvents)
      .set({
        waitlistCount: sql`GREATEST(0, ${scheduledEvents.waitlistCount} + ${delta})`,
        updatedAt: this.now(),
      } as any)
      .where(eq(scheduledEvents.id, eventId));
  }

  // ─── Private helpers ───────────────────────────────────────────────

  /** All operations on this repo target only public event/coffee rows. */
  private eventTypeFilter() {
    return inArray(scheduledEvents.type, ["event", "coffee"]);
  }

  private buildSearchWhere(opts: EventSearchOptions) {
    const now = this.now();
    const conditions: any[] = [this.eventTypeFilter(), isNull(scheduledEvents.cancelledAt)];

    conditions.push(eq(scheduledEvents.visibility, opts.visibility ?? "public"));

    if (opts.scope === "upcoming") conditions.push(gte(scheduledEvents.startAt, opts.fromDate ?? now));
    else if (opts.scope === "past") conditions.push(lte(scheduledEvents.startAt, opts.toDate ?? now));
    if (opts.fromDate && opts.scope !== "past") conditions.push(gte(scheduledEvents.startAt, opts.fromDate));
    if (opts.toDate) conditions.push(lte(scheduledEvents.startAt, opts.toDate));

    if (opts.category) conditions.push(eq(scheduledEvents.category, opts.category));
    if (opts.format) conditions.push(eq(scheduledEvents.eventFormat, opts.format));
    if (opts.hostUserId)
      conditions.push(or(eq(scheduledEvents.hostUserId, opts.hostUserId), eq(scheduledEvents.userId, opts.hostUserId))!);
    if (opts.idAllowlist) {
      if (opts.idAllowlist.length === 0) {
        // Empty allowlist = no rows match
        conditions.push(sql`false`);
      } else {
        conditions.push(inArray(scheduledEvents.id, opts.idAllowlist));
      }
    }
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${scheduledEvents.title}) LIKE ${like}`,
          sql`lower(coalesce(${scheduledEvents.description}, '')) LIKE ${like}`,
        )!,
      );
    }

    return and(...conditions);
  }
}
