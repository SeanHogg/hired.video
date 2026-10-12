// SuperAdmin tool-usage insights. Aggregates across users/entities so
// ops can see which tools are getting traction, median scores, and per-
// user usage for support investigations. Owner-scoping does NOT apply
// here — SAs see everything.

import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";

export const toolUsageRoutes = new Hono<AppEnv>();

// ─── GET /summary ────────────────────────────────────────────────────────────
// One row per tool: total runs, unique user count, avg/median score,
// last-run timestamp. Powers the overview table on the SA insights page.
toolUsageRoutes.get("/summary", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      toolId: schema.toolRuns.toolId,
      runs: sql<number>`count(*)::int`,
      uniqueUsers: sql<number>`count(distinct ${schema.toolRuns.userId})::int`,
      avgScore: sql<number | null>`avg(${schema.toolRuns.score})`,
      medianScore: sql<number | null>`percentile_cont(0.5) within group (order by ${schema.toolRuns.score})`,
      lastRunAt: sql<string | null>`max(${schema.toolRuns.createdAt})`,
    })
    .from(schema.toolRuns)
    .groupBy(schema.toolRuns.toolId)
    .orderBy(desc(sql`count(*)`));

  return c.json(success(rows), 200);
});

// ─── GET /daily?toolId=…&days=30 ─────────────────────────────────────────────
// Daily run counts per tool for trend charting. Global or filtered by toolId.
const DailyQuery = z.object({
  toolId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
toolUsageRoutes.get("/daily", async (c) => {
  const parsed = DailyQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { toolId, days } = parsed.data;

  const db = getDb();
  const conditions = [
    sql`${schema.toolRuns.createdAt} >= now() - (${days}::int || ' days')::interval`,
  ];
  if (toolId) conditions.push(eq(schema.toolRuns.toolId, toolId));

  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${schema.toolRuns.createdAt})::date::text`,
      toolId: schema.toolRuns.toolId,
      runs: sql<number>`count(*)::int`,
    })
    .from(schema.toolRuns)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('day', ${schema.toolRuns.createdAt})`, schema.toolRuns.toolId)
    .orderBy(sql`date_trunc('day', ${schema.toolRuns.createdAt})`);

  return c.json(success(rows), 200);
});

// ─── GET /by-user?userId=… ──────────────────────────────────────────────────
// Per-tool run counts + latest run for a single user. Used by the user
// detail page in SA so support can see what a user has actually been using.
const ByUserQuery = z.object({ userId: UuidLikeSchema });
toolUsageRoutes.get("/by-user", async (c) => {
  const parsed = ByUserQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const db = getDb();
  const rows = await db
    .select({
      toolId: schema.toolRuns.toolId,
      runs: sql<number>`count(*)::int`,
      avgScore: sql<number | null>`avg(${schema.toolRuns.score})`,
      lastRunAt: sql<string | null>`max(${schema.toolRuns.createdAt})`,
    })
    .from(schema.toolRuns)
    .where(eq(schema.toolRuns.userId, parsed.data.userId))
    .groupBy(schema.toolRuns.toolId)
    .orderBy(desc(sql`count(*)`));

  return c.json(success(rows), 200);
});

// ─── GET /runs?userId=…&toolId=…&limit=200 ──────────────────────────────────
// Raw tool_runs rows for a specific user — powers the "Tools used"
// slide-out on /admin/users. Returns the same row shape as the owner-
// scoped /api/tool-runs endpoints so the existing ToolHistoryPanel can
// render admin views without a second code path.
const RunsByUserQuery = z.object({
  userId: UuidLikeSchema,
  toolId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
toolUsageRoutes.get("/runs", async (c) => {
  const parsed = RunsByUserQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { userId, toolId, limit } = parsed.data;

  const db = getDb();
  const conditions = [eq(schema.toolRuns.userId, userId)];
  if (toolId) conditions.push(eq(schema.toolRuns.toolId, toolId));

  const rows = await db
    .select()
    .from(schema.toolRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.toolRuns.createdAt))
    .limit(limit);

  return c.json(success(rows), 200);
});

// ─── GET /top-users?toolId=…&limit=20 ────────────────────────────────────────
// Highest-volume users for a given tool (or globally). Links to the user
// management page for deeper investigation.
const TopUsersQuery = z.object({
  toolId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
toolUsageRoutes.get("/top-users", async (c) => {
  const parsed = TopUsersQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const { toolId, limit } = parsed.data;

  const db = getDb();
  const conditions = toolId ? [eq(schema.toolRuns.toolId, toolId)] : [];

  const rows = await db
    .select({
      userId: schema.toolRuns.userId,
      runs: sql<number>`count(*)::int`,
      lastRunAt: sql<string | null>`max(${schema.toolRuns.createdAt})`,
    })
    .from(schema.toolRuns)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(schema.toolRuns.userId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return c.json(success(rows), 200);
});
