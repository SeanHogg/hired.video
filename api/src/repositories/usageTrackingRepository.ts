/**
 * UsageTrackingRepository — data access for usage_sessions + usage_events
 * (migration 0215), the page/session/event analytics behind the presence +
 * engagement surface (#2043-2046).
 *
 * No business logic / caching — that lives in services/usage/UsageService.ts
 * (cached presence read, consent gate, DSR erase).
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { usageSessions, usageEvents } = schema;

export type DbLike = any;

export type UsageSessionRow = typeof usageSessions.$inferSelect;

export interface UpsertSessionInput {
  visitorId: string;
  userId?: string | null;
  isAuthenticated: boolean;
  role?: string | null;
  entryPath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  userAgent?: string | null;
  lastEventType?: string | null;
  lastPath?: string | null;
}

export interface InsertEventInput {
  type: string;
  path?: string | null;
  featureKey?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: Date | null;
}

export interface FeatureUsageCount {
  featureKey: string;
  count: number;
}

export interface IUsageTrackingRepository {
  /** Upsert the session by visitor_id, bumping last_seen + latest activity.
   *  Identity-on-conflict fields (user_id/role/auth) are refreshed; entry
   *  context is set once on insert. Returns the session id. */
  upsertSession(input: UpsertSessionInput): Promise<string>;
  /** Batch-insert events for a session. */
  insertEvents(sessionId: string, events: InsertEventInput[]): Promise<void>;
  /** Sessions seen since `since`, most-recent first (presence read). */
  listActiveSessions(since: Date, limit?: number): Promise<UsageSessionRow[]>;
  /** Per-feature event counts for a role since `since` (usage→access hints). */
  featureUsageForRole(role: string, since: Date): Promise<FeatureUsageCount[]>;
  /** DSR erase — drop a visitor's session + events (cascade). */
  eraseByVisitor(visitorId: string): Promise<number>;
  /** DSR erase — drop all sessions/events for a user. */
  eraseByUser(userId: string): Promise<number>;
}

export class UsageTrackingRepository implements IUsageTrackingRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertSession(input: UpsertSessionInput): Promise<string> {
    const now = this.now();
    const [row] = await this.db
      .insert(usageSessions)
      .values({
        visitorId: input.visitorId,
        userId: input.userId ?? null,
        isAuthenticated: input.isAuthenticated,
        role: input.role ?? null,
        entryPath: input.entryPath ?? null,
        referrer: input.referrer ?? null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        country: input.country ?? null,
        userAgent: input.userAgent ?? null,
        lastEventType: input.lastEventType ?? null,
        lastPath: input.lastPath ?? null,
        firstSeen: now,
        lastSeen: now,
      } as any)
      .onConflictDoUpdate({
        target: usageSessions.visitorId,
        set: {
          // Refresh identity (anon → authed linking) + latest activity only.
          userId: input.userId ?? null,
          isAuthenticated: input.isAuthenticated,
          role: input.role ?? null,
          lastEventType: input.lastEventType ?? null,
          lastPath: input.lastPath ?? null,
          lastSeen: now,
        },
      })
      .returning({ id: usageSessions.id });
    return row.id;
  }

  async insertEvents(sessionId: string, events: InsertEventInput[]): Promise<void> {
    if (events.length === 0) return;
    await this.db.insert(usageEvents).values(
      events.map((e) => ({
        sessionId,
        type: e.type,
        path: e.path ?? null,
        featureKey: e.featureKey ?? null,
        payload: e.payload ?? null,
        occurredAt: e.occurredAt ?? this.now(),
      })) as any,
    );
  }

  async listActiveSessions(since: Date, limit = 200): Promise<UsageSessionRow[]> {
    return this.db
      .select()
      .from(usageSessions)
      .where(gte(usageSessions.lastSeen, since))
      .orderBy(desc(usageSessions.lastSeen))
      .limit(limit);
  }

  async featureUsageForRole(role: string, since: Date): Promise<FeatureUsageCount[]> {
    const rows = await this.db
      .select({
        featureKey: usageEvents.featureKey,
        count: sql<number>`count(*)::int`,
      })
      .from(usageEvents)
      .innerJoin(usageSessions, eq(usageEvents.sessionId, usageSessions.id))
      .where(
        and(
          eq(usageSessions.role, role),
          gte(usageEvents.occurredAt, since),
          sql`${usageEvents.featureKey} is not null`,
        ),
      )
      .groupBy(usageEvents.featureKey);
    return rows
      .filter((r: { featureKey: string | null }) => r.featureKey != null)
      .map((r: { featureKey: string; count: number }) => ({
        featureKey: r.featureKey,
        count: Number(r.count),
      }));
  }

  async eraseByVisitor(visitorId: string): Promise<number> {
    const rows = await this.db
      .delete(usageSessions)
      .where(eq(usageSessions.visitorId, visitorId))
      .returning({ id: usageSessions.id });
    return rows.length;
  }

  async eraseByUser(userId: string): Promise<number> {
    const rows = await this.db
      .delete(usageSessions)
      .where(eq(usageSessions.userId, userId))
      .returning({ id: usageSessions.id });
    return rows.length;
  }
}
