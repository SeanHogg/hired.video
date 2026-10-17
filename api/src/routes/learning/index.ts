/**
 * /api/learning — the learning surface, composed from domain sub-routers:
 *
 *   GET /leaderboard?scope=global|cohort&cohortId=&limit=   XP leaderboard (#2068 GAP-5)
 *   GET /dashboard                                         learner dashboard (#2068 GAP-4)
 *   /goals/*       learner goals + recommendations          (goals.ts)
 *   /paths/*       learning paths: public, learner, owner   (paths-learner.ts, paths-authoring.ts)
 *   /cohorts/*     classrooms, assignments, analytics       (cohorts.ts)
 *   /xapi/*        LRS, statement ingest, credentials,
 *                  forwarding targets, portability          (xapi/)
 *
 * Auth: standard JWT, except /xapi/lrs/* which is in PUBLIC_PREFIXES and
 * authenticates with its own LRS Basic-auth credential.
 *
 * Sub-routers carry their own path segments and mount at "/" (or at a
 * non-root prefix with no root handlers) — Hono root-path gotcha.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { gamificationFromContext } from "../../domains/gamification/with-gamification.js";
import { getLearnerDashboardParts, getXpLeaderboard } from "../../services/learning/learning-surface.js";
import { goalRoutes } from "./goals.js";
import { pathLearnerRoutes } from "./paths-learner.js";
import { pathAuthoringRoutes } from "./paths-authoring.js";
import { cohortRoutes } from "./cohorts.js";
import { xapiRoutes } from "./xapi/index.js";

export const learningRoutes = new Hono<AppEnv>();

const LeaderboardQuery = z.object({
  scope: z.enum(["global", "cohort"]).default("global"),
  cohortId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

learningRoutes.get("/leaderboard", async (c) => {
  const userId = c.var.user.sub;
  const parsed = LeaderboardQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query"), 400);
  }
  const { scope, cohortId, limit } = parsed.data;
  if (scope === "cohort" && !cohortId) {
    return c.json(error("VALIDATION_ERROR", "cohortId is required for cohort scope"), 400);
  }
  const result = await getXpLeaderboard(userId, { scope, cohortId: cohortId ?? "", limit });
  if (result.kind === "forbidden") return c.json(error("FORBIDDEN", "You are not a member of this cohort"), 403);
  if (result.kind !== "ok") return c.json(error("INTERNAL_ERROR", "Something went wrong."), 500);
  return c.json(success({ scope, entries: result.entries, viewer: result.viewer }), 200);
});

learningRoutes.get("/dashboard", async (c) => {
  const userId = c.var.user.sub;
  const [{ base, assigned }, summary] = await Promise.all([
    getLearnerDashboardParts(userId),
    gamificationFromContext(c).getUserSummary(userId).catch(() => null),
  ]);
  const badgesEarned = summary?.badges?.filter((b) => b.earned).length ?? 0;
  return c.json(
    success({
      ...base,
      stats: {
        ...base.stats,
        points: summary?.balance ?? 0,
        streak: summary?.streak?.current ?? 0,
        badges: badgesEarned,
      },
      assigned: assigned.filter((a) => !a.passed).slice(0, 8),
    }),
    200,
  );
});

learningRoutes.route("/", goalRoutes);
// Learner/public path routes first: static `/paths/public` + `/paths/me/enrollments`
// must win over the owner router's `/paths/:id`.
learningRoutes.route("/", pathLearnerRoutes);
learningRoutes.route("/", pathAuthoringRoutes);
learningRoutes.route("/", cohortRoutes);
learningRoutes.route("/xapi", xapiRoutes);
