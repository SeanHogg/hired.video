/**
 * ObservabilityRepository — read side of the platform's own logs:
 * request_logs (per-request, 30d) and activity_logs (events + config
 * snapshots, 90d). Answers "is this route live on the latest release, is it
 * working, and is production configured?" from evidence rather than from a
 * roadmap note. Writers live elsewhere (middleware/requestLogger.ts,
 * services/observability/config-snapshot.ts); this module only reads.
 */
import { and, avg, count, desc, eq, gte, max, min, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { CONFIG_SNAPSHOT_ACTION } from "../services/observability/config-snapshot.js";
import type { ApiHealthReport } from "../../../shared/observability.js";

const { requestLogs, activityLogs } = schema;

export type DbLike = any;

export interface IObservabilityRepository {
  apiHealthReport(now: Date, opts?: { route?: string }): Promise<ApiHealthReport>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export class ObservabilityRepository implements IObservabilityRepository {
  constructor(private readonly db: DbLike) {}

  async apiHealthReport(now: Date, opts: { route?: string } = {}): Promise<ApiHealthReport> {
    const day1 = new Date(now.getTime() - DAY_MS);
    const day7 = new Date(now.getTime() - 7 * DAY_MS);
    const day30 = new Date(now.getTime() - 30 * DAY_MS);
    // Rows written before migration 0506 have no route — fall back to path.
    const routeKey = sql<string>`coalesce(${requestLogs.route}, ${requestLogs.path})`;
    const inWindow = opts.route
      ? and(gte(requestLogs.createdAt, day30), eq(routeKey, opts.route))
      : gte(requestLogs.createdAt, day30);
    const distinctUsersSince = (since: Date) =>
      this.db
        .select({ n: count(sql`DISTINCT ${requestLogs.userId}`) })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, since));

    const [dau, wau, mau, routes, errors, releases, totals, topEvents, [snapshot]] = await Promise.all([
      distinctUsersSince(day1),
      distinctUsersSince(day7),
      distinctUsersSince(day30),
      this.db
        .select({
          route: routeKey,
          calls: count(),
          serverErrors: count(sql`CASE WHEN ${requestLogs.statusCode} >= 500 THEN 1 END`),
          clientErrors: count(sql`CASE WHEN ${requestLogs.statusCode} BETWEEN 400 AND 499 THEN 1 END`),
          avgMs: avg(requestLogs.durationMs),
          lastSeen: max(requestLogs.createdAt),
        })
        .from(requestLogs)
        .where(inWindow)
        .groupBy(routeKey)
        .orderBy(desc(count()))
        .limit(100),
      this.db
        .select({
          route: routeKey,
          status: requestLogs.statusCode,
          errorCode: requestLogs.errorCode,
          errorSource: max(requestLogs.errorSource),
          count: count(),
          lastSeen: max(requestLogs.createdAt),
        })
        .from(requestLogs)
        .where(and(inWindow, gte(requestLogs.statusCode, 400)))
        .groupBy(routeKey, requestLogs.statusCode, requestLogs.errorCode)
        .orderBy(desc(count()))
        .limit(50),
      this.db
        .select({
          releaseId: requestLogs.releaseId,
          requests: count(),
          firstSeen: min(requestLogs.createdAt),
          lastSeen: max(requestLogs.createdAt),
        })
        .from(requestLogs)
        .where(gte(requestLogs.createdAt, day30))
        .groupBy(requestLogs.releaseId)
        .orderBy(desc(max(requestLogs.createdAt)))
        .limit(10),
      this.db
        .select({
          requests: count(),
          serverErrors: count(sql`CASE WHEN ${requestLogs.statusCode} >= 500 THEN 1 END`),
        })
        .from(requestLogs)
        .where(inWindow),
      this.db
        .select({ action: activityLogs.action, n: count() })
        .from(activityLogs)
        .where(gte(activityLogs.createdAt, day30))
        .groupBy(activityLogs.action)
        .orderBy(desc(count()))
        .limit(20),
      this.db
        .select({ createdAt: activityLogs.createdAt, metadata: activityLogs.metadata })
        .from(activityLogs)
        .where(eq(activityLogs.action, CONFIG_SNAPSHOT_ACTION))
        .orderBy(desc(activityLogs.createdAt))
        .limit(1),
    ]);

    const requests = Number(totals[0]?.requests ?? 0);
    const serverErrors = Number(totals[0]?.serverErrors ?? 0);
    return {
      activeUsers: { dau: Number(dau[0]?.n ?? 0), wau: Number(wau[0]?.n ?? 0), mau: Number(mau[0]?.n ?? 0) },
      routes: routes.map((r: any) => ({
        route: r.route,
        calls: Number(r.calls),
        serverErrors: Number(r.serverErrors),
        clientErrors: Number(r.clientErrors),
        avgMs: r.avgMs == null ? null : Math.round(Number(r.avgMs)),
        lastSeen: iso(r.lastSeen),
      })),
      errors: errors.map((r: any) => ({
        route: r.route,
        status: r.status,
        errorCode: r.errorCode,
        errorSource: r.errorSource,
        count: Number(r.count),
        lastSeen: iso(r.lastSeen),
      })),
      releases: releases.map((r: any) => ({
        releaseId: r.releaseId,
        requests: Number(r.requests),
        firstSeen: iso(r.firstSeen),
        lastSeen: iso(r.lastSeen),
      })),
      totals: {
        requests,
        serverErrors,
        serverErrorRate: requests > 0 ? Math.round((serverErrors / requests) * 1000) / 10 : 0,
      },
      topEvents: topEvents.map((r: any) => ({ event: r.action, count: Number(r.n) })),
      configSnapshot: snapshot ? { recordedAt: iso(snapshot.createdAt)!, metadata: snapshot.metadata } : null,
    };
  }
}
