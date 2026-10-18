/**
 * Composition root for the /api/learning route modules — builds the learning
 * services over the request's DB handle so route files never touch getDb()
 * or drizzle directly, plus the small learner-facing read models
 * (XP leaderboard, learner dashboard base) that span several repositories.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { logger } from "../../lib/logger.js";
import { CohortService } from "./cohort-service.js";
import { AssignmentService } from "./assignment-service.js";
import { CohortAnalyticsService } from "./cohort-analytics.js";
import { resolveAuthorEligibility, type AuthorEligibility } from "./author-eligibility.js";
import { getLearnerDashboard, learnerDashboardCacheKey } from "./learner-dashboard.js";

export const cohortService = (): CohortService => new CohortService(getDb());
export const assignmentService = (): AssignmentService => new AssignmentService(getDb());
export const cohortAnalyticsService = (): CohortAnalyticsService => new CohortAnalyticsService(getDb());

export function authorEligibility(userId: string, roles: readonly string[]): Promise<AuthorEligibility> {
  return resolveAuthorEligibility(getDb(), userId, roles);
}

/** An educator-added member who has a real account earns the same
 *  student-joined award as a self-serve join. Role is resolved from the DB
 *  since the earner isn't the JWT actor. RefId mirrors the helper's
 *  `cohort:<cohortId>:<memberId>` so both join paths dedup together. */
export async function awardEducatorAddedMember(row: { id: string; cohortId: string; userId: string }): Promise<void> {
  try {
    const { GamificationService, ACTIONS } = await import("../../domains/gamification/index.js");
    const game = new GamificationService(buildRepos(getDb()));
    await game.awardWithRoleLookup(ACTIONS.COHORT_STUDENT_JOINED, {
      userId: row.userId,
      refId: `cohort:${row.cohortId}:${row.id}`,
      refType: "cohort_member",
    });
  } catch (e) {
    logger.warn("[gamification] cohort-student-joined (addMember) award failed", { error: String(e) });
  }
}

// ── XP leaderboard (#2068 GAP-5) ────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
}

export type LeaderboardResult =
  | { kind: "forbidden" }
  | {
      kind: "ok";
      entries: LeaderboardEntry[];
      viewer: { rank: number; points: number } | null;
    };

/** XP leaderboard by lifetime points (suspended accounts excluded), global or
 *  scoped to a cohort the viewer belongs to. The shared board is cached; the
 *  viewer's own rank is a cheap live indexed count. */
export async function getXpLeaderboard(
  userId: string,
  opts: { scope: "global" | "cohort"; cohortId: string; limit: number },
): Promise<LeaderboardResult> {
  const db = getDb();
  const repos = buildRepos(db);
  const { scope, cohortId, limit } = opts;

  let scopedUserIds: string[] | undefined;
  if (scope === "cohort") {
    const memberIds = await new CohortService(db).activeMemberUserIds(cohortId);
    if (!memberIds.includes(userId)) return { kind: "forbidden" };
    scopedUserIds = memberIds;
  }

  const cacheKey = scope === "cohort" ? `lb:xp:cohort:${cohortId}:${limit}` : `lb:xp:global:${limit}`;
  const loadBoard = async (): Promise<LeaderboardEntry[]> => {
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
  };
  // Per-cohort boards are an unbounded keyspace → isolate-only (no KV write
  // per fill); the global board (one key per limit) stays on the edge cache.
  const entries = scope === "cohort"
    ? await getOrSetIsolateCached<LeaderboardEntry[]>({ key: cacheKey, ttlSeconds: 120, loader: loadBoard })
    : await getOrSetCached<LeaderboardEntry[]>({ key: cacheKey, ttlSeconds: 300, loader: loadBoard });

  const myBalance = await repos.points.findBalance(userId);
  let viewer: { rank: number; points: number } | null = null;
  if (myBalance && !myBalance.isSuspended) {
    const ahead = await repos.points.countAheadByLifetimeEarned(myBalance.lifetimeEarned, scopedUserIds);
    viewer = { rank: ahead + 1, points: myBalance.lifetimeEarned };
  }
  return { kind: "ok", entries, viewer };
}

// ── Learner dashboard (#2068 GAP-4) ─────────────────────────────────────────

/** Cached per-user dashboard read model (60s — it aggregates many write
 *  sources, so a brief TTL beats fanning invalidation across all of them)
 *  plus the learner's live assigned work. */
export async function getLearnerDashboardParts(userId: string) {
  const db = getDb();
  const [base, assigned] = await Promise.all([
    getOrSetIsolateCached({
      key: learnerDashboardCacheKey(userId),
      ttlSeconds: 60,
      loader: () => getLearnerDashboard(db, userId),
    }),
    new AssignmentService(db).listForLearner(userId).catch(() => []),
  ]);
  return { base, assigned };
}
