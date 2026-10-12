/**
 * Learner-facing learning surface (#2068 GAP-4 + GAP-5).
 *
 *   GET /api/learning/leaderboard?scope=global|cohort&cohortId=&limit=
 *       — XP leaderboard by lifetime points (suspended accounts excluded),
 *         global or scoped to a cohort the viewer belongs to. Cached.
 *   GET /api/learning/dashboard
 *       — consolidated learner dashboard: enrollments + progress + completed
 *         + certificates + points/streak/badges + assigned work, one round-trip.
 *
 * Auth: standard JWT (mounted under the global auth middleware).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getOrSetCached } from "../utils/edge-cache.js";
import { gamificationFromContext } from "../domains/gamification/with-gamification.js";
import { CohortService } from "../services/learning/cohort-service.js";
import { AssignmentService } from "../services/learning/assignment-service.js";
import { getLearnerDashboard, learnerDashboardCacheKey } from "../services/learning/learner-dashboard.js";

export const learningRoutes = new Hono<AppEnv>();

const LeaderboardQuery = z.object({
  scope: z.enum(["global", "cohort"]).default("global"),
  cohortId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
}

learningRoutes.get("/leaderboard", async (c) => {
  const userId = c.var.user.sub;
  const parsed = LeaderboardQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query"), 400);
  }
  const { scope, cohortId, limit } = parsed.data;
  const db = getDb();
  const repos = buildRepos(db);

  // Resolve the candidate set for cohort scope (and authorise membership).
  let scopedUserIds: string[] | undefined;
  if (scope === "cohort") {
    if (!cohortId) return c.json(error("VALIDATION_ERROR", "cohortId is required for cohort scope"), 400);
    const memberIds = await new CohortService(db).activeMemberUserIds(cohortId);
    if (!memberIds.includes(userId)) {
      return c.json(error("FORBIDDEN", "You are not a member of this cohort"), 403);
    }
    scopedUserIds = memberIds;
  }

  const cacheKey =
    scope === "cohort" ? `lb:xp:cohort:${cohortId}:${limit}` : `lb:xp:global:${limit}`;

  const entries = await getOrSetCached<LeaderboardEntry[]>({
    key: cacheKey,
    ttlSeconds: scope === "cohort" ? 120 : 300,
    loader: async () => {
      const top = await repos.points.topByLifetimeEarned(limit, scopedUserIds);
      if (top.length === 0) return [];
      const actors = await repos.users.findActorsByIds(top.map((t) => t.userId));
      const byId = new Map(actors.map((a) => [a.id, a]));
      return top.map((t, i) => {
        const a = byId.get(t.userId);
        return {
          rank: i + 1,
          userId: t.userId,
          name: a?.name?.trim() || "Learner",
          avatarUrl: a?.avatarUrl ?? null,
          points: t.lifetimeEarned,
        };
      });
    },
  });

  // Viewer's own rank — cheap single indexed count, computed live (per-user
  // so not cached with the shared board). Null when the viewer has no points.
  const myBalance = await repos.points.findBalance(userId);
  let viewer: { rank: number; points: number } | null = null;
  if (myBalance && !myBalance.isSuspended) {
    const ahead = await repos.points.countAheadByLifetimeEarned(
      myBalance.lifetimeEarned,
      scopedUserIds,
    );
    viewer = { rank: ahead + 1, points: myBalance.lifetimeEarned };
  }

  return c.json(success({ scope, entries, viewer }), 200);
});

learningRoutes.get("/dashboard", async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();

  // Read-model is cached per-user for a short window (mirrors cohort-analytics'
  // 45s TTL) — it aggregates many write sources, so a brief TTL is the
  // pragmatic balance vs. fanning invalidation across all of them.
  const base = await getOrSetCached({
    key: learnerDashboardCacheKey(userId),
    ttlSeconds: 60,
    loader: () => getLearnerDashboard(db, userId),
  });

  // Live, already-cheap reads merged on top (own caches / small result sets).
  const [summary, assigned] = await Promise.all([
    gamificationFromContext(c).getUserSummary(userId).catch(() => null),
    new AssignmentService(db).listForLearner(userId).catch(() => []),
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
