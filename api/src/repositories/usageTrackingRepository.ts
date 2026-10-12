/**
 * UsageTrackingRepository — data access for usage_sessions + usage_events
 * (migration 0215), the page/session/event analytics behind the presence +
 * engagement surface (#2043-2046).
 *
 * No business logic / caching — that lives in services/usage/UsageService.ts
 * (cached presence read, consent gate, DSR erase).
 */
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { FunnelStepMatch, TrafficPointDto, TrafficSourceDto } from "../../../shared/usage.js";

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
  /** Per-day visitors / signed-in visitors / page views since `since`. */
  trafficSeries(since: Date): Promise<TrafficPointDto[]>;
  /** Top entry paths, referrers and UTM sources of sessions first seen since `since`. */
  trafficSources(since: Date, limit?: number): Promise<{
    entryPaths: TrafficSourceDto[];
    referrers: TrafficSourceDto[];
    utmSources: TrafficSourceDto[];
  }>;
  /** Visitors reaching each step IN ORDER (step N counts only after N-1). */
  funnelCounts(steps: readonly FunnelStepMatch[], since: Date): Promise<number[]>;
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

  async trafficSeries(since: Date): Promise<TrafficPointDto[]> {
    const day = sql`date_trunc('day', ${usageEvents.occurredAt})`;
    const rows = await this.db
      .select({
        day: sql<string>`to_char(${day}, 'YYYY-MM-DD')`,
        visitors: sql<number>`count(distinct ${usageEvents.sessionId})::int`,
        signedIn: sql<number>`count(distinct ${usageEvents.sessionId}) filter (where ${usageSessions.userId} is not null)::int`,
        pageViews: sql<number>`count(*) filter (where ${usageEvents.type} = 'page_view')::int`,
      })
      .from(usageEvents)
      .innerJoin(usageSessions, eq(usageEvents.sessionId, usageSessions.id))
      .where(gte(usageEvents.occurredAt, since))
      .groupBy(day)
      .orderBy(day);
    return rows.map((r: TrafficPointDto) => ({
      day: r.day,
      visitors: Number(r.visitors),
      signedIn: Number(r.signedIn),
      pageViews: Number(r.pageViews),
    }));
  }

  async trafficSources(since: Date, limit = 10) {
    // Referrer is reduced to its host so one site's many URLs read as one source.
    const referrerHost = sql<string>`coalesce(substring(${usageSessions.referrer} from '^[a-z]+://([^/]+)'), '(direct)')`;
    const top = (key: SQL<string>) =>
      this.db
        .select({ key, visitors: sql<number>`count(*)::int` })
        .from(usageSessions)
        .where(gte(usageSessions.firstSeen, since))
        .groupBy(key)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);
    const [entryPaths, referrers, utmSources] = await Promise.all([
      top(sql<string>`coalesce(${usageSessions.entryPath}, '(unknown)')`),
      top(referrerHost),
      top(sql<string>`coalesce(${usageSessions.utmSource}, '(none)')`),
    ]);
    const norm = (rows: TrafficSourceDto[]) => rows.map((r) => ({ key: r.key, visitors: Number(r.visitors) }));
    return { entryPaths: norm(entryPaths), referrers: norm(referrers), utmSources: norm(utmSources) };
  }

  async funnelCounts(steps: readonly FunnelStepMatch[], since: Date): Promise<number[]> {
    if (steps.length === 0) return [];
    // One CTE per step: the visitor's first matching event, at or after their
    // first event of the previous step. Step names are internal (s0, s1, …).
    const ctes = steps.map((step, i) => {
      const name = sql.raw(`s${i}`);
      const match = funnelStepCondition(step);
      if (i === 0) {
        return sql`${name} as (select e.session_id, min(e.occurred_at) t from usage_events e
          where e.occurred_at >= ${since} and ${match} group by e.session_id)`;
      }
      const prev = sql.raw(`s${i - 1}`);
      return sql`${name} as (select e.session_id, min(e.occurred_at) t from usage_events e
        join ${prev} p on p.session_id = e.session_id and e.occurred_at >= p.t
        where ${match} group by e.session_id)`;
    });
    const counts = steps.map((_, i) => sql`(select count(*)::int from ${sql.raw(`s${i}`)}) as ${sql.raw(`c${i}`)}`);
    const result = await this.db.execute(sql`with ${sql.join(ctes, sql`, `)} select ${sql.join(counts, sql`, `)}`);
    const rows: Array<Record<string, unknown>> = Array.isArray(result) ? result : (result?.rows ?? []);
    const row = rows[0] ?? {};
    return steps.map((_, i) => Number(row[`c${i}`] ?? 0));
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

/** SQL predicate for one funnel step over `usage_events e`. */
function funnelStepCondition(step: FunnelStepMatch) {
  const parts = [sql`true`];
  if (step.type) parts.push(sql`e.type = ${step.type}`);
  if (step.featureKey) parts.push(sql`e.feature_key = ${step.featureKey}`);
  if (step.stage) parts.push(sql`e.payload->>'stage' = ${step.stage}`);
  if (step.paths?.length) {
    parts.push(sql`(${sql.join(step.paths.map((p) => sql`e.path = ${p} or e.path like ${`${p}/%`}`), sql` or `)})`);
  }
  return sql.join(parts, sql` and `);
}
