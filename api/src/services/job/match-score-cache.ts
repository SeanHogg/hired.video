/**
 * Match-score cache — `resume_match_scores` write (detached, best-effort)
 * and the prior-recommendations read the tailor flow feeds back in.
 * Split out of match-handlers.ts (now a re-export facade).
 */
import { and, eq, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import type { MatchDeps } from "./match-deps.js";

export async function saveMatchScore(
  deps: MatchDeps,
  args: {
    userId: string;
    jobId?: string;
    resumeId: string;
    score: number;
    recommendations: string;
  },
): Promise<void> {
  if (!args.jobId) return;
  try {
    await (deps.db.insert(schema.resumeMatchScores) as any)
      .values({
        userId: args.userId,
        jobId: args.jobId,
        resumeId: args.resumeId,
        score: args.score,
        recommendations: args.recommendations,
      })
      .onConflictDoUpdate({
        target: [
          schema.resumeMatchScores.userId,
          schema.resumeMatchScores.jobId,
          schema.resumeMatchScores.resumeId,
        ],
        set: {
          score: args.score,
          recommendations: args.recommendations,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    // Caching is a nice-to-have; the score is already returned to the
    // caller. Log and move on.
     
    logger.warn("[match] saveMatchScore failed", err);
  }
}

export async function loadPriorRecommendations(
  deps: MatchDeps,
  args: { userId: string; jobId?: string; resumeId: string },
): Promise<string | undefined> {
  if (!args.jobId) return undefined;
  const [row] = await deps.db
    .select({ recommendations: schema.resumeMatchScores.recommendations })
    .from(schema.resumeMatchScores)
    .where(
      and(
        eq(schema.resumeMatchScores.userId, args.userId),
        eq(schema.resumeMatchScores.jobId, args.jobId),
        eq(schema.resumeMatchScores.resumeId, args.resumeId),
      ),
    )
    .limit(1);
  return row?.recommendations || undefined;
}
