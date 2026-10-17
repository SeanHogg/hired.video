/**
 * SuperAdmin tool-usage insights — mounted at /api/admin/usage/tools under the
 * SA usage router (admin-usage.ts). Aggregates across users so ops can see
 * which tools get traction, median scores, and per-user usage for support.
 *
 *   GET /summary                         — one row per tool
 *   GET /daily?toolId=&days=30           — daily run counts (trend chart)
 *   GET /by-user?userId=                 — per-tool counts for one user
 *   GET /runs?userId=&toolId=&limit=200  — raw runs for one user (ToolHistoryPanel)
 *   GET /top-users?toolId=&limit=20      — highest-volume users
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { ToolUsageRepository } from "../../repositories/admin/toolUsageRepository.js";

export const toolUsageRoutes = new Hono<AppEnv>();

const DailyQuery = z.object({
  toolId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const ByUserQuery = z.object({ userId: UuidLikeSchema });
const RunsByUserQuery = z.object({
  userId: UuidLikeSchema,
  toolId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const TopUsersQuery = z.object({
  toolId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const invalid = (issues: Array<{ message: string }>) => error("VALIDATION_ERROR", issues[0].message);

toolUsageRoutes.get("/summary", async (c) => c.json(success(await ToolUsageRepository.create().summary()), 200));

toolUsageRoutes.get("/daily", async (c) => {
  const parsed = DailyQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { toolId, days } = parsed.data;
  return c.json(success(await ToolUsageRepository.create().daily(days, toolId)), 200);
});

toolUsageRoutes.get("/by-user", async (c) => {
  const parsed = ByUserQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  return c.json(success(await ToolUsageRepository.create().byUser(parsed.data.userId)), 200);
});

toolUsageRoutes.get("/runs", async (c) => {
  const parsed = RunsByUserQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { userId, toolId, limit } = parsed.data;
  return c.json(success(await ToolUsageRepository.create().runsForUser(userId, limit, toolId)), 200);
});

toolUsageRoutes.get("/top-users", async (c) => {
  const parsed = TopUsersQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { toolId, limit } = parsed.data;
  return c.json(success(await ToolUsageRepository.create().topUsers(limit, toolId)), 200);
});
