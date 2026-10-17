/**
 * ToolUsageRepository — cross-user `tool_runs` aggregates for the SuperAdmin
 * tool-usage insights (/api/admin/usage/tools/*). Owner scoping does NOT
 * apply: SuperAdmins see everything.
 */
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { toolRuns } = schema;

type DbHandle = ReturnType<typeof getDb>;

const runCount = sql<number>`count(*)::int`;
const lastRunAt = sql<string | null>`max(${toolRuns.createdAt})`;
const day = sql<string>`date_trunc('day', ${toolRuns.createdAt})`;

export class ToolUsageRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): ToolUsageRepository {
    return new ToolUsageRepository(getDb());
  }

  /** One row per tool: runs, unique users, avg/median score, last run. */
  summary() {
    return this.db
      .select({
        toolId: toolRuns.toolId,
        runs: runCount,
        uniqueUsers: sql<number>`count(distinct ${toolRuns.userId})::int`,
        avgScore: sql<number | null>`avg(${toolRuns.score})`,
        medianScore: sql<number | null>`percentile_cont(0.5) within group (order by ${toolRuns.score})`,
        lastRunAt,
      })
      .from(toolRuns)
      .groupBy(toolRuns.toolId)
      .orderBy(desc(sql`count(*)`));
  }

  /** Daily run counts per tool over the last `days`, optionally one tool. */
  daily(days: number, toolId?: string) {
    const conditions: SQL[] = [sql`${toolRuns.createdAt} >= now() - (${days}::int || ' days')::interval`];
    if (toolId) conditions.push(eq(toolRuns.toolId, toolId));
    return this.db
      .select({ day: sql<string>`${day}::date::text`, toolId: toolRuns.toolId, runs: runCount })
      .from(toolRuns)
      .where(and(...conditions))
      .groupBy(day, toolRuns.toolId)
      .orderBy(day);
  }

  /** Per-tool counts + latest run for one user (SA user detail). */
  byUser(userId: string) {
    return this.db
      .select({ toolId: toolRuns.toolId, runs: runCount, avgScore: sql<number | null>`avg(${toolRuns.score})`, lastRunAt })
      .from(toolRuns)
      .where(eq(toolRuns.userId, userId))
      .groupBy(toolRuns.toolId)
      .orderBy(desc(sql`count(*)`));
  }

  /** Raw runs for one user — same row shape as the owner-scoped /api/tool-runs. */
  runsForUser(userId: string, limit: number, toolId?: string) {
    const conditions: SQL[] = [eq(toolRuns.userId, userId)];
    if (toolId) conditions.push(eq(toolRuns.toolId, toolId));
    return this.db.select().from(toolRuns).where(and(...conditions)).orderBy(desc(toolRuns.createdAt)).limit(limit);
  }

  /** Highest-volume users, globally or for one tool. */
  topUsers(limit: number, toolId?: string) {
    return this.db
      .select({ userId: toolRuns.userId, runs: runCount, lastRunAt })
      .from(toolRuns)
      .where(toolId ? eq(toolRuns.toolId, toolId) : undefined)
      .groupBy(toolRuns.userId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }
}
